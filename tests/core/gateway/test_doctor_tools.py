"""Doctor exposes only the selected media tool fields from installation state."""

import json
import zipfile

from astrid.core.gateway import doctor_bundle
from astrid.installer.core import Version, switch, write_json


def test_doctor_bundle_reports_recorded_media_selection_without_other_environment(tmp_path, monkeypatch):
    program = tmp_path / "program"
    version_root = program / "versions" / "v1"
    version_root.mkdir(parents=True)
    environment = {
        "ASTRID_FFMPEG_EXECUTABLE": "/opt/media/ffmpeg",
        "ASTRID_FFPROBE_EXECUTABLE": "/opt/media/probe/ffprobe",
        "ASTRID_INSTALL_FFMPEG_SOURCE": "path",
        "ASTRID_INSTALL_FFMPEG_VERSION": "6.1.2-system",
        "ASTRID_INSTALL_FFPROBE_VERSION": "6.1.2-system",
        "OPENAI_API_KEY": "must-not-export",
        "UNRELATED_SETTING": "private-environment",
    }
    version = Version(version_root, version_root / "py" / "bin" / "python", version_root / "profile.json", environment)
    write_json(version_root / "version.json", version.document())
    write_json(version_root / "manifest.json", {
        "schema_version": 1, "agent": {"sha": "a" * 40}, "runtime": {"sha": "b" * 40},
        "tools": {"ffmpeg": {"version": "7.0.2", "assets": {"private": "must-not-export-assets"}}},
    })
    switch(program, version)
    monkeypatch.setattr(doctor_bundle, "_installed_record", lambda: (program, version_root / "manifest.json"))
    monkeypatch.setattr(doctor_bundle, "_logs", lambda *_args: [])

    bundle = doctor_bundle.write_bundle(tmp_path / "doctor.zip", {"ok": True}, tmp_path / "support")

    with zipfile.ZipFile(bundle) as archive:
        metadata = json.loads(archive.read("install-manifest.json"))
        all_text = "\n".join(archive.read(name).decode() for name in archive.namelist())
    assert metadata["tools"]["ffmpeg"] == {"version": "7.0.2"}
    assert metadata["selected_tools"] == {
        "ffmpeg": {"executable": "/opt/media/ffmpeg", "version": "6.1.2-system", "source": "path"},
        "ffprobe": {"executable": "/opt/media/probe/ffprobe", "version": "6.1.2-system", "source": "path"},
    }
    for secret in ("must-not-export", "private-environment", "must-not-export-assets", "OPENAI_API_KEY"):
        assert secret not in all_text
