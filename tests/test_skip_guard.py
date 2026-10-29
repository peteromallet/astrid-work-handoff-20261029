"""The skip guard (tests/lanes.py) fails the run on undeclared skips and xfails."""

from __future__ import annotations

import sys
import textwrap
from pathlib import Path

import pytest

pytest_plugins = ["pytester"]

REPO = Path(__file__).resolve().parent.parent


@pytest.fixture
def sandbox(pytester):
    pytester.makeconftest(
        f"""
        import sys
        sys.path.insert(0, {str(REPO)!r})
        from tests.lanes import pytest_configure  # noqa: F401
        """
    )
    pytester.makeini("[pytest]\npython_files = check_*.py\n")
    return pytester


def _run(sandbox, body: str):
    sandbox.makepyfile(check_it=textwrap.dedent(body))
    return sandbox.runpytest_subprocess("-p", "no:cacheprovider", "-q")


def test_undeclared_pytest_skip_fails_the_run(sandbox):
    result = _run(sandbox, """
        import pytest
        def test_a():
            pytest.skip("flaky today")
        """)
    assert result.ret != 0
    result.stdout.fnmatch_lines(["UNDECLARED SKIP *::test_a: *flaky today*"])


def test_skip_mark_importorskip_and_xfail_fail_the_run(sandbox):
    result = _run(sandbox, """
        import pytest
        @pytest.mark.skip(reason="x")
        def test_mark(): pass
        @pytest.mark.skipif(True, reason="[declared:not-in-registry] nope")
        def test_unknown_tag(): pass
        @pytest.mark.xfail(reason="later")
        def test_xfail(): assert False
        """)
    assert result.ret != 0
    result.stdout.fnmatch_lines([
        "UNDECLARED SKIP *::test_mark: *",
        "UNDECLARED SKIP *::test_unknown_tag: *",
        "UNDECLARED SKIP *::test_xfail: xfail is not allowed*",
    ])


def _foreign_helper() -> str:
    return "requires_windows_security" if sys.platform != "win32" else "requires_posix_process_groups"


def test_declared_skip_passes_and_is_listed_by_name(sandbox):
    helper = _foreign_helper()
    result = _run(sandbox, f"""
        from tests.lanes import {helper}
        @{helper}
        def test_platform_only(): assert False
        def test_runs(): pass
        """)
    assert result.ret == 0, result.stdout.str()
    result.stdout.fnmatch_lines(["declared skips (1):", "  SKIP *::test_platform_only: [[]declared:*"])


def test_declared_runtime_skip_passes_where_the_error_matches(sandbox):
    result = _run(sandbox, """
        import pytest
        from tests import lanes
        from tests.lanes import HOSTS, skip_for_declared_error

        def test_symlink(monkeypatch):
            monkeypatch.setattr(lanes, "CURRENT", HOSTS["windows"])
            error = OSError(1314, "no privilege")
            error.winerror = 1314
            skip_for_declared_error("windows-symlink-creation", error)
        def test_runs(): pass
        """)
    assert result.ret == 0, result.stdout.str()
    result.stdout.fnmatch_lines(["  SKIP *::test_symlink: [[]declared:windows-symlink-creation]*"])


def test_declared_runtime_skip_reraises_a_different_error(sandbox):
    result = _run(sandbox, """
        import pytest
        from tests import lanes
        from tests.lanes import HOSTS, skip_for_declared_error

        def test_other_error(monkeypatch):
            monkeypatch.setattr(lanes, "CURRENT", HOSTS["windows"])
            error = OSError(5, "access denied")
            error.winerror = 5
            with pytest.raises(OSError) as raised:
                skip_for_declared_error("windows-symlink-creation", error)
            assert raised.value is error
        def test_off_windows(monkeypatch):
            monkeypatch.setattr(lanes, "CURRENT", HOSTS["linux"])
            error = OSError(1314, "x")
            error.winerror = 1314
            with pytest.raises(OSError):
                skip_for_declared_error("windows-symlink-creation", error)
        """)
    assert result.ret == 0, result.stdout.str()


