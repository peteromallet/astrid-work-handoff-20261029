"""The two public language packages are stamped from one contract release."""
from __future__ import annotations

import json
from pathlib import Path
import re
import tomllib

import astrid_runtime_client
from generators.generate import render


ROOT = Path(__file__).resolve().parents[1]


def test_language_packages_share_the_contract_release() -> None:
    version = json.loads((ROOT / "generators/release.json").read_text())["contract_version"]
    python = tomllib.loads((ROOT / "packages/python/pyproject.toml").read_text())
    typescript = json.loads((ROOT / "packages/typescript/package.json").read_text())
    lock = json.loads((ROOT / "packages/typescript/package-lock.json").read_text())
    metadata = (ROOT / "packages/typescript/src/contract-metadata.ts").read_text()
    match = re.search(r'^export const CONTRACT_VERSION = ("[^"]+") as const;$', metadata, re.MULTILINE)
    assert match is not None
    assert (astrid_runtime_client.CONTRACT_VERSION == python["project"]["version"]
            == typescript["version"] == lock["version"] == lock["packages"][""]["version"]
            == json.loads(match.group(1)) == version)


def test_release_metadata_stamps_both_packages(tmp_path: Path) -> None:
    release = tmp_path / "release.json"
    release.write_text(json.dumps({"contract_version": "12.34.56"}))
    outputs = render(release_path=release)
    assert tomllib.loads(outputs["packages/python/pyproject.toml"])["project"]["version"] == "12.34.56"
    assert json.loads(outputs["packages/typescript/package.json"])["version"] == "12.34.56"
    lock = json.loads(outputs["packages/typescript/package-lock.json"])
    assert lock["version"] == lock["packages"][""]["version"] == "12.34.56"
    assert "CONTRACT_VERSION = '12.34.56'" in outputs["packages/python/astrid_runtime_client/contract_metadata.py"]
    assert 'export const CONTRACT_VERSION = "12.34.56"' in outputs["packages/typescript/src/contract-metadata.ts"]
