"""Pure music-bed edits for the receiving timeline model.

The placement API used by the union remains available. Timeline reflow also
uses the bar-aware clip planner below, which preserves the donor behavior in
the union's clip-dictionary and ``app.astrid`` shape.
"""
from __future__ import annotations

import copy
import statistics
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from astrid.core.timeline.cuts import clip_duration

FRAME = 1.0 / 30.0
_TOL = 1e-6


@dataclass(frozen=True)
class BedCut:
    pieces: list[dict]
    seam_at: float
    skipped: float
    repeated: float
    overlap: float
    on_bar: bool
    note: str


def _num(value: Any, default: float = 0.0) -> float:
    if isinstance(value, bool) or value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _r(value: float) -> float:
    return round(float(value), 6)


def _period(points: Sequence[float]) -> float | None:
    gaps = [b - a for a, b in zip(points, points[1:]) if b - a > _TOL]
    return statistics.median(gaps) if gaps else None


def _reshape(clip: dict[str, Any], *, src_from: float, src_to: float, to_form: bool) -> None:
    clip.pop("duration", None)
    if to_form:
        clip.pop("hold", None)
        clip["to"] = _r(src_to)
    else:
        clip.pop("to", None)
        clip["hold"] = _r(src_to - src_from)


def _placement_keep_end(placements: Sequence[Mapping[str, Any]] | None, new_end: float,
                       *, frame: float) -> dict[str, Any]:
    rows = [copy.deepcopy(dict(row)) for row in placements or () if isinstance(row, Mapping)]
    if not rows:
        return {"placements": rows, "changes": []}
    last = rows[-1]
    placement = last.get("placement") if isinstance(last.get("placement"), Mapping) else {}
    start = _num(placement.get("start_ms")) / 1000.0
    duration = max(0.0, float(new_end) - start)
    if duration <= 0:
        raise ValueError("music end must be after its start")
    proposed = round(duration * 1000)
    old = last.get("duration_ms")
    if old is not None and abs(float(old) - proposed) <= frame * 1000:
        return {"placements": rows, "changes": []}
    last["duration_ms"] = proposed
    return {"placements": rows, "changes": [{"shot_id": last.get("shot_id"), "duration_ms": proposed}]}


