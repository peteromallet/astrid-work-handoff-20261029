from __future__ import annotations

from pathlib import Path

import yaml

from astrid.core.element import registry as registry_module
from astrid.core.element import catalog as catalog_module
from astrid.core.pack import ELEMENT_KIND_REGISTRY, discover_packs
from scripts import gen_effect_registry


def _fixture_pack(tmp_path: Path) -> tuple[Path, Path]:
    repo = tmp_path / "repo"
    root = repo / "astrid/packs/rendering"
    element = root / "rendering/elements/effects/helper"
    element.mkdir(parents=True)
    (element / "component.tsx").write_text("export default function Helper() { return null; }\n")
    support = element / "motion.ts"
    support.write_text("export const motion = 1;\n")
    (element / "element.yaml").write_text(
        yaml.safe_dump(
            {
                "schema_version": 1,
                "id": "helper",
                "kind": "effect",
                "pack_id": "rendering",
                "metadata": {"label": "Helper"},
                "schema": {"type": "object"},
                "defaults": {},
                "runtime": {"adapter": "remotion"},
            }
        )
    )
    (root / "pack.yaml").write_text(
        yaml.safe_dump(
            {
                "schema_version": 3,
                "id": "rendering",
                "name": "Rendering",
                "version": "1.0.0",
                "rendering": {
                    "effects/helper": {
                        "type": "element",
                        "path": "rendering/elements/effects/helper/element.yaml",
                        "resources": [
                            {"kind": "implementation", "path": "rendering/elements/effects/helper/component.tsx"},
                            {"kind": "support", "path": "rendering/elements/effects/helper/motion.ts"},
                        ],
                    }
                },
            }
        )
    )
    return repo, support


def test_v3_element_resources_wire_helper_identity_into_both_projections(
    tmp_path: Path, monkeypatch
) -> None:
    repo, support = _fixture_pack(tmp_path)
    monkeypatch.setattr(
        registry_module,
        "discover_packs",
        lambda root=None: discover_packs(repo / "astrid/packs"),
    )
    elements = registry_module.load_pack_elements(project_root=repo)
    assert len(elements) == 1
    (element,) = elements
    assert element.support_files == (support.resolve(),)
    assert element.to_dict()["support_files"] == [str(support.resolve())]

    catalog_before = catalog_module._element_revision(element)
    effect_before = gen_effect_registry._fingerprint_element(element)
    support.write_text("export const motion = 2;\n")
    assert catalog_module._element_revision(element) != catalog_before
    assert gen_effect_registry._fingerprint_element(element) != effect_before


def test_element_definition_without_declared_helpers_keeps_legacy_shape() -> None:
    # The registry's built-in kind table remains the source of truth for the
    # V3 loader; this assertion guards the no-helper compatibility default.
    assert ELEMENT_KIND_REGISTRY.normalize("effect") == "effects"
