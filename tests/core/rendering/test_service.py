from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest

from astrid.core.rendering.contracts import (
    SCHEMA_VERSION,
    Attachment,
    AudioOwnership,
    FinalizerManifest,
    FinalizerResolution,
    FrameWindow,
    LayerRef,
    PlannerManifest,
    PlannerResolution,
    RendererManifest,
    RendererResolution,
    RenderPlan,
    RenderProfile,
    RenderRequest,
    RenderResult,
    RenderSegment,
    SupportReport,
    VideoArtifact,
)
from astrid.core.rendering.errors import (
    RendererInternalError,
    RendererInvalidArtifactError,
    RendererProtocolError,
    RendererUnsupportedError,
    raise_internal_error,
)
from astrid.core.rendering.publication import publish_render_result
from astrid.core.rendering.registry import (
    ExecutionEligibility,
    FinalizerRegistry,
    PlannerRegistry,
    RendererRegistry,
    RenderingCandidate,
    load_default_registries,
)
from astrid.core.rendering.service import RenderService, _render_workspace_parent


def test_managed_render_workspace_is_outside_attempt_output_root(tmp_path):
    output = tmp_path / "attempt" / "outputs" / "video.mp4"
    assert _render_workspace_parent(output) == tmp_path / "attempt"
    assert _render_workspace_parent(tmp_path / "video.mp4") == tmp_path


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _profile(*, audio: bool = False) -> RenderProfile:
    return RenderProfile(
        width=160,
        height=90,
        fps_rational=(10, 1),
        time_base=(1, 10240),
        container="mp4",
        video_codec="h264",
        video_profile=None,
        video_level=None,
        pixel_format="yuv420p",
        audio_codec="aac" if audio else None,
        audio_sample_rate=48000 if audio else None,
        audio_channel_layout="stereo" if audio else None,
    )


def _support(
    backend: str,
    *,
    supported: bool = True,
    alternatives: list[str] | None = None,
) -> SupportReport:
    return SupportReport(
        schema_version=SCHEMA_VERSION,
        supported=supported,
        reasons=[] if supported else ["fixture timeline is unsupported"],
        features={"fixture": True},
        alternatives=list(alternatives or []),
        backend=backend,
        backend_version="1.0.0",
    )


def _candidate(
    root: Path,
    capability_id: str,
    kind: str,
    *,
    eligible: bool = True,
    operations: tuple[str, ...] | None = None,
    capabilities: dict[str, Any] | None = None,
    priority_index: int = 0,
) -> RenderingCandidate[Any]:
    common = dict(
        schema_version=SCHEMA_VERSION,
        id=capability_id,
        name=capability_id,
        version="1.0.0",
        protocol_version=SCHEMA_VERSION,
        command=("fixture-command",),
        required_permissions=(),
        required_binaries=(),
    )
    if kind == "renderer":
        manifest = RendererManifest(
            **common,
            operations=operations or ("render", "support"),
            capabilities=(
                {"supports_windows": True}
                if capabilities is None
                else capabilities
            ),
        )
    elif kind == "planner":
        manifest = PlannerManifest(
            **common,
            operations=operations or ("plan", "support"),
            capabilities=(
                {"supports_fallback": True}
                if capabilities is None
                else capabilities
            ),
        )
    else:
        manifest = FinalizerManifest(
            **common,
            operations=operations or ("finalize", "support"),
            capabilities=(
                {"preserves_attachments": True}
                if capabilities is None
                else capabilities
            ),
        )
    manifest_path = root / f"{capability_id}.yaml"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text("fixture\n", encoding="utf-8")
    return RenderingCandidate(
        manifest=manifest,
        source_kind="source",
        pack_id=capability_id.split(".", 1)[0],
        pack_root=root,
        manifest_path=manifest_path,
        manifest_digest=_digest(capability_id),
        priority_index=priority_index,
        eligibility=ExecutionEligibility(
            eligible=eligible,
            reason="fixture trust" if eligible else "trust denied",
            trust_method="test" if eligible else None,
        ),
    )


def _renderer_resolution(backend: str) -> RendererResolution:
    return RendererResolution(
        id=backend,
        source_pack={"id": backend.split(".", 1)[0]},
        manifest_digest=_digest(backend),
        alias_chain=[],
        override=None,
        support_decision=_support(backend),
        trust_eligibility={"eligible": True},
    )


def _planner_resolution(backend: str = "rendering.legacy_hybrid") -> PlannerResolution:
    return PlannerResolution(
        id=backend,
        source_pack={"id": backend.split(".", 1)[0]},
        manifest_digest=_digest(backend),
        trust_eligibility={"eligible": True},
        support_decision=_support(backend),
    )


def _finalizer_resolution(
    backend: str = "rendering.ffmpeg-finalizer",
) -> FinalizerResolution:
    return FinalizerResolution(
        id=backend,
        source_pack={"id": backend.split(".", 1)[0]},
        manifest_digest=_digest(backend),
        trust_eligibility={"eligible": True},
        support_decision=_support(backend),
    )


def _attachment_file(
    workspace: Path,
    name: str,
    data: bytes,
    *,
    kind: str = "fixture",
) -> Attachment:
    att_dir = workspace / "attachments"
    att_dir.mkdir(parents=True, exist_ok=True)
    path = att_dir / name
    path.write_bytes(data)
    return Attachment.from_file(
        name=name,
        path=path,
        kind=kind,
        workspace_root=workspace,
    )


