from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path


TOOL_SOURCE = Path(__file__).resolve().parents[1]
FIXTURES = Path(__file__).resolve().parent / "fixtures"


def make_tools(tmp_path: Path, map_name: str = "stub-map.tsv") -> Path:
    tool_dir = tmp_path / "tools" / "astrid-rename"
    tool_dir.mkdir(parents=True)
    shutil.copy2(TOOL_SOURCE / "rename.py", tool_dir / "rename.py")
    shutil.copy2(TOOL_SOURCE / "check-zero", tool_dir / "check-zero")
    shutil.copy2(TOOL_SOURCE / "rename-skip.txt", tool_dir / "rename-skip.txt")
    shutil.copy2(FIXTURES / map_name, tool_dir / "rename-map.tsv")
    shutil.copy2(FIXTURES / "kept-banodoco.txt", tool_dir / "kept-banodoco.txt")
    os.chmod(tool_dir / "rename.py", 0o755)
    os.chmod(tool_dir / "check-zero", 0o755)
    return tool_dir


def run_rename(tool_dir: Path, *args: str, input_text: str | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(tool_dir / "rename.py"), *args],
        input=input_text,
        text=True,
        capture_output=True,
        check=False,
    )


def initialize_repo(path: Path, origin: str = "https://github.com/banodoco/reigh-app.git") -> None:
    path.mkdir(parents=True)
    subprocess.run(["git", "init", "-q"], cwd=path, check=True)
    config = path / ".git" / "config"
    with config.open("a", encoding="utf-8") as stream:
        stream.write(f'\n[remote "origin"]\n\turl = {origin}\n')


def test_apply_is_idempotent_and_case_variants_report_mixed_case(tmp_path: Path) -> None:
    tool_dir = make_tools(tmp_path)
    root = tmp_path / "repo"
    root.mkdir()
    source = root / "words.txt"
    source.write_text("reigh REIGH Reigh rEigh\n", encoding="utf-8")

    first = run_rename(tool_dir, "--path", str(root), "--apply")
    assert first.returncode == 0, first.stderr
    assert source.read_text(encoding="utf-8") == "astrid ASTRID Astrid rEigh\n"
    assert "mixed-case: words.txt:1:rEigh" in first.stderr

    second = run_rename(tool_dir, "--path", str(root), "--apply")
    assert second.returncode == 0, second.stderr
    assert "changed=0" in second.stdout
    assert source.read_text(encoding="utf-8") == "astrid ASTRID Astrid rEigh\n"


def test_mixed_and_unmixed_prose_outputs(tmp_path: Path) -> None:
    tool_dir = make_tools(tmp_path)
    mixed = run_rename(
        tool_dir,
        "--text",
        input_text="Reigh and Astrid\nReigh's\n",
    )
    assert mixed.returncode == 0, mixed.stderr
    assert mixed.stdout == "Astrid App and Astrid\nAstrid App's\n"

    plain = run_rename(tool_dir, "--text", input_text="Reigh\n")
    assert plain.returncode == 0, plain.stderr
    assert plain.stdout == "Astrid\n"


def test_prose_boundaries_do_not_match_identifiers_or_domains(tmp_path: Path) -> None:
    tool_dir = make_tools(tmp_path)
    (tool_dir / "rename-map.tsv").write_text(
        "kind\told\tnew\tscope\tnote\n"
        "prose\tReigh\tAstrid App\tmixed\tmixed prose\n"
        "prose\tReigh\tAstrid\tall\tplain prose\n",
        encoding="utf-8",
    )
    source = "Reigh-app ReighExtension com.reigh. Reigh's Reigh and Astrid"
    result = run_rename(tool_dir, "--text", input_text=source)
    assert result.returncode == 0, result.stderr
    assert result.stdout == "Reigh-app ReighExtension com.reigh. Astrid App's Astrid App and Astrid"


