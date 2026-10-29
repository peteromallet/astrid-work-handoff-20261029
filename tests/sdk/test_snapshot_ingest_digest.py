"""Snapshot-by-reference renders read the ingested digest from every transport shape."""
from types import SimpleNamespace

import pytest

from astrid.sdk.exceptions import CapabilityInvocationError
from astrid.sdk.invocation import _ingested_object_digest

DIGEST = "sha256:" + "a" * 64


def test_envelope_result_and_bare_descriptor_all_yield_the_digest():
    assert _ingested_object_digest({"data": {"digest": DIGEST, "object_id": DIGEST}, "receipt": {}}) == DIGEST
    assert _ingested_object_digest(SimpleNamespace(ok=True, data={"digest": DIGEST})) == DIGEST
    assert _ingested_object_digest({"digest": DIGEST}) == DIGEST
    assert _ingested_object_digest({"data": {"object_id": DIGEST}}) == DIGEST


def test_a_rejected_ingestion_still_fails():
    with pytest.raises(CapabilityInvocationError, match="rejected"):
        _ingested_object_digest(SimpleNamespace(ok=False, data=None))
