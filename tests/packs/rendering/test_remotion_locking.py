from __future__ import annotations

import json
import multiprocessing
import subprocess
from contextlib import contextmanager
from pathlib import Path
from unittest import mock

import pytest

from astrid.core import timeline
from astrid.core.rendering.remotion_runtime import RemotionRuntimeTools
from astrid.packs.rendering.rendering.renderers.remotion import lock as remotion_lock
from astrid.packs.rendering.rendering.renderers.remotion import run as remotion
from scripts import gen_effect_registry, gen_remotion_types


def _execute_args(tmp_path: Path, name: str) -> tuple[tuple[Path, Path, Path], dict[str, object]]:
    return (
        (tmp_path / "timeline.json", tmp_path / "assets.json", tmp_path / name),
        {
            "provenance_out_path": tmp_path / f"{name}.published",
            "project_dir": tmp_path / "remotion-project",
            "composition_id": "TimelineComposition",
            "theme_path": None,
            "min_free_gb": None,
        },
    )


class _FakeMaterializer:
    needs_server = False

    def __init__(self, assets_path: Path, **_kwargs: object) -> None:
        self.staging_dir = assets_path.parent / "materialized"

    def __enter__(self) -> _FakeMaterializer:
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def resolved_registry(self, server: object) -> dict[str, object]:
        assert server is None
        return {"assets": {}}


def _render_process_probe(
    lock_path: Path,
    name: str,
    ready: multiprocessing.synchronize.Event,
    entered: multiprocessing.synchronize.Event,
    release: multiprocessing.synchronize.Event | None,
) -> None:
    """Run the real render lock wrapper around a process-local render probe."""

    remotion_lock.REMOTION_LOCK_PATH = lock_path

    def fake_locked(*args: object, **kwargs: object) -> remotion._ExecutionDetails:
        entered.set()
        if release is not None and not release.wait(60):
            raise RuntimeError("timed out waiting to release first render")
        return remotion._ExecutionDetails({}, {}, {})

    remotion._execute_remotion_locked = fake_locked
    probe_root = lock_path.parent.parent
    ready.set()
    remotion._execute_remotion(
        probe_root / "timeline.json",
        probe_root / "assets.json",
        probe_root / name,
        provenance_out_path=probe_root / f"{name}.published",
        project_dir=probe_root / "remotion-project",
        composition_id="TimelineComposition",
        theme_path=None,
        min_free_gb=None,
    )


@pytest.mark.parametrize("receipt", ["current", "wrong", "missing", "replayed"])
def test_lock_is_held_during_registry_generation_and_remotion_render(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    receipt: str,
) -> None:
    lock_path = tmp_path / "remotion" / ".astrid-registry.lock"
    monkeypatch.setattr(remotion_lock, "REMOTION_LOCK_PATH", lock_path)
    real_lock = remotion_lock.remotion_render_lock
    events: list[str] = []

    @contextmanager
    def observed_lock():
        events.append("lock-enter")
        with real_lock():
            try:
                yield
            finally:
                events.append("lock-exit")

    monkeypatch.setattr(remotion_lock, "remotion_render_lock", observed_lock)
    with real_lock():
        stale_token = remotion_lock.remotion_render_lock_child_env()[remotion_lock.REMOTION_LOCK_TOKEN_ENV]
    monkeypatch.setattr(
        remotion,
        "_validate_project_dir",
        lambda project_dir: RemotionRuntimeTools(
            Path("/trusted/node"),
            "v20.19.4",
            project_dir / "node_modules/@remotion/cli/remotion-cli.js",
        ),
    )
    monkeypatch.setattr(remotion, "_effective_registry_state", lambda theme: {"hash": "state"})
    monkeypatch.setattr(remotion, "_read_registry_state", lambda project_dir: None)
    monkeypatch.setattr(remotion, "_registry_outputs_match_state", lambda project_dir, state: True)

    def write_state(project_dir: Path, state: dict[str, object]) -> None:
        assert remotion_lock.remotion_render_lock_held()
        events.append("state-write")

    monkeypatch.setattr(remotion, "_write_registry_state", write_state)
    monkeypatch.setattr(remotion, "_require_free_space", lambda path, minimum: None)
    monkeypatch.setattr(remotion, "AssetMaterializer", _FakeMaterializer)
    monkeypatch.setattr(
        remotion,
        "_resolved_theme_for_render",
        lambda timeline_path, theme_path: {"id": "test", "visual": {}},
    )
    monkeypatch.setattr(
        remotion,
        "_serialize_timeline",
        lambda timeline_path, default_theme="banodoco-default": {"tracks": [], "clips": []},
    )
    monkeypatch.setattr(remotion, "_stage_effect_assets_for_timeline", lambda *args, **kwargs: {})

    def fake_run(command: list[object], **kwargs: object) -> subprocess.CompletedProcess[str]:
        assert remotion_lock.remotion_render_lock_held()
        normalized = [str(part) for part in command]
        if any(Path(part).name == "gen_effect_registry.py" for part in normalized):
            assert remotion_lock.REMOTION_LOCK_TOKEN_ENV in kwargs["env"]
            assert kwargs["env"][remotion_lock.REMOTION_LOCK_PATH_ENV] == str(lock_path.resolve())
            token = kwargs["env"][remotion_lock.REMOTION_LOCK_TOKEN_ENV]
            assert token != stale_token
            events.append("generation")
            if receipt == "current":
                stdout = remotion_lock.REMOTION_LOCK_RECEIPT_PREFIX + token
            elif receipt == "replayed":
                stdout = remotion_lock.REMOTION_LOCK_RECEIPT_PREFIX + stale_token
            elif receipt == "wrong":
                stdout = remotion_lock.REMOTION_LOCK_RECEIPT_PREFIX + ("0" * 64)
            else:
                stdout = ""
            return subprocess.CompletedProcess(normalized, 0, stdout=stdout, stderr="")
        else:
            assert Path(normalized[0]).name == "node"
            assert normalized[1].endswith(
                "node_modules/@remotion/cli/remotion-cli.js"
            )
            assert normalized[2] == "render"
            events.append("render")
            output = Path(normalized[normalized.index("--output") + 1])
            output.write_bytes(b"video")
        return subprocess.CompletedProcess(normalized, 0, stdout="", stderr="")

    monkeypatch.setattr(remotion.subprocess, "run", fake_run)
    args, kwargs = _execute_args(tmp_path, "locked.mp4")
    kwargs["project_dir"].mkdir(parents=True)
    timeline.save_timeline(
        {
            "theme": "banodoco-default",
            "tracks": [{"id": "v1", "kind": "visual", "label": "Generated"}],
            "clips": [],
        },
        tmp_path / "timeline.json",
    )
    timeline.save_registry({"assets": {}}, tmp_path / "assets.json")

    if receipt == "current":
        remotion._execute_remotion(*args, **kwargs)
        assert events == ["lock-enter", "generation", "state-write", "render", "lock-exit"]
    else:
        with pytest.raises(RuntimeError, match="lock receipt"):
            remotion._execute_remotion(*args, **kwargs)
        assert events == ["lock-enter", "generation", "lock-exit"]


