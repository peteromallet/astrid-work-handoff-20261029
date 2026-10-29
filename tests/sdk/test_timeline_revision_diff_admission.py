from types import SimpleNamespace
import pytest
from astrid.sdk.invocation import _prepare_timeline_revision_diff, CapabilityValidationError
from astrid.sdk.remote import RemoteTimelines


def test_revision_diff_pins_two_explicit_closures_and_refuses_foreign_side(monkeypatch):
    seen = []
    def opened(self, project, ref, *, revision_id):
        seen.append(revision_id)
        return SimpleNamespace(ok=True, data={"project_id": "p", "timeline_id": "t", "revision_id": revision_id,
            "bundle": {"project_id": "p", "timeline_id": "t", "base_parent": {"revision_id": revision_id, "content_digest": "a"*64}, "placements": [], "shots": {}}})
    monkeypatch.setattr(RemoteTimelines, "open_bundle", opened)
    import astrid.packs.rendering.actions.render.managed_timeline as managed
    monkeypatch.setattr(managed, "_project_exact_parent_head", lambda **_: ({"content_digest": "a"*64}, SimpleNamespace(config={"clips": []}, registry={"assets": {}}), {"canonical": True}))
    value = _prepare_timeline_revision_diff(project="p", timeline_ref="t", before_revision_id="old", after_revision_id="new", _client=object())
    assert seen == ["old", "new"]
    assert value["before"]["revision_id"] == "old"
    assert value["after"]["revision_id"] == "new"
    assert value["before"]["bundle_hash"] != value["after"]["bundle_hash"]
    def foreign(self, project, ref, *, revision_id):
        response = opened(self, project, ref, revision_id=revision_id)
        response.data["bundle"]["base_parent"]["revision_id"] = "foreign"
        return response
    monkeypatch.setattr(RemoteTimelines, "open_bundle", foreign)
    with pytest.raises(CapabilityValidationError, match="foreign revision"):
        _prepare_timeline_revision_diff(project="p", timeline_ref="t", before_revision_id="old", after_revision_id="new", _client=object())


def test_revision_diff_has_no_mutable_head_default():
    with pytest.raises(CapabilityValidationError, match="explicit before_revision_id"):
        _prepare_timeline_revision_diff(project="p", timeline_ref="t", before_revision_id="", after_revision_id="new", _client=object())


def test_public_diff_preparation_rejects_caller_compiled_authority(monkeypatch):
    import astrid.sdk.invocation as invocation
    with pytest.raises(CapabilityValidationError, match="host-owned"):
        invocation._validate_timeline_visualize_inputs({"view": "diff", "revision_diff": {}}, project="p", _client=object())
    monkeypatch.setattr(invocation, "_prepare_timeline_revision_diff", lambda **kwargs: {"before": kwargs["before_revision_id"], "after": kwargs["after_revision_id"]})
    value = invocation._validate_timeline_visualize_inputs({"view": "diff", "timeline_slug": "t", "before_revision_id": "old", "after_revision_id": "new"}, project="p", _client=object())
    assert value == {"mode": "revision_diff", "revision_diff": {"before": "old", "after": "new"}}


def test_element_resource_producer_binds_real_admitted_motion_without_config_mutation():
    from copy import deepcopy
    from astrid.sdk.invocation import _admitted_timeline_element_resources
    from astrid.packs.rendering.actions.timeline_visualize.motion.element_motion import modules
    config = {"clips": [{"id": "clip-a", "clipType": "am-presenter", "elementRef": {"packId": "astrid_motion", "kind": "effects", "id": "am-presenter"}}]}
    before = deepcopy(config)
    value = _admitted_timeline_element_resources(config)
    row = value["clip-a"]
    assert config == before
    assert row["element_ref"] == {"packId": "astrid_motion", "kind": "effects", "id": "am-presenter"}
    assert row["motion_resources"][0]["sha256"]
    assert "astrid_motion/effects/am-presenter" in modules(elements=[row["declaration"]])
    # Exact registered clip types use that same admitted registry owner.
    implicit = _admitted_timeline_element_resources({"clips": [{"id": "clip-b", "clipType": "am-presenter"}]})
    assert implicit["clip-b"]["element_ref"] == row["element_ref"]


def test_element_resource_producer_refuses_foreign_owner_and_path_escape(tmp_path):
    from astrid.sdk.invocation import _admitted_timeline_element_resources
    root = tmp_path / "pack"; root.mkdir()
    manifest = root / "element.yaml"; manifest.write_text("identity")
    element = SimpleNamespace(id="effect", kind="effects", root=root, metadata={"pack_id": "pack"})
    registry = SimpleNamespace(get=lambda *args, **kwargs: element)
    pack = SimpleNamespace(id="pack", root=root, rendering={"effects/effect": {"type": "element", "path": "element.yaml", "resources": [{"kind": "implementation", "path": "../motion.ts"}]}})
    config = {"clips": [{"id": "clip", "elementRef": {"packId": "pack", "kind": "effects", "id": "effect"}}]}
    with pytest.raises(CapabilityValidationError, match="outside its admitted pack"):
        _admitted_timeline_element_resources(config, registry=registry, packs=[pack])
    with pytest.raises(CapabilityValidationError, match="absent or ambiguous"):
        _admitted_timeline_element_resources(config, registry=registry, packs=[])


def test_visualize_preparation_carries_host_bound_resource_descriptor(monkeypatch):
    import astrid.sdk.invocation as invocation
    import astrid.sdk.timeline_filmstrip as filmstrip
    snapshot = {"clips": [{"id": "a", "clipType": "video"}], "metadata": {"authority": "pinned"}}
    monkeypatch.setattr(filmstrip, "prepare_filmstrip", lambda *args, **kwargs: {"mode": "input_only", "input_snapshot": snapshot})
    monkeypatch.setattr(invocation, "_admitted_timeline_element_resources", lambda config: {"a": {"element_ref": {"packId": "owned"}}})
    result = invocation._validate_timeline_visualize_inputs({"view": "motion", "mode": "inputs", "frame": 0}, project="p", _client=object())
    assert result["input_snapshot"]["metadata"]["element_resources"]["a"]["element_ref"]["packId"] == "owned"
    assert result["input_snapshot"]["metadata"]["element_resource_binding_hash"]
    assert "element_resources" not in snapshot["metadata"]
