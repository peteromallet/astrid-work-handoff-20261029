# Editing conformance

One scenario (YAML) is applied through three front-ends: the `timelines` CLI, a cut sheet
(export, substitute, `timelines apply`), and a Python snippet (`Checkout.draft(P, t)`, then one save).
Each front-end runs on its own fresh copy of a fixture. The runner proves the documents agree,
the undo steps are right, undo/redo restore exactly, and no op is a silent no-op.

Run: `python -m pytest tests/editing_conformance` (scenarios: `tests/editing_scenarios/**/*.yaml`).

## Scenario format v1

```yaml
id: look.set.rocket-x        # <area>.<op>.<case>; area: timing|structure|look|audio|code; file is <id>.yaml
source: h2 L2                # audit row (AUDIT.md, h1-h4), or "new"
intent: Move the rocket to x=120 (canvas px).
fixture: tiny                # see "Fixtures" below
tool: timeline.opacity       # optional: the registered tool this scenario tests (stored, not used yet)
expect: change               # change | no-change | refused
idempotent: true            # optional, only with expect: change: a second run must be a no-change (see Checks)
cli: edit --clip c1.rocket --set x=120   # one command, or a list; the runner inserts "t --project P" after the verb
sheet:                       # optional: export a sheet, substitute, apply with `timelines apply`
  cuts: [c1]                 # optional: only these cuts; default the whole sheet
  replace:                   # each `old` must occur EXACTLY ONCE in the exported sheet, else ScenarioError
    - ["x=60", "x=120"]
python: |                    # optional: runs with tl = Checkout.draft("P", "t"); the runner then saves once
  tl.clip("c1.rocket").set(x=120)
check:                       # optional: Python expressions; tl is a fresh draft after the edit; each truthy
  - tl.clip("c1.rocket").get("x") == 120
```

- At least one path must be declared, and each declared path must be runnable. Unknown keys, including `missing` and `xfail`, are a `ScenarioError` at the scenario level and inside the sheet mapping. CLI paths accept command strings or lists of them; Python paths accept a snippet string. Both reject mapping-shaped gap declarations.

## Fixtures

`fixture: NAME` resolves to `tests/editing_scenarios/fixtures/NAME.json` if it exists, else
`tests/fixtures/timeline_editing/NAME.json`. Neither present is a `ScenarioError`.

## Checks

Each declared path is checked against these names:

- `runs`: the path ran (every CLI/sheet command exits 0, Python raises nothing). For `refused` it must refuse. For `no-change`, exit 3 (no change) also counts as ran.
- `changes`: the document differs from the base (`change`), equals it (`no-change`, `refused`).
- `reports`: stdout contains "no change" if and only if the document did not change (CLI and sheet only; not for `refused`).
- `equal`: the document equals the reference path's (`change` only).
- `steps`: new undo steps equal the commands (CLI), 1 (sheet, Python), and 0 for `no-change` and `refused`.
- `undo`: undoing the measured steps restores the base exactly (only when steps >= 1).
- `redo`: redoing them restores the after-document exactly (only when steps >= 1).
- `check`: every `check:` expression is truthy.
- `idempotent`: only for `idempotent: true` scenarios. After a path's first run (before undo/redo) it runs again
  on the same working copy; this check fails if that second run changed the document, made an undo step,
  or (cli/sheet) did not say "no change". Its steps are taken back, so undo/redo still test the first run.

## Reference path

`equal` compares against the reference: `python` if present, else `cli`, else `sheet`. The reference
itself is not checked against itself.

## Files

- `runner.py`: `load_scenario`, `parse_scenario`, `run_case(scenario, via)` (alias `run_path`), `run_scenario`, `evaluate`.
- `test_conformance.py`: one test per (scenario, path).
- `test_runner_selftest.py`: proves the harness catches each class of bug.
