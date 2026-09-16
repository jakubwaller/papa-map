from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

import pytest

from pipeline import config, tiles


def test_every_leaderboard_city_has_a_box_and_no_more():
    names = {c[0] for cities in config.CITY_AREAS_BY_COUNTRY.values() for c in cities}
    assert {c[1] for c in tiles.CITIES} == names


def test_slugs_are_unique_ascii_and_url_safe():
    slugs = tiles.slugs()
    assert len(set(slugs)) == len(slugs)
    for s in slugs:
        assert s.isascii() and s == s.lower()
        assert all(ch.isalnum() or ch == "-" for ch in s), s


def test_boxes_are_cities_not_regions():
    # A box wider than about 1.1° of longitude or 0.7° of latitude is a Land or
    # a county, and the extract would be hundreds of megabytes.
    for slug, _name, _cc, (w, s, e, n) in tiles.CITIES:
        assert w < e and s < n, slug
        assert e - w <= 1.1 and n - s <= 0.7, (slug, e - w, n - s)
        assert -180 <= w and e <= 180 and -90 <= s and n <= 90, slug


def test_country_codes_match_config():
    by_cc = {c[1]: c[2] for c in tiles.CITIES}
    for cc, cities in config.CITY_AREAS_BY_COUNTRY.items():
        for display, _area, _level in cities:
            assert by_cc[display] == cc, display


def test_extract_command_shape(tmp_path):
    cmd = tiles.extract_command("20260915", "hamburg", (9.72, 53.38, 10.34, 53.75), tmp_path)
    assert cmd[0] == tiles.PMTILES_BIN and cmd[1] == "extract"
    assert cmd[2] == "https://build.protomaps.com/20260915.pmtiles"
    assert cmd[3] == str(tmp_path / "hamburg.pmtiles")
    assert "--bbox=9.72,53.38,10.34,53.75" in cmd
    assert f"--maxzoom={tiles.MAXZOOM}" in cmd


def test_latest_build_walks_back_from_yesterday():
    asked = []
    def probe(url):
        asked.append(url)
        return url.endswith("20260913.pmtiles")
    assert tiles.latest_build(dt.date(2026, 9, 16), probe) == "20260913"
    assert asked == [f"https://build.protomaps.com/2026091{d}.pmtiles" for d in (5, 4, 3)]


def test_latest_build_gives_up_after_a_week():
    with pytest.raises(RuntimeError):
        tiles.latest_build(dt.date(2026, 9, 16), lambda _url: False)


def test_catalogue_lists_only_files_that_exist(tmp_path):
    (tmp_path / "hamburg.pmtiles").write_bytes(b"x" * 1234)
    idx = tiles.catalogue(tmp_path, "20260915", generated="2026-09-16T12:00:00+00:00")
    assert idx["build"] == "20260915"
    assert [c["slug"] for c in idx["cities"]] == ["hamburg"]
    c = idx["cities"][0]
    assert c["name"] == "Hamburg" and c["cc"] == "de" and c["bytes"] == 1234
    assert c["bbox"] == [9.72, 53.38, 10.34, 53.75] and c["maxzoom"] == tiles.MAXZOOM
    json.dumps(idx)   # serialisable as is


def test_run_writes_index_even_when_the_extract_fails(tmp_path, monkeypatch):
    monkeypatch.setattr(tiles, "PMTILES_BIN", str(Path("/nonexistent/pmtiles")))
    def boom(*_a, **_k):
        raise tiles.subprocess.CalledProcessError(1, "pmtiles")
    monkeypatch.setattr(tiles.subprocess, "run", boom)
    idx = tiles.run(tmp_path, only=["hamburg"], build="20260915")
    assert idx["cities"] == []
    assert json.loads((tmp_path / "index.json").read_text())["build"] == "20260915"
    assert not list(tmp_path.glob("*.tmp"))
