#!/usr/bin/env python3
"""Render the marked "give this to your agent" banner in README.md.

The banner is a monospace box whose borders MUST stay aligned. Hand-editing the
ASCII broke the border before, so the box is GENERATED here: every row is padded
to one width by code and an assertion guarantees alignment. Edit the ``LINES``
list (content only) and re-run. The writer replaces only its marked banner and
preserves the rest of README.md.

    python3 scripts/render_readme.py        # updates only the marked banner
"""
from __future__ import annotations

from html import escape
from pathlib import Path

W = 60  # inner content width (chars between the │ borders)
START_MARKER = "<!-- BEGIN GENERATED AGENT BANNER -->"
END_MARKER = "<!-- END GENERATED AGENT BANNER -->"


def center(s: str) -> str:
    pad = W - len(s)
    left = pad // 2
    return " " * left + s + " " * (pad - left)


def center_parts(s: str) -> tuple[str, str, str]:
    pad = W - len(s)
    left = pad // 2
    return " " * left, s, " " * (pad - left)


def blank() -> str:
    return " " * W


def hborder() -> str:
    """A rule with a single centered ◇ accent: ────── ◇ ──────."""
    accent = " ◇ "
    rest = W - len(accent)
    left = rest // 2
    return "─" * left + accent + "─" * (rest - left)


# Minimal & symmetric: identity, poetic steer, install, and inviting close.
# Everything is centered with dot dividers between stanzas.
# (content, border, emphasis) — emphasis wraps only the content, not padding.
LINES = [
    ("", "│", False),
    ("A   S   T   R   I   D", "│", False),
    ("", "│", False),
    ("agents harnessed, humans free —", "│", False),
    ("open tools for what could be:", "│", False),
    ("moving image, voice, and frame,", "│", False),
    ("open Astrid, make something, share its flame.", "│", False),
    ("", "│", False),
    ("·  ·  ·", "│", False),
    ("", "│", False),
    ("Agent instructions: docs/setup/SKILL.md", "│", False),
    ("", "│", False),
    ("$ curl -fsSL https://astrid.haus/install | sh", "│", True),
    ("$ irm https://astrid.haus/install.ps1 | iex", "│", True),
    ("open https://astrid.haus to begin.", "│", True),
    ("", "│", False),
    ("·  ·  ·", "│", False),
    ("", "│", False),
    ("ask the maker what to do,", "│", False),
    ("bring a spark and see it through —", "│", False),
    ("no map, no plan, no perfect day:", "│", False),
    ("begin, hold fast  — you'll find your way.", "│", False),
    ("", "│", False),
]


def render_content(text: str, emphasis: bool, *, html: bool = False) -> str:
    if not text:
        return blank()
    if not html or not emphasis:
        return center(text)
    left, middle, right = center_parts(text)
    return f"{left}<em>{escape(middle)}</em>{right}"


def render_box(*, html: bool = False) -> str:
    rows = ["╭" + hborder() + "╮"]
    plain_rows = ["╭" + hborder() + "╮"]
    for text, border, emphasis in LINES:
        content = render_content(text, emphasis, html=html)
        plain_content = center(text) if text else blank()
        rows.append(f"{border}{content}{border}")
        plain_rows.append(f"{border}{plain_content}{border}")
    rows.append("╰" + hborder() + "╯")
    plain_rows.append("╰" + hborder() + "╯")
    widths = {len(r) for r in plain_rows}
    assert len(widths) == 1, f"MISALIGNED rows: {sorted(widths)}"
    return "\n".join(rows)


def replace_banner(readme: str, box: str) -> str:
    if readme.count(START_MARKER) != 1 or readme.count(END_MARKER) != 1:
        raise ValueError("README must contain exactly one pair of generated-banner markers")
    start = readme.index(START_MARKER) + len(START_MARKER)
    end = readme.index(END_MARKER, start)
    if end < start:
        raise ValueError("README generated-banner markers are out of order")
    banner = f"\n\n### Give this to your agent\n\n```text\n{box}\n```\n\n"
    return readme[:start] + banner + readme[end:]


def main() -> None:
    plain_box = render_box()
    out = Path(__file__).resolve().parents[1] / "README.md"
    readme = out.read_text(encoding="utf-8")
    updated = replace_banner(readme, plain_box)
    if updated != readme:
        out.write_text(updated, encoding="utf-8")
    print(plain_box)
    print(f"\n[OK] aligned box ({len(plain_box.splitlines())} rows, width {len(plain_box.splitlines()[0])}) → {out}")


if __name__ == "__main__":
    main()
