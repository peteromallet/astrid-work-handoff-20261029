from types import SimpleNamespace

import pytest

from astrid.packs.capture.actions.web_page import run as web_page


def test_windows_capture_refuses_before_admission_browser_or_output_preparation(tmp_path, monkeypatch):
    monkeypatch.setattr(web_page, "sys", SimpleNamespace(platform="win32"))

    def unavailable(*args, **kwargs):
        pytest.fail("unsupported capture reached browser preparation")

    monkeypatch.setattr(web_page, "_require_host_admission", unavailable)
    monkeypatch.setattr(web_page, "find_chrome", unavailable)
    monkeypatch.setattr(web_page.tempfile, "mkdtemp", unavailable)
    monkeypatch.setattr(web_page, "_launch", unavailable)
    destination = tmp_path / "outputs"
    with pytest.raises(web_page.AstridError, match="Browser capture is not available on Windows yet[.]"):
        web_page.capture(url="https://example.com/", out_dir=destination)
    assert not destination.exists()
