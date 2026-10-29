"""Render-free contract checks for the V3 timeline visualization dispatcher."""

from __future__ import annotations

import pytest

from astrid.packs.rendering.actions.timeline_visualize import filmstrip_execution, run


@pytest.mark.parametrize(
    ("view", "extra"),
    (
        ("filmstrip", []),
        ("contact", ["--cuts", "1,3"]),
    ("motion", ["--cut", "2", "--layer", "sync,curves", "--preview"]),
        ("diff", [
            "--timeline-slug", "main", "--before-revision-id", "before",
            "--after-revision-id", "after", "--revision-diff", "{}",
        ]),
    ),
)
def test_canonical_run_forwards_each_supported_view_without_render(
    monkeypatch, tmp_path, view, extra
):
    calls = []

    def fake_execute_filmstrip(args, *, authority=None):
        calls.append((vars(args).copy(), authority))
        return {"returncode": 0, "view": args.view}

    monkeypatch.setattr(filmstrip_execution, "execute_filmstrip", fake_execute_filmstrip)
    monkeypatch.setattr(run, "_execution_authority_context", lambda: None)

    result = run.execute(
        [
            "--out",
            str(tmp_path / view),
            "--project-slug",
            "demo",
            "--view",
            view,
            *extra,
        ]
    )

    assert result == {"returncode": 0, "view": view}
    assert len(calls) == 1
    args, authority = calls[0]
    assert authority is None
    assert args["view"] == view
    assert args["project_slug"] == "demo"


def test_input_only_rejects_rendered_view_selection(monkeypatch, tmp_path):
    monkeypatch.delenv(run._AUTHORITY_CONTEXT_ENV, raising=False)
    args = run.build_parser().parse_args(
        [
            "--out",
            str(tmp_path),
            "--project-slug",
            "demo",
            "--view",
            "contact",
        ]
    )

    with pytest.raises(ValueError, match="input-only mode supports only view=filmstrip"):
        filmstrip_execution.execute_input_only(args, {})


def test_diff_is_a_host_compiled_v3_action_view():
    args = run.build_parser().parse_args(
        [
            "--out", "/tmp/unused", "--project-slug", "demo", "--view", "diff",
            "--timeline-slug", "main", "--before-revision-id", "before",
            "--after-revision-id", "after", "--revision-diff", "{}",
        ]
    )
    assert args.view == "diff"
    assert args.before_revision_id == "before"
    assert args.after_revision_id == "after"
