from __future__ import annotations

import asyncio
import copy
import signal
import threading
from types import SimpleNamespace

import pytest

from astrid.core.execution.vibecomfy_engine_adapter import (
    CustodyProcessProxy, EngineAdapterError, SelectedListenerLauncher,
    install_selected_listener_boundary,
    EngineControlClient,
)


class Process:
    pid = 321
    returncode = None
    stdin = stdout = stderr = None

    async def wait(self):
        self.returncode = 0
        return 0

    async def communicate(self, input=None):
        return b"out", b"err"

    def kill(self):
        pytest.fail("numeric process kill bypass")

    terminate = send_signal = kill


def test_proxy_keeps_observations_and_routes_each_signal_to_host():
    process, calls = Process(), []
    proxy = CustodyProcessProxy(process, lambda pid, sig: calls.append((pid, sig)))
    proxy.terminate()
    proxy.kill()
    assert calls == [(321, signal.SIGTERM), (321, signal.SIGKILL)]
    assert proxy.pid == 321
    assert asyncio.run(proxy.communicate()) == (b"out", b"err")
    assert asyncio.run(proxy.wait()) == 0
    assert proxy.returncode == 0


def launcher(*, register_error=None):
    calls = []

    async def launch(*argv, **kwargs):
        calls.append((argv, kwargs))
        return Process()

    async def register(process):
        if register_error:
            raise register_error

    return SelectedListenerLauncher(argv=("/selected/python", "-m", "comfy.cmd.main", "serve"),
                                    cwd="/selected/root", launch=launch, register=register,
                                    signal_owner=lambda *_: None), calls


def test_same_launch_cannot_spawn_twice_and_preserves_inherited_options():
    selected, calls = launcher()
    kwargs = {"cwd": "/selected/root", "env": {"SELECTED": "yes"}, "stdout": object(), "stderr": object()}
    asyncio.run(selected(*selected.argv, **kwargs))
    assert calls == [(selected.argv, kwargs)]
    with pytest.raises(EngineAdapterError, match="consumed"):
        asyncio.run(selected(*selected.argv, **kwargs))
    assert len(calls) == 1


@pytest.mark.parametrize("change", ["argv", "cwd", "session", "extra"])
def test_unselected_launch_never_spawns(change):
    selected, calls = launcher()
    argv, kwargs = selected.argv, {"cwd": selected.cwd}
    if change == "argv":
        argv = ("/unselected/python", *argv[1:])
    elif change == "cwd":
        kwargs["cwd"] = "/unselected/root"
    elif change == "session":
        kwargs["start_new_session"] = True
    else:
        kwargs["shell"] = True
    with pytest.raises(EngineAdapterError):
        asyncio.run(selected(*argv, **kwargs))
    assert not calls


def test_registration_failure_retains_process_obligation_and_initiating_error():
    error = RuntimeError("registration failed")
    selected, calls = launcher(register_error=error)
    with pytest.raises(RuntimeError) as raised:
        asyncio.run(selected(*selected.argv, cwd=selected.cwd))
    assert raised.value is error
    assert selected.error is error
    assert selected.process.pid == 321
    with pytest.raises(EngineAdapterError, match="consumed"):
        asyncio.run(selected(*selected.argv, cwd=selected.cwd))
    assert len(calls) == 1


def test_missing_selected_source_fails_before_mutating_global_asyncio(tmp_path):
    selected, _ = launcher()
    module = SimpleNamespace(__file__=str(tmp_path / "absent.py"), asyncio=asyncio)
    with pytest.raises(EngineAdapterError, match="unavailable"):
        install_selected_listener_boundary(module, selected, expected_source_hash="sha256:missing",
                                           expected_spawn_hash="sha256:missing", expected_cleanup_hashes={})
    assert module.asyncio is asyncio


def control_reference():
    return {"version": "runtime.role-custody-reference/v1", "scope_root": "/private/custody",
            "role": "engine_listener", "generation": 1,
            "target": {"pid": 321, "uid": 501, "birth_id": "listener-birth",
                       "audit_token_sha256": "sha256:" + "a" * 64, "audit_token_pidversion": 10}}


