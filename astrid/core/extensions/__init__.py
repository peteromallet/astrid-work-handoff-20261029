"""Astrid-wide extension points and contributions: the data model and manifest parsing (M-Core, X-1)."""

from .model import (
    ENVELOPE_KEYS,
    KEY_RE,
    TOUCHES,
    Contribution,
    Deprecation,
    Effects,
    ExtensionPoint,
    ManifestError,
    Quarantined,
    parse_contribution,
    parse_effects,
    parse_point,
)
from .refs import Ref, parse_ref
from .registry import Disabled, ExtensionRegistry, ExtensionUnavailable, Shadowed

__all__ = [
    "ENVELOPE_KEYS",
    "KEY_RE",
    "TOUCHES",
    "Contribution",
    "Deprecation",
    "Disabled",
    "ExtensionRegistry",
    "ExtensionUnavailable",
    "Effects",
    "ExtensionPoint",
    "ManifestError",
    "Quarantined",
    "Ref",
    "Shadowed",
    "parse_contribution",
    "parse_effects",
    "parse_point",
    "parse_ref",
]
