from __future__ import annotations

import copy

import pytest

from astrid.sdk import move_occurrence_group
from astrid.sdk.timeline_editing import TimelineEditError


def _placements():
    starts = [0, 100, 300, 600]
    durations = [100, 200, 300, 400]
    return [
        {
            "occurrence_id": occurrence_id,
            "shot_id": f"shot-{occurrence_id}",
            "duration_ms": duration,
            "placement": {"start_ms": start, "track": "picture"},
            "provenance": {"opaque": occurrence_id},
        }
        for occurrence_id, start, duration in zip("abcd", starts, durations)
    ]


def test_move_occurrence_group_moves_whole_placement_and_is_idempotent():
    bundle = {"placements": _placements()}
    original = copy.deepcopy(bundle["placements"])
    expected = [original[0], original[3], original[1], original[2]]
    move_occurrence_group(bundle, "d", before_occurrence_id="b")

    assert [row["occurrence_id"] for row in bundle["placements"]] == ["a", "d", "b", "c"]
    assert [row["duration_ms"] for row in bundle["placements"]] == [100, 400, 200, 300]
    assert [row["placement"]["start_ms"] for row in bundle["placements"]] == [0, 100, 500, 700]
    for row in bundle["placements"]:
        source = next(candidate for candidate in expected if candidate["occurrence_id"] == row["occurrence_id"])
        assert row["shot_id"] == source["shot_id"]
        assert row["duration_ms"] == source["duration_ms"]
        assert row["provenance"] == source["provenance"]

    first_result = copy.deepcopy(bundle["placements"])
    move_occurrence_group(bundle, "d", before_occurrence_id="b")
    assert bundle["placements"] == first_result
    assert sum(row["duration_ms"] for row in bundle["placements"]) == sum(row["duration_ms"] for row in original)


@pytest.mark.parametrize(
    ("occurrence_id", "anchor_id", "reason"),
    [
        ("a", "a", "itself"),
        ("missing", "b", "not found"),
        ("a", "missing", "not found"),
    ],
)
def test_move_occurrence_group_rejects_invalid_targets_without_mutation(occurrence_id, anchor_id, reason):
    bundle = {"placements": _placements()}
    before = copy.deepcopy(bundle)
    with pytest.raises(TimelineEditError, match=reason):
        move_occurrence_group(bundle, occurrence_id, before_occurrence_id=anchor_id)
    assert bundle == before


def test_move_occurrence_group_preserves_gaps_and_total_end_time():
    bundle = {"placements": _placements()}
    bundle["placements"][1]["placement"]["start_ms"] = 120
    bundle["placements"][2]["placement"]["start_ms"] = 340
    bundle["placements"][3]["placement"]["start_ms"] = 680
    before = copy.deepcopy(bundle["placements"])

    move_occurrence_group(bundle, "d", before_occurrence_id="b")

    assert [row["occurrence_id"] for row in bundle["placements"]] == ["a", "d", "b", "c"]
    assert [row["placement"]["start_ms"] for row in bundle["placements"]] == [0, 120, 540, 780]
    assert bundle["placements"][-1]["placement"]["start_ms"] + bundle["placements"][-1]["duration_ms"] == \
        before[-1]["placement"]["start_ms"] + before[-1]["duration_ms"]


def test_move_occurrence_group_rejects_overlaps_or_invalid_duration_without_partial_edit():
    for mutate in (
        lambda placements: placements[2]["placement"].update(start_ms=299),
        lambda placements: placements[2].update(duration_ms=0),
    ):
        bundle = {"placements": _placements()}
        mutate(bundle["placements"])
        before = copy.deepcopy(bundle)
        with pytest.raises(TimelineEditError):
            move_occurrence_group(bundle, "d", before_occurrence_id="b")
        assert bundle == before
