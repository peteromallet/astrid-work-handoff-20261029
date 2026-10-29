"""Shared access to Astrid's namespaced timeline intent.

The Runtime owns the surrounding ``app`` object, so readers must preserve its
opaque keys.  Legacy flat intent remains readable; writes and detached-copy
migration use ``app.astrid``.
"""
from __future__ import annotations

import copy
from collections.abc import Mapping, MutableMapping
from typing import Any

NS = "astrid"
LEGACY = "_legacy"
CLIP_INTENT_KEYS = frozenset({
    "on", "until", "for", "cut", "layer", "deliberate", "deliberate_hold",
    "why", "why_layers", "formulas", "segment", "words", "text", "gap_after_s",
    "beats", "beats_label", "slot", "replaces", "standin", "standin_intent",
    "standin_for", "intended", "sequence", "sequence_index", "sequence_fit",
    "sequence_shape_from", "orphan", "role", "style", "group", "duck",
})
FILM_INTENT_KEYS = frozenset({"chapters", "slots", "cut_notes", "formulas", "sequences"})


def _map(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def read_app(clip: Any) -> Mapping[str, Any]:
    """Return flat-compatible clip app data, with namespaced keys taking precedence."""
    app = _map(_map(clip).get("app"))
    ns = app.get(NS)
    if not isinstance(ns, Mapping):
        return app
    merged = {key: value for key, value in app.items() if key != NS}
    merged.update(ns)
    return merged


def film_intent(config: Any) -> dict[str, Any]:
    """Read film intent from either legacy loose keys or ``config.app.astrid``."""
    config = _map(config)
    out = {key: config[key] for key in FILM_INTENT_KEYS if key in config}
    app = _map(config.get("app"))
    out.update({key: value for key, value in app.items() if key in FILM_INTENT_KEYS})
    ns = _map(app.get(NS))
    out.update(ns)  # the namespace is Astrid's own: keys outside the known list (e.g. groups) belong to it too
    return out


def _keep(ns: MutableMapping[str, Any], key: str, value: Any) -> None:
    if key not in ns:
        ns[key] = value
    elif ns[key] != value:
        kept = ns.get(LEGACY)
        if not isinstance(kept, dict):
            kept = ns[LEGACY] = {}
        slot, suffix = key, 1
        while slot in kept and kept[slot] != value:
            suffix += 1
            slot = f"{key}#{suffix}"
        kept.setdefault(slot, value)


def clip_ns(clip: MutableMapping[str, Any]) -> dict[str, Any]:
    """Get the writable namespace after preserving every legacy collision."""
    app = clip.get("app")
    if not isinstance(app, dict):
        app = clip["app"] = {}
    ns = app.get(NS)
    if not isinstance(ns, dict):
        ns = app[NS] = {}
    for key in tuple(app):
        if key in CLIP_INTENT_KEYS:
            _keep(ns, key, app.pop(key))
    return ns


def tidy_clip(clip: MutableMapping[str, Any]) -> None:
    app = clip.get("app")
    if isinstance(app, dict):
        if isinstance(app.get(NS), dict) and not app[NS]:
            app.pop(NS)
        if not app:
            clip.pop("app")


def migrate_clip(clip: MutableMapping[str, Any]) -> bool:
    app = clip.get("app")
    if not isinstance(app, dict):
        return False
    keys = [key for key in app if key in CLIP_INTENT_KEYS]
    if not keys:
        return False
    ns = app.get(NS)
    if not isinstance(ns, dict):
        ns = app[NS] = {}
    for key in keys:
        _keep(ns, key, app.pop(key))
    return True


def film_ns(config: MutableMapping[str, Any]) -> dict[str, Any]:
    app = config.get("app")
    if not isinstance(app, dict):
        app = config["app"] = {}
    ns = app.get(NS)
    if not isinstance(ns, dict):
        ns = app[NS] = {}
    for source in (config, app):
        for key in tuple(source):
            if key in FILM_INTENT_KEYS and source is not ns:
                _keep(ns, key, source.pop(key))
    return ns


def tidy_film(config: MutableMapping[str, Any]) -> None:
    app = config.get("app")
    if isinstance(app, dict):
        if isinstance(app.get(NS), dict) and not app[NS]:
            app.pop(NS)
        if not app:
            config.pop("app")


def migrate_film(config: MutableMapping[str, Any]) -> bool:
    keys = [key for key in FILM_INTENT_KEYS if key in config or key in _map(config.get("app"))]
    if not keys:
        return False
    ns = film_ns(config)
    return bool(keys)


def migrate_bundle(bundle: MutableMapping[str, Any]) -> bool:
    """Migrate only the caller's detached working-copy structure, including base copies."""
    moved = False
    shots = bundle.get("shots")
    rows = shots.values() if isinstance(shots, Mapping) else shots if isinstance(shots, list) else ()
    for shot in rows:
        if not isinstance(shot, MutableMapping):
            continue
        for field in ("internal_timeline", "base_internal_timeline", "timeline"):
            internal = shot.get(field)
            clips = internal.get("clips") if isinstance(internal, Mapping) else None
            if isinstance(clips, list):
                for clip in clips:
                    if isinstance(clip, MutableMapping):
                        moved = migrate_clip(clip) or moved
    parent = bundle.get("parent")
    config = parent.get("config") if isinstance(parent, MutableMapping) else None
    if isinstance(config, MutableMapping):
        moved = migrate_film(config) or moved
    for field in ("base_parent_payload",):
        payload = bundle.get(field)
        config = payload.get("config") if isinstance(payload, MutableMapping) else None
        if isinstance(config, MutableMapping):
            moved = migrate_film(config) or moved
    return moved


def normalized(bundle: Any) -> Any:
    """Comparable deep copy with recognized legacy intent represented canonically."""
    value = copy.deepcopy(bundle)
    if isinstance(value, MutableMapping):
        migrate_bundle(value)
    return value