class FakeTransport:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []
        self.support: dict[str, SupportReport] = {}
        self.plan: RenderPlan | None = None
        self.fail_render: str | None = None
        self.fail_support: str | None = None
        self.fail_finalize: str | None = None
        self.render_frames: dict[str, int] = {}
        self.render_ownership: dict[str, AudioOwnership] = {}
        self.render_attachments: dict[
            str, dict[str, bytes] | list[dict[str, bytes]]
        ] = {}
        self.finalize_attachments: dict[str, bytes] = {}
        self.finalize_ownership: AudioOwnership = AudioOwnership.NONE
        self.payloads: list[tuple[str, str, dict[str, Any]]] = []

    def run(
        self,
        verb: str,
        command: Any,
        *,
        backend: str,
        request_path: Path,
        result_path: Path,
        cwd: Path,
        **kwargs: Any,
    ) -> Any:
        del command, result_path, cwd, kwargs
        self.calls.append((verb, backend))
        payload = json.loads(Path(request_path).read_text(encoding="utf-8"))
        self.payloads.append((verb, backend, payload))
        workspace = Path(request_path).parent
        if verb == "support":
            if self.fail_support == backend:
                (workspace / "partial.tmp").write_bytes(b"partial")
                raise_internal_error(
                    backend=backend,
                    message="fixture support crashed",
                    recovery_command="retry fixture support",
                )
            return self.support.get(backend, _support(backend))
        if verb == "plan":
            assert self.plan is not None
            return self.plan
        if verb == "render" and self.fail_render == backend:
            (workspace / "partial.tmp").write_bytes(b"partial")
            raise_internal_error(
                backend=backend,
                message="fixture renderer crashed",
                recovery_command="retry fixture renderer",
            )
        output = workspace / "outputs" / payload["output_name"]
        output.parent.mkdir(parents=True, exist_ok=True)
        if verb == "finalize":
            if self.fail_finalize == backend:
                (workspace / "partial.tmp").write_bytes(b"partial")
                raise_internal_error(
                    backend=backend,
                    message="fixture finalizer crashed",
                    recovery_command="retry fixture finalizer",
                )
            frames = payload["plan"]["total_frames"]
            ownership = self.finalize_ownership
            plan_profile = RenderProfile.from_dict(payload["plan"]["profile"])
            if plan_profile.has_audio is (ownership is AudioOwnership.RENDERED):
                profile = plan_profile
            else:
                profile = _profile(audio=ownership is AudioOwnership.RENDERED)
            attachments: dict[str, Attachment] = {}
            for artifact in payload.get("artifacts", []):
                for name, descriptor in (artifact.get("attachments") or {}).items():
                    attachments[name] = Attachment.from_dict(descriptor)
            for name, data in self.finalize_attachments.items():
                attachments[name] = _attachment_file(workspace, name, data)
        else:
            window = payload.get("window")
            frames = (
                self.render_frames[backend]
                if backend in self.render_frames
                else (
                    window["end_frame"] - window["start_frame"]
                    if window is not None
                    else 10
                )
            )
            ownership = self.render_ownership.get(
                backend,
                AudioOwnership(payload.get("audio") or "none"),
            )
            profile = _profile(audio=ownership is AudioOwnership.RENDERED)
            if window is not None:
                # Planned segments are validated against the canonical plan
                # profile; the simulated artifact must speak the window FPS.
                profile = replace(
                    profile, fps_rational=tuple(window["fps_rational"])
                )
            raw_attachments = self.render_attachments.get(backend, {})
            if isinstance(raw_attachments, list):
                # Per-invocation sequence: one attachment map per render call.
                named = raw_attachments.pop(0) if raw_attachments else {}
            else:
                named = raw_attachments
            attachments = {
                name: _attachment_file(workspace, name, data)
                for name, data in named.items()
            }
        output.write_bytes(f"{verb}:{backend}:{frames}".encode())
        video = VideoArtifact.from_file(
            path=output,
            workspace_root=workspace,
            profile=profile,
            duration_frames=frames,
            audio=ownership,
            attachments=attachments,
        )
        return RenderResult(
            schema_version=SCHEMA_VERSION,
            video=video,
            audio_ownership=ownership,
            backend_fragments={backend: {"fixture_backend": backend}},
        )


def _request(tmp_path: Path, *, audio: AudioOwnership | None = None) -> RenderRequest:
    timeline = tmp_path / "timeline.json"
    assets = tmp_path / "assets.json"
    timeline.write_text('{"tracks": [], "clips": []}', encoding="utf-8")
    assets.write_text('{"assets": {}}', encoding="utf-8")
    return RenderRequest(
        schema_version=SCHEMA_VERSION,
        timeline_path=str(timeline),
        assets_registry_path=str(assets),
        output_name="video.mp4",
        audio=audio,
    )


def _service(
    tmp_path: Path,
    transport: FakeTransport,
    *,
    renderer_ids: tuple[str, ...] = (
        "rendering.remotion",
        "rendering.ffmpeg",
    ),
    planner_ids: tuple[str, ...] = (),
    stage_observer: Any = None,
    audio_completer: Any = None,
    renderer_registry: RendererRegistry | None = None,
    validator: Any = None,
    publisher: Any = None,
    finalizer_id: str | None = None,
) -> RenderService:
    renderers = renderer_registry or RendererRegistry(
        [_candidate(tmp_path, item, "renderer") for item in renderer_ids]
    )
    planners = PlannerRegistry(
        [_candidate(tmp_path, item, "planner") for item in planner_ids]
    )
    finalizers = FinalizerRegistry(
        [_candidate(tmp_path, "rendering.ffmpeg-finalizer", "finalizer")]
    )
    return RenderService(
        registries=(renderers, planners, finalizers),
        transport=transport,
        validator=validator or (lambda result, **_kwargs: result),
        publisher=publisher or publish_render_result,
        stage_observer=stage_observer,
        audio_completer=audio_completer,
        finalizer_id=finalizer_id,
    )


def test_full_qualified_remotion_render_observes_frozen_service_order(
    tmp_path: Path,
) -> None:
    transport = FakeTransport()
    calls: list[str] = []

    def validate(result: RenderResult, **_kwargs: Any) -> RenderResult:
        calls.append("validator")
        return result

    def publish(*args: Any, **kwargs: Any) -> Path:
        calls.append("publisher")
        return publish_render_result(*args, **kwargs)

    service = _service(
        tmp_path,
        transport,
        stage_observer=lambda stage, _details: calls.append(stage),
        validator=validate,
        publisher=publish,
    )
    output = tmp_path / "published" / "video.mp4"

    result = service.render_request(
        _request(tmp_path),
        selector="rendering.remotion",
        out_path=output,
    )

    assert result == output
    assert transport.calls == [
        ("support", "rendering.remotion"),
        ("render", "rendering.remotion"),
    ]
    assert calls == [
        "selection",
        "alias",
        "override",
        "winner",
        "eligibility",
        "support",
        "invoke",
        "validate",
        "validator",
        "audio",
        "publish",
        "publisher",
    ]
    assert output.is_file()
    assert Path(f"{output}.provenance.json").is_file()


def test_qualified_ffmpeg_is_strict(tmp_path: Path) -> None:
    transport = FakeTransport()
    service = _service(tmp_path, transport)

    service.render_request(
        _request(tmp_path),
        selector="rendering.ffmpeg",
        out_path=tmp_path / "strict.mp4",
    )

    assert transport.calls == [
        ("support", "rendering.ffmpeg"),
        ("render", "rendering.ffmpeg"),
    ]


