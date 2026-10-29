"""Validated, digest-bound model-root bindings for VibeComfy execution.

The readiness profile is the existing worker-owned authority for this fact.  This
module only validates and transports the profile's declared binding; it does not
discover models, download them, or create another model registry.  Reusable byte
qualification also needs a trusted deployment-provided ``qualification_identity``
that binds the installed model storage or release. Current readiness profiles do
not provide that identity; absent it, every qualification hashes the full inventory
and no stat-only receipt is reused or issued.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import stat as stat_module
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator, Mapping

MODEL_ROOT_ENV = "ASTRID_VIBECOMFY_MODELS_ROOT"
MODEL_ROOT_BINDING_ENV = "ASTRID_VIBECOMFY_MODEL_ROOT_BINDING"
MODEL_ROOT_QUALIFICATION_RECEIPT_DIR_ENV = (
    "ASTRID_VIBECOMFY_MODEL_QUALIFICATION_RECEIPT_DIR"
)
_SHA256 = "sha256:"
_QUALIFICATION_VERIFIER_VERSION = "model-root-bytes-v1"
_VERIFICATION_DIRECTORY = (".vibecomfy", "model-verification")
_VERIFICATION_NAME = re.compile(r"[0-9a-f]{64}\.json\Z")


class ModelRootBindingError(ValueError):
    """A model-root binding is absent, malformed, or no longer true."""


@contextmanager
def use_attested_vibecomfy_models_root(bundle: Any, root: Path) -> Iterator[None]:
    """Compile *bundle* against one verified VibeComfy model root.

    The pinned VibeComfy compiler receives the same root through its explicit
    ``models_root`` keyword; the scoped environment value remains available to
    lower-level runtime consumers. Reject workflow metadata that would silently
    redirect model reconciliation elsewhere.
    """
    workflow = getattr(bundle, "workflow", None)
    metadata = getattr(workflow, "metadata", {})
    if isinstance(metadata, Mapping) and metadata.get("models_root") is not None:
        declared = metadata["models_root"]
        if not isinstance(declared, (str, Path)) or not Path(declared).is_absolute():
            raise ModelRootBindingError("workflow models_root must be an absolute path")
        if Path(declared).resolve() != root.resolve():
            raise ModelRootBindingError(
                "workflow models_root disagrees with the attested model-root binding"
            )

    env_name = "VIBECOMFY_MODELS_ROOT"
    root = _root_path(str(root), verify_files=False)
    previous = os.environ.get(env_name)
    os.environ[env_name] = str(root)
    try:
        yield
    finally:
        if previous is None:
            os.environ.pop(env_name, None)
        else:
            os.environ[env_name] = previous


def _digest(value: Any, *, label: str) -> str:
    if not isinstance(value, str) or not value.startswith(_SHA256):
        raise ModelRootBindingError(f"model-root {label} must be a sha256 digest")
    suffix = value[len(_SHA256):]
    if len(suffix) != 64 or any(char not in "0123456789abcdef" for char in suffix):
        raise ModelRootBindingError(f"model-root {label} must be a lowercase sha256 digest")
    return value


def _canonical_inventory_digest(entries: list[dict[str, Any]]) -> str:
    normalized_entries = []
    for entry in entries:
        normalized = dict(entry)
        if normalized.get("subdir") == ".":
            normalized["subdir"] = ""
        normalized_entries.append(normalized)
    payload = json.dumps(
        normalized_entries,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    return _SHA256 + hashlib.sha256(payload).hexdigest()


def _safe_relative(value: Any, *, label: str, allow_empty: bool) -> str:
    if not isinstance(value, str):
        raise ModelRootBindingError(f"model-root {label} must be a string")
    if not allow_empty and not value:
        raise ModelRootBindingError(f"model-root {label} must not be empty")
    if allow_empty and value in {"", "."}:
        return ""
    if "\\" in value:
        raise ModelRootBindingError(f"model-root {label} must use POSIX path components")
    path = Path(value)
    if path.is_absolute() or not path.parts or any(part in {"", ".", ".."} for part in path.parts):
        raise ModelRootBindingError(f"model-root {label} must be a safe relative path")
    return path.as_posix()


def _root_path(value: Any, *, verify_files: bool) -> Path:
    if not isinstance(value, str) or not value.strip():
        raise ModelRootBindingError("model-root path must be a non-empty string")
    if not os.path.isabs(value):
        raise ModelRootBindingError("model-root path must be absolute")
    normalized = os.path.normpath(value)
    if value != normalized:
        raise ModelRootBindingError("model-root path must not contain lexical aliases")
    path = Path(value)
    if path.is_symlink():
        raise ModelRootBindingError("model-root path must not be a symlink alias")
    try:
        resolved = path.resolve(strict=verify_files)
    except OSError as exc:
        raise ModelRootBindingError(f"model-root path is not resolvable: {exc}") from exc
    if resolved != path:
        raise ModelRootBindingError("model-root path resolves through an alias")
    if verify_files and (not path.is_dir() or path.is_symlink()):
        raise ModelRootBindingError("model-root path must be an existing directory")
    return path


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return _SHA256 + digest.hexdigest()


def _stat_identity(path: Path) -> dict[str, int]:
    stat = path.stat()
    return {
        "dev": int(stat.st_dev),
        "inode": int(stat.st_ino),
        "size": int(stat.st_size),
        "mtime_ns": int(stat.st_mtime_ns),
    }


def _stat_identity_from_result(stat_result: os.stat_result) -> dict[str, int]:
    return {
        "dev": int(stat_result.st_dev),
        "inode": int(stat_result.st_ino),
        "size": int(stat_result.st_size),
        "mtime_ns": int(stat_result.st_mtime_ns),
    }


class _DuplicateJSONKeyError(ValueError):
    pass


def _json_object_without_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise _DuplicateJSONKeyError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def _walk_model_root(
    root: Path,
) -> tuple[
    dict[tuple[str, str], tuple[Path, os.stat_result]],
    list[tuple[Path, os.stat_result]],
]:
    """Enumerate the root without following aliases or admitting special files."""
    model_files: dict[tuple[str, str], tuple[Path, os.stat_result]] = {}
    sidecars: list[tuple[Path, os.stat_result]] = []
    seen_identities: dict[tuple[int, int], Path] = {}
    pending = [root]

    while pending:
        directory = pending.pop()
        try:
            with os.scandir(directory) as entries:
                children = sorted(entries, key=lambda entry: entry.name)
        except OSError as exc:
            raise ModelRootBindingError(
                f"model-root directory is not readable: {directory}"
            ) from exc

        for entry in children:
            child = Path(entry.path)
            relative = child.relative_to(root)
            parts = relative.parts
            try:
                child_stat = entry.stat(follow_symlinks=False)
            except OSError as exc:
                raise ModelRootBindingError(
                    f"model-root entry is not readable: {relative.as_posix()}"
                ) from exc

            if stat_module.S_ISLNK(child_stat.st_mode):
                raise ModelRootBindingError(
                    f"model-root contains a symlink or shadow path: {relative.as_posix()}"
                )
            if stat_module.S_ISDIR(child_stat.st_mode):
                if parts[:2] == _VERIFICATION_DIRECTORY and parts != _VERIFICATION_DIRECTORY:
                    raise ModelRootBindingError(
                        "model-root contains an unknown verification subdirectory: "
                        + relative.as_posix()
                    )
                pending.append(child)
                continue
            if not stat_module.S_ISREG(child_stat.st_mode):
                raise ModelRootBindingError(
                    f"model-root contains a special file: {relative.as_posix()}"
                )

            identity = (int(child_stat.st_dev), int(child_stat.st_ino))
            previous = seen_identities.get(identity)
            if previous is not None or child_stat.st_nlink != 1:
                raise ModelRootBindingError(
                    f"model-root contains a hard-link alias: {relative.as_posix()}"
                )
            seen_identities[identity] = child

            if parts[:2] == _VERIFICATION_DIRECTORY:
                if (
                    len(parts) != 3
                    or _VERIFICATION_NAME.fullmatch(parts[2]) is None
                ):
                    raise ModelRootBindingError(
                        "model-root contains an unknown verification file location: "
                        + relative.as_posix()
                    )
                sidecars.append((child, child_stat))
                continue

            subdir = relative.parent.as_posix()
            key = ("" if subdir == "." else subdir, relative.name)
            model_files[key] = (child, child_stat)

    return model_files, sidecars


def _validate_verification_sidecar(
    sidecar_path: Path,
    sidecar_stat: os.stat_result,
    root: Path,
    inventory: list[dict[str, Any]],
    model_files: dict[tuple[str, str], tuple[Path, os.stat_result]],
) -> None:
    """Admit one exact VibeComfy verification record for a declared model file."""
    try:
        payload = json.loads(
            sidecar_path.read_text(encoding="utf-8"),
            object_pairs_hook=_json_object_without_duplicate_keys,
        )
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, _DuplicateJSONKeyError) as exc:
        raise ModelRootBindingError(
            f"model-root verification sidecar is malformed: {sidecar_path.name}"
        ) from exc

    expected_fields = {
        "schema_version",
        "path",
        "expected_sha256",
        "actual_sha256",
        "expected_size_bytes",
        "stat",
    }
    if not isinstance(payload, dict) or set(payload) != expected_fields:
        raise ModelRootBindingError(
            f"model-root verification sidecar has invalid fields: {sidecar_path.name}"
        )
    schema_version = payload["schema_version"]
    if isinstance(schema_version, bool) or not isinstance(schema_version, int) or schema_version != 1:
        raise ModelRootBindingError(
            f"model-root verification sidecar has an invalid schema: {sidecar_path.name}"
        )

    raw_model_path = payload["path"]
    matches: list[tuple[dict[str, Any], tuple[str, str]]] = []
    if isinstance(raw_model_path, str):
        for entry in inventory:
            relative = Path(entry["subdir"]) / entry["name"]
            candidate = root / relative
            if str(candidate) == raw_model_path:
                key = (entry["subdir"], entry["name"])
                matches.append((entry, key))
    if len(matches) != 1:
        raise ModelRootBindingError(
            f"model-root verification sidecar path is not one declared model: {sidecar_path.name}"
        )

    entry, model_key = matches[0]
    expected_name = hashlib.sha256(raw_model_path.encode("utf-8")).hexdigest() + ".json"
    if sidecar_path.name != expected_name:
        raise ModelRootBindingError(
            f"model-root verification sidecar filename does not match its path: {sidecar_path.name}"
        )
    declared_sha256 = entry["sha256"][len(_SHA256):]
    if (
        payload["expected_sha256"] != declared_sha256
        or payload["actual_sha256"] != declared_sha256
    ):
        raise ModelRootBindingError(
            f"model-root verification sidecar hash does not match its model: {sidecar_path.name}"
        )

    expected_size = payload["expected_size_bytes"]
    if expected_size is not None and (
        isinstance(expected_size, bool)
        or not isinstance(expected_size, int)
        or expected_size != entry["size"]
    ):
        raise ModelRootBindingError(
            f"model-root verification sidecar size does not match its model: {sidecar_path.name}"
        )

    observed_stat = payload["stat"]
    stat_fields = {"dev", "inode", "mtime_ns", "size"}
    if (
        not isinstance(observed_stat, dict)
        or set(observed_stat) != stat_fields
        or any(type(observed_stat[field]) is not int for field in stat_fields)
    ):
        raise ModelRootBindingError(
            f"model-root verification sidecar stat is invalid: {sidecar_path.name}"
        )
    model_file = model_files.get(model_key)
    if model_file is None:
        raise ModelRootBindingError(
            f"model-root verification sidecar model is missing: {sidecar_path.name}"
        )
    _model_path, model_stat = model_file
    expected_stat = _stat_identity_from_result(model_stat)
    if observed_stat != expected_stat or observed_stat["size"] != entry["size"]:
        raise ModelRootBindingError(
            f"model-root verification sidecar stat does not match its model: {sidecar_path.name}"
        )
    if stat_module.S_ISLNK(sidecar_stat.st_mode) or not stat_module.S_ISREG(sidecar_stat.st_mode):
        raise ModelRootBindingError(
            f"model-root verification sidecar is not a regular file: {sidecar_path.name}"
        )


def _qualification_receipt_path(
    receipt_dir: Path,
    root: Path,
    inventory_digest: str,
    qualification_identity: str,
) -> Path:
    key = hashlib.sha256(
        f"{root}\0{inventory_digest}\0{qualification_identity}\0{_QUALIFICATION_VERIFIER_VERSION}".encode()
    ).hexdigest()
    return receipt_dir / f"{key}.json"


def _cached_qualification_matches(
    receipt_dir: Path,
    root: Path,
    inventory: list[dict[str, Any]],
    inventory_digest: str,
    qualification_identity: str | None,
) -> bool:
    if qualification_identity is None:
        return False
    receipt_path = _qualification_receipt_path(
        receipt_dir, root, inventory_digest, qualification_identity
    )
    try:
        value = json.loads(receipt_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return False
    if not isinstance(value, Mapping):
        return False
    if (
        value.get("schema_version") != 1
        or value.get("verifier_version") != _QUALIFICATION_VERIFIER_VERSION
        or value.get("path") != str(root)
        or value.get("inventory_digest") != inventory_digest
        or value.get("qualification_identity") != qualification_identity
    ):
        return False
    raw_files = value.get("files")
    if not isinstance(raw_files, list) or len(raw_files) != len(inventory):
        return False
    expected_files = [
        {"subdir": entry["subdir"], "name": entry["name"], "sha256": entry["sha256"], "size": entry["size"]}
        for entry in inventory
    ]
    observed_files: list[dict[str, Any]] = []
    for raw in raw_files:
        if not isinstance(raw, Mapping):
            return False
        observed_files.append(
            {
                "subdir": raw.get("subdir", ""),
                "name": raw.get("name"),
                "sha256": raw.get("sha256"),
                "size": raw.get("size"),
            }
        )
    if observed_files != expected_files:
        return False
    for raw in raw_files:
        relative = Path(str(raw.get("subdir", ""))) / str(raw.get("name"))
        candidate = root / relative
        try:
            if candidate.is_symlink() or not candidate.is_file():
                return False
            stat = _stat_identity(candidate)
        except OSError:
            return False
        if stat != raw.get("stat"):
            return False
    return True


def _write_qualification_receipt(
    receipt_dir: Path,
    root: Path,
    inventory: list[dict[str, Any]],
    inventory_digest: str,
    qualification_identity: str,
) -> None:
    receipt_dir.mkdir(parents=True, exist_ok=True)
    files: list[dict[str, Any]] = []
    for entry in inventory:
        candidate = root / Path(entry["subdir"]) / entry["name"]
        files.append({**entry, "stat": _stat_identity(candidate)})
    payload = {
        "schema_version": 1,
        "verifier_version": _QUALIFICATION_VERIFIER_VERSION,
        "path": str(root),
        "inventory_digest": inventory_digest,
        "qualification_identity": qualification_identity,
        "files": files,
    }
    destination = _qualification_receipt_path(
        receipt_dir, root, inventory_digest, qualification_identity
    )
    temporary = destination.with_name(f".{destination.name}.tmp")
    temporary.write_text(json.dumps(payload, sort_keys=True) + "\n", encoding="utf-8")
    temporary.replace(destination)


@dataclass(frozen=True)
class ModelRootBinding:
    """The exact root and immutable file inventory admitted for one run."""

    path: Path
    inventory: tuple[dict[str, Any], ...]
    inventory_digest: str
    qualification_identity: str | None

    def as_dict(self) -> dict[str, Any]:
        return {
            "schema_version": 1,
            "path": str(self.path),
            "inventory": [dict(entry) for entry in self.inventory],
            "inventory_digest": self.inventory_digest,
            "qualification_identity": self.qualification_identity,
        }


def validate_model_root_binding(
    value: Any,
    *,
    verify_files: bool = True,
    qualification_receipt_dir: str | Path | None = None,
) -> ModelRootBinding:
    """Validate one explicit profile binding and optionally its file bytes.

    ``verify_files=True`` is used at host qualification.  Later child/backend
    boundaries can re-check the pinned declaration without hashing a large
    release volume again; the profile hash and inventory digest remain fixed.
    """
    if not isinstance(value, Mapping):
        raise ModelRootBindingError("readiness profile launch.model_root must be an object binding")
    if value.get("schema_version") != 1:
        raise ModelRootBindingError("model-root binding has an unsupported schema")
    path = _root_path(value.get("path"), verify_files=verify_files)
    qualification_identity = value.get("qualification_identity")
    if qualification_identity is not None and (
        not isinstance(qualification_identity, str)
        or not qualification_identity.strip()
    ):
        raise ModelRootBindingError(
            "model-root qualification_identity must be a non-empty deployment identity"
        )
    raw_inventory = value.get("inventory")
    if not isinstance(raw_inventory, list):
        raise ModelRootBindingError("model-root binding inventory must be a list")

    inventory: list[dict[str, Any]] = []
    seen_paths: set[tuple[str, str]] = set()
    for raw in raw_inventory:
        if not isinstance(raw, Mapping):
            raise ModelRootBindingError("model-root inventory entry must be an object")
        if "alias" in raw or "aliases" in raw:
            raise ModelRootBindingError(
                "model-root aliases require an authoritative canonical mapping"
            )
        subdir = _safe_relative(raw.get("subdir", ""), label="inventory subdir", allow_empty=True)
        name = _safe_relative(raw.get("name"), label="inventory name", allow_empty=False)
        if "/" in name:
            raise ModelRootBindingError("model-root inventory name must be a basename")
        size = raw.get("size")
        if isinstance(size, bool) or not isinstance(size, int) or size < 0:
            raise ModelRootBindingError("model-root inventory size must be a non-negative integer")
        sha256 = _digest(raw.get("sha256"), label=f"{subdir}/{name} digest")
        key = (subdir, name)
        if key in seen_paths:
            raise ModelRootBindingError(f"model-root inventory contains a duplicate path: {subdir}/{name}")
        seen_paths.add(key)
        inventory.append({"name": name, "sha256": sha256, "size": size, "subdir": subdir})

    inventory.sort(key=lambda entry: (entry["subdir"], entry["name"]))
    expected_inventory_digest = _digest(value.get("inventory_digest"), label="inventory digest")
    observed_inventory_digest = _canonical_inventory_digest(inventory)
    if expected_inventory_digest != observed_inventory_digest:
        raise ModelRootBindingError(
            "model-root inventory digest does not match its declared entries"
        )

    receipt_dir = (
        Path(qualification_receipt_dir).expanduser()
        if qualification_receipt_dir is not None
        else None
    )
    if verify_files:
        for entry in inventory:
            relative = Path(entry["subdir"]) / entry["name"]
            parts = relative.parts
            if parts == (".vibecomfy",) or parts[:2] == _VERIFICATION_DIRECTORY:
                raise ModelRootBindingError(
                    "model-root inventory collides with the verification namespace: "
                    + relative.as_posix()
                )

        model_files, sidecars = _walk_model_root(path)
        declared_names = {name for _subdir, name in seen_paths}
        metadata_shadows = sorted(
            sidecar.relative_to(path).name
            for sidecar, _sidecar_stat in sidecars
            if sidecar.relative_to(path).name in declared_names
        )
        if metadata_shadows:
            raise ModelRootBindingError(
                "model-root inventory has a shadow file: " + ",".join(metadata_shadows)
            )
        for sidecar, sidecar_stat in sidecars:
            _validate_verification_sidecar(
                sidecar,
                sidecar_stat,
                path,
                inventory,
                model_files,
            )

        actual_paths = set(model_files)
        declared_paths = set(seen_paths)
        missing = sorted(declared_paths - actual_paths)
        unlisted = sorted(actual_paths - declared_paths)
        declared_names = {name for _subdir, name in declared_paths}
        shadow_paths = [item for item in unlisted if item[1] in declared_names]
        if shadow_paths:
            rendered = ",".join("/".join(part for part in item if part) for item in shadow_paths)
            raise ModelRootBindingError(
                f"model-root inventory has a shadow file: {rendered}"
            )
        if missing or unlisted:
            details: list[str] = []
            if missing:
                details.append("missing=" + ",".join("/".join(part for part in item if part) for item in missing))
            if unlisted:
                details.append("unlisted=" + ",".join("/".join(part for part in item if part) for item in unlisted))
            raise ModelRootBindingError(
                "model-root inventory is incomplete: " + "; ".join(details)
            )

        for entry in inventory:
            relative = Path(entry["subdir"]) / entry["name"]
            _candidate, observed_stat = model_files[(entry["subdir"], entry["name"])]
            if observed_stat.st_size != entry["size"]:
                raise ModelRootBindingError(
                    f"model-root inventory size mismatch for {relative}"
                )

        if (
            receipt_dir is not None
            and _cached_qualification_matches(
                receipt_dir,
                path,
                inventory,
                expected_inventory_digest,
                qualification_identity,
            )
        ):
            return ModelRootBinding(
                path=path,
                inventory=tuple(inventory),
                inventory_digest=expected_inventory_digest,
                qualification_identity=qualification_identity,
            )

        for entry in inventory:
            relative = Path(entry["subdir"]) / entry["name"]
            candidate = model_files[(entry["subdir"], entry["name"])][0]
            if _file_sha256(candidate) != entry["sha256"]:
                raise ModelRootBindingError(
                    f"model-root inventory hash mismatch for {relative}"
                )

        if receipt_dir is not None and qualification_identity is not None:
            _write_qualification_receipt(
                receipt_dir,
                path,
                inventory,
                expected_inventory_digest,
                qualification_identity,
            )

    return ModelRootBinding(
        path=path,
        inventory=tuple(inventory),
        inventory_digest=expected_inventory_digest,
        qualification_identity=qualification_identity,
    )


def model_root_binding_from_profile(
    profile: Mapping[str, Any] | None,
    *,
    verify_files: bool = True,
    qualification_receipt_dir: str | Path | None = None,
) -> ModelRootBinding:
    if not isinstance(profile, Mapping):
        raise ModelRootBindingError("VibeComfy readiness profile is missing")
    launch = profile.get("launch")
    if not isinstance(launch, Mapping):
        raise ModelRootBindingError("VibeComfy readiness profile launch facts are missing")
    return validate_model_root_binding(
        launch.get("model_root"),
        verify_files=verify_files,
        qualification_receipt_dir=qualification_receipt_dir,
    )


def model_root_binding_from_environment(*, verify_files: bool = False) -> ModelRootBinding:
    raw = os.environ.get(MODEL_ROOT_BINDING_ENV)
    if not raw:
        raise ModelRootBindingError(f"{MODEL_ROOT_BINDING_ENV} is missing")
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ModelRootBindingError(f"{MODEL_ROOT_BINDING_ENV} is not valid JSON") from exc
    receipt_dir = os.environ.get(MODEL_ROOT_QUALIFICATION_RECEIPT_DIR_ENV)
    binding = validate_model_root_binding(
        payload,
        verify_files=verify_files,
        qualification_receipt_dir=receipt_dir,
    )
    if os.environ.get(MODEL_ROOT_ENV) != str(binding.path):
        raise ModelRootBindingError(
            f"{MODEL_ROOT_ENV} disagrees with the attested model-root binding"
        )
    return binding


def canonical_model_inventory_digest(entries: list[dict[str, Any]]) -> str:
    """Expose the deterministic digest recipe for fixture/profile authors."""
    return _canonical_inventory_digest(entries)


__all__ = [
    "MODEL_ROOT_BINDING_ENV",
    "MODEL_ROOT_ENV",
    "MODEL_ROOT_QUALIFICATION_RECEIPT_DIR_ENV",
    "ModelRootBinding",
    "ModelRootBindingError",
    "canonical_model_inventory_digest",
    "model_root_binding_from_environment",
    "model_root_binding_from_profile",
    "use_attested_vibecomfy_models_root",
    "validate_model_root_binding",
]
