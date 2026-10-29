"""The element.yaml ``metadata`` contract (X-29).

An element declares once what the editing tools would otherwise guess:

- ``role``: what it is on screen (ROLE_VOCABULARY v1, or an ``x-*`` extension);
- ``text``: the param path(s) holding its primary on-screen text;
- ``summary``: a one-line template over params;
- ``geometry``: the params that position and scale it, and whether it is full frame;
- ``presets``: named param sets (each key must be a declared param).

Also refused here: a declared param whose name is a universal clip field
(clip_fields.reserved_names()) unless that param is marked ``deprecated: true``.

Pure: no SDK, and no import of the element package (schema.py imports this module).
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any

ROLE_VOCABULARY: frozenset[str] = frozenset(
    {
        "plate",
        "footage",
        "presenter",
        "sprite",
        "label",
        "title",
        "caption",
        "card",
        "chrome",
        "transition",
        "voice",
        "music",
        "sfx",
    }
)

_EXTENSION_PREFIX = "x-"
_PATH_SPLIT = re.compile(r"[.\[]")


def _reserved_names() -> frozenset[str]:
    """The clip-field names an element may not declare as params: those IMPLEMENTED as clip fields today.

    Names reserved for later (pan, freeze, rotate, mute: in clip_fields' reserved list but not yet fields)
    are not enforced until their field exists, so an element's own param of that name (am-snap-plate's
    stepped ``pan`` drift) is not marked deprecated before there is anything to use instead.
    """
    # Imported lazily: astrid.core.timeline's package __init__ pulls in heavier modules.
    from astrid.core.timeline.clip_fields import FIELDS, reserved_names

    return frozenset(name for name in reserved_names() if name in FIELDS)


def _fields(definition: Any) -> tuple[str, Mapping[str, Any], Mapping[str, Any]]:
    """(element id, schema.properties, metadata) for an ElementDefinition or a mapping."""
    if isinstance(definition, Mapping):
        element_id = str(definition.get("id", "?"))
        schema = definition.get("schema") or {}
        metadata = definition.get("metadata") or {}
    else:
        element_id = str(definition.id)
        schema = definition.schema or {}
        metadata = definition.metadata or {}
    properties = schema.get("properties") or {}
    if not isinstance(properties, Mapping):
        properties = {}
    return element_id, properties, metadata


def _path_head(path: str) -> str:
    return _PATH_SPLIT.split(path, maxsplit=1)[0]


def check_element_metadata(definition: Any) -> list[str]:
    """Every problem with the element's metadata contract, one plain line each.

    Each line starts with the element id. An empty list means the element passes.
    """
    element_id, properties, metadata = _fields(definition)
    problems: list[str] = []

    def problem(text: str) -> None:
        problems.append(f"{element_id}: {text}")

    role = metadata.get("role")
    if role is not None:
        if not isinstance(role, str):
            problem("metadata.role must be a string")
        elif role not in ROLE_VOCABULARY and not role.startswith(_EXTENSION_PREFIX):
            problem(
                f"metadata.role {role!r} is not a role; use one of {', '.join(sorted(ROLE_VOCABULARY))} "
                "or an x-* extension"
            )

    text = metadata.get("text")
    if text is not None:
        paths = [text] if isinstance(text, str) else text
        if not isinstance(paths, list) or not all(isinstance(p, str) and p for p in paths):
            problem("metadata.text must be a param path or a list of param paths")
        else:
            for path in paths:
                head = _path_head(path)
                if head not in properties:
                    problem(f"metadata.text path {path!r} is not a declared param (schema.properties.{head})")

    geometry = metadata.get("geometry")
    if geometry is not None:
        if not isinstance(geometry, Mapping):
            problem("metadata.geometry must be an object")
        else:
            position = geometry.get("position")
            if position is not None:
                if not (isinstance(position, list) and len(position) == 2 and all(isinstance(p, str) for p in position)):
                    problem("metadata.geometry.position must be [xParam, yParam] or null")
                else:
                    for param in position:
                        if param not in properties:
                            problem(f"metadata.geometry.position param {param!r} is not a declared param")
            scale = geometry.get("scale")
            if scale is not None:
                if not isinstance(scale, str):
                    problem("metadata.geometry.scale must be a param name or null")
                elif scale not in properties:
                    problem(f"metadata.geometry.scale param {scale!r} is not a declared param")
            full_frame = geometry.get("full_frame")
            if full_frame is not None and not isinstance(full_frame, bool):
                problem("metadata.geometry.full_frame must be true or false")

    presets = metadata.get("presets")
    if presets is not None:
        if not isinstance(presets, Mapping):
            problem("metadata.presets must be an object of preset name -> params")
        else:
            for preset_name, params in presets.items():
                if not isinstance(params, Mapping):
                    problem(f"metadata.presets.{preset_name} must be an object of params")
                    continue
                for key in params:
                    if key not in properties:
                        problem(f"metadata.presets.{preset_name} param {key!r} is not a declared param")

    reserved = _reserved_names()
    for name, spec in properties.items():
        if name in reserved and not (isinstance(spec, Mapping) and spec.get("deprecated") is True):
            problem(
                f"param {name!r} is a universal clip field (clip_fields.yaml); "
                "set it on the clip, or mark the param deprecated: true"
            )

    return problems


def raise_on_problems(definition: Any, *, error_cls: type[Exception] = ValueError) -> None:
    """Raise ``error_cls`` with every metadata problem, one line each, when there are any."""
    problems = check_element_metadata(definition)
    if problems:
        raise error_cls("\n".join(problems))