def test_direct_renderer_does_not_require_an_executable_finalizer(
    tmp_path: Path,
) -> None:
    transport = FakeTransport()
    renderers = RendererRegistry(
        [_candidate(tmp_path, "fixture.direct", "renderer")]
    )
    service = RenderService(
        registries=(renderers, PlannerRegistry(), FinalizerRegistry()),
        transport=transport,
        validator=lambda result, **_kwargs: result,
    )

    output = service.render_request(
        _request(tmp_path),
        selector="fixture.direct",
        out_path=tmp_path / "direct.mp4",
    )

    assert output.is_file()
    assert transport.calls == [
        ("support", "fixture.direct"),
        ("render", "fixture.direct"),
    ]


def test_unknown_backend_is_structured_and_lists_alternatives(tmp_path: Path) -> None:
    transport = FakeTransport()
    service = _service(tmp_path, transport)

    with pytest.raises(RendererUnsupportedError) as caught:
        service.render_request(
            _request(tmp_path),
            selector="missing.renderer",
            out_path=tmp_path / "missing.mp4",
        )

    assert caught.value.error.kind == "unsupported"
    assert "rendering.remotion" in caught.value.error.details["alternatives"]
    assert caught.value.error.recovery_command


def test_execution_ineligible_candidate_is_denied(tmp_path: Path) -> None:
    renderers = RendererRegistry(
        [_candidate(tmp_path, "denied.renderer", "renderer", eligible=False)]
    )
    transport = FakeTransport()
    service = _service(
        tmp_path,
        transport,
        renderer_ids=(),
        renderer_registry=renderers,
    )

    with pytest.raises(RendererUnsupportedError) as caught:
        service.render_request(
            _request(tmp_path),
            selector="denied.renderer",
            out_path=tmp_path / "denied.mp4",
        )

    registry_error = caught.value.error.details["registry_error"]
    assert registry_error["code"] == "execution_ineligible"
    assert transport.calls == []


def test_unsupported_support_report_is_structured_with_reported_alternative(
    tmp_path: Path,
) -> None:
    transport = FakeTransport()
    transport.support["rendering.ffmpeg"] = _support(
        "rendering.ffmpeg",
        supported=False,
        alternatives=["rendering.remotion"],
    )
    service = _service(tmp_path, transport)

    with pytest.raises(RendererUnsupportedError) as caught:
        service.render_request(
            _request(tmp_path),
            selector="rendering.ffmpeg",
            out_path=tmp_path / "unsupported.mp4",
        )

    assert caught.value.error.details["alternatives"] == ["rendering.remotion"]
    assert caught.value.error.details["reasons"] == [
        "fixture timeline is unsupported"
    ]


def test_renderer_without_support_operation_fails_closed_on_missing_hints(
    tmp_path: Path,
) -> None:
    renderers = RendererRegistry(
        [
            _candidate(
                tmp_path,
                "fixture.static",
                "renderer",
                operations=("render",),
                capabilities={},
            )
        ]
    )
    transport = FakeTransport()
    service = RenderService(
        registries=(renderers, PlannerRegistry(), FinalizerRegistry()),
        transport=transport,
        validator=lambda result, **_kwargs: result,
    )

    with pytest.raises(RendererUnsupportedError) as caught:
        service.render_request(
            _request(tmp_path),
            selector="fixture.static",
            out_path=tmp_path / "static.mp4",
        )

    assert "full timelines" in " ".join(caught.value.error.details["reasons"])
    assert transport.calls == []


@pytest.mark.parametrize(
    "ownership", [AudioOwnership.PASSTHROUGH, AudioOwnership.NONE]
)
def test_host_audio_completion_handles_visual_only_modes(
    tmp_path: Path,
    ownership: AudioOwnership,
) -> None:
    transport = FakeTransport()
    completed: list[AudioOwnership] = []

    def audio_completer(result: RenderResult, **_kwargs: Any) -> RenderResult:
        completed.append(result.audio_ownership)
        if result.audio_ownership is AudioOwnership.PASSTHROUGH:
            return replace(
                result,
                video=replace(
                    result.video,
                    profile=_profile(audio=True),
                    audio=AudioOwnership.RENDERED,
                ),
                audio_ownership=AudioOwnership.RENDERED,
            )
        return result

    service = _service(tmp_path, transport, audio_completer=audio_completer)
    output = tmp_path / f"{ownership.value}.mp4"

    service.render_request(
        _request(tmp_path, audio=ownership),
        selector="rendering.ffmpeg",
        out_path=output,
    )

    assert completed == [ownership]
    sidecar = json.loads(Path(f"{output}.provenance.json").read_text(encoding="utf-8"))
    expected = (
        AudioOwnership.RENDERED
        if ownership is AudioOwnership.PASSTHROUGH
        else AudioOwnership.NONE
    )
    assert sidecar["audio_ownership"] == expected.value


def test_passthrough_audio_cannot_publish_without_host_completion(
    tmp_path: Path,
) -> None:
    transport = FakeTransport()
    service = _service(tmp_path, transport)
    output = tmp_path / "incomplete-passthrough.mp4"

    with pytest.raises(RendererUnsupportedError, match="audio completer"):
        service.render_request(
            _request(tmp_path, audio=AudioOwnership.PASSTHROUGH),
            selector="rendering.ffmpeg",
            out_path=output,
        )

    assert not output.exists()
    assert not Path(f"{output}.provenance.json").exists()


def test_backend_failure_removes_invocation_workspace_and_commits_nothing(
    tmp_path: Path,
) -> None:
    transport = FakeTransport()
    transport.fail_render = "rendering.ffmpeg"
    service = _service(tmp_path, transport)
    output = tmp_path / "failed.mp4"

    with pytest.raises(RendererInternalError):
        service.render_request(
            _request(tmp_path), selector="rendering.ffmpeg", out_path=output
        )

    assert not output.exists()
    assert not Path(f"{output}.provenance.json").exists()
    assert not list(tmp_path.glob(".failed.mp4.render-service-*"))


def test_each_success_commits_exactly_one_sidecar(tmp_path: Path) -> None:
    transport = FakeTransport()
    service = _service(tmp_path, transport)
    output = tmp_path / "one-sidecar.mp4"

    service.render_request(
        _request(tmp_path), selector="rendering.ffmpeg", out_path=output
    )

    sidecars = list(tmp_path.glob("*.provenance.json"))
    assert sidecars == [Path(f"{output}.provenance.json")]
    payload = json.loads(sidecars[0].read_text(encoding="utf-8"))
    assert payload["output"] == str(output)
    assert payload["sha256"] == hashlib.sha256(output.read_bytes()).hexdigest()


