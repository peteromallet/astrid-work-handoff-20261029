#!/usr/bin/env python3
"""Apply the data-driven Astrid naming map to repository files or text."""

from __future__ import annotations

import argparse
import functools
import fnmatch
import os
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence


HERE = Path(__file__).resolve().parent
MAP_PATH = HERE / "rename-map.tsv"
SKIP_PATH = HERE / "rename-skip.txt"
REPO_ALIASES = {
    "astrid-agent": "astrid",
    "astrid": "astrid",
    "reigh-app": "app",
    "astrid-app": "app",
    "app": "app",
    "banodoco-workspace-runtime": "runtime",
    "astrid-runtime": "runtime",
    "runtime": "runtime",
}
KIND_ORDER = {"regex": 0, "path": 1, "token": 2, "word": 2, "prose": 2}


class RenameError(Exception):
    """A problem in the map or an unsafe filesystem operation."""


@dataclass(frozen=True)
class Rule:
    kind: str
    old: str
    new: str
    scope: str
    note: str
    order: int

    @property
    def compiled(self) -> re.Pattern[str] | None:
        if self.kind == "regex":
            return compile_regex(self.old)
        return None


@functools.lru_cache(maxsize=None)
def compile_regex(expression: str) -> re.Pattern[str]:
    return re.compile(expression)


def parse_map(path: Path = MAP_PATH) -> list[Rule]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise RenameError(f"cannot read map {path}: {exc}") from exc
    if not lines:
        raise RenameError(f"map is empty: {path}")
    expected = ["kind", "old", "new", "scope", "note"]
    if lines[0].split("\t") != expected:
        expected_header = "\t".join(expected)
        raise RenameError(f"map header must be: {expected_header}")

    rows: list[Rule] = []
    for lineno, line in enumerate(lines[1:], 2):
        if not line or line.startswith("#"):
            continue
        cells = line.split("\t")
        if len(cells) != 5:
            raise RenameError(f"{path}:{lineno}: expected five tab-separated fields")
        kind, old, new, scope, note = cells
        if kind not in KIND_ORDER:
            raise RenameError(f"{path}:{lineno}: unknown kind {kind!r}")
        if not old:
            raise RenameError(f"{path}:{lineno}: old value must not be empty")
        if scope not in {"all", "mixed", "astrid", "runtime", "app"} and not re.fullmatch(
            r"(?:astrid|runtime|app):.+", scope
        ):
            raise RenameError(f"{path}:{lineno}: invalid scope {scope!r}")
        if scope == "mixed" and kind != "prose":
            raise RenameError(f"{path}:{lineno}: mixed scope is only valid for prose rows")
        if kind == "regex":
            try:
                compiled = re.compile(old)
            except re.error as exc:
                raise RenameError(f"{path}:{lineno}: invalid regex: {exc}") from exc
            if compiled.match(""):
                raise RenameError(f"{path}:{lineno}: regex must not match an empty string")
        rows.append(Rule(kind, old, new, scope, note, len(rows)))

    def scope_order(rule: Rule) -> tuple[int, int]:
        if ":" in rule.scope:
            return (0, -len(rule.scope.partition(":")[2]))
        if rule.scope in {"astrid", "runtime", "app"}:
            return (1, 0)
        if rule.kind == "prose" and rule.scope == "mixed":
            # Manager decision in QUESTIONS.md: mixed prose overrides all prose.
            return (2, 0)
        if rule.scope == "all":
            return (3, 0)
        return (4, 0)

    rows.sort(
        key=lambda row: (
            KIND_ORDER[row.kind],
            -len(row.old),
            *scope_order(row),
            row.order,
        )
    )
    return rows


def read_list(path: Path) -> list[str]:
    if not path.exists():
        return []
    try:
        raw_lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise RenameError(f"cannot read list {path}: {exc}") from exc
    result: list[str] = []
    for line in raw_lines:
        entry = line.split("#", 1)[0].strip().replace("\\", "/")
        if entry:
            result.append(entry.lstrip("./"))
    return result


