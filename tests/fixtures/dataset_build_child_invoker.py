"""Fake host bridge for dataset-build child work (filter, caption and transcript stages).

The product delegates model work through ``astrid.sdk.invoke`` after registering its
inputs with a run-scoped ``ChildWorkMeter``. These helpers keep the real meter, the
real staging and the real output materialization checks, and replace only the host
bridge: ``FakeChildInvoker`` answers each child with a completed managed output whose
bytes, digest and identities satisfy the product's contract.
"""

from __future__ import annotations

import copy
import hashlib
import json
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pytest

from astrid import sdk
from astrid.packs.training.actions.dataset_build.budget import ChildWorkMeter

# Every key of DELEGATION_CEILINGS, set to a generous finite value for tests.
CHILD_METER_LIMITS: dict[str, int] = {
    "max_children": 64,
    "max_active_children": 1,
    "max_derived_objects": 256,
    "max_derived_bytes": 1024**3,
    "max_child_inputs": 256,
    "max_child_bytes": 256 * 1024**2,
}

_OUTPUT_PORTS = {"editorial.transcribe": "transcript"}


def make_child_meter() -> ChildWorkMeter:
    return ChildWorkMeter(dict(CHILD_METER_LIMITS))


@dataclass(frozen=True)
class _LocalOutput:
    output: dict[str, Any]
    filename: str


@dataclass
class _Child:
    ok: bool
    raw_result: dict[str, Any]
    kernel_task_id: str
    kernel_attempt_id: str
    kernel_run_id: str
    outputs: dict[str, Any]
    error: Any = None
    _local: dict[str, _LocalOutput] = field(default_factory=dict)

    def materialize_output(self, association_id: str) -> _LocalOutput:
        return self._local[association_id]


class FakeChildInvoker:
    """Stands in for ``sdk.invoke``; records each admitted child and answers it.

    ``respond(capability, inputs)`` returns the JSON payload the child writes as its
    single managed output. The payload is written under ``attempt_root`` so the
    product's own materialization reads and digest-checks real bytes.
    """

    def __init__(self, respond: Callable[[str, Mapping[str, Any]], Any], *, attempt_root: Path) -> None:
        self._respond = respond
        self._root = Path(attempt_root).resolve()
        self.calls: list[dict[str, Any]] = []

    def __call__(
        self,
        capability: str,
        *,
        kind: str,
        inputs: Mapping[str, Any],
        child_key: str,
        wait: bool,
        timeout_seconds: float,
        poll_seconds: float,
    ) -> _Child:
        assert kind == "action"
        assert wait is True
        index = len(self.calls)
        self.calls.append({"capability": capability, "inputs": copy.deepcopy(dict(inputs)), "child_key": child_key})
        port = _OUTPUT_PORTS.get(capability, "result")
        body = json.dumps(self._respond(capability, inputs), sort_keys=True).encode("utf-8")
        digest = "sha256:" + hashlib.sha256(body).hexdigest()
        filename = f"children/{index}/{port}.json"
        (self._root / filename).parent.mkdir(parents=True, exist_ok=True)
        (self._root / filename).write_bytes(body)
        ids = {"task_id": f"task-{index}", "attempt_id": f"attempt-{index}", "run_id": f"run-{index}"}
        row = {
            "output_port": port,
            **ids,
            "size": len(body),
            "digest": digest,
            "object_id": digest,
            "association_id": f"assoc-{index}",
            "media_type": "application/json",
        }
        local = _LocalOutput(output=row, filename=filename)
        return _Child(
            ok=True,
            raw_result={"state": "completed"},
            kernel_task_id=ids["task_id"],
            kernel_attempt_id=ids["attempt_id"],
            kernel_run_id=ids["run_id"],
            outputs={"managed_outputs": [row]},
            _local={row["association_id"]: local},
        )

    def capabilities(self) -> list[str]:
        return [str(call["capability"]) for call in self.calls]


def install_child_invoker(monkeypatch: pytest.MonkeyPatch, invoker: Callable[..., Any]) -> None:
    """Route every ``sdk.invoke`` made by the product under test to ``invoker``."""
    monkeypatch.setattr(sdk, "invoke", invoker)
