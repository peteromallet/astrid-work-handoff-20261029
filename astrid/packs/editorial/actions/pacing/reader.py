"""Read one Runtime-admitted immutable authoring bundle.

The action is intentionally not a Runtime client.  The generic host/SDK must
admit the exact parent/shot/internal closure and materialize it as the action's
bundle input.  This keeps pacing read-only and prevents a second ambient
launcher connection from becoming a competing timeline authority.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable, Mapping


class PacingReadError(ValueError):
    """The admitted pacing input is absent, malformed, or mismatched."""


def _plain(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {str(key): _plain(child) for key, child in value.items()}
    if isinstance(value, list):
        return [_plain(child) for child in value]
    return value


def _load(value: Any) -> Any:
    if isinstance(value, str) and value.lstrip().startswith(("{", "[")):
        try:
            return json.loads(value)
        except json.JSONDecodeError as exc:
            raise PacingReadError("admitted pacing JSON input is malformed") from exc
    if isinstance(value, (str, Path)):
        path = Path(value).expanduser()
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except OSError as exc:
            raise PacingReadError(f"admitted pacing bundle is unreadable: {path}") from exc
        except json.JSONDecodeError as exc:
            raise PacingReadError(f"admitted pacing bundle is not JSON: {path}") from exc
    return _plain(value)


def _identity(bundle: Mapping[str, Any], supplied: Any, *, project_ref: str, timeline_ref: str) -> dict[str, str]:
    raw = supplied if isinstance(supplied, Mapping) else {}
    project = raw.get("project_id") or bundle.get("project_id") or project_ref
    timeline = raw.get("timeline_id") or bundle.get("timeline_id") or timeline_ref
    base_parent = bundle.get("base_parent")
    head = raw.get("head_revision_id") or (
        base_parent.get("revision_id") if isinstance(base_parent, Mapping) else None
    )
    if not isinstance(project, str) or not project:
        raise PacingReadError("admitted pacing bundle has no project identity")
    if not isinstance(timeline, str) or not timeline:
        raise PacingReadError("admitted pacing bundle has no timeline identity")
    if not isinstance(head, str) or not head:
        raise PacingReadError("admitted pacing bundle has no pinned head revision")
    # ``project_ref``/``timeline_ref`` may be human-facing slugs while the
    # admitted identity is an opaque Runtime id.  Compare only when the host
    # supplies the corresponding reference explicitly; never reject a valid
    # id-versus-slug pair by string comparison.
    supplied_project_ref = raw.get("project_ref") or raw.get("project_slug")
    supplied_timeline_ref = raw.get("timeline_ref") or raw.get("timeline_slug")
    if supplied_project_ref is not None and str(supplied_project_ref) != str(project_ref):
        raise PacingReadError("admitted pacing bundle belongs to a different project")
    if supplied_timeline_ref is not None and str(supplied_timeline_ref) != str(timeline_ref):
        raise PacingReadError("admitted pacing bundle belongs to a different timeline")
    return {
        "project_id": project,
        "timeline_id": timeline,
        "head_revision_id": head,
    }


def _unwrap(value: Any, *, project_ref: str, timeline_ref: str) -> tuple[dict[str, Any], dict[str, str]]:
    payload = _load(value)
    if not isinstance(payload, Mapping):
        raise PacingReadError("admitted pacing input must be a JSON object")
    if isinstance(payload.get("bundle"), Mapping):
        bundle = dict(payload["bundle"])
        identity = payload.get("identity")
    elif isinstance(payload.get("authoring_bundle"), Mapping):
        bundle = dict(payload["authoring_bundle"])
        identity = payload.get("identity")
    else:
        bundle = dict(payload)
        identity = payload.get("identity")
    if not isinstance(bundle.get("placements"), list):
        raise PacingReadError("admitted pacing bundle must contain placements")
    if not isinstance(bundle.get("shots"), Mapping):
        raise PacingReadError("admitted pacing bundle must contain shots")
    return bundle, _identity(bundle, identity, project_ref=project_ref, timeline_ref=timeline_ref)


def read_bundle(
    project_ref: str,
    timeline_ref: str,
    *,
    admitted_bundle: Any = None,
    runtime_reader: Callable[[], Any] | None = None,
) -> tuple[dict[str, Any], dict[str, str]]:
    """Return an exact admitted bundle and identity; never launch a reader.

    ``runtime_reader`` is a narrow integration seam for a host that already
    owns the Runtime-bound read.  It is not a fallback and is never created by
    this module.
    """

    if admitted_bundle is not None and runtime_reader is not None:
        raise PacingReadError("provide one admitted bundle source, not two")
    if admitted_bundle is None and runtime_reader is None:
        raise PacingReadError(
            "editorial.pacing requires an admitted Runtime-bound bundle; "
            "ambient launcher reads are disabled"
        )
    value = admitted_bundle if admitted_bundle is not None else runtime_reader()
    return _unwrap(value, project_ref=project_ref, timeline_ref=timeline_ref)


__all__ = ["PacingReadError", "read_bundle"]
