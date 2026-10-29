#!/usr/bin/env python3
"""N4 timeline-transfer acceptance helpers.

The live command is deliberately narrow: one project, one timeline, and the
read-only ``open_bundle`` route set. It never performs a handshake or accepts
redirects to a non-loopback host. Sandbox import/render commands are separate
so a native host limitation cannot erase source-export evidence.
"""
from __future__ import annotations

import argparse
import contextlib
import copy
import hashlib
import importlib.util
import io
import json
import os
import re
import resource
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlsplit

LIVE_ENDPOINT = "http://127.0.0.1:17340/api/runtime"
LIVE_ORIGIN = "https://astrid.haus"
SOURCE_PROJECT = "811a657af5fe43e4b2b48a670de1f3e8"
FILM_TIMELINE = "01M4GGKMHZ3J8V402C8CWSCE95"
LARGE_TIMELINE = "almost-ready-no-first-second-v2"
HEX = re.compile(r"^[0-9a-f]{64}$")


class NativeRenderUnavailable(RuntimeError):
    """The native host lacks the installed Remotion prerequisites for this acceptance."""


def _json_write(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temporary.replace(path)


def _initialize_sandbox_realm(root: Path) -> tuple[Path, Path]:
    """Initialize a fresh Runtime realm and support directory inside the sandbox."""
    support_root = root / "support"
    realm_root = root / "realm"
    support_root.mkdir(parents=True, exist_ok=True, mode=0o700)
    from runtime_protocol.store import RealmStore

    RealmStore.initialize(realm_root).close()
    return realm_root, support_root


class LiveReadGuard:
    """Fail-closed HTTP guard for a single project/timeline export closure."""

    def __init__(self, project: str, timeline: str, log_path: Path):
        self.project = project
        self.timeline = timeline
        self.log_path = log_path
        self.requests: list[dict[str, object]] = []

    def check(self, method: str, url: str, headers: dict[str, str]) -> None:
        parsed = urlsplit(url)
        if parsed.scheme != "http" or parsed.hostname != "127.0.0.1" or parsed.port != 17340:
            raise RuntimeError(f"live transport blocked non-designated endpoint: {url!r}")
        if parsed.fragment or not parsed.path.startswith("/api/runtime/"):
            raise RuntimeError(f"live transport blocked non-runtime path: {parsed.path!r}")
        path = unquote(parsed.path.removeprefix("/api/runtime"))
        parts = path.split("/")
        if method == "POST":
            allowed = parts == ["", "v1", "projects", self.project, "timelines", self.timeline, "inspect"]
        elif method == "GET":
            allowed = (
                parts == ["", "v1", "projects", self.project]
                or parts == ["", "v1", "projects", self.project, "timelines"]
                or (len(parts) == 6 and parts[:4] == ["", "v1", "projects", self.project]
                    and parts[4] == "timelines" and parts[5] in {self.timeline})
                or (len(parts) in {7, 8} and parts[:4] == ["", "v1", "projects", self.project]
                    and parts[4] == "timelines" and parts[5] == self.timeline
                    and parts[6] in {"revisions", "composition-revisions"})
                or (len(parts) >= 5 and parts[:4] == ["", "v1", "projects", self.project]
                    and parts[4] == "documents")
                or (len(parts) == 7 and parts[:5] == ["", "v1", "projects", self.project, "objects"]
                    and parts[5].startswith("sha256:") and HEX.fullmatch(parts[5][7:])
                    and parts[6] == "location")
                or (len(parts) == 8 and parts[:4] == ["", "v1", "projects", self.project]
                    and parts[4] == "shots" and parts[6] == "revisions")
                or (len(parts) == 4 and parts[:3] == ["", "v1", "objects"]
                    and parts[3].startswith("sha256:") and HEX.fullmatch(parts[3][7:]))
            )
        else:
            allowed = False
        if not allowed:
            raise RuntimeError(f"live transport blocked {method} {path}")
        if method == "POST" and path != f"/v1/projects/{self.project}/timelines/{self.timeline}/inspect":
            raise RuntimeError(f"live transport blocked non-inspect POST: {path}")
        headers["Origin"] = LIVE_ORIGIN

    def install(self) -> None:
        from astrid_runtime_client import generated

        import urllib.request

        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, request, fp, code, msg, headers, newurl):
                raise RuntimeError(f"live acceptance transport refused redirect to {newurl!r}")

        def open_no_redirect(request, *, timeout):
            parsed = urlsplit(request.full_url)
            if parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
                raise RuntimeError(f"live acceptance transport refused non-loopback host {parsed.hostname!r}")
            return urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect).open(request, timeout=timeout)

        def guarded(request, *, timeout):
            method = request.get_method().upper()
            headers = {key.lower(): value for key, value in request.header_items()}
            self.check(method, request.full_url, headers)
            request.remove_header("Authorization")
            request.add_header("Origin", LIVE_ORIGIN)
            record: dict[str, object] = {"method": method, "path": urlsplit(request.full_url).path,
                                        "origin": LIVE_ORIGIN, "status": None}
            self.requests.append(record)
            try:
                response = open_no_redirect(request, timeout=timeout)
            except Exception as exc:
                status = getattr(exc, "code", None)
                record["status"] = status
                record["error"] = type(exc).__name__
                self.flush()
                raise
            record["status"] = getattr(response, "status", None)
            record["content_length"] = response.headers.get("Content-Length")
            self.flush()
            return response

        generated._urlopen_loopback = guarded

    def flush(self) -> None:
        _json_write(self.log_path, {"requests": self.requests})


def source_export(args: argparse.Namespace) -> int:
    from astrid.sdk.client import AstridClient
    from astrid.sdk.remote import RemoteAstridClient
    from astrid.sdk.workspace_client import WorkspaceClient
    from astrid.packs.timeline import cli as timeline_cli

    if args.project != SOURCE_PROJECT:
        raise SystemExit(f"source exports are restricted to project {SOURCE_PROJECT}")
    if args.kind == "film" and args.timeline != FILM_TIMELINE:
        raise SystemExit(f"film export is restricted to timeline {FILM_TIMELINE}")
    if args.kind == "large" and args.timeline != LARGE_TIMELINE:
        raise SystemExit(f"large export is restricted to timeline {LARGE_TIMELINE!r}")
    # The hosted door authenticates with its own product credential and strips
    # caller Authorization; this explicit placeholder is never sent onward.
    token = "door-injected-product-credential"
    args.out.parent.mkdir(parents=True, exist_ok=True)
    disk_free_before = shutil.disk_usage(args.out.parent).free
    if args.kind == "large" and disk_free_before < 8 * 1024**3:
        raise SystemExit(f"large acceptance requires 8 GiB free before export; found {disk_free_before} bytes")
    if disk_free_before < 2 * 1024**3:
        raise SystemExit(f"acceptance requires at least 2 GiB free; found {disk_free_before} bytes")
    guard = LiveReadGuard(args.project, args.timeline, args.request_log)
    guard.install()
    workspace = WorkspaceClient(LIVE_ENDPOINT, token)
    client = AstridClient(remote=RemoteAstridClient(workspace))
    started = time.monotonic()
    result = timeline_cli.build_parser(client).parse_args([
        "export", "--project", args.project, args.timeline, "--out", str(args.out), "--json",
    ])
    output = io.StringIO()
    try:
        with contextlib.redirect_stdout(output):
            code = result.handler(result)
    except Exception as exc:
        guard.flush()
        failure = {
            "status": "failed", "kind": args.kind, "project": args.project,
            "timeline": args.timeline, "archive": str(args.out),
            "archive_bytes": args.out.stat().st_size if args.out.is_file() else None,
            "elapsed_seconds": round(time.monotonic() - started, 3),
            "peak_rss_platform_units": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
            "completed_at_utc": datetime.now(timezone.utc).isoformat(),
            "request_log": str(args.request_log), "request_count": len(guard.requests),
            "disk_free_bytes_before": disk_free_before,
            "disk_free_bytes_after": shutil.disk_usage(args.out.parent).free,
            "methods": sorted({str(row["method"]) for row in guard.requests}),
            "error": f"{type(exc).__name__}: {exc}",
        }
        _json_write(args.result, failure)
        print(json.dumps(failure, sort_keys=True))
        raise
    guard.flush()
    try:
        cli_result = json.loads(output.getvalue())
    except json.JSONDecodeError:
        cli_result = {"raw": output.getvalue()[:2000]}
    base_record = {
        "kind": args.kind, "project": args.project, "timeline": args.timeline,
        "archive": str(args.out), "archive_bytes": args.out.stat().st_size if args.out.is_file() else None,
        "elapsed_seconds": round(time.monotonic() - started, 3),
        "peak_rss_platform_units": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
        "completed_at_utc": datetime.now(timezone.utc).isoformat(),
        "request_log": str(args.request_log), "request_count": len(guard.requests),
        "disk_free_bytes_before": disk_free_before,
        "disk_free_bytes_after": shutil.disk_usage(args.out.parent).free,
        "methods": sorted({str(row["method"]) for row in guard.requests}),
        "cli_exit_code": code, "cli_result": cli_result,
    }
    if code != 0 or not args.out.is_file():
        _json_write(args.result, {**base_record, "status": "failed"})
        print(json.dumps({**base_record, "status": "failed"}, sort_keys=True))
        raise RuntimeError(f"timeline export CLI failed with exit code {code}; evidence saved to {args.result}")
    archive_sha = hashlib.sha256()
    with args.out.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            archive_sha.update(block)
    receipt = {**base_record, "status": "passed", "archive_sha256": archive_sha.hexdigest()}
    _json_write(args.result, receipt)
    print(json.dumps(receipt, sort_keys=True))
    return 0