def _bed_keep_end(bed: Mapping[str, Any], *, at: float, delta: float, bars: Sequence[float],
                  beats: Sequence[float], overlap: float, min_piece: float) -> BedCut:
    at, delta = float(at), float(delta)
    bed_id = bed.get("id")

    def unchanged(note: str) -> BedCut:
        return BedCut([copy.deepcopy(dict(bed))], at, 0.0, 0.0, 0.0, False, note)

    if abs(delta) < FRAME - _TOL:
        return unchanged("music: no change to the music (the change is under one frame)")

    speed = _num(bed.get("speed"), 1.0) or 1.0
    start, source_start = _num(bed.get("at")), _num(bed.get("from"))
    length = clip_duration(bed)
    if not start < at < start + length - _TOL:
        return unchanged("music: the bed does not span the change; no change to the music")
    source_end = source_start + length * speed
    source_at = source_start + (at - start) * speed

    bar_points = sorted(float(value) for value in bars)
    beat_points = sorted(float(value) for value in beats)
    in_bed = lambda value: source_start - _TOL <= value <= source_at + _TOL
    kind, candidate = None, None
    if any(in_bed(value) for value in bar_points):
        kind, candidate = "bar", max(value for value in bar_points if in_bed(value))
    elif any(in_bed(value) for value in beat_points):
        kind, candidate = "beat", max(value for value in beat_points if in_bed(value))

    seam, seam_source, on_bar, used = at, source_at, False, None
    too_early = False
    if kind is not None:
        seam_candidate = start + (candidate - source_start) / speed
        if seam_candidate >= start + min_piece - _TOL:
            seam, seam_source, used = seam_candidate, candidate, kind
            on_bar = kind == "bar"
        else:
            too_early = True

    actual_overlap = max(0.0, min(float(overlap), 2.0 * (seam - start)))
    half = actual_overlap / 2.0
    removing = delta < 0
    magnitude = abs(delta)
    silence = repeated = skipped = 0.0
    second_start = seam - half
    if removing:
        skipped = magnitude * speed
        resume_from = seam_source + skipped - half * speed
        has_second = resume_from < source_end - _TOL
    else:
        repeat_span = magnitude * speed
        needed_from = seam_source - repeat_span - half * speed
        has_second = True
        if needed_from < source_start - _TOL:
            resume_from = source_start
            repeated = max(0.0, min(repeat_span, seam_source - source_start))
            missing = (source_start - needed_from) / speed
            second_start = seam - half + missing
            silence = max(0.0, second_start - (seam + half))
        else:
            resume_from = needed_from
            repeated = repeat_span

    to_form = bed.get("hold") is None and bed.get("to") is not None
    params = dict(bed.get("params") or {})
    base_app = copy.deepcopy(dict(bed.get("app") or {}))
    first_source_end = min(source_end, seam_source + half * speed)
    first = copy.deepcopy(dict(bed))
    _reshape(first, src_from=source_start, src_to=first_source_end, to_form=to_form)
    first["params"] = {**params, "fadeOut": _r(actual_overlap)}
    pieces = [first]

    if has_second:
        second = copy.deepcopy(dict(bed))
        second["id"] = f"{bed_id}:b"
        second["at"] = _r(second_start)
        second["from"] = _r(resume_from)
        _reshape(second, src_from=resume_from, src_to=source_end, to_form=to_form)
        second["params"] = {**params, "fadeIn": _r(actual_overlap)}
        second["app"] = {**base_app, "split_from": bed_id}
        pieces.append(second)

    period = _period(bar_points if on_bar else beat_points) if used else None
    amount = skipped if removing else repeated
    count = f" ({amount / period:.2f} {'bars' if on_bar else 'beats'})" if period else ""
    verb = f"skips {skipped:.2f} s{count}" if removing else f"repeats {repeated:.2f} s{count}"
    if used is None and too_early:
        head = f"music: cut at the change at {seam:.2f} s (the last bar or beat is under {min_piece:.2f} s into the bed)"
    elif used is None:
        head = f"music: cut at the change at {seam:.2f} s (no bar or beat before it)"
    else:
        head = f"music: cut {'on the bar' if on_bar else 'on the beat'} at {seam:.2f} s"
    if not has_second:
        tail = "the music ends early: the removed span covers its end"
    elif silence > 0.005:
        tail = f"{silence:.2f} s of silence (not enough music before the seam to repeat)"
    else:
        tail = "its ending stays on the film's end"
    note = f"{head}, {verb}, crossfade {actual_overlap:.2f} s; {tail}"
    return BedCut(pieces, _r(seam), _r(skipped), _r(repeated), _r(actual_overlap), on_bar, note)


def plan_keep_end(source: Any, new_end: float | None = None, *, frame: float = FRAME,
                  at: float | None = None, delta: float | None = None, bars: Sequence[float] = (),
                  beats: Sequence[float] = (), overlap: float = 0.25, min_piece: float = 0.5) -> Any:
    """Keep either the union placement end or a V3 music bed on its edited film end.

    The positional ``(placements, new_end)`` signature remains the union API.
    Supplying ``at`` and ``delta`` selects the donor-compatible bar-aware clip
    planner used by timeline reflow.
    """
    if at is not None or delta is not None:
        if at is None or delta is None or not isinstance(source, Mapping):
            raise TypeError("music bed planning requires a clip mapping plus at and delta")
        return _bed_keep_end(source, at=at, delta=delta, bars=bars, beats=beats,
                             overlap=overlap, min_piece=min_piece)
    if new_end is None:
        raise TypeError("placement music planning requires new_end")
    return _placement_keep_end(source, new_end, frame=frame)
