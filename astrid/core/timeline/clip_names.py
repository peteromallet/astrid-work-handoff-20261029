"""The one lookup that names a clip by its media or asset, for every surface that shows a clip to a person."""
from __future__ import annotations

from collections.abc import Mapping
from typing import Any


def clip_media_name(clip: Mapping[str, Any]) -> str | None:
    """The first non-empty media or asset name a clip carries, or None when it carries none."""
    source = clip.get("source")
    candidates = [
        clip.get("media_name"), clip.get("asset_name"), clip.get("name"),
        clip.get("asset"), clip.get("asset_id"),
        source.get("name") if isinstance(source, Mapping) else None,
        source.get("key") if isinstance(source, Mapping) else source if isinstance(source, str) else None,
    ]
    return next((str(value) for value in candidates if value not in (None, "")), None)
