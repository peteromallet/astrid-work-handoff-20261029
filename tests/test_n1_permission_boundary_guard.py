from __future__ import annotations

import ast
from pathlib import Path


REPO = Path(__file__).resolve().parents[1]
PLATFORM_HELPERS = "astrid/core/execution/platform_helpers.py"


def _attribute_has(node: ast.AST, name: str) -> bool:
    return any(isinstance(child, ast.Attribute) and child.attr == name for child in ast.walk(node))


def permission_predicates(source: str) -> list[str]:
    tree = ast.parse(source)
    found = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Compare):
            continue
        operands = [node.left, *node.comparators]
        if any(
            isinstance(part, ast.BinOp)
            and isinstance(part.op, ast.BitAnd)
            and _attribute_has(part, "st_mode")
            and any(isinstance(value, ast.Constant) and value.value == 0o777 for value in ast.walk(part))
            for operand in operands for part in ast.walk(operand)
        ):
            found.append("mode-mask")
        if any(isinstance(op, (ast.Eq, ast.NotEq)) for op in node.ops) and any(
            isinstance(part, ast.Call)
            and ((isinstance(part.func, ast.Attribute) and part.func.attr == "S_IMODE")
                 or (isinstance(part.func, ast.Name) and part.func.id == "S_IMODE"))
            for operand in operands for part in ast.walk(operand)
        ):
            found.append("s-imode")
        if _attribute_has(node, "st_uid"):
            identity_tuple = (
                any(
                    isinstance(operand, (ast.Tuple, ast.List))
                    and all(any(isinstance(part, ast.Attribute) and part.attr == field for part in ast.walk(operand))
                            for field in ("st_dev", "st_ino", "st_uid"))
                    for operand in operands
                )
            )
            if not identity_tuple:
                found.append("current-uid")
    return found


def test_production_uses_platform_boundary_for_permission_decisions():
    violations = []
    for path in (REPO / "astrid").rglob("*.py"):
        relative = path.relative_to(REPO).as_posix()
        if relative == PLATFORM_HELPERS:
            continue
        for predicate in permission_predicates(path.read_text(encoding="utf-8")):
            violations.append(f"{relative}: {predicate}")
    assert violations == []


def test_guard_rejects_forbidden_permission_examples_and_keeps_identity_tuples():
    examples = [
        ("credential.stat().st_mode & 0o777 != 0o600", "mode-mask"),
        ("stat.S_IMODE(info.st_mode) == 0o700", "s-imode"),
        ("S_IMODE(info.st_mode) != 0o600", "s-imode"),
        ("facts.st_uid == os.getuid()", "current-uid"),
        ("facts.st_uid == os.geteuid()", "current-uid"),
        ("facts.st_uid != expected_uid", "current-uid"),
    ]
    for source, predicate in examples:
        assert predicate in permission_predicates(source)
    identity = "(before.st_dev, before.st_ino, before.st_uid) != (after.st_dev, after.st_ino, after.st_uid)"
    assert permission_predicates(identity) == []
