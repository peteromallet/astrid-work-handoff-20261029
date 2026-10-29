"""pixel.snap grid errors name a trimmed pixel.cutout source and point at trim: false or pixel.strip."""

from __future__ import annotations

import numpy as np
import pytest

from astrid.core.contracts.errors import AstridError
from astrid.packs.pixel.actions import _common as px

MAGENTA = (255, 0, 255)
OUTLINE = (0x25, 0x24, 0x1F)


def _sprite() -> np.ndarray:
    """40x30 RGBA sprite on a magenta background, with a dark block in the middle."""
    arr = np.zeros((30, 40, 4), dtype=np.uint8)
    arr[..., :3] = MAGENTA
    arr[..., 3] = 255
    arr[5:25, 8:32, :3] = OUTLINE
    return arr


def test_has_transparent_margins_needs_all_four_edges_transparent() -> None:
    arr = np.zeros((4, 4, 4), dtype=np.uint8)
    assert px._has_transparent_margins(arr) is True
    arr[0, 2, 3] = 255  # one opaque pixel on the top edge
    assert px._has_transparent_margins(arr) is False
    assert px._has_transparent_margins(np.zeros((4, 4, 3), dtype=np.uint8)) is False


def test_snap_grid_error_names_pixel_cutout_trim_when_source_is_a_trimmed_cutout() -> None:
    # Two poses from pixel.cutout with the default trim: the trimmed frame is smaller than the grid we want.
    rgba, report = px.cutout_image(_sprite(), mode="chroma", tolerance=48, trim=True, trim_padding=2)
    trimmed_w, trimmed_h = report["output"]["width"], report["output"]["height"]
    assert (trimmed_w, trimmed_h) == (28, 24)
    with pytest.raises(AstridError) as excinfo:
        px.snap_image(rgba, grid_width=trimmed_w + 10, grid_height=trimmed_h + 10, fit="none")
    message = str(excinfo.value)
    assert f"the source was trimmed to {trimmed_w}x{trimmed_h} by pixel.cutout" in message
    assert "trim: false" in message
    assert "pixel.strip" in message


def test_snap_grid_error_without_transparent_margins_has_no_trim_hint() -> None:
    with pytest.raises(AstridError) as excinfo:
        px.snap_image(_sprite(), grid_width=400, grid_height=300, fit="none")
    message = str(excinfo.value)
    assert "larger than the 40x30 source" in message
    assert "trimmed" not in message
    assert "trim: false" not in message
