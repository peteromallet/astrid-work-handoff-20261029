from __future__ import annotations

import textwrap
from pathlib import Path

from astrid.skills.discovery import list_skills


def test_list_skills_discovers_only_the_declared_pack_skill(tmp_path: Path) -> None:
    pack_root = tmp_path / "demo_pack"
    executor_root = pack_root / "executors" / "summarize"
    skill_root = pack_root / "skill"
    skill_root.mkdir(parents=True)
    nested_skill_root = executor_root / "skill"
    nested_skill_root.mkdir(parents=True)
    (pack_root / "pack.yaml").write_text(
        textwrap.dedent(
            """\
            schema_version: 2
            id: demo_pack
            name: Demo Pack
            version: 0.1.0
            content:
              executors: executors
            documentation:
              kind: skill
              path: skill/SKILL.md
            """
        ),
        encoding="utf-8",
    )
    (executor_root / "executor.yaml").write_text(
        "schema_version: 1\nid: demo_pack.summarize\nname: Summarize\nkind: built_in\nversion: 0.1.0\nruntime:\n  type: python-cli\n  entrypoint: run.py\n",
        encoding="utf-8",
    )
    (executor_root / "run.py").write_text("raise SystemExit(0)\n", encoding="utf-8")
    (skill_root / "SKILL.md").write_text(
        textwrap.dedent(
            """\
            ---
            name: summarize
            description: Summarize files in the demo pack.
            ---
            Use this skill for demo summaries.
            """
        ),
        encoding="utf-8",
    )

    # A nested component guide is linked documentation, never an extra skill.
    (nested_skill_root / "SKILL.md").write_text(
        "---\nname: nested\ndescription: Nested executor guide.\n---\nNested.\n",
        encoding="utf-8",
    )

    descriptors = list_skills(tmp_path)
    assert [descriptor.pack_id for descriptor in descriptors] == ["demo_pack"]
    assert [descriptor.name for descriptor in descriptors] == ["summarize"]
    assert descriptors[0].skill_dir == skill_root
