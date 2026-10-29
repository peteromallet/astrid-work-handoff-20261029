"""``edit --verify`` / ``--timings`` / ``--labels``: the flags and the timing line (restored from f840ec1c).

The p50/p95 history of the old Python verify worker has no counterpart: verify now decodes frames from managed
renders and returns its own ``timing`` (see ``fast_lane.verify``), which ``print_timings`` prints.
"""
from __future__ import annotations

import argparse

from astrid.packs.timeline import cli_verify


def test_the_timings_flag_parses():
    parser = argparse.ArgumentParser()
    cli_verify.add_timings_flag(parser)
    assert parser.parse_args([]).timings is False
    assert parser.parse_args(["--timings"]).timings is True
    assert "time went" in parser.format_help()


def test_print_timings_prints_the_recorded_breakdown(capsys):
    cli_verify.print_timings({"timing": {"total_s": 4.2, "startup_s": 0.5, "end_to_end_s": 4.7}})
    assert capsys.readouterr().out.strip() == "timings  total 4.2s · startup 0.5s · end to end 4.7s"


def test_print_timings_says_when_nothing_was_recorded(capsys):
    cli_verify.print_timings({})
    assert "not recorded" in capsys.readouterr().out


def test_the_labels_flag_parses_for_check_and_verify():
    parser = argparse.ArgumentParser()
    cli_verify.add_labels_flag(parser)
    assert parser.parse_args([]).labels is False
    assert parser.parse_args(["--labels"]).labels is True
    assert "address" in parser.format_help()


def test_the_visualize_labels_shorthand_adds_the_labels_layer_once():
    parser = argparse.ArgumentParser()
    cli_verify.add_visualize_labels_flag(parser)
    assert parser.parse_args(["--labels"]).labels is True
    assert cli_verify.with_labels_layer(["sync"], True) == ["sync", "labels"]
    assert cli_verify.with_labels_layer(["labels", "sync"], True) == ["labels", "sync"]
    assert cli_verify.with_labels_layer(None, True) == ["labels"]
    assert cli_verify.with_labels_layer(["sync"], False) == ["sync"]
    assert cli_verify.with_labels_layer(None, False) is None