def test_render_lock_child_token_is_fresh_path_bound_and_not_parent_pid_bound(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    lock_path = tmp_path / "remotion" / ".astrid-registry.lock"
    monkeypatch.setattr(remotion_lock, "REMOTION_LOCK_PATH", lock_path)
    with remotion_lock.remotion_render_lock():
        first = remotion_lock.remotion_render_lock_child_env()
        second = remotion_lock.remotion_render_lock_child_env()

    assert first[remotion_lock.REMOTION_LOCK_TOKEN_ENV] != second[remotion_lock.REMOTION_LOCK_TOKEN_ENV]
    assert first[remotion_lock.REMOTION_LOCK_PATH_ENV] == str(lock_path.resolve())
    monkeypatch.setenv(remotion_lock.REMOTION_LOCK_TOKEN_ENV, first[remotion_lock.REMOTION_LOCK_TOKEN_ENV])
    monkeypatch.setenv(remotion_lock.REMOTION_LOCK_PATH_ENV, first[remotion_lock.REMOTION_LOCK_PATH_ENV])
    monkeypatch.setattr(remotion_lock.os, "getppid", lambda: 987654)
    assert remotion_lock.remotion_render_lock_held()
    generator_calls: list[list[str]] = []
    monkeypatch.setattr(
        gen_effect_registry,
        "_main_unlocked",
        lambda argv: generator_calls.append(argv or []) or 0,
    )
    assert gen_effect_registry.main([]) == 0
    assert generator_calls == [[]]
    assert capsys.readouterr().out == (
        remotion_lock.REMOTION_LOCK_RECEIPT_PREFIX
        + first[remotion_lock.REMOTION_LOCK_TOKEN_ENV]
        + "\n"
    )

    monkeypatch.setenv(remotion_lock.REMOTION_LOCK_TOKEN_ENV, "wrong")
    assert not remotion_lock.remotion_render_lock_held()
    monkeypatch.delenv(remotion_lock.REMOTION_LOCK_TOKEN_ENV)
    assert not remotion_lock.remotion_render_lock_held()
    monkeypatch.setenv(remotion_lock.REMOTION_LOCK_TOKEN_ENV, second[remotion_lock.REMOTION_LOCK_TOKEN_ENV])
    monkeypatch.setenv(remotion_lock.REMOTION_LOCK_PATH_ENV, str(lock_path.with_name("other.lock")))
    assert not remotion_lock.remotion_render_lock_held()


def test_registry_generator_standalone_keeps_its_lock_without_receipt(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(remotion_lock, "REMOTION_LOCK_PATH", tmp_path / "registry.lock")
    monkeypatch.delenv(remotion_lock.REMOTION_LOCK_TOKEN_ENV, raising=False)
    monkeypatch.delenv(remotion_lock.REMOTION_LOCK_PATH_ENV, raising=False)
    calls: list[list[str]] = []
    monkeypatch.setattr(gen_effect_registry, "_main_unlocked", lambda argv: calls.append(argv or []) or 0)

    assert gen_effect_registry.main([]) == 0

    assert calls == [[]]
    assert capsys.readouterr().out == ""


def test_two_concurrent_remotion_renders_serialize(
    tmp_path: Path,
) -> None:
    context = multiprocessing.get_context("spawn")
    lock_path = tmp_path / "remotion" / ".astrid-registry.lock"
    first_ready = context.Event()
    first_entered = context.Event()
    release_first = context.Event()
    second_ready = context.Event()
    second_entered = context.Event()
    first = context.Process(
        target=_render_process_probe,
        args=(lock_path, "first.mp4", first_ready, first_entered, release_first),
    )
    second = context.Process(
        target=_render_process_probe,
        args=(lock_path, "second.mp4", second_ready, second_entered, None),
    )

    second_started = False
    first.start()
    try:
        assert first_ready.wait(60)
        assert first_entered.wait(60)
        second.start()
        second_started = True
        assert second_ready.wait(60)
        assert not second_entered.wait(0.3), "second render entered before first released"
    finally:
        release_first.set()
    first.join(timeout=60)
    if second_started:
        second.join(timeout=60)
    lingering = [process for process in (first, second) if process.pid and process.is_alive()]
    for process in lingering:
        process.terminate()
        process.join(timeout=2)

    assert second_started
    assert not lingering
    assert second_entered.is_set()
    assert first.exitcode == 0
    assert second.exitcode == 0


def test_gen_types_entrypoint_uses_the_remotion_render_lock(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    lock_path = tmp_path / "remotion" / ".astrid-registry.lock"
    output_path = tmp_path / "types.generated.ts"
    monkeypatch.setattr(remotion_lock, "REMOTION_LOCK_PATH", lock_path)
    monkeypatch.setattr(gen_remotion_types, "generate", lambda: "// generated types\n")
    writer_lock_states: list[bool] = []

    def write_registries(argv: list[str]) -> int:
        writer_lock_states.append(remotion_lock.remotion_render_lock_held())
        return 0

    monkeypatch.setattr(gen_effect_registry, "_main_unlocked", write_registries)

    assert (
        gen_remotion_types.main(
            ["--include-element-registries", str(output_path)]
        )
        == 0
    )

    package = json.loads((remotion.REPO_ROOT / "remotion" / "package.json").read_text())
    gen_types_command = package["scripts"]["gen-types"]
    assert "--include-element-registries" in gen_types_command
    assert "gen_effect_registry.py" not in gen_types_command
    assert writer_lock_states == [True]
    assert output_path.read_text(encoding="utf-8") == "// generated types\n"
    assert lock_path.exists()


def test_render_internal_writer_call_does_not_reacquire_non_recursive_lock(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        remotion_lock,
        "REMOTION_LOCK_PATH",
        tmp_path / "remotion" / ".astrid-registry.lock",
    )
    writer_calls: list[list[str]] = []

    def write_registries(argv: list[str] | None) -> int:
        assert remotion_lock.remotion_render_lock_held()
        writer_calls.append(list(argv or []))
        return 0

    monkeypatch.setattr(gen_effect_registry, "_main_unlocked", write_registries)

    def render_with_internal_writer(*args: object, **kwargs: object) -> remotion._ExecutionDetails:
        assert gen_effect_registry.main([]) == 0
        return remotion._ExecutionDetails({}, {}, {})

    monkeypatch.setattr(remotion, "_execute_remotion_locked", render_with_internal_writer)
    args, kwargs = _execute_args(tmp_path, "nested-writer.mp4")

    remotion._execute_remotion(*args, **kwargs)

    assert writer_calls == [[]]


def test_remotion_render_lock_releases_after_failure(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        remotion_lock,
        "REMOTION_LOCK_PATH",
        tmp_path / "remotion" / ".astrid-registry.lock",
    )
    monkeypatch.setattr(
        remotion,
        "_execute_remotion_locked",
        mock.Mock(side_effect=RuntimeError("render failed")),
    )
    args, kwargs = _execute_args(tmp_path, "failure.mp4")

    with pytest.raises(RuntimeError, match="render failed"):
        remotion._execute_remotion(*args, **kwargs)

    assert not remotion_lock.remotion_render_lock_held()
    with remotion_lock.remotion_render_lock():
        assert remotion_lock.remotion_render_lock_held()


def test_remotion_render_lock_rejects_recursive_acquisition(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        remotion_lock,
        "REMOTION_LOCK_PATH",
        tmp_path / "remotion" / ".astrid-registry.lock",
    )

    with remotion_lock.remotion_render_lock():
        with pytest.raises(RuntimeError, match="non-recursive"):
            with remotion_lock.remotion_render_lock():
                pass
