"""SDK view over the shared, declarative clip look-field codec."""
from __future__ import annotations

from collections.abc import Iterator, Mapping
from typing import Any

from astrid.core.timeline import clip_fields as cf


def composition_version() -> str:
    """The immutable composition version pinned by the receiving package lock."""
    return cf._composition_version()


def render_kind(clip: Any) -> str:
    if bool(getattr(clip, "is_audio", False)):
        return "audio"
    element = str(getattr(clip, "element", "") or "")
    if element in {"media", "footage", "video", "image"}:
        return "media"
    return "element"


def _applies(name: str, audio: bool) -> bool:
    spec = cf.FIELDS.get(name)
    if spec is None:
        return False
    if name in {"fade_in", "fade_out"}:
        return audio  # visual aliases are presented as entrance/exit
    return spec.applies_to == "both" or (spec.applies_to == "audio") == bool(audio)


def _unrendered_line(clip: Any, name: str, version: str | None = None) -> str:
    kind = render_kind(clip)
    current = version or composition_version()
    status = cf.render_status(kind, name, current)
    if status == "renders":
        return ""
    label = f"{clip.address} {name}"
    if status == "unknown":
        return f"LOOK-UNRENDERED {label}: render support is unknown for {clip.element} at {current}; it is stored"
    return f"LOOK-UNRENDERED {label}: {clip.element} does not render it at composition {current}; " \
        "it is stored; it will show once supported"


class Look(Mapping[str, Any]):
    """A mapping-like view over one clip's declared fields; writes go through Clip.set_look."""

    def __init__(self, clip: Any):
        self.clip = clip

    def __getitem__(self, key: str) -> Any:
        if not _applies(key, self.clip.is_audio):
            raise KeyError(key)
        try:
            return cf.read(self.clip.data, key, fps=self.clip._tl.fps, audio=self.clip.is_audio)
        except cf.ClipFieldError:
            raise KeyError(key) from None

    def get(self, key: str, default: Any = None) -> Any:
        try:
            return self[key]
        except KeyError:
            return default

    def set(self, key: str | None = None, value: Any = None, **fields: Any) -> Any:
        if key is not None:
            fields[key] = value
        return self.clip.set_look(**fields)

    def describe(self) -> dict[str, str]:
        out: dict[str, str] = {}
        audio = self.clip.is_audio
        for name, spec in cf.FIELDS.items():
            if not _applies(name, audio):
                continue
            try:
                value = cf.read(self.clip.data, name, fps=self.clip._tl.fps, audio=audio)
            except cf.ClipFieldError:
                continue
            text = spec.from_stored(value, fps=self.clip._tl.fps)
            if text is not None:
                out[name] = text
        return out

    def __iter__(self) -> Iterator[str]:
        return iter(name for name in cf.FIELDS if _applies(name, self.clip.is_audio))

    def __len__(self) -> int:
        return sum(1 for name in cf.FIELDS if _applies(name, self.clip.is_audio))


def look_unrendered(value: Any) -> list[str]:
    """Non-blocking render notes for stored fields on a checkout."""
    if not hasattr(value, "clips") or not callable(value.clips):
        return []
    lines: list[str] = []
    version = composition_version()
    for clip in value.clips():
        for name in Look(clip):
            try:
                stored = cf.read(clip.data, name, fps=value.fps, audio=clip.is_audio)
            except cf.ClipFieldError:
                continue
            if stored is not None and cf.render_status(render_kind(clip), name, version) == "unrendered":
                lines.append(_unrendered_line(clip, name, version))
    return lines
