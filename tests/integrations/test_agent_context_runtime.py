"""Real shared-renderer parity against a disposable, explicitly supplied Runtime.

The Runtime comes from the ``real_runtime`` fixture (``ASTRID_RUNTIME_CHECKOUT``).
The public Astrid bundle performs the real generated-client handshake; no
sibling-checkout discovery or live launcher is used by the product code under test.
"""

from __future__ import annotations

from pathlib import Path

import pytest

import astrid_runtime_client
from astrid_runtime_client.contract_metadata import SCHEMA_DIGEST

from astrid import agent_context
from astrid.sdk.client import AstridClient

pytestmark = pytest.mark.integration  # needs the Runtime from a second checkout


def test_launcher_context_reads_real_preferences_and_refreshes_project(
    real_runtime, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    package_root = Path(__file__).resolve().parents[2] / "astrid_runtime_client"
    assert Path(astrid_runtime_client.__file__).resolve().is_relative_to(package_root)
    # All Runtime-owned state and owner-only actor credentials stay in tmp_path.
    daemon = real_runtime()
    try:
        assert SCHEMA_DIGEST == daemon.service.health()["schema_digest"]
        actor = "context-parity"
        _, credential_file = daemon.credentials.provision(
            actor,
            [
                "handshake",
                "projects:read",
                "projects:write",
                "objects:read",
                "objects:write",
                "tasks:read",
                "tasks:write",
            ],
        )
        assert credential_file.is_file() and credential_file.stat().st_mode & 0o077 == 0
        connection = {
            "status": "started",
            "endpoint": daemon.endpoint,
            "realm_id": daemon.service.realm["id"],
            "actor_id": actor,
            "credential_file": str(credential_file),
        }
        monkeypatch.setenv("ASTRID_TIMELINE_EVAL_ENDPOINT", connection["endpoint"])
        monkeypatch.setenv("ASTRID_TIMELINE_EVAL_CREDENTIAL", connection["credential_file"])
        monkeypatch.setenv("ASTRID_TIMELINE_EVAL_REALM_ID", connection["realm_id"])
        monkeypatch.setenv("ASTRID_TIMELINE_EVAL_ACTOR_ID", connection["actor_id"])
        # Both launcher paths now use the explicitly supplied disposable
        # Runtime, while open_existing_from_launcher remains unpatched.
        with AstridClient.open_from_launcher(start_pack_host=False) as client:
            first = client.projects.create(slug="first", name="First", idempotency_key="first")
            second = client.projects.create(slug="second", name="Second", idempotency_key="second")
            assert first.ok and second.ok
            first_id, second_id = first.data["project_id"], second.data["project_id"]
            assert client.projects.select(first_id, idempotency_key="select-first").ok
            user = client.preferences.update(
                "user", "Default model: user-A.", expected_version=0, idempotency_key="user-A"
            )
            assert user.ok and user.data["actor_id"] == actor
            assert user.receipt is None  # Real generated-client null-receipt decoding.
            assert client.preferences.update(
                "project", "Default model: project-B.", expected_version=0,
                project=first_id, idempotency_key="project-B",
            ).ok
            assert client.preferences.update(
                "project", "Default model: project-C.", expected_version=0,
                project=second_id, idempotency_key="project-C",
            ).ok

            # main([]) is the public agent-context command path.
            assert agent_context.main([]) == 0
            initial = capsys.readouterr().out
            assert "Preference context unavailable" not in initial
            assert "User preferences\nDefault model: user-A." in initial
            assert f"Project preferences (project {first_id})\nDefault model: project-B." in initial
            assert agent_context.PREFERENCE_HELPER in initial
            assert "Current explicit instructions override project preferences, which override user preferences" in initial

            assert client.preferences.update(
                "user", "Default model: refreshed-user-D.", expected_version=1,
                idempotency_key="user-D",
            ).ok
            assert client.projects.select(second_id, idempotency_key="select-second").ok
            assert agent_context.main([]) == 0
            refreshed = capsys.readouterr().out
            assert agent_context.PREFERENCE_HELPER in refreshed
            assert "User preferences\nDefault model: refreshed-user-D." in refreshed
            assert f"Project preferences (project {second_id})\nDefault model: project-C." in refreshed
            assert "Default model: user-A." not in refreshed
            assert "Default model: project-B." not in refreshed
            assert first_id not in refreshed

            # Host project selectors override the selected workspace project.
            assert agent_context.main(["--project", first_id]) == 0
            explicit = capsys.readouterr().out
            assert f"Project preferences (project {first_id})\nDefault model: project-B." in explicit
            assert "Default model: project-C." not in explicit
            assert agent_context.main(["--no-project"]) == 0
            user_only = capsys.readouterr().out
            assert agent_context.PREFERENCE_HELPER in user_only
            assert "Default model: refreshed-user-D." in user_only
            assert "No project selected." in user_only
            assert "Default model: project-" not in user_only

            # Empty real preferences stay distinguishable from unavailable state.
            assert client.preferences.update(
                "user", "", expected_version=2, idempotency_key="user-empty"
            ).ok
            assert agent_context.main(["--no-project"]) == 0
            empty = capsys.readouterr().out
            assert agent_context.PREFERENCE_HELPER in empty
            assert "No saved preferences." in empty
            assert "Preference context unavailable" not in empty
    finally:
        daemon.stop()

    assert agent_context.main([]) == 0
    unavailable = capsys.readouterr().out
    assert unavailable == "Preferences unavailable. Run `astrid preferences` to read current preferences.\n"
