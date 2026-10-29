"""Install the Runtime and its Python client pinned by runtime.lock.json into this interpreter.

Mirrors the installer (astrid/installer/backend.py): Runtime, then its packages/python client,
both with --no-deps (the Runtime declares no dependencies; the agent's own lock supplies the rest).
Run with the interpreter that should receive them.
"""
import json
import pathlib
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parent.parent
sha = json.loads((root / "runtime.lock.json").read_text())["source_commit"]
archive = f"https://github.com/banodoco/astrid-runtime/archive/{sha}.tar.gz"
subprocess.run(
    [sys.executable, "-m", "pip", "install", "--disable-pip-version-check", "--no-input", "--no-deps",
     f"astrid-runtime @ {archive}",
     f"astrid-runtime-client @ {archive}#subdirectory=packages/python"],
    check=True,
)