def test_a_run_in_which_every_test_is_skipped_by_a_declared_skip_fails(sandbox):
    helper = _foreign_helper()
    result = _run(sandbox, f"""
        from tests.lanes import {helper}
        @{helper}
        def test_platform_only(): assert False
        """)
    assert result.ret != 0
    result.stdout.fnmatch_lines(["*no test passed in this run*"])


def test_a_skip_raised_in_a_fixture_teardown_fails_the_run(sandbox):
    result = _run(sandbox, """
        import pytest
        @pytest.fixture
        def late():
            yield
            pytest.skip("gave up at teardown")
        def test_a(late): pass
        def test_b(): pass
        """)
    assert result.ret != 0
    result.stdout.fnmatch_lines(["UNDECLARED SKIP *::test_a: *gave up at teardown*"])


def test_a_declared_skip_raised_in_a_fixture_teardown_is_listed(sandbox):
    name = "windows-security" if sys.platform != "win32" else "posix-process-groups"  # its condition holds on this host
    result = _run(sandbox, f"""
        import pytest
        @pytest.fixture
        def late():
            yield
            pytest.skip("[declared:{name}] declared reason")
        def test_a(late): pass
        def test_b(): pass
        """)
    assert result.ret == 0, result.stdout.str()
    result.stdout.fnmatch_lines(["declared skips (1):", f"  SKIP *::test_a: [[]declared:{name}]*"])


def test_skips_of_non_blocking_entries_are_listed_under_their_own_header(sandbox):
    helper = _foreign_helper()
    result = _run(sandbox, f"""
        import dataclasses
        from tests import lanes
        from tests.lanes import {helper}

        lanes.SKIP_REGISTRY.update({{
            name: dataclasses.replace(entry, blocking=False)
            for name, entry in lanes.SKIP_REGISTRY.items()
        }})
        @{helper}
        def test_platform_only(): assert False
        def test_runs(): pass
        """)
    assert result.ret == 0, result.stdout.str()
    result.stdout.fnmatch_lines([
        "declared skips whose tests run only in non-blocking CI jobs (1):",
        "  NON-BLOCKING *::test_platform_only: [[]declared:*",
    ])


def test_skips_of_entries_no_ci_job_runs_are_listed_under_their_own_header(sandbox):
    helper = _foreign_helper()
    result = _run(sandbox, f"""
        import dataclasses
        from tests import lanes
        from tests.lanes import {helper}

        lanes.SKIP_REGISTRY.update({{
            name: dataclasses.replace(entry, no_ci="no job on purpose")
            for name, entry in lanes.SKIP_REGISTRY.items()
        }})
        @{helper}
        def test_platform_only(): assert False
        def test_runs(): pass
        """)
    assert result.ret == 0, result.stdout.str()
    result.stdout.fnmatch_lines([
        "NOT RUN BY ANY CI JOB (1):",
        "  NO CI *::test_platform_only: [[]declared:*] no job on purpose",
    ])


def test_a_declared_skip_where_its_condition_is_false_here_fails_the_run(sandbox):
    # An entry whose condition is false on this host: the tag is registered but the reason does not apply.
    # `name`'s condition is false on this host (so the skip hides a test that should run); `right`'s is true.
    name, right = ("posix-fork", "windows-security") if sys.platform != "win32" else ("windows-security", "posix-fork")
    result = _run(sandbox, f"""
        import pytest
        @pytest.mark.skipif(True, reason="[declared:{name}] misused")
        def test_misused(): pass
        @pytest.mark.skipif(True, reason="[declared:{right}] fine")
        def test_proper(): pass
        def test_runs(): pass
        """)
    assert result.ret != 0
    result.stdout.fnmatch_lines(["UNDECLARED SKIP *::test_misused: *[[]declared:" + name + "] used where its condition*is false*"])
