"""Plain helpers on the raw document: rows, lengths, audio splits, words, paths, serialization."""
from __future__ import annotations

import copy
import json
import re
from pathlib import Path
from typing import Any, Mapping

from astrid.sdk import timeline_intent as intent
from astrid.core.timeline.cuts import (
    clip_duration,
)

from astrid.sdk.timeline._common import (BASE_KEYS, DERIVED_PREFIX, SHOT_BASE_PREFIX, _num, _r)


def _post(value: float, expr: Mapping[str, Any]) -> Any:
    """A formula's post-steps, in order: offset_frames, min/max, step (down to a multiple)."""
    value = value + int(expr.get("offset_frames") or 0)
    if expr.get("min") is not None:
        value = max(value, expr["min"])
    if expr.get("max") is not None:
        value = min(value, expr["max"])
    step = expr.get("step")
    if step:
        value = value - (value % step)
    return value


def _first_word_lead(line: "Voice") -> float:  # noqa: F821
    """Seconds from a line's first clip start to its first word (the take's lead-in)."""
    words = line.words
    return (words[0].start - line.clips[0].start) if words else 0.0


def _row_start(row: Mapping[str, Any]) -> float:
    if row.get("at_ms") is not None:
        return _num(row.get("at_ms"))
    return _num((row.get("placement") or {}).get("start_ms"))


def _set_row_start(row: dict[str, Any], seconds: float) -> None:
    ms = int(round(seconds * 1000))
    if row.get("at_ms") is not None:
        row["at_ms"] = ms
    else:
        row.setdefault("placement", {})["start_ms"] = ms


def _has_window(clip: Mapping[str, Any]) -> bool:
    """True only when the clip really carries a source window (``_num`` never returns None, so test the keys)."""
    return clip.get("from") is not None and clip.get("to") is not None


def _set_length(clip: dict[str, Any], seconds: float) -> None:
    speed = _num(clip.get("speed"), 1.0) or 1.0
    if "hold" in clip or ("from" not in clip and "to" not in clip):
        clip["hold"] = _r(seconds * speed)
        if _has_window(clip):
            # a media clip carries both: the source window must keep following the hold (to - from == hold)
            clip["to"] = _r(_num(clip.get("from")) + seconds * speed)
    else:
        clip["to"] = _r(_num(clip.get("from")) + seconds * speed)


def _trim_end(clip: dict[str, Any], keep: float) -> None:
    _set_length(clip, keep)
    _filter_words(clip, 0.0, keep)


def _trim_front(clip: dict[str, Any], cut: float) -> None:
    speed = _num(clip.get("speed"), 1.0) or 1.0
    length = clip_duration(clip) - cut
    if "hold" in clip or ("from" not in clip and "to" not in clip):
        clip["hold"] = _r(length * speed)
        if _has_window(clip):
            clip["from"] = _r(_num(clip.get("from")) + cut * speed)
    else:
        clip["from"] = _r(_num(clip.get("from")) + cut * speed)
    _filter_words(clip, cut, cut + length, shift=-cut)


def _filter_words(clip: dict[str, Any], lo: float, hi: float, *, shift: float = 0.0) -> None:
    intent.map_timed(clip, lambda rows: [[_r(i[0] + shift), _r(i[1] + shift), *i[2:]] for i in rows if lo - 1e-6 <= i[0] < hi])


def _split_audio(clip: dict[str, Any], at: float, *, cut: float = 0.0, gap: float = 0.0, repeat: float = 0.0) -> list[dict[str, Any]]:
    """Split an audio clip ``at`` seconds in; the second part skips ``cut`` seconds of source
    (ripple delete), starts ``gap`` seconds later (ripple insert), or replays the last
    ``repeat`` seconds (ripple insert under music, so there is no hole)."""
    speed = _num(clip.get("speed"), 1.0) or 1.0
    cs = _num(clip.get("at"))
    total = clip_duration(clip)
    second = copy.deepcopy(clip)
    second["id"] = f"{clip.get('id')}~{int(round((cs + at) * 1000))}"
    _trim_end(clip, at)
    skip_source = at + cut - repeat
    if "from" in second or "to" in second:
        second["from"] = _r(_num(second.get("from")) + skip_source * speed)
    else:
        second["hold"] = _r((total - skip_source) * speed)
    second["at"] = _r(cs + at + gap)
    _filter_words(second, skip_source, total, shift=-skip_source)
    return [clip, second] if total - skip_source > 1e-3 else [clip]


