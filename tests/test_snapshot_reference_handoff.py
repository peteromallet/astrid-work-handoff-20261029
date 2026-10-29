"""Exact CAS snapshot hydration at the installed host materialization boundary."""
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from astrid.core.execution.generic_host import GenericPackHost, HostError


KEYS = ("filmstrip_snapshot", "input_snapshot", "capture_snapshot")


def _fixture(tmp_path):
    objects = {}
    refs = {}
    snapshots = {}
    for key in KEYS:
        snapshot = {"config": {"marker": key}, "registry": {"assets": {}}}
        encoded = json.dumps(snapshot, sort_keys=True, separators=(",", ":")).encode()
        digest = hashlib.sha256(encoded).hexdigest()
        objects[digest] = encoded
        refs[key + "_ref"] = {"digest": "sha256:" + digest}
        snapshots[key] = snapshot
    host = GenericPackHost(pack_roots=[tmp_path], client=SimpleNamespace(get_object=lambda digest: objects[digest]))
    spec = {"input_object_ids": ["sha256:" + digest for digest in objects],
            "spec": {"inputs": {"filmstrip_authority": json.dumps(refs)},
                     "authority_context": dict(refs)}}
    return host, spec, objects, snapshots


def test_named_snapshot_references_roundtrip_independently(tmp_path):
    host, spec, objects, snapshots = _fixture(tmp_path)
    values = host._materialize_inputs(spec, tmp_path / "attempt")
    actual = json.loads(values["filmstrip_authority"])
    assert actual == snapshots
    assert not any(key.endswith("_ref") for key in actual)
    assert json.loads(Path(values["timeline"]).read_text()) == snapshots[KEYS[0]]["config"]


@pytest.mark.parametrize("failure", ["unauthorized", "hash", "missing"])
def test_snapshot_reference_refuses_invalid_cas_before_attempt_writes(tmp_path, failure):
    host, spec, objects, snapshots = _fixture(tmp_path)
    digest = next(iter(objects))
    if failure == "unauthorized":
        spec["input_object_ids"].remove("sha256:" + digest)
        expected = "not authorized"
    elif failure == "hash":
        objects[digest] = b"{}"
        expected = "hash mismatch"
    else:
        objects.pop(digest)
        expected = "snapshot object is missing"
    attempt = tmp_path / "attempt"
    with pytest.raises(HostError, match=expected):
        host._materialize_inputs(spec, attempt)
    assert not attempt.exists()


def test_duplicate_authority_reference_must_match_admitted_context(tmp_path):
    host, spec, objects, snapshots = _fixture(tmp_path)
    authority = json.loads(spec["spec"]["inputs"]["filmstrip_authority"])
    authority["filmstrip_snapshot_ref"] = authority["capture_snapshot_ref"]
    spec["spec"]["inputs"]["filmstrip_authority"] = json.dumps(authority)
    with pytest.raises(HostError, match="differs from admitted context"):
        host._materialize_inputs(spec, tmp_path / "attempt")
