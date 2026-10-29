"""Content identity for asset registry entries.

Two registry entries describe the same media when they name the same content,
whatever else each carries.  Identity fields are ``media_id``, ``content_sha256``
(an optional ``sha256:`` prefix is dropped and the digest lower-cased, so bare
and prefixed digests agree) and ``file`` for legacy entries.  Two entries are
the same media when they share at least one identity field and every identity
field both carry is equal.  Render-affecting values such as duration are not
compared, since two writers may disagree on precision.  Decoration
such as ``thumbnailUrl``, ``url``, ``url_expires_at``, ``etag``, ``handle``,
``source``, ``pixel_provenance`` or filenames never makes two entries
different.  Entries that share no identity field can only be compared by full
equality.

Render, inspection and (in a later wave) publish share this one rule.
"""

from __future__ import annotations

from collections.abc import Mapping

_SHA_PREFIX = "sha256:"
_KINDS = ("media_id", "content_sha256", "file")


def _text(value):
    return value.strip() if isinstance(value, str) and value.strip() else None


def _identity_fields(entry):
    """The identity fields an entry carries, normalised: ``{kind: value}``."""
    if not isinstance(entry, Mapping):
        return {}
    fields = {}
    media_id = _text(entry.get("media_id"))
    if media_id:
        fields["media_id"] = media_id
    digest = _text(entry.get("content_sha256"))
    if digest:
        if digest.lower().startswith(_SHA_PREFIX):
            digest = digest[len(_SHA_PREFIX):]
        fields["content_sha256"] = digest.lower()
    file = _text(entry.get("file"))
    if file:
        fields["file"] = file
    return fields


def asset_identity(entry):
    """Return the strongest ``(kind, value)`` identity of a registry entry, or None."""
    fields = _identity_fields(entry)
    return next(((kind, fields[kind]) for kind in _KINDS if kind in fields), None)


def same_asset_identity(a, b):
    """Return True when two registry entries name the same media.

    They are the same media when they share at least one identity field and
    every identity field both carry is equal.  A field only one side carries
    never counts against them.  Entries that share no identity field can only
    be compared by full equality.
    """
    identity_a, identity_b = _identity_fields(a), _identity_fields(b)
    shared = identity_a.keys() & identity_b.keys()
    if not shared:
        return a == b
    return all(identity_a[kind] == identity_b[kind] for kind in shared)