# ---------------------------------------------------------------------------
# T4.5 — routing matrix
# ---------------------------------------------------------------------------


def _sidecar(output: Path) -> dict[str, Any]:
    return json.loads(Path(f"{output}.provenance.json").read_text(encoding="utf-8"))


def test_trust_denied_higher_priority_candidate_never_wins(
    tmp_path: Path,
) -> None:
    renderers = RendererRegistry(
        [
            _candidate(
                tmp_path,
                "contested.renderer",
                "renderer",
                eligible=False,
                priority_index=0,
            ),
            _candidate(
                tmp_path,
                "contested.renderer",
                "renderer",
                eligible=True,
                priority_index=10,
            ),
        ]
    )
    transport = FakeTransport()
    service = _service(
        tmp_path,
        transport,
        renderer_ids=(),
        renderer_registry=renderers,
    )
    output = tmp_path / "contested.mp4"

    service.render_request(
        _request(tmp_path), selector="contested.renderer", out_path=output
    )

    assert transport.calls == [
        ("support", "contested.renderer"),
        ("render", "contested.renderer"),
    ]
    payload = _sidecar(output)
    renderer = payload["segments_v2"][0]["renderer"]
    assert renderer["id"] == "contested.renderer"
    assert renderer["trust_eligibility"]["eligible"] is True
    assert renderer["trust_eligibility"]["reason"] == "fixture trust"


@pytest.mark.parametrize(
    "name",
    [
        "a/b.mp4",
        "a\\b.mp4",
        "sub/out.mp4",
        "/abs.mp4",
        "../evil.mp4",
        "..mp4",
        "..",
        ".",
        "",
    ],
)
def test_separator_and_traversal_output_names_are_rejected_before_invocation(
    tmp_path: Path, name: str
) -> None:
    transport = FakeTransport()
    service = _service(tmp_path, transport)
    output = tmp_path / "never-written.mp4"
    request = _request(tmp_path).to_dict()
    request["output_name"] = name

    with pytest.raises(RendererProtocolError) as caught:
        service.render_request(request, selector="rendering.ffmpeg", out_path=output)

    assert caught.value.error.kind == "protocol"
    assert caught.value.error.recovery_command
    assert transport.calls == []
    assert not output.exists()
    assert not list(tmp_path.glob("*.provenance.json"))
    assert not list(tmp_path.glob(".*.render-service-*"))


def test_facade_delegates_suffix_policy_but_preserves_hype_default() -> None:
    from astrid.packs.rendering.actions.render.run import (
        DEFAULT_OUTPUT_NAME,
        validate_output_name,
    )

    assert DEFAULT_OUTPUT_NAME == "hype.mp4"
    assert validate_output_name("hype.mp4") == "hype.mp4"
    assert validate_output_name("out.mov") == "out.mov"


def test_hype_mp4_default_output_name_is_preserved(tmp_path: Path) -> None:
    transport = FakeTransport()
    service = _service(tmp_path, transport)
    output = tmp_path / "published" / "hype.mp4"
    request = replace(_request(tmp_path), output_name="hype.mp4")

    service.render_request(
        request, selector="rendering.ffmpeg", out_path=output
    )

    render_payloads = [
        payload
        for verb, backend, payload in transport.payloads
        if verb == "render" and backend == "rendering.ffmpeg"
    ]
    assert len(render_payloads) == 1
    assert render_payloads[0]["output_name"] == "hype.mp4"
    payload = _sidecar(output)
    assert payload["output"] == str(output.resolve())
    assert payload["sha256"] == hashlib.sha256(output.read_bytes()).hexdigest()


@pytest.mark.parametrize(
    (
        "selector",
        "plan_segments",
        "backend_config",
        "expect_finalize",
        "expected_engine",
    ),
    [
        ("rendering.remotion", None, {}, False, "rendering.remotion"),
        ("rendering.ffmpeg", None, {}, False, "rendering.ffmpeg"),
        (
            "rendering.ffmpeg",
            None,
            {"rendering.ffmpeg": {"mode": "optimized", "stream_copy": True}},
            False,
            "rendering.ffmpeg",
        ),
        (
            "rendering.ffmpeg",
            None,
            {"rendering.ffmpeg": {"audio_reactive": True}},
            False,
            "rendering.ffmpeg",
        ),
    ],
    ids=[
        "remotion",
        "ffmpeg",
        "ffmpeg-optimized",
        "ffmpeg-audio-reactive",
    ],
)
def test_builtin_paths_commit_exactly_one_video_and_sidecar(
    tmp_path: Path,
    selector: str,
    plan_segments: tuple[int, ...] | None,
    backend_config: dict[str, dict[str, Any]],
    expect_finalize: bool,
    expected_engine: str,
) -> None:
    transport = FakeTransport()
    service = _service(tmp_path, transport)
    output = tmp_path / "builtin.mp4"
    request = replace(_request(tmp_path), backend_config=backend_config)

    service.render_request(request, selector=selector, out_path=output)

    assert output.is_file()
    sidecars = list(tmp_path.glob("*.provenance.json"))
    assert sidecars == [Path(f"{output}.provenance.json")]
    payload = json.loads(sidecars[0].read_text(encoding="utf-8"))
    assert payload["sha256"] == hashlib.sha256(output.read_bytes()).hexdigest()
    assert payload["output"] == str(output.resolve())
    assert payload["engine"] == expected_engine
    assert payload["audio_ownership"] == "none"
    for _verb, backend, payload_data in transport.payloads:
        if backend in backend_config:
            assert payload_data["backend_config"][backend] == backend_config[backend]
    if expect_finalize:
        assert ("finalize", "rendering.ffmpeg-finalizer") in transport.calls
    else:
        assert not any(verb == "finalize" for verb, _backend in transport.calls)
    assert not list(tmp_path.glob(".*.render-service-*"))


def test_support_failure_removes_workspace_and_commits_nothing(
    tmp_path: Path,
) -> None:
    transport = FakeTransport()
    transport.fail_support = "rendering.ffmpeg"
    service = _service(tmp_path, transport)
    output = tmp_path / "failed-support.mp4"

    with pytest.raises(RendererInternalError):
        service.render_request(
            _request(tmp_path), selector="rendering.ffmpeg", out_path=output
        )

    assert not output.exists()
    assert not list(tmp_path.glob("*.provenance.json"))
    assert not list(tmp_path.glob(".*.render-service-*"))


