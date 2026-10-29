"""CPU tests for scripts/pod_session.py with a stub runpod CLI and a stub pod transport."""
import base64
import asyncio
import contextlib
import hashlib
import importlib.util
import io
import json
import re
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "pod_session.py"
spec = importlib.util.spec_from_file_location("pod_session_under_test", SCRIPT)
ps = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = ps
spec.loader.exec_module(ps)

REQUEST = {
    "version": 1, "operation": "generate", "source": None, "output": {"duration": 9},
    "content": {"prompt": "A short shot."}, "changes": {"video": [], "audio": []},
    "references": [{"asset": "img1", "purpose": "appearance"}, {"asset": "img2", "purpose": "style"}],
    "overrides": {},
}
TOKEN_HOLDER = {}


@pytest.fixture(scope="session")
def video(tmp_path_factory):
    if not (shutil.which("ffmpeg") and shutil.which("ffprobe")):
        pytest.skip("ffmpeg/ffprobe not available")
    path = tmp_path_factory.mktemp("video") / "final.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc=size=1024x576:rate=24:duration=9",
                    "-f", "lavfi", "-i", "sine=duration=9", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "45",
                    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "16k", "-shortest", str(path)], check=True)
    return path.read_bytes()


class FakePod:
    """Stands in for both the runpod-lifecycle CLI and the HTTPS pod transport."""

    def __init__(self, video_bytes, fail=None, fail_gpus=(), launch_result=None, list_result=None):
        self.video, self.fail, self.fail_gpus = video_bytes, fail, set(fail_gpus)
        self.launch_result, self.list_result = launch_result, list_result
        self.events, self.files, self.jobs, self.puts = [], {}, {}, {}
        self.starts = self.executes = 0
        self.terminated, self.launches = False, []
        self.http_checks = []
        self.pod = "abc123podid"

    # -- CLI -------------------------------------------------------------------------------
    def cli(self, argv, env, *, on_capacity_wait=None):
        cmd = argv[0]
        if cmd == "launch":
            self.launches.append(argv)
            self.events.append("launch")
            if self.launch_result is not None:
                return self.launch_result
            gpu = argv[argv.index("--gpu-type") + 1]
            if self.fail == "claim" or gpu in self.fail_gpus:
                if on_capacity_wait:
                    on_capacity_wait("RUNPOD_CAPACITY_EXHAUSTED\n")
                return 1, "", "error: Failed to launch pod across GPU candidates ['fake']: no longer any instances available"
            return 0, json.dumps({"pod_id": self.pod, "name": "n", "https": "x"}), ""
        if cmd == "terminate":
            self.events.append("terminate")
            self.terminated = True
            return 0, "terminated", ""
        if cmd == "list":
            self.events.append("list")
            return self.list_result if self.list_result is not None else (0, "[]", "")
        raise AssertionError(argv)

    def http_status(self, pod_id):
        self.http_checks.append(pod_id)
        return 404 if self.terminated else 200

    def factory(self, pod_id, token):
        TOKEN_HOLDER["token"] = token
        assert pod_id == self.pod
        return self

    # -- transport -------------------------------------------------------------------------
    def wait_ready(self, timeout=0):
        self.events.append("ready")

    def disconnect(self):
        self.events.append("disconnect")

    def put(self, local, remote, **kw):
        data = Path(local).read_bytes()
        self.files[remote] = data
        self.puts[remote] = data
        self.events.append("put:" + remote)

    def get(self, remote, local, **kw):
        if remote not in self.files:
            raise RuntimeError("no such remote file")
        Path(local).write_bytes(self.files[remote])

    def execute_command(self, command, timeout=600):
        self.executes += 1
        if "stat -c %s" in command:
            data = self.files[ps.BUNDLE_REMOTE]
            size = len(data) + (1 if self.fail == "bundle" else 0)
            self.events.append("exec:bundle-check")
            return 0, f"{size}\n{hashlib.sha256(data).hexdigest()}  {ps.BUNDLE_REMOTE}\n", ""
        if command.startswith("sha256sum "):
            self.events.append("exec:sha256")
            lines = []
            for path in command.split()[1:]:
                data = self.files[path]
                if self.fail == "download-sha" and path.endswith(".media"):
                    data = data + b"x"
                lines.append(f"{hashlib.sha256(data).hexdigest()}  {path}")
            return 0, "\n".join(lines) + "\n", ""
        raise AssertionError(command)

    def detached_start(self, command, *, root, job_id=None, launch_timeout=60):
        self.starts += 1
        jid = f"{self.starts:032x}"
        label, code, out = self._run(command)
        self.events.append("job:" + label)
        self.files[f"{root}/{jid}/stdout"] = out.encode()
        self.files[f"{root}/{jid}/stderr"] = b""
        self.jobs[jid] = {"label": label, "code": code, "command": command}
        return {"id": jid, "dir": f"{root}/{jid}"}

    def detached_poll(self, job_id, *, root):
        job = self.jobs[job_id]
        return {"id": job_id, "state": "exited", "exit_code": job["code"], "pid": 1}

    def _run(self, command):
        fail = self.fail
        if ps.PROGRESS_REMOTE in command:
            blob = re.search(r"printf %s (\S+) \| base64", command).group(1).strip("'")
            self.files[ps.PROGRESS_REMOTE] = base64.b64decode(blob)
            return "progress", 0, ""
        if "pod_bootstrap.sh" in command:
            return "bootstrap", 1 if fail == "bootstrap" else 0, "bootstrap ok\n"
        if "engines status" in command:
            status = {"status": "installed", "health": {"status": "healthy"}}
            if fail == "status":
                status["health"]["status"] = "unhealthy"
            return "status", 0, json.dumps(status) + "\n"
        if "engines install" in command and "--deadline 14400" in command:
            steps = [{"id": "environment:comfy", "action": "executed"}, {"id": "model:a", "action": "executed"}]
            return "install", 1 if fail == "install" else 0, json.dumps({"status": "installed", "steps": steps})
        if "engines install" in command:
            action = "executed" if fail == "rerun" else "skipped"
            return "rerun", 0, json.dumps({"status": "installed", "steps": [{"id": "s", "action": action}] * 12})
        if "action run" in command:
            name = re.search(r"--out (\S+)", command).group(1)
            which = "s0" if "smoke-request.json" in command else "clip"
            summary_path = re.search(r"> (\S+\.summary\.json)", command).group(1)
            ok = fail != which
            self.files[summary_path] = json.dumps({
                "ok": ok, "out": name, "receipt": f"{name}/{ps.FINAL_RECEIPT}", "manifest": f"{name}/run/manifest.json",
            }).encode()
            verified = "passed" if fail != "receipt" else "not_claimed"
            sha = hashlib.sha256(self.video).hexdigest()
            self.files[f"{name}/{ps.FINAL_RECEIPT}"] = json.dumps({
                "states": {"final_composition_publication": {"status": verified,
                                                              "evidence": {"publication": {"object_id": "sha256:" + sha}}}},
                "publication_contract": {"final_composition_publication": "verified" if verified == "passed" else "required"},
            }).encode()
            self.files[f"{name}/{ps.FINAL_VIDEO}"] = self.video
            self.files[f"{name}/run/manifest.json"] = b'{"manifest": true}'
            return which, 0 if ok else 1, ""
        raise AssertionError(command)


