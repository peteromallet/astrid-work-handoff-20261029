"""Remotion evaluates remotion.config.ts as bundled CommonJS, where ``import.meta`` is empty.

F1 (the first real Mac run) died at render_1 because shared-browser.mjs called
``fileURLToPath(import.meta.url)`` unconditionally at module top level, so the config threw before any
render started. This test loads the real config the way Remotion's loader does (esbuild, cjs, packages
external, eval from the Remotion root) with a recording stand-in for ``@remotion/cli/config``.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

REMOTION = Path(__file__).resolve().parents[3] / "remotion"
NODE = shutil.which("node")
ESBUILD = REMOTION / "node_modules" / "esbuild" / "lib" / "main.js"

_LOAD_CONFIG = r"""
const esbuild = require(process.argv[1]);
const [, , , root] = process.argv;
const calls = [];
const Config = new Proxy({}, {get: (_, name) => (...args) => { calls.push(String(name)); }});
esbuild.build({entryPoints: [root + '/remotion.config.ts'], bundle: true, platform: 'node', target: 'node16',
               absWorkingDir: root, outfile: 'bundle.js', write: false, packages: 'external', logLevel: 'silent',
               tsconfig: root + '/tsconfig.json'})
  .then((result) => {
    process.chdir(root);
    const stubRequire = (name) => (name === '@remotion/cli/config' ? {Config} : require(name));
    new Function('require', 'process', result.outputFiles[0].text)(stubRequire, process);
    process.stdout.write(JSON.stringify({calls}));
  });
"""


@pytest.mark.remotion
def test_remotion_config_loads_the_way_remotions_cjs_loader_evaluates_it() -> None:
    done = subprocess.run([NODE, "-e", _LOAD_CONFIG, str(ESBUILD), "-", str(REMOTION)],
                          capture_output=True, text=True, timeout=120)
    assert done.returncode == 0, done.stderr[-2000:]
    assert "setVideoImageFormat" in json.loads(done.stdout)["calls"]
