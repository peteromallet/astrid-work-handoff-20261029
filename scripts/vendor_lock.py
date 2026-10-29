#!/usr/bin/env python3
"""Verify/update Astrid's vendored Runtime artifacts against one immutable producer pin.

Usage: ``vendor_lock.py check runtime.lock.json [--producer CHECKOUT]`` or
``vendor_lock.py update runtime.lock.json --producer CHECKOUT``. To select a
release, set ``source_commit`` to its full commit SHA first, then run update.
The update command never changes that selector.
"""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
USAGE = "usage: vendor_lock.py check <lock> [--producer <checkout>] | update <lock> --producer <checkout>"
COMMIT = re.compile(r"[0-9a-f]{40}")


def digest(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def _read(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _rel(path: Path, root: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return str(path)


def _re_vendor(lock_path: Path, lock: dict[str, Any], root: Path) -> str:
    return f"re-vendor with: python scripts/vendor_lock.py update {_rel(lock_path, root)} --producer <{lock['producer']} checkout>"


def _producer_problems(lock: dict[str, Any], producer: Path) -> list[str]:
    problems: list[str] = []
    try:
        head = subprocess.run(["git", "-C", str(producer), "rev-parse", "HEAD"], check=True, capture_output=True, text=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError) as exc:
        return [f"producer checkout unavailable: {exc}"]
    source_commit = lock.get("source_commit")
    if not isinstance(source_commit, str) or not COMMIT.fullmatch(source_commit) or head != source_commit:
        problems.append(f"producer commit: expected {lock.get('source_commit')}, got {head}")
    manifest_path = producer / lock["manifest"]
    try:
        manifest_bytes = manifest_path.read_bytes()
        manifest = json.loads(manifest_bytes)
    except (OSError, ValueError) as exc:
        return [*problems, f"producer manifest unavailable: {exc}"]
    try:
        committed = subprocess.run(["git", "-C", str(producer), "show", f"HEAD:{lock['manifest']}"], check=True, capture_output=True).stdout
    except (OSError, subprocess.CalledProcessError) as exc:
        return [*problems, f"producer manifest is not committed: {exc}"]
    if committed != manifest_bytes:
        problems.append("producer manifest differs from committed HEAD")
    if manifest.get("producer") != lock.get("producer"):
        problems.append(f"producer identity: expected {lock.get('producer')}, got {manifest.get('producer')}")
    if manifest.get("version") != lock.get("producer_version") or not isinstance(manifest.get("version"), str) or not manifest["version"]:
        problems.append("producer manifest version differs from lock")
    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, dict):
        return [*problems, "producer manifest artifacts must be an object"]
    for consumer, entry in lock["files"].items():
        source = entry["from"]
        expected = artifacts.get(source)
        if expected is None:
            problems.append(f"producer artifact missing from manifest: {source}")
            continue
        source_path = producer / source
        if not source_path.is_file():
            problems.append(f"producer artifact missing: {source}")
            continue
        actual = digest(source_path)
        if expected != actual:
            problems.append(f"producer artifact hash is stale: {source}")
        if expected != entry.get("sha256"):
            problems.append(f"producer changed: {source}")
    return problems


def check(lock_path: Path, producer: Path | None = None, root: Path = ROOT) -> list[str]:
    """Return one line per problem (empty list means all pins and bytes hold)."""
    lock_path = Path(lock_path).resolve()
    lock = _read(lock_path)
    problems: list[str] = []
    source_commit = lock.get("source_commit")
    if not isinstance(source_commit, str) or not COMMIT.fullmatch(source_commit):
        problems.append("source_commit must be a full 40-character lowercase SHA")
    for consumer, entry in lock["files"].items():
        try:
            actual = digest(root / consumer)
        except OSError:
            problems.append(f"{consumer}: missing")
            continue
        if actual != entry["sha256"]:
            problems.append(f"{consumer}: edited locally")
    if producer is not None:
        problems.extend(_producer_problems(lock, Path(producer).resolve()))
    return [*problems, _re_vendor(lock_path, lock, root)] if problems else []


def update(lock_path: Path, producer: Path, root: Path = ROOT) -> str:
    """Preflight the complete producer bundle, then copy artifacts and rewrite metadata."""
    lock_path, producer = Path(lock_path).resolve(), Path(producer).resolve()
    lock = _read(lock_path)
    try:
        head = subprocess.run(["git", "-C", str(producer), "rev-parse", "HEAD"], check=True, capture_output=True, text=True).stdout.strip()
        manifest_path = producer / lock["manifest"]
        manifest_bytes = manifest_path.read_bytes()
        manifest = json.loads(manifest_bytes)
        committed = subprocess.run(["git", "-C", str(producer), "show", f"HEAD:{lock['manifest']}"], check=True, capture_output=True).stdout
    except (OSError, ValueError, subprocess.CalledProcessError) as exc:
        raise SystemExit(f"producer preflight failed: {exc}") from exc
    if not COMMIT.fullmatch(head):
        raise SystemExit(f"producer HEAD is not a full commit: {head}")
    source_commit = lock.get("source_commit")
    if not isinstance(source_commit, str) or not COMMIT.fullmatch(source_commit):
        raise SystemExit("runtime.lock.json source_commit must be a full 40-character lowercase SHA")
    if head != source_commit:
        raise SystemExit(f"producer HEAD {head} does not match pinned source_commit {lock.get('source_commit')}")
    if committed != manifest_bytes:
        raise SystemExit("producer manifest differs from committed HEAD")
    if manifest.get("producer") != lock.get("producer"):
        raise SystemExit("producer manifest identity does not match lock")
    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, dict):
        raise SystemExit("producer manifest artifacts must be an object")
    new_entries: dict[str, dict[str, str]] = {}
    verified_bytes: dict[str, bytes] = {}
    for consumer, old in lock["files"].items():
        source = old["from"]
        source_path = producer / source
        if source not in artifacts or not source_path.is_file():
            raise SystemExit(f"producer artifact missing: {source}")
        contents = source_path.read_bytes()
        actual = "sha256:" + hashlib.sha256(contents).hexdigest()
        if artifacts[source] != actual:
            raise SystemExit(f"{source}: producer manifest is stale (run its artifact_manifest.py)")
        new_entries[consumer] = {"from": source, "sha256": actual}
        verified_bytes[consumer] = contents
    version = manifest.get("version")
    if not isinstance(version, str) or not version:
        raise SystemExit("producer manifest version must be a nonempty string")
    # No consumer file is touched until all producer metadata and artifacts pass.
    for consumer, contents in verified_bytes.items():
        target = root / consumer
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(contents)
    lock["files"] = new_entries
    lock["producer_version"] = version
    lock_path.write_text(json.dumps(lock, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return f"updated {_rel(lock_path, root)} from {lock['producer']} {head[:12]}"


def main(argv: list[str]) -> int:
    if len(argv) < 2 or argv[0] not in ("check", "update"):
        print(USAGE, file=sys.stderr)
        return 1
    command, lock_arg, rest = argv[0], argv[1], argv[2:]
    if "--producer" in rest and rest.index("--producer") + 1 >= len(rest):
        print(USAGE, file=sys.stderr)
        return 1
    producer = Path(rest[rest.index("--producer") + 1]).resolve() if "--producer" in rest else None
    if command == "update" and producer is None:
        print(USAGE, file=sys.stderr)
        return 1
    lock_path = Path(lock_arg).resolve()
    if command == "update":
        print(update(lock_path, producer))
        return 0
    problems = check(lock_path, producer)
    if problems:
        print("\n".join(problems), file=sys.stderr)
        return 1
    print(f"ok {_rel(lock_path, ROOT)}{' (matches producer manifest)' if producer else ''}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