def _read_words(words: Any, *, relative: bool = False) -> list[tuple[float, float, str]]:
    """Words from a words.json path, ``{"words": [...]}`` (Edge TTS ``start_s``/``end_s`` or [s, e, text]) or a list."""
    if isinstance(words, (str, Path)) and Path(words).expanduser().is_file():
        words = json.loads(Path(words).expanduser().read_text(encoding="utf-8"))
    if isinstance(words, Mapping):
        words = words.get("words") or []
    out = []
    for item in words or []:
        if isinstance(item, Mapping):
            s = item.get("start_s", item.get("start"))
            e = item.get("end_s", item.get("end"))
            t = item.get("word", item.get("text"))
        elif isinstance(item, (list, tuple)) and len(item) >= 2:
            s, e = item[0], item[1]
            t = item[2] if len(item) > 2 else None
        else:
            continue
        if isinstance(s, (int, float)) and isinstance(e, (int, float)):
            out.append((float(s), float(e), str(t) if t is not None else ""))
    return out


_PATH_RE = re.compile(r"([A-Za-z_][\w-]*)|\[(\d+)\]")


def _get_path(data: Mapping[str, Any], path: str) -> Any:
    target: Any = data
    for m in _PATH_RE.finditer(path):
        name, index = m.group(1), m.group(2)
        try:
            target = target[name] if name is not None else target[int(index)]
        except (KeyError, IndexError, TypeError):
            return None
    return target


def _set_path(data: dict[str, Any], path: str, value: Any) -> bool:
    """Set ``params.keyframes[2].frame``-style paths; returns True when the value changed."""
    parts = [(m.group(1), m.group(2)) for m in _PATH_RE.finditer(path)]
    target: Any = data
    for i, (name, index) in enumerate(parts):
        last = i == len(parts) - 1
        if name is not None:
            if last:
                changed = target.get(name) != value
                target[name] = value
                return changed
            target = target.setdefault(name, {} if parts[i + 1][0] is not None else [])
        else:
            k = int(index)
            while len(target) <= k:
                target.append(None)
            if last:
                changed = target[k] != value
                target[k] = value
                return changed
            if target[k] is None:
                target[k] = {} if parts[i + 1][0] is not None else []
            target = target[k]
    return False


def _strip_derived(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _strip_derived(v) for k, v in value.items() if not str(k).startswith(DERIVED_PREFIX)}
    if isinstance(value, list):
        return [_strip_derived(v) for v in value]
    return value


def _serialize(doc: Mapping[str, Any]) -> str:
    """Pretty JSON for content; provenance (base_*, source_mapping) and the word index on one line each.

    Two pretty-printed copies of the same clip (content and its ``base_internal_timeline``)
    make text edits ambiguous; compact provenance keeps every content line unique.
    """
    def is_compact(key: str) -> bool:
        return key in BASE_KEYS or key.startswith(SHOT_BASE_PREFIX) or key == "words"

    def emit(value: Any, indent: int, key: str | None = None) -> str:
        pad, inner = " " * indent, " " * (indent + 2)
        if key is not None and is_compact(key):
            return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        if isinstance(value, dict) and value:
            items = [f"{inner}{json.dumps(k, ensure_ascii=False)}: {emit(v, indent + 2, str(k))}" for k, v in value.items()]
            return "{\n" + ",\n".join(items) + "\n" + pad + "}"
        if isinstance(value, list) and value:
            if all(not isinstance(v, (dict, list)) for v in value):
                return json.dumps(value, ensure_ascii=False)
            items = [f"{inner}{emit(v, indent + 2)}" for v in value]
            return "[\n" + ",\n".join(items) + "\n" + pad + "]"
        return json.dumps(value, ensure_ascii=False)

    return emit(dict(doc), 0) + "\n"


def _clock(seconds: float) -> str:
    minutes, rest = divmod(max(0.0, float(seconds)), 60)
    return f"{int(minutes)}:{rest:05.2f}"


def _free_key(assets: Mapping[str, Any], key: str, entry: Mapping[str, Any]) -> str:
    """A registry key for new media: its name (``robot-native.png`` → ``robot-native``); ``-2`` if that
    name is already taken by other media."""
    base, k, n = key, key, 2
    while k in assets and (assets[k] or {}).get("media_id") != entry.get("media_id"):
        k, n = f"{base}-{n}", n + 1
    return k
