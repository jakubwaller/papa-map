import json
from datetime import datetime, timezone

import pytest
import requests

from pipeline.run import run_pipeline

NOW = datetime(2026, 7, 26, 3, 0, tzinfo=timezone.utc)


def _fake_overpass(load_fixture):
    def fetch(ql, **kwargs):
        assert 'area["name"="Hamburg"]["admin_level"="4"]' in ql
        if '"changing_table"' in ql:
            return load_fixture("overpass_changing_tables.json")
        assert '"amenity"="toilets"' in ql
        return load_fixture("overpass_toilets.json")
    return fetch


def _fake_taginfo(load_fixture):
    def fetch(url):
        if "key/stats" in url:
            return load_fixture("taginfo_key_stats.json")
        return load_fixture("taginfo_location_values.json")
    return fetch


def _taginfo_down(url):
    raise requests.ConnectionError("taginfo down")


def test_run_writes_both_files(tmp_path, load_fixture):
    geojson = tmp_path / "changing_tables.geojson"
    stats = tmp_path / "stats.json"
    summary = run_pipeline(
        geojson_path=str(geojson), stats_path=str(stats),
        overpass_fetch=_fake_overpass(load_fixture),
        taginfo_fetch=_fake_taginfo(load_fixture), now=NOW,
    )
    assert summary == {"features": 7, "ct_objects": 9, "toilets_total": 3,
                       "global_source": "taginfo"}

    fc = json.loads(geojson.read_text(encoding="utf-8"))
    assert fc["type"] == "FeatureCollection"
    assert len(fc["features"]) == 7

    payload = json.loads(stats.read_text(encoding="utf-8"))
    assert payload["generated_at"] == "2026-07-26T03:00:00+00:00"
    assert payload["area_name"] == "Hamburg"
    assert payload["local"]["ct_yes"] == 6
    assert payload["local"]["capacity_tagged_toilets"] == 1
    assert payload["global"]["ct_total"] == 77287
    assert payload["global"]["source"] == "taginfo"


def test_run_is_idempotent(tmp_path, load_fixture):
    kwargs = dict(geojson_path=str(tmp_path / "ct.geojson"),
                  stats_path=str(tmp_path / "stats.json"),
                  overpass_fetch=_fake_overpass(load_fixture),
                  taginfo_fetch=_fake_taginfo(load_fixture), now=NOW)
    assert run_pipeline(**kwargs) == run_pipeline(**kwargs)


def test_taginfo_down_keeps_previous_global_block(tmp_path, load_fixture, capsys):
    stats = tmp_path / "stats.json"
    old_global = {"ct_total": 70000, "source": "taginfo", "data_until": "2026-07-01"}
    stats.write_text(json.dumps({"generated_at": "old", "global": old_global}),
                     encoding="utf-8")
    summary = run_pipeline(
        geojson_path=str(tmp_path / "ct.geojson"), stats_path=str(stats),
        overpass_fetch=_fake_overpass(load_fixture),
        taginfo_fetch=_taginfo_down, now=NOW,
    )
    assert summary["global_source"] == "previous"
    assert "WARN" in capsys.readouterr().err
    payload = json.loads(stats.read_text(encoding="utf-8"))
    assert payload["global"] == old_global  # stale global kept
    assert payload["generated_at"] == "2026-07-26T03:00:00+00:00"  # local still fresh
    assert payload["local"]["ct_objects"] == 9


def test_zero_object_area_refuses_to_overwrite(tmp_path, load_fixture):
    # A stale fallback mirror (or typo'd area name) answers HTTP 200 with no
    # elements — that must never wipe the served dataset.
    geojson = tmp_path / "ct.geojson"
    stats = tmp_path / "stats.json"
    geojson.write_text('{"type": "FeatureCollection", "features": [{"good": true}]}',
                       encoding="utf-8")
    stats.write_text('{"local": {"ct_objects": 9}}', encoding="utf-8")

    def empty_overpass(ql, **kwargs):
        return {"elements": []}

    with pytest.raises(RuntimeError, match="zero objects"):
        run_pipeline(geojson_path=str(geojson), stats_path=str(stats),
                     overpass_fetch=empty_overpass,
                     taginfo_fetch=_fake_taginfo(load_fixture), now=NOW)
    # old files survive untouched
    assert json.loads(geojson.read_text(encoding="utf-8"))["features"] == [{"good": True}]
    assert json.loads(stats.read_text(encoding="utf-8"))["local"]["ct_objects"] == 9


def test_taginfo_down_with_no_previous_stats_degrades_to_null(tmp_path, load_fixture, capsys):
    stats = tmp_path / "stats.json"
    summary = run_pipeline(
        geojson_path=str(tmp_path / "ct.geojson"), stats_path=str(stats),
        overpass_fetch=_fake_overpass(load_fixture),
        taginfo_fetch=_taginfo_down, now=NOW,
    )
    assert summary["global_source"] is None
    assert "WARN" in capsys.readouterr().err
    assert json.loads(stats.read_text(encoding="utf-8"))["global"] is None
