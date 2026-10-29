from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

TOOL_SOURCE = Path(__file__).resolve().parents[1]
FIXTURES = Path(__file__).resolve().parent / "fixtures"


def make_tools(tmp_path: Path, map_rows: str | None = None) -> Path:
    tool_dir = tmp_path / "tools" / "astrid-rename"
    tool_dir.mkdir(parents=True)
    shutil.copy2(TOOL_SOURCE / "check-zero", tool_dir / "check-zero")
    shutil.copy2(FIXTURES / "stub-map.tsv", tool_dir / "rename-map.tsv")
    shutil.copy2(FIXTURES / "kept-banodoco.txt", tool_dir / "kept-banodoco.txt")
    os.chmod(tool_dir / "check-zero", 0o755)
    if map_rows is not None:
        (tool_dir / "rename-map.tsv").write_text(map_rows, encoding="utf-8")
    return tool_dir


def run_check(tool_dir: Path, *args: str, input_text: str | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(tool_dir / "check-zero"), *args],
        input=input_text,
        text=True,
        capture_output=True,
        check=False,
    )


def test_kept_banodoco_forms_pass_with_stub_kept_file(tmp_path: Path) -> None:
    tool_dir = make_tools(tmp_path)
    result = run_check(
        tool_dir,
        "--stdin",
        "--kept",
        str(FIXTURES / "kept-banodoco.txt"),
        input_text=(
            "banodoco-workspace @banodoco/timeline-schema banodoco_social "
            "banodoco_schema banodoco_timeline_schema banodoco-timeline-schema\n"
        ),
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_new_agent_repo_form_passes(tmp_path: Path) -> None:
    tool_dir = make_tools(tmp_path)
    result = run_check(
        tool_dir,
        "--stdin",
        input_text="astrid-agent peteromallet/astrid-agent\n",
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_old_names_and_case_sensitive_patterns_fail(tmp_path: Path) -> None:
    tool_dir = make_tools(tmp_path)
    examples = (
        "banodoco-workspace-runtime BANODOCO_LOCAL_HOME\n",
        "https://github.com/peteromallet/Astrid-agent\n",
        "the Banodoco runtime\n",
        "x-banodoco-owner\n",
    )
    for text in examples:
        result = run_check(
            tool_dir,
            "--stdin",
            "--kept",
            str(FIXTURES / "kept-banodoco.txt"),
            input_text=text,
        )
        assert result.returncode == 1, f"{text!r}: {result.stdout}{result.stderr}"
        assert "<stdin>:1:" in result.stdout


def test_case_sensitive_bans_and_case_insensitive_name_patterns(tmp_path: Path) -> None:
    tool_dir = make_tools(tmp_path)
    kept = str(FIXTURES / "kept-banodoco.txt")
    lower_env = run_check(tool_dir, "--stdin", "--kept", kept, input_text="banodoco_local_home\n")
    assert lower_env.returncode == 1
    upper_env = run_check(tool_dir, "--stdin", "--kept", kept, input_text="BANODOCO_LOCAL_HOME\n")
    assert upper_env.returncode == 1
    lower_url = run_check(tool_dir, "--stdin", "--kept", kept, input_text="/astrid-agent\n")
    assert lower_url.returncode == 0
    upper_url = run_check(tool_dir, "--stdin", "--kept", kept, input_text="/Astrid-agent\n")
    assert upper_url.returncode == 1


def test_keep_profile_omits_environment_and_strict_banodoco_rules(tmp_path: Path) -> None:
    tool_dir = make_tools(tmp_path)
    result = run_check(
        tool_dir,
        "--stdin",
        "--profile",
        "keep",
        input_text="BANODOCO_LOCAL_HOME x-banodoco-owner\n",
    )
    assert result.returncode == 0, result.stdout + result.stderr
    old_repo = run_check(tool_dir, "--stdin", "--profile", "keep", input_text="banodoco-workspace-runtime\n")
    assert old_repo.returncode == 1


def test_path_mode_scans_files_directories_paths_and_allowlist(tmp_path: Path) -> None:
    tool_dir = make_tools(tmp_path)
    root = tmp_path / "repo"
    target = root / "banodoco-runtime" / "file.txt"
    target.parent.mkdir(parents=True)
    target.write_text("clean\n", encoding="utf-8")

    hit = run_check(
        tool_dir,
        "--path",
        str(root),
        "--kept",
        str(FIXTURES / "kept-banodoco.txt"),
    )
    assert hit.returncode == 1
    assert "banodoco-runtime/file.txt:0:banodoco-runtime" in hit.stdout

    allowed = tmp_path / "allow.txt"
    allowed.write_text("banodoco-runtime/\n", encoding="utf-8")
    clean = run_check(
        tool_dir,
        "--path",
        str(root),
        "--allow",
        str(allowed),
        "--kept",
        str(FIXTURES / "kept-banodoco.txt"),
    )
    assert clean.returncode == 0, clean.stdout + clean.stderr

    single_file = root / "single.txt"
    single_file.write_text("Reigh\n", encoding="utf-8")
    single = run_check(
        tool_dir,
        "--path",
        str(single_file),
        "--kept",
        str(FIXTURES / "kept-banodoco.txt"),
    )
    assert single.returncode == 1
    assert "single.txt:1:Reigh" in single.stdout


def test_repo_mode_checks_tracked_and_untracked_git_files(tmp_path: Path) -> None:
    tool_dir = make_tools(tmp_path)
    root = tmp_path / "repo"
    root.mkdir()
    subprocess.run(["git", "init", "-q"], cwd=root, check=True)
    target = root / "untracked.txt"
    target.write_text("Reigh\n", encoding="utf-8")

    result = run_check(tool_dir, "--repo", str(root), "--kept", str(FIXTURES / "kept-banodoco.txt"))
    assert result.returncode == 1
    assert "untracked.txt:1:Reigh" in result.stdout


def test_repo_key_workspace_runtime_is_map_driven(tmp_path: Path) -> None:
    tool_dir = make_tools(
        tmp_path,
        "kind\told\tnew\tscope\tnote\n"
        "token\tworkspace-runtime\tastrid-runtime\tall\trenamed repo key\n",
    )
    root = tmp_path / "repo"
    root.mkdir()
    target = root / "contract.txt"
    target.write_text("workspace-runtime WORKSPACE_RUNTIME_URL\n", encoding="utf-8")
    result = run_check(tool_dir, "--path", str(root))
    assert result.returncode == 1
    assert "contract.txt:1:workspace-runtime" in result.stdout
    assert "WORKSPACE_RUNTIME_URL" not in result.stdout


def test_local_profile_requires_path_and_scans_with_every_pattern(tmp_path: Path) -> None:
    tool_dir = make_tools(tmp_path)
    missing = run_check(tool_dir, "--stdin", "--profile", "local", input_text="clean")
    assert missing.returncode == 2
    root = tmp_path / "local"
    root.mkdir()
    (root / "sample.txt").write_text("BANODOCO_LOCAL_HOME\n", encoding="utf-8")
    result = run_check(tool_dir, "--path", str(root), "--profile", "local")
    assert result.returncode == 1
    assert "BANODOCO_LOCAL" in result.stdout
