Blocking lint/type baselines for the `make ruff` / `make mypy` gates (run by `.github/workflows/ci.yml` and `make check`).

Baseline policy:
- `ruff_astrid.json` and `mypy_astrid.json` record the accepted finding counts for the whole tree (Ruff: `pyproject.toml` `[tool.ruff]`; mypy: `astrid` and `scripts/reshape`).
- The gate is exact, like `structure_astrid.json` (`compare_structure_baseline.py`). A higher count fails as a regression. A lower count also fails until the baseline is rewritten, so deleted code cannot leave slack for a later regression to fill.
- The shared comparison is `scripts/reshape/count_baseline.py`. `import_cycles.json` is checked by `scripts/reshape/import_cycles.py`.
- The baselines can only shrink: commit the lower number in the same change that removed the findings.

Regeneration commands (after fixing or deleting code):

```bash
python -m scripts.reshape.compare_ruff_baseline --write-baseline
python -m scripts.reshape.compare_mypy_baseline --write-baseline
python -m scripts.reshape.compare_structure_baseline --write-baseline
```
