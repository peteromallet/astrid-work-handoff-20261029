from __future__ import annotations

from pathlib import Path
from unittest import mock

from astrid.core.element import registry as registry_module
from astrid.core.pack.loader import load_pack_manifest

import yaml

from astrid.core.element.registry import load_default_registry
from astrid.core.pack.validate import validate_pack

REPO_ROOT = Path(__file__).resolve().parents[3]
PACK_ROOT = REPO_ROOT / "astrid" / "packs" / "astrid_motion"
EXPECTED_EFFECTS = {
    "am-burst",
    "am-callout",
    "am-churn",
    "am-discord",
    "am-droste",
    "am-flap",
    "am-footage",
    "am-orbit",
    "am-orgchart",
    "am-pixel-wipe",
    "am-pixel-shape",
    "am-presenter",
    "am-quote",
    "am-seasons",
    "am-snap-plate",
    "am-sprite",
    "am-terminal",
    "am-tweet",
    "am-type",
    "am-ui-sketch",
}


def test_motion_pack_and_rendering_elements_validate_statically() -> None:
    errors, _warnings = validate_pack(PACK_ROOT)
    assert errors == []

    pack = yaml.safe_load((PACK_ROOT / "pack.yaml").read_text(encoding="utf-8"))
    declarations = pack["rendering"]
    assert {key.removeprefix("effects/") for key in declarations} == EXPECTED_EFFECTS

    for key, declaration in declarations.items():
        manifest_path = PACK_ROOT / declaration["path"]
        element = yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
        assert element["id"] == key.removeprefix("effects/")
        assert element["pack_id"] == "astrid_motion"
        assert (manifest_path.parent / "component.tsx").is_file()
        for resource in declaration["resources"]:
            assert (PACK_ROOT / resource["path"]).is_file()


def test_motion_effects_are_discoverable_from_the_pack_registry(tmp_path: Path) -> None:
    admitted = tuple(load_pack_manifest(REPO_ROOT / "astrid" / "packs" / name / "pack.yaml")
                     for name in ("astrid_motion", "rendering"))
    with mock.patch.object(registry_module, "discover_packs", return_value=admitted):
        registry = load_default_registry(project_root=tmp_path / "empty-project")
    discovered = {
        definition.id
        for definition in registry.list("effect", pack_id="astrid_motion")
    }
    assert discovered == EXPECTED_EFFECTS


def test_motion_helpers_use_the_v3_rendering_contract() -> None:
    shared = PACK_ROOT / "rendering" / "elements" / "_shared" / "am.tsx"
    source = shared.read_text(encoding="utf-8")
    assert "rendering/shared/element_contracts" in source
    assert "rendering/elements/_shared/contracts" not in source


def test_preview_imports_use_the_v3_rendering_element_root() -> None:
    source = (PACK_ROOT / "preview" / "src" / "Preview.tsx").read_text(encoding="utf-8")
    assert "../../rendering/elements/" in source
    assert "../../elements/" not in source