ACK_MUTATIONS = [
    ("version", "runtime.local-execution-engine-control/v1"), ("status", "exit_recorded"),
    ("operation_id", "foreign"), ("channel_id", "foreign"), ("owner_epoch", "foreign"),
    ("role", "engine"), ("generation", 1.0), ("signal", True), ("target.pid", 321.0),
    ("current_reference.version", "other"), ("current_reference.scope_root", "/foreign"),
    ("current_reference.role", "engine"), ("current_reference.generation", 2),
    ("current_reference.generation", True), ("current_reference.target.pid", 322),
    ("current_reference.target.pid", 321.0), ("current_reference.target.uid", 502),
    ("current_reference.target.uid", 501.0), ("current_reference.target.birth_id", "new-birth"),
    ("current_reference.target.audit_token_sha256", "sha256:bad"),
    ("current_reference.target.audit_token_pidversion", True),
    ("current_reference.target.audit_token_pidversion", 0),
    ("current_reference.target.audit_token_pidversion", 11),
]


def mutate_path(value, path, replacement):
    keys = path.split(".")
    for key in keys[:-1]:
        value = value[key]
    value[keys[-1]] = replacement


def control_client(*, disk=None, reply_mutation=None, failure=None):
    from astrid.core.execution import custody_broker as custody
    sent, reads, received = [], [], []
    pin = control_reference()

    def reader():
        reads.append(True)
        if failure == "reader":
            raise OSError("read failed")
        return copy.deepcopy(disk or pin)

    def send(channel, request):
        sent.append(copy.deepcopy(request))
        if failure == "send":
            raise OSError("partial send")

    def receive(channel):
        received.append(True)
        if isinstance(failure, BaseException):
            raise failure
        request = sent[-1]
        reply = {**{k: v for k, v in request.items() if k != "command"},
                 "status": "signaled" if "signal" in request else "exit_recorded"}
        if "signal" in request:
            reply["current_reference"] = {**pin, "generation": request["generation"],
                                          "target": copy.deepcopy(request["target"])}
        if reply_mutation is not None:
            reply_mutation(reply)
        return reply

    consumer = SimpleNamespace(ROLE_REFERENCE_VERSION=custody.ROLE_REFERENCE_VERSION,
                               ENGINE_CONTROL_VERSION=custody.ENGINE_CONTROL_VERSION,
                               ENGINE_CONTROL_SIGNAL_V2=custody.ENGINE_CONTROL_SIGNAL_V2,
                               _canonical=custody._canonical, _send_frame=send, _read_frame=receive)
    client = EngineControlClient(channel=object(), custody=consumer, reference_reader=reader,
                                 custody_scope=pin["scope_root"], operation_id="operation",
                                 channel_id="channel", owner_epoch="epoch")
    client.pin_reference(pin)
    return client, sent, reads, received


def test_control_first_read_accepts_ready_token_then_uses_only_ack_reference():
    ready = control_reference()
    ready["target"].update(audit_token_sha256="sha256:" + "b" * 64, audit_token_pidversion=11)

    def refresh(reply):
        reply["current_reference"]["target"].update(audit_token_sha256="sha256:" + "c" * 64,
                                                    audit_token_pidversion=12)

    client, sent, reads, _ = control_client(disk=ready, reply_mutation=refresh)
    client.signal_owner(321, signal.SIGTERM)
    client.signal_owner(321, signal.SIGKILL)
    assert len(reads) == 1
    assert sent[0]["target"] == ready["target"]
    assert sent[1]["target"]["audit_token_pidversion"] == 12
    assert sent[0]["signal"] == 15 and type(sent[0]["signal"]) is int
    assert client._exit_ack is None


