"""Small, content-addressed task snapshot references.

The task spec keeps provenance and a digest; the exact projected document lives
once in Runtime CAS.  This module deliberately does not infer a newer head.
"""

from __future__ import annotations

import copy
import hashlib
import json
from .dirfd import filesystem as os
import re
from collections.abc import Callable
from pathlib import Path

from .cas import ContentAddressedStore
from .dirfd import open_directory_chain, mkdir_chain_at
from .errors import ConflictError, NotFoundError, ValidationError
from .util import atomic_json_write, canonical_json, new_id, now


SNAPSHOT_KEYS = ("filmstrip_snapshot", "input_snapshot", "capture_snapshot")
_SHA256 = re.compile(r"sha256:[0-9a-f]{64}\Z")


def snapshot_bytes(snapshot: dict) -> bytes:
    return canonical_json(snapshot).encode("utf-8")


def snapshot_digest(snapshot: dict) -> str:
    return "sha256:" + hashlib.sha256(snapshot_bytes(snapshot)).hexdigest()


def working_copy_binding(snapshot: dict, revision_id: str | None) -> dict | None:
    metadata = snapshot.get("metadata") if isinstance(snapshot.get("metadata"), dict) else {}
    value = metadata.get("working_copy")
    if not isinstance(value, dict) or value.get("candidate_parent_revision_id") != revision_id:
        return None
    candidate = value.get("candidate_digest")
    publication = value.get("publication_digest")
    base = value.get("base_parent")
    if (not isinstance(candidate, str) or not _SHA256.fullmatch(candidate)
            or not isinstance(publication, str) or not _SHA256.fullmatch(publication)
            or not isinstance(base, dict) or not isinstance(base.get("revision_id"), str)
            or not isinstance(base.get("content_digest"), str)
            or not _SHA256.fullmatch(base["content_digest"])):
        return None
    return {"candidate_digest": candidate, "publication_digest": publication,
            "base_revision_id": base["revision_id"],
            "base_revision_digest": base["content_digest"]}


def journal_snapshot_publication(staging_root: Path, digest: str, project_id: str | None) -> None:
    """Use the existing CAS recovery journal before publishing a new object."""
    root_fd = open_directory_chain(staging_root)
    publication_fd = -1
    try:
        publication_fd = mkdir_chain_at(root_fd, "publications")
        os.fsync(root_fd)
    finally:
        if publication_fd >= 0:
            os.close(publication_fd)
        os.close(root_fd)
    atomic_json_write(Path(staging_root) / "publications" / (new_id() + ".json"), {
        "version": 1, "kind": "ingest", "project_id": project_id,
        "task_id": None, "entries": [{"digest": digest}],
    })


def publish_snapshot(connection, cas_root: Path, staging_root: Path,
                     snapshot: dict, provenance: dict, project_id: str | None) -> dict:
    """Validate provenance and publish exact projected bytes through one CAS path."""
    if provenance.get("project_id") not in (None, project_id):
        raise ConflictError("snapshot project does not match task project")
    revision_id = provenance.get("revision_id")
    revision_digest = provenance.get("revision_digest")
    timeline_id = provenance.get("timeline_id")
    source_kind = provenance.get("source_kind") or ("revision" if revision_id else "cas")
    if source_kind == "working_copy":
        binding = working_copy_binding(snapshot, revision_id)
        if binding is None or binding != provenance.get("working_copy") or revision_digest != binding["candidate_digest"]:
            raise ValidationError("working-copy snapshot binding is invalid")
        base = connection.execute(
            "SELECT content_digest FROM parent_composition_revisions "
            "WHERE id=? AND project_id=? AND timeline_id=?",
            (binding["base_revision_id"], project_id, timeline_id),
        ).fetchone()
        if base is None or base[0] != binding["base_revision_digest"]:
            raise NotFoundError("working-copy base parent revision is missing or changed")
    elif revision_id is not None:
        revision = connection.execute(
            "SELECT content_digest FROM parent_composition_revisions "
            "WHERE id=? AND project_id=? AND timeline_id=?",
            (revision_id, project_id, timeline_id),
        ).fetchone()
        if revision is None:
            raise NotFoundError("snapshot parent revision is missing")
        if revision_digest is not None and revision_digest != revision[0]:
            raise ConflictError("snapshot parent revision digest changed")
        revision_digest = revision[0]
    elif source_kind != "cas":
        raise ValidationError("snapshot source kind is invalid")
    payload = snapshot_bytes(snapshot)
    digest = hashlib.sha256(payload).hexdigest()
    cas = ContentAddressedStore(cas_root)
    existing = connection.execute("SELECT size FROM objects WHERE digest=?", (digest,)).fetchone()
    if existing is None:
        journal_snapshot_publication(staging_root, digest, project_id)
        cas.put(payload)
    elif int(existing[0]) != len(payload) or hashlib.sha256(cas.read(digest)).hexdigest() != digest:
        raise ConflictError("existing timeline snapshot CAS object is corrupt")
    stamp = now()
    connection.execute(
        "INSERT OR IGNORE INTO objects(digest,size,media_type,original_name,created_at) VALUES (?,?,?,?,?)",
        (digest, len(payload), "application/json", "timeline-snapshot.json", stamp),
    )
    if project_id is not None:
        connection.execute(
            "INSERT OR IGNORE INTO project_objects(project_id,digest,relation,created_at) "
            "VALUES (?,?,'managed',?)", (project_id, digest, stamp),
        )
    return {"digest": "sha256:" + digest, "project_id": project_id,
            "timeline_id": timeline_id, "revision_id": revision_id,
            "revision_digest": revision_digest, "source_kind": source_kind,
            **({"working_copy": provenance["working_copy"]} if source_kind == "working_copy" else {})}


