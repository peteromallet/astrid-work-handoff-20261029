"""Smoke tests: event_talks stubs and data loading."""

import argparse
import ast
from pathlib import Path

import pytest

from astrid.packs.video_editing.actions.event_talks.run import (
    ADOS_SUNDAY_SPEAKERS,
    _exec_render_manifest,
)


def test_ados_sunday_speakers_loads():
    assert isinstance(ADOS_SUNDAY_SPEAKERS, list)
    assert len(ADOS_SUNDAY_SPEAKERS) > 0
    first = ADOS_SUNDAY_SPEAKERS[0]
    assert "speaker" in first
    assert "title" in first


def test_render_manifest_raises():
    args = argparse.Namespace()
    with pytest.raises(NotImplementedError, match="event_talks.render_manifest"):
        _exec_render_manifest(args)


def test_workflow_default_run_root_uses_platform_temp_directory():
    workflow_path = (
        Path(__file__).resolve().parents[3]
        / "astrid/packs/video_editing/actions/event_talks/workflow.py"
    )
    tree = ast.parse(workflow_path.read_text(encoding="utf-8"))
    build_workflow = next(
        node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "build_workflow"
    )
    run_root_index = [arg.arg for arg in build_workflow.args.kwonlyargs].index("run_root")
    assert isinstance(build_workflow.args.kw_defaults[run_root_index], ast.Constant)
    assert build_workflow.args.kw_defaults[run_root_index].value is None
    assert "tempfile.gettempdir" in ast.unparse(build_workflow)
