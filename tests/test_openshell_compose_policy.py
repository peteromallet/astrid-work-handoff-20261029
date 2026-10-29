from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/openshell/compose_policy.py"
SPEC = importlib.util.spec_from_file_location("openshell_compose_policy", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
compose_policy = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(compose_policy)


@pytest.mark.parametrize("mode", list(compose_policy.CATALOG["modes"]))
@pytest.mark.parametrize("service", list(compose_policy.CATALOG["services"]))
def test_every_service_composes_in_every_mode(mode: str, service: str) -> None:
    spec = compose_policy.CATALOG["services"][service]
    argument = f"{service}@8188" if service == "comfyui" else service
    base_rules = set(compose_policy.CATALOG["modes"][mode]["rules"])
    service_rules = set(spec.get("rules", []))

    policy = compose_policy.run_policy(mode, [argument], [])
    network_policies = policy.get("network_policies", {})
    assert set(network_policies) == base_rules | service_rules
    for rule in network_policies.values():
        assert rule["endpoints"]
        assert rule["binaries"]

    if "credential" not in spec:
        return

    credential = spec["credential"]
    credential_policy = compose_policy.run_policy(mode, [f"{argument}+cred"], [])
    replaced = credential.get("replaces_rule")
    expected_rules = base_rules | service_rules
    if replaced:
        expected_rules.discard(replaced)
    assert set(credential_policy.get("network_policies", {})) == expected_rules
    assert compose_policy.provider_rule(service)["binaries"] == compose_policy.binaries(
        credential["binaries"]
    )


def test_huggingface_credential_is_limited_to_astrid_tools() -> None:
    rule = compose_policy.provider_rule("huggingface")
    assert rule["binaries"] == compose_policy.binaries(["astrid_tools"])
    assert all(path not in compose_policy.CATALOG["binaries"]["shell_tools"] for path in (
        binary["path"] for binary in rule["binaries"]
    ))


def test_comfyui_requires_a_valid_port() -> None:
    with pytest.raises(SystemExit, match="needs a port"):
        compose_policy.run_policy("locked", ["comfyui"], [])
    with pytest.raises(SystemExit, match="needs a port"):
        compose_policy.run_policy("locked", ["comfyui@65536"], [])


@pytest.mark.parametrize(
    "argv",
    [
        [],
        ["--mount"],
        ["--mount", "/share"],
        ["install", "extra"],
        ["run"],
        ["boundary"],
        ["profile"],
        ["profile", "openai", "extra"],
        ["menu", "extra"],
        ["field", "openai"],
        ["field", "openai", "env", "extra"],
        ["unknown"],
    ],
)
def test_main_reports_usage_errors(argv: list[str]) -> None:
    with pytest.raises(SystemExit, match="usage:"):
        compose_policy.main(argv)