def test_renderer_attachments_survive_validation_into_committed_provenance(
    tmp_path: Path,
) -> None:
    transport = FakeTransport()
    transport.render_attachments["rendering.ffmpeg"] = {
        "storyboard.png": b"png-bytes",
        "captions.srt": b"srt-bytes",
    }
    service = _service(tmp_path, transport)
    output = tmp_path / "attachments.mp4"

    service.render_request(
        _request(tmp_path), selector="rendering.ffmpeg", out_path=output
    )

    payload = _sidecar(output)
    assert set(payload["attachments"]) == {"storyboard.png", "captions.srt"}
    assert payload["attachments"]["storyboard.png"]["sha256"] == hashlib.sha256(
        b"png-bytes"
    ).hexdigest()
    assert payload["attachments"]["storyboard.png"]["kind"] == "fixture"
    assert payload["attachments"]["storyboard.png"]["path"].endswith(
        "storyboard.png"
    )
    assert len(payload["artifact_profiles"]) == 1
    assert set(payload["artifact_profiles"][0]["attachments"]) == {
        "storyboard.png",
        "captions.srt",
    }


def test_audio_completer_dropping_attachments_is_rejected(tmp_path: Path) -> None:
    transport = FakeTransport()
    transport.render_attachments["rendering.ffmpeg"] = {"must-survive.txt": b"x"}

    def bad_completer(result: RenderResult, **_kwargs: Any) -> RenderResult:
        return replace(
            result,
            video=replace(
                result.video,
                profile=_profile(audio=True),
                audio=AudioOwnership.RENDERED,
                attachments={},
            ),
            audio_ownership=AudioOwnership.RENDERED,
        )

    service = _service(tmp_path, transport, audio_completer=bad_completer)
    output = tmp_path / "dropped-attachments.mp4"

    with pytest.raises(RendererInvalidArtifactError, match="attachments"):
        service.render_request(
            replace(_request(tmp_path), audio=AudioOwnership.PASSTHROUGH),
            selector="rendering.ffmpeg",
            out_path=output,
        )

    assert not output.exists()
    assert not list(tmp_path.glob("*.provenance.json"))
    assert not list(tmp_path.glob(".*.render-service-*"))


# ---------------------------------------------------------------------------
# Real-backend integration through the generic service (issue-8 coverage)
# ---------------------------------------------------------------------------


def _real_service(tmp_path: Path) -> RenderService:
    renderers, planners, finalizers = load_default_registries(
        tmp_path
    )
    return RenderService(registries=(renderers, planners, finalizers))


