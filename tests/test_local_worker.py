"""Reserved new profile tests: fake selections only; no native authority."""
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
import pytest
from runtime_protocol.errors import ValidationError
from runtime_protocol.local_worker import LocalWorkerProfile, LocalWorkerLauncher, _selected_profile_payload
from runtime_protocol.local_execution_supervisor import CURRENT_ROLES_VERSION, digest, RelayError
from test_local_execution_supervisor import _prepare_case


def profile_case():
    selected=_prepare_case()[0]['profile']
    paths={'realm_root','support_root','worker_executable','host_executable','engine_executable','engine_listener_executable'}
    return LocalWorkerProfile(**{k:Path(v) if k in paths else v for k,v in selected.items()})


def declaration():
    return {'version':CURRENT_ROLES_VERSION,'module':'astrid.core.execution.generic_host','source_closure_digest':'a'*64}


def test_profile_absence_preserves_historical_projection_exactly():
    profile=profile_case()
    assert _selected_profile_payload(profile)==_prepare_case()[0]['profile']
    assert 'host_protocol' not in _selected_profile_payload(profile)


def test_profile_protocol_survives_projection_and_changes_existing_binding_digest():
    profile=profile_case();base=_selected_profile_payload(profile)
    selected=replace(profile,host_protocol=declaration())
    payload=_selected_profile_payload(selected)
    assert payload['host_protocol']==declaration() and digest(payload)!=digest(base)
    changed=replace(profile,host_protocol={**declaration(),'source_closure_digest':'b'*64})
    assert digest(_selected_profile_payload(changed))!=digest(payload)
    # Canonical projection owns a copy; caller mutation cannot edit a prior binding.
    payload['host_protocol']['source_closure_digest']='c'*64
    assert selected.host_protocol==declaration()


def test_legacy_profile_cannot_bypass_protocol_validation():
    profile=replace(profile_case(),engine_launch=None,host_protocol=declaration())
    launcher=SimpleNamespace(profiles={profile.profile_id:profile},workspace_uuid=profile.workspace_uuid,
        realm_root=profile.realm_root,support_root=profile.support_root)
    with pytest.raises(ValidationError,match='requires.*engine_launch'):
        LocalWorkerLauncher._profile(launcher,profile.profile_id,profile.workspace_uuid)


@pytest.mark.parametrize('change',[{'version':'unsupported'},{'module':'shadow'},{'source_closure_digest':'sha256:'+'a'*64},{'extra':True}])
def test_profile_validator_does_not_omit_or_accept_malformed_protocol(change):
    profile=replace(profile_case(),host_protocol={**declaration(),**change})
    with pytest.raises(RelayError):_selected_profile_payload(profile)


def host_only_profile_case():
    from runtime_protocol.local_worker import _digest
    profile = profile_case()
    launch = {"source_checkout": "/installed", "pack_root": "/installed/astrid/packs", "boot_manifest_path": "/support/boot.json",
        "boot_manifest_hash": "sha256:" + "b" * 64, "capability_matrix": None, "environment": {}, "max_concurrency": 4}
    return replace(profile, worker_executable=None, worker_artifact_digest="", engine_executable=None,
        engine_listener_executable=None, engine_endpoint="", engine_artifact_digest="", engine_listener_artifact_digest="",
        engine_launch=None, execution_mode="host_only_cpu", host_launch=launch, host_protocol=declaration(),
        session_config_digest=_digest(launch))


def test_host_only_explicit_profile_has_no_invented_roles_and_is_secure():
    from runtime_protocol.local_worker import _secure_profile
    profile = host_only_profile_case()
    payload = _selected_profile_payload(profile)
    assert _secure_profile(profile) and payload['execution_mode'] == 'host_only_cpu'
    assert not set(payload) & {'worker_executable', 'engine_launch', 'engine_executable', 'engine_listener_executable', 'engine_endpoint'}
    launcher = SimpleNamespace(profiles={profile.profile_id:profile}, workspace_uuid=profile.workspace_uuid,
        realm_root=profile.realm_root, support_root=profile.support_root)
    assert LocalWorkerLauncher._profile(launcher, profile.profile_id, profile.workspace_uuid) is profile


@pytest.mark.parametrize('change', [{'engine_launch': {}}, {'engine_executable': Path('/fake')}, {'worker_executable':Path('/fake')}, {'execution_mode':'unknown'}])
def test_host_only_rejects_undeclared_roles_or_mode(change):
    profile = replace(host_only_profile_case(), **change)
    launcher = SimpleNamespace(profiles={profile.profile_id:profile}, workspace_uuid=profile.workspace_uuid,
        realm_root=profile.realm_root, support_root=profile.support_root)
    with pytest.raises(ValidationError):
        LocalWorkerLauncher._profile(launcher, profile.profile_id, profile.workspace_uuid)