@pytest.mark.parametrize("field,value", [
    ("version", "other"), ("scope_root", "/other"), ("role", "engine"), ("generation", 2),
    ("target.pid", 322), ("target.uid", 502), ("target.birth_id", "different"),
])
def test_control_first_use_pin_mismatch_fences_without_sending(field, value):
    disk = control_reference()
    mutate_path(disk, field, value)
    client, sent, reads, received = control_client(disk=disk)
    with pytest.raises(EngineAdapterError) as first:
        client.signal_owner(321, 15)
    with pytest.raises(EngineAdapterError) as later:
        client.signal_owner(321, 9)
    assert first.value.__cause__ is later.value.__cause__ is client._error
    assert client.failure_phase == "not_sent"
    assert len(reads) == 1 and sent == received == []


@pytest.mark.parametrize("path,value", ACK_MUTATIONS)
def test_control_malformed_ack_fences_and_retains_first_error(path, value):
    client, sent, reads, received = control_client(reply_mutation=lambda ack: mutate_path(ack, path, value))
    with pytest.raises(EngineAdapterError) as first:
        client.signal_owner(321, 15)
    for callback in (lambda: client.signal_owner(321, 15), lambda: client.signal_owner(321, 9),
                     lambda: client.observe_exit(Process(), 0)):
        with pytest.raises(EngineAdapterError) as later:
            callback()
        assert later.value.__cause__ is first.value.__cause__
    assert client.failure_phase == "outcome_unknown"
    assert len(sent) == len(reads) == len(received) == 1


@pytest.mark.parametrize("change", ["v1", "extra", "missing", "reference-extra", "target-missing"])
def test_control_ack_exact_shapes_are_required(change):
    def mutate(ack):
        if change == "v1":
            ack.pop("current_reference")
        elif change == "extra":
            ack["exited"] = True
        elif change == "missing":
            ack.pop("owner_epoch")
        elif change == "reference-extra":
            ack["current_reference"]["extra"] = True
        else:
            ack["current_reference"]["target"].pop("uid")
    client, sent, _, _ = control_client(reply_mutation=mutate)
    with pytest.raises(EngineAdapterError):
        client.signal_owner(321, 15)
    assert len(sent) == 1 and client._exit_ack is None


@pytest.mark.parametrize("failure", [TimeoutError("late ACK"), EOFError("EOF"),
                                     ValueError("partial frame"), ValueError("invalid JSON"), "send", "reader"])
def test_control_transport_failure_never_retries_or_reads_late_ack(failure):
    client, sent, reads, received = control_client(failure=failure)
    with pytest.raises(EngineAdapterError) as first:
        client.signal_owner(321, 15)
    client.custody._read_frame = lambda _: pytest.fail("late reply consumed")
    for callback in (lambda: client.signal_owner(321, 9), lambda: client.observe_exit(Process(), 0)):
        with pytest.raises(EngineAdapterError) as later:
            callback()
        assert later.value.__cause__ is first.value.__cause__
    assert len(reads) == 1
    assert len(sent) == (0 if failure == "reader" else 1)
    assert client.failure_phase == ("not_sent" if failure == "reader" else "outcome_unknown")


def test_control_exit_remains_v1_with_current_ref_and_ends_signal_admission():
    client, sent, reads, _ = control_client()
    client.signal_owner(321, 15)
    client.observe_exit(Process(), -15)
    assert sent[1]["version"] == "runtime.local-execution-engine-control/v1"
    assert sent[1]["target"] == sent[0]["target"] and sent[1]["exit_code"] == -15
    with pytest.raises(EngineAdapterError, match="exit"):
        client.signal_owner(321, 9)
    assert len(sent) == 2 and len(reads) == 1


def test_control_exit_as_first_use_reads_ready_reference_once():
    ready = control_reference()
    ready["target"].update(audit_token_sha256="sha256:" + "b" * 64, audit_token_pidversion=11)
    client, sent, reads, _ = control_client(disk=ready)
    client.observe_exit(Process(), 0)
    assert len(reads) == 1 and sent[0]["target"] == ready["target"]
    assert "current_reference" not in client._exit_ack


def test_control_bad_exit_ack_permanently_fences_without_recording_exit():
    client, sent, _, _ = control_client(reply_mutation=lambda ack: ack.update(exit_code=0.0))
    with pytest.raises(EngineAdapterError):
        client.observe_exit(Process(), 0)
    with pytest.raises(EngineAdapterError, match="fenced"):
        client.signal_owner(321, 9)
    assert len(sent) == 1 and client._exit_ack is None and client.failure_phase == "outcome_unknown"


