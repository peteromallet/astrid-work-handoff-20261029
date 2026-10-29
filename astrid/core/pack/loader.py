"""Pack-manifest loading/parsing, discovery, and the packs root."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from astrid.core.env_vars import ASTRID_PACKS_PATH
from astrid.core.pack._common import (
    PackValidationError,
    _optional_string,
)
from astrid.core.pack.definition import PackDefinition
from astrid.core.pack.canonical import (
    CanonicalPackValidationError,
    LEGACY_MANIFEST_NAMES,
    canonical_manifest_path,
    validate_canonical_pack,
)
from astrid.core.pack.permissions import (
    _normalize_pack_permissions,
    _optional_pack_extensions,
)

_LOGGER = logging.getLogger(__name__)

PACK_VALIDATOR_COMMAND = "python3 -m astrid.core.pack.cli validate"

# Source admission remains strict.  These constants describe the small
# diagnostic scan used to report optional invalid packs; they are not an
# alternate admission path and do not let a required capability through.
FAIL_CLOSED_PACK_FOLDERS: frozenset[str] = frozenset({"_core"})
REQUIRED_PACK_IDS: frozenset[str] = frozenset()


@dataclass(frozen=True)
class QuarantinedPack:
    """One optional pack omitted because canonical admission failed."""

    pack_id: str
    pack_dir: Path
    manifest_path: Path | None
    error: str

    @property
    def fix(self) -> str:
        return f"run the pack validator: {PACK_VALIDATOR_COMMAND} {self.pack_dir}"

    def to_dict(self) -> dict[str, Any]:
        return {
            "pack_id": self.pack_id,
            "state": "quarantined",
            "pack_dir": str(self.pack_dir),
            "manifest_path": str(self.manifest_path) if self.manifest_path is not None else None,
            "error": self.error,
            "fix": self.fix,
        }


@dataclass(frozen=True)
class PackScan:
    """An observational pack scan, including optional invalid-pack records."""

    packs: tuple[PackDefinition, ...]
    quarantined: tuple[QuarantinedPack, ...]


_LOGGED_QUARANTINES: set[tuple[str, str]] = set()


def _fail_closed(folder_name: str, required_pack_ids: frozenset[str]) -> bool:
    return folder_name in FAIL_CLOSED_PACK_FOLDERS or folder_name in required_pack_ids


def _quarantine_warning(record: QuarantinedPack) -> None:
    key = (str(record.pack_dir), record.error)
    if key in _LOGGED_QUARANTINES:
        return
    _LOGGED_QUARANTINES.add(key)
    _LOGGER.warning(
        "quarantined optional pack %r: %s; capabilities are unavailable until it is fixed (%s)",
        record.pack_id,
        record.error,
        record.fix,
    )


def packs_root() -> Path:
    return Path(__file__).resolve().parents[2] / "packs"


DEFAULT_PACKS_ROOT = packs_root()


def scan_packs(
    root: str | Path | None = None,
    *,
    include_hidden: bool = False,
    strict: bool = True,
    required_pack_ids: frozenset[str] = REQUIRED_PACK_IDS,
) -> PackScan:
    """Scan a pack root without importing pack code.

    Strict scans are the only source-admission path and raise on every invalid
    manifest.  A non-strict scan is observational: invalid optional packs are
    quarantined individually so doctor/discovery reporting can retain valid
    neighbours.  Required and runtime-owned folders remain fail-closed in both
    modes.
    """
    source_root = Path(root) if root is not None else packs_root()
    if not source_root.is_dir():
        return PackScan((), ())
    packs: list[PackDefinition] = []
    quarantined: list[QuarantinedPack] = []
    seen: dict[str, Path] = {}
    for child in sorted(source_root.iterdir(), key=lambda path: path.name):
        if not child.is_dir() or child.name.startswith(".") or child.name == "__pycache__":
            continue
        try:
            manifest_path = pack_manifest_path(child)
            if manifest_path is None:
                continue
            pack = load_pack_manifest(manifest_path)
        except Exception as exc:  # noqa: BLE001 - optional scan boundary
            if strict or _fail_closed(child.name, required_pack_ids):
                if isinstance(exc, PackValidationError):
                    raise
                raise PackValidationError(f"{child}: {exc}") from exc
            record = QuarantinedPack(
                pack_id=child.name,
                pack_dir=child,
                manifest_path=(child / "pack.yaml") if (child / "pack.yaml").is_file() else None,
                error=str(exc),
            )
            quarantined.append(record)
            _quarantine_warning(record)
            continue
        if pack.visibility == "hidden" and not include_hidden:
            continue
        if pack.id in seen:
            raise PackValidationError(f"duplicate pack id {pack.id!r}: {seen[pack.id]} and {manifest_path}")
        seen[pack.id] = manifest_path
        packs.append(pack)
    return PackScan(tuple(packs), tuple(quarantined))


def discover_packs(
    root: str | Path | None = None,
    *,
    include_hidden: bool = False,
) -> tuple[PackDefinition, ...]:
    """Return packs admitted by the strict canonical V3/V2 source parser.

    Optional quarantine is deliberately available only through the explicit
    non-strict :func:`scan_packs` diagnostic seam; registries cannot silently
    downgrade source admission to a folder walk.
    """
    return scan_packs(root, include_hidden=include_hidden, strict=True).packs


def _raw_declared_capabilities(manifest_path: Path | None) -> tuple[str, ...]:
    """Read only declared labels from a failed manifest for diagnostics."""
    if manifest_path is None:
        return ()
    try:
        raw = yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError):
        return ()
    labels = raw.get("capabilities") if isinstance(raw, dict) else None
    if not isinstance(labels, list):
        return ()
    return tuple(str(label) for label in labels if isinstance(label, str) and label.strip())


def quarantined_pack_for_capability(
    capability_id: str,
    roots: tuple[str | Path, ...] | None = None,
) -> QuarantinedPack | None:
    """Find an optional quarantined pack that declared *capability_id*.

    This is a not-found diagnostic only.  It never admits a broken manifest
    and never changes the strict registry result.
    """
    scan_roots = roots if roots is not None else _default_pack_roots()
    for root in scan_roots:
        for record in scan_packs(root, strict=False).quarantined:
            if capability_id.startswith(f"{record.pack_id}."):
                return record
            labels = _raw_declared_capabilities(record.manifest_path)
            if capability_id in labels or any(
                capability_id == f"{record.pack_id}.{label}" for label in labels
            ):
                return record
    return None


def _default_pack_roots() -> tuple[Path, ...]:
    env_roots = tuple(
        Path(item).expanduser()
        for item in os.environ.get(ASTRID_PACKS_PATH, "").split(os.pathsep)
        if item
    )
    return tuple(dict.fromkeys((packs_root(), *env_roots)))


def pack_quarantine_report(
    roots: tuple[str | Path, ...] | None = None,
) -> list[dict[str, Any]]:
    """Return read-only JSON-shaped optional-pack quarantine records."""
    scan_roots = roots if roots is not None else _default_pack_roots()
    records: list[dict[str, Any]] = []
    for root in scan_roots:
        records.extend(
            record.to_dict() for record in scan_packs(root, strict=False).quarantined
        )
    return records


def pack_quarantine_section() -> dict[str, Any]:
    """Return a doctor-ready quarantine section without raising on bad options."""
    try:
        records = pack_quarantine_report()
    except PackValidationError as exc:
        return {"count": 0, "quarantined": [], "fail_closed_error": str(exc)}
    return {"count": len(records), "quarantined": records, "fail_closed_error": None}


def load_pack_manifest(path: str | Path, *, expected_pack_id: str | None = None) -> PackDefinition:
    """Load one admitted v2/v3 pack through the canonical parser."""
    manifest_path = Path(path).expanduser().resolve()
    if manifest_path.name != "pack.yaml" or not manifest_path.is_file():
        raise PackValidationError(
            f"canonical pack admission requires a regular pack.yaml, got {manifest_path}"
        )
    try:
        entry = validate_canonical_pack(
            manifest_path.parent, expected_pack_id=expected_pack_id
        )
    except CanonicalPackValidationError as exc:
        raise PackValidationError(str(exc)) from exc
    definition = entry.definition
    data = definition.to_dict()
    taxonomy = pack_taxonomy_from_manifest(data, status=definition.status)
    return PackDefinition(
        id=definition.id,
        name=definition.name,
        version=definition.version,
        root=entry.root,
        manifest_path=manifest_path,
        metadata={},
        description=definition.description,
        content=dict(definition.content),
        agent=dict(data["agent"]),
        status=definition.status,
        visibility=definition.visibility,
        schema_version=str(definition.schema_version),
        aliases=tuple(dict(alias) for alias in data["aliases"]),
        permissions=_normalize_pack_permissions(data["permissions"]),
        extensions=_optional_pack_extensions(data.get("extensions", {}), path="pack.extensions"),
        actions=dict(data.get("actions", {})),
        ui=dict(data.get("ui", {})),
        rendering=dict(data.get("rendering", {})),
        documents=dict(data.get("documents", {})),
        documentation=dict(data.get("documentation", {})),
        **taxonomy,
    )


def pack_taxonomy_from_manifest(data: dict[str, Any], *, status: str) -> dict[str, str]:
    """Return the deterministic taxonomy projection for a pack manifest.

    These defaults are the taxonomy baseline for manifests that do not yet
    declare an explicit taxonomy block.
    """
    return {
        "origin": _optional_string(data, "origin", "pack.origin", default="unknown"),
        "install_tier": _optional_string(data, "install_tier", "pack.install_tier", default="default"),
        "pack_type": _optional_string(data, "pack_type", "pack.pack_type", default="capability"),
        "domain": _optional_string(data, "domain", "pack.domain", default="general"),
        "stability": _optional_string(
            data,
            "stability",
            "pack.stability",
            default=_default_stability_for_status(status),
        ),
        "support": _optional_string(data, "support", "pack.support", default="project"),
    }


def _default_stability_for_status(status: str) -> str:
    if status == "experimental":
        return "experimental"
    if status == "deprecated":
        return "deprecated"
    return "stable"


def pack_manifest_path(root: str | Path) -> Path | None:
    pack_root = Path(root)
    legacy = sorted(name for name in LEGACY_MANIFEST_NAMES if (pack_root / name).exists())
    if legacy and not (pack_root / "pack.yaml").exists():
        raise PackValidationError(
            f"canonical pack admission requires pack.yaml; found alternate manifest(s): {', '.join(legacy)}"
        )
    try:
        return canonical_manifest_path(pack_root)
    except CanonicalPackValidationError as exc:
        raise PackValidationError(str(exc)) from exc


def _load_manifest_payload(path: Path) -> dict[str, Any]:
    """Read a YAML mapping for internal static-inspection helpers.

    Pack admission remains strict in :func:`load_pack_manifest`; this helper
    also reads non-pack catalogs such as ``models.yaml`` and renderer
    manifests while building the capability ledger.
    """
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise PackValidationError(f"manifest not found: {path}") from exc
    except yaml.YAMLError as exc:
        raise PackValidationError(f"invalid YAML manifest {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise PackValidationError(f"manifest must contain a YAML object: {path}")
    return data
