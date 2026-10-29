"""V3 discovery shim for the editorial rhythm visualization layer."""

from astrid.packs.editorial.shared.rhythm import make_visualizer_layer

LAYER = make_visualizer_layer()

__all__ = ["LAYER"]