def make_args(tmp_path, extra=()):
    sources = tmp_path / "sources"
    for name in ps.BUNDLE_TREES[1:]:
        (sources / name).mkdir(parents=True, exist_ok=True)
        (sources / name / "file.txt").write_text(name)
        (sources / name / ".git").write_text("gitdir")
    agent = tmp_path / "agent"
    (agent / "scripts").mkdir(parents=True, exist_ok=True)
    (agent / "scripts" / "gpu_sanity.py").write_text("print('x')")
    (agent / "tests").mkdir(exist_ok=True)
    (agent / "tests" / "t.py").write_text("t")
    (agent / ".git").mkdir(exist_ok=True)
    (agent / ".git" / "HEAD").write_text("h")
    assets = tmp_path / "assets"
    assets.mkdir(exist_ok=True)
    for n in ("img1", "img2"):
        (assets / f"{n}.png").write_bytes(n.encode())
    (tmp_path / "request.json").write_text(json.dumps(REQUEST, indent=2))
    (tmp_path / "asset-map.json").write_text(json.dumps({n: str(assets / f"{n}.png") for n in ("img1", "img2")}))
    argv = ["--datacenters", "EUR-NO-1,EU-RO-1", "--sources-dir", str(sources), "--request", str(tmp_path / "request.json"),
            "--asset-map", str(tmp_path / "asset-map.json"), "--workdir", str(tmp_path / "work"),
            "--token-dir", str(tmp_path / "tokens"), "--poll-interval", "0", *extra]
    return ps.build_parser().parse_args(argv), agent


FakePod.cli.supports_capacity_progress = True

def run_session(tmp_path, video_bytes, *, fail=None, fail_gpus=(), budget=None, probe=None, extra=(),
                launch_result=None, list_result=None):
    args, agent = make_args(tmp_path, extra)
    pod = FakePod(video_bytes, fail=fail, fail_gpus=fail_gpus, launch_result=launch_result, list_result=list_result)
    messages = []
    kw = {"probe": probe} if probe else {}
    session = ps.Session(args, cli=pod.cli, transport_factory=pod.factory, http_status=pod.http_status,
                         budget=budget, sleep=lambda s: None, say=messages.append, agent_root=agent, **kw)
    code = session.run()
    return session, pod, code, messages


def job_commands(pod, label):
    return [j["command"] for j in pod.jobs.values() if j["label"] == label]


# ---- (a) step order -----------------------------------------------------------------------

def test_full_run_order_and_outputs(tmp_path, video, capsys):
    session, pod, code, messages = run_session(tmp_path, video)
    assert code == 0, messages
    assert [r["step"] for r in session.records] == list(ps.STEPS)
    assert all(r["result"] == "ok" for r in session.records)
    labels = [e for e in pod.events if not e.startswith("job:progress")]
    firsts = ["launch", "put:" + ps.BUNDLE_REMOTE, "exec:bundle-check", "job:bootstrap", "job:install", "job:rerun",
              "job:status", "job:s0", "job:clip", "exec:sha256", "terminate"]
    positions = [labels.index(e) for e in firsts]
    assert positions == sorted(positions) and len(set(positions)) == len(positions)
    assert pod.events.count("terminate") == 1 and pod.events[-1] != "launch"
    # progress: one job after each of the eight pod steps, readable back from the pod
    assert pod.events.count("job:progress") == 8
    remote = json.loads(pod.files[ps.PROGRESS_REMOTE])
    assert [s["step"] for s in remote["steps"]] == list(ps.STEPS[:-1])
    assert remote["jobs"] == session.budget.count  # the last progress job counts itself; release makes none
    assert (tmp_path / "work" / "pod-session-progress.remote.json").exists()
    # the counter reconciles with the agent job records the stub saw
    assert session.budget.count == pod.starts + pod.executes
    # download: verified sha, ffprobe passed, files present
    detail = session.records[-2]["detail"]
    assert detail["video"] == {"frames": 216, "rate": "24/1", "width": 1024, "height": 576, "audio": True}
    assert set(p.name for p in (tmp_path / "work" / "download").iterdir()) == {
        "verified-candidate.media", ps.FINAL_RECEIPT, "manifest.json"}
    # release verified GET 404 and list []
    assert session.records[-1]["detail"] == {"pods": [pod.pod], "get": 404, "list": []}
    assert pod.http_checks == [pod.pod] and pod.events.count("list") == 1 and session.released
    # token: fresh, never printed, removed after release
    out = capsys.readouterr()
    token = TOKEN_HOLDER["token"]
    assert len(token) >= 32 and token not in out.out + out.err + "".join(messages)
    assert not list((tmp_path / "tokens").glob("*.token"))