def test_control_identical_successful_signals_are_two_deliberate_deliveries():
    client, sent, _, received = control_client()
    client.signal_owner(321, 15)
    client.signal_owner(321, 15)
    assert len(sent) == len(received) == 2 and sent[0] == sent[1]


def test_control_callbacks_share_one_exchange_lock():
    client, sent, _, _ = control_client()
    entered, release, second_started = threading.Event(), threading.Event(), threading.Event()
    receive = client.custody._read_frame
    errors = []

    def blocked(channel):
        entered.set()
        assert release.wait(1)
        return receive(channel)
    client.custody._read_frame = blocked

    def call(signum):
        try:
            if signum == 9:
                second_started.set()
            client.signal_owner(321, signum)
        except BaseException as exc:
            errors.append(exc)
    first = threading.Thread(target=call, args=(15,))
    second = threading.Thread(target=call, args=(9,))
    first.start()
    try:
        assert entered.wait(1)
        second.start()
        assert second_started.wait(1)
        assert client._lock.locked() and len(sent) == 1
    finally:
        release.set()
        first.join(1)
        if second.ident is not None:
            second.join(1)
    assert not errors and not first.is_alive() and not second.is_alive()
    assert [frame["signal"] for frame in sent] == [15, 9]


@pytest.mark.parametrize("scope", ["relative", "/private/../custody", "/private/custody/", None])
def test_control_non_normalized_scope_fails_before_engine_launch(scope):
    from astrid.core.execution.vibecomfy_engine_adapter import engine_main
    with pytest.raises(EngineAdapterError, match="scope"):
        engine_main({"custody_scope": scope})


def test_control_scope_uses_exact_abspath_without_reinterpreting_posix_double_slash():
    # POSIX abspath preserves two initial slashes. The adopted contract checks
    # exact abspath equality rather than replacing it with a different path.
    EngineControlClient.validate_scope("//private/custody")


def selected_observation_case(tmp_path, monkeypatch):
    import importlib.util
    import types
    vibecomfy = types.ModuleType("vibecomfy")
    vibecomfy.__path__ = []
    monkeypatch.setitem(__import__("sys").modules, "vibecomfy", vibecomfy)
    from astrid.core.execution import vibecomfy_engine_adapter as adapter
    root = tmp_path.resolve()
    source = root / "vibecomfy/runtime/session.py"
    source.parent.mkdir(parents=True)
    source.write_text('''def current_source_revision():
    return subprocess.run(["git", "rev-parse", "HEAD"], cwd=find_repo_root(), text=True, timeout=5).stdout

def current_source_content_digest():
    return subprocess.run(["git", "ls-files", "-z", "-c", "-o", "--exclude-standard"], cwd=find_repo_root(), timeout=60).stdout

def _process_start_identity(pid):
    return subprocess.run(["ps", "-p", str(pid), "-o", "lstart="], capture_output=True, check=False, text=True, timeout=2).stdout.strip() or None
''')
    commands = root / "vibecomfy/commands/session.py"
    commands.parent.mkdir(parents=True); commands.write_text("# selected commands\n")
    utils_path = root / "vibecomfy/utils.py"; utils_path.write_text("from pathlib import Path\nfrom functools import lru_cache\n@lru_cache(maxsize=1)\ndef find_repo_root():\n    return Path(__file__).resolve().parents[1]\n")
    utils = types.ModuleType("vibecomfy.utils"); utils.__file__ = str(utils_path)
    exec(compile(utils_path.read_text(), str(utils_path), "exec"), utils.__dict__)
    monkeypatch.setitem(__import__("sys").modules, "vibecomfy.utils", utils)
    monkeypatch.setattr(vibecomfy, "utils", utils, raising=False)
    find_spec = importlib.util.find_spec
    monkeypatch.setattr(importlib.util, "find_spec", lambda name: SimpleNamespace(origin=str(commands)) if name == "vibecomfy.commands.session" else find_spec(name))
    calls = []; values = {"git": "actual-revision", "digest": "sha256:" + "d" * 64, "ps": "actual-birth"}
    def run(argv, **kwargs):
        calls.append((argv, kwargs))
        key = "digest" if "ls-files" in argv else "ps" if argv[0].endswith("/ps") else "git"
        return SimpleNamespace(stdout=values[key])
    original = SimpleNamespace(run=run)
    module = types.ModuleType("vibecomfy.runtime.session"); module.__file__ = str(source)
    module.subprocess = original; module.find_repo_root = utils.find_repo_root
    exec(compile(source.read_text(), str(source), "exec"), module.__dict__)
    helpers = {}
    for name in ("git", "ps"):
        path = root / name; path.write_text("selected-" + name)
        helpers[name] = adapter._file_pin(path)
    pins = {"version": adapter.SOURCE_FACT_VERSION, "source_root": str(root),
            "source_revision": values["git"], "source_content_digest": values["digest"],
            "sources": {"runtime.session": adapter._file_pin(source), "commands.session": adapter._file_pin(commands), "utils": adapter._file_pin(utils_path)},
            "functions": {name: adapter._function_pin(getattr(module, name)) for name in adapter._SOURCE_FACTS}, "helpers": helpers}
    return adapter, module, pins, calls, values, original


