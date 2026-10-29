"""Adopt a selected source timeline's content into a detached target copy."""
from __future__ import annotations

import copy
import uuid
from collections.abc import Mapping

from astrid.sdk.timeline_checkout import TimelineEditError
from astrid.sdk.timeline_duplicate import _remap_values, id_map
from astrid.sdk.timeline_editing import add_authoring_shot
from astrid.sdk.timeline_intent import migrate as migrate_intent


def adopt_content(source, target):
    """Return (target identity with source content, notes), without mutating either input."""
    if source.get("project_id") and target.get("project_id") and source["project_id"] != target["project_id"]:
        raise TimelineEditError("adopt works inside one project; source and film belong to different projects")
    src_rows = sorted((dict(row) for row in source.get("placements") or []),
                      key=lambda row: (int((row.get("placement") or {}).get("start_ms") or 0), str(row.get("shot_id"))))
    dst_rows = sorted((dict(row) for row in target.get("placements") or []),
                      key=lambda row: (int((row.get("placement") or {}).get("start_ms") or 0), str(row.get("shot_id"))))
    paired = list(zip(src_rows, dst_rows))
    shot_map = {str(src["shot_id"]): str(dst["shot_id"]) for src, dst in paired}
    occ_map = {str(src["occurrence_id"]): str(dst["occurrence_id"]) for src, dst in paired}
    extra = src_rows[len(paired):]
    notes = []
    if extra:
        slug = f"{target.get('timeline_id') or 'film'}-adopt-{uuid.uuid4().hex[:6]}"
        shot_map.update(id_map([str(row["shot_id"]) for row in extra], slug))
        occ_map.update(id_map([str(row["occurrence_id"]) for row in extra], f"occ-{slug}"))
        notes.append(f"{len(extra)} shot(s) more than the film: added as new shots")
    dropped = dst_rows[len(paired):]
    if dropped:
        notes.append(f"{len(dropped)} film shot(s) with no counterpart removed")
    remap = {**shot_map, **occ_map}
    out = copy.deepcopy(dict(target))
    parent = source.get("parent") or {}
    out["parent"] = {**dict(out.get("parent") or {}), "config": copy.deepcopy(parent.get("config") or {}),
                      "registry": _remap_values(parent.get("registry") or {}, remap),
                      "clips": _remap_values(parent.get("clips") or [], remap)}
    dropped_ids = {str(row["shot_id"]) for row in dropped}
    out["shots"] = {key: value for key, value in (out.get("shots") or {}).items() if key not in dropped_ids}
    # Working-copy bases remain the target's captured head even as current
    # content adopts the source revision.
    for shot in out["shots"].values():
        if isinstance(shot, dict):
            shot.setdefault("base_payload", copy.deepcopy(shot.get("payload") or {}))
            shot.setdefault("base_internal_timeline", copy.deepcopy(shot.get("internal_timeline") or shot.get("timeline") or {}))
    out["placements"] = []
    mapping = copy.deepcopy(out.get("source_mapping") or {})
    mapping["placements"] = {}
    out["source_mapping"] = mapping
    for row in src_rows:
        old_shot, old_occ = str(row["shot_id"]), str(row["occurrence_id"])
        shot_id, occurrence_id = shot_map[old_shot], occ_map[old_occ]
        source_shot = (source.get("shots") or {}).get(old_shot)
        if not isinstance(source_shot, Mapping):
            raise TimelineEditError(f"{source.get('timeline_id')}: shot {old_shot!r} has no content")
        if shot_id not in out["shots"]:
            add_authoring_shot(out, shot_id=shot_id, occurrence_id=occurrence_id,
                               start_ms=(row.get("placement") or {}).get("start_ms", 0))
            out["placements"].pop()
        shot = out["shots"][shot_id]
        payload = copy.deepcopy(dict(source_shot.get("payload") or source_shot.get("base_payload") or {}))
        target_payload = dict(shot.get("payload") or {})
        for key in ("internal_timeline_revision_id", "text_bindings"):
            if key in target_payload:
                payload[key] = copy.deepcopy(target_payload[key])
            else:
                payload.pop(key, None)
        shot["payload"] = payload
        shot["internal_timeline"] = _remap_values(source_shot.get("internal_timeline") or {}, shot_map)
        new_row = _remap_values(row, remap)
        new_row.update(shot_id=shot_id, occurrence_id=occurrence_id)
        out["placements"].append(new_row)
        mapping["placements"][occurrence_id] = copy.deepcopy(new_row)
    migrate_intent(out)
    return out, notes


def adopt_summary(before, after, source: str) -> list[str]:
    """Describe the actual detached changes without publishing or changing identity."""
    from astrid.sdk.timeline_cuts import diff_bundles

    changes = diff_bundles(before.document(), after.document())
    lines = [f"adopted {source}: {len(changes['changes'])} clip change(s)"]
    old_words = [(word.text, word.start, word.end) for word in before.words()]
    new_words = [(word.text, word.start, word.end) for word in after.words()]
    if old_words != new_words:
        lines.append(f"  narration: {len(old_words)} → {len(new_words)} word(s)")
    for change in changes["changes"]:
        fields = ", ".join(change.get("fields") or [change["kind"]])
        lines.append(f"  {change.get('clip_id') or change.get('shot')}: {fields}")
    for change in changes.get("placement_changes") or []:
        lines.append(f"  placement: {change}")
    return lines