def archive_inspect(args: argparse.Namespace) -> int:
    from zipfile import ZIP_STORED, ZipFile

    with ZipFile(args.archive) as archive:
        entries = archive.infolist()
        if not entries or any(item.compress_type != ZIP_STORED for item in entries):
            raise RuntimeError("archive must contain stored ZIP entries")
        names = [item.filename for item in entries]
        if len(names) != len(set(names)) or names[:2] != ["manifest.json", "timeline.json"]:
            raise RuntimeError("archive names are duplicated or required entries are out of order")
        manifest = json.loads(archive.read("manifest.json"))
        if manifest.get("format") != "astrid.timeline/1":
            raise RuntimeError(f"unknown archive format: {manifest.get('format')!r}")
        rows = {item.filename: item.file_size for item in entries}
        total = sum(rows.values())
        if args.max_bytes is not None and total > args.max_bytes:
            raise RuntimeError(f"archive is {total} bytes; exceeds configured fallback cap {args.max_bytes}")
        answer = {"archive": str(args.archive), "archive_bytes": args.archive.stat().st_size,
                  "uncompressed_bytes": total, "entries": len(entries),
                  "media_entries": sum(name.startswith("media/") for name in names),
                  "media_bytes": sum(size for name, size in rows.items() if name.startswith("media/")),
                  "metadata_bytes": sum(size for name, size in rows.items() if not name.startswith("media/")),
                  "transcript_entries": sum(name.startswith("transcripts/") for name in names),
                  "format": manifest["format"], "timeline_name": manifest.get("name")}
    _json_write(args.result, answer)
    print(json.dumps(answer, sort_keys=True))
    return 0


def _invoke_cli(client, argv: list[str]) -> tuple[int, dict[str, object], str]:
    import contextlib
    import io
    from astrid.packs.timeline import cli as timeline_cli

    parsed = timeline_cli.build_parser(client).parse_args(argv)
    output = io.StringIO()
    with contextlib.redirect_stdout(output):
        code = parsed.handler(parsed)
    rendered = output.getvalue()
    try:
        envelope = json.loads(rendered)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"timeline CLI returned non-JSON output: {rendered[:500]!r}") from exc
    if not isinstance(envelope, dict):
        raise RuntimeError("timeline CLI returned a malformed result envelope")
    return code, envelope, rendered


def _data(envelope: dict[str, object], label: str) -> dict[str, object]:
    value = envelope.get("data")
    if envelope.get("ok") is not True or not isinstance(value, dict):
        raise RuntimeError(f"{label} CLI failed: {envelope.get('error')!r}")
    return value


def _render_task_id(envelope: object) -> str | None:
    """The canonical timelines render CLI exposes the admitted task as kernel_task_id."""
    if not isinstance(envelope, dict):
        return None
    data = envelope.get("data")
    task_id = data.get("kernel_task_id") if isinstance(data, dict) else None
    return task_id if isinstance(task_id, str) and task_id else None


def _render_task_error(task: object) -> object:
    if not isinstance(task, dict):
        return None
    result = task.get("result")
    if isinstance(result, dict) and result.get("error") is not None:
        return result["error"]
    return task.get("error")


def _managed_output_rows(page: object) -> list[dict[str, object]]:
    if getattr(page, "ok", False) is not True:
        raise RuntimeError(f"Runtime managed-output lookup failed: {getattr(page, 'error', None)}")
    data = getattr(page, "data", None)
    rows: object = None
    if isinstance(data, (list, tuple)) and data:
        rows = data[0]
    elif isinstance(data, dict):
        rows = data.get("items")
    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
        raise RuntimeError("Runtime returned a malformed managed-output list")
    return rows


def _probe_render_output(client: object, project: str, output: dict[str, object], root: Path) -> dict[str, object]:
    digest = output.get("digest") or output.get("object_id")
    if not isinstance(digest, str) or not digest:
        raise RuntimeError("managed video output has no content digest")
    reference: dict[str, object] = {"kind": "managed_output"}
    association_id = output.get("association_id")
    if isinstance(association_id, str) and association_id:
        reference["association_id"] = association_id
    else:
        reference["object_id"] = digest
    opened = client.media.open(  # type: ignore[attr-defined]
        project, reference,
        materialize=True, cache_root=root / "render-materialized", max_bytes=1024**3,
    )
    if not opened.ok or not isinstance(opened.data, dict):
        raise RuntimeError(f"could not materialize the managed render output: {opened.error}")
    local_path = Path(str(opened.data.get("local_path") or "")).resolve()
    if not local_path.is_relative_to(root.resolve()) or not local_path.is_file():
        raise RuntimeError(f"render output materialized outside its sandbox or is missing: {local_path}")
    if local_path.stat().st_size <= 0:
        raise RuntimeError("render output file is empty")
    probed = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=format_name,duration:stream=codec_type,codec_name",
         "-of", "json", str(local_path)], capture_output=True, text=True, check=True, timeout=60,
    )
    metadata = json.loads(probed.stdout)
    format_row = metadata.get("format") if isinstance(metadata, dict) else None
    duration = float(format_row.get("duration")) if isinstance(format_row, dict) and format_row.get("duration") else 0.0
    streams = metadata.get("streams") if isinstance(metadata, dict) else None
    if not isinstance(streams, list) or not any(isinstance(row, dict) and row.get("codec_type") == "video" for row in streams):
        raise RuntimeError("render output has no decodable video stream")
    if duration <= 0:
        raise RuntimeError("render output has no positive probed duration")
    return {"path": str(local_path), "bytes": local_path.stat().st_size, "sha256": opened.data.get("content_identity"),
            "duration_seconds": duration, "format_name": format_row.get("format_name"), "streams": streams}


def _preflight_cli_case(client, project: str, directory: Path, label: str,
                        manifest: dict[str, object], expected_text: str) -> None:
    from zipfile import ZIP_STORED, ZipFile

    path = directory / f"{label}.astrid"
    with ZipFile(path, "w", compression=ZIP_STORED) as archive:
        archive.writestr("manifest.json", json.dumps(manifest, separators=(",", ":")))
    code, envelope, rendered = _invoke_cli(client, ["import", "--project", project,
                                                      str(path), "--json"])
    error = envelope.get("error")
    message = error.get("message", "") if isinstance(error, dict) else ""
    if code == 0 or expected_text not in str(message):
        raise RuntimeError(f"{label} preflight did not refuse with {expected_text!r}: {rendered}")