def rewrite_spec_snapshots(spec: dict, publish: Callable[[dict, dict], dict]) -> tuple[dict, int]:
    """Replace only recognized inline snapshot fields, preserving other inputs."""
    result = copy.deepcopy(spec)
    inner = result.get("spec") if isinstance(result.get("spec"), dict) else result
    inputs = inner.get("inputs") if isinstance(inner.get("inputs"), dict) else {}
    authority = inputs.get("timeline_authority") if isinstance(inputs.get("timeline_authority"), dict) else {}
    count = 0

    for location in (inner, inputs):
        snapshot = location.get("timeline_snapshot")
        if not isinstance(snapshot, dict) or not isinstance(snapshot.get("config"), dict):
            continue
        provenance = {
            "project_id": authority.get("project_id") or snapshot.get("project_id"),
            "timeline_id": authority.get("timeline_id") or snapshot.get("timeline_id"),
            "revision_id": authority.get("parent_revision_id"),
            "revision_digest": authority.get("parent_content_digest"),
        }
        location["timeline_snapshot_ref"] = publish(snapshot, provenance)
        del location["timeline_snapshot"]
        count += 1

    context = inner.get("authority_context")
    if not isinstance(context, dict):
        context = result.get("authority_context")
    if isinstance(context, dict):
        for key in SNAPSHOT_KEYS:
            snapshot = context.get(key)
            if not isinstance(snapshot, dict):
                continue
            metadata = snapshot.get("metadata") if isinstance(snapshot.get("metadata"), dict) else {}
            canonical = metadata.get("canonical_timeline") if isinstance(metadata.get("canonical_timeline"), dict) else {}
            capture = metadata.get("capture_authority") if isinstance(metadata.get("capture_authority"), dict) else {}
            provenance = {
                "project_id": context.get("project_id") or canonical.get("project_id") or capture.get("project_id"),
                "timeline_id": context.get("timeline_id") or canonical.get("timeline_id") or capture.get("timeline_id"),
                "revision_id": context.get("revision_id") or canonical.get("parent_revision_id") or capture.get("parent_revision_id"),
                "revision_digest": canonical.get("parent_content_digest") or capture.get("parent_content_digest"),
            }
            working_copy = working_copy_binding(snapshot, provenance["revision_id"])
            if working_copy is not None:
                provenance["source_kind"] = "working_copy"
                provenance["revision_digest"] = working_copy["candidate_digest"]
                provenance["working_copy"] = working_copy
            context[key + "_ref"] = publish(snapshot, provenance)
            del context[key]
            count += 1
    filmstrip = inputs.get("filmstrip_authority")
    if isinstance(filmstrip, str):
        try:
            duplicate = json.loads(filmstrip)
        except ValueError:
            duplicate = None
        if isinstance(duplicate, dict):
            for key in SNAPSHOT_KEYS:
                if key in duplicate:
                    if not isinstance(context, dict) or key + "_ref" not in context:
                        raise ValidationError("filmstrip authority has no matching host-owned snapshot context")
                    if not isinstance(duplicate[key], dict) or snapshot_digest(duplicate[key]) != context[key + "_ref"]["digest"]:
                        raise ValidationError("filmstrip authority snapshot differs from admitted authority context")
                    duplicate[key + "_ref"] = context[key + "_ref"]
                    del duplicate[key]
            inputs["filmstrip_authority"] = canonical_json(duplicate)
    return result, count


def restore_spec_snapshots(spec: dict, read: Callable[[dict], dict]) -> dict:
    """Replay the exact prior spec for migration verification only."""
    result = copy.deepcopy(spec)
    inner = result.get("spec") if isinstance(result.get("spec"), dict) else result
    inputs = inner.get("inputs") if isinstance(inner.get("inputs"), dict) else {}
    for location in (inner, inputs):
        ref = location.pop("timeline_snapshot_ref", None)
        if isinstance(ref, dict):
            location["timeline_snapshot"] = read(ref)
    context = inner.get("authority_context")
    if not isinstance(context, dict):
        context = result.get("authority_context")
    if isinstance(context, dict):
        for key in SNAPSHOT_KEYS:
            ref = context.pop(key + "_ref", None)
            if isinstance(ref, dict):
                context[key] = read(ref)
    filmstrip = inputs.get("filmstrip_authority")
    if isinstance(filmstrip, str):
        try:
            duplicate = json.loads(filmstrip)
        except ValueError:
            duplicate = None
        if isinstance(duplicate, dict):
            for key in SNAPSHOT_KEYS:
                ref = duplicate.pop(key + "_ref", None)
                if isinstance(ref, dict):
                    duplicate[key] = read(ref)
            inputs["filmstrip_authority"] = canonical_json(duplicate)
    return result
