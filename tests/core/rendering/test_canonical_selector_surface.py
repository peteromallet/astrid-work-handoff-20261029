from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from astrid.core.rendering.errors import RendererUnsupportedError
from astrid.core.rendering.registry import load_default_registries
from astrid.core.rendering.service import _select_capability


@pytest.mark.parametrize("selector", ["remotion", "ffmpeg", "threejs", "hybrid"])
def test_shorthand_render_selectors_fail_with_canonical_recovery(selector: str) -> None:
    with pytest.raises(RendererUnsupportedError) as caught:
        _select_capability(selector)
    error = caught.value.error
    assert error.kind == "unsupported"
    assert selector in error.details["selector"]
    assert error.recovery_command == (
        "select one canonical renderer id: rendering.ffmpeg, "
        "rendering.remotion, rendering.threejs"
    )


def test_builtin_rendering_registry_has_no_planner_reachability() -> None:
    renderers, planners, finalizers = load_default_registries()
    assert {candidate.id for candidate in renderers.list()} == {
        "rendering.ffmpeg",
        "rendering.remotion",
        "rendering.threejs",
    }
    assert planners.list() == ()
    assert {candidate.id for candidate in finalizers.list()} == {
        "rendering.ffmpeg-finalizer",
        "rendering.ffmpeg-compositor",
    }


def test_rendering_pack_manifest_has_only_canonical_renderer_sources() -> None:
    text = Path("astrid/packs/rendering/pack.yaml").read_text(encoding="utf-8")
    assert "planners/" not in text
    assert "legacy_hybrid" not in text
    assert "threejs_hybrid" not in text
    assert "layer_stack" not in text


def test_render_facade_exposes_only_selector_boundary() -> None:
    pack = yaml.safe_load(
        Path("astrid/packs/rendering/pack.yaml").read_text(encoding="utf-8")
    )
    inputs = {item["name"]: item for item in pack["actions"]["render"]["inputs"]}
    assert inputs["selector"]["type"] == "string"
    assert "engine" not in inputs
    assert "backend" not in inputs
    facade = Path(
        "astrid/packs/rendering/actions/render/run.py"
    ).read_text(encoding="utf-8")
    assert '"--selector"' in facade
    assert "--engine" not in facade
    assert "--backend\"" not in facade