def _acceptance_digest(value: object) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return "sha256:" + hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _acceptance_authoring_closure(project_id: str, picture_id: str, audio_id: str):
    """Build the small valid authoring closure used by the transcript case."""
    internal_payload = {
        "tracks": [{"id": "picture", "kind": "visual"}, {"id": "voice", "kind": "audio"}],
        "clips": [
            {"id": "picture-1", "track": "picture", "clipType": "media", "asset": "picture",
             "at": 0, "hold": 1, "rect": {"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.4}},
            {"id": "voice-1", "track": "voice", "clipType": "media", "asset": "voice",
             "at": 0, "hold": 1},
        ],
        "effects": [{"type": "opacity", "value": 0.75}],
        "audio": [{"track_id": "voice", "gain": 0.8}],
        "layout": {"width": 1920, "height": 1080},
        "registry": {"assets": {
            "picture": {"media_id": picture_id, "type": "image"},
            "voice": {"media_id": audio_id, "type": "audio"},
        }},
        "assets": [],
    }
    shot_payload = {
        "name": "Opening",
        "metadata": {},
        "items": [
            {"item_id": "item-1", "media_id": picture_id, "source_frame": None,
             "metadata": {"role": "primary_visual", "source_item_id": "item-1"}},
            {"item_id": "item-audio", "media_id": audio_id, "source_frame": None,
             "metadata": {"role": "voiceover"}},
        ],
        "pools": [],
        "selected_variants": {},
        "provenance": {},
        "generation_inputs": {},
        "audio_bindings": [{"track_id": "voice", "object_id": audio_id}],
        "text_bindings": [{"slot": "voiceover", "text": "hello"}],
        "internal_timeline_revision_id": "internal-1",
    }
    occurrences = []
    for index, start in ((1, 0), (2, 1000)):
        occurrences.append({
            "occurrence_id": f"occ-{index}", "shot_id": "shot-shared", "shot_revision_id": "shot-rev-1",
            "placement": {"start_ms": start, "track": "picture"},
            "source_offset": {"start": 0, "end": 1000}, "duration_ms": 1000,
            "speed": {"numerator": 1, "denominator": 1}, "track": "picture",
            "transform": {"scale": 1}, "gain": 1, "muted": False,
        })
    parent_payload = {
        "config": {
            "tracks": [{"id": "picture", "kind": "visual"}],
            "clips": [{"id": "direct", "track": "picture", "asset": "direct", "at": 3, "hold": 1}],
        },
        "registry": {"assets": {"direct": {"media_id": picture_id}}},
        "clips": [{"id": "direct", "track": "picture", "asset": "direct", "at": 3, "hold": 1}],
        "occurrences": occurrences,
    }
    parent = {
        "revision_id": "parent-1", "project_id": project_id, "timeline_id": "main",
        "content_digest": _acceptance_digest(parent_payload), "payload": parent_payload,
    }
    shot = {
        "revision_id": "shot-rev-1", "project_id": project_id, "shot_id": "shot-shared",
        "internal_timeline_revision_id": "internal-1",
        "content_digest": _acceptance_digest(shot_payload), "payload": shot_payload,
    }
    internal = {
        "revision_id": "internal-1", "project_id": project_id, "timeline_id": "main",
        "content_digest": _acceptance_digest(internal_payload), "payload": internal_payload,
    }
    return parent, [shot], [internal]


def _sandbox_transcript_conflict(client, result_root: Path) -> dict[str, object]:
    """Seed a tiny real Runtime timeline with transcript/music/words and test conflict semantics."""
    from astrid.sdk.remote import RemoteAstridClient
    from astrid.sdk.timeline_export import export_timeline

    remote: RemoteAstridClient = client._remote
    workspace = remote._transport
    source_result = remote.projects.create(slug="n4-transcript-source", name="N4 transcript fixture source",
                                           idempotency_key="n4-transcript-source")
    target_result = remote.projects.create(slug="n4-transcript-target", name="N4 transcript fixture target",
                                           idempotency_key="n4-transcript-target")
    if not source_result.ok or not target_result.ok:
        raise RuntimeError("could not create isolated transcript source/target projects")
    source_id = str(source_result.data["project_id"])
    target_id = str(target_result.data["project_id"])
    picture = remote.media.import_bytes(project=source_id, data=b"n4-transcript-picture",
                                        filename="n4-picture.png", media_type="image/png",
                                        idempotency_key="n4-picture")
    audio = remote.media.import_bytes(project=source_id, data=b"n4-transcript-voice",
                                      filename="n4-voice.wav", media_type="audio/wav",
                                      idempotency_key="n4-voice")
    music = remote.media.import_bytes(project=source_id, data=b"n4-transcript-music",
                                      filename="n4-music.wav", media_type="audio/wav",
                                      idempotency_key="n4-music")
    if not picture.ok or not audio.ok or not music.ok:
        raise RuntimeError("could not provision real sandbox transcript fixture media")
    picture_id, audio_id, music_id = (picture.data["object_id"], audio.data["object_id"], music.data["object_id"])
    timeline = workspace.create_timeline(source_id, "main", name="N4 transcript fixture",
                                         idempotency_key="n4-transcript-timeline")
    shot = remote.shots.create(project=source_id, shot={"shot_id": "shot-shared", "name": "Opening"},
                               idempotency_key="n4-transcript-shot")
    binding = remote.shots.set_text_binding(project=source_id, shot_id="shot-shared",
                                            kind="voiceover_script", text="Narration — café",
                                            expected_head=0, idempotency_key="n4-transcript-binding")
    if not timeline or not shot.ok or not binding.ok:
        raise RuntimeError("could not create sandbox transcript fixture shell/shot/binding")
    parent, shots, internals = _acceptance_authoring_closure(source_id, picture_id, audio_id)
    for occurrence in parent["payload"]["occurrences"]:
        occurrence["source_offset"] = {"start": 0, "end": 0}
    narration = "Narration — café"
    shots[0]["payload"]["text_bindings"] = [{**binding.data, "text": narration}]
    shots[0]["payload"]["items"].append({"item_id": "n4-music-item", "media_id": music_id,
                                          "source_frame": None, "metadata": {"role": "music"}})
    internal = internals[0]["payload"]
    internal["tracks"].append({"id": "music", "kind": "audio"})
    internal["registry"]["assets"]["music"] = {"media_id": music_id, "type": "audio"}
    internal["clips"].append({"id": "n4-music-bed", "track": "music", "clipType": "media",
                              "asset": "music", "at": 0, "hold": 2})
    internal["clips"][1]["app"] = {"astrid": {"words": [[0.1, 0.5, "café"]]}}
    transcript = {"schema": "media.transcript/v1", "media_id": audio_id, "source_id": "n4-whisper",
                  "segments": [{"id": "n4-line-1", "start": 0.1, "end": 0.5, "text": "café",
                                "words": [{"id": "n4-word-1", "start": 0.1, "end": 0.5, "text": "café"}]}]}
    document = remote.documents.create(project=source_id, kind="media.transcript", content=transcript,
                                       idempotency_key="n4-transcript-document")
    if not document.ok:
        raise RuntimeError(f"could not create source transcript: {document.error}")
    parent["payload"]["config"]["bundle"] = {
        "chapters": [{"name": "01 Opening", "from": "occ-1"}],
        "transcriptReferences": {"schema": "media.transcript.references/v1", "associations": [
            {"assetId": "voice", "documentId": document.data["document_id"]}
        ]},
    }
    parent["content_digest"] = _acceptance_digest(parent["payload"])
    shots[0]["content_digest"] = _acceptance_digest(shots[0]["payload"])
    internals[0]["content_digest"] = _acceptance_digest(internals[0]["payload"])
    publication = {"project_id": source_id, "timeline_id": "main", "expected_head": None,
                   "parent_revision_id": "n4-transcript-parent", "parent_composition": parent["payload"],
                   "shot_revisions": shots, "internal_timeline_revisions": internals}
    if not workspace.publish_parent_composition(source_id, "main", publication,
                                                idempotency_key="n4-transcript-publish"):
        raise RuntimeError("could not publish source transcript fixture")

    archive = result_root / "transcript-conflict-fixture.astrid"
    export_timeline(remote, source_id, "main", archive)
    first_code, first_env, first_text = _invoke_cli(client, ["import", "--project", target_id, str(archive), "--json"])
    if first_code != 0:
        raise RuntimeError(f"transcript fixture import failed: {first_text}")
    first = _data(first_env, "transcript fixture import")
    timeline_id = str(first["timeline_id"])
    target_bundle_result = remote.timelines.open_bundle(target_id, timeline_id)
    if not target_bundle_result.ok or not isinstance(target_bundle_result.data, dict):
        raise RuntimeError("could not reload imported transcript fixture")
    target_bundle = target_bundle_result.data["bundle"]
    from astrid.sdk.timeline_import_prepare import _document_id
    transcript_id = _document_id(target_id, audio_id, "n4-whisper")
    loaded_document = remote.documents.show(transcript_id, project=target_id)
    text_bindings = remote.shots.list_text_bindings(target_id,
                                                     shot_id=target_bundle["placements"][0]["shot_id"],
                                                     include_text=True)
    music_found = any(row.get("id") == "n4-music-bed"
                      for shot in target_bundle.get("shots", {}).values()
                      for row in (shot.get("internal_timeline", {}).get("clips", []) if isinstance(shot, dict) else []))
    words_found = any(row.get("app", {}).get("astrid", {}).get("words") == [[0.1, 0.5, "café"]]
                      for shot in target_bundle.get("shots", {}).values()
                      for row in (shot.get("internal_timeline", {}).get("clips", []) if isinstance(shot, dict) else []))
    if not loaded_document.ok or not text_bindings.ok or not music_found or not words_found:
        raise RuntimeError("transcript/music/words/text-binding data did not survive CLI import/reload")
    changed = copy.deepcopy(loaded_document.data["content"])
    changed["segments"][0]["text"] += " [N4 preserved]"
    update = remote.documents.update(transcript_id, project=target_id, content=changed,
                                    expected_version=loaded_document.data["version"],
                                    idempotency_key="n4-conflict-update")
    if not update.ok:
        raise RuntimeError(f"could not edit target transcript for conflict case: {update.error}")
    conflict_code, conflict_env, conflict_text = _invoke_cli(client, ["import", "--project", target_id,
                                                                      str(archive), "--json"])
    if conflict_code != 0:
        raise RuntimeError(f"transcript conflict reimport failed: {conflict_text}")
    conflict = _data(conflict_env, "transcript conflict import")
    after = remote.documents.show(transcript_id, project=target_id)
    rows = conflict.get("transcript_conflicts")
    if (not isinstance(rows, list) or not any(isinstance(row, dict) and row.get("document_id") == transcript_id for row in rows)
            or not after.ok or after.data.get("content") != changed):
        raise RuntimeError(f"conflict receipt omitted or overwrote existing transcript: {conflict}")

    # Exercise the warning through the real archive importer using this tiny
    # Runtime-authored archive. Keep the timeline and manifest inventories in
    # sync so the importer's stale/hidden-element guard remains enabled.
    from zipfile import ZIP_STORED, ZipFile
    from astrid.core.element.catalog import list_element_descriptors

    shipped_effect = next((row for row in list_element_descriptors()
                           if row.get("kind") == "effect" and row.get("packId")), None)
    if shipped_effect is None:
        raise RuntimeError("no shipped effect pack is available for the unknown-effect acceptance case")
    unknown_id = "acceptance-unknown-effect"
    unknown_pack = str(shipped_effect["packId"])
    unknown_archive = result_root / "unknown-unpinned-effect-fixture.astrid"
    with ZipFile(archive, "r") as source_zip:
        members = {name: source_zip.read(name) for name in source_zip.namelist()}
    unknown_bundle = json.loads(members["timeline.json"].decode("utf-8"))
    unknown_manifest = json.loads(members["manifest.json"].decode("utf-8"))
    changed_clips = 0

    def mark_unknown_clip(value: object) -> None:
        nonlocal changed_clips
        if isinstance(value, dict):
            # Exported authoring bundles retain both base_* snapshots and
            # current content. Change one current shot timeline so the case
            # tests what import actually copies, not its historical base.
            internal = value.get("internal_timeline")
            clips = internal.get("clips") if isinstance(internal, dict) else None
            if isinstance(clips, list):
                for clip in clips:
                    if (isinstance(clip, dict) and isinstance(clip.get("clipType"), str)
                            and clip.get("clipType") == "media"):
                        clip["clipType"] = unknown_id
                        changed_clips += 1
                        return
            for child in value.values():
                if changed_clips == 0:
                    mark_unknown_clip(child)
        elif isinstance(value, list):
            for child in value:
                if changed_clips == 0:
                    mark_unknown_clip(child)

    mark_unknown_clip(unknown_bundle)
    if changed_clips != 1:
        raise RuntimeError(f"could not select exactly one real fixture clip for the unknown effect: {changed_clips}")
    unknown_manifest["elements"] = list(unknown_manifest.get("elements", [])) + [{
        "packId": unknown_pack, "kind": "effect", "id": unknown_id, "revision": "", "pinned": False,
    }]
    members["timeline.json"] = json.dumps(unknown_bundle, ensure_ascii=False,
                                          separators=(",", ":")).encode("utf-8")
    members["manifest.json"] = json.dumps(unknown_manifest, ensure_ascii=False,
                                           separators=(",", ":")).encode("utf-8")
    with ZipFile(unknown_archive, "w", compression=ZIP_STORED) as target_zip:
        for name, content in members.items():
            target_zip.writestr(name, content)

    unknown_target = remote.projects.create(slug="n4-unknown-effect-target",
                                           name="N4 unknown effect target",
                                           idempotency_key="n4-unknown-effect-target")
    if not unknown_target.ok or not isinstance(unknown_target.data, dict):
        raise RuntimeError("could not create isolated target project for the unknown effect case")
    unknown_project = str(unknown_target.data.get("project_id") or unknown_target.data.get("id") or "")
    if not unknown_project:
        raise RuntimeError("Runtime did not return unknown-effect target project id")
    unknown_code, unknown_env, unknown_text = _invoke_cli(
        client, ["import", "--project", unknown_project, str(unknown_archive), "--json"])
    if unknown_code != 0:
        raise RuntimeError(f"unknown unpinned effect CLI import failed: {unknown_text}")
    unknown_receipt = _data(unknown_env, "unknown unpinned effect import")
    warnings = unknown_receipt.get("missing_effects")
    if not isinstance(warnings, list) or not any(
            isinstance(row, dict) and row.get("id") == unknown_id and row.get("packId") == unknown_pack
            for row in warnings):
        raise RuntimeError(f"unknown effect warning was not named in the CLI receipt: {unknown_receipt}")
    unknown_timeline_id = str(unknown_receipt.get("timeline_id") or "")
    loaded_unknown = remote.timelines.open_bundle(unknown_project, unknown_timeline_id)
    if (not unknown_timeline_id or not loaded_unknown.ok or not isinstance(loaded_unknown.data, dict)
            or not isinstance(loaded_unknown.data.get("bundle"), dict)):
        raise RuntimeError("could not reload imported timeline for the unknown-effect persistence check")
    # Count only the saved current authoring timelines. The loaded bundle also
    # exposes base_internal_timeline snapshots (and shared shot authority can
    # appear through multiple placements), so a recursive walk counts the
    # historical copy as if it were a second saved clip.
    saved_shots = loaded_unknown.data["bundle"].get("shots")
    if not isinstance(saved_shots, dict):
        raise RuntimeError("imported unknown effect bundle has no current authoring shots")
    retained_identities: set[tuple[str, str]] = set()
    for shot_key, shot_value in saved_shots.items():
        if not isinstance(shot_value, dict):
            continue
        shot_id = str(shot_value.get("shot_id") or shot_key)
        internal = shot_value.get("internal_timeline")
        clips = internal.get("clips") if isinstance(internal, dict) else None
        if not isinstance(clips, list):
            continue
        for clip in clips:
            if isinstance(clip, dict) and clip.get("id") == "picture-1" and clip.get("clipType") == unknown_id:
                retained_identities.add((shot_id, str(clip.get("id"))))
    retained = len(retained_identities)
    if retained != 1:
        raise RuntimeError(f"imported unknown effect clip was not persisted exactly once in current authoring timelines: {retained}")
    return {"status": "passed", "timeline_id": timeline_id, "transcript_document_id": transcript_id,
            "transcript_read": True, "transcript_preserved_after_conflict": True,
            "text_binding_read": True, "music_preserved": True, "word_timings_preserved": True,
            "conflict_receipt": conflict,
            "unknown_unpinned_effect": {"timeline_id": unknown_timeline_id, "clip_type": unknown_id,
                                        "pack_id": unknown_pack, "retained_clips": retained,
                                        "receipt_missing_effects": warnings}}


def _chapter_rows(bundle: dict[str, object]) -> list[dict[str, object]]:
    parent = bundle.get("parent") if isinstance(bundle.get("parent"), dict) else {}
    config = parent.get("config") if isinstance(parent, dict) and isinstance(parent.get("config"), dict) else {}
    app = config.get("app") if isinstance(config, dict) and isinstance(config.get("app"), dict) else {}
    astrid = app.get("astrid") if isinstance(app, dict) and isinstance(app.get("astrid"), dict) else {}
    chapters = astrid.get("chapters") if isinstance(astrid, dict) else None
    if not isinstance(chapters, list):
        structure = config.get("bundle") if isinstance(config, dict) and isinstance(config.get("bundle"), dict) else {}
        chapters = structure.get("chapters") if isinstance(structure, dict) else None
    return [row for row in chapters if isinstance(row, dict)] if isinstance(chapters, list) else []


def _transfer_content_counts(bundle: dict[str, object]) -> dict[str, int]:
    parent = bundle.get("parent") if isinstance(bundle.get("parent"), dict) else {}
    config = parent.get("config") if isinstance(parent, dict) and isinstance(parent.get("config"), dict) else {}
    chapters = _chapter_rows(bundle)
    shots = bundle.get("shots") if isinstance(bundle.get("shots"), dict) else {}
    words = music_clips = 0
    for shot in shots.values():
        if not isinstance(shot, dict):
            continue
        internal = shot.get("internal_timeline")
        if not isinstance(internal, dict):
            continue
        tracks = internal.get("tracks")
        audio_tracks = {str(row.get("id")) for row in tracks
                        if isinstance(row, dict) and (row.get("kind") == "audio"
                        or "music" in str(row.get("id", "")).lower())} if isinstance(tracks, list) else set()
        clips = internal.get("clips")
        for clip in clips if isinstance(clips, list) else []:
            if not isinstance(clip, dict):
                continue
            app = clip.get("app")
            astrid = app.get("astrid") if isinstance(app, dict) else None
            clip_words = astrid.get("words") if isinstance(astrid, dict) else None
            words += len(clip_words) if isinstance(clip_words, list) else 0
            music_clips += int(str(clip.get("track")) in audio_tracks)
    structure = config.get("bundle") if isinstance(config, dict) and isinstance(config.get("bundle"), dict) else {}
    parent_clips = parent.get("clips") if isinstance(parent, dict) else None
    parent_audio_tracks: set[str] = set()
    for track_rows in (parent.get("tracks") if isinstance(parent, dict) else None,
                       config.get("tracks") if isinstance(config, dict) else None,
                       structure.get("tracks") if isinstance(structure, dict) else None):
        if isinstance(track_rows, list):
            parent_audio_tracks.update(str(row.get("id")) for row in track_rows
                                       if isinstance(row, dict) and (row.get("kind") == "audio"
                                       or "music" in str(row.get("id", "")).lower()))
    if isinstance(parent_clips, list):
        music_clips += sum(int(isinstance(row, dict) and str(row.get("track")) in parent_audio_tracks)
                           for row in parent_clips)
    return {"chapters": len(chapters),
            "word_timings": words, "audio_track_clips": music_clips}


def _text_binding_media(bundle: dict[str, object]) -> set[str]:
    output: set[str] = set()
    shots = bundle.get("shots") if isinstance(bundle.get("shots"), dict) else {}
    for shot in shots.values():
        if not isinstance(shot, dict):
            continue
        payload = shot.get("payload") if isinstance(shot.get("payload"), dict) else {}
        bindings = payload.get("text_bindings") if isinstance(payload, dict) else []
        for row in bindings if isinstance(bindings, list) else []:
            if isinstance(row, dict) and isinstance(row.get("media_id"), str):
                output.add(row["media_id"].removeprefix("sha256:"))
    return output


def _transcript_references(bundle: dict[str, object]) -> set[str]:
    found: set[str] = set()

    def walk(value: object) -> None:
        if isinstance(value, dict):
            refs = value.get("transcriptReferences")
            if isinstance(refs, dict) and isinstance(refs.get("associations"), list):
                found.update(str(item["documentId"]) for item in refs["associations"]
                             if isinstance(item, dict) and isinstance(item.get("documentId"), str))
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    walk(bundle)
    return found


def _json_difference_paths(left: object, right: object, *, limit: int = 20) -> list[dict[str, object]]:
    differences: list[dict[str, object]] = []

    def walk(a: object, b: object, path: str) -> None:
        if len(differences) >= limit:
            return
        if type(a) is not type(b):
            differences.append({"path": path or "/", "source_type": type(a).__name__,
                                "target_type": type(b).__name__})
        elif isinstance(a, dict):
            for key in sorted(set(a) | set(b)):
                child_path = f"{path}/{key}"
                if key not in a:
                    differences.append({"path": child_path, "source": "missing", "target": "present"})
                elif key not in b:
                    differences.append({"path": child_path, "source": "present", "target": "missing"})
                else:
                    walk(a[key], b[key], child_path)
                if len(differences) >= limit:
                    return
        elif isinstance(a, list):
            if len(a) != len(b):
                differences.append({"path": f"{path}/length", "source": len(a), "target": len(b)})
            for index, (source_row, target_row) in enumerate(zip(a, b)):
                walk(source_row, target_row, f"{path}/{index}")
                if len(differences) >= limit:
                    return
        elif a != b:
            differences.append({"path": path or "/", "source_value": repr(a)[:160],
                                "target_value": repr(b)[:160]})

    walk(left, right, "")
    return differences


def sandbox_import(args: argparse.Namespace) -> int:
    """Run import, reload and reimport against an isolated ephemeral Runtime."""
    runtime_path = str(args.runtime_checkout.resolve())
    sys.path.insert(0, runtime_path)
    from runtime_protocol.daemon import RuntimeDaemon
    from runtime_protocol.door import DoorConfig
    from astrid.sdk.client import AstridClient

    from astrid.sdk.timeline_transfer import export_plan

    root = args.sandbox_root.resolve()
    if root.exists() and any(root.iterdir()):
        raise SystemExit(f"sandbox root must be fresh and empty: {root}")
    root.mkdir(parents=True, exist_ok=True)
    previous_data_root = os.environ.get("ASTRID_RUNTIME_DATA_ROOT")
    os.environ["ASTRID_RUNTIME_DATA_ROOT"] = str(root)
    free = shutil.disk_usage(root).free
    required_free = 8 * 1024**3 if args.archive.stat().st_size >= 1536 * 1024**2 else 2 * 1024**3
    if free < required_free:
        raise SystemExit(f"sandbox acceptance requires at least {required_free // (1024**3)} GiB free; found {free} bytes")
    realm_root, support_root = _initialize_sandbox_realm(root)
    door_credential = root / "door-product.json"
    daemon = RuntimeDaemon(realm_root, support_root=support_root,
                           door=DoorConfig(origin=LIVE_ORIGIN, credential_file=door_credential, port=0))
    started = time.monotonic()
    result: dict[str, object] = {
        "status": "running", "runtime_endpoint": daemon.endpoint,
        "door_endpoint": daemon.door_endpoint, "free_bytes_before": free,
        "realm_root": str(daemon.root), "support_root": str(daemon.support_root),
        "archive_bytes": args.archive.stat().st_size,
    }
    try:
        daemon.start()
    except Exception as exc:
        result.update({"status": "failed", "error": f"{type(exc).__name__}: {exc}",
                       "error_details": getattr(exc, "details", None),
                       "elapsed_seconds": round(time.monotonic() - started, 3),
                       "peak_rss_platform_units": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss})
        _json_write(args.result, result)
        daemon.stop()
        if previous_data_root is None:
            os.environ.pop("ASTRID_RUNTIME_DATA_ROOT", None)
        else:
            os.environ["ASTRID_RUNTIME_DATA_ROOT"] = previous_data_root
        raise
    try:
        # The CLI's find_draft helper resolves under ASTRID_RUNTIME_DATA_ROOT.
        # Keep every import/show lookup scoped to this fresh acceptance root.
        result["runtime_endpoint"] = daemon.endpoint
        result["door_endpoint"] = daemon.door_endpoint
        _json_write(args.result, result)
        client = AstridClient.open(endpoint=daemon.endpoint, credential=daemon.token,
                                   realm_id=daemon.service.realm["id"], actor_id="owner",
                                   client_name="n4-acceptance", client_version="1",
                                   protocol_version="workspace.v1")
        product_token = secrets.token_urlsafe(32)
        credential_request = json.dumps({"actor_id": "astrid-door-product",
                                         "credential": product_token, "scope": "astrid"},
                                        separators=(",", ":")).encode()
        status, _headers, credential_body = client._remote._transport._generated._request(
            "POST", "/v1/credentials", body=credential_request,
            headers={"Content-Type": "application/json"}, expected=(201,))
        credential_result = json.loads(credential_body.decode("utf-8"))
        if status != 201 or credential_result.get("actor_id") != "astrid-door-product":
            raise RuntimeError("isolated Runtime did not provision its door product identity")
        door_credential.write_text(json.dumps({"version": 1, "scope": "astrid",
                                               "actor_id": "astrid-door-product",
                                               "token": product_token}), encoding="utf-8")
        door_credential.chmod(0o600)
        project_result = client.projects.create(slug="n4-import-target", name="N4 import target",
                                                idempotency_key="n4-import-target")
        if not project_result.ok or not isinstance(project_result.data, dict):
            raise RuntimeError(f"could not create isolated target project: {project_result.error}")
        project = project_result.data.get("project_id") or project_result.data.get("id")
        if not isinstance(project, str) or not project:
            raise RuntimeError("Runtime did not return target project id")
        result["project_id"] = project
        _json_write(args.result, result)

        from astrid.sdk.pagination import paged_rows
        initial_rows = paged_rows(client._remote._transport.list_project_objects, project, limit=100)
        if initial_rows is None or initial_rows:
            raise RuntimeError("new acceptance project unexpectedly contains object dependencies")
        cases_dir = root / "preflight-cases"
        cases_dir.mkdir(exist_ok=True)
        _preflight_cli_case(client, project, cases_dir, "unknown-format",
                            {"format": "astrid.timeline/999", "elements": []},
                            "update Astrid to open it")
        _preflight_cli_case(client, project, cases_dir, "missing-custom-effect",
                            {"format": "astrid.timeline/1", "elements": [{
                                "packId": "project_acceptance", "kind": "effect",
                                "id": "acceptance-missing-effect", "revision": "r1", "pinned": True,
                            }]}, "custom effect acceptance-missing-effect")
        from astrid.sdk.timeline_transfer import check_import_manifest
        missing_warning = check_import_manifest({"format": "astrid.timeline/1", "elements": [{
            "packId": "missing-pack", "kind": "effect", "id": "missing-unpinned-effect",
            "revision": "", "pinned": False,
        }]})
        if not any(row.get("id") == "missing-unpinned-effect" for row in missing_warning["missing_effects"]):
            raise RuntimeError("unknown unpinned effect did not appear in the warning differences")
        post_preflight = paged_rows(client._remote._transport.list_project_objects, project, limit=100)
        if post_preflight is None or post_preflight:
            raise RuntimeError("manifest-only preflight cases uploaded an object before refusing")

        elapsed: list[float] = []
        receipts: list[dict[str, object]] = []
        for label in ("first", "dedupe"):
            before = time.monotonic()
            code, envelope, rendered = _invoke_cli(client, ["import", "--project", project,
                                                              str(args.archive), "--json"])
            if code != 0:
                raise RuntimeError(f"{label} import command failed: {rendered}")
            data = _data(envelope, f"{label} import")
            if not isinstance(data.get("timeline_id"), str):
                raise RuntimeError(f"{label} import receipt has no timeline_id: {data}")
            receipts.append(data)
            result.update({"timeline_ids": [str(row.get("timeline_id")) for row in receipts],
                           "receipts": receipts})
            _json_write(args.result, result)
            elapsed.append(time.monotonic() - before)

        first_id = str(receipts[0]["timeline_id"])
        second_id = str(receipts[1]["timeline_id"])
        if first_id == second_id:
            raise RuntimeError("reimport did not create a fresh timeline id")
        second_media = receipts[1].get("media")
        if not isinstance(second_media, dict) or second_media.get("uploaded") != 0:
            raise RuntimeError(f"reimport did not dedupe managed media: {second_media!r}")

        show_code, show_env, show_text = _invoke_cli(client, ["show", "--project", project,
                                                               first_id, "--json"])
        if show_code != 0:
            raise RuntimeError(f"reloaded timeline show failed: {show_text}")
        plan = export_plan(client, project, first_id)
        from zipfile import ZipFile
        from astrid.sdk.timeline_duplicate import _remap_values, assert_copy_equals_source, id_map
        from astrid.core.timeline.astrid_ns import migrate_bundle
        from astrid.sdk.timeline_import_prepare import _document_id
        with ZipFile(args.archive, "r") as source_archive:
            source_bundle = json.loads(source_archive.read("timeline.json").decode("utf-8"))
            source_manifest = json.loads(source_archive.read("manifest.json").decode("utf-8"))
            source_transcripts = [json.loads(source_archive.read(name).decode("utf-8"))
                                  for name in source_manifest.get("transcripts", [])]
        from astrid.sdk.timeline_import_prepare import _document_id
        source_transcript_ids = {
            _document_id(SOURCE_PROJECT, str(row.get("media_id")), str(row.get("source_id"))):
            _document_id(project, str(row.get("media_id")), str(row.get("source_id")))
            for row in source_transcripts if isinstance(row, dict)
        }
        reloaded = client.timelines.open_bundle(project, first_id)
        if not reloaded.ok or not isinstance(reloaded.data, dict) or not isinstance(reloaded.data.get("bundle"), dict):
            raise RuntimeError(f"reloaded saved bundle could not be opened: {reloaded.error}")
        target_bundle = reloaded.data["bundle"]
        source_shots = source_bundle.get("placements") or []
        shot_map = id_map(dict.fromkeys(str(row["shot_id"]) for row in source_shots), first_id)
        assert_copy_equals_source(source_bundle, target_bundle, shot_map)
        source_normalized = copy.deepcopy(source_bundle)
        target_normalized = copy.deepcopy(target_bundle)
        migrate_bundle(source_normalized)
        migrate_bundle(target_normalized)
        source_occurrences = [str(row["occurrence_id"]) for row in source_shots]
        occurrence_map = id_map(source_occurrences, f"occ-{first_id}")
        expected_parent = copy.deepcopy(source_normalized.get("parent") or {})
        expected_parent.pop("occurrences", None)
        expected_parent = _remap_values(expected_parent, {**shot_map, **occurrence_map, **source_transcript_ids})
        actual_parent = copy.deepcopy(target_normalized.get("parent") or {})
        actual_parent.pop("occurrences", None)
        parent_differences = _json_difference_paths(expected_parent, actual_parent, limit=20)
        result["parent_differences"] = parent_differences
        if parent_differences:
            raise RuntimeError("parent config/registry/clips or opaque authored fields changed during transfer")
        source_counts = _transfer_content_counts(source_normalized)
        target_counts = _transfer_content_counts(target_normalized)
        if source_counts != target_counts:
            raise RuntimeError(f"chapters/words/music closure changed during transfer: {source_counts} != {target_counts}")
        source_chapters = _chapter_rows(source_normalized)
        target_chapters = _chapter_rows(target_normalized)
        if [row.get("name") for row in source_chapters] != [row.get("name") for row in target_chapters]:
            raise RuntimeError("chapter names or order changed during timeline transfer")
        transcript_ids: list[str] = []
        for transcript in source_transcripts:
            content = transcript if isinstance(transcript, dict) else None
            if isinstance(content, dict):
                transcript_id = _document_id(project, str(content.get("media_id")), str(content.get("source_id")))
                document = client.documents.show(transcript_id, project=project)
                if not document.ok:
                    raise RuntimeError(f"imported transcript was not readable: {transcript_id}")
                transcript_ids.append(transcript_id)
        target_refs = _transcript_references(target_bundle)
        expected_refs = {source_transcript_ids[value] for value in _transcript_references(source_bundle)
                         if value in source_transcript_ids}
        if target_refs != expected_refs or not target_refs <= set(transcript_ids):
            raise RuntimeError(f"timeline transcript references were not rewritten to carried target documents: expected={sorted(expected_refs)}, actual={sorted(target_refs)}")
        conflict_result: dict[str, object] = {"status": "not-applicable", "reason": "source archive carries no transcripts"}
        if source_transcripts:
            transcript = source_transcripts[0]
            transcript_id = _document_id(project, str(transcript["media_id"]), str(transcript["source_id"]))
            existing = client.documents.show(transcript_id, project=project)
            if not existing.ok or not isinstance(existing.data, dict):
                raise RuntimeError(f"cannot read carried target transcript {transcript_id}")
            changed = copy.deepcopy(existing.data["content"])
            segments = changed.get("segments")
            if not isinstance(segments, list) or not segments or not isinstance(segments[0], dict):
                raise RuntimeError("carried transcript has no editable segment for the conflict acceptance case")
            segments[0] = {**segments[0], "text": str(segments[0].get("text") or "") + " [N4 preserved]"}
            updated = client.documents.update(transcript_id, project=project, content=changed,
                                              expected_version=int(existing.data["version"]),
                                              idempotency_key="n4-transcript-conflict")
            if not updated.ok:
                raise RuntimeError(f"could not mutate target transcript for conflict case: {updated.error}")
            before = time.monotonic()
            conflict_code, conflict_env, conflict_text = _invoke_cli(client, ["import", "--project", project,
                                                                              str(args.archive), "--json"])
            if conflict_code != 0:
                raise RuntimeError(f"transcript conflict reimport failed: {conflict_text}")
            conflict_receipt = _data(conflict_env, "transcript conflict import")
            saved = client.documents.show(transcript_id, project=project)
            conflicts = conflict_receipt.get("transcript_conflicts")
            if (not isinstance(conflicts, list) or not any(isinstance(row, dict) and row.get("document_id") == transcript_id
                                                            for row in conflicts)
                    or not saved.ok or saved.data.get("content") != changed):
                raise RuntimeError(f"transcript conflict was not reported/preserved: {conflict_receipt}")
            conflict_result = {"status": "passed", "document_id": transcript_id,
            "elapsed_seconds": round(time.monotonic() - before, 3),
                               "receipt": conflict_receipt}
        serialized = json.dumps({"plan": plan, "show": show_env}, ensure_ascii=False)
        if "/Users/" in serialized:
            raise RuntimeError("imported authoring bundle contains an absolute /Users/ path")
        media = plan.get("media", [])
        rows = paged_rows(client._remote._transport.list_project_objects, project, limit=100)
        if rows is None:
            raise RuntimeError("could not enumerate sandbox project's managed object closure")
        managed = {str(row.get("digest") or row.get("object_id") or "").removeprefix("sha256:")
                   for row in rows if isinstance(row, dict) and row.get("relation") == "managed"}
        expected = {str(row.get("sha256") or "").removeprefix("sha256:")
                    for row in media if isinstance(row, dict)}
        from astrid.core.timeline.authoring_bundle import compile_authoring_candidate
        source_publication = compile_authoring_candidate(source_normalized).publication
        source_published = {str(row.get("media_id") or row.get("content_digest") or "").removeprefix("sha256:")
                            for row in source_publication.get("dependency_manifest", {}).get("media", [])
                            if isinstance(row, dict)} | _text_binding_media(source_bundle)
        source_declared = {str(row.get("sha256") or "").removeprefix("sha256:")
                           for row in source_manifest.get("media", []) if isinstance(row, dict)}
        if source_declared != source_published:
            raise RuntimeError(f"source archive media differs from compiler dependency closure: {sorted(source_declared ^ source_published)}")
        publication = compile_authoring_candidate(target_bundle).publication
        published = {str(row.get("media_id") or row.get("content_digest") or "").removeprefix("sha256:")
                     for row in publication.get("dependency_manifest", {}).get("media", [])
                     if isinstance(row, dict)} | _text_binding_media(target_bundle)
        source_binding_media = _text_binding_media(source_bundle)
        if expected != published:
            raise RuntimeError(f"archive media set differs from compiler publication closure: {sorted(expected ^ published)}")
        if not source_binding_media <= expected:
            raise RuntimeError(f"source text-binding media is missing from archive/import closure: {sorted(source_binding_media-expected)}")
        if not expected <= managed:
            raise RuntimeError(f"project managed media set is missing imported publication closure objects: {sorted(expected-managed)}")
        synthetic_transcript_conflict = _sandbox_transcript_conflict(client, root)
        result.update({
            "status": "passed", "project_id": project,
            "timeline_ids": [first_id, second_id], "receipts": receipts,
            "transcript_ids_read": transcript_ids, "transcript_conflict": conflict_result,
            "source_content_counts": source_counts, "imported_content_counts": target_counts,
            "transcript_references": sorted(target_refs),
            "import_seconds": [round(value, 3) for value in elapsed],
            "peak_rss_platform_units": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
            "reload_show_ok": True, "media_closure_count": len(expected),
            "media_closure_managed": True, "users_path_occurrences": 0,
            "source_binding_media_count": len(source_binding_media),
            "unknown_format_refused_before_upload": True,
            "missing_custom_effect_refused_before_upload": True,
            "missing_unpinned_effect_warning": missing_warning["missing_effects"],
            "synthetic_transcript_conflict_fixture": synthetic_transcript_conflict,
            "elapsed_seconds": round(time.monotonic() - started, 3),
        })
    except Exception as exc:
        result.update({"status": "failed", "error": f"{type(exc).__name__}: {exc}",
                       "elapsed_seconds": round(time.monotonic() - started, 3),
                       "peak_rss_platform_units": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss})
        _json_write(args.result, result)
        raise
    finally:
        daemon.stop()
        if previous_data_root is None:
            os.environ.pop("ASTRID_RUNTIME_DATA_ROOT", None)
        else:
            os.environ["ASTRID_RUNTIME_DATA_ROOT"] = previous_data_root
    _json_write(args.result, result)
    print(json.dumps(result, sort_keys=True))
    return 0


def render_attempt(args: argparse.Namespace) -> int:
    """Reopen the imported sandbox realm and use the canonical render CLI path."""
    runtime_path = str(args.runtime_checkout.resolve())
    sys.path.insert(0, runtime_path)
    from runtime_protocol.daemon import RuntimeDaemon
    from runtime_protocol.door import DoorConfig
    from astrid.sdk.client import AstridClient
    from astrid.packs.timeline import cli as timeline_cli
    from astrid.core.execution.generic_host import GenericPackHost, RuntimeProtocolClient

    imported = json.loads(args.import_result.read_text(encoding="utf-8"))
    project = imported.get("project_id")
    timelines = imported.get("timeline_ids")
    if not isinstance(project, str) or not project or not isinstance(timelines, list) or not timelines:
        raise SystemExit("import result must contain project_id and at least one timeline_ids entry")
    timeline_id = timelines[0]
    if not isinstance(timeline_id, str) or not timeline_id:
        raise SystemExit("first imported timeline id is malformed")
    realm_root = Path(str(imported.get("realm_root") or "")).resolve()
    support_root = Path(str(imported.get("support_root") or "")).resolve()
    if not realm_root.is_dir() or not support_root.is_dir():
        raise SystemExit("import result realm_root/support_root must still exist")
    sandbox_root = support_root.parent
    door_credential = sandbox_root / "door-product.json"
    if not door_credential.is_file():
        raise SystemExit(f"sandbox door identity is missing: {door_credential}")

    started = time.monotonic()
    daemon = RuntimeDaemon(realm_root, support_root=support_root,
                           door=DoorConfig(origin=LIVE_ORIGIN, credential_file=door_credential, port=0))
    free = shutil.disk_usage(sandbox_root).free
    if free < 2 * 1024**3:
        raise SystemExit(f"render acceptance requires at least 2 GiB free; found {free} bytes")
    previous_data_root = os.environ.get("ASTRID_RUNTIME_DATA_ROOT")
    os.environ["ASTRID_RUNTIME_DATA_ROOT"] = str(sandbox_root)
    record: dict[str, object] = {
        "status": "running", "project_id": project, "timeline_id": timeline_id,
        "runtime_checkout": runtime_path, "realm_root": str(realm_root),
        "requested_backend": args.backend,
        "disk_free_bytes_before": free,
        "route": "explicit sandbox Runtime -> GenericPackHost(rendering) -> actual timeline render CLI -> AstridClient.invoke_result(rendering.render, kind=executor)",
        "started_at_utc": datetime.now(timezone.utc).isoformat(),
    }
    host = None
    try:
        daemon.start()
        client = AstridClient.open(endpoint=daemon.endpoint, credential=daemon.token,
                                   realm_id=daemon.service.realm["id"], actor_id="owner",
                                   client_name="n4-render-acceptance", client_version="1",
                                   protocol_version="workspace.v1")
        pack_path = Path(__file__).resolve().parents[2] / "astrid" / "packs" / "rendering"
        if not pack_path.is_dir():
            raise RuntimeError(f"canonical rendering pack is missing from the Astrid checkout: {pack_path}")
        source_path = Path(__file__).resolve().parents[2]
        node = shutil.which("node")
        schema_spec = importlib.util.find_spec("banodoco_timeline_schema")
        if not node or schema_spec is None or not schema_spec.origin:
            raise NativeRenderUnavailable(
                "Remotion readiness requires an existing Node 20 executable and the installed "
                "banodoco_timeline_schema package; acceptance does not install dependencies"
            )
        remotion_project = (source_path / "remotion").resolve()
        if not (remotion_project / "node_modules").is_dir():
            raise NativeRenderUnavailable(
                f"Remotion readiness requires the existing dependency closure at "
                f"{remotion_project / 'node_modules'}; acceptance does not install dependencies"
            )
        from astrid.core.env_vars import (
            ASTRID_NODE_EXECUTABLE,
            ASTRID_REMOTION_PROJECT_DIR,
            ASTRID_REMOTION_VALIDATION_LAUNCH,
            ASTRID_REMOTION_VALIDATION_PATH,
            ASTRID_REMOTION_VALIDATION_ROLE,
            ASTRID_REMOTION_VALIDATION_SHA256,
            ASTRID_TIMELINE_SCHEMA_PYTHONPATH,
        )
        from astrid.sdk.host_bootstrap import _prepare_render_validation

        render_env = dict(os.environ)
        render_env[ASTRID_NODE_EXECUTABLE] = str(Path(node).resolve())
        render_env[ASTRID_REMOTION_PROJECT_DIR] = str(remotion_project)
        render_env[ASTRID_TIMELINE_SCHEMA_PYTHONPATH] = str(
            Path(schema_spec.origin).resolve().parent.parent
        )
        launch_id = _prepare_render_validation(
            source_path,
            render_env,
            sandbox_root / "render-support",
            sys.executable,
            (pack_path,),
        )
        if launch_id is None:
            raise NativeRenderUnavailable(
                "canonical Remotion launch preparation found the renderer unavailable; "
                "check the existing Node 20, remotion/node_modules and timeline-schema install"
            )
        record["remotion_readiness"] = "prepared"
        record["remotion_validation_launch_id"] = launch_id
        validation_vars = (
            ASTRID_REMOTION_VALIDATION_PATH,
            ASTRID_REMOTION_VALIDATION_SHA256,
            ASTRID_REMOTION_VALIDATION_LAUNCH,
            ASTRID_REMOTION_VALIDATION_ROLE,
        )
        for key in [name for name in os.environ if name.startswith(("LD_", "DYLD_")) and name not in render_env]:
            os.environ.pop(key, None)
        for name in (
            ASTRID_NODE_EXECUTABLE,
            ASTRID_REMOTION_PROJECT_DIR,
            ASTRID_TIMELINE_SCHEMA_PYTHONPATH,
            *validation_vars,
        ):
            os.environ[name] = render_env[name]
        host = GenericPackHost(
            pack_roots=[pack_path],
            client=RuntimeProtocolClient(daemon.endpoint, daemon.worker_token),
            executor_id="astrid-pack-host",
            attempt_root=sandbox_root / "render-attempts",
        )
        host.discover()
        host.register(deliberate=True)
        os.environ["ASTRID_RUNTIME_CHECKOUT"] = runtime_path
        parsed = timeline_cli.build_parser(client).parse_args([
            "render", "--project", project, timeline_id,
            "--backend", args.backend,
            "--timeout-seconds", str(args.timeout_seconds), "--detach", "--json",
        ])
        output = io.StringIO()
        try:
            with contextlib.redirect_stdout(output):
                exit_code = parsed.handler(parsed)
            rendered = output.getvalue()
            try:
                envelope = json.loads(rendered)
            except json.JSONDecodeError:
                envelope = {"raw": rendered[:4000]}
            data = envelope.get("data") if isinstance(envelope, dict) and isinstance(envelope.get("data"), dict) else {}
            task_id = _render_task_id(envelope)
            settled: list[object] = []
            task_record: object = None
            output_probe: dict[str, object] | None = None
            managed_outputs: list[dict[str, object]] = []
            if exit_code == 0 and isinstance(envelope, dict) and envelope.get("ok") is True and isinstance(task_id, str):
                settled = host.run(once=True)
                task_result = client.tasks.show(task_id)
                task_record = task_result.data if task_result.ok else {"error": task_result.error}
                managed_outputs = _managed_output_rows(client.tasks.list_managed_outputs(task_id))
                record.update({"cli_exit_code": exit_code, "cli_result": envelope,
                               "task_id": task_id, "settled_tasks": settled, "task": task_record,
                               "managed_outputs": managed_outputs})
                video_rows = [row for row in managed_outputs
                              if row.get("output_port") == "video" and row.get("media_type") == "video/mp4"
                              and row.get("role") == "result"]
                if len(video_rows) != 1:
                    raise RuntimeError(f"render task must settle exactly one MP4 video result, found {len(video_rows)}")
                output_probe = _probe_render_output(client, project, video_rows[0], sandbox_root)
            error = envelope.get("error") if isinstance(envelope, dict) else None
            if error is None:
                error = _render_task_error(task_record)
            detail = json.dumps(error, sort_keys=True) if error is not None else ""
            native_census_block = "CustodyError" in detail or "process census" in detail or "errno=1" in detail
            record.update({
                "status": ("passed" if exit_code == 0 and isinstance(envelope, dict) and envelope.get("ok") is True
                           and isinstance(task_record, dict) and task_record.get("state") in {"completed", "succeeded"}
                           and output_probe is not None
                           else "blocked-native" if native_census_block else "failed"),
                "cli_exit_code": exit_code, "cli_result": envelope,
                "task_id": task_id, "settled_tasks": settled, "task": task_record,
                "managed_outputs": managed_outputs, "render_output_probe": output_probe,
                "native_process_census_block": native_census_block,
            })
        except Exception as exc:
            detail = f"{type(exc).__name__}: {exc}"
            record.update({"status": "blocked-native" if isinstance(exc, NativeRenderUnavailable)
                           or "CustodyError" in detail or "process census" in detail
                           or "errno=1" in detail else "failed", "error": detail})
    except Exception as exc:
        detail = f"{type(exc).__name__}: {exc}"
        record.update({"status": "blocked-native" if isinstance(exc, NativeRenderUnavailable)
                       or "CustodyError" in detail or "process census" in detail
                       or "errno=1" in detail else "failed", "error": detail})
    finally:
        record.update({"elapsed_seconds": round(time.monotonic() - started, 3),
                       "peak_rss_platform_units": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
                       "disk_free_bytes_after": shutil.disk_usage(sandbox_root).free})
        if host is not None:
            try:
                host.shutdown()
            except Exception as exc:
                record["host_shutdown_error"] = f"{type(exc).__name__}: {exc}"
        try:
            daemon.stop()
        except Exception as exc:
            record["stop_error"] = f"{type(exc).__name__}: {exc}"
        if previous_data_root is None:
            os.environ.pop("ASTRID_RUNTIME_DATA_ROOT", None)
        else:
            os.environ["ASTRID_RUNTIME_DATA_ROOT"] = previous_data_root
    _json_write(args.result, record)
    print(json.dumps(record, sort_keys=True))
    return 0 if record["status"] == "passed" else 3 if record["status"] == "blocked-native" else 1


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    sub = root.add_subparsers(dest="command", required=True)
    export = sub.add_parser("source-export", help="run the real timeline export CLI with a guarded live transport")
    export.add_argument("--kind", choices=("film", "large"), required=True)
    export.add_argument("--project", required=True)
    export.add_argument("--timeline", required=True)
    export.add_argument("--out", type=Path, required=True)
    export.add_argument("--request-log", type=Path, required=True)
    export.add_argument("--result", type=Path, required=True)
    export.set_defaults(func=source_export)
    inspect = sub.add_parser("archive-inspect", help="validate archive ordering and collect byte/object counts")
    inspect.add_argument("--archive", type=Path, required=True)
    inspect.add_argument("--result", type=Path, required=True)
    inspect.add_argument("--max-bytes", type=int, default=None,
                         help="Optional uncompressed archive ceiling; defaults to no ceiling for 2.2 GB acceptance archives.")
    inspect.set_defaults(func=archive_inspect)
    sandbox = sub.add_parser("sandbox-import", help="import/reload/reimport against a fresh isolated Runtime")
    sandbox.add_argument("--archive", type=Path, required=True)
    sandbox.add_argument("--runtime-checkout", type=Path, required=True)
    sandbox.add_argument("--sandbox-root", type=Path, required=True)
    sandbox.add_argument("--result", type=Path, required=True)
    sandbox.set_defaults(func=sandbox_import)
    render = sub.add_parser("render-attempt", help="invoke the canonical renderer for an imported sandbox timeline")
    render.add_argument("--import-result", type=Path, required=True)
    render.add_argument("--runtime-checkout", type=Path, required=True)
    render.add_argument("--backend", choices=("rendering.remotion",), default="rendering.remotion",
                        help="Require the renderer used by the film acceptance; missing Remotion readiness is a failure.")
    render.add_argument("--timeout-seconds", type=float, default=30.0)
    render.add_argument("--result", type=Path, required=True)
    render.set_defaults(func=render_attempt)
    return root


if __name__ == "__main__":
    parsed = parser().parse_args()
    raise SystemExit(parsed.func(parsed))