def test_claim_arguments_and_gpu_fallback(tmp_path, video):
    session, pod, code, _ = run_session(tmp_path, video, fail_gpus={"RTX 5090"})
    assert code == 0
    gpus = [a[a.index("--gpu-type") + 1] for a in pod.launches]
    dcs = [a[a.index("--datacenter-id") + 1] for a in pod.launches]
    assert gpus == ["RTX 5090", "RTX 5090", "RTX PRO 4500"] and dcs == ["EUR-NO-1", "EU-RO-1", "EUR-NO-1"]
    assert len(pod.launches) == 3 and "claim" not in session.state
    argv = pod.launches[-1]
    assert argv[argv.index("--allowed-cuda-versions") + 1] == "13.0,13.1,13.2,13.3"
    assert argv[argv.index("--container-disk-gb") + 1] == "120"
    assert argv[argv.index("--disk-size-gb") + 1] == "10"
    assert argv[argv.index("--image") + 1] == ps.recipe_image() and "--detach" in argv
    assert "--storage-name" not in argv


@pytest.mark.parametrize("launch_result", [
    (1, "", "error: allocation_unknown for request 'test'; reconcile the provider allocation before retrying"),
    (1, '{"status": "allocation_unknown", "reconciliation_required": true}', ""),
    (0, "{}", ""),
    (0, "not JSON", ""),
])
def test_ambiguous_claim_stops_after_one_launch_and_stays_unresolved(tmp_path, launch_result):
    session, pod, code, _ = run_session(tmp_path, b"", launch_result=launch_result)
    assert code == 1 and len(pod.launches) == 1
    assert [r["step"] for r in session.records] == ["claim", "release"]
    claim, release = session.records
    assert claim["result"] == "failed" and claim["detail"]["state"] == "allocation_unknown"
    assert claim["detail"]["reconciliation_required"] is True
    assert claim["detail"]["attempted"] == ["RTX 5090@EUR-NO-1"]
    assert "reconcile" in claim["detail"]["error"]
    assert release["result"] == "failed" and release["detail"]["status"] == "unresolved"
    assert release["detail"]["reconciliation_required"] is True
    assert release["detail"]["list"] == [] and release["detail"]["list_scope"] == "session"
    assert release["detail"]["get"] is None
    assert not session.released and not pod.terminated and not pod.http_checks
    assert "ready" not in pod.events and pod.starts == 0
    report = json.loads((tmp_path / "work" / "pod-session-progress.json").read_text())
    assert report["pod_id"] is None and report["steps"] == session.records


def test_known_no_capacity_release_reports_only_scoped_list_evidence(tmp_path):
    session, pod, code, _ = run_session(tmp_path, b"", fail="claim")
    assert code == 1 and len(pod.launches) == 4
    release = session.records[-1]
    assert release["result"] == "ok"
    assert release["detail"] == {"pods": [], "get": None, "list": [], "list_scope": "session", "list_exit_code": 0}
    assert session.released and not pod.http_checks


@pytest.mark.parametrize("wait", [0, 86400])
def test_capacity_policy_reaches_every_candidate_and_progress(tmp_path, wait):
    args, agent = make_args(tmp_path, ["--wait-capacity", str(wait)])
    pod = FakePod(b"", fail_gpus={"RTX 5090"})
    observations = []

    def cli(argv, env, *, on_capacity_wait=None):
        if argv[0] == "launch":
            # Inspect the local evidence while launch is blocked, before returning.
            progress = json.loads((Path(args.workdir) / "pod-session-progress.json").read_text())
            observations.append(progress["claim_attempt"])
        return pod.cli(argv, env, on_capacity_wait=on_capacity_wait)

    cli.supports_capacity_progress = True
    session = ps.Session(args, cli=cli, transport_factory=pod.factory, http_status=pod.http_status,
                         agent_root=agent, say=lambda _: None)
    result = session.claim()
    assert len(pod.launches) == 3 and result["wait_capacity_sec"] == wait
    assert [o["gpu"] for o in observations] == ["RTX 5090", "RTX 5090", "RTX PRO 4500"]
    assert all(o["wait_capacity_sec"] == wait and o["state"] == "launching" and o["started"] for o in observations)
    for argv in pod.launches:
        if wait:
            assert argv[argv.index("--wait-capacity") + 1] == str(wait)
        else:
            assert "--wait-capacity" not in argv


@pytest.mark.parametrize("stderr", [
    "error: HTTP 401 Unauthorized",
    "error: HTTP 403 Forbidden; no longer any instances available",
    "error: malformed request: syntax error",
    "error: GraphQL validation failed",
    "error: connection reset; no longer any instances available",
    "error: timeout waiting for response",
    "error: unrecognized failure",
    "warning: no longer any instances available\nerror: unauthorized",
])
def test_non_capacity_cli_failure_never_advances_with_wait(tmp_path, stderr):
    session, pod, code, _ = run_session(tmp_path, b"", extra=["--wait-capacity", "86400"],
                                      launch_result=(1, "", stderr))
    assert code == 1 and len(pod.launches) == 1
    assert session.records[0]["detail"]["state"] == "launch_failed"
    assert session.records[0]["detail"]["wait_capacity_sec"] == 86400
    assert session.records[-1]["result"] == "failed" and not session.released


