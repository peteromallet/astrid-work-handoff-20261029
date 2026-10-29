"""Compatibility exports for the V3 pacing action.

The implementation lives in the editorial shared module so visualization
layers and the pacing action consume the same rhythm model.
"""

from astrid.packs.editorial.shared.rhythm import (
    SCHEMA,
    TARGET_RANGE,
    PacingError,
    build_rhythm,
    clip_duration,
    load_beats,
)

__all__ = [
    "SCHEMA",
    "TARGET_RANGE",
    "PacingError",
    "build_rhythm",
    "clip_duration",
    "load_beats",
]
