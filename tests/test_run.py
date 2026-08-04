import json
import re
from datetime import datetime, timezone

import pytest
import requests

from pipeline import config
from pipeline.config import BUNDESLAENDER, sweep_areas
from pipeline.run import run_pipeline

NOW = datetime(2026, 7, 26, 3, 0, tzinfo=timezone.utc)

# The default sweep: 16 Bundesländer at admin_level=4, then Denmark whole at
# admin_level=2.
SWEEP = [(name, "4") for name in BUNDESLAENDER] + [("Danmark", "2")]


def _fake_overpass(load_fixture):
    """Answers every sweep area with the same fixtures — dedup_elements must
    collapse the 17 identical copies back to one, which is exactly what the
    totals in the tests assert. Records the (area, admin_level) pairs queried."""
    areas_seen = []

    def fetch(ql, **kwargs):
        m = re.search(r'area\["name"="([^"]+)"\]\["admin_level"="(\d+)"\]', ql)
        assert m, f"no area clause in {ql!r}"
        areas_seen.append((m.group(1), m.group(2)))
        if '"changing_table"' in ql:
            return load_fixture("overpass_changing_tables.json")
        assert '"amenity"="toilets"' in ql
        return load_fixture("overpass_toilets.json")
    fetch.areas_seen = areas_seen
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
    fake_overpass = _fake_overpass(load_fixture)
    summary = run_pipeline(
        geojson_path=str(geojson), stats_path=str(stats),
        overpass_fetch=fake_overpass,
        taginfo_fetch=_fake_taginfo(load_fixture), now=NOW,
    )
    # Every element appears once in each of the 17 area sweeps; dedup by
    # (type, id) must collapse the totals back to a single fixture's worth.
    assert summary == {"features": 7, "ct_objects": 9, "toilets_total": 3,
                       "global_source": "taginfo"}
    assert fake_overpass.areas_seen == [a for a in SWEEP for _ in (1, 2)]

    fc = json.loads(geojson.read_text(encoding="utf-8"))
    assert fc["type"] == "FeatureCollection"
    assert len(fc["features"]) == 7

    payload = json.loads(stats.read_text(encoding="utf-8"))
    assert payload["generated_at"] == "2026-07-26T03:00:00+00:00"
    assert payload["area_name"] == "Deutschland & Danmark"
    assert payload["area_key"] == "de_dk"  # frontend translates this per language
    assert payload["local"]["ct_yes"] == 6
    assert payload["local"]["capacity_tagged_toilets"] == 1
    assert payload["global"]["ct_total"] == 77287
    assert payload["global"]["source"] == "taginfo"


def test_single_area_build_keeps_its_own_name(tmp_path, load_fixture):
    stats = tmp_path / "stats.json"
    run_pipeline(
        geojson_path=str(tmp_path / "ct.geojson"), stats_path=str(stats),
        areas=[("Hamburg", "4")], display_area="Hamburg",
        overpass_fetch=_fake_overpass(load_fixture),
        taginfo_fetch=_fake_taginfo(load_fixture), now=NOW,
    )
    payload = json.loads(stats.read_text(encoding="utf-8"))
    assert payload["area_name"] == "Hamburg"
    # A hand-named area has no translation, so the frontend must print the
    # name as given rather than look up a key that doesn't exist.
    assert payload["area_key"] is None


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
                     taginfo_fetch=_fake_taginfo(load_fixture), now=NOW,
                     sweep_rounds=2, sweep_pause_s=0)
    # old files survive untouched
    assert json.loads(geojson.read_text(encoding="utf-8"))["features"] == [{"good": True}]
    assert json.loads(stats.read_text(encoding="utf-8"))["local"]["ct_objects"] == 9


def test_failed_area_is_retried_in_a_later_round(tmp_path, load_fixture):
    # A congested spell kills one Land on every mirror mid-sweep; the sweep
    # must finish the others and pick the failed one up next round instead of
    # aborting the build.
    inner = _fake_overpass(load_fixture)
    fail_next = {"Bayern"}

    def flaky(ql, **kwargs):
        if any(f'"{name}"' in ql for name in fail_next):
            fail_next.clear()
            raise requests.ConnectionError("mirror cascade exhausted")
        return inner(ql, **kwargs)

    summary = run_pipeline(
        geojson_path=str(tmp_path / "ct.geojson"),
        stats_path=str(tmp_path / "stats.json"),
        overpass_fetch=flaky, taginfo_fetch=_fake_taginfo(load_fixture),
        now=NOW, sweep_pause_s=0)
    assert summary["features"] == 7  # nothing lost, Bayern landed on round 2
    # failed ct, then both queries
    assert inner.areas_seen.count(("Bayern", "4")) == 2


def test_sweep_aborts_when_an_area_fails_every_round(tmp_path, load_fixture):
    def always_down(ql, **kwargs):
        if '"Saarland"' in ql:
            raise requests.ConnectionError("still dead")
        return _fake_overpass(load_fixture)(ql, **kwargs)

    with pytest.raises(RuntimeError, match="Saarland.*after 3 rounds"):
        run_pipeline(geojson_path=str(tmp_path / "ct.geojson"),
                     stats_path=str(tmp_path / "stats.json"),
                     overpass_fetch=always_down,
                     taginfo_fetch=_fake_taginfo(load_fixture),
                     now=NOW, sweep_rounds=3, sweep_pause_s=0)
    assert not (tmp_path / "ct.geojson").exists()  # nothing half-written


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


def test_denmark_sweeps_whole_at_country_level():
    # Denmark answers in one query (933 changing_table + 4,655 toilet objects,
    # 14.5 s measured), so it must sweep as a single admin_level=2 area — not
    # chunked like Germany, and not at Germany's admin_level=4.
    areas = sweep_areas()
    assert ("Danmark", "2") in areas
    assert areas == SWEEP


def test_country_subset_builds_only_that_country(monkeypatch):
    monkeypatch.setattr(config, "SWEEP_COUNTRIES", ("dk",))
    assert config.sweep_areas() == [("Danmark", "2")]
    assert config.display_area() == ("Danmark", "dk")


def test_unknown_country_code_fails_the_build(monkeypatch):
    # Silently sweeping fewer areas would overwrite the live dataset with a
    # partial one — a typo has to abort instead.
    monkeypatch.setattr(config, "SWEEP_COUNTRIES", ("de", "dl"))
    with pytest.raises(ValueError, match="dl"):
        config.sweep_areas()


def test_hand_named_area_has_no_translation_key(monkeypatch):
    monkeypatch.setattr(config, "DISPLAY_AREA_OVERRIDE", "Hamburg")
    assert config.display_area() == ("Hamburg", None)
