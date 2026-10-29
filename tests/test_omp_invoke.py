import json
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

from astrid import omp_agent
from astrid.omp_invoke import invoke_tool

REF = {"project_id": "canonical-project", "run_id": "real-run", "task_id": "real-task",
       "capability_id": "media.clip_extract"}
REQUEST = {"project": "supplied-slug", "capability_id": "media.clip_extract",
           "kind": "executor", "inputs": {"video": "sha256:source"}}


def test_admitted_tool_returns_only_canonical_identity_and_retains_sdk_result():
    calls = []
    def invoke(capability, **kwargs):
        calls.append((capability, kwargs))
        return SimpleNamespace(ok=True, error=None, raw_result={"task": REF, "state": "ready"})
    first = invoke_tool(REQUEST, invoker=invoke)
    repeated = invoke_tool(REQUEST, invoker=invoke)
    assert first["details"]["astridTaskRefs"] == [REF] == repeated["details"]["astridTaskRefs"]
    assert calls[0][1]["wait"] is False
    assert calls[0][1]["project"] == "supplied-slug"
    assert json.loads(first["content"][0]["text"])["result"]["task"] == REF


@pytest.mark.parametrize("ok,task", [(False, REF), (True, None), (True, {**REF, "project_id": None})])
def test_rejected_or_incomplete_identity_never_creates_a_reference(ok, task):
    result = SimpleNamespace(ok=ok, error={"message": "rejected"}, raw_result={"task": task})
    assert invoke_tool(REQUEST, invoker=lambda *_a, **_kw: result)["details"]["astridTaskRefs"] == []


def test_wait_or_private_dispatch_cannot_be_supplied():
    with pytest.raises(ValueError, match="Unsupported"):
        invoke_tool({**REQUEST, "wait": True}, invoker=lambda *_a, **_kw: pytest.fail("not invoked"))


def test_default_tool_uses_bound_client_and_supported_host_bootstrap(monkeypatch):
    from astrid.sdk.client import AstridClient
    calls = []
    class BoundClient:
        def __enter__(self):
            return self
        def __exit__(self, *_args):
            pass
        def invoke_result(self, capability, **kwargs):
            calls.append((capability, kwargs))
            return SimpleNamespace(ok=True, error=None, raw_result={"task": REF})
    def open_client(**kwargs):
        assert kwargs["client_name"] == "astrid-omp"
        assert "start_pack_host" not in kwargs  # Keep the supported default True.
        return BoundClient()
    monkeypatch.setattr(AstridClient, "open_from_launcher", open_client)
    assert invoke_tool(REQUEST)["details"]["astridTaskRefs"] == [REF]
    assert calls == [("media.clip_extract", {"kind": "executor", "wait": False,
                                          "project": "supplied-slug", "inputs": REQUEST["inputs"]})]


@pytest.mark.parametrize("installed", [False, True])
def test_both_launcher_routes_load_packaged_admission_extension(monkeypatch, installed):
    monkeypatch.setenv("ASTRID_HOST_EXECUTION_PROFILE", "installed" if installed else "source")
    monkeypatch.setattr(omp_agent, "_has_named_agent_profile", lambda *_a: True)
    monkeypatch.setattr(omp_agent, "_select_omp_bin", lambda: None)
    monkeypatch.setattr(omp_agent, "_resolve_omp_bin", lambda: "/fake/omp")
    monkeypatch.setattr(omp_agent, "_find_launcher", lambda: Path("/fake/agent"))
    captured = {}
    monkeypatch.setattr(omp_agent, "replace_process", lambda argv: captured.update(argv=argv))
    omp_agent.main(["--mode=acp"])
    extension_arg = next(arg for arg in captured["argv"] if arg.startswith("--extension="))
    extension = Path(extension_arg.split("=", 1)[1])
    assert extension.is_file()
    assert "astrid_invoke" in extension.read_text()
    assert omp_agent.os.environ["ASTRID_OMP_PYTHON"] == sys.executable
    assert '"omp_extensions/*.ts"' in (Path(__file__).parents[1] / "pyproject.toml").read_text()
