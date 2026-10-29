from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from astrid.core.contracts.errors import AstridError
from astrid.packs.pixel.actions.strip import run as strip_run


def _frame(width: int, height: int, colour: tuple[int, int, int]) -> np.ndarray:
    image = np.zeros((height, width, 4), dtype=np.uint8)
    image[..., :3] = colour
    image[..., 3] = 255
    return image


def _save(path: Path, image: np.ndarray) -> Path:
    Image.fromarray(image, mode="RGBA").save(path, format="PNG")
    return path


def test_strip_preserves_frame_order_left_to_right() -> None:
    red = _frame(4, 3, (255, 0, 0))
    blue = _frame(4, 3, (0, 0, 255))

    strip = strip_run.build_strip([red, blue])

    assert strip.shape == (3, 8, 4)
    assert tuple(strip[0, 0, :3]) == (255, 0, 0)
    assert tuple(strip[0, 4, :3]) == (0, 0, 255)


def test_strip_aligns_trimmed_frames_to_one_shared_cell() -> None:
    narrow = _frame(31, 64, (255, 0, 0))
    wide = _frame(51, 65, (0, 0, 255))

    strip = strip_run.build_strip([narrow, wide])
    aligned, placements = strip_run.align_frames([narrow, wide], align="bottom")

    assert strip.shape == (65, 102, 4)
    assert placements[0] == {"width": 31, "height": 64, "x": 10, "y": 1}
    assert aligned[0][64, 10, 3] == 255
    assert aligned[0][0, 10, 3] == 0
    assert aligned[0][64, 0, 3] == 0


def test_strip_uses_one_explicit_grid_and_palette_for_all_frames() -> None:
    red = _frame(8, 6, (255, 0, 0))
    blue = _frame(8, 6, (0, 0, 255))

    strip = strip_run.build_strip(
        [red, blue], grid_width=4, grid_height=3, palette="#000000,#FFFFFF"
    )

    colors = {tuple(int(channel) for channel in pixel[:3]) for pixel in strip.reshape(-1, 4)}
    assert strip.shape == (3, 8, 4)
    assert colors <= {(0, 0, 0), (255, 255, 255)}


def test_strip_requires_both_grid_dimensions_and_two_frames() -> None:
    red = _frame(4, 3, (255, 0, 0))
    blue = _frame(4, 3, (0, 0, 255))

    with pytest.raises(AstridError, match="grid_width and grid_height"):
        strip_run.build_strip([red, blue], grid_width=4)
    with pytest.raises(AstridError, match="at least 2 frames"):
        strip_run.build_strip([red])


def test_strip_metadata_matches_am_sprite_contract() -> None:
    metadata = strip_run.build_metadata(
        frame_w=4,
        frame_h=3,
        count=2,
        fps=6.0,
        sources=["a.png", "b.png"],
        fit="cover",
        placements=[{"width": 4, "height": 3, "x": 0, "y": 0}] * 2,
        align="bottom",
    )

    assert metadata["am_sprite_frames"] == {
        "frameWidth": 4, "frameHeight": 3, "count": 2, "fps": 6.0
    }
    assert [row["x"] for row in metadata["frames"]] == [0, 4]


def test_strip_cli_writes_image_metadata_and_result_manifest(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("ASTRID_INTERNAL_INVOCATION", "1")
    first = _save(tmp_path / "frame-a.png", _frame(4, 3, (255, 0, 0)))
    second = _save(tmp_path / "frame-b.png", _frame(4, 3, (0, 255, 0)))
    output = tmp_path / "out"

    assert strip_run.main([
        "--frame", str(first), "--frame", str(second), "--out", str(output), "--fps", "4"
    ]) == 0
    assert np.asarray(Image.open(output / "strip.png")).shape == (3, 8, 4)
    metadata = json.loads((output / "strip.json").read_text(encoding="utf-8"))
    manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
    assert metadata["am_sprite_frames"]["count"] == 2
    assert metadata["am_sprite_frames"]["fps"] == 4.0
    assert manifest["kind"] == "pixel.strip"
    assert [row["path"] for row in manifest["outputs"]] == ["strip.png", "strip.json"]
    # Exercise the documented producer-to-consumer params.frames handoff.
    from unittest import mock

    import jsonschema

    from astrid.core.element import registry as registry_module
    from astrid.core.element.registry import load_default_registry
    from astrid.core.pack.loader import load_pack_manifest

    repo_root = Path(__file__).resolve().parents[3]
    admitted = tuple(load_pack_manifest(repo_root / "astrid" / "packs" / name / "pack.yaml")
                     for name in ("astrid_motion", "rendering"))
    with mock.patch.object(registry_module, "discover_packs", return_value=admitted):
        registry = load_default_registry(project_root=tmp_path / "empty-project")

    params = {"frames": metadata["am_sprite_frames"]}
    sprite = registry.get("effects", "am-sprite")
    jsonschema.validate(params, sprite.schema)


def test_strip_v3_repeat_mapping_binds_ordered_file_frames_to_real_parser(tmp_path, monkeypatch):
    import sys
    import yaml
    from astrid.core.pack.loader import load_pack_manifest
    from astrid.core.execution.executor.actions import action_executor_definition
    from astrid.core.contracts.binding import expand_command

    root = Path(__file__).resolve().parents[3] / 'astrid' / 'packs' / 'pixel'
    declaration = yaml.safe_load((root / 'pack.yaml').read_text(encoding='utf-8'))
    admitted = load_pack_manifest(root / 'pack.yaml')
    definition = action_executor_definition(admitted, 'strip', declaration['actions']['strip'])
    first = _save(tmp_path/'red.png', _frame(4,3,(255,0,0)))
    second = _save(tmp_path/'blue.png', _frame(4,3,(0,0,255)))
    output = tmp_path/'bound-strip'
    bound = expand_command(definition.command, definition.inputs,
        {'python_exec':sys.executable,'out':str(output),
         'frame':[str(first),str(second)],'palette':['#FF0000','#0000FF']},
        definition.metadata)
    assert bound.argv[:3] == (sys.executable,'-m','astrid.packs.pixel.actions.strip.run')
    tail = list(bound.argv[3:])
    parsed = strip_run.build_parser().parse_args(tail)
    assert parsed.frame == [first,second]
    assert parsed.palette == ['#FF0000','#0000FF']
    frame_flags = [tail[index+1] for index,item in enumerate(tail) if item=='--frame']
    assert frame_flags == [str(first),str(second)]
    monkeypatch.setenv('ASTRID_INTERNAL_INVOCATION','1')
    assert strip_run.main(tail) == 0
    pixels = np.asarray(Image.open(output/'strip.png').convert('RGBA'))
    assert pixels.shape == (3,8,4)
    assert tuple(pixels[0,0,:3]) == (255,0,0)
    assert tuple(pixels[0,4,:3]) == (0,0,255)
    metadata = json.loads((output/'strip.json').read_text())
    assert metadata['am_sprite_frames']['count'] == 2
