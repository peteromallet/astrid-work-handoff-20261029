from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from types import SimpleNamespace

import pytest

from astrid.core.generation.model_root import (
    MODEL_ROOT_BINDING_ENV,
    MODEL_ROOT_ENV,
    ModelRootBindingError,
    canonical_model_inventory_digest,
    model_root_binding_from_environment,
    model_root_binding_from_profile,
    use_attested_vibecomfy_models_root,
    validate_model_root_binding,
)


def _payload(
    root: Path,
    *,
    size: int,
    sha256: str,
    qualification_identity: str | None = None,
) -> dict[str, object]:
    inventory = [{"name": "model.bin", "sha256": sha256, "size": size, "subdir": "vae"}]
    return {
        "schema_version": 1,
        "path": str(root),
        "inventory": inventory,
        "inventory_digest": canonical_model_inventory_digest(inventory),
        "qualification_identity": qualification_identity,
    }


def _six_asset_sidecar_case(
    root: Path,
    *,
    qualification_identity: str | None = None,
) -> tuple[dict[str, object], list[Path], list[Path]]:
    locations = (
        ("checkpoints", "h3-base.safetensors"),
        ("diffusion_models", "h3-video.safetensors"),
        ("loras", "h3-motion.safetensors"),
        ("text_encoders", "h3-text.safetensors"),
        ("upscale_models", "h3-upscale.pth"),
        ("vae", "h3-vae.safetensors"),
    )
    inventory: list[dict[str, object]] = []
    model_paths: list[Path] = []
    for index, (subdir, name) in enumerate(locations):
        model_path = root / subdir / name
        model_path.parent.mkdir(parents=True, exist_ok=True)
        model_bytes = f"small-h3-model-fixture-{index}".encode("ascii")
        model_path.write_bytes(model_bytes)
        model_paths.append(model_path)
        inventory.append(
            {
                "name": name,
                "sha256": "sha256:" + hashlib.sha256(model_bytes).hexdigest(),
                "size": len(model_bytes),
                "subdir": subdir,
            }
        )

    sidecar_paths = [
        _write_verification_sidecar(root, model_path, entry)
        for model_path, entry in zip(model_paths, inventory, strict=True)
    ]
    payload: dict[str, object] = {
        "schema_version": 1,
        "path": str(root),
        "inventory": inventory,
        "inventory_digest": canonical_model_inventory_digest(inventory),
        "qualification_identity": qualification_identity,
    }
    return payload, model_paths, sidecar_paths


def _write_verification_sidecar(
    root: Path,
    model_path: Path,
    entry: dict[str, object],
    *,
    payload_changes: dict[str, object] | None = None,
) -> Path:
    stat = model_path.stat()
    raw: dict[str, object] = {
        "schema_version": 1,
        "path": str(model_path),
        "expected_sha256": str(entry["sha256"]).removeprefix("sha256:"),
        "actual_sha256": str(entry["sha256"]).removeprefix("sha256:"),
        "expected_size_bytes": None,
        "stat": {
            "dev": int(stat.st_dev),
            "inode": int(stat.st_ino),
            "mtime_ns": int(stat.st_mtime_ns),
            "size": int(stat.st_size),
        },
    }
    if payload_changes:
        raw.update(payload_changes)
    directory = root / ".vibecomfy" / "model-verification"
    directory.mkdir(parents=True, exist_ok=True)
    filename = hashlib.sha256(str(model_path).encode("utf-8")).hexdigest() + ".json"
    sidecar = directory / filename
    sidecar.write_text(json.dumps(raw, sort_keys=True) + "\n", encoding="utf-8")
    return sidecar


def test_model_root_binding_verifies_bytes_and_is_deterministic(tmp_path: Path) -> None:
    root = tmp_path / "models"
    target = root / "vae" / "model.bin"
    target.parent.mkdir(parents=True)
    target.write_bytes(b"model-bytes")
    digest = "sha256:" + hashlib.sha256(b"model-bytes").hexdigest()

    binding = validate_model_root_binding(
        _payload(root, size=target.stat().st_size, sha256=digest)
    )

    assert binding.path == root
    assert binding.as_dict()["inventory_digest"] == canonical_model_inventory_digest(
        list(binding.inventory)
    )


