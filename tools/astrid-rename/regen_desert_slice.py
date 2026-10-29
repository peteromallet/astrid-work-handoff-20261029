#!/usr/bin/env python3
"""Regenerate and verify the desert timeline_visualize event hash chain."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import sys
from pathlib import Path
from types import ModuleType
from typing import Any, Callable

FIXTURE_RELATIVE_PATH = "tests/fixtures/timeline_visualize/desert_slice/assembly.jsonl"
SLICE_RELATIVE_DIR = "tests/fixtures/timeline_visualize/desert_slice"
TRUTH_RELATIVE_PATH = "tests/fixtures/timeline_visualize/desert_truth.json"
HASH_TEST_RELATIVE_PATH = "tests/core/timeline/test_timeline_visualize_hashes.py"


def load_rename_engine() -> ModuleType:
    engine_path = Path(__file__).resolve().with_name("rename.py")
    spec = importlib.util.spec_from_file_location("astrid_rename_engine", engine_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load pinned rename engine: {engine_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def load_timeline_schema(repo_root: Path) -> tuple[type, Callable[..., Any], Callable[..., bytes]]:
    repo_text = str(repo_root)
    if repo_text in sys.path:
        sys.path.remove(repo_text)
    sys.path.insert(0, repo_text)
    from astrid.core.timeline.events.schema import (  # noqa: PLC0415
        TimelineEvent,
        canonical_json_bytes,
        with_event_hash,
    )

    return TimelineEvent, with_event_hash, canonical_json_bytes


def parse_events(
    content: str,
    *,
    source: Path,
    timeline_event_type: type,
) -> list[Any]:
    events: list[Any] = []
    for line_number, line in enumerate(content.splitlines(), 1):
        if not line.strip():
            raise ValueError(f"{source}:{line_number}: blank event line")
        try:
            event_data = json.loads(line)
            events.append(timeline_event_type.from_dict(event_data))
        except (json.JSONDecodeError, TypeError, ValueError) as exc:
            raise ValueError(f"{source}:{line_number}: invalid timeline event: {exc}") from exc
    if not events:
        raise ValueError(f"{source}: event chain is empty")
    return events


def verify_chain(
    events: list[Any],
    *,
    source: Path,
    with_event_hash: Callable[..., Any],
) -> str:
    previous_hash: str | None = None
    for line_number, event in enumerate(events, 1):
        if event.prev_hash != previous_hash:
            raise ValueError(
                f"{source}:{line_number}: prev_hash {event.prev_hash!r} "
                f"does not match previous hash {previous_hash!r}"
            )
        recomputed = with_event_hash(event, prev_hash=previous_hash)
        if event.hash != recomputed.hash:
            raise ValueError(
                f"{source}:{line_number}: hash {event.hash!r} "
                f"does not match recomputed hash {recomputed.hash!r}"
            )
        previous_hash = event.hash
    if previous_hash is None:
        raise ValueError(f"{source}: final event has no hash")
    return previous_hash


def mapped_slice_contents(
    repo_root: Path,
    *,
    rename_engine: ModuleType,
    map_rows: list[Any],
) -> tuple[dict[Path, str], int]:
    slice_root = repo_root / SLICE_RELATIVE_DIR
    if not slice_root.is_dir():
        raise FileNotFoundError(f"missing timeline fixture directory: {slice_root}")

    mapped_contents: dict[Path, str] = {}
    replacement_count = 0
    for path in sorted(slice_root.iterdir()):
        if path.is_symlink() or not path.is_file():
            continue
        try:
            original = path.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            raise ValueError(f"fixture is not UTF-8 text: {path}") from exc
        relative = path.relative_to(repo_root).as_posix()
        whole_file_context = rename_engine.whole_astrid(original)
        mapped, count, _warnings = rename_engine.rewrite_text(
            original,
            map_rows,
            "astrid",
            relative,
            whole_file_context,
        )
        mapped_contents[path] = mapped
        replacement_count += count
    return mapped_contents, replacement_count


def rehash_jsonl(
    content: str,
    *,
    source: Path,
    timeline_event_type: type,
    with_event_hash: Callable[..., Any],
    canonical_json_bytes: Callable[..., bytes],
) -> tuple[str, list[Any]]:
    raw_events = parse_events(content, source=source, timeline_event_type=timeline_event_type)
    previous_hash: str | None = None
    updated_events: list[Any] = []
    output_lines: list[str] = []
    for event in raw_events:
        updated = with_event_hash(event, prev_hash=previous_hash)
        updated_events.append(updated)
        output_lines.append(canonical_json_bytes(updated).decode("utf-8"))
        previous_hash = updated.hash
    line_ending = "\n" if content.endswith("\n") else ""
    return "\n".join(output_lines) + line_ending, updated_events


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected a JSON object in {path}")
    return value


def dump_json(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n"


def canonical_file_digest(path: Path, canonical_json_bytes: Callable[..., bytes]) -> str:
    value = json.loads(path.read_text(encoding="utf-8"))
    return hashlib.sha256(canonical_json_bytes(value)).hexdigest()


def canonical_text_digest(content: str, canonical_json_bytes: Callable[..., bytes]) -> str:
    value = json.loads(content)
    return hashlib.sha256(canonical_json_bytes(value)).hexdigest()


def replace_frozen_constant(source: str, name: str, value: str, path: Path) -> str:
    pattern = re.compile(rf'(?m)^({re.escape(name)}\s*=\s*)"[0-9a-f]+"$')
    updated, count = pattern.subn(lambda match: f'{match.group(1)}"{value}"', source)
    if count != 1:
        raise ValueError(f"expected exactly one {name} constant in {path}; found {count}")
    return updated


def prepare_updates(
    repo_root: Path,
    *,
    rename_engine: ModuleType,
    map_rows: list[Any],
    timeline_event_type: type,
    with_event_hash: Callable[..., Any],
    canonical_json_bytes: Callable[..., bytes],
) -> tuple[dict[Path, str], dict[str, str], int]:
    fixture_path = repo_root / FIXTURE_RELATIVE_PATH
    original_jsonl = fixture_path.read_text(encoding="utf-8")
    original_events = parse_events(
        original_jsonl,
        source=fixture_path,
        timeline_event_type=timeline_event_type,
    )
    original_head_hash = verify_chain(
        original_events,
        source=fixture_path,
        with_event_hash=with_event_hash,
    )

    updates, replacement_count = mapped_slice_contents(
        repo_root,
        rename_engine=rename_engine,
        map_rows=map_rows,
    )
    mapped_jsonl = updates.get(fixture_path)
    if mapped_jsonl is None:
        raise FileNotFoundError(f"missing fixture file: {fixture_path}")
    regenerated_jsonl, events = rehash_jsonl(
        mapped_jsonl,
        source=fixture_path,
        timeline_event_type=timeline_event_type,
        with_event_hash=with_event_hash,
        canonical_json_bytes=canonical_json_bytes,
    )
    final_head_hash = verify_chain(
        events,
        source=fixture_path,
        with_event_hash=with_event_hash,
    )
    updates[fixture_path] = regenerated_jsonl

    slice_root = repo_root / SLICE_RELATIVE_DIR
    head_path = slice_root / "assembly.head.json"
    head = json.loads(updates[head_path])
    head.update(
        {
            "event_count": len(events),
            "last_event_id": events[-1].event_id,
            "last_hash": final_head_hash,
            "timeline_id": events[-1].timeline_id,
            "version": len(events),
        }
    )
    updates[head_path] = dump_json(head)

    assembly_path = slice_root / "assembly.json"
    registry_path = slice_root / "registry.json"
    assembly_digest = canonical_text_digest(updates[assembly_path], canonical_json_bytes)
    registry_digest = canonical_text_digest(updates[registry_path], canonical_json_bytes)
    frozen_values = {
        "ASSEMBLY_SHA256": assembly_digest,
        "REGISTRY_SHA256": registry_digest,
        "HEAD_LAST_HASH": final_head_hash,
    }

    truth_path = repo_root / TRUTH_RELATIVE_PATH
    truth = read_json(truth_path)
    truth_event_head = truth.get("event_head")
    truth_hashes = truth.get("hashes")
    if not isinstance(truth_event_head, dict) or not isinstance(truth_hashes, dict):
        raise ValueError(f"missing event_head or hashes object in {truth_path}")
    truth_event_head.update(
        {
            "last_event_id": events[-1].event_id,
            "last_hash": final_head_hash,
            "version": len(events),
        }
    )
    truth_hashes.update(
        {
            "assembly_sha256": assembly_digest,
            "registry_sha256": registry_digest,
            "head_last_hash": final_head_hash,
        }
    )
    updates[truth_path] = dump_json(truth)

    for path in sorted((repo_root / "tests/fixtures/timeline_visualize").rglob("*.json")):
        if path.is_relative_to(slice_root):
            continue
        original = path.read_text(encoding="utf-8")
        base = updates.get(path, original)
        replaced = base.replace(original_head_hash, final_head_hash)
        if replaced != original:
            updates[path] = replaced

    hash_test_path = repo_root / HASH_TEST_RELATIVE_PATH
    hash_test = hash_test_path.read_text(encoding="utf-8")
    for name, value in frozen_values.items():
        hash_test = replace_frozen_constant(hash_test, name, value, hash_test_path)
    updates[hash_test_path] = hash_test
    return updates, frozen_values, replacement_count


def check_updates(repo_root: Path, updates: dict[Path, str]) -> None:
    stale = [path for path, expected in updates.items() if path.read_text(encoding="utf-8") != expected]
    if stale:
        paths = "\n".join(f"  {path.relative_to(repo_root).as_posix()}" for path in stale)
        raise ValueError(f"fixture regeneration is needed; run with --apply:\n{paths}")


def check_chain_artifacts(
    repo_root: Path,
    *,
    events: list[Any],
    final_head_hash: str,
    frozen_values: dict[str, str],
    canonical_json_bytes: Callable[..., bytes],
) -> None:
    slice_root = repo_root / SLICE_RELATIVE_DIR
    fixture_path = repo_root / FIXTURE_RELATIVE_PATH
    head = read_json(slice_root / "assembly.head.json")
    if head.get("last_hash") != final_head_hash:
        raise ValueError("assembly.head.json last_hash does not match the verified chain")
    if head.get("event_count") != len(events) or head.get("version") != len(events):
        raise ValueError("assembly.head.json event_count/version does not match the chain")
    if head.get("last_event_id") != events[-1].event_id:
        raise ValueError("assembly.head.json last_event_id does not match the chain")

    identity = read_json(slice_root / "assembly.identity.json")
    if identity.get("timeline_id") != events[-1].timeline_id:
        raise ValueError("assembly.identity.json timeline_id does not match the chain")

    truth = read_json(repo_root / TRUTH_RELATIVE_PATH)
    truth_timeline = truth.get("timeline")
    if not isinstance(truth_timeline, dict):
        raise ValueError("desert_truth.json is missing its timeline object")
    if truth_timeline.get("uuid") != identity.get("timeline_id"):
        raise ValueError("assembly.identity.json and desert_truth.json timeline ids differ")
    if truth_timeline.get("ulid") != identity.get("timeline_ulid"):
        raise ValueError("assembly.identity.json and desert_truth.json timeline ULIDs differ")
    if truth.get("event_head", {}).get("last_hash") != final_head_hash:
        raise ValueError("desert_truth.json event_head.last_hash does not match the chain")
    if truth.get("event_head", {}).get("last_event_id") != events[-1].event_id:
        raise ValueError("desert_truth.json event_head.last_event_id does not match the chain")
    if truth.get("hashes", {}).get("head_last_hash") != final_head_hash:
        raise ValueError("desert_truth.json hashes.head_last_hash does not match the chain")
    if truth.get("hashes", {}).get("assembly_sha256") != frozen_values["ASSEMBLY_SHA256"]:
        raise ValueError("desert_truth.json assembly digest does not match assembly.json")
    if truth.get("hashes", {}).get("registry_sha256") != frozen_values["REGISTRY_SHA256"]:
        raise ValueError("desert_truth.json registry digest does not match registry.json")

    hash_test = (repo_root / HASH_TEST_RELATIVE_PATH).read_text(encoding="utf-8")
    for name, value in frozen_values.items():
        pattern = re.compile(rf'(?m)^{re.escape(name)}\s*=\s*"([0-9a-f]+)"$')
        matches = pattern.findall(hash_test)
        if matches != [value]:
            raise ValueError(f"{name} in {HASH_TEST_RELATIVE_PATH} does not match regenerated data")

    if canonical_file_digest(slice_root / "assembly.json", canonical_json_bytes) != frozen_values[
        "ASSEMBLY_SHA256"
    ]:
        raise ValueError("assembly.json canonical digest changed after regeneration")
    if canonical_file_digest(slice_root / "registry.json", canonical_json_bytes) != frozen_values[
        "REGISTRY_SHA256"
    ]:
        raise ValueError("registry.json canonical digest changed after regeneration")

    target_ids = {
        identity.get("timeline_id"),
        identity.get("timeline_ulid"),
        truth.get("timeline", {}).get("uuid"),
        truth.get("timeline", {}).get("ulid"),
    }
    target_ids.discard(None)

    def collect_strings(value: Any) -> set[str]:
        if isinstance(value, str):
            return {value}
        if isinstance(value, dict):
            return set().union(*(collect_strings(nested) for nested in value.values()))
        if isinstance(value, list):
            return set().union(*(collect_strings(nested) for nested in value))
        return set()

    current_head = final_head_hash
    for path in (repo_root / "tests/fixtures/timeline_visualize").rglob("*.json"):
        if path.is_relative_to(slice_root):
            continue
        document = json.loads(path.read_text(encoding="utf-8"))
        if not (target_ids & collect_strings(document)):
            continue
        stack = [document]
        while stack:
            value = stack.pop()
            if isinstance(value, dict):
                for key, nested in value.items():
                    if key in {"last_hash", "head_last_hash"} and nested != current_head:
                        raise ValueError(
                            f"{path.relative_to(repo_root).as_posix()}: "
                            f"{key} does not match the verified chain head"
                        )
                    if isinstance(nested, (dict, list)):
                        stack.append(nested)
            elif isinstance(value, list):
                stack.extend(value)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, type=Path, help="Astrid repository root")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--apply", action="store_true", help="rewrite fixtures and frozen values")
    mode.add_argument("--check", action="store_true", help="verify mapped fixtures and every chain link")
    args = parser.parse_args(argv)

    repo_root = args.repo.expanduser().resolve()
    rename_engine = load_rename_engine()
    map_rows = rename_engine.parse_map()
    timeline_event_type, with_event_hash, canonical_json_bytes = load_timeline_schema(repo_root)
    updates, frozen_values, replacement_count = prepare_updates(
        repo_root,
        rename_engine=rename_engine,
        map_rows=map_rows,
        timeline_event_type=timeline_event_type,
        with_event_hash=with_event_hash,
        canonical_json_bytes=canonical_json_bytes,
    )

    if args.check:
        fixture_path = repo_root / FIXTURE_RELATIVE_PATH
        events = parse_events(
            fixture_path.read_text(encoding="utf-8"),
            source=fixture_path,
            timeline_event_type=timeline_event_type,
        )
        head_hash = verify_chain(events, source=fixture_path, with_event_hash=with_event_hash)
        check_chain_artifacts(
            repo_root,
            events=events,
            final_head_hash=head_hash,
            frozen_values=frozen_values,
            canonical_json_bytes=canonical_json_bytes,
        )
        check_updates(repo_root, updates)
        print(f"OK: verified {len(events)} events from genesis to {head_hash}")
        return 0

    changed_paths: list[str] = []
    for path, content in sorted(updates.items(), key=lambda item: item[0].as_posix()):
        if path.read_text(encoding="utf-8") == content:
            continue
        path.write_text(content, encoding="utf-8")
        changed_paths.append(path.relative_to(repo_root).as_posix())

    fixture_path = repo_root / FIXTURE_RELATIVE_PATH
    events = parse_events(
        fixture_path.read_text(encoding="utf-8"),
        source=fixture_path,
        timeline_event_type=timeline_event_type,
    )
    head_hash = verify_chain(events, source=fixture_path, with_event_hash=with_event_hash)
    check_chain_artifacts(
        repo_root,
        events=events,
        final_head_hash=head_hash,
        frozen_values=frozen_values,
        canonical_json_bytes=canonical_json_bytes,
    )
    print(
        f"Updated {len(changed_paths)} files; mapped {replacement_count} occurrences; "
        f"verified {len(events)} events from genesis to {head_hash}"
    )
    for relative in changed_paths:
        print(f"  {relative}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (FileNotFoundError, OSError, RuntimeError, ValueError) as exc:
        print(f"regen_desert_slice: {exc}", file=sys.stderr)
        raise SystemExit(1)
