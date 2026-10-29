"""Derived deterministic CPU boundary fixture for the H3 Character Swap candidate.

This fixture replaces inference only.  It never acquires model weights, never
claims that fixture bytes match a production checksum, and never submits a
prompt to ComfyUI.  The caller still compiles and transports the production
workflow and its checksum-pinned model requirements through Runtime.

Behavioral source: t2-derived-candidate-prep exact-source input, SHA-256
d67e59ba23fac66943d80c274446b1bfa1ff0cdff58c21e1440eeb2d3297ad41. This is a
new integration candidate fixture; using it does not prove public CPU-boundary
acceptance until the installed/runtime tuple is independently qualified.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import subprocess
from typing import Any, Mapping

from astrid.packs.vibecomfy.production_engine import ProductionEngineError, ProductionRunResult


ASTRID_T9_MODEL_SUBSTITUTE_ACTIVE = True
BOUNDARY_MODE = "deterministic_cpu_model_boundary_v1"
BOUNDARY_PURPOSE = "h3_character_swap_public_runtime_cpu_acceptance_v1"
BEHAVIORAL_SOURCE_SHA256 = "d67e59ba23fac66943d80c274446b1bfa1ff0cdff58c21e1440eeb2d3297ad41"
_MEDIA_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".mp4", ".mkv", ".mov", ".wav", ".flac"}


def _canonical(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str).encode()


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _boundary_profile(profile: Any) -> Mapping[str, Any]:
    if not isinstance(profile, Mapping):
        raise ProductionEngineError("approved CPU boundary requires its readiness profile")
    boundary = profile.get("t9_model_substitute")
    if (
        not isinstance(boundary, Mapping)
        or boundary.get("approved") is not True
        or boundary.get("mode") != BOUNDARY_MODE
        or boundary.get("purpose") != BOUNDARY_PURPOSE
    ):
        raise ProductionEngineError("approved CPU boundary readiness identity differs")
    return boundary


def _child_token(task_identity: str, attempt_identity: str, execution_identity: str, pid: int) -> str:
    payload = json.dumps(
        [task_identity, attempt_identity, execution_identity, pid],
        separators=(",", ":"),
    ).encode()
    return hashlib.sha256(payload).hexdigest()[:20]


def _canonical_case_file(value: Any, *, label: str, allow_existing: bool) -> Path:
    if not isinstance(value, str) or not value.strip():
        raise ProductionEngineError(f"approved CPU boundary {label} is missing")
    path = Path(value)
    if not path.is_absolute() or path.is_symlink() or not path.parent.is_dir():
        raise ProductionEngineError(f"approved CPU boundary {label} is not a canonical case path")
    if path.parent.resolve(strict=True) != path.parent:
        raise ProductionEngineError(f"approved CPU boundary {label} has a non-canonical parent")
    if path.exists() and (not allow_existing or not path.is_file()):
        raise ProductionEngineError(f"approved CPU boundary {label} already exists or is not a file")
    return path


def _activation_evidence(
    *,
    profile: Mapping[str, Any],
    task_identity: str,
    attempt_identity: str,
    execution_identity: str,
    child_pid: int,
    require_existing_marker: bool = False,
) -> tuple[dict[str, Any], Path, Path, Path, Path, Path]:
    boundary = _boundary_profile(profile)
    marker_base = _canonical_case_file(
        boundary.get("activation_marker_path"), label="activation marker base", allow_existing=False,
    )
    calls_path = _canonical_case_file(
        boundary.get("calls_path"), label="calls path", allow_existing=True,
    )
    evidence_base = _canonical_case_file(
        boundary.get("evidence_path"), label="evidence base", allow_existing=False,
    )
    if len({marker_base, calls_path, evidence_base}) != 3 or len({p.parent for p in (marker_base, calls_path, evidence_base)}) != 1:
        raise ProductionEngineError("approved CPU boundary evidence files must be distinct siblings")
    token = _child_token(task_identity, attempt_identity, execution_identity, child_pid)
    marker_path = marker_base.with_name(marker_base.stem + "-" + token + marker_base.suffix)
    evidence_path = evidence_base.with_name(evidence_base.stem + "-" + token + evidence_base.suffix)
    if require_existing_marker:
        if marker_path.is_symlink() or not marker_path.is_file() or marker_path.stat().st_nlink != 1:
            raise ProductionEngineError("approved CPU boundary activation marker is unavailable")
    elif marker_path.exists() or marker_path.is_symlink():
        raise ProductionEngineError("approved CPU boundary activation marker already exists")
    if evidence_path.exists() or evidence_path.is_symlink():
        raise ProductionEngineError("approved CPU boundary child output evidence already exists")
    return dict(boundary), marker_base, calls_path, evidence_base, marker_path, evidence_path


def _validated_activation_marker(
    *,
    profile: Mapping[str, Any],
    task_identity: str,
    attempt_identity: str,
    execution_identity: str,
    child_pid: int,
) -> tuple[dict[str, Any], Path, Path]:
    boundary, marker_base, calls_path, evidence_base, expected_marker, evidence_path = _activation_evidence(
        profile=profile,
        task_identity=task_identity,
        attempt_identity=attempt_identity,
        execution_identity=execution_identity,
        child_pid=child_pid,
        require_existing_marker=True,
    )
    raw_marker = os.environ.get("ASTRID_T9_MODEL_SUBSTITUTE_MARKER")
    raw_calls = os.environ.get("ASTRID_T9_MODEL_SUBSTITUTE_CALLS")
    if raw_marker != str(expected_marker) or raw_calls != str(calls_path):
        raise ProductionEngineError("approved CPU boundary child evidence paths do not match its activation")
    marker_path = Path(raw_marker)
    if marker_path.is_symlink() or not marker_path.is_file() or marker_path.stat().st_nlink != 1:
        raise ProductionEngineError("approved CPU boundary activation marker is unavailable")
    try:
        marker = json.loads(marker_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ProductionEngineError("approved CPU boundary activation marker is malformed") from exc
    profile_path_raw = marker.get("profile_path") if isinstance(marker, Mapping) else None
    if not isinstance(profile_path_raw, str):
        raise ProductionEngineError("approved CPU boundary marker lacks its paired profile path")
    profile_path = Path(profile_path_raw)
    if not profile_path.is_absolute() or profile_path.is_symlink() or not profile_path.is_file():
        raise ProductionEngineError("approved CPU boundary paired profile is unavailable")
    profile_bytes = profile_path.read_bytes()
    profile_digest = "sha256:" + hashlib.sha256(profile_bytes).hexdigest()
    try:
        observed_profile = json.loads(profile_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ProductionEngineError("approved CPU boundary paired profile is malformed") from exc
    candidate_raw = os.environ.get("ASTRID_H3_CANDIDATE_MANIFEST")
    if not isinstance(candidate_raw, str) or not candidate_raw:
        raise ProductionEngineError("approved CPU boundary candidate manifest is missing")
    candidate_path = Path(candidate_raw)
    if not candidate_path.is_absolute() or candidate_path.is_symlink() or not candidate_path.is_file():
        raise ProductionEngineError("approved CPU boundary candidate manifest is unavailable")
    candidate_bytes = candidate_path.read_bytes()
    candidate_digest = "sha256:" + hashlib.sha256(candidate_bytes).hexdigest()
    try:
        candidate = json.loads(candidate_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ProductionEngineError("approved CPU boundary candidate manifest is malformed") from exc
    fixture_path = Path(__file__).resolve(strict=True)
    fixture_digest = "sha256:" + hashlib.sha256(fixture_path.read_bytes()).hexdigest()
    expected = {
        "schema_version": "h3-t9-child-activation.v1",
        "child_pid": child_pid,
        "task_id": task_identity,
        "attempt_id": attempt_identity,
        "execution_id": execution_identity,
        "profile_id": "t9_cpu_stub",
        "profile_path": str(profile_path.resolve(strict=True)),
        "profile_sha256": profile_digest,
        "candidate_manifest_path": str(candidate_path.resolve(strict=True)),
        "candidate_manifest_sha256": candidate_digest,
        "fixture_path": str(fixture_path),
        "fixture_sha256": fixture_digest,
        "activation_marker_base_path": str(marker_base),
        "activation_marker_path": str(expected_marker),
        "calls_path": str(calls_path),
        "evidence_base_path": str(evidence_base),
        "evidence_path": str(evidence_path),
        "synthetic_inference": True,
        "queued_to_comfy": False,
        "production_model_bytes_observed": False,
    }
    if marker != expected:
        raise ProductionEngineError("approved CPU boundary activation marker identity differs")
    if observed_profile != profile:
        raise ProductionEngineError("approved CPU boundary profile bytes differ from the active readiness profile")
    if not isinstance(candidate, Mapping) or candidate.get("synthetic_inference") is not True or candidate.get("synthetic_inference_classification") != "synthetic-inference-only":
        raise ProductionEngineError("approved CPU boundary candidate is not synthetic-only")
    source_files = candidate.get("source_files")
    relative_fixture = "tests/fixtures/h3_cpu/approved_character_swap_cpu_boundary.py"
    if not isinstance(source_files, Mapping) or source_files.get(relative_fixture) != fixture_digest.removeprefix("sha256:"):
        raise ProductionEngineError("approved CPU boundary fixture differs from its candidate pin")
    if boundary.get("candidate_manifest_path") != str(candidate_path.resolve(strict=True)) or boundary.get("candidate_manifest_sha256") != candidate_digest.removeprefix("sha256:"):
        raise ProductionEngineError("approved CPU boundary candidate differs from its readiness profile")
    if boundary.get("source_path") != str(fixture_path) or boundary.get("source_sha256") != fixture_digest:
        raise ProductionEngineError("approved CPU boundary fixture differs from its readiness profile")
    if marker_path.parent != expected_marker.parent or evidence_path.parent != expected_marker.parent:
        raise ProductionEngineError("approved CPU boundary evidence escaped its case directory")
    return marker, calls_path, evidence_path


def _workflow_members(workflow_path: str | Path) -> tuple[dict[str, Any], dict[str, str]]:
    source = Path(workflow_path).resolve(strict=True)
    members = [source]
    if source.suffix.lower() == ".py":
        members.extend((source.with_suffix(".vibe.json"), source.with_name("source.json")))
    for member in members:
        if member.is_symlink() or not member.is_file():
            raise ProductionEngineError(f"approved CPU boundary lacks sealed workflow member {member.name!r}")
    digests = {member.name: _sha256(member) for member in members}
    companion = source.with_suffix(".vibe.json")
    canonical_companion = (
        json.loads(companion.read_text(encoding="utf-8")) if companion in members else {}
    )
    if not isinstance(canonical_companion, dict):
        raise ProductionEngineError("approved CPU boundary companion is not an object")
    return canonical_companion, digests


def _managed_inputs(
    destination: str | Path,
    bindings: Mapping[str, Any] | None,
    profile: Mapping[str, Any],
) -> tuple[list[dict[str, Any]], bytes]:
    session = profile.get("vibecomfy_session")
    if isinstance(session, Mapping):
        raw_session_dir = session.get("session_dir")
        if not isinstance(raw_session_dir, str) or not Path(raw_session_dir).is_absolute():
            raise ProductionEngineError("approved CPU boundary session identity is malformed")
        config_path = Path(raw_session_dir) / "config.json"
        try:
            config = json.loads(config_path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ProductionEngineError("approved CPU boundary session config is unreadable") from exc
        raw_root = config.get("input_directory") if isinstance(config, Mapping) else None
        if not isinstance(raw_root, str) or not Path(raw_root).is_absolute():
            raise ProductionEngineError("approved CPU boundary session input root is malformed")
        root = Path(raw_root).resolve()
    else:
        root = Path(destination).resolve() / "engine-input"
    if root.is_symlink() or not root.is_dir():
        raise ProductionEngineError("approved CPU boundary managed input root is unavailable")
    material = bytearray(_canonical(dict(bindings or {})))
    descriptors: list[dict[str, Any]] = []
    for binding, value in sorted((bindings or {}).items()):
        if not isinstance(value, str) or Path(value).suffix.lower() not in _MEDIA_SUFFIXES:
            continue
        candidate = Path(value)
        if not candidate.is_absolute():
            candidate = root / candidate
        if candidate.is_symlink() or not candidate.is_file():
            raise ProductionEngineError(
                f"approved CPU boundary could not resolve managed binding {binding!r}"
            )
        resolved = candidate.resolve(strict=True)
        payload = resolved.read_bytes()
        material.extend(binding.encode())
        material.extend(payload)
        descriptors.append({
            "binding": binding,
            "member": resolved.name,
            "sha256": hashlib.sha256(payload).hexdigest(),
            "size": len(payload),
        })
    return descriptors, bytes(material)


def _stub_run(
    workflow_path: str | Path,
    destination: str | Path,
    *,
    task_identity: str,
    profile_id: str,
    model_id: str = "vibecomfy",
    template_id: str = "vibecomfy.run",
    hc03_profile: Any = None,
    expected_execution_identity: str | None = None,
    attempt_identity: str | None = None,
    workflow_input_bindings: Mapping[str, Any] | None = None,
) -> ProductionRunResult:
    del model_id, template_id
    if profile_id != "t9_cpu_stub":
        raise ProductionEngineError("approved CPU boundary received an unexpected runtime profile")
    if any(not isinstance(value, str) or not value.strip() or value == "-"
           for value in (task_identity, attempt_identity, expected_execution_identity)):
        raise ProductionEngineError("approved CPU boundary requires task, attempt and execution identities")
    boundary = _boundary_profile(hc03_profile)
    marker, calls_path, evidence_path = _validated_activation_marker(
        profile=hc03_profile,
        task_identity=task_identity,
        attempt_identity=attempt_identity,
        execution_identity=expected_execution_identity,
        child_pid=os.getpid(),
    )

    companion, workflow_digests = _workflow_members(workflow_path)
    managed_inputs, binding_material = _managed_inputs(
        destination, workflow_input_bindings, hc03_profile,
    )
    graph_binding_sha256 = hashlib.sha256(
        _canonical(workflow_digests) + binding_material
    ).hexdigest()

    output_root = Path(destination).resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    audiovisual = output_root / "t9-deterministic-av.mp4"
    color = "#" + graph_binding_sha256[:6]
    frequency = str(220 + int(graph_binding_sha256[6:10], 16) % 660)
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", f"color=c={color}:s=1024x576:r=24:d=15",
        "-f", "lavfi", "-i", f"sine=frequency={frequency}:sample_rate=48000:duration=15",
        "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-preset", "ultrafast",
        "-crf", "0", "-pix_fmt", "yuv420p", "-c:a", "alac", "-ar", "48000",
        "-ac", "2", "-shortest", "-movflags", "+faststart", str(audiovisual),
    ], check=True, capture_output=True, text=True)
    if audiovisual.is_symlink() or not audiovisual.is_file() or audiovisual.stat().st_nlink != 1:
        raise ProductionEngineError("approved CPU boundary output is not a privately owned regular file")
    output = {
        "path": str(audiovisual.resolve(strict=True)),
        "sha256": _sha256(audiovisual),
        "bytes": audiovisual.stat().st_size,
        "media_type": "video/mp4",
    }
    evidence = {
        "schema_version": "h3-character-swap-cpu-boundary.v2",
        "boundary_mode": BOUNDARY_MODE,
        "boundary_purpose": BOUNDARY_PURPOSE,
        "synthetic_inference": True,
        "queued_to_comfy": False,
        "production_model_bytes_observed": False,
        "task_id": task_identity,
        "attempt_id": attempt_identity,
        "execution_id": expected_execution_identity,
        "child_pid": os.getpid(),
        "activation_marker": marker,
        "activation_marker_path": marker["activation_marker_path"],
        "evidence_path": str(evidence_path),
        "graph_binding_sha256": graph_binding_sha256,
        "sealed_workflow_members": workflow_digests,
        "managed_inputs": managed_inputs,
        "workflow_input_bindings": dict(workflow_input_bindings or {}),
        "canonical_companion": companion,
        "outputs": [output],
    }
    try:
        with evidence_path.open("x", encoding="utf-8") as handle:
            handle.write(json.dumps(evidence, sort_keys=True, separators=(",", ":"), default=str))
            handle.flush()
            os.fsync(handle.fileno())
        call = {
            "task_id": task_identity,
            "attempt_id": attempt_identity,
            "execution_id": expected_execution_identity,
            "child_pid": os.getpid(),
            "activation_marker_path": marker["activation_marker_path"],
            "evidence_path": str(evidence_path),
            "graph_binding_sha256": graph_binding_sha256,
            "outputs": [output],
        }
        fd = os.open(calls_path, os.O_APPEND | os.O_CREAT | os.O_WRONLY, 0o600)
        try:
            os.write(fd, json.dumps(call, sort_keys=True, separators=(",", ":")).encode() + b"\n")
            os.fsync(fd)
        finally:
            os.close(fd)
    except OSError as exc:
        raise ProductionEngineError("approved CPU boundary could not persist child output evidence") from exc
    return ProductionRunResult(outputs=(audiovisual,))
