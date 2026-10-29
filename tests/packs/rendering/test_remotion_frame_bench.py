from pathlib import Path

import pytest

from astrid.packs.rendering.rendering.renderers.remotion.run import PersistentRemotionFrameSession


class HostClient:
    """The inherited host renderer lease, recording what the session asks of it."""

    def __init__(self, response):
        self.response, self.calls = response, []

    def request(self, identity, request, parser):
        self.calls.append((identity, request))
        return self.response


def render(session, tmp_path, frames):
    session.render(
        project_dir=tmp_path, composition_id="TimelineComposition", node_executable=Path("/node"),
        remotion_cli=Path("/cli"), props_path=tmp_path / "props.json", output_dir=tmp_path,
        frames=frames, resolution=None, port=1, environment={}, identity="real-identity",
    )


def test_bench_uses_a_private_owner_and_enables_diagnostics(monkeypatch, tmp_path):
    client = HostClient({"ok": True, "diagnostics": {"browser": []}})
    session = PersistentRemotionFrameSession()
    monkeypatch.setenv("ASTRID_FRAME_BENCH_ID", "probe-1")
    monkeypatch.setenv("ASTRID_FRAME_DIAGNOSTICS", "1")
    monkeypatch.setattr("astrid.core.execution.remotion_host_session.host_remotion_client", lambda: client)
    render(session, tmp_path, [30])
    ((identity, request),) = client.calls
    assert identity == "real-identity|bench:probe-1"
    assert request["diagnostics"] is True
    assert session.diagnostics == {"browser": []}


def test_no_bench_leaves_identity_and_request_unchanged(monkeypatch, tmp_path):
    client = HostClient({"ok": True})
    session = PersistentRemotionFrameSession()
    monkeypatch.delenv("ASTRID_FRAME_BENCH_ID", raising=False)
    monkeypatch.delenv("ASTRID_FRAME_DIAGNOSTICS", raising=False)
    monkeypatch.setattr("astrid.core.execution.remotion_host_session.host_remotion_client", lambda: client)
    render(session, tmp_path, [1])
    ((identity, request),) = client.calls
    assert identity == "real-identity"
    assert "diagnostics" not in request


def test_capture_without_the_host_lease_is_refused_not_given_its_own_owner(monkeypatch, tmp_path):
    # Every supported route runs capture as a host task; there is no hostless
    # owner with its own idle timer outside the host's warm hold.
    session = PersistentRemotionFrameSession()
    monkeypatch.setattr("astrid.core.execution.remotion_host_session.host_remotion_client", lambda: None)
    with pytest.raises(RuntimeError, match="needs the pack host's renderer lease"):
        render(session, tmp_path, [1])
    session.close(force=True)  # nothing was leased, so there is nothing to release