def test_model_root_binding_accepts_exact_six_asset_verification_sidecars(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = tmp_path / "models"
    payload, model_paths, sidecar_paths = _six_asset_sidecar_case(root)
    inventory_before = json.loads(json.dumps(payload["inventory"]))
    digest_before = payload["inventory_digest"]
    hashed: list[Path] = []

    def counted_hash(path: Path) -> str:
        hashed.append(path)
        return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()

    monkeypatch.setattr("astrid.core.generation.model_root._file_sha256", counted_hash)
    binding = validate_model_root_binding(payload)

    assert len(sidecar_paths) == 6
    assert binding.inventory_digest == digest_before
    assert [dict(entry) for entry in binding.inventory] == inventory_before
    assert len(hashed) == 6
    assert set(hashed) == set(model_paths)


@pytest.mark.parametrize(
    "mutation",
    [
        "malformed_json",
        "duplicate_key",
        "missing_field",
        "extra_field",
        "wrong_filename",
        "wrong_path",
        "outside_root_path",
        "wrong_expected_hash",
        "wrong_actual_hash",
        "wrong_size",
        "boolean_size",
        "wrong_stat",
        "boolean_stat",
        "boolean_schema",
    ],
)
def test_model_root_binding_rejects_invalid_verification_sidecars(
    tmp_path: Path, mutation: str
) -> None:
    root = tmp_path / "models"
    payload, model_paths, sidecar_paths = _six_asset_sidecar_case(root)
    sidecar = sidecar_paths[0]
    entry = payload["inventory"][0]
    assert isinstance(entry, dict)

    if mutation == "malformed_json":
        sidecar.write_text("{broken", encoding="utf-8")
    elif mutation == "duplicate_key":
        valid = sidecar.read_text(encoding="utf-8")
        sidecar.write_text(valid.replace('"schema_version": 1', '"schema_version": 1, "schema_version": 1', 1), encoding="utf-8")
    elif mutation == "wrong_filename":
        sidecar.rename(sidecar.with_name("f" * 64 + ".json"))
    else:
        raw = json.loads(sidecar.read_text(encoding="utf-8"))
        if mutation == "missing_field":
            raw.pop("actual_sha256")
        elif mutation == "extra_field":
            raw["unexpected"] = "value"
        elif mutation == "wrong_path":
            raw["path"] = f"{root}/unused/../{model_paths[0].relative_to(root)}"
        elif mutation == "outside_root_path":
            raw["path"] = str(tmp_path / "outside" / "model.bin")
        elif mutation == "wrong_expected_hash":
            raw["expected_sha256"] = "0" * 64
        elif mutation == "wrong_actual_hash":
            raw["actual_sha256"] = "0" * 64
        elif mutation == "wrong_size":
            raw["expected_size_bytes"] = int(entry["size"]) + 1
        elif mutation == "boolean_size":
            raw["expected_size_bytes"] = True
        elif mutation == "wrong_stat":
            raw["stat"]["inode"] += 1
        elif mutation == "boolean_stat":
            raw["stat"]["dev"] = True
        elif mutation == "boolean_schema":
            raw["schema_version"] = True
        sidecar.write_text(json.dumps(raw, sort_keys=True) + "\n", encoding="utf-8")

    with pytest.raises(ModelRootBindingError):
        validate_model_root_binding(payload)


@pytest.mark.parametrize(
    "location",
    [
        "wrong_verification_filename",
        "unknown_verification_payload",
        "verification_subdirectory",
        "other_vibecomfy_file",
        "unlisted_model_file",
    ],
)
def test_model_root_binding_rejects_unknown_metadata_and_file_locations(
    tmp_path: Path, location: str
) -> None:
    root = tmp_path / "models"
    payload, _model_paths, sidecar_paths = _six_asset_sidecar_case(root)
    verification_dir = root / ".vibecomfy" / "model-verification"
    if location == "wrong_verification_filename":
        (verification_dir / "temporary.json").write_text("{}", encoding="utf-8")
    elif location == "unknown_verification_payload":
        (verification_dir / ("0" * 64 + ".json")).write_text("{}", encoding="utf-8")
    elif location == "verification_subdirectory":
        nested = verification_dir / "nested"
        nested.mkdir()
        (nested / ("a" * 64 + ".json")).write_text("{}", encoding="utf-8")
    elif location == "other_vibecomfy_file":
        (root / ".vibecomfy" / "other.json").write_text("{}", encoding="utf-8")
    else:
        (root / "unlisted-model.bin").write_bytes(b"unknown")
    assert sidecar_paths

    with pytest.raises(ModelRootBindingError):
        validate_model_root_binding(payload)


@pytest.mark.parametrize(
    "alias_kind",
    ["root_path", "sidecar", "metadata_directory", "vibecomfy_directory", "model_file", "model_directory"],
)
def test_model_root_binding_rejects_symlink_components(
    tmp_path: Path, alias_kind: str
) -> None:
    root = tmp_path / "models"
    payload, model_paths, sidecar_paths = _six_asset_sidecar_case(root)
    outside = tmp_path / "outside"
    outside.mkdir()

    if alias_kind == "root_path":
        alias = tmp_path / "models-alias"
        alias.symlink_to(root, target_is_directory=True)
        payload["path"] = str(alias)
    elif alias_kind == "sidecar":
        sidecar = sidecar_paths[0]
        target = outside / "sidecar.json"
        target.write_bytes(sidecar.read_bytes())
        sidecar.unlink()
        sidecar.symlink_to(target)
    elif alias_kind == "metadata_directory":
        directory = root / ".vibecomfy" / "model-verification"
        moved = outside / "model-verification"
        directory.rename(moved)
        directory.symlink_to(moved, target_is_directory=True)
    elif alias_kind == "vibecomfy_directory":
        directory = root / ".vibecomfy"
        moved = outside / ".vibecomfy"
        directory.rename(moved)
        directory.symlink_to(moved, target_is_directory=True)
    elif alias_kind == "model_file":
        target = outside / model_paths[0].name
        target.write_bytes(model_paths[0].read_bytes())
        model_paths[0].unlink()
        model_paths[0].symlink_to(target)
    else:
        directory = model_paths[0].parent
        moved = outside / directory.name
        directory.rename(moved)
        directory.symlink_to(moved, target_is_directory=True)

    with pytest.raises(ModelRootBindingError, match="symlink"):
        validate_model_root_binding(payload)


def test_model_root_binding_accepts_matching_non_null_verification_size(tmp_path: Path) -> None:
    root = tmp_path / "models"
    payload, model_paths, sidecar_paths = _six_asset_sidecar_case(root)
    raw = json.loads(sidecar_paths[0].read_text(encoding="utf-8"))
    raw["expected_size_bytes"] = model_paths[0].stat().st_size
    sidecar_paths[0].write_text(json.dumps(raw, sort_keys=True) + "\n", encoding="utf-8")

    binding = validate_model_root_binding(payload)
    assert binding.inventory_digest == payload["inventory_digest"]


def test_model_root_binding_rejects_special_files(tmp_path: Path) -> None:
    root = tmp_path / "models"
    payload, _model_paths, _sidecar_paths = _six_asset_sidecar_case(root)
    os.mkfifo(root / "unexpected-pipe")

    with pytest.raises(ModelRootBindingError, match="special file"):
        validate_model_root_binding(payload)


def test_model_root_binding_rejects_hardlink_aliases_and_shadow_files(tmp_path: Path) -> None:
    root = tmp_path / "models"
    payload, model_paths, _sidecar_paths = _six_asset_sidecar_case(root)
    os.link(model_paths[0], root / "hardlink-alias.bin")
    with pytest.raises(ModelRootBindingError, match="hard-link alias"):
        validate_model_root_binding(payload)

    (root / "hardlink-alias.bin").unlink()
    shadow = root / "shadow" / model_paths[0].name
    shadow.parent.mkdir()
    shadow.write_bytes(b"shadow")
    with pytest.raises(ModelRootBindingError, match="shadow"):
        validate_model_root_binding(payload)


def test_model_root_binding_checks_sidecar_basename_before_metadata_exclusion(
    tmp_path: Path,
) -> None:
    root = tmp_path / "models"
    payload, _model_paths, sidecar_paths = _six_asset_sidecar_case(root)
    shadow_name = sidecar_paths[0].name
    shadow_path = root / "extra" / shadow_name
    shadow_path.parent.mkdir()
    shadow_bytes = b"declared shadow model"
    shadow_path.write_bytes(shadow_bytes)

    inventory = payload["inventory"]
    assert isinstance(inventory, list)
    inventory.append(
        {
            "name": shadow_name,
            "sha256": "sha256:" + hashlib.sha256(shadow_bytes).hexdigest(),
            "size": len(shadow_bytes),
            "subdir": "extra",
        }
    )
    inventory.sort(key=lambda entry: (entry["subdir"], entry["name"]))
    payload["inventory_digest"] = canonical_model_inventory_digest(inventory)

    with pytest.raises(ModelRootBindingError, match="shadow file"):
        validate_model_root_binding(payload)


def test_model_root_binding_rejects_verification_namespace_collision(tmp_path: Path) -> None:
    root = tmp_path / "models"
    payload, _model_paths, _sidecar_paths = _six_asset_sidecar_case(root)
    inventory = payload["inventory"]
    assert isinstance(inventory, list)
    inventory.append(
        {
            "name": "declared.bin",
            "sha256": "sha256:" + "0" * 64,
            "size": 1,
            "subdir": ".vibecomfy/model-verification",
        }
    )
    inventory.sort(key=lambda entry: (entry["subdir"], entry["name"]))
    payload["inventory_digest"] = canonical_model_inventory_digest(inventory)

    with pytest.raises(ModelRootBindingError, match="collides with the verification namespace"):
        validate_model_root_binding(payload)


@pytest.mark.parametrize("failure", ["wrong_size", "same_size_corruption", "missing"])
def test_model_root_binding_sidecar_never_substitutes_for_model_bytes(
    tmp_path: Path, failure: str
) -> None:
    root = tmp_path / "models"
    payload, model_paths, _sidecar_paths = _six_asset_sidecar_case(root)
    model_path = model_paths[0]
    entry = payload["inventory"][0]
    assert isinstance(entry, dict)
    if failure == "missing":
        model_path.unlink()
    elif failure == "wrong_size":
        model_path.write_bytes(b"wrong-size")
        _write_verification_sidecar(root, model_path, entry)
    else:
        model_path.write_bytes(b"X" + model_path.read_bytes()[1:])
        _write_verification_sidecar(root, model_path, entry)

    with pytest.raises(ModelRootBindingError):
        validate_model_root_binding(payload)


@pytest.mark.parametrize("mutation", ["unknown_file", "malformed_sidecar"])
def test_model_root_binding_checks_structure_before_cached_qualification_return(
    tmp_path: Path, mutation: str
) -> None:
    root = tmp_path / "models"
    payload, _model_paths, sidecar_paths = _six_asset_sidecar_case(
        root,
        qualification_identity="storage-release:six-assets",
    )
    receipt_dir = tmp_path / "support" / "model-verification"
    validate_model_root_binding(payload, qualification_receipt_dir=receipt_dir)
    assert list(receipt_dir.glob("*.json"))

    if mutation == "unknown_file":
        (root / "late-unknown.bin").write_bytes(b"unknown")
    else:
        sidecar_paths[0].write_text("not-json", encoding="utf-8")

    with pytest.raises(ModelRootBindingError):
        validate_model_root_binding(payload, qualification_receipt_dir=receipt_dir)


def test_model_root_binding_reuses_stat_bound_qualification_receipt(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = tmp_path / "models"
    target = root / "vae" / "model.bin"
    target.parent.mkdir(parents=True)
    target.write_bytes(b"model-bytes")
    digest = "sha256:" + hashlib.sha256(b"model-bytes").hexdigest()
    payload = _payload(
        root,
        size=target.stat().st_size,
        sha256=digest,
        qualification_identity="storage-release:fixture-1",
    )
    receipt_dir = tmp_path / "support" / "model-verification"

    validate_model_root_binding(
        payload, qualification_receipt_dir=receipt_dir
    )
    assert list(receipt_dir.glob("*.json"))

    def unexpected_hash(_path: Path) -> str:
        raise AssertionError("unchanged qualified model must not be read again")

    monkeypatch.setattr("astrid.core.generation.model_root._file_sha256", unexpected_hash)
    binding = validate_model_root_binding(
        payload, qualification_receipt_dir=receipt_dir
    )
    assert binding.inventory_digest == payload["inventory_digest"]


def test_model_root_binding_changed_qualification_identity_requalifies(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = tmp_path / "models"
    target = root / "vae" / "model.bin"
    target.parent.mkdir(parents=True)
    target.write_bytes(b"model-bytes")
    digest = "sha256:" + hashlib.sha256(b"model-bytes").hexdigest()
    receipt_dir = tmp_path / "support" / "model-verification"
    first = _payload(
        root,
        size=target.stat().st_size,
        sha256=digest,
        qualification_identity="storage-release:fixture-1",
    )
    second = {**first, "qualification_identity": "storage-release:fixture-2"}
    validate_model_root_binding(first, qualification_receipt_dir=receipt_dir)

    original_hash = hashlib.sha256
    hashed: list[Path] = []

    def counted_hash(path: Path) -> str:
        hashed.append(path)
        return "sha256:" + original_hash(path.read_bytes()).hexdigest()

    monkeypatch.setattr("astrid.core.generation.model_root._file_sha256", counted_hash)
    binding = validate_model_root_binding(
        second, qualification_receipt_dir=receipt_dir
    )

    assert hashed == [target]
    assert binding.qualification_identity == "storage-release:fixture-2"
    assert len(list(receipt_dir.glob("*.json"))) == 2


def test_model_root_binding_without_qualification_identity_always_hashes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = tmp_path / "models"
    target = root / "vae" / "model.bin"
    target.parent.mkdir(parents=True)
    target.write_bytes(b"model-bytes")
    digest = "sha256:" + hashlib.sha256(b"model-bytes").hexdigest()
    receipt_dir = tmp_path / "support" / "model-verification"
    trusted = _payload(
        root,
        size=target.stat().st_size,
        sha256=digest,
        qualification_identity="storage-release:fixture-1",
    )
    validate_model_root_binding(trusted, qualification_receipt_dir=receipt_dir)

    original_hash = hashlib.sha256
    hashed: list[Path] = []

    def counted_hash(path: Path) -> str:
        hashed.append(path)
        return "sha256:" + original_hash(path.read_bytes()).hexdigest()

    monkeypatch.setattr("astrid.core.generation.model_root._file_sha256", counted_hash)
    legacy = {key: value for key, value in trusted.items() if key != "qualification_identity"}
    binding = validate_model_root_binding(legacy, qualification_receipt_dir=receipt_dir)

    assert hashed == [target]
    assert binding.qualification_identity is None
    assert len(list(receipt_dir.glob("*.json"))) == 1


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("size", 999, "size mismatch"),
        ("sha256", "sha256:" + "0" * 64, "hash mismatch"),
        ("name", "../model.bin", "safe relative"),
        ("name", ".", "safe relative"),
    ],
)
def test_model_root_binding_rejects_wrong_inventory_fields(
    tmp_path: Path, field: str, value: object, message: str
) -> None:
    root = tmp_path / "models"
    target = root / "vae" / "model.bin"
    target.parent.mkdir(parents=True)
    target.write_bytes(b"model-bytes")
    digest = "sha256:" + hashlib.sha256(b"model-bytes").hexdigest()
    payload = _payload(root, size=target.stat().st_size, sha256=digest)
    payload_inventory = payload["inventory"]
    assert isinstance(payload_inventory, list)
    payload_inventory[0][field] = value
    payload["inventory_digest"] = canonical_model_inventory_digest(payload_inventory)

    with pytest.raises(ModelRootBindingError, match=message):
        validate_model_root_binding(payload)


def test_model_root_binding_rejects_alias_shadow_and_root_alias(tmp_path: Path) -> None:
    root = tmp_path / "models"
    target = root / "vae" / "model.bin"
    target.parent.mkdir(parents=True)
    target.write_bytes(b"model-bytes")
    digest = "sha256:" + hashlib.sha256(b"model-bytes").hexdigest()
    payload = _payload(root, size=target.stat().st_size, sha256=digest)

    (root / "loras").mkdir()
    (root / "loras" / "model.bin").write_bytes(b"shadow")
    with pytest.raises(ModelRootBindingError, match="shadow"):
        validate_model_root_binding(payload)

    (root / "loras" / "model.bin").unlink()
    (root / "loras" / "alias.bin").symlink_to(target)
    with pytest.raises(ModelRootBindingError, match="symlink"):
        validate_model_root_binding(payload)

    with pytest.raises(ModelRootBindingError, match="lexical aliases"):
        validate_model_root_binding({**payload, "path": str(root / ".." / "models")})


def test_model_root_binding_requires_a_complete_nonempty_inventory(tmp_path: Path) -> None:
    root = tmp_path / "models"
    root.mkdir()
    (root / "model.safetensors").write_bytes(b"fixture")
    empty = {
        "schema_version": 1,
        "path": str(root),
        "inventory": [],
        "inventory_digest": canonical_model_inventory_digest([]),
    }
    with pytest.raises(ModelRootBindingError, match="incomplete.*unlisted=model.safetensors"):
        validate_model_root_binding(empty)

    declared = {
        "name": "model.safetensors",
        "sha256": "sha256:" + hashlib.sha256(b"fixture").hexdigest(),
        "size": len(b"fixture"),
        "subdir": ".",
    }
    payload = {
        "schema_version": 1,
        "path": str(root),
        "inventory": [declared],
        "inventory_digest": canonical_model_inventory_digest([declared]),
    }
    binding = validate_model_root_binding(payload)
    assert binding.inventory[0]["subdir"] == ""


def test_model_root_binding_rejects_missing_declared_file(tmp_path: Path) -> None:
    root = tmp_path / "models"
    root.mkdir()
    declared = {
        "name": "missing.safetensors",
        "sha256": "sha256:" + "0" * 64,
        "size": 1,
        "subdir": "checkpoints",
    }
    payload = {
        "schema_version": 1,
        "path": str(root),
        "inventory": [declared],
        "inventory_digest": canonical_model_inventory_digest([declared]),
    }
    with pytest.raises(ModelRootBindingError, match="incomplete.*missing=checkpoints/missing.safetensors"):
        validate_model_root_binding(payload)


@pytest.mark.parametrize("root_value", [None, "", "ComfyUI/models"])
def test_model_root_profile_rejects_empty_or_default_binding(
    tmp_path: Path, root_value: object
) -> None:
    profile = {"launch": {"model_root": root_value}}
    with pytest.raises(ModelRootBindingError):
        model_root_binding_from_profile(profile)


def test_child_environment_binding_cannot_disagree_with_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = tmp_path / "models"
    root.mkdir()
    model = root / "fixture.safetensors"
    model.write_bytes(b"fixture")
    entry = {
        "name": model.name,
        "sha256": "sha256:" + hashlib.sha256(model.read_bytes()).hexdigest(),
        "size": model.stat().st_size,
        "subdir": ".",
    }
    payload = {
        "schema_version": 1,
        "path": str(root),
        "inventory": [entry],
        "inventory_digest": canonical_model_inventory_digest([entry]),
    }
    monkeypatch.setenv(MODEL_ROOT_ENV, str(root))
    monkeypatch.setenv(MODEL_ROOT_BINDING_ENV, json.dumps(payload, sort_keys=True))
    binding = model_root_binding_from_environment()
    assert binding.path == root
    assert binding.inventory[0]["subdir"] == ""

    monkeypatch.setenv(MODEL_ROOT_ENV, str(tmp_path / "other"))
    with pytest.raises(ModelRootBindingError, match="disagrees"):
        model_root_binding_from_environment()


def test_attested_compile_root_rejects_workflow_metadata_redirect(tmp_path: Path) -> None:
    root = tmp_path / "models"
    root.mkdir()
    bundle = SimpleNamespace(
        workflow=SimpleNamespace(metadata={"models_root": str(tmp_path / "other")})
    )
    with pytest.raises(ModelRootBindingError, match="disagrees"):
        with use_attested_vibecomfy_models_root(bundle, root):
            pytest.fail("metadata redirect should be rejected before compile")
