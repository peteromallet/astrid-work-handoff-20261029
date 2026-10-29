"""Detached structure edits; publication remains the existing candidate/CAS route."""
from __future__ import annotations

import copy
from collections.abc import Mapping

from astrid.sdk import timeline_intent as intent
from astrid.sdk.timeline_editing import add_authoring_shot
from astrid.sdk.timeline._common import TimelineEditError
from astrid.sdk.timeline.doc import _set_length


def one_shot(checkout, shot_id, *, name=None):
    """Flatten placed shots without changing any clip's timeline clock or pinned base."""
    rows = sorted(checkout.bundle.get("placements") or [], key=lambda row: checkout._shot_start(str(row["shot_id"])))
    if not rows:
        raise TimelineEditError("one_shot needs a placed authoring shot")
    if not isinstance(shot_id, str) or not shot_id:
        raise TimelineEditError("one_shot needs a nonempty shot id")
    if shot_id in checkout.bundle.get("shots", {}):
        raise TimelineEditError("one_shot requires a fresh shot id")
    # A flattening operation cannot silently discard occurrence transforms or
    # timeline-wide effects. Refuse unsupported envelopes before editing.
    for row in rows:
        sid = str(row["shot_id"])
        duration = float(row.get("duration_ms") or 0)
        placement = row.get("placement") or {}
        if not isinstance(placement, Mapping) or set(placement) - {"start_ms", "track"}:
            raise TimelineEditError("one_shot cannot flatten placement geometry")
        if placement.get("track", "picture") != "picture":
            raise TimelineEditError("one_shot cannot flatten alternate placement tracks")
        speed = row.get("speed", {"numerator": 1, "denominator": 1})
        if speed not in (1, {"numerator": 1, "denominator": 1}):
            raise TimelineEditError("one_shot cannot flatten placement speed")
        offset = row.get("source_offset") or {}
        if not isinstance(offset, Mapping) or set(offset) - {"start", "end"} or offset.get("start", 0) != 0 or offset.get("end", 0) not in (0, duration):
            raise TimelineEditError("one_shot cannot flatten source offsets")
        if row.get("gain", 1) != 1 or row.get("muted", False) is not False or row.get("track", "picture") != "picture":
            raise TimelineEditError("one_shot cannot flatten placement gain, mute, or track")
        allowed = {"shot_id", "occurrence_id", "placement", "duration_ms", "source_offset", "speed", "track", "gain", "muted"}
        if any(value not in (None, {}, [], False) for key, value in row.items() if key not in allowed):
            raise TimelineEditError("one_shot cannot flatten placement metadata or transforms")
        shot = checkout.bundle["shots"][sid]
        internal = shot.get("internal_timeline") or {}
        if any(value not in (None, {}, []) for key, value in internal.items() if key not in {"clips", "tracks", "registry"}):
            raise TimelineEditError("one_shot cannot flatten timeline-wide fields")
        registry = internal.get("registry") or {}
        if any(value not in (None, {}, []) for key, value in registry.items() if key != "assets"):
            raise TimelineEditError("one_shot cannot flatten registry metadata")
        payload = shot.get("payload") or {}
        if any(value not in (None, {}, []) for key, value in payload.items() if key != "name"):
            raise TimelineEditError("one_shot cannot flatten shot payload fields")
    out = copy.deepcopy(checkout.bundle)
    walls = []
    clips = []
    assets = {}
    tracks = {}
    ids = set()
    end = 0.0
    for row in rows:
        old_id = str(row["shot_id"])
        start = checkout._shot_start(old_id)
        end = max(end, start + checkout._shot_length(old_id))
        shot = checkout.bundle["shots"][old_id]
        walls.append({"name": str((shot.get("payload") or {}).get("name") or old_id), "at": start})
        internal = shot.get("internal_timeline") or {}
        for key, value in (internal.get("registry", {}).get("assets") or {}).items():
            if key in assets and assets[key] != value:
                raise TimelineEditError(f"one_shot has conflicting asset key {key!r}")
            assets[key] = copy.deepcopy(value)
        for track in internal.get("tracks") or []:
            key = str(track.get("id"))
            if key in tracks and tracks[key] != track:
                raise TimelineEditError(f"one_shot has conflicting track {key!r}")
            tracks[key] = copy.deepcopy(track)
        for clip in internal.get("clips") or []:
            value = copy.deepcopy(clip)
            key = value.get("id")
            if key in ids:
                raise TimelineEditError(f"one_shot has duplicate clip id {key!r}")
            ids.add(key)
            value["at"] = float(value.get("at") or 0) + start
            clips.append(value)
    # The maintained authoring helper creates a new candidate source mapping;
    # it grants no Runtime identity and never rewrites a published base.
    add_authoring_shot(out, shot_id=shot_id, name=name or shot_id,
                       occurrence_id=f"{shot_id}-occ", start_ms=0)
    fresh = out["shots"][shot_id]
    fresh["internal_timeline"].update(clips=clips, tracks=list(tracks.values()), registry={"assets": assets})
    placement = out["placements"][-1]
    placement["duration_ms"] = int(round(end * 1000))
    out["shots"] = {shot_id: fresh}
    out["placements"] = [placement]
    intent.migrate(out)
    checkout.bundle, checkout._mcache = out, None
    return walls