@pytest.mark.parametrize("wait", [0, 86400])
@pytest.mark.parametrize("outcome", ["capacity", "timeout", "auth", "malformed", "ambiguous_capacity"])
def test_runner_through_lifecycle_wait_is_capacity_only(tmp_path, monkeypatch, wait, outcome):
    from runpod_lifecycle import cli, lifecycle
    from runpod_lifecycle.config import RunPodConfig
    from runpod_lifecycle.errors import ProviderCapacityUnavailable, ProviderRequestRejected
    from runpod_lifecycle.pod import Pod

    args, agent = make_args(tmp_path, ["--wait-capacity", str(wait)])
    pod = FakePod(b"")
    failures = {"capacity": ProviderCapacityUnavailable(200, "no longer any instances available"),
                "ambiguous_capacity": RuntimeError("no longer any instances available"),
                "timeout": TimeoutError("no longer any instances available; response timed out"),
                "auth": ProviderRequestRejected(401, "Unauthorized"),
                "malformed": RuntimeError("no pod ID returned")}
    create = Mock(side_effect=[failures[outcome], {"id": pod.pod}])
    sleeps = []

    async def sleep(seconds):
        sleeps.append(seconds)

    monkeypatch.setattr(lifecycle, "find_gpu_type", lambda *_: {"id": "fake"})
    monkeypatch.setattr(lifecycle, "create_pod", create)
    monkeypatch.setattr(lifecycle.asyncio, "sleep", sleep)
    monkeypatch.setattr(Pod, "wait_ready", AsyncMock())
    monkeypatch.setattr(cli, "_resolve_config", lambda parsed: RunPodConfig(
        api_key="synthetic", gpu_type=parsed.gpu_type, ram_tiers_enabled=False,
        transport="https", https_token="synthetic", storage_volumes=(), storage_name=None))
    launch_args = []

    def runner(argv, env, *, on_capacity_wait=None):
        if argv[0] != "launch":
            return pod.cli(argv, env)
        pod.launches.append(argv)
        parsed = cli.build_parser().parse_args(["--transport", "https", *argv])
        launch_args.append(parsed)
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            try:
                return asyncio.run(cli._cmd_launch(parsed)), stdout.getvalue(), ""
            except Exception as exc:
                if isinstance(exc, lifecycle._CapacityLaunchFailure):
                    on_capacity_wait("RUNPOD_CAPACITY_EXHAUSTED\n")
                return 1, stdout.getvalue(), f"error: {exc}"

    runner.supports_capacity_progress = True
    session = ps.Session(args, cli=runner, transport_factory=pod.factory, http_status=pod.http_status,
                         agent_root=agent, say=lambda _: None, sleep=lambda _: None)
    if outcome == "capacity":
        assert session.claim()["pod_id"] == pod.pod
        assert create.call_count == 2
        assert len(pod.launches) == (1 if wait else 2)
        assert sleeps == ([30] if wait else [])
    else:
        with pytest.raises(ps.SessionError, match="allocation_unknown"):
            session.claim()
        assert create.call_count == 1 and len(pod.launches) == 1 and not sleeps
        assert session.state["claim"]["reconciliation_required"] is True
    assert all(a.wait_capacity == wait for a in launch_args)


def test_ambiguity_with_wait_stays_unresolved_after_release(tmp_path):
    session, pod, code, _ = run_session(tmp_path, b"", extra=["--wait-capacity", "86400"],
                                      launch_result=(1, "", "error: allocation_unknown"))
    assert code == 1 and len(pod.launches) == 1
    assert pod.launches[0][-2:] == ["--wait-capacity", "86400"]
    assert session.records[0]["detail"]["reconciliation_required"] is True
    assert session.records[-1]["result"] == "failed" and not session.released


def test_controller_transport_exception_requires_reconciliation(tmp_path):
    args, agent = make_args(tmp_path, ["--wait-capacity", "86400"])
    pod = FakePod(b"")

    def runner(argv, env):
        if argv[0] == "launch":
            pod.launches.append(argv)
            raise ConnectionError("response lost")
        return pod.cli(argv, env)

    session = ps.Session(args, cli=runner, transport_factory=pod.factory, http_status=pod.http_status,
                         agent_root=agent, say=lambda _: None)
    assert session.run() == 1 and len(pod.launches) == 1
    assert session.records[0]["detail"]["state"] == "allocation_unknown"
    assert session.records[-1]["result"] == "failed" and not session.released


def test_exhausted_capacity_wait_can_advance(tmp_path):
    args, agent = make_args(tmp_path, ["--wait-capacity", "86400"])
    pod = FakePod(b"")

    def runner(argv, env, *, on_capacity_wait=None):
        result = pod.cli(argv, env)
        if argv[0] == "launch" and len(pod.launches) == 1:
            on_capacity_wait("RUNPOD_CAPACITY_EXHAUSTED\n")
            return 1, "", ("error: Capacity did not become available after 2881 attempts over 86400s: "
                            "Failed to launch pod across GPU candidates ['fake']: no longer any instances available")
        return result

    runner.supports_capacity_progress = True
    session = ps.Session(args, cli=runner, transport_factory=pod.factory, http_status=pod.http_status,
                         agent_root=agent, say=lambda _: None)
    assert session.claim()["pod_id"] == pod.pod and len(pod.launches) == 2
    assert all(a[-2:] == ["--wait-capacity", "86400"] for a in pod.launches)


def test_https_bootstrap_sdk_serialization_roundtrips():
    from runpod.api.mutations.pods import generate_pod_deployment_mutation
    from runpod_lifecycle.https import agent_bootstrap

    arguments = agent_bootstrap("synthetic-offline-token-not-a-credential")["docker_args"]
    mutation = generate_pod_deployment_mutation(name="fake", image_name="fake", gpu_type_id="fake",
                                               docker_args=arguments)
    literal = mutation.split("dockerArgs: ", 1)[1]
    decoded, end = json.JSONDecoder().raw_decode(literal)
    assert decoded == arguments and literal[end:].lstrip().startswith((",", "}"))


