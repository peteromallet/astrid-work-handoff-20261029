"""Public timeline transfer facade; import helpers are loaded lazily."""
from __future__ import annotations

from typing import Any

from .timeline_export import export_plan, export_timeline, inventory_elements

__all__ = ["export_plan", "export_timeline", "import_timeline", "inventory_elements", "check_import_manifest", "prepare_import"]


def check_import_manifest(manifest: Any, *, elements: Any = None) -> Any:
    from .timeline_import_prepare import check_import_manifest as implementation
    return implementation(manifest, elements=elements)


def prepare_import(timeline: Any, manifest: Any, transcripts: Any, project: str, name: str | None = None, *, timeline_id: str | None = None, elements: Any = None) -> Any:
    from .timeline_import_prepare import prepare_import as implementation
    return implementation(timeline, manifest, transcripts, project, name=name, timeline_id=timeline_id, elements=elements)


def import_timeline(client: Any, path: Any, project: str | None = None, name: str | None = None) -> Any:
    from .timeline_import import import_timeline as implementation
    return implementation(client, path, project, name=name)