def list_matches(relative_path: str, entries: Sequence[str]) -> bool:
    relative_path = relative_path.replace("\\", "/").lstrip("./")
    for entry in entries:
        entry = entry.replace("\\", "/").lstrip("./")
        if entry.endswith("/"):
            directory = entry[:-1]
            if relative_path == directory or relative_path.startswith(directory + "/"):
                return True
        elif fnmatch.fnmatchcase(relative_path, entry):
            return True
    return False


def canonical_repo(name: str | None) -> str | None:
    if name is None:
        return None
    lowered = name.lower().strip().removesuffix(".git")
    if lowered not in REPO_ALIASES:
        raise RenameError(f"unknown repo name {name!r}; expected astrid, runtime, or app")
    return REPO_ALIASES[lowered]


def git_root(path: Path) -> Path:
    result = subprocess.run(
        ["git", "-C", str(path), "rev-parse", "--show-toplevel"],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if result.returncode:
        message = result.stderr.strip() or "not inside a git repository"
        raise RenameError(f"{path}: {message}")
    return Path(result.stdout.strip()).resolve()


def repo_name(root: Path) -> str:
    result = subprocess.run(
        ["git", "-C", str(root), "remote", "get-url", "origin"],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if result.returncode:
        raise RenameError(f"{root}: cannot identify repo from origin remote")
    url = result.stdout.strip().rstrip("/")
    leaf = url.rsplit("/", 1)[-1].removesuffix(".git")
    try:
        return canonical_repo(leaf) or ""
    except RenameError as exc:
        raise RenameError(f"{root}: unsupported origin URL {url!r}") from exc


def repo_files(root: Path) -> list[Path]:
    result = subprocess.run(
        ["git", "-C", str(root), "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if result.returncode:
        message = result.stderr.decode("utf-8", errors="replace").strip()
        raise RenameError(f"{root}: git ls-files failed: {message}")
    paths = [root / os.fsdecode(item) for item in result.stdout.split(b"\0") if item]
    return sorted(paths, key=lambda item: item.as_posix())


def path_root_and_files(inputs: Sequence[str]) -> tuple[Path, list[Path]]:
    absolute = [Path(value).expanduser().absolute() for value in inputs]
    if not absolute:
        raise RenameError("--path needs at least one file or directory")
    for path in absolute:
        if not path.exists():
            raise RenameError(f"path does not exist: {path}")
    anchors = [path if path.is_dir() and not path.is_symlink() else path.parent for path in absolute]
    root = Path(os.path.commonpath([str(path) for path in anchors])).resolve()
    found: set[Path] = set()
    for path in absolute:
        if path.is_symlink():
            continue
        if path.is_file():
            found.add(path)
        elif path.is_dir():
            for directory, dirnames, filenames in os.walk(path, followlinks=False):
                dirnames[:] = sorted(
                    name for name in dirnames if name != ".git" and not (Path(directory) / name).is_symlink()
                )
                for filename in filenames:
                    found.add(Path(directory) / filename)
    return root, sorted(found, key=lambda item: item.as_posix())


def row_scope_applies(rule: Rule, repo: str | None, relative_path: str, mixed_file: bool) -> bool:
    scope = rule.scope
    if scope == "all":
        return True
    if scope == "mixed":
        return rule.kind == "prose" and mixed_file
    if ":" in scope:
        expected_repo, glob = scope.split(":", 1)
        return repo == expected_repo and fnmatch.fnmatchcase(relative_path, glob)
    return repo == scope


def word_variants(rule: Rule) -> list[tuple[str, str]]:
    old = rule.old
    lowered = old.lower()
    titled = old[:1].upper() + old[1:].lower()
    uppered = old.upper()
    variants = [(lowered, rule.new.lower()), (titled, rule.new[:1].upper() + rule.new[1:].lower()), (uppered, rule.new.upper())]
    unique: dict[str, str] = {}
    for before, after in variants:
        unique.setdefault(before, after)
    return list(unique.items())


@dataclass(frozen=True)
class LiteralMatcher:
    compiled: re.Pattern[str] | None
    branches: dict[str, tuple[Rule, str, int]]
    case_pattern: re.Pattern[str] | None
    case_branches: dict[str, tuple[Rule, int, frozenset[str]]]


@functools.lru_cache(maxsize=512)
def literal_matcher(rows: tuple[Rule, ...]) -> LiteralMatcher:
    alternatives: list[str] = []
    branches: dict[str, tuple[Rule, str, int]] = {}
    case_alternatives: list[str] = []
    case_branches: dict[str, tuple[Rule, int, frozenset[str]]] = {}
    branch_index = 0

    for priority, rule in enumerate(rows):
        if rule.kind == "regex":
            continue
        variants = word_variants(rule) if rule.kind == "word" else [(rule.old, rule.new)]
        if rule.kind == "word":
            case_name = f"C{len(case_branches)}"
            case_alternatives.append(f"(?P<{case_name}>{re.escape(rule.old)})")
            case_branches[case_name] = (rule, priority, frozenset(before for before, _ in variants))
        for old, new in variants:
            expression = re.escape(old)
            if rule.kind == "prose":
                expression = rf"(?<![\w./-]){expression}(?![\w./-])"
            group_name = f"M{branch_index}"
            branch_index += 1
            alternatives.append(f"(?P<{group_name}>{expression})")
            branches[group_name] = (rule, new, priority)

    combined = re.compile("|".join(alternatives)) if alternatives else None
    case_combined = re.compile("|".join(case_alternatives), re.IGNORECASE) if case_alternatives else None
    return LiteralMatcher(combined, branches, case_combined, case_branches)


def whole_astrid(text: str) -> bool:
    return re.search(r"(?<!\w)Astrid(?!\w)", text) is not None


@functools.lru_cache(maxsize=128)
def prose_pattern(old: str) -> re.Pattern[str]:
    return re.compile(rf"(?<![\w./-]){re.escape(old)}(?![\w./-])")


def mixed_prose_fires(text: str, rows: Sequence[Rule], repo: str, relative_path: str) -> bool:
    if not whole_astrid(text):
        return False
    return any(
        rule.kind == "prose"
        and rule.scope == "mixed"
        and row_scope_applies(rule, repo, relative_path, True)
        and prose_pattern(rule.old).search(text)
        for rule in rows
    )


def rewrite_text(
    text: str,
    rows: Sequence[Rule],
    repo: str | None,
    relative_path: str,
    mixed_context: bool | None = None,
) -> tuple[str, int, list[tuple[int, str]]]:
    mixed_file = whole_astrid(text) if mixed_context is None else mixed_context
    applicable = tuple(rule for rule in rows if row_scope_applies(rule, repo, relative_path, mixed_file))
    matcher = literal_matcher(applicable)
    events: dict[int, list[tuple[int, int, str, Rule]]] = {}
    case_warnings: dict[int, tuple[int, int, str]] = {}

    if matcher.compiled:
        for match in matcher.compiled.finditer(text):
            rule, replacement, priority = matcher.branches[match.lastgroup]
            events.setdefault(match.start(), []).append((priority, match.end(), replacement, rule))

    for priority, rule in enumerate(applicable):
        if rule.kind != "regex":
            continue
        compiled = rule.compiled
        search_position = 0
        while search_position <= len(text):
            match = compiled.search(text, search_position)
            if match is None:
                break
            if match.end() == match.start():
                raise RenameError(f"regex row {rule.old!r} matched an empty string")
            replacement = expand_replacement(rule.new, match)
            events.setdefault(match.start(), []).append((priority, match.end(), replacement, rule))
            search_position = match.start() + 1

    if matcher.case_pattern:
        search_position = 0
        while search_position < len(text):
            match = matcher.case_pattern.search(text, search_position)
            if match is None:
                break
            rule, priority, valid_spellings = matcher.case_branches[match.lastgroup]
            spelling = match.group(0)
            if spelling not in valid_spellings:
                current = case_warnings.get(match.start())
                if current is None or priority < current[0]:
                    case_warnings[match.start()] = (priority, match.end(), spelling)
            search_position = match.start() + 1

    output: list[str] = []
    warnings: list[tuple[int, str]] = []
    position = 0
    replacements = 0
    positions = sorted(set(events) | set(case_warnings))
    for start in positions:
        if start < position:
            continue
        output.append(text[position:start])
        choices = events.get(start, [])
        if choices:
            _, end, replacement, rule = min(choices, key=lambda item: item[0])
            output.append(replacement)
            replacements += 1
            if rule.scope == "mixed":
                warnings.append((text.count("\n", 0, start) + 1, text[start:end]))
            position = end
            continue
        _, _, spelling = case_warnings[start]
        warnings.append((text.count("\n", 0, start) + 1, "CASE:" + spelling))
        output.append(text[start])
        position = start + 1

    output.append(text[position:])
    return "".join(output), replacements, warnings


def _prose_boundaries(text: str, start: int, end: int) -> bool:
    forbidden = set("_-./")
    if start and (text[start - 1].isalnum() or text[start - 1] in forbidden):
        return False
    if end < len(text) and (text[end].isalnum() or text[end] in forbidden):
        return False
    return True


def expand_replacement(replacement: str, match: re.Match[str]) -> str:
    """Expand numeric/named groups while preserving literal regex escapes."""
    output: list[str] = []
    position = 0
    while position < len(replacement):
        if replacement[position] != "\\" or position + 1 >= len(replacement):
            output.append(replacement[position])
            position += 1
            continue
        next_char = replacement[position + 1]
        if next_char.isdigit() and next_char != "0":
            end = position + 2
            while end < len(replacement) and replacement[end].isdigit():
                end += 1
            group_number = replacement[position + 1 : end]
            try:
                output.append(match.group(int(group_number)) or "")
            except IndexError as exc:
                raise RenameError(f"replacement refers to missing group {group_number}") from exc
            position = end
            continue
        if replacement.startswith(r"\g<", position):
            end = replacement.find(">", position + 3)
            if end < 0:
                raise RenameError(f"invalid replacement group reference {replacement[position:]!r}")
            group_name = replacement[position + 3 : end]
            try:
                output.append(match.group(group_name) or "")
            except (IndexError, KeyError) as exc:
                raise RenameError(f"replacement refers to missing group {group_name!r}") from exc
            position = end + 1
            continue
        if next_char == "\\":
            output.append("\\")
            position += 2
            continue
        # The map uses a single backslash to preserve escaped forms such as
        # `com\.reigh\.` when the replacement is not a capture group.
        output.append("\\" + next_char)
        position += 2
    return "".join(output)


def is_binary(path: Path) -> bool:
    try:
        with path.open("rb") as stream:
            return b"\0" in stream.read(8192)
    except OSError:
        return True


def rewrite_path(relative_path: str, rows: Sequence[Rule], repo: str | None, mixed_file: bool) -> str:
    output: list[str] = []
    position = 0
    while position < len(relative_path):
        chosen: tuple[int, str] | None = None
        for rule in rows:
            if rule.kind != "path" or not row_scope_applies(rule, repo, relative_path, mixed_file):
                continue
            if relative_path.startswith(rule.old, position):
                chosen = (position + len(rule.old), rule.new)
                break
        if chosen:
            end, replacement = chosen
            output.append(replacement)
            position = end
        else:
            output.append(relative_path[position])
            position += 1
    return "".join(output)


@dataclass
class FilePlan:
    source: Path
    relative: str
    target_relative: str
    content: bytes
    rewritten_content: bytes
    replacements: int
    warnings: list[tuple[int, str]]


def make_plans(
    root: Path,
    files: Iterable[Path],
    rows: Sequence[Rule],
    repo: str | None,
    skip_entries: Sequence[str],
) -> list[FilePlan]:
    plans: list[FilePlan] = []
    for path in files:
        if path.is_symlink() or not path.is_file():
            continue
        try:
            relative = path.relative_to(root).as_posix()
        except ValueError:
            raise RenameError(f"{path}: not under scan root {root}")
        if ".git/" in relative or relative == ".git" or list_matches(relative, skip_entries):
            continue
        if is_binary(path):
            continue
        original_bytes = path.read_bytes()
        original_text = original_bytes.decode("utf-8", errors="surrogateescape")
        rewritten_text, replacements, warnings = rewrite_text(original_text, rows, repo, relative)
        target_relative = rewrite_path(relative, rows, repo, whole_astrid(original_text))
        plans.append(
            FilePlan(
                path,
                relative,
                target_relative,
                original_bytes,
                rewritten_text.encode("utf-8", errors="surrogateescape"),
                replacements,
                warnings,
            )
        )
    return plans


def validate_moves(plans: Sequence[FilePlan], root: Path) -> None:
    targets: dict[str, str] = {}
    for plan in plans:
        target = plan.target_relative
        if target == plan.relative:
            continue
        previous = targets.get(target)
        if previous is not None and previous != plan.relative:
            raise RenameError(f"two files would move to {target}: {previous} and {plan.relative}")
        targets[target] = plan.relative
        target_path = root / target
        case_only = target.casefold() == plan.relative.casefold()
        if target_path.exists():
            same_file = False
            if case_only:
                try:
                    same_file = os.path.samefile(plan.source, target_path)
                except OSError:
                    same_file = False
            if not same_file:
                raise RenameError(f"move target already exists: {target}")


def emit_warnings(path: str, warnings: Sequence[tuple[int, str]]) -> None:
    for line, spelling in warnings:
        if spelling.startswith("CASE:"):
            print(f"mixed-case: {path}:{line}:{spelling[5:]}", file=sys.stderr)
        else:
            print(f"mixed-prose: {path}:{line}:{spelling}", file=sys.stderr)


def apply_plans(plans: Sequence[FilePlan], root: Path) -> None:
    for plan in sorted(plans, key=lambda item: (-item.relative.count("/"), item.relative)):
        if plan.target_relative == plan.relative:
            continue
        source = root / plan.relative
        target = root / plan.target_relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if plan.target_relative.casefold() == plan.relative.casefold():
            fd, temporary_name = tempfile.mkstemp(prefix=".astrid-rename-", dir=source.parent)
            os.close(fd)
            temporary = Path(temporary_name)
            temporary.unlink()
            os.rename(source, temporary)
            os.rename(temporary, target)
        else:
            os.rename(source, target)

    old_directories: set[Path] = set()
    for plan in plans:
        parent = plan.source.parent
        while parent != root and root in parent.parents:
            old_directories.add(parent)
            parent = parent.parent
    for directory in sorted(old_directories, key=lambda item: (-len(item.parts), item.as_posix())):
        try:
            directory.rmdir()
        except OSError:
            pass

    for plan in sorted(plans, key=lambda item: (-item.relative.count("/"), item.relative)):
        if plan.rewritten_content == plan.content:
            continue
        destination = root / plan.target_relative
        destination.write_bytes(plan.rewritten_content)


def run_files(
    root: Path,
    files: Sequence[Path],
    repo: str | None,
    rows: Sequence[Rule],
    apply: bool,
    label: str,
) -> int:
    skip_entries = read_list(SKIP_PATH)
    plans = make_plans(root, files, rows, repo, skip_entries)
    validate_moves(plans, root)
    changed_files = 0
    content_changes = 0
    path_moves = 0
    for plan in plans:
        emit_warnings(plan.relative, plan.warnings)
        content_changed = plan.rewritten_content != plan.content
        moved = plan.target_relative != plan.relative
        if content_changed or moved:
            changed_files += 1
            content_changes += plan.replacements
            path_moves += int(moved)
            action = f" -> {plan.target_relative}" if moved else ""
            print(f"{plan.relative}: {plan.replacements} replacements{action}")
    if apply:
        apply_plans(plans, root)
    print(
        f"{label}: files={len(plans)} changed={changed_files} "
        f"replacements={content_changes} path_moves={path_moves} applied={str(apply).lower()}"
    )
    return 0


TOKEN_PATTERNS = (re.compile(r"[A-Za-z0-9_]+"), re.compile(r"[A-Za-z0-9_.-]+"))
STUTTER_PATTERNS = (
    re.compile(r"(?i)astrid[-_.]?astrid"),
    re.compile(r"(?i)(?<![a-z])app[-_.]?app(?![a-z])"),
)


def lexical_tokens(text: str) -> set[str]:
    return {match.group(0) for pattern in TOKEN_PATTERNS for match in pattern.finditer(text)}


def token_relevant_rows(token: str, rows: Sequence[Rule]) -> tuple[Rule, ...]:
    relevant: list[Rule] = []
    for rule in rows:
        if rule.kind == "regex":
            if rule.compiled.search(token):
                relevant.append(rule)
        elif rule.kind == "word":
            if any(before in token for before, _ in word_variants(rule)):
                relevant.append(rule)
        elif rule.old in token:
            relevant.append(rule)
    return tuple(relevant)


def read_intended(path: Path) -> set[tuple[str, frozenset[str]]]:
    entries: set[tuple[str, frozenset[str]]] = set()
    if not path.exists():
        return entries
    for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        cells = line.split("\t", 2)
        if len(cells) < 2 or not cells[0] or not cells[1]:
            raise RenameError(f"{path}:{lineno}: expected new<TAB>old1,old2<TAB>reason")
        olds = frozenset(part.strip() for part in cells[1].split(",") if part.strip())
        entries.add((cells[0], olds))
    return entries


def report_merges(repo_paths: Sequence[str], rows: Sequence[Rule], intended_path: Path) -> int:
    before: set[str] = set()
    unchanged_tokens: set[str] = set()
    transformed: dict[str, set[str]] = {}
    mixed_files: set[str] = set()
    mapped_cache: dict[tuple[str, int, bool], str] = {}
    relevant_cache: dict[tuple[str, int], tuple[Rule, ...]] = {}
    scope_signatures: dict[tuple[Rule, ...], int] = {}
    for repo_arg in repo_paths:
        supplied = Path(repo_arg).expanduser().absolute()
        root = git_root(supplied)
        repo = repo_name(root)
        skip_entries = read_list(SKIP_PATH)
        for file_path in repo_files(root):
            if file_path.is_symlink() or not file_path.is_file() or is_binary(file_path):
                continue
            relative = file_path.relative_to(root).as_posix()
            if ".git/" in relative or list_matches(relative, skip_entries):
                continue
            original = file_path.read_bytes().decode("utf-8", errors="surrogateescape")
            mixed_context = whole_astrid(original)
            if mixed_prose_fires(original, rows, repo, relative):
                mixed_files.add(f"{repo}/{relative}")
            tokens = lexical_tokens(original)
            before.update(tokens)
            applicable_rows = tuple(
                rule for rule in rows if row_scope_applies(rule, repo, relative, mixed_context)
            )
            scope_signature = scope_signatures.get(applicable_rows)
            if scope_signature is None:
                scope_signature = len(scope_signatures)
                scope_signatures[applicable_rows] = scope_signature
            for token in tokens:
                key = (token, scope_signature, mixed_context)
                mapped = mapped_cache.get(key)
                if mapped is None:
                    relevant_key = (token, scope_signature)
                    candidate_rows = relevant_cache.get(relevant_key)
                    if candidate_rows is None:
                        candidate_rows = token_relevant_rows(token, applicable_rows)
                        relevant_cache[relevant_key] = candidate_rows
                    if candidate_rows:
                        mapped, _, _ = rewrite_text(token, candidate_rows, repo, relative, mixed_context)
                    else:
                        mapped = token
                    mapped_cache[key] = mapped
                if mapped != token:
                    transformed.setdefault(mapped, set()).add(token)
                else:
                    unchanged_tokens.add(token)

    preexisting: set[tuple[str, frozenset[str]]] = set()
    for new, olds in transformed.items():
        if new in unchanged_tokens:
            for old in olds:
                preexisting.add((new, frozenset({old})))

    merged = {
        (new, frozenset(olds))
        for new, olds in transformed.items()
        if len(olds) > 1
    }
    stutters: set[tuple[str, frozenset[str]]] = set()
    for new, olds in transformed.items():
        if new in before:
            continue
        if any(pattern.search(new) for pattern in STUTTER_PATTERNS):
            stutters.add((new, frozenset(olds)))

    intended = read_intended(intended_path)
    categories = [
        ("pre-existing target collisions", preexisting),
        ("old tokens mapping to one new token", merged),
        ("stutter tokens", stutters),
    ]
    failures = False
    for title, items in categories:
        print(f"{title}:")
        for new, olds in sorted(items, key=lambda item: (item[0], sorted(item[1]))):
            allowed = (new, olds) in intended
            if not allowed:
                failures = True
            print(f"  {new} <- {', '.join(sorted(olds))}" + (" [intended]" if allowed else ""))
        if not items:
            print("  (none)")
    print("mixed prose files:")
    for path in sorted(mixed_files):
        print(f"  {path}")
    if not mixed_files:
        print("  (none)")
    return 1 if failures else 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--repo", metavar="PATH")
    source.add_argument("--path", nargs="+", metavar="FILE_OR_DIR")
    source.add_argument("--text", action="store_true")
    parser.add_argument("--as", dest="as_repo", metavar="REPO")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--report-merges", action="store_true")
    parser.add_argument("--repos", nargs="+", metavar="PATH")
    parser.add_argument("--intended", metavar="FILE")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.report_merges:
        if not args.repos:
            parser.error("--report-merges requires --repos")
        if args.repo or args.path or args.text or args.apply or args.as_repo:
            parser.error("--report-merges cannot be combined with --repo, --path, --text, --as, or --apply")
    elif args.repos or args.intended:
        parser.error("--repos and --intended require --report-merges")
    elif not (args.repo or args.path or args.text):
        parser.error("choose one of --repo, --path, --text, or --report-merges")
    if args.as_repo and not (args.path or args.text):
        parser.error("--as can only be used with --path or --text")
    if args.apply and args.text:
        parser.error("--apply cannot be used with --text")

    try:
        rows = parse_map()
        if args.report_merges:
            intended = Path(args.intended).expanduser() if args.intended else HERE / "intended-merges.txt"
            return report_merges(args.repos, rows, intended)
        if args.repo:
            root = git_root(Path(args.repo).expanduser().absolute())
            repo = repo_name(root)
            return run_files(root, repo_files(root), repo, rows, args.apply, f"repo={repo}")
        if args.path:
            root, files = path_root_and_files(args.path)
            repo = canonical_repo(args.as_repo)
            return run_files(root, files, repo, rows, args.apply, f"path={root}")
        if args.text:
            repo = canonical_repo(args.as_repo)
            original = sys.stdin.read()
            rewritten, _, warnings = rewrite_text(original, rows, repo, "")
            emit_warnings("<stdin>", warnings)
            sys.stdout.write(rewritten)
            return 0
    except (OSError, RenameError, re.error) as exc:
        print(f"rename.py: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
