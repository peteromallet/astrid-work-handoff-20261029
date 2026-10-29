"""Keep replace publications explicit and raw rename sites audited."""

from pathlib import Path
import re


ROOT = Path(__file__).parents[1]


def test_raw_os_rename_call_sites_remain_reviewed_fail_if_present_moves():
    allowed = {
        "runtime_protocol/backup.py",       # fresh destination, checked absent before publish
        "runtime_protocol/daemon.py",       # sibling directory swaps whose destinations are absent
        "runtime_protocol/store.py",        # fresh realm root publication
        "astrid_runtime/workspace_adopt.py",  # fresh adoption destination
    }
    found = set()
    for package in (ROOT / "runtime_protocol", ROOT / "astrid_runtime"):
        for path in package.glob("*.py"):
            if re.search(r"\bos\.rename\s*\(", path.read_text(encoding="utf-8")):
                found.add(path.relative_to(ROOT).as_posix())
    assert found == allowed


def test_descriptor_atomic_writers_use_explicit_replace():
    source = (ROOT / "runtime_protocol" / "dirfd.py").read_text(encoding="utf-8")
    assert "os.rename(temp_name, name" not in source
    assert "filesystem.replace(temp_name, name, src_dir_fd=directory_fd" in source
    assert "filesystem.replace(temp_name, name, src_dir_fd=base_fd" in source
