from __future__ import annotations

import json
import logging
from pathlib import Path

import pytest

from astrid.core.execution import generic_host
from astrid.core.execution.generic_host import (
    CommandCleanupUnresolved,
    GenericPackHost,
    HostError,
)


class _Runtime:
    schema_digest = "sha256:" + "1" * 64

    def __init__(self, task):
        self._task = task
        self.failures = []

    def health(self):
        return {
            "status": "ok",
            "protocol": "workspace.v1",
            "schema_digest": self.schema_digest,
            "runtime_epoch": 1,
            "instance_id": "scope-cleanup-test",
            "runtime_instance_id": "scope-cleanup-test",
            "coordinator_epoch": "scope-cleanup-test",
        }

    def task(self, _task_id):
        return self._task

    def heartbeat(self, *_args, **_kwargs):
        return None

    def fail(self, *args, **kwargs):
        self.failures.append((args, kwargs))

    def settle(self, *_args, **_kwargs):
        raise AssertionError("unresolved command scope must not settle")

    def upload_object(self, *_args, **_kwargs):
        raise AssertionError("unresolved command scope must not upload")


def _write_executor(root: Path) -> None:
    root.mkdir()
    (root / "executor.yaml").write_text(
        json.dumps(
            {
                "schema_version": 1,
                "id": "test.scope",
                "name": "Scope cleanup fixture",
                "kind": "external",
                "version": "1.0",
                "command": {"argv": ["{python_exec}", "-c", "pass"]},
                "outputs": [],
                "metadata": {"resource_keys": ["cpu"]},
            }
        ),
        encoding="utf-8",
    )


def test_unresolved_command_scope_retains_attempt_and_records_receipt(tmp_path, monkeypatch):
    monkeypatch.setattr(generic_host, "process_birth_identity", lambda *_args, **_kwargs: "fixture-birth")
    _write_executor(tmp_path / "pack")
    task = {
        "task": {
            "id": "task-scope",
            "capability": "test.scope",
            "project_id": "test",
            "attempt_id": "attempt-scope",
            "fence": 1,
            "spec": {"spec": {"inputs": {}}},
        }
    }
    runtime = _Runtime(task)
    attempt_base = tmp_path / "attempts"
    host = GenericPackHost(
        pack_roots=[tmp_path],
        client=runtime,
        attempt_base=attempt_base,
    )
    host.discover()

    def unresolved(*_args, **_kwargs):
        original = generic_host.StorageEnvelopeError("original storage failure", diagnostic={"guard": "storage_envelope", "category": "scratch_overrun"})
        raise CommandCleanupUnresolved("fixture task scope unresolved", execution_error=original)

    monkeypatch.setattr(host, "_run_command_definition", unresolved)
    attempt = attempt_base / "task-scope-attempt-scope"
    with pytest.raises(HostError, match="owned cleanup incomplete"):
        host.run_task(task, lease_token="lease")

    assert attempt.is_dir()
    receipt = host.last_cleanup_receipt
    assert receipt is not None
    assert receipt["intended_disposition"] == "retained"
    assert receipt["status"] == "uncertain"
    assert "unresolved command task scope; attempt retained" in receipt["errors"]
    assert runtime.failures
    assert runtime.failures[0][1]["failure_diagnostic"]["category"] == "scratch_overrun"


def test_shutdown_signal_logs_reason_and_redacts_exception_text(caplog):
    class Host:
        def shutdown(self):
            raise RuntimeError("private-token-should-not-appear")

    with caplog.at_level(logging.WARNING, logger=generic_host.__name__):
        with pytest.raises(RuntimeError):
            generic_host._handle_host_shutdown_signal(Host(), generic_host.signal.SIGTERM)

    rendered = caplog.text
    assert "signal=15" in rendered
    assert "reason=SIGTERM" in rendered
    assert "shutdown cleanup failed" in rendered
    assert "RuntimeError" in rendered
    assert "private-token-should-not-appear" not in rendered


def test_cli_exit_failure_log_omits_exception_text(caplog):
    with caplog.at_level(logging.ERROR, logger=generic_host.__name__):
        generic_host._log_cli_exit_failure(RuntimeError("private-token-should-not-appear"))

    assert "RuntimeError" in caplog.text
    assert "private-token-should-not-appear" not in caplog.text


def test_cli_exit_failure_log_includes_only_explicit_safe_host_context(caplog, tmp_path):
    error = generic_host.HostError(
        "private-token-should-not-appear",
        safe_message=f"field=capability_matrix path={tmp_path / 'matrix.json'}",
    )
    with caplog.at_level(logging.ERROR, logger=generic_host.__name__):
        generic_host._log_cli_exit_failure(error)

    assert "field=capability_matrix" in caplog.text
    assert str(tmp_path / "matrix.json") in caplog.text
    assert "private-token-should-not-appear" not in caplog.text
