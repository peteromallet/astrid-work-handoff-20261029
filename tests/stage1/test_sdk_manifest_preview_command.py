"""Regression coverage for the manifest-only SDK dry-run command preview."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from astrid.core.contracts.schema import Port
from astrid.core.execution.executor.registry import load_default_registry
from astrid.core.execution.executor.runner import ExecutorRunRequest, build_executor_command
from astrid.sdk import get_capability
from astrid.sdk.invocation import _manifest_dry_run_result, _manifest_preview_command
from astrid.sdk.results import InvocationResult


def _capability(*, command: dict | None, inputs: tuple[Port, ...], metadata: dict | None = None):
    return SimpleNamespace(
        capability_type="executor",
        id="test.executor",
        native_kind="built_in",
        inputs=inputs,
        outputs=(),
        definition={"command": command, "metadata": metadata or {}},
    )


def test_preview_uses_input_arg_alias_and_out_placeholder() -> None:
    capability = _capability(
        command={
            "argv": ["python", "-m", "render", "--out", "{out}"],
            "input_args": [
                {
                    "input": "assets_registry",
                    "flag": "--assets",
                    "optional": True,
                    "before": "--out",
                }
            ],
        },
        inputs=(Port("assets_registry", type="file", required=False),),
    )

    command = _manifest_preview_command(
        capability,
        inputs={"assets_registry": "assets.json"},
        outputs=None,
        brief=None,
        python_exec=None,
        out="/tmp/preview",
    )

    assert command == [
        "python",
        "-m",
        "render",
        "--assets",
        "assets.json",
        "--out",
        "/tmp/preview",
    ]

def test_preview_repeats_repeatable_input_args() -> None:
    capability = _capability(
        command={
            "argv": ["python", "-m", "visualize"],
            "input_args": [
                {"input": "formats", "flag": "--format", "repeatable": True}
            ],
        },
        inputs=(Port("formats", type="string", required=False),),
    )

    command = _manifest_preview_command(
        capability,
        inputs={"formats": ["png", "svg"]},
        outputs=None,
        brief=None,
        python_exec=None,
        out=None,
    )

    assert command == ["python", "-m", "visualize", "--format", "png", "--format", "svg"]


def test_preview_canonicalizes_set_inputs_and_result_is_json_safe() -> None:
    capability = _capability(
        command={
            "argv": ["python", "-m", "visualize"],
            "input_args": [
                {"input": "timeline_source", "flag": "--timeline-source", "repeatable": True},
                {"input": "formats", "flag": "--format", "repeatable": True},
            ],
        },
        inputs=(
            Port("timeline_source", type="path", required=False),
            Port("formats", type="string", required=False),
        ),
    )
    inputs = {
        "timeline_source": {"timelines/z.jsonl", "timelines/a.jsonl"},
        "formats": {"svg", "png", "md"},
    }

    command = _manifest_preview_command(
        capability,
        inputs=inputs,
        outputs=None,
        brief=None,
        python_exec=None,
        out=None,
    )
    assert command == [
        "python",
        "-m",
        "visualize",
        "--timeline-source",
        "timelines/a.jsonl",
        "--timeline-source",
        "timelines/z.jsonl",
        "--format",
        "md",
        "--format",
        "png",
        "--format",
        "svg",
    ]

    raw_result, ok = _manifest_dry_run_result(
        capability,
        inputs=inputs,
        outputs={"selected": {"svg", "png"}},
        brief=None,
        python_exec=None,
    )
    assert ok is True
    result = InvocationResult(
        capability_id=capability.id,
        capability_type="executor",
        native_kind=capability.native_kind,
        ok=ok,
        raw_result=raw_result,
    )
    payload = result.to_dict()
    assert payload["raw_result"]["payload"]["preview"]["inputs"]["formats"] == [
        "md",
        "png",
        "svg",
    ]
    assert payload["raw_result"]["payload"]["preview"]["inputs"]["timeline_source"] == [
        "timelines/a.jsonl",
        "timelines/z.jsonl",
    ]
    assert payload["raw_result"]["payload"]["preview"]["outputs"]["selected"] == [
        "png",
        "svg",
    ]
    json.dumps(payload)


def test_preview_store_true_boolean_omits_false_and_value() -> None:
    capability = _capability(
        command={
            "argv": ["python", "-m", "render"],
            "input_args": [
                {"input": "denoise", "flag": "--denoise", "optional": True}
            ],
        },
        inputs=(Port("denoise", type="boolean", required=False),),
    )

    false_command = _manifest_preview_command(
        capability,
        inputs={"denoise": False},
        outputs=None,
        brief=None,
        python_exec=None,
        out=None,
    )
    true_command = _manifest_preview_command(
        capability,
        inputs={"denoise": True},
        outputs=None,
        brief=None,
        python_exec=None,
        out=None,
    )

    assert false_command == ["python", "-m", "render"]
    assert true_command == ["python", "-m", "render", "--denoise"]


def test_preview_honors_host_consumed_auto_forward_skip() -> None:
    capability = _capability(
        command={"argv": ["python", "-m", "render"]},
        inputs=(Port("frames", type="integer", required=False),),
        metadata={"auto_forward_skip": ["frames"]},
    )

    command = _manifest_preview_command(
        capability,
        inputs={"frames": 9},
        outputs=None,
        brief=None,
        python_exec=None,
        out=None,
    )

    assert command == ["python", "-m", "render"]


def test_pipeline_preview_forwards_declared_inputs_defaults_and_out() -> None:
    capability = _capability(
        command=None,
        metadata={"runtime_module": "astrid.packs.example.run"},
        inputs=(
            Port("brief", type="file", required=True),
            Port("target_duration", type="number", required=False, default=12),
            Port("denoise", type="boolean", required=False, default=False),
        ),
    )

    raw_result, ok = _manifest_dry_run_result(
        capability,
        inputs={"brief": "brief.md"},
        outputs=None,
        brief=None,
        python_exec="python3",
        out="/tmp/pipeline-preview",
    )

    assert ok is True
    assert raw_result["command"] == [
        "python3",
        "-m",
        "astrid.packs.example.run",
        "--brief",
        "brief.md",
        "--target-duration",
        "12",
        "--out",
        "/tmp/pipeline-preview",
    ]


@pytest.mark.parametrize("brief_name, with_out", [("story.md", True), ("brief.md", True), ("story.md", False)])
def test_preview_reserved_brief_values_match_canonical_builder_without_writes(tmp_path, brief_name, with_out):
    from astrid.core.execution.executor.runner import _default_brief_slug

    output = tmp_path / "result"
    brief = tmp_path / brief_name
    capability = _capability(
        command={"argv": ["python", "--brief", "{brief}", "--out", "{brief_out}",
                          "--copy", "{brief_copy}", "--slug", "{brief_slug}"]},
        inputs=(Port("brief", type="file", required=True),),
    )
    command = _manifest_preview_command(capability, inputs={"brief": str(brief)}, outputs=None,
        brief=brief, python_exec=None, out=output if with_out else None)
    out_value = output if with_out else Path("<runtime staging dir>")
    slug = _default_brief_slug(brief.resolve(), out_value)
    expected = out_value / "briefs" / slug
    assert command == ["python", "--brief", str(brief), "--out", str(expected),
                       "--copy", str(expected / "brief.txt"), "--slug", slug]
    if with_out:
        from astrid.core.execution.executor.runner import _placeholder_values

        request = ExecutorRunRequest(executor_id="test.executor", out=output,
            brief=brief, python_exec="python", inputs={"brief": str(brief)})
        definition = SimpleNamespace(id="test.executor", inputs=capability.inputs, outputs=(), metadata={})
        canonical = _placeholder_values(definition, request, {"brief": str(brief)})
        assert command[command.index("--out") + 1] == canonical["brief_out"]
        assert command[command.index("--copy") + 1] == canonical["brief_copy"]
        assert command[command.index("--slug") + 1] == canonical["brief_slug"]
    assert not output.exists() and not brief.exists()


def test_preview_reserved_brief_values_still_refuse_missing_brief():
    from astrid.sdk.exceptions import CapabilityValidationError

    capability = _capability(command={"argv": ["python", "--out", "{brief_out}"]}, inputs=())
    with pytest.raises(CapabilityValidationError, match="brief_out"):
        _manifest_preview_command(capability, inputs={}, outputs=None, brief=None, python_exec=None)
