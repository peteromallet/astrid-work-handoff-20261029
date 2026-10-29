"""Contribution scopes: where contributions come from, and disable-by-name (M-Core, X-3)."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from astrid.core.extensions import scopes
from astrid.core.extensions.scopes import (
    SCOPES,
    contribution_roots,
    disabled_ids,
    find_project,
    format_chain,
)
from astrid.core.pack.source_setup import SourceSetupError


@pytest.fixture(autouse=True)
def no_managed_sources(monkeypatch):
    """Never read the real source state file; tests opt in to installed sources explicitly."""
    monkeypatch.setattr(scopes, "active_sources", lambda **_: ())


def _roots(tmp_path: Path, **kwargs):
    kwargs.setdefault("cwd", tmp_path / "work")
    kwargs.setdefault("home", tmp_path / "home")
    kwargs.setdefault("env", {})
    kwargs.setdefault("repo_root", tmp_path / "repo")
    kwargs.setdefault("installed", [])
    return contribution_roots(**kwargs)


def _user_root(tmp_path: Path, **kwargs):
    return next(root for root in _roots(tmp_path, **kwargs) if root.scope == "user")


def test_user_root_honours_astrid_user_packs(tmp_path):
    target = tmp_path / "custom" / "packs"
    root = _user_root(tmp_path, env={"ASTRID_USER_PACKS": str(target), "XDG_CONFIG_HOME": "/nope"})
    assert root.path == target
    assert root.origin == "user"


def test_user_root_honours_xdg_config_home(tmp_path):
    xdg = tmp_path / "xdg"
    root = _user_root(tmp_path, env={"XDG_CONFIG_HOME": str(xdg)})
    assert root.path == xdg / "astrid" / "packs"


def test_user_root_defaults_to_home_config_and_never_home_astrid(tmp_path):
    home = tmp_path / "home"
    (home / ".astrid").mkdir(parents=True)
    root = _user_root(tmp_path, home=home)
    assert root.path == home / ".config" / "astrid" / "packs"
    assert home / ".astrid" not in root.path.parents
    assert root.path != home / ".astrid" / "packs"


def test_user_root_uses_home_env_when_home_not_passed(tmp_path, monkeypatch):
    fake_home = tmp_path / "fake-home"
    monkeypatch.setenv("HOME", str(fake_home))
    roots = contribution_roots(
        cwd=tmp_path / "work", env={}, repo_root=tmp_path / "repo", installed=[]
    )
    user = next(root for root in roots if root.scope == "user")
    assert user.path == fake_home / ".config" / "astrid" / "packs"


def test_home_with_astrid_folder_is_not_a_project_unless_ancestor_of_cwd(tmp_path):
    home = tmp_path / "home"
    (home / ".astrid").mkdir(parents=True)
    unrelated = tmp_path / "elsewhere" / "work"
    unrelated.mkdir(parents=True)
    assert find_project(unrelated) is None

    nested = home / "code" / "repo"
    nested.mkdir(parents=True)
    assert find_project(nested) == home


def test_nested_cwd_finds_nearest_astrid_folder(tmp_path):
    outer = tmp_path / "outer"
    inner = outer / "sub"
    deep = inner / "deep" / "er"
    (outer / ".astrid").mkdir(parents=True)
    (inner / ".astrid").mkdir(parents=True)
    deep.mkdir(parents=True)
    assert find_project(deep) == inner
    assert find_project(outer) == outer


def test_no_project_means_no_project_root_and_no_disabled_ids(tmp_path):
    cwd = tmp_path / "work"
    cwd.mkdir()
    assert find_project(cwd) is None
    roots = _roots(tmp_path, cwd=cwd)
    assert all(root.scope != "project" for root in roots)
    assert disabled_ids(cwd=cwd) == frozenset()


def test_astrid_packs_path_two_entries(tmp_path):
    first = tmp_path / "first"
    second = tmp_path / "second"
    first.mkdir()
    env = {"ASTRID_PACKS_PATH": f"{first}{':'}{second}"}
    roots = [root for root in _roots(tmp_path, env=env) if root.origin == "ASTRID_PACKS_PATH"]
    assert [root.path for root in roots] == [first, second]
    assert [root.exists for root in roots] == [True, False]
    assert all(root.scope == "project" for root in roots)


def test_extra_pack_roots_are_installed_with_pack_root_origin(tmp_path):
    extra = tmp_path / "extra"
    roots = _roots(tmp_path, extra_pack_roots=[str(extra)])
    matches = [root for root in roots if root.origin == "--pack-root"]
    assert len(matches) == 1
    assert matches[0].scope == "installed"
    assert matches[0].path == Path(str(extra))


def test_missing_folders_are_reported_with_exists_false(tmp_path):
    repo = tmp_path / "repo"
    (repo / "astrid" / "packs").mkdir(parents=True)
    roots = _roots(tmp_path, repo_root=repo)
    by_origin = {root.origin: root for root in roots}
    assert by_origin["source tree"].exists is True
    assert by_origin["sdk"].exists is False
    assert by_origin["user"].exists is False


def test_order_is_by_scope_then_source(tmp_path):
    project = tmp_path / "proj"
    (project / ".astrid").mkdir(parents=True)
    cwd = project / "src"
    cwd.mkdir()
    env = {
        "ASTRID_PACKS_PATH": str(tmp_path / "env-pack"),
        "XDG_CONFIG_HOME": str(tmp_path / "xdg"),
    }
    roots = contribution_roots(
        cwd=cwd,
        home=tmp_path / "home",
        env=env,
        extra_pack_roots=[str(tmp_path / "extra")],
        repo_root=tmp_path / "repo",
        installed=[tmp_path / "managed-a"],
    )
    assert [root.origin for root in roots] == [
        "source tree",
        "sdk",
        f"managed:{tmp_path / 'managed-a'}",
        "--pack-root",
        "user",
        "<project>/.astrid/packs",
        "ASTRID_PACKS_PATH",
    ]
    scope_indexes = [SCOPES.index(root.scope) for root in roots]
    assert scope_indexes == sorted(scope_indexes)


def test_injected_installed_roots_come_before_extra_pack_roots(tmp_path):
    managed = tmp_path / "managed"
    roots = _roots(tmp_path, installed=[managed], extra_pack_roots=[str(tmp_path / "extra")])
    installed = [root for root in roots if root.scope == "installed"]
    assert [root.origin for root in installed] == [f"managed:{managed}", "--pack-root"]
    assert installed[0].path == managed


def test_active_sources_failure_gives_no_installed_roots(tmp_path, monkeypatch):
    def boom(**_):
        raise SourceSetupError("bad state")

    monkeypatch.setattr(scopes, "active_sources", boom)
    roots = contribution_roots(
        cwd=tmp_path / "work", home=tmp_path / "home", env={}, repo_root=tmp_path / "repo"
    )
    assert all(root.scope != "installed" for root in roots)


def test_active_sources_success_gives_managed_roots(tmp_path, monkeypatch):
    pack_root = tmp_path / "managed" / "pack"
    fake = SimpleNamespace(pack_root=pack_root, identity="repo@rev#sub:/x")
    monkeypatch.setattr(scopes, "active_sources", lambda **_: (fake,))
    roots = contribution_roots(
        cwd=tmp_path / "work", home=tmp_path / "home", env={}, repo_root=tmp_path / "repo"
    )
    installed = [root for root in roots if root.scope == "installed"]
    assert len(installed) == 1
    assert installed[0].path == pack_root
    assert installed[0].origin == "managed:repo@rev#sub:/x"


def test_format_chain_one_line_per_root(tmp_path):
    project = tmp_path / "x"
    (project / ".astrid" / "packs").mkdir(parents=True)
    roots = contribution_roots(
        cwd=project,
        home=tmp_path / "home",
        env={},
        repo_root=tmp_path / "repo",
        installed=[],
    )
    lines = format_chain(roots)
    assert len(lines) == len(roots)
    project_line = next(line for line in lines if line.startswith("project"))
    assert (
        project_line
        == f"project   {project / '.astrid' / 'packs'}   (exists)   <project>/.astrid/packs"
    )
    assert any("(missing)" in line for line in lines)


def test_disabled_ids_present(tmp_path):
    project = tmp_path / "proj"
    (project / ".astrid").mkdir(parents=True)
    (project / ".astrid" / "config.toml").write_text(
        '[extensions]\ndisable = ["proj.foo", "proj.bar"]\n', encoding="utf-8"
    )
    assert disabled_ids(cwd=project) == frozenset({"proj.foo", "proj.bar"})


def test_disabled_ids_absent_section_or_key_is_empty(tmp_path):
    project = tmp_path / "proj"
    (project / ".astrid").mkdir(parents=True)
    config = project / ".astrid" / "config.toml"
    config.write_text("[other]\nkey = 1\n", encoding="utf-8")
    assert disabled_ids(cwd=project) == frozenset()
    config.write_text("[extensions]\n", encoding="utf-8")
    assert disabled_ids(cwd=project) == frozenset()


def test_disabled_ids_missing_file_is_empty(tmp_path):
    project = tmp_path / "proj"
    (project / ".astrid").mkdir(parents=True)
    assert disabled_ids(cwd=project) == frozenset()


def test_disabled_ids_malformed_raises_with_path_and_line(tmp_path):
    project = tmp_path / "proj"
    (project / ".astrid").mkdir(parents=True)
    config = project / ".astrid" / "config.toml"
    config.write_text('[extensions]\ndisable = [\n"proj.foo"\n', encoding="utf-8")
    with pytest.raises(ValueError) as info:
        disabled_ids(cwd=project)
    message = str(info.value)
    assert str(config) in message
    assert "line" in message


def test_disabled_ids_wrong_type_raises(tmp_path):
    project = tmp_path / "proj"
    (project / ".astrid").mkdir(parents=True)
    (project / ".astrid" / "config.toml").write_text(
        '[extensions]\ndisable = "proj.foo"\n', encoding="utf-8"
    )
    with pytest.raises(ValueError):
        disabled_ids(cwd=project)
