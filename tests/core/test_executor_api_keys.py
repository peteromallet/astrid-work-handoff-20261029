"""Declared provider credentials do not gate executor subprocess launch."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from astrid.core.execution.executor import runner
from astrid.core.execution.executor.registry import load_default_registry
from astrid.core.util.credentials_scope import _PROVIDER_ENV


@pytest.mark.parametrize("provider,env_name", _PROVIDER_ENV.items())
def test_runner_omits_missing_scoped_credential(provider, env_name, tmp_path, monkeypatch):
    monkeypatch.setenv("ASTRID_ENV_FILE", str(tmp_path / "missing.env"))
    monkeypatch.delenv(env_name, raising=False)
    executor = SimpleNamespace(scoped_configs=(f"credentials.{provider}",))
    request = runner.ExecutorRunRequest(executor_id="fixture", out=tmp_path)

    assert runner._emit_scoped_config_env(executor, request) == {}


def test_runner_injects_available_key_after_missing_credential(tmp_path, monkeypatch):
    shared = tmp_path / "astrid.env"
    shared.write_text("OPENAI_API_KEY=shared-openai\n", encoding="utf-8")
    monkeypatch.setenv("ASTRID_ENV_FILE", str(shared))
    monkeypatch.delenv("FAL_KEY", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "stale-openai")
    monkeypatch.setenv("GIPHY_API_KEY", "undeclared-secret")
    executor = SimpleNamespace(
        command=None,
        scoped_configs=("credentials.fal", "credentials.openai"),
        isolation=SimpleNamespace(secrets_required=("FAL_KEY", "OPENAI_API_KEY"), env_passthrough=()),
        metadata={},
    )
    request = runner.ExecutorRunRequest(executor_id="fixture", out=tmp_path)
    monkeypatch.setattr(runner, "_project_subprocess_env", lambda *_: {})
    monkeypatch.setattr(runner, "dependency_pythonpath", lambda: ())

    env = runner._command_subprocess_env(executor, request, {})

    assert "FAL_KEY" not in env
    assert env["OPENAI_API_KEY"] == "shared-openai"
    assert "GIPHY_API_KEY" not in env


@pytest.mark.parametrize("execution", ["codex", "local"])
def test_generate_image_runner_environment_does_not_require_fal_key(execution, tmp_path, monkeypatch):
    monkeypatch.setenv("ASTRID_ENV_FILE", str(tmp_path / "missing.env"))
    monkeypatch.delenv("FAL_KEY", raising=False)
    executor = load_default_registry().get("generation.generate_image")
    assert "credentials.fal" in executor.scoped_configs
    request = runner.ExecutorRunRequest(
        executor_id=executor.id,
        out=tmp_path,
        inputs={"model": "z-image", "mode": "t2i", "execution": execution},
    )
    monkeypatch.setattr(runner, "_project_subprocess_env", lambda *_: {})
    monkeypatch.setattr(runner, "dependency_pythonpath", lambda: ())

    env = runner._command_subprocess_env(executor, request, {})

    assert "FAL_KEY" not in env


def test_managed_codex_route_reaches_spawn_without_fal_key(tmp_path, monkeypatch):
    monkeypatch.setenv("ASTRID_ENV_FILE", str(tmp_path / "missing.env"))
    monkeypatch.delenv("FAL_KEY", raising=False)
    executor = load_default_registry().get("generation.generate_image_codex")
    request = runner.ExecutorRunRequest(
        executor_id=executor.id,
        out=tmp_path,
        inputs={"model": "gpt-image-2", "mode": "t2i", "execution": "codex", "prompt": "a lighthouse"},
    )
    monkeypatch.setattr(runner, "_project_subprocess_env", lambda *_: {})
    monkeypatch.setattr(runner, "dependency_pythonpath", lambda: ())
    launched = []

    def fake_run(argv, **kwargs):
        launched.append(argv)
        assert argv[argv.index("--execution") + 1] == "codex"
        assert "FAL_KEY" not in kwargs["env"]
        # Stop at the spawn boundary without invoking a real generator.
        return SimpleNamespace(returncode=17)

    monkeypatch.setattr(runner.subprocess, "run", fake_run)

    result = runner._run_executor_inner(request, executor)

    assert len(launched) == 1
    assert result.returncode == 17