def _real_media_inputs(tmp_path: Path) -> tuple[Path, Path]:
    root = tmp_path / "media"
    root.mkdir(exist_ok=True)
    source = root / "source.mp4"
    subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=blue:s=160x90:r=10:d=0.5",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-an",
            str(source),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    timeline_path = root / "timeline.json"
    assets_path = root / "assets.json"
    timeline_path.write_text(
        json.dumps(
            {
                "theme": "banodoco-default",
                "theme_overrides": {
                    "visual": {"canvas": {"width": 160, "height": 90, "fps": 10}}
                },
                "tracks": [{"id": "v", "kind": "visual", "label": "Video"}],
                "clips": [
                    {
                        "id": "source",
                        "at": 0,
                        "track": "v",
                        "clipType": "media",
                        "asset": "source",
                        "from": 0,
                        "to": 0.5,
                        "speed": 1,
                        "volume": 0,
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    assets_path.write_text(
        json.dumps(
            {
                "assets": {
                    "source": {
                        "file": source.name,
                        "type": "video/mp4",
                        "duration": 0.5,
                        "resolution": "160x90",
                        "fps": 10,
                    }
                }
            }
        ),
        encoding="utf-8",
    )
    return timeline_path, assets_path


def _add_audio_track(timeline_path: Path) -> None:
    """Mux an AAC track into the media source so the whole-media path with
    audio (the canonical 48 kHz contract) is exercised end to end."""
    source = timeline_path.parent / "source.mp4"
    audio_path = source.with_suffix(".aac")
    subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:sample_rate=48000:duration=0.5",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            str(audio_path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    muxed = timeline_path.parent / "muxed.mp4"
    subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(source),
            "-i",
            str(audio_path),
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-shortest",
            str(muxed),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    muxed.replace(source)


@pytest.mark.parametrize(
    "media_kind",
    ["plain", "audio"],
    ids=["nominal", "with-audio"],
)
@pytest.mark.ffmpeg
def test_real_ffmpeg_renders_through_generic_service(
    tmp_path: Path,
    media_kind: str,
) -> None:
    """The service drives the real FFmpeg backend end to end: one video and
    one committed sidecar through the real CommandTransport (no fake
    transport), including the whole-media optimized path when the source
    probe supports it."""
    timeline_path, assets_path = _real_media_inputs(tmp_path)
    if media_kind == "audio":
        _add_audio_track(timeline_path)
    service = _real_service(tmp_path)
    output = tmp_path / "real-ffmpeg.mp4"

    service.render_request(
        replace(
            _request(tmp_path),
            timeline_path=str(timeline_path),
            assets_registry_path=str(assets_path),
        ),
        selector="rendering.ffmpeg",
        out_path=output,
    )

    assert output.is_file()
    assert output.stat().st_size > 0
    sidecars = list(tmp_path.glob("*.provenance.json"))
    assert sidecars == [Path(f"{output}.provenance.json")]
    payload = json.loads(sidecars[0].read_text(encoding="utf-8"))
    assert payload["output"] == str(output.resolve())
    assert payload["engine"] == "rendering.ffmpeg"


def _real_audio_reactive_inputs(tmp_path: Path) -> tuple[Path, Path]:
    """A two-clip timeline the strict FFmpeg backend renders through its
    audio-reactive colour specialization (real AAC audio source)."""
    root = tmp_path / "reactive"
    root.mkdir(exist_ok=True)
    audio_path = root / "tone.wav"
    subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:sample_rate=48000:duration=0.5",
            str(audio_path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    timeline_path = root / "timeline.json"
    assets_path = root / "assets.json"
    timeline_path.write_text(
        json.dumps(
            {
                "theme": "banodoco-default",
                "theme_overrides": {
                    "visual": {"canvas": {"width": 640, "height": 360, "fps": 48}}
                },
                "tracks": [
                    {"id": "colour", "kind": "visual", "label": "Colour"},
                    {"id": "audio", "kind": "audio", "label": "Audio"},
                ],
                "clips": [
                    {
                        "id": "colour_map",
                        "at": 0,
                        "track": "colour",
                        "clipType": "audio-reactive-colour",
                        "hold": 0.5,
                        "params": {
                            "schemaVersion": 1,
                            "initialColor": "#102030",
                            "events": [
                                {"id": "a", "frame": 3, "color": "#D47795"},
                                {"id": "b", "frame": 8, "color": "#26A7D0"},
                                {"id": "c", "frame": 17, "color": "#B59432"},
                            ],
                        },
                    },
                    {
                        "id": "source_audio",
                        "at": 0,
                        "track": "audio",
                        "clipType": "media",
                        "asset": "audio",
                        "from": 0,
                        "to": 0.5,
                    },
                ],
            }
        ),
        encoding="utf-8",
    )
    assets_path.write_text(
        json.dumps(
            {
                "assets": {
                    "audio": {
                        "file": str(audio_path),
                        "type": "audio/wav",
                        "duration": 0.5,
                    }
                }
            }
        ),
        encoding="utf-8",
    )
    return timeline_path, assets_path


@pytest.mark.ffmpeg
def test_real_ffmpeg_audio_reactive_through_generic_service(
    tmp_path: Path,
) -> None:
    """The service drives the real FFmpeg backend through its audio-reactive
    colour specialization end to end (no fake transport)."""
    timeline_path, assets_path = _real_audio_reactive_inputs(tmp_path)
    service = _real_service(tmp_path)
    output = tmp_path / "real-reactive.mp4"

    service.render_request(
        replace(
            _request(tmp_path),
            timeline_path=str(timeline_path),
            assets_registry_path=str(assets_path),
        ),
        selector="rendering.ffmpeg",
        out_path=output,
    )

    assert output.is_file()
    assert output.stat().st_size > 0
    sidecars = list(tmp_path.glob("*.provenance.json"))
    assert sidecars == [Path(f"{output}.provenance.json")]
    payload = json.loads(sidecars[0].read_text(encoding="utf-8"))
    assert payload["engine"] == "rendering.ffmpeg"
    assert payload["audio_ownership"] == "rendered"


# ---------------------------------------------------------------------------
# Layer Stack Batch 2 — track-filtered host slice + alpha metadata stamp.
# _window_timeline slices the host timeline to one z-layer's tracks; the
# layer=None path is unchanged.  _segment_request passes layer.tracks and
# stamps metadata.astrid_layer (alpha = z > 0) into the materialized copy.
# ---------------------------------------------------------------------------


def _layered_timeline(tmp_path: Path) -> Path:
    """Two visual tracks + one audio track, both visuals in window 0..1s.

    v1 and v2 each carry one clip spanning the whole window; ``a1`` exists
    only as a track (no clips), mirroring the existing pruning fixture shape.
    """
    timeline = tmp_path / "layered-timeline.json"
    timeline.write_text(
        json.dumps(
            {
                "tracks": [
                    {"id": "v1", "name": "bottom"},
                    {"id": "v2", "name": "top"},
                    {"id": "a1", "name": "audio"},
                ],
                "clips": [
                    {
                        "id": "c1",
                        "track": "v1",
                        "at": 0.0,
                        "from": 0.0,
                        "to": 10.0,
                    },
                    {
                        "id": "c2",
                        "track": "v2",
                        "at": 0.0,
                        "from": 0.0,
                        "to": 10.0,
                    },
                ],
                "metadata": {"project": "layer-slice", "custom": {"keep": 1}},
            }
        ),
        encoding="utf-8",
    )
    return timeline


def _window(*, start: int = 0, end: int = 10) -> FrameWindow:
    return FrameWindow(start_frame=start, end_frame=end, fps_rational=(10, 1))


def _layered_segment(*, z: int, tracks: tuple[str, ...]) -> RenderSegment:
    return RenderSegment(
        window=_window(),
        renderer=_renderer_resolution("fixture.full"),
        input_hashes={},
        layer=LayerRef(z=z, tracks=tracks),
    )


def test_window_timeline_allowlist_slices_to_layer_tracks(tmp_path: Path) -> None:
    """A segment on layer z=1 owning only v2 must see ONLY track v2 and its
    clips — never v1's material, even though both overlap the window."""
    timeline = json.loads(_layered_timeline(tmp_path).read_text(encoding="utf-8"))

    materialized = RenderService._window_timeline(
        timeline, _window(), tracks=("v2",)
    )

    assert [track["id"] for track in materialized["tracks"]] == ["v2"]
    assert [clip["id"] for clip in materialized["clips"]] == ["c2_0_10"]


def test_window_timeline_without_allowlist_keeps_existing_pruning(
    tmp_path: Path,
) -> None:
    """layer=None segments keep today's behavior byte-for-byte: tracks with
    in-window clips are kept, track-less-in-window a1 is pruned."""
    timeline = json.loads(_layered_timeline(tmp_path).read_text(encoding="utf-8"))

    materialized = RenderService._window_timeline(timeline, _window())

    assert [track["id"] for track in materialized["tracks"]] == ["v1", "v2"]
    assert {clip["id"] for clip in materialized["clips"]} == {"c1_0_10", "c2_0_10"}


def test_window_timeline_allowlist_track_without_window_clips_stays_present(
    tmp_path: Path,
) -> None:
    """An allowlisted track whose clips all fall outside the window must
    survive pruning: the renderer needs to know its layer exists so it can
    emit background/transparent output for the span."""
    timeline = json.loads(_layered_timeline(tmp_path).read_text(encoding="utf-8"))
    timeline["clips"] = [
        {
            "id": "c2-late",
            "track": "v2",
            "at": 5.0,
            "from": 0.0,
            "to": 10.0,
        }
    ]

    materialized = RenderService._window_timeline(
        timeline, _window(), tracks=("v2",)
    )

    assert [track["id"] for track in materialized["tracks"]] == ["v2"]
    assert materialized["clips"] == []


def test_segment_request_stamps_astrid_layer_metadata_merged(
    tmp_path: Path,
) -> None:
    """The materialized timeline's metadata gains astrid_layer (alpha = z > 0)
    merged alongside the timeline's own keys, never clobbering them."""
    timeline_path = _layered_timeline(tmp_path)
    candidate = _candidate(
        tmp_path,
        "fixture.full",
        "renderer",
        capabilities={"supports_full_timeline": True, "supports_windows": False},
    )
    request = replace(_request(tmp_path), timeline_path=str(timeline_path))
    service = _service(tmp_path, FakeTransport())

    adapted, sidecar = service._segment_request(
        request,
        candidate=candidate,
        segment=_layered_segment(z=1, tracks=("v2",)),
        index=0,
        workspace=tmp_path,
    )
    materialized = json.loads(
        (tmp_path / "segment-inputs" / "0000-timeline.json").read_text(
            encoding="utf-8"
        )
    )

    assert sidecar["materialized_timeline"]
    assert adapted.window is None
    assert materialized["metadata"]["astrid_layer"] == {"z": 1, "alpha": True}
    # Existing keys survive the merge; the stamp is additive.
    assert materialized["metadata"]["project"] == "layer-slice"
    assert materialized["metadata"]["custom"] == {"keep": 1}
    assert materialized["metadata"]["source_window_start_seconds"] == 0.0
    assert materialized["metadata"]["source_window_end_seconds"] == 1.0
    assert [track["id"] for track in materialized["tracks"]] == ["v2"]
    assert [clip["id"] for clip in materialized["clips"]] == ["c2_0_10"]


def test_segment_request_z0_stamps_alpha_false(tmp_path: Path) -> None:
    """The bottom layer (z=0) is opaque: alpha must be False, not True."""
    timeline_path = _layered_timeline(tmp_path)
    candidate = _candidate(
        tmp_path,
        "fixture.full",
        "renderer",
        capabilities={"supports_full_timeline": True, "supports_windows": False},
    )
    request = replace(_request(tmp_path), timeline_path=str(timeline_path))
    service = _service(tmp_path, FakeTransport())

    service._segment_request(
        request,
        candidate=candidate,
        segment=_layered_segment(z=0, tracks=("v1",)),
        index=1,
        workspace=tmp_path,
    )
    materialized = json.loads(
        (tmp_path / "segment-inputs" / "0001-timeline.json").read_text(
            encoding="utf-8"
        )
    )

    assert materialized["metadata"]["astrid_layer"] == {"z": 0, "alpha": False}
    assert [track["id"] for track in materialized["tracks"]] == ["v1"]


def test_direct_render_with_pinned_finalizer_records_both_fragments(
    tmp_path: Path,
) -> None:
    """An embedding host pinning `finalizer_id` on a direct render gets the
    renderer artifact lineage AND the executed finalizer fragment."""
    transport = FakeTransport()
    service = _service(
        tmp_path,
        transport,
        renderer_ids=("rendering.remotion",),
        planner_ids=(),
        finalizer_id="rendering.ffmpeg-finalizer",
    )
    output = tmp_path / "direct-finalize.mp4"

    service.render_request(
        replace(_request(tmp_path), backend_config={}),
        selector="rendering.remotion",
        out_path=output,
    )

    payload = _sidecar(output)
    fragments = payload["backend_fragments"]
    assert (
        fragments["rendering.remotion"]["fixture_backend"] == "rendering.remotion"
    )
    assert (
        fragments["rendering.ffmpeg-finalizer"]["fixture_backend"]
        == "rendering.ffmpeg-finalizer"
    )
    assert len(payload["artifact_profiles"]) == 1
    assert payload["finalizer"]["id"] == "rendering.ffmpeg-finalizer"


class RetainedSupportTransport(FakeTransport):
    """Exercise the real transport guard/owned support process from the service."""

    def __init__(self, helper: Path, *, supported: bool = True) -> None:
        super().__init__()
        self.helper = helper
        self.supported = supported
        self.support_workspaces: list[Path] = []

    def run(self, verb, command, *, backend, request_path, result_path, cwd, **kwargs):
        if verb != "support":
            return super().run(verb, command, backend=backend, request_path=request_path,
                               result_path=result_path, cwd=cwd, **kwargs)
        from unittest import mock

        from astrid.core.rendering import transport as transport_module
        from astrid.core.rendering.transport import CommandTransport
        self.support_workspaces.append(Path(request_path).parent)
        # The helper waits until custody captures its ancestry before it exits.
        # popen_owned_process returning signals that capture is complete.
        gate = Path(request_path).parent / "launch.gate"
        launch = transport_module.popen_owned_process

        def gated(*args, **kw):
            process = launch(*args, **kw)
            gate.touch()
            return process

        with mock.patch.object(transport_module, "popen_owned_process", gated):
            return CommandTransport(backend).run(
                verb, [sys.executable, str(self.helper), "1" if self.supported else "0", str(gate)],
                backend=backend, request_path=request_path, result_path=result_path,
                cwd=cwd, timeout=2,
            )


def _retained_support_helper(tmp_path: Path) -> Path:
    helper = tmp_path / "support_backend.py"
    helper.write_text(
        "import sys,json,os,time\nfrom pathlib import Path\n"
        "gate=Path(sys.argv[2]); deadline=time.monotonic()+2\n"
        "while not gate.exists() and time.monotonic()<deadline: time.sleep(0.005)\n"
        "result=Path(sys.argv[sys.argv.index('--result')+1])\n"
        "value={'schema_version':1,'supported':sys.argv[1]=='1',"
        "'reasons':[] if sys.argv[1]=='1' else ['fixture unsupported'],"
        "'features':{'progress':os.environ.get('ASTRID_PROGRESS_PATH','')},"
        "'alternatives':[],'backend':os.environ['ASTRID_RENDER_BACKEND'],"
        "'backend_version':'1.0.0'}\n"
        "result.write_text(json.dumps(value))\n", encoding="utf-8",
    )
    return helper


def test_managed_support_uses_retained_attempt_through_real_transport(tmp_path, monkeypatch):
    attempt = tmp_path / "attempt"; attempt.mkdir()
    progress = attempt / ".astrid-progress.json"
    monkeypatch.setenv("ASTRID_INTERNAL_INVOCATION", "1")
    monkeypatch.setenv("ASTRID_PROGRESS_PATH", str(progress))
    transport = RetainedSupportTransport(_retained_support_helper(tmp_path))
    service = _service(tmp_path, transport)
    output = attempt / "outputs" / "video.mp4"
    service.render_request(_request(attempt), selector="rendering.remotion", out_path=output)
    assert output.is_file()
    assert transport.support_workspaces
    assert all(p.parent == attempt and not p.exists() for p in transport.support_workspaces)
    report = service._support_reports["rendering.remotion"]
    assert report.features["progress"] == str(progress)
    assert not list(attempt.glob("astrid-render-support-*"))


@pytest.mark.parametrize("mismatch", ["foreign", "wrong_name", "relative", "missing", "symlink"])
def test_managed_support_keeps_foreign_progress_transport_rejection(tmp_path, monkeypatch, mismatch):
    attempt = tmp_path / "attempt"; attempt.mkdir()
    foreign = tmp_path / "foreign"; foreign.mkdir()
    progress = attempt / ".astrid-progress.json"
    if mismatch == "foreign": progress = foreign / progress.name
    elif mismatch == "wrong_name": progress = attempt / "other.json"
    elif mismatch == "relative": progress = Path(".astrid-progress.json")
    elif mismatch == "missing": progress = tmp_path / "missing" / progress.name
    else:
        alias = tmp_path / "alias"; alias.symlink_to(attempt, target_is_directory=True)
        progress = alias / progress.name
    monkeypatch.setenv("ASTRID_INTERNAL_INVOCATION", "1")
    monkeypatch.setenv("ASTRID_PROGRESS_PATH", str(progress))
    transport = RetainedSupportTransport(_retained_support_helper(tmp_path))
    output = attempt / "outputs" / "video.mp4"
    with pytest.raises(RendererProtocolError, match="retained attempt"):
        _service(tmp_path, transport).render_request(_request(attempt), selector="rendering.remotion", out_path=output)
    assert not output.exists()
    assert not output.exists()
    assert not Path(str(output) + ".provenance.json").exists()
    assert all(not p.exists() for p in transport.support_workspaces)
    assert not list(attempt.glob("astrid-render-support-*"))


@pytest.mark.parametrize("internal", [None, "0"])
def test_standalone_support_keeps_os_temporary_admission(tmp_path, monkeypatch, internal):
    monkeypatch.setenv("ASTRID_PROGRESS_PATH", str(tmp_path / ".astrid-progress.json"))
    if internal is None: monkeypatch.delenv("ASTRID_INTERNAL_INVOCATION", raising=False)
    else: monkeypatch.setenv("ASTRID_INTERNAL_INVOCATION", internal)
    transport = RetainedSupportTransport(_retained_support_helper(tmp_path))
    output = tmp_path / "outputs" / "video.mp4"
    _service(tmp_path, transport).render_request(_request(tmp_path), selector="rendering.remotion", out_path=output)
    assert output.is_file()
    assert all(p.parent != tmp_path and not p.exists() for p in transport.support_workspaces)
    assert transport.support_workspaces


def test_direct_layout_cannot_gain_managed_support_authority(tmp_path, monkeypatch):
    monkeypatch.setenv("ASTRID_INTERNAL_INVOCATION", "1")
    monkeypatch.setenv("ASTRID_PROGRESS_PATH", str(tmp_path / ".astrid-progress.json"))
    transport = RetainedSupportTransport(_retained_support_helper(tmp_path))
    output = tmp_path / "video.mp4"
    with pytest.raises(RendererProtocolError, match="retained attempt"):
        _service(tmp_path, transport).render_request(_request(tmp_path), selector="rendering.remotion", out_path=output)
    assert not output.exists()
    assert all(p.parent != tmp_path and not p.exists() for p in transport.support_workspaces)


def test_managed_unsupported_support_cleans_without_output_mutation(tmp_path, monkeypatch):
    attempt = tmp_path / "attempt"; attempt.mkdir()
    monkeypatch.setenv("ASTRID_INTERNAL_INVOCATION", "1")
    monkeypatch.setenv("ASTRID_PROGRESS_PATH", str(attempt / ".astrid-progress.json"))
    transport = RetainedSupportTransport(_retained_support_helper(tmp_path), supported=False)
    output = attempt / "outputs" / "video.mp4"
    with pytest.raises(RendererUnsupportedError):
        _service(tmp_path, transport).render_request(_request(attempt), selector="rendering.remotion", out_path=output)
    assert not output.exists()
    assert not Path(str(output) + ".provenance.json").exists()
    assert all(p.parent == attempt and not p.exists() for p in transport.support_workspaces)
    assert not list(attempt.glob("astrid-render-support-*"))


def test_managed_support_failure_cleans_attempt_and_commits_nothing(tmp_path, monkeypatch):
    attempt = tmp_path / "attempt"; attempt.mkdir()
    monkeypatch.setenv("ASTRID_INTERNAL_INVOCATION", "1")
    monkeypatch.setenv("ASTRID_PROGRESS_PATH", str(attempt / ".astrid-progress.json"))
    class FailedSupport(FakeTransport):
        workspace = None
        def run(self, verb, command, *, request_path, **kwargs):
            if verb == "support": self.workspace = Path(request_path).parent
            return super().run(verb, command, request_path=request_path, **kwargs)
    transport = FailedSupport(); transport.fail_support = "rendering.remotion"
    output = attempt / "outputs" / "video.mp4"
    with pytest.raises(RendererInternalError):
        _service(tmp_path, transport).render_request(_request(attempt), selector="rendering.remotion", out_path=output)
    assert transport.workspace.parent == attempt
    assert not transport.workspace.exists()
    assert not output.exists()
    assert not Path(str(output) + ".provenance.json").exists()
    assert not list(attempt.glob("astrid-render-support-*"))
    assert not list(attempt.glob(".*.render-service-*"))


def _plan(
    renderer: str,
    *,
    segment_frames: tuple[int, ...] = (10,),
) -> RenderPlan:
    cursor = 0
    segments: list[RenderSegment] = []
    for duration in segment_frames:
        segments.append(
            RenderSegment(
                window=FrameWindow(
                    start_frame=cursor,
                    end_frame=cursor + duration,
                    fps_rational=(10, 1),
                ),
                renderer=_renderer_resolution(renderer),
                input_hashes={},
            )
        )
        cursor += duration
    return RenderPlan(
        schema_version=SCHEMA_VERSION,
        request_digest="0" * 64,
        requested_policy="hybrid",
        planner=_planner_resolution(),
        segments=segments,
        finalizer=_finalizer_resolution(),
        profile=_profile(),
        total_frames=cursor,
        reasons={str(index): "fixture" for index in range(len(segments))},
    )


class _TimelineCaptureTransport(FakeTransport):
    """Records the timeline JSON a full-timeline renderer actually receives."""

    def __init__(self) -> None:
        super().__init__()
        self.received_timelines: list[dict[str, Any]] = []

    def run(
        self,
        verb: str,
        command: Any,
        *,
        backend: str,
        request_path: Path,
        result_path: Path,
        cwd: Path,
        **kwargs: Any,
    ) -> Any:
        if verb == "render":
            payload = json.loads(Path(request_path).read_text(encoding="utf-8"))
            timeline_path = payload.get("timeline_path")
            if timeline_path:
                self.received_timelines.append(
                    json.loads(Path(timeline_path).read_text(encoding="utf-8"))
                )
        return super().run(
            verb,
            command,
            backend=backend,
            request_path=request_path,
            result_path=result_path,
            cwd=cwd,
            **kwargs,
        )