def test_selected_observer_executes_original_facts_at_each_call_with_owned_pinned_helpers(tmp_path, monkeypatch):
    adapter, module, pins, calls, values, original = selected_observation_case(tmp_path, monkeypatch)
    monkeypatch.setattr(adapter.sys, "platform", "linux")
    observer = adapter.SelectedSourceObserver(module, pins)
    assert observer.observe("current_source_revision") == "actual-revision"
    values["git"] = "changed-revision"
    assert observer.observe("current_source_revision") == "changed-revision"
    assert observer.observe("current_source_content_digest") == values["digest"]
    assert observer.observe("_process_start_identity", 321) == "actual-birth"
    assert [args[0] for args, _ in calls] == [pins["helpers"]["git"]["path"]] * 3 + [pins["helpers"]["ps"]["path"]]
    assert calls[2][1]["timeout"] == 60 and calls[0][1]["cwd"] == tmp_path.resolve()
    assert module.subprocess is original


@pytest.mark.parametrize("change", ["root", "source", "commands", "utility", "function", "helper", "extra", "resolver"])
def test_selected_observer_rejects_wrong_origin_bytes_or_pin_shapes_before_helpers(tmp_path, monkeypatch, change):
    adapter, module, pins, calls, _, _ = selected_observation_case(tmp_path, monkeypatch)
    if change == "root": pins["source_root"] = str(tmp_path.parent)
    elif change == "source": pins["sources"]["runtime.session"]["sha256"] = "sha256:" + "0" * 64
    elif change == "commands": pins["sources"]["commands.session"]["path"] += ".other"
    elif change == "utility": pins["sources"]["utils"]["sha256"] = "sha256:" + "0" * 64
    elif change == "function": pins["functions"]["_process_start_identity"] = "sha256:" + "0" * 64
    elif change == "helper": (tmp_path / "git").write_text("changed helper")
    elif change == "resolver": module.find_repo_root = lambda: tmp_path.parent
    else: pins["extra"] = True
    with pytest.raises(EngineAdapterError): adapter.SelectedSourceObserver(module, pins)
    assert calls == []


def test_engine_observation_aliases_preserve_selected_calls_and_block_other_helpers(tmp_path, monkeypatch):
    adapter, module, pins, calls, _, original = selected_observation_case(tmp_path, monkeypatch)
    observed = []
    control = SimpleNamespace(observe_source_fact=lambda fact, pid=None: observed.append((fact, pid)) or "actual")
    adapter.install_selected_observation_boundary(module, pins, control)
    assert module.current_source_revision() == module.current_source_content_digest() == "actual"
    assert module._process_start_identity(321) == "actual"
    assert observed == [("current_source_revision", None), ("current_source_content_digest", None), ("_process_start_identity", 321)]
    with pytest.raises(EngineAdapterError): module.subprocess.run(["git", "status"])
    with pytest.raises(EngineAdapterError): module.subprocess.Popen(["ps"])
    assert calls == [] and original.run is not module.subprocess.run


