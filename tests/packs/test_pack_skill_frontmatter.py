"""Every pack skill loads as a skill: agents (Codex, Claude) refuse a SKILL.md without YAML
frontmatter, so its guidance silently never reaches them (5 packs on 14 Oct, pixel among them)."""
from pathlib import Path

import pytest
import yaml

PACKS = Path(__file__).resolve().parents[2] / "astrid" / "packs"
# v3 packs keep skills under docs/ (docs/SKILL.md and docs/<topic>/SKILL.md); v2 used skill/.
SKILLS = sorted(
    {*PACKS.glob("*/docs/**/SKILL.md"), *PACKS.glob("*/skill/**/SKILL.md")}
)


@pytest.mark.parametrize("skill", SKILLS, ids=lambda p: str(p.relative_to(PACKS).parent))
def test_pack_skill_has_name_and_description_frontmatter(skill: Path) -> None:
    text = skill.read_text(encoding="utf-8")
    assert text.startswith("---\n"), f"{skill}: no YAML frontmatter"
    meta = yaml.safe_load(text.split("---\n", 2)[1])
    assert meta.get("name") and meta.get("description"), f"{skill}: frontmatter needs name and description"


def test_pack_skills_were_found() -> None:
    assert len(SKILLS) >= 20
