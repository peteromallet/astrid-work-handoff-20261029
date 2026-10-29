from __future__ import annotations

from astrid.packs.timeline import cli as timeline_cli
from astrid.packs.timeline import cli_find


def test_find_verb_registered_and_a_miss_suggests_nearest_phrases(monkeypatch, capsys) -> None:
    parser = timeline_cli.build_parser(object())
    parsed = parser.parse_args(["find", "--project", "p1", "main", "all the tools"])
    assert parsed.handler is cli_find.run_find

    class Hit:
        line, start, end, phrase = "n20e", 12.0, 13.5, "These were all tools I needed"

    monkeypatch.setattr("astrid.sdk.timeline_checkout.find_draft", lambda *a, **k: "draft.json")
    monkeypatch.setattr("astrid.sdk.timeline_checkout.Checkout.load", classmethod(lambda cls, path: object()))
    monkeypatch.setattr("astrid.sdk.timeline_address.find", lambda *a, **k: [])
    monkeypatch.setattr("astrid.sdk.timeline_address.suggest_spoken", lambda tl, q: [Hit()])

    assert parsed.handler(parsed) == 1
    err = capsys.readouterr().err
    assert "Nearest spoken phrases" in err and "n20e" in err
    assert "timelines find --project p1 main" in err