def fact_client(*, mutate=None, failure=None):
    from astrid.core.execution import custody_broker as custody
    sent = []
    def send(_, frame):
        sent.append(copy.deepcopy(frame))
        if failure == "send": raise OSError("uncertain prefix")
    def receive(_):
        if failure == "receive": raise TimeoutError("late observation")
        reply = {**{k: v for k, v in sent[-1].items() if k != "command"}, "status": "observed", "value": "sha256:" + "d" * 64}
        if mutate: mutate(reply)
        return reply
    consumer = SimpleNamespace(_canonical=custody._canonical, _send_frame=send, _read_frame=receive)
    client = EngineControlClient(channel=object(), custody=consumer, reference_reader=lambda: pytest.fail("observation fabricated listener readiness"),
                                 custody_scope="/private/custody", operation_id="op", channel_id="ch", owner_epoch="epoch",
                                 source_pins_digest="sha256:" + "c" * 64)
    return client, sent


def test_source_fact_channel_needs_no_listener_ready_reference_and_stays_small():
    import json
    client, sent = fact_client()
    assert client.observe_source_fact("current_source_content_digest") == "sha256:" + "d" * 64
    assert client._pin is client._current is None
    assert len(json.dumps(sent[0]).encode()) < 1024


@pytest.mark.parametrize("change", ["binder", "digest", "fact", "pid", "extra", "value", "type", "send", "receive"])
def test_source_fact_malformed_or_uncertain_response_fences_channel_without_retry(change):
    def mutate(reply):
        key = {"binder": "owner_epoch", "digest": "source_pins_digest", "fact": "fact", "pid": "pid", "extra": "extra", "value": "value", "type": "engine_pid"}[change]
        reply[key] = True if change in {"extra", "type"} else "foreign"
    client, sent = fact_client(mutate=None if change in {"send", "receive"} else mutate,
                               failure=change if change in {"send", "receive"} else None)
    with pytest.raises(EngineAdapterError): client.observe_source_fact("current_source_content_digest")
    with pytest.raises(EngineAdapterError): client.observe_source_fact("current_source_revision")
    assert len(sent) == 1 and client.failure_phase == "outcome_unknown"


def test_fake_exit_v2_requires_exact_ack_and_updates_only_from_that_ack():
    from astrid.core.execution.vibecomfy_engine_adapter import LISTENER_EXIT_V2
    client, sent, reads, _ = control_client()
    client._enable_exit_v2 = True
    receive = client.custody._read_frame
    def response(channel):
        reply = receive(channel)
        current = control_reference(); current["target"].update(audit_token_sha256="sha256:" + "b" * 64, audit_token_pidversion=11)
        reply.update(current_reference=current, revision=1, refresh_proof_digest="sha256:" + "e" * 64)
        return reply
    client.custody._read_frame = response
    proxy = CustodyProcessProxy(Process(), client.signal_owner, client.observe_exit)
    assert asyncio.run(proxy.wait()) == 0
    assert sent[0]["version"] == LISTENER_EXIT_V2 and len(reads) == 1
    assert client._current["target"]["audit_token_pidversion"] == 11


@pytest.mark.parametrize("change", ["generation", "birth", "pid", "revision", "digest", "extra"])
def test_fake_exit_v2_rejects_wrong_current_custody_or_proof(change):
    client, sent, _, _ = control_client(); client._enable_exit_v2 = True
    receive = client.custody._read_frame
    def response(channel):
        reply = receive(channel); reply.update(current_reference=control_reference(), revision=0, refresh_proof_digest="sha256:" + "e" * 64)
        if change == "generation": reply["current_reference"]["generation"] += 1
        elif change in {"birth", "pid"}: reply["current_reference"]["target"]["birth_id" if change == "birth" else "pid"] = "other" if change == "birth" else 999
        elif change == "revision": reply["revision"] = True
        elif change == "digest": reply["refresh_proof_digest"] = "sha256:bad"
        else: reply["extra"] = True
        return reply
    client.custody._read_frame = response
    with pytest.raises(EngineAdapterError): asyncio.run(CustodyProcessProxy(Process(), client.signal_owner, client.observe_exit).wait())
    assert len(sent) == 1 and client._exit_ack is None


