from __future__ import annotations

import re
from pathlib import Path

import pytest

from astrid.core.pack.canonical import validate_canonical_pack


PACK_ROOT = Path(__file__).resolve().parents[3] / "astrid" / "packs" / "discord_local"


def test_discord_local_pack_uses_v3_action_and_one_authored_skill() -> None:
    entry = validate_canonical_pack(PACK_ROOT)

    assert entry.definition.schema_version == 3
    assert sorted(entry.definition.actions) == ["command"]
    assert entry.definition.declaration_id("actions", "command") == "discord_local.command"
    assert entry.definition.to_dict()["documentation"] == {
        "kind": "skill",
        "path": "docs/SKILL.md",
    }
    assert not list(PACK_ROOT.rglob("executor.yaml"))
    assert not list(PACK_ROOT.rglob("actions/*/executor.yaml"))
    assert [path.relative_to(PACK_ROOT).as_posix() for path in PACK_ROOT.rglob("SKILL.md")] == [
        "docs/SKILL.md"
    ]


def test_action_binding_and_declared_resources_preserve_manual_contract() -> None:
    entry = validate_canonical_pack(PACK_ROOT)
    action = entry.definition.actions["command"]
    invocation = action["invocation"]

    assert invocation["kind"] == "command"
    assert list(invocation["command"]["argv"]) == [
        "{python_exec}",
        "-m",
        "astrid.packs.discord_local.actions.command.run",
        "--out",
        "{out}",
    ]
    assert {item["name"] for item in action["inputs"]} == {
        "mode",
        "channel_url",
        "variant",
        "command_file",
        "after",
        "match",
        "link_match",
        "expected_author",
        "response_message_id",
        "exclude_filenames",
        "timeout_seconds",
        "profile_dir",
        "runner_script",
        "cdp_port",
    }
    runner_input = next(item for item in action["inputs"] if item["name"] == "runner_script")
    assert runner_input["type"] == "file"
    assert runner_input["required"] is True
    assert any(
        item["input"] == "runner_script" and item["flag"] == "--runner-script" and not item["optional"]
        for item in invocation["command"]["input_args"]
    )
    assert [dict(item) for item in action["outputs"]] == [
        {
            "name": "run_bundle",
            "type": "directory",
            "path_template": "{out}",
            "mode": "create_or_replace",
            "description": "Canonical result, manifest, staged inputs, generated outputs, and debug evidence.",
        }
    ]
    assert {item["path"] for item in action["resources"]} == {
        "actions/command/__init__.py",
        "actions/command/run.py",
        "actions/command/STAGE.md",
    }
    declared = {resource.path for resource in entry.resources}
    assert {"model_variants.json", "README.md", "AGENTS.md", "docs/SKILL.md"}.issubset(declared)
    assert not any("__pycache__" in path or path.endswith(".pyc") for path in declared)


def test_authored_skill_has_pack_identity_and_local_links() -> None:
    skill_path = PACK_ROOT / "docs" / "SKILL.md"
    text = skill_path.read_text(encoding="utf-8")
    assert text.startswith("---\n")
    frontmatter, body = text.split("\n---\n", 1)
    assert re.search(r"^name:\s+discord_local\s*$", frontmatter, re.MULTILINE)
    assert re.search(r"^description:\s+\S", frontmatter, re.MULTILINE)
    assert "discord_local.command" in body


def test_runner_is_explicit_and_profile_default_is_user_state() -> None:
    from astrid.packs.discord_local.actions.command.run import _parser

    args = _parser().parse_args(
        [
            "--out",
            "/tmp/out",
            "--mode",
            "preview",
            "--channel-url",
            "https://discord.com/channels/1/2",
            "--runner-script",
            "/tmp/runner",
        ]
    )
    assert args.profile_dir == Path.home() / ".astrid" / "discord-command-poc-profile"
    with pytest.raises(SystemExit):
        _parser().parse_args(["--out", "/tmp/out", "--mode", "preview"])
