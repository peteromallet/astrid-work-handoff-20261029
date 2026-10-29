import json
from pathlib import Path

import pytest

from runtime_protocol.asset_identity import asset_identity, same_asset_identity
from runtime_protocol.managed_render_snapshot import ShotExpansionError, expand_shot_clips

FIXTURE = json.loads((Path(__file__).parents[1] / "conformance/fixtures/asset-identity.json").read_text())


@pytest.mark.parametrize("case", FIXTURE["cases"], ids=lambda case: case["name"])
def test_shared_asset_identity_cases(case):
    assert same_asset_identity(case["a"], case["b"]) is case["same"]
    assert same_asset_identity(case["b"], case["a"]) is case["same"]


def test_identity_prefers_media_id_then_digest_then_file():
    assert asset_identity({"media_id": "m", "content_sha256": "aa", "file": "f"}) == ("media_id", "m")
    assert asset_identity({"content_sha256": "sha256:AA", "file": "f"}) == ("content_sha256", "aa")
    assert asset_identity({"file": "f"}) == ("file", "f")
    assert asset_identity({"type": "image"}) is None
    assert asset_identity("not an entry") is None



def test_identity_requires_every_shared_identity_field_to_match():
    assert same_asset_identity({"media_id": "m1", "content_sha256": "aa"}, {"content_sha256": "sha256:AA"})
    assert not same_asset_identity({"media_id": "m1", "content_sha256": "aa"}, {"content_sha256": "bb"})
    assert not same_asset_identity({"content_sha256": "aa", "file": "x.mp4"}, {"content_sha256": "aa", "file": "y.mp4"})
    assert same_asset_identity({"content_sha256": "aa", "file": "x.mp4"}, {"content_sha256": "aa"})

def _expand(parent_entry, child_entry):
    config = {"clips": [{"id": "shot", "clipType": "shot", "at": 0, "hold": 1,
                         "params": {"shot_id": "shot-1", "timeline_document_id": "child"}}]}
    return expand_shot_clips(
        config, {"assets": {"shared": parent_entry}},
        load_timeline=lambda _ref: ({"clips": [{"id": "c", "at": 0, "hold": 1, "asset": "shared"}]},
                                    {"assets": {"shared": child_entry}}),
    )


def test_render_accepts_decoration_only_drift_and_keeps_first_entry():
    first = {"media_id": "m1", "type": "video", "thumbnailUrl": "a", "handle": "h1"}
    _expanded, registry = _expand(first, {"media_id": "m1", "type": "video", "thumbnailUrl": "b", "url": "u"})
    assert registry["assets"]["shared"] == first


def test_render_still_rejects_different_content():
    with pytest.raises(ShotExpansionError, match="asset key collision"):
        _expand({"media_id": "m1"}, {"media_id": "m2"})