@pytest.mark.parametrize("state", ["live", "zombie", "absent"])
def test_selected_birth_fact_darwin_is_native_and_does_not_launch_helper(tmp_path, monkeypatch, state):
    from astrid.core.execution import custody_broker
    adapter, module, pins, calls, _, original = selected_observation_case(tmp_path, monkeypatch)
    monkeypatch.setattr(adapter.sys, "platform", "darwin")
    row = {"pid": 321, "uid": 501, "parent_pid": 1, "pgid": 321, "start_sec": 1700000000, "start_usec": 1234, "status": 5 if state == "zombie" else 2}
    monkeypatch.setattr(custody_broker, "_darwin_process_records", lambda pid: [] if state == "absent" else [dict(row)])
    observer = adapter.SelectedSourceObserver(module, pins)
    expected = None if state == "absent" else custody_broker._ps_lstart_birth(row["start_sec"]).removeprefix("ps-lstart:")
    assert observer.observe("_process_start_identity", 321) == expected
    assert calls == [] and module.subprocess is original


@pytest.mark.parametrize("fault", ["uid", "parent_pid", "pgid", "start_sec", "start_usec", "disappeared", "unavailable", "malformed"])
def test_native_birth_observation_rejects_drift_and_unknown_without_helper(tmp_path, monkeypatch, fault):
    from astrid.core.execution import custody_broker
    adapter, module, pins, calls, _, _ = selected_observation_case(tmp_path, monkeypatch)
    monkeypatch.setattr(adapter.sys, "platform", "darwin")
    row = {"pid": 321, "uid": 501, "parent_pid": 1, "pgid": 321, "start_sec": 1700000000, "start_usec": 1234, "status": 2}
    n = [0]
    def native(pid):
        n[0] += 1
        if fault == "unavailable": raise OSError("controlled unavailable")
        value = dict(row)
        if n[0] == 2:
            if fault == "disappeared": return []
            if fault == "malformed": value.pop("start_usec")
            else: value[fault] += 1
        return [value]
    monkeypatch.setattr(custody_broker, "_darwin_process_records", native)
    with pytest.raises(EngineAdapterError):
        adapter.SelectedSourceObserver(module, pins).observe("_process_start_identity", 321)
    assert calls == []


def test_native_birth_completed_process_preserves_capture_and_absence_semantics(monkeypatch):
    import subprocess
    from astrid.core.execution import custody_broker, vibecomfy_engine_adapter as adapter
    monkeypatch.setattr(custody_broker, "_darwin_process_records", lambda pid: [])
    command = ["ps", "-p", "321", "-o", "lstart="]
    result = adapter._native_lstart_result(command, {"capture_output": True, "timeout": 2})
    assert isinstance(result, subprocess.CompletedProcess) and result.returncode == 1
    assert result.stdout == result.stderr == b""
    with pytest.raises(subprocess.CalledProcessError):
        adapter._native_lstart_result(command, {"capture_output": True, "text": True, "check": True})
    with pytest.raises(EngineAdapterError):
        adapter._native_lstart_result(command, {"shell": True})