@pytest.mark.parametrize("job_list", [False, True])
def test_main_binds_controller_and_cli_to_bundle_sources(tmp_path, monkeypatch, job_list):
    args, _ = make_args(tmp_path)
    if job_list:
        args.jobs, args.request, args.asset_map = "synthetic-unopened-jobs.yaml", None, None
    sources = Path(args.sources_dir)
    (sources / "runpod-python/runpod/api/mutations").mkdir(parents=True)
    (sources / "runpod-python/runpod/__init__.py").write_text("# fake source package")
    (sources / "runpod-python/runpod/api/mutations/pods.py").write_text("# source marker")
    (sources / "runpod-lifecycle/src/runpod_lifecycle").mkdir(parents=True)
    (sources / "runpod-lifecycle/src/runpod_lifecycle/__init__.py").write_text("# fake source package")
    (sources / "runpod-lifecycle/src/runpod_lifecycle/cli.py").write_text("# source marker")
    paths = ps.controller_source_paths(sources)
    monkeypatch.setattr(ps.sys, "path", list(sys.path))
    monkeypatch.setattr(ps, "build_parser", lambda: SimpleNamespace(parse_args=lambda _: args))
    fake_cli = tmp_path / "fake-lifecycle"
    fake_cli.write_text(f"#!{sys.executable}\n" +
                        "import importlib.util, json, sys\n" +
                        "print(json.dumps({'sdk': importlib.util.find_spec('runpod').origin, " +
                        "'lifecycle': importlib.util.find_spec('runpod_lifecycle').origin, 'argv': sys.argv[1:]}))\n")
    fake_cli.chmod(0o700)
    args.runpod_cli = str(fake_cli)

    def session(*_args, **kwargs):
        def run():
            assert sys.path[:2] == list(map(str, paths))
            env = {"PYTHONPATH": "/prior-source"}
            code, stdout, stderr = kwargs["cli"](["launch"], env)
            assert code == 0, stderr
            origins = json.loads(stdout)
            assert Path(origins["sdk"]) == sources / "runpod-python/runpod/__init__.py"
            assert Path(origins["lifecycle"]) == sources / "runpod-lifecycle/src/runpod_lifecycle/__init__.py"
            assert origins["argv"] == ["--transport", "https", "launch"]
            assert env == {"PYTHONPATH": "/prior-source"}
            return 7
        return SimpleNamespace(run=run)

    selected, other = ("JobListSession", "Session") if job_list else ("Session", "JobListSession")
    monkeypatch.setattr(ps, selected, session)
    monkeypatch.setattr(ps, other, lambda *_a, **_k: pytest.fail("wrong A3 session dispatch"))
    assert ps.main([]) == 7


def test_missing_controller_source_fails_before_cli(tmp_path):
    with pytest.raises(ps.SessionError, match="controller source is missing"):
        ps.controller_source_paths(tmp_path)


def test_negative_capacity_wait_is_rejected_before_sources_or_launch(tmp_path, monkeypatch):
    args, _ = make_args(tmp_path, ["--wait-capacity", "-1"])
    monkeypatch.setattr(ps, "build_parser", lambda: SimpleNamespace(parse_args=lambda _: args))
    with pytest.raises(ps.SessionError, match="must be non-negative"):
        ps.main([])


@pytest.mark.parametrize("list_result", [
    (1, "[]", "listing failed"),
    (0, "not JSON", ""),
    (0, "{}", ""),
    (0, "null", ""),
    (0, "[{}]", ""),
    (0, '[{"id": 123}]', ""),
])
def test_no_id_release_cannot_verify_failed_or_malformed_list(tmp_path, list_result):
    session, pod, code, _ = run_session(tmp_path, b"", launch_result=(1, "", "error: allocation_unknown"),
                                         list_result=list_result)
    assert code == 1 and len(pod.launches) == 1
    release = session.records[-1]
    assert release["result"] == "failed"
    detail = release["detail"]
    assert detail["status"] == "unresolved" and detail["reconciliation_required"] is True
    assert detail["pods"] is None and detail["get"] is None and detail["list"] is None
    assert detail["list_scope"] == "session" and detail["list_error"]
    assert detail["list_exit_code"] == list_result[0]
    assert not session.released and not pod.terminated and not pod.http_checks
    report = json.loads((tmp_path / "work" / "pod-session-progress.json").read_text())
    assert report["steps"][-1] == release


@pytest.mark.parametrize("list_result, listed_ids", [
    ((1, "[]", "listing failed"), None),
    ((0, "not JSON", ""), None),
    ((0, "[{}]", ""), None),
    ((0, '[{"id": "stillrunning", "name": "unneeded metadata"}]', ""), [{"id": "stillrunning"}]),
])
def test_known_pod_release_requires_verified_empty_account_list(tmp_path, video, list_result, listed_ids):
    session, pod, code, _ = run_session(tmp_path, video, list_result=list_result)
    assert code == 1 and pod.terminated and not session.released
    release = session.records[-1]
    assert release["result"] == "failed"
    detail = release["detail"]
    assert detail["pods"] == [pod.pod] and detail["get"] == 404  # actually observed, while list remains unknown
    assert detail["list"] == listed_ids and detail["list_scope"] == "account"
    if listed_ids is None:
        assert detail["list_error"]
    assert pod.http_checks == [pod.pod] * 12
    report = json.loads((tmp_path / "work" / "pod-session-progress.json").read_text())
    assert report["steps"][-1] == release


def test_container_disk_is_sized_from_the_recipe():
    footprint = ps.recipe_footprint_gb()
    assert 60 <= footprint <= 70
    assert ps.container_disk_gb(None, footprint) == 120
    assert ps.container_disk_gb(200, footprint) == 200
    with pytest.raises(ps.SessionError):
        ps.container_disk_gb(footprint, footprint)


def test_bundle_contents_and_size_check(tmp_path, video):
    session, pod, code, _ = run_session(tmp_path, video)
    assert code == 0
    with tarfile.open(tmp_path / "work" / "pod-src.tgz") as tar:
        names = tar.getnames()
    assert {n.split("/")[0] for n in names} == set(ps.BUNDLE_TREES)
    assert "astrid-agent/scripts/gpu_sanity.py" in names
    assert not [n for n in names if "/.git" in n or n.startswith("astrid-agent/tests")]
    assert len(pod.puts[ps.BUNDLE_REMOTE]) == (tmp_path / "work" / "pod-src.tgz").stat().st_size


