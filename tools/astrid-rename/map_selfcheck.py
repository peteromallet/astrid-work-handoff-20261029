#!/usr/bin/env python3
"""Check rename-map structure and coverage before running the rename tool.

The three source repositories are discovered as siblings of the Astrid checkout.
The bare-Banodoco audit is occurrence based: the same spelling can denote the
community in one line and the Runtime product in another.
"""

from __future__ import annotations

import csv
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
KINDS = {"token", "word", "regex", "prose", "path"}
REPOS = ("astrid", "runtime", "app")
OLD_SCOPE = re.compile(
    r"banodoco[-_]workspace[-_](?:runtime|client)|banodoco_workspace"
    r"|banodoco[ _-](?:local|runtime)|@banodoco/workspace-client"
    r"|Application Support/Banodoco|Banodoco Workspace",
    re.I,
)
OLD_ENV = re.compile(r"\w*BANODOCO_")
BARE = re.compile("banodoco", re.I)


def load_rows() -> list[dict[str, str]]:
    with (HERE / "rename-map.tsv").open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        if reader.fieldnames != ["kind", "old", "new", "scope", "note"]:
            raise ValueError(f"map header: {reader.fieldnames!r}")
        return list(reader)


def load_kept() -> list[tuple[re.Pattern[str], str]]:
    result = []
    for number, raw in enumerate((HERE / "kept-banodoco.txt").read_text().splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if " # " not in line:
            raise ValueError(f"kept-banodoco.txt:{number}: missing reason")
        pattern, reason = line.split(" # ", 1)
        result.append((re.compile(pattern), reason))
    return result


def load_merges() -> set[tuple[str, frozenset[str]]]:
    result = set()
    for number, raw in enumerate((HERE / "intended-merges.txt").read_text().splitlines(), 1):
        if not raw or raw.startswith("#"):
            continue
        fields = raw.split("\t")
        if len(fields) != 3 or not fields[0] or not fields[2]:
            raise ValueError(f"intended-merges.txt:{number}: expected new, old values, reason")
        olds = frozenset(fields[1].split(","))
        # rename.py reports a pre-existing target as ``new <- old`` and a
        # many-to-one map as ``new <- old1, old2``. Both need evidence here.
        if not olds or "" in olds:
            raise ValueError(f"intended-merges.txt:{number}: expected old value(s)")
        result.add((fields[0], olds))
    return result


def load_note_exceptions() -> dict[str, str]:
    result = {}
    for raw in (HERE / "map-notes.md").read_text().splitlines():
        match = re.match(r"^- (kept|deleted): `([^`]+)` — (.+)$", raw)
        if match:
            result[match.group(2)] = match.group(1)
    return result


def scope_applies(scope: str, repo: str, path: str) -> bool:
    if scope in {"all", "mixed"}:
        return True
    if ":" in scope:
        owner, glob = scope.split(":", 1)
        return owner == repo and Path(path).match(glob)
    return scope == repo


def row_spans(row: dict[str, str], line: str) -> list[tuple[int, int]]:
    kind, old = row["kind"], row["old"]
    if kind == "regex":
        return [m.span() for m in re.finditer(old, line)]
    if kind == "prose":
        boundary = r"[A-Za-z0-9_./-]"
        return [m.span() for m in re.finditer(rf"(?<!{boundary}){re.escape(old)}(?!{boundary})", line)]
    variants = (old, old.title(), old.upper()) if kind == "word" else (old,)
    spans = []
    for variant in dict.fromkeys(variants):
        spans.extend((m.start(), m.end()) for m in re.finditer(re.escape(variant), line))
    return spans


def covered(text: str, position: int, rows: list[dict[str, str]], kept: list[tuple[re.Pattern[str], str]], repo: str, path: str) -> bool:
    for row in rows:
        if scope_applies(row["scope"], repo, path) and any(a <= position < b for a, b in row_spans(row, text)):
            return True
    return any(m.start() <= position < m.end() for pattern, _ in kept for m in pattern.finditer(text))


def repo_paths(root: Path) -> list[str]:
    result = subprocess.run(["git", "ls-files", "-z"], cwd=root, capture_output=True, check=True)
    return [p.decode("utf-8", errors="surrogateescape") for p in result.stdout.split(b"\0") if p]


def main() -> int:
    errors: list[str] = []
    try:
        rows = load_rows()
        kept = load_kept()
        merges = load_merges()
        exceptions = load_note_exceptions()
    except (OSError, ValueError, re.error) as exc:
        print(f"map selfcheck: {exc}", file=sys.stderr)
        return 1

    keys = set()
    outputs: dict[tuple[str, str], set[str]] = defaultdict(set)
    for number, row in enumerate(rows, 2):
        if None in row or any(value is None for value in row.values()):
            errors.append(f"rename-map.tsv:{number}: malformed row")
            continue
        kind, old, new, scope = (row[k] for k in ("kind", "old", "new", "scope"))
        if kind not in KINDS or not old or not new or old == new:
            errors.append(f"rename-map.tsv:{number}: invalid kind/old/new")
        if scope not in {"all", "mixed", *REPOS} and not (
            ":" in scope and scope.split(":", 1)[0] in REPOS and scope.split(":", 1)[1]
        ):
            errors.append(f"rename-map.tsv:{number}: invalid scope {scope!r}")
        if scope == "mixed" and kind != "prose":
            errors.append(f"rename-map.tsv:{number}: mixed is prose-only")
        key = (kind, old, scope)
        if key in keys:
            errors.append(f"rename-map.tsv:{number}: duplicate (kind, old, scope) {key!r}")
        keys.add(key)
        outputs[(scope, new)].add(old)
        if kind == "regex":
            try:
                re.compile(old)
            except re.error as exc:
                errors.append(f"rename-map.tsv:{number}: invalid regex: {exc}")
    for (scope, new), olds in outputs.items():
        if len(olds) > 1 and (new, frozenset(olds)) not in merges:
            errors.append(f"unintended map merge in {scope}: {new} <- {', '.join(sorted(olds))}")

    inventory = HERE.parent.parent / "docs/plans/astrid-naming/old-tokens.txt"
    if not inventory.is_file():
        errors.append(f"missing inventory: {inventory}")
    else:
        uncovered = []
        for token in inventory.read_text(encoding="utf-8").splitlines():
            if not token or token in exceptions:
                continue
            if not any(row_spans(row, token) for row in rows) and not any(
                pattern.search(token) for pattern, _ in kept
            ):
                uncovered.append(token)
        for token in uncovered[:100]:
            errors.append(f"old-tokens.txt uncovered: {token}")
        if len(uncovered) > 100:
            errors.append(f"... plus {len(uncovered)-100} more old tokens")

    workspace = HERE.parents[2]
    # The manager's post-deletion rehearsal copies are the authoritative
    # occurrence inventory once all three exist. Worker source checkouts can
    # remain pinned to their pre-deletion branches.
    if all((workspace / "dry" / repo / ".git").exists() for repo in REPOS):
        workspace /= "dry"
    for repo in REPOS:
        root = workspace / repo
        if not root.is_dir():
            errors.append(f"missing source repo: {root}")
            continue
        for path in repo_paths(root):
            if path.startswith(("docs/plans/astrid-naming/", "tools/astrid-rename/")):
                continue
            file = root / path
            if file.is_symlink() or not file.is_file():
                continue
            try:
                data = file.read_bytes()
            except OSError:
                continue
            if b"\0" in data[:8192]:
                continue
            for lineno, line in enumerate(data.decode("utf-8", errors="replace").splitlines(), 1):
                for match in BARE.finditer(line):
                    pos = match.start()
                    if any(m.start() <= pos < m.end() for m in OLD_SCOPE.finditer(line)) or any(
                        m.start() <= pos < m.end() for m in OLD_ENV.finditer(line)
                    ):
                        continue
                    if not covered(line, pos, rows, kept, repo, path):
                        errors.append(f"bare banodoco uncovered: {repo}:{path}:{lineno}: {line[:180]}")
                        if len(errors) >= 400:
                            break
                if len(errors) >= 400:
                    break
            if len(errors) >= 400:
                break

    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        print(f"map selfcheck: FAIL ({len(errors)} findings, capped at 400)", file=sys.stderr)
        return 1
    print(f"map selfcheck: PASS ({len(rows)} rows; {len(kept)} kept patterns; {len(merges)} intended merges)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