def test_regex_path_token_precedence_and_narrow_scope(tmp_path: Path) -> None:
    tool_dir = make_tools(tmp_path)
    result = run_rename(
        tool_dir,
        "--text",
        input_text="url=reighCommit regexWord pathWord scopeWord; reighCommit REIGH_ROOT",
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout == "url=regexCommit regexWins pathWins globalValue; appCommit ASTRID_APP_ROOT"

    root = tmp_path / "scope-repo"
    (root / "only").mkdir(parents=True)
    target = root / "only" / "this.txt"
    target.write_text("scopeWord", encoding="utf-8")
    result = run_rename(tool_dir, "--path", str(root), "--as", "app", "--apply")
    assert result.returncode == 0, result.stderr
    assert target.read_text(encoding="utf-8") == "appValue"


def test_regex_replacement_preserves_literal_escaped_forms(tmp_path: Path) -> None:
    tool_dir = make_tools(tmp_path)
    result = run_rename(tool_dir, "--text", input_text=r"com.reigh.")
    assert result.returncode == 0, result.stderr
    assert result.stdout == r"haus\.astrid\."


def test_path_move_also_rewrites_contents(tmp_path: Path) -> None:
    tool_dir = make_tools(tmp_path)
    root = tmp_path / "repo"
    old_file = root / "src/tools/video-editor/adapters/reigh/item.txt"
    old_file.parent.mkdir(parents=True)
    old_file.write_text("src/tools/video-editor/adapters/reigh/item.txt\n", encoding="utf-8")

    result = run_rename(tool_dir, "--path", str(root), "--as", "app", "--apply")
    assert result.returncode == 0, result.stderr
    new_file = root / "src/tools/video-editor/adapters/app/item.txt"
    assert not old_file.exists()
    assert new_file.read_text(encoding="utf-8") == "src/tools/video-editor/adapters/app/item.txt\n"


def test_existing_move_target_is_an_error_without_changes(tmp_path: Path) -> None:
    tool_dir = make_tools(tmp_path)
    root = tmp_path / "repo"
    old_file = root / "src/tools/video-editor/adapters/reigh/item.txt"
    new_file = root / "src/tools/video-editor/adapters/app/item.txt"
    old_file.parent.mkdir(parents=True)
    new_file.parent.mkdir(parents=True)
    old_file.write_text("old Reigh", encoding="utf-8")
    new_file.write_text("target", encoding="utf-8")

    result = run_rename(tool_dir, "--path", str(root), "--as", "app", "--apply")
    assert result.returncode == 2
    assert "move target already exists" in result.stderr
    assert old_file.read_text(encoding="utf-8") == "old Reigh"
    assert new_file.read_text(encoding="utf-8") == "target"


def test_case_only_file_rename_uses_a_temporary_name(tmp_path: Path) -> None:
    tool_dir = make_tools(tmp_path)
    (tool_dir / "rename-map.tsv").write_text(
        "kind\told\tnew\tscope\tnote\npath\tcase.txt\tCASE.txt\tall\tcase-only\n",
        encoding="utf-8",
    )
    root = tmp_path / "repo"
    root.mkdir()
    old_file = root / "case.txt"
    old_file.write_text("plain", encoding="utf-8")

    result = run_rename(tool_dir, "--path", str(root), "--apply")
    assert result.returncode == 0, result.stderr
    assert (root / "CASE.txt").read_text(encoding="utf-8") == "plain"
    assert os.listdir(root) == ["CASE.txt"]


def test_binary_symlink_git_and_listed_paths_are_skipped(tmp_path: Path) -> None:
    tool_dir = make_tools(tmp_path)
    root = tmp_path / "repo"
    root.mkdir()
    (root / "binary.bin").write_bytes(b"Reigh\0contents")
    outside = tmp_path / "outside.txt"
    outside.write_text("Reigh", encoding="utf-8")
    (root / "link.txt").symlink_to(outside)
    (root / ".git").mkdir()
    (root / ".git" / "hidden.txt").write_text("Reigh", encoding="utf-8")
    listed = root / "tools/astrid-rename/kept.txt"
    listed.parent.mkdir(parents=True)
    listed.write_text("Reigh", encoding="utf-8")

    result = run_rename(tool_dir, "--path", str(root), "--apply")
    assert result.returncode == 0, result.stderr
    assert (root / "binary.bin").read_bytes() == b"Reigh\0contents"
    assert outside.read_text(encoding="utf-8") == "Reigh"
    assert (root / ".git" / "hidden.txt").read_text(encoding="utf-8") == "Reigh"
    assert listed.read_text(encoding="utf-8") == "Reigh"


def test_path_mode_handles_non_git_directory_and_single_file(tmp_path: Path) -> None:
    tool_dir = make_tools(tmp_path)
    root = tmp_path / "not-git"
    root.mkdir()
    directory_file = root / "one.txt"
    directory_file.write_text("Reigh", encoding="utf-8")
    result = run_rename(tool_dir, "--path", str(root), "--apply")
    assert result.returncode == 0, result.stderr
    assert directory_file.read_text(encoding="utf-8") == "Astrid"

    single_file = root / "two.txt"
    single_file.write_text("reigh", encoding="utf-8")
    result = run_rename(tool_dir, "--path", str(single_file), "--apply")
    assert result.returncode == 0, result.stderr
    assert single_file.read_text(encoding="utf-8") == "astrid"


def test_repo_mode_reads_git_files_and_identifies_origin(tmp_path: Path) -> None:
    tool_dir = make_tools(tmp_path)
    root = tmp_path / "repo"
    initialize_repo(root)
    target = root / "data.txt"
    target.write_text("Reigh", encoding="utf-8")

    result = run_rename(tool_dir, "--repo", str(root), "--apply")
    assert result.returncode == 0, result.stderr
    assert target.read_text(encoding="utf-8") == "Astrid"
    assert "repo=app" in result.stdout


def test_report_merges_flags_three_cases_and_accepts_intended_entries(tmp_path: Path) -> None:
    tool_dir = make_tools(tmp_path, "merge-map.tsv")
    root = tmp_path / "repo"
    initialize_repo(root)
    (root / "seed.txt").write_text(
        "astridCommit reighCommit\noldA oldB\nASTRID_REIGH_X\n", encoding="utf-8"
    )

    report = run_rename(tool_dir, "--report-merges", "--repos", str(root))
    assert report.returncode == 1
    assert "astridCommit <- reighCommit" in report.stdout
    assert "mergedToken <- oldA, oldB" in report.stdout
    assert "ASTRID_ASTRID_X <- ASTRID_REIGH_X" in report.stdout

    intended = tmp_path / "intended.txt"
    intended.write_text(
        "astridCommit\treighCommit\tseeded collision\n"
        "mergedToken\toldA,oldB\tseeded merge\n"
        "ASTRID_ASTRID_X\tASTRID_REIGH_X\tseeded stutter\n",
        encoding="utf-8",
    )
    accepted = run_rename(
        tool_dir,
        "--report-merges",
        "--repos",
        str(root),
        "--intended",
        str(intended),
    )
    assert accepted.returncode == 0, accepted.stdout + accepted.stderr
    assert accepted.stdout.count("[intended]") == 3


def test_report_merges_lists_each_mixed_prose_file(tmp_path: Path) -> None:
    tool_dir = make_tools(tmp_path)
    (tool_dir / "rename-map.tsv").write_text(
        "kind\told\tnew\tscope\tnote\n"
        "prose\tReigh\tAstrid App\tmixed\tmixed prose\n"
        "prose\tReigh\tAstrid\tall\tplain prose\n",
        encoding="utf-8",
    )
    root = tmp_path / "repo"
    initialize_repo(root)
    (root / "seed.txt").write_text("Reigh and Astrid\n", encoding="utf-8")

    report = run_rename(tool_dir, "--report-merges", "--repos", str(root))
    assert report.returncode == 0, report.stdout + report.stderr
    assert "mixed prose files:\n  app/seed.txt" in report.stdout


def test_real_map_keeps_community_names_and_rewrites_agent_url() -> None:
    assert (TOOL_SOURCE / "rename-map.tsv").is_file()
    result = subprocess.run(
        [str(TOOL_SOURCE / "rename.py"), "--text", "--as", "astrid"],
        input=(
            "@banodoco/timeline-schema banodoco-workspace banodoco-timeline-schema "
            "banodoco_social astrid-agent\n"
            "https://github.com/peteromallet/Astrid-agent\n"
        ),
        text=True,
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout == (
        "@banodoco/timeline-schema banodoco-workspace banodoco-timeline-schema "
        "banodoco_social astrid-agent\n"
        "https://github.com/peteromallet/astrid-agent\n"
    )

    kept = subprocess.run(
        [str(TOOL_SOURCE / "check-zero"), "--stdin"],
        input=(
            "banodoco-workspace @banodoco/timeline-schema banodoco-timeline-schema "
            "banodoco_social banodoco_schema banodoco_timeline_schema\n"
        ),
        text=True,
        capture_output=True,
        check=False,
    )
    assert kept.returncode == 0, kept.stdout + kept.stderr