# ---- (b) failing steps stop the run and still release -----------------------------------------

AFTER = {
    "claim": [], "bundle": ["job:bootstrap"], "bootstrap": ["job:install"], "install": ["job:rerun"],
    "rerun": ["job:status", "job:s0"], "status": ["job:s0"], "s0": ["job:clip"], "clip": ["exec:sha256"],
    "download-sha": [], "receipt": ["exec:sha256"],
}


@pytest.mark.parametrize("fail", list(AFTER))
def test_failure_stops_and_releases(tmp_path, video, fail):
    session, pod, code, messages = run_session(tmp_path, video, fail=fail)
    assert code == 1
    failed = [r["step"] for r in session.records if r["result"] == "failed"]
    assert len(failed) == 1 and session.records[-1]["step"] == "release" and session.records[-1]["result"] == "ok"
    for event in AFTER[fail]:
        assert event not in pod.events
    if fail == "claim":
        assert not pod.terminated and "ready" not in pod.events and pod.starts == 0
    else:
        assert pod.terminated and pod.events.count("terminate") == 1
    assert (tmp_path / "work" / "pod-session-progress.json").exists()
    assert "POD SESSION FAILED" in messages[-1]


def test_download_probe_failure_releases(tmp_path, video):
    def bad_probe(path):
        return {"frames": 215, "rate": "24/1", "width": 1024, "height": 576, "audio": True}
    session, pod, code, _ = run_session(tmp_path, video, probe=bad_probe)
    assert code == 1 and pod.terminated
    assert "frames" in session.records[-2]["detail"]["error"]


def test_check_video_rejects_each_property():
    good = {"frames": 216, "rate": "24/1", "width": 1024, "height": 576, "audio": True}
    ps.check_video(good)
    for key, value in (("frames", 215), ("rate", "25/1"), ("width", 1023), ("height", 575), ("audio", False)):
        with pytest.raises(ps.SessionError):
            ps.check_video(good | {key: value})


def test_release_failure_is_a_failed_run(tmp_path, video):
    args, agent = make_args(tmp_path)
    pod = FakePod(video)
    pod.http_status = lambda pod_id: 200
    messages = []
    session = ps.Session(args, cli=pod.cli, transport_factory=pod.factory, http_status=pod.http_status,
                         sleep=lambda s: None, say=messages.append, agent_root=agent)
    assert session.run() == 1
    assert session.records[-1]["step"] == "release" and session.records[-1]["result"] == "failed"
    assert any("terminate it by hand" in m for m in messages)


def test_interrupt_still_releases(tmp_path, video):
    args, agent = make_args(tmp_path)
    pod = FakePod(video)
    original = pod.detached_start

    def boom(command, **kw):
        if "pod_bootstrap.sh" in command:
            raise KeyboardInterrupt
        return original(command, **kw)

    pod.detached_start = boom
    session = ps.Session(args, cli=pod.cli, transport_factory=pod.factory, http_status=pod.http_status,
                         sleep=lambda s: None, say=lambda m: None, agent_root=agent)
    with pytest.raises(KeyboardInterrupt):
        session.run()
    assert pod.terminated


# ---- (c) job budget ---------------------------------------------------------------------------

def test_budget_refuses_the_record_that_reaches_100():
    budget = ps.JobBudget()
    for _ in range(99):
        budget.charge("x")
    assert budget.count == 99
    with pytest.raises(ps.BudgetExceeded, match="job budget"):
        budget.charge("one too many")
    assert budget.count == 99
    assert ps.JOB_LIMIT == 100


def test_session_aborts_before_100_and_releases(tmp_path, video):
    budget = ps.JobBudget(count=96)
    session, pod, code, messages = run_session(tmp_path, video, budget=budget)
    assert code == 1 and budget.count <= 99
    assert pod.starts + pod.executes == budget.count - 96
    assert "job:install" not in pod.events and pod.terminated
    failed = [r for r in session.records if r["result"] == "failed"][0]
    assert "job budget" in failed["detail"]["error"] and "100" in failed["detail"]["error"]
    assert any("job budget" in m for m in messages)


def test_normal_run_stays_far_below_the_budget(tmp_path, video):
    session, pod, code, _ = run_session(tmp_path, video)
    assert code == 0 and session.budget.count < 30


# ---- (d) request derivation -------------------------------------------------------------------

def test_clip_and_s0_requests_are_derived(tmp_path):
    path = tmp_path / "request.json"
    path.write_text(json.dumps(REQUEST, indent=2))
    clip, smoke = ps.derive_requests(path)
    assert clip == path.read_bytes()
    clip_json, smoke_json = json.loads(clip), json.loads(smoke)
    assert clip_json["output"]["duration"] == 9 and smoke_json["output"]["duration"] == 1
    assert smoke_json | {"output": clip_json["output"]} == clip_json
    assert list(smoke_json) == list(clip_json)
    for bad in (1, 8, 9.5, "9", None):
        path.write_text(json.dumps(REQUEST | {"output": {"duration": bad}}))
        with pytest.raises(ps.SessionError):
            ps.derive_requests(path)


def test_uploaded_requests_and_asset_map(tmp_path, video):
    session, pod, code, _ = run_session(tmp_path, video)
    assert code == 0
    assert json.loads(pod.puts[f"{ps.CLIP_DIR}/request.json"])["output"]["duration"] == 9
    assert json.loads(pod.puts[f"{ps.CLIP_DIR}/smoke-request.json"])["output"]["duration"] == 1
    amap = json.loads(pod.puts[f"{ps.CLIP_DIR}/asset-map.json"])
    assert amap == {"img1": "/root/clip/inputs/img1.png", "img2": "/root/clip/inputs/img2.png"}
    assert all(path in pod.puts for path in amap.values())
    s0, clip = job_commands(pod, "s0")[0], job_commands(pod, "clip")[0]
    assert "--request /root/clip/smoke-request.json" in s0 and "--request /root/clip/request.json" in clip
    outs = [re.search(r"--out (\S+)", c).group(1) for c in (s0, clip)]
    assert outs[0] != outs[1] and all("out-" in o for o in outs)
    for command in (s0, clip):  # the action runs with the pod's own environment: only PATH gains the venv bin
        assert re.findall(r"^export .*$", command, re.M) == ["export PATH=/opt/astrid/bin:$PATH"]
        assert "ASTRID_ENGINE" not in command and "--placement local" in command
        assert "if [ -e " in command  # a fresh out dir is required


