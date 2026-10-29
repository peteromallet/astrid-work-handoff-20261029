"""visualize --out DIR exports the settled view; it used to be refused outright."""
from pathlib import Path

from astrid.packs.timeline.cli import _export_visualization


def test_out_copies_pages_and_raw_frames(tmp_path: Path) -> None:
    view = tmp_path / "cache" / "abc"
    (view / "frames").mkdir(parents=True)
    page = view / "view-frame-94.60-94.63.png"
    page.write_bytes(b"page")
    (view / "frames" / "frame-000002838.png").write_bytes(b"frame")
    (view / "frame-index.json").write_text("{}")
    out = tmp_path / "export"

    exported = _export_visualization({"primary_page": str(page), "pages": [str(page)]}, str(out))

    assert exported["pages"] == [str(out / page.name)]
    assert exported["frames"] == [str(out / "frames" / "frame-000002838.png")]
    assert (out / "frame-index.json").is_file()
    assert page.is_file()  # the managed copy stays
