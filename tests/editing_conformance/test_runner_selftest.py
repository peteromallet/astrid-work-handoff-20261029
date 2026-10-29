"""Proves the harness catches each class of bug. These scenarios are written in the test, not in tests/editing_scenarios."""

from __future__ import annotations

import copy

import pytest
import yaml

from tests.editing_conformance.runner import (
    ScenarioError,
    evaluate,
    load_scenario,
    parse_scenario,
    run_case,
    run_scenario,
)

ROCKET = {
    "id": "look.set.rocket-x",
    "source": "new",
    "intent": "Move the rocket to x=120 (canvas px).",
    "fixture": "tiny",
    "expect": "change",
    "cli": "edit --clip c1.rocket --set x=120",
    "sheet": {"cuts": ["c1"], "replace": [["x=60", "x=120"]]},
    "python": 'tl.clip("c1.rocket").set(x=120)',
    "check": ['tl.clip("c1.rocket").get("x") == 120'],
}


def _scenario(**overrides):
    data = copy.deepcopy(ROCKET)
    for key, value in overrides.items():
        if value is None:
            data.pop(key, None)
        else:
            data[key] = value
    return parse_scenario(data)


def _failures(scenario):
    return evaluate(scenario, run_scenario(scenario))


def test_clean_scenario_has_no_failures_on_all_three_paths():
    scenario = _scenario()
    assert scenario.present() == ["cli", "sheet", "python"]
    assert _failures(scenario) == {}


def test_python_setting_a_different_value_is_caught_as_a_mismatch():
    scenario = _scenario(python='tl.clip("c1.rocket").set(x=90)', check=None)
    failures = _failures(scenario)
    assert ("cli", "equal") in failures and ("sheet", "equal") in failures
    assert "-" in failures[("cli", "equal")] and "x" in failures[("cli", "equal")]
    assert not [k for k in failures if k[0] == "python"]


def test_silent_no_op_is_caught():
    scenario = _scenario(python='tl.clip("c1.rocket")', check=None)
    assert ("python", "changes") in _failures(scenario)


def test_undo_granularity_two_python_edits_in_one_save_is_caught():
    scenario = _scenario(
        python='tl.clip("c1.rocket").set(x=90)\ntl.clip("c1.rocket").set(x=120)', check=None)
    failures = _failures(scenario)
    assert ("python", "steps") not in failures  # one save is one undo step (AUDIT bug 10, fixed)
    assert ("python", "undo") not in failures  # undoing that one step restores the base


def test_refusal_parity_on_an_unknown_key():
    scenario = _scenario(
        expect="refused",
        cli="edit --clip c1.rocket --set zzbogus=2",
        sheet={"cuts": ["c1"], "replace": [["x=60", "x=60 zzbogus=2"]]},
        python='tl.clip("c1.rocket").set(zzbogus=2)',
        check=None,
    )
    assert _failures(scenario) == {}


def test_a_replace_that_is_not_in_the_sheet_is_a_scenario_error():
    scenario = _scenario(sheet={"cuts": ["c1"], "replace": [["no-such-text", "x"]]})
    with pytest.raises(ScenarioError, match="exactly once"):
        run_scenario(scenario)


@pytest.mark.parametrize(("declaration", "value"), [
    ("missing", "known gap"),
    ("xfail", "known gap"),
    ("xfail", [{"path": "python", "check": "steps", "reason": "known gap"}]),
])
def test_missing_and_xfail_declarations_are_scenario_errors(declaration, value):
    data = copy.deepcopy(ROCKET)
    data[declaration] = value
    with pytest.raises(ScenarioError, match="unknown key"):
        parse_scenario(data)


@pytest.mark.parametrize(("path", "declaration"), [
    ("cli", "missing"), ("cli", "xfail"),
    ("sheet", "missing"), ("sheet", "xfail"),
    ("python", "missing"), ("python", "xfail"),
])
def test_missing_and_xfail_path_declarations_are_scenario_errors(path, declaration):
    data = copy.deepcopy(ROCKET)
    # Sheets have a strict key set; CLI commands and Python snippets also reject
    # mapping-shaped gap declarations.
    data[path] = {declaration: "known gap"}
    with pytest.raises(ScenarioError):
        parse_scenario(data)


@pytest.mark.parametrize("overrides", [
    {"expect": "maybe"},
    {"colour": "red"},
    {"id": "look-set-rocket"},
    {"cli": None, "sheet": None, "python": None},
])
def test_other_malformed_scenarios_are_scenario_errors(overrides):
    with pytest.raises(ScenarioError):
        _scenario(**overrides)


def test_yaml_text_round_trips_through_the_loader(tmp_path):
    text = yaml.safe_dump(ROCKET, sort_keys=False)
    path = tmp_path / "look.set.rocket-x.yaml"
    path.write_text(text, encoding="utf-8")
    assert load_scenario(path).paths["sheet"].replace == (("x=60", "x=120"),)
    (tmp_path / "other.yaml").write_text(text, encoding="utf-8")
    with pytest.raises(ScenarioError, match="must match the file name"):
        load_scenario(tmp_path / "other.yaml")


def test_exit_code_3_is_a_run_for_no_change_but_a_refusal_for_change():
    from tests.editing_conformance.runner import PathResult, _refused

    def result(codes):
        return PathResult(name="cli", exit_codes=codes, stdout="no change", stderr="", error=None,
                          base="b", after="b", undone="b", redone="b", new_steps=0,
                          undo_error=None, redo_error=None, checks={})

    scenario = _scenario(expect="no-change", check=None)
    failures = evaluate(scenario, {"cli": result([3])})
    assert not [k for k in failures if k == ("cli", "runs")]
    assert not _refused(result([3]), "no-change")
    assert _refused(result([3]), "change")  # for change, only 0 is a run


def test_tool_key_is_stored_and_validated():
    assert _scenario().tool is None
    assert _scenario(tool="timeline.opacity").tool == "timeline.opacity"
    with pytest.raises(ScenarioError, match="'tool'"):
        _scenario(tool="  ")


def test_fixture_lookup_names_both_places_when_missing():
    with pytest.raises(ScenarioError, match="editing_scenarios/fixtures"):
        _scenario(fixture="no-such-fixture")


def test_run_case_rejects_an_unknown_front_end():
    with pytest.raises(ScenarioError, match="via must be"):
        run_case(_scenario(), "gui")


def test_idempotent_scenario_passes_when_the_second_run_is_a_no_change():
    scenario = _scenario(idempotent=True)
    results = run_scenario(scenario)
    assert _failures(scenario) == {}
    for name, r in results.items():
        assert r.second_changed is False and r.second_steps == 0, name
        if name != "python":
            assert "no change" in r.second_stdout, name


def test_idempotent_nudge_is_caught_on_the_second_run():
    scenario = _scenario(idempotent=True, python='tl.clip("c1.rocket").nudge(frames=1)', check=None)
    results = run_scenario(scenario)
    failures = evaluate(scenario, results)
    assert ("python", "idempotent") in failures
    assert "changed the document" in failures[("python", "idempotent")]
    assert results["python"].new_steps == 1  # the first run's step is still the one the undo/redo checks see
    assert ("python", "undo") not in failures and ("python", "redo") not in failures


def test_idempotent_is_only_for_expect_change():
    with pytest.raises(ScenarioError, match="idempotent applies only to expect: change"):
        _scenario(expect="no-change", idempotent=True, check=None)


def test_idempotent_must_be_a_bool():
    with pytest.raises(ScenarioError, match="true or false"):
        _scenario(idempotent="yes")
