from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
from PIL import Image, ImageFilter

from astrid.core._shared.result_manifest import harvest_staged_outputs
from astrid.core.contracts.errors import AstridError
from astrid.packs.pixel.actions import _common as px
from astrid.packs.pixel.actions.sprites import run as sprites_run


def _jittered_sheet() -> np.ndarray:
    rng = np.random.default_rng(31)
    palette = np.array([[255, 0, 255], [37, 36, 31], [236, 107, 35], [245, 220, 199]], dtype=np.uint8)
    native = palette[rng.integers(0, 4, (30, 42))]
    xwidths = rng.choice([9, 10, 11], size=42, p=[0.2, 0.6, 0.2])
    ywidths = rng.choice([9, 10, 11], size=30, p=[0.2, 0.6, 0.2])
    big = np.repeat(np.repeat(native, ywidths, axis=0), xwidths, axis=1)
    rgb = np.asarray(Image.fromarray(big).filter(ImageFilter.GaussianBlur(0.6)))
    return np.concatenate([rgb, np.full(rgb.shape[:2] + (1,), 255, dtype=np.uint8)], axis=2)


def test_jittered_soft_lattice_detected_jointly() -> None:
    found = px.detect_square_lattice(_jittered_sheet())
    assert found["detected"]
    assert abs(found["block"] - 10) / 10 <= 0.05
    assert found["axis_mismatch"] is False


def test_auto_grid_failure_gives_hint_and_recovery() -> None:
    blank = np.full((100, 120, 4), 255, dtype=np.uint8)
    with pytest.raises(AstridError) as exc:
        px.snap_image(blank, auto_grid=True)
    assert "no reliable square pixel lattice" in str(exc.value)
    assert "grid_width=" in str(exc.value) or "grid_width=" in str(exc.value.recovery_command)


def test_lossy_grid_refused_and_override_recorded() -> None:
    native = np.zeros((24, 24, 4), dtype=np.uint8)
    native[:] = (255, 0, 255, 255)
    native[4:20, 4:20] = (37, 36, 31, 255)
    native[5:19, 5:19] = (236, 107, 35, 255)
    source = np.repeat(np.repeat(native, 5, axis=0), 5, axis=1)
    with pytest.raises(AstridError, match="destroys 1-px outlines and details"):
        px.snap_image(source, grid_width=12, grid_height=12, fit="none")
    _native, _preview, report = px.snap_image(source, grid_width=12, grid_height=12,
                                              fit="none", allow_lossy=True)
    assert report["grid"]["lossy"] is True
    assert report["grid"]["allow_lossy"] is True


def test_split_merges_detached_detail_and_orders_row_major() -> None:
    rgba = np.zeros((32, 50, 4), dtype=np.uint8)
    rgba[2:12, 3:13] = (37, 36, 31, 255)
    rgba[15, 8] = (37, 36, 31, 255)  # detached detail, 3 native cells below
    rgba[3:13, 35:45] = (37, 36, 31, 255)
    rgba[22:29, 5:13] = (37, 36, 31, 255)
    pieces = px.split_sprites(rgba, merge_distance=3, padding=1)
    assert len(pieces) == 3
    assert [box[0] for _, box in pieces] == [2, 34, 4]
    assert pieces[0][0][..., 3].sum() == (100 + 1) * 255


def test_sprites_cli_writes_multi_output_manifest(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("ASTRID_INTERNAL_INVOCATION", "1")
    source = np.zeros((40, 80, 4), dtype=np.uint8)
    source[:] = (255, 0, 255, 255)
    source[8:32, 8:32] = (37, 36, 31, 255)
    source[12:28, 12:28] = (236, 107, 35, 255)
    source[8:32, 48:72] = (37, 36, 31, 255)
    source[12:28, 52:68] = (236, 107, 35, 255)
    image = tmp_path / "sheet.png"
    Image.fromarray(source).save(image)
    out = tmp_path / "out"
    assert sprites_run.main(["--image", str(image), "--out", str(out), "--block", "4",
                             "--cells", "2x1", "--scale", "8"]) == 0
    report = json.loads((out / "report.json").read_text())
    assert len(report["pieces"]) == 2
    assert len(list((out / "images").glob("sprite-*.png"))) == 2
    manifest = json.loads((out / "manifest.json").read_text())
    assert manifest["outputs"][0]["name"] == "sprites"
    harvested = harvest_staged_outputs(out, require=True)
    assert [row["name"] for row in harvested].count("sprites") == 2
    # Each piece is its own managed row (run:<id>/sprites#0, #1): the first real run published only #0.
    assert sorted(row.get("ordinal") for row in manifest["outputs"] if row["name"] == "sprites") == [0, 1]
    # The pack host uploads each staged file under a direct managed filename;
    # the first real run failed here ('sprites/00.png' is not a known namespace).
    from astrid.core.execution.generic_host import _runtime_output_filename

    staged = [str(path.relative_to(out)) for path in out.rglob("*") if path.is_file() and path.name != "manifest.json"]
    names = [_runtime_output_filename(name) for name in staged]
    assert len(set(names)) == len(names)