def test_asset_map_must_cover_the_request(tmp_path):
    (tmp_path / "m.json").write_text(json.dumps({"img1": str(tmp_path / "a.png")}))
    with pytest.raises(ps.SessionError, match="img2"):
        ps.remote_asset_map(tmp_path / "m.json", REQUEST)


# ---- (e) sanity command and the remote scripts ---------------------------------------------------

def test_install_sets_the_gpu_sanity_command(tmp_path, video):
    session, pod, code, _ = run_session(tmp_path, video)
    assert code == 0
    install = job_commands(pod, "install")[0]
    sanity = "/opt/astrid/bin/python /root/bundle/src/astrid-agent/scripts/gpu_sanity.py"
    assert f"export ASTRID_ENGINE_SANITY_CMD='{sanity}'" in install
    assert ("--root /root/astrid/engines/vibecomfy-h3" in install and "--deadline 14400" in install
            and "engines install vibecomfy-h3 --placement local" in install)
    # the export comes before the install command, and the script the command names ships in this repo
    assert install.index("ASTRID_ENGINE_SANITY_CMD") < install.index("astrid engines install")
    assert (SCRIPT.parent / "gpu_sanity.py").is_file()
    assert "ASTRID_ENGINE_SANITY_CMD" in job_commands(pod, "rerun")[0]
    assert "ASTRID_ENGINE_SANITY_CMD" not in job_commands(pod, "status")[0]


def test_bootstrap_job_environment(tmp_path, video):
    session, pod, code, _ = run_session(tmp_path, video)
    boot = job_commands(pod, "bootstrap")[0]
    assert "export ASTRID_BOOTSTRAP_ROOT=/root/astrid/bootstrap ASTRID_REALM_ROOT=/root/realm ASTRID_VENV=/opt/astrid" in boot
    assert boot.index("tar xzf") < boot.index("pod_bootstrap.sh") and "set -eu" in boot


def test_rerun_with_an_executed_step_fails(tmp_path, video):
    session, pod, code, _ = run_session(tmp_path, video, fail="rerun")
    assert code == 1 and "step(s) executed" in [r for r in session.records if r["result"] == "failed"][0]["detail"]["error"]


def test_parse_json_object_takes_the_last_object():
    assert ps.parse_json_object('log line\n{"a": 1}\nmore\n{"b": 2}\n') == {"b": 2}
    with pytest.raises(ps.SessionError):
        ps.parse_json_object("null\n")


def test_capacity_progress_streams_before_cli_exits_and_rejects_untrusted_fields(tmp_path):
    import threading

    args, agent = make_args(tmp_path, ["--wait-capacity", "120"])
    pod = FakePod(b"")
    release = tmp_path / "release"
    executable = tmp_path / "fake-lifecycle"
    executable.write_text(f'''#!{sys.executable}
import json, sys, time
# Large outputs verify progress is not blocked by undrained subprocess pipes.
sys.stdout.write(" " * 200000 + "\\n" + json.dumps({{"pod_id": "abc123podid"}}))
sys.stdout.flush()
sys.stderr.write("x" * 200000 + '\\nRUNPOD_CAPACITY_WAIT {{"placement_attempt":7,"retry_interval":30,"wait_seconds":120}}\\n')
sys.stderr.flush()
fd = int(sys.argv[sys.argv.index("--capacity-progress-fd") + 1])
progress = __import__("os").fdopen(fd, "w")
for line in [
    "provider error token=synthetic-secret pod=private-provider-id",
    'RUNPOD_CAPACITY_WAIT {{"placement_attempt":1,"retry_interval":30,"wait_seconds":120,"pod_id":"private-provider-id"}}',
    'RUNPOD_CAPACITY_WAIT {{"placement_attempt":"synthetic-secret","retry_interval":30,"wait_seconds":120}}',
    'RUNPOD_CAPACITY_WAIT {{"placement_attempt":true,"retry_interval":30,"wait_seconds":120}}',
    'RUNPOD_CAPACITY_WAIT {{"placement_attempt":1,"retry_interval":30,"wait_seconds":999}}',
    'RUNPOD_CAPACITY_WAIT {{"placement_attempt":1,"retry_interval":30,"wait_seconds":120}}',
]:
    print(line, file=progress, flush=True)
deadline = time.monotonic() + 15
while not __import__("pathlib").Path({str(release)!r}).exists() and time.monotonic() < deadline:
    time.sleep(0.01)
''')
    executable.chmod(0o700)
    messages, ready, result = [], threading.Event(), []

    def say(message):
        messages.append(message)
        if "capacity retry after attempt" in message:
            ready.set()

    session = ps.Session(args, cli=ps.default_cli_runner(str(executable)), transport_factory=pod.factory,
                         http_status=pod.http_status, agent_root=agent, say=say)
    def claim():
        try:
            result.append(session.claim())
        except Exception as exc:
            result.append(exc)

    thread = threading.Thread(target=claim, daemon=True)
    thread.start()
    try:
        assert ready.wait(10), "retry event was not delivered while the subprocess ran"
        assert thread.is_alive()
        progress = (Path(args.workdir) / "pod-session-progress.json").read_text()
        attempt = json.loads(progress)["claim_attempt"]
        assert (attempt["placement_attempt"], attempt["retry_interval"], attempt["wait_seconds"]) == (1, 30, 120)
        assert sum("capacity retry after attempt" in msg for msg in messages) == 1
        for forbidden in ("synthetic-secret", "private-provider-id", "provider error"):
            assert forbidden not in progress and forbidden not in "\n".join(messages)
    finally:
        release.touch()
        thread.join(10)
    assert not thread.is_alive()
    assert len(result) == 1 and isinstance(result[0], dict), result


