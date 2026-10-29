"""Timeline editing fixture shared with SDK-level adoption regressions."""
from __future__ import annotations

import copy

from tests.sdk.test_timeline_checkout import bundle as _checkout_bundle


def bundle():
    """Return an authoring-shaped fixture with the captured base envelopes."""
    value = _checkout_bundle()
    for shot in value["shots"].values():
        shot["base_payload"] = copy.deepcopy(shot.get("payload") or {})
        shot["base_internal_timeline"] = copy.deepcopy(shot.get("internal_timeline") or {})
    value["source_mapping"] = {"shots": {}, "placements": {}}
    for row in value["placements"]:
        sid = str(row["shot_id"])
        occurrence = str(row["occurrence_id"])
        value["source_mapping"]["shots"][sid] = {
            "shot_id": sid,
            "revision_id": f"rev-{sid}",
            "content_digest": "sha256:" + "0" * 64,
            "internal_timeline_id": sid,
            "internal_timeline_revision_id": f"tl-{sid}",
            "internal_timeline_content_digest": "sha256:" + "0" * 64,
            "item_id_map": {},
        }
        value["source_mapping"]["placements"][occurrence] = copy.deepcopy(row)
    return value
