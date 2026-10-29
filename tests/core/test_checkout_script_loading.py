"""Astrid's checkout scripts load by file, so another pack's top-level ``scripts`` package can't shadow them."""
import os
import subprocess
import sys

from astrid.core.foundation.paths import REPO_ROOT, load_checkout_script


def test_loads_the_checkout_generator_by_file():
    module = load_checkout_script("gen_effect_registry")
    assert module is not None and module.__file__ == str(REPO_ROOT / "scripts" / "gen_effect_registry.py")
    assert load_checkout_script("gen_effect_registry") is module
    assert load_checkout_script("no_such_script_here") is None


def test_a_foreign_top_level_scripts_package_first_on_the_path_does_not_shadow_it(tmp_path):
    # The Hivemind pack root (first on its worker PYTHONPATH) ships scripts/__init__.py.
    foreign = tmp_path / "pack" / "scripts"
    foreign.mkdir(parents=True)
    (foreign / "__init__.py").write_text("")
    code = ("import sys; sys.path.insert(0, sys.argv[1]); import scripts; "
            "from astrid.core.foundation.paths import load_checkout_script; "
            "m = load_checkout_script('gen_effect_registry'); "
            "assert scripts.__file__.startswith(sys.argv[1]); print(m.__file__)")
    # Import astrid from the checkout under test, whichever environment runs the suite.
    env = {**os.environ, "PYTHONPATH": os.pathsep.join(filter(None, [str(REPO_ROOT), os.environ.get("PYTHONPATH")]))}
    out = subprocess.run([sys.executable, "-c", code, str(tmp_path / "pack")], cwd=tmp_path, env=env,
                         capture_output=True, text=True, check=True).stdout.strip()
    assert out == str(REPO_ROOT / "scripts" / "gen_effect_registry.py")
