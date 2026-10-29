"""Entry point for the platform-owned Windows handle-list launch."""
import sys
from pathlib import Path

# This file belongs to the selected Runtime installation; the separate Worker
# venv need not install Runtime. Remove this path before entering Worker code.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from runtime_protocol.windows_handoff import run_worker
sys.path.pop(0)

if __name__ == "__main__":
    run_worker()