@pytest.mark.darwin_native
def test_real_selected_source_birth_preimage_spawns_ps_fixed_native_matches_without_spawn(tmp_path, monkeypatch):
    import ast, hashlib, os, subprocess, sys, types
    from pathlib import Path
    from astrid.core.execution import vibecomfy_engine_adapter as adapter
    if os.environ.get("ASTRID_VIBE_ADAPTER_QUALIFIED_ROOT"):
        import vibecomfy.runtime.session as selected
        raw_source = Path(selected.__file__).read_bytes()
        launch = {"source_revision": selected.current_source_revision(), "source_content_digest": selected.current_source_content_digest(),
                  "adapter_pins": {"session_source_sha256": "sha256:" + hashlib.sha256(raw_source).hexdigest()}}
        assert launch["source_revision"] and launch["source_content_digest"]
        observer = adapter.SelectedSourceObserver.from_selected_launch(launch)
        real_selected = True
    else:
        import shutil
        adapter, selected, pins, _, _, _ = selected_observation_case(tmp_path, monkeypatch)
        pins["helpers"]["ps"] = adapter._file_pin(Path(shutil.which("ps")).resolve())
        observer = adapter.SelectedSourceObserver(selected, pins)
        real_selected = False
    calls = []
    class Original:
        def __getattr__(self, name): return getattr(subprocess, name)
        def run(self, argv, **kwargs):
            calls.append(Path(argv[0]).name)
            return subprocess.run(argv, **kwargs)
    preimage_path = os.environ.get("ASTRID_VIBE_ADAPTER_PREIMAGE")
    if preimage_path:
        preimage = Path(preimage_path)
        tree = ast.parse(preimage.read_text())
        oldclass = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == "_ObservationSubprocess")
        scope = dict(vars(adapter)); exec(compile(ast.Module(body=[oldclass], type_ignores=[]), str(preimage), "exec"), scope)
        old_boundary = scope["_ObservationSubprocess"]
        preimage_sha = hashlib.sha256(preimage.read_bytes()).hexdigest()
    else:
        class OldBoundary:
            def __init__(self, original, helpers): self.original, self.helpers = original, helpers
            def run(self, argv, **kwargs):
                pin = self.helpers[argv[0]]
                assert adapter._file_pin(Path(pin["path"])) == pin
                return self.original.run([pin["path"], *argv[1:]], **kwargs)
        old_boundary, preimage_sha = OldBoundary, None
    original = selected._process_start_identity
    oldfn = types.FunctionType(original.__code__, {**original.__globals__, "subprocess": old_boundary(Original(), observer.pins["helpers"])}, original.__name__)
    old_birth = oldfn(os.getpid()); assert calls == ["ps"] and old_birth
    calls.clear()
    fixedfn = types.FunctionType(original.__code__, {**original.__globals__, "subprocess": adapter._ObservationSubprocess(Original(), observer.pins["helpers"])}, original.__name__)
    observer.functions["_process_start_identity"] = fixedfn
    assert observer.observe("_process_start_identity", os.getpid()) == old_birth
    assert calls == []
    (tmp_path / "preimage-fixed-routing-proof.json").write_text(__import__("json").dumps({"real_selected_module":str(Path(selected.__file__)),"preimage_sha256":preimage_sha,"qualified_selected_clone":real_selected,"preimage_ps_calls":1,"fixed_helper_calls":0,"birth_equal":True,"historical_custody_cause_not_claimed":True}))


@pytest.mark.parametrize("fault", ["valid", "absent", "uid", "parent", "birth", "pid", "unavailable", "malformed"])
def test_native_parent_fact_is_precisely_bracketed_and_has_no_subprocess_authority(monkeypatch, fault):
    from astrid.core.execution import custody_broker, vibecomfy_engine_adapter as adapter
    row = {"pid": 910002, "uid": 501, "parent_pid": 910001, "pgid": 910001, "start_sec": 1700000001, "start_usec": 2345, "status": 2}
    count = [0]
    def native(pid):
        count[0] += 1
        if fault == "unavailable": raise OSError("controlled unknown")
        if fault == "absent": return []
        value = dict(row)
        if count[0] == 2:
            if fault == "malformed": value.pop("start_usec")
            elif fault in {"uid", "parent", "birth", "pid"}: value[{"uid":"uid", "parent":"parent_pid", "birth":"start_usec", "pid":"pid"}[fault]] += 1
        return [value]
    monkeypatch.setattr(custody_broker, "_darwin_process_records", native)
    if fault in {"valid", "absent"}:
        assert adapter._native_process_parent_pid(910002) == (910001 if fault == "valid" else None)
    else:
        with pytest.raises(EngineAdapterError): adapter._native_process_parent_pid(910002)
    assert count[0] in {1, 2}