def test_terminal_capacity_error_is_not_echoed(tmp_path):
    raw = ("error: Failed to launch pod across GPU candidates ['private-provider-id']: "
           "no longer any instances available synthetic-secret")
    _, _, _, messages = run_session(tmp_path, b"", launch_result=(1, "", raw))
    assert "private-provider-id" not in "\n".join(messages)
    assert "synthetic-secret" not in "\n".join(messages)


def test_wait_capacity_help_describes_per_placement_total():
    help_text = " ".join(ps.build_parser().format_help().split())
    assert "each GPU/datacenter placement" in help_text
    assert "total time can exceed this across placements" in help_text


@pytest.mark.parametrize("wait", [0, 120])
@pytest.mark.parametrize("typed_capacity", [False, True])
def test_only_private_capacity_exhaustion_advances_placement(tmp_path, wait, typed_capacity):
    args, agent = make_args(tmp_path, ["--wait-capacity", str(wait)])
    pod, messages = FakePod(b""), []
    count = tmp_path / "launch-count"
    executable = tmp_path / "fake-lifecycle"
    executable.write_text(f'''#!{sys.executable}
import json, os, pathlib, sys
counter = pathlib.Path({str(count)!r})
n = int(counter.read_text()) + 1 if counter.exists() else 1
counter.write_text(str(n))
fd = int(sys.argv[sys.argv.index("--capacity-progress-fd") + 1])
if n == 1:
    print("RUNPOD_CAPACITY_EXHAUSTED", file=sys.stderr)
    print("error: Failed to launch pod across GPU candidates ['private-provider-id']: no longer any instances available", file=sys.stderr)
    if {typed_capacity!r}:
        os.write(fd, b"RUNPOD_CAPACITY_EXHAUSTED\\n")
    sys.exit(1)
print(json.dumps({{"pod_id": "abc123podid"}}))
''')
    executable.chmod(0o700)
    session = ps.Session(args, cli=ps.default_cli_runner(str(executable)), transport_factory=pod.factory,
                         http_status=pod.http_status, agent_root=agent, say=messages.append)
    if typed_capacity:
        assert session.claim()["pod_id"] == pod.pod
        assert count.read_text() == "2"
    else:
        with pytest.raises(ps.SessionError, match="non-capacity"):
            session.claim()
        assert count.read_text() == "1"
    assert "private-provider-id" not in "\n".join(messages)


def test_untyped_injected_runner_cannot_advance_on_capacity_text(tmp_path):
    args, agent = make_args(tmp_path, ["--wait-capacity", "120"])
    pod = FakePod(b"")
    calls = []
    def runner(argv, env):
        calls.append(argv)
        return 1, "", "error: Failed to launch pod across GPU candidates ['fake']: no longer any instances available"
    session = ps.Session(args, cli=runner, transport_factory=pod.factory, http_status=pod.http_status,
                         agent_root=agent, say=lambda _: None)
    with pytest.raises(ps.SessionError, match="non-capacity"):
        session.claim()
    assert len(calls) == 1


def test_real_lifecycle_hook_reaches_session_before_retry(tmp_path):
    import threading

    args, agent = make_args(tmp_path, ["--wait-capacity", "120"])
    pod = FakePod(b"")
    release = tmp_path / "release"
    executable = tmp_path / "offline-lifecycle"
    executable.write_text(f'''#!{sys.executable}
import pathlib, time
from runpod_lifecycle import cli, lifecycle
from runpod_lifecycle.config import RunPodConfig
from runpod_lifecycle.errors import ProviderCapacityUnavailable
from runpod_lifecycle.pod import Pod
cli._resolve_config = lambda parsed: RunPodConfig(api_key="synthetic", gpu_type=parsed.gpu_type,
    ram_tiers_enabled=False, transport="https", https_token="synthetic", storage_volumes=(), storage_name=None)
lifecycle.find_gpu_type = lambda *args: {{"id": "fake"}}
calls = 0
def create(*args, **kwargs):
    global calls
    calls += 1
    if calls == 1:
        raise ProviderCapacityUnavailable(200, "no longer any instances available synthetic-secret private-provider-id")
    return {{"id": "abc123podid"}}
lifecycle.create_pod = create
async def sleep(seconds):
    deadline = time.monotonic() + 15
    while not pathlib.Path({str(release)!r}).exists() and time.monotonic() < deadline:
        time.sleep(0.01)
lifecycle.asyncio.sleep = sleep
async def ready(self, timeout=0):
    pass
Pod.wait_ready = ready
raise SystemExit(cli.main())
''')
    executable.chmod(0o700)
    ready, messages, result = threading.Event(), [], []
    def say(message):
        messages.append(message)
        if "capacity retry after attempt" in message:
            ready.set()
    session = ps.Session(args, cli=ps.default_cli_runner(str(executable)), transport_factory=pod.factory,
                         http_status=pod.http_status, agent_root=agent, say=say)
    def claim():
        try:
            result.append(session.claim())
        except Exception as exc:
            result.append(exc)
    thread = threading.Thread(target=claim, daemon=True)
    thread.start()
    try:
        assert ready.wait(10), result
        assert thread.is_alive()
        progress = (Path(args.workdir) / "pod-session-progress.json").read_text()
        attempt = json.loads(progress)["claim_attempt"]
        assert attempt["placement_attempt"] == 1 and attempt["wait_seconds"] == 120
        assert 0 < attempt["retry_interval"] <= 30
        for forbidden in ("synthetic-secret", "private-provider-id", "no longer any instances available"):
            assert forbidden not in progress and forbidden not in "\n".join(messages)
    finally:
        release.touch()
        thread.join(10)
    assert not thread.is_alive()
    assert len(result) == 1 and isinstance(result[0], dict), result