def _same_content(left, right, *, ignore_time=False):
    """Never discard differing opaque metadata while joining equivalent spans."""
    ignored = {"id", "at", "hold", "from", "to"} if ignore_time else {"id", "at", "hold"}
    a = {key: value for key, value in left.data.items() if key not in ignored | {"app"}}
    b = {key: value for key, value in right.data.items() if key not in ignored | {"app"}}
    # Only structural anchors are replaced by the merged literal end.
    def app(clip):
        data = copy.deepcopy(clip.data.get("app") or {})
        for target in (data, data.get("astrid", {})):
            if isinstance(target, dict):
                for key in ("cut", "on", "until", "for"):
                    target.pop(key, None)
        if data.get("astrid") == {}:
            data.pop("astrid", None)
        return data
    return a == b and app(left) == app(right)


def carry_across(checkout, walls):
    """Join equivalent non-picture layers touching a declared chapter wall."""
    notes = []
    epsilon = 0.5 / checkout.fps
    for wall in walls:
        at = float(wall)
        clips = list(checkout.clips())
        left = [clip for clip in clips if not clip.is_audio and clip.track != "plate" and abs(clip.end - at) <= epsilon]
        right = [clip for clip in clips if not clip.is_audio and clip.track != "plate" and abs(clip.start - at) <= epsilon]
        for a in left:
            for b in right:
                if b.data is a.data or not _same_content(a, b):
                    continue
                end = b.end
                if intent.on(a.data) is None:
                    a.enter_at(a.start)
                _set_length(a.data, end - a.start)
                intent.set_until(a.data, None)
                intent.set_for(a.data, end - a.start)
                b.remove()
                notes.append(f"{a.id} carries across {at:.2f} s")
                break
    checkout._mcache = None
    return notes


def join_music(checkout, policy="keep_end"):
    """Join only continuous equivalent music sources, preserving their audible end."""
    if policy != "keep_end":
        raise TimelineEditError("join_music supports only keep_end")
    clips = sorted((clip for clip in checkout.clips(audio=True) if clip.track == "music"), key=lambda clip: clip.start)
    removed = []
    prior = None
    epsilon = 0.5 / checkout.fps
    for clip in clips:
        continuous = (prior is not None and abs(prior.end - clip.start) <= epsilon
                      and abs(float(prior.data.get("to") or 0) - float(clip.data.get("from") or 0)) <= epsilon)
        if continuous and _same_content(prior, clip, ignore_time=True):
            duration = clip.end - prior.start
            _set_length(prior.data, duration)
            # Source trims and authored duration must describe the same span;
            # a later resolve/publish must not restore the old endpoint.
            if "to" in clip.data:
                prior.data["to"] = clip.data["to"]
            intent.set_until(prior.data, None)
            intent.set_for(prior.data, duration)
            removed.append(clip.id)
            clip.remove()
        else:
            prior = clip
    checkout._mcache = None
    return removed


def label_chapters(checkout, labels):
    """Bind chapter names to the exact authored cut at each wall."""
    table = []
    epsilon = 0.5 / checkout.fps
    for label in labels:
        at = float(label["at"])
        candidates = [clip for clip in checkout.clips() if clip.track == "plate"
                      and abs(clip.start - at) <= epsilon and intent.cut_of(clip.data)]
        if len(candidates) != 1:
            raise TimelineEditError(f"chapter at {at:g} does not identify one picture cut")
        table.append({"name": str(label["name"]), "from": intent.cut_of(candidates[0].data)})
    intent.set_chapters(checkout.bundle, table)
    return table
