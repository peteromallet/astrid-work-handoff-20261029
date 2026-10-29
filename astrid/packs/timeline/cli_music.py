"""The music policy on `timelines edit`: --music keep-end|plays-on (how the music bed follows a re-time).

Pure apart from the checkout it is given: it sets the checkout's policy, which the re-flow ops read.
"""

from __future__ import annotations

import argparse
from typing import Any

MUSIC_CHOICES = ("keep-end", "plays-on")


def add_music_flag(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--music", choices=MUSIC_CHOICES, default=None, metavar="{keep-end,plays-on}",
                        help="how the music bed follows a re-time: keep-end (default) cuts it at a bar with a crossfade "
                             "so its ending stays on the film's end; plays-on keeps it whole")


def apply_music_policy(tl: Any, parsed: argparse.Namespace) -> None:
    """Set the checkout's bed policy from --music, before the timeline-level ops run."""
    value = getattr(parsed, "music", None)
    if value is not None:
        tl.music = value.replace("-", "_")
