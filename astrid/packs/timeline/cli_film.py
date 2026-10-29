"""Where the film ends, on `timelines edit`: --film-end MOMENT (W3).

A timeline-level op: it moves the film's end to a moment (the last picture and the layers that end with the film
hold to it; the music keeps its ending). Pure apart from the checkout it is given.
"""

from __future__ import annotations

import argparse
from typing import Any


def add_film_flags(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--film-end", dest="film_end", default=None, metavar="MOMENT",
                        help="Where the film ends, as a moment: --film-end 'after \"Astrid\" in n27 +2.5s'. The last "
                             "picture and everything that ends with the film hold to it; the music keeps its ending. "
                             "Not with a clip selector.")


def film_end_requested(parsed: argparse.Namespace) -> bool:
    return getattr(parsed, "film_end", None) is not None


def apply_film_end(tl: Any, parsed: argparse.Namespace) -> None:
    """Run --film-end on the checkout (the --music policy is already set)."""
    if film_end_requested(parsed):
        tl.film_end(parsed.film_end)
