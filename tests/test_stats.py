import json

import pytest
import requests

from pipeline import config, osm, stats


def test_local_stats_counts_every_bucket(load_fixture):
    local = stats.local_stats(load_fixture("overpass_changing_tables.json"),
                              {"total": 3, "capacity_tagged": 1})
    assert local == {
        "toilets_total": 3, "ct_objects": 9,
        # junk "02" is in ct_objects but in none of the value buckets
        "ct_yes": 6, "ct_no": 1, "ct_limited": 1,
        "yes_location_known": 5, "yes_location_unknown": 1,
        "accessible": 3, "female_only": 2, "unknown": 2,
        "centralkey_locked": 0,
        # One fixture pin carries kids_area=yes; no play half was passed in,
        # which is the single-argument caller's honest zero.
        "play_tables": 1, "play_places": 0,
        "capacity_tagged_toilets": 1,
    }


def test_local_stats_separates_play_pins_from_play_prospects(load_fixture):
    # The two play numbers answer different questions and must never be added
    # up: play_tables counts pins that also have a corner to play in,
    # play_places counts places with a corner and no changing-table answer at
    # all. The coordless prospect is skipped, exactly like a coordless pin.
    # play_data is the sweep's already-split half, as run.py hands it over.
    _, play = osm.split_sweep(load_fixture("overpass_play_places.json")["elements"])
    local = stats.local_stats(load_fixture("overpass_changing_tables.json"),
                              {"total": 3, "capacity_tagged": 1},
                              {"elements": play})
    assert local["play_tables"] == 1
    # 5 fixture objects: one is outdoors, one has no coordinates.
    assert local["play_places"] == 3


def test_local_stats_empty_responses():
    assert stats.local_stats({}, {})["ct_objects"] == 0
    assert stats.local_stats({}, {})["toilets_total"] == 0


def test_local_stats_skips_coordless_elements_like_build_features(load_fixture):
    # A yes-element without usable coordinates never becomes a pin
    # (export.build_features drops it), so the feature-facing counters must
    # not see it either — otherwise the strip disagrees with the map.
    ct = load_fixture("overpass_changing_tables.json")
    ct["elements"].append({"type": "way", "id": 99, "tags": {
        "changing_table": "yes", "changing_table:location": "male_toilet"}})
    local = stats.local_stats(ct, {"total": 3, "capacity_tagged": 1})
    assert local["ct_objects"] == 10  # still counted as a tagged object
    assert local["ct_yes"] == 6  # but not as a feature-facing yes
    assert local["yes_location_known"] == 5
    assert local["accessible"] == 3


def test_local_stats_counts_centralkey_locked_drops(load_fixture):
    # Key-locked objects leave every feature-facing counter (the map drops
    # them too) and land in centralkey_locked instead.
    ct = load_fixture("overpass_changing_tables.json")
    ct["elements"].append({"type": "node", "id": 50, "lat": 53.55, "lon": 10.0,
                           "tags": {"changing_table": "yes",
                                    "changing_table:location": "wheelchair_toilet",
                                    "centralkey": "eurokey"}})
    # Same key, but scoped to the accessible cubicle of a block with open
    # sections: stays a pin, and a grey one until someone names the room.
    ct["elements"].append({"type": "node", "id": 51, "lat": 53.56, "lon": 10.1,
                           "tags": {"changing_table": "yes", "centralkey": "nks",
                                    "male": "yes", "female": "yes",
                                    "wheelchair:access": "centralkey"}})
    local = stats.local_stats(ct, {"total": 3, "capacity_tagged": 1})
    assert local["ct_objects"] == 11  # both still tagged objects
    assert local["centralkey_locked"] == 1  # only the cubicle-bound one
    assert local["ct_yes"] == 7
    assert local["accessible"] == 3  # the room doesn't matter behind the lock
    assert local["unknown"] == 3  # the scoped one is a grey pin


def _taginfo_fetch(load_fixture):
    def fetch(url):
        if "key/stats" in url:
            return load_fixture("taginfo_key_stats.json")
        return load_fixture("taginfo_location_values.json")
    return fetch


def test_global_stats_exact_vs_any_token_counts(load_fixture):
    g = stats.global_stats(fetch=_taginfo_fetch(load_fixture))
    assert g == {
        "ct_total": 77287,
        "location_total": 3100,  # sum over all values incl. free text
        "location_female_only": 485,  # exactly "female_toilet" — combos excluded
        "location_male_only": 71,  # exactly "male_toilet"
        "location_male_any": 110,  # 71 + the two ;-combos containing male_toilet
        # both tokens present, either order — the "tagged in both rooms" figure
        # the methods pages quote. 30 + 9, and NOT the bare male_toilet 71.
        "location_male_and_female": 39,
        "source": "taginfo",
        "data_until": "2026-07-25T00:00:00Z",
    }


def test_global_stats_follows_taginfo_pagination(load_fixture):
    # >999 distinct values (free text creeps in) spill onto page 2 — the
    # response's `total` says how many distinct values exist in all.
    page1 = load_fixture("taginfo_location_values.json")
    page1["total"] = 8  # two more distinct values than page 1 carries
    page2 = {"data": [{"value": "male_toilet;room", "count": 4},
                      {"value": "somewhere", "count": 1}]}

    def fetch(url):
        if "key/stats" in url:
            return load_fixture("taginfo_key_stats.json")
        if "page=1" in url:
            return page1
        assert "page=2" in url
        return page2

    g = stats.global_stats(fetch=fetch)
    assert g["location_total"] == 3105  # 3100 from page 1 + 5 from page 2
    assert g["location_male_any"] == 114  # 110 + the page-2 combo
    assert g["location_female_only"] == 485  # exact counts unchanged
    # "male_toilet;room" carries no female token, so both-rooms is untouched
    assert g["location_male_and_female"] == 39


def test_global_stats_warns_when_pagination_stalls(load_fixture, capsys):
    # `total` promises more values than the API delivers — undercount must be
    # visible, not silent (and must not loop forever).
    page1 = load_fixture("taginfo_location_values.json")
    page1["total"] = 5000

    def fetch(url):
        if "key/stats" in url:
            return load_fixture("taginfo_key_stats.json")
        if "page=1" in url:
            return page1
        return {"data": []}

    g = stats.global_stats(fetch=fetch)
    assert g["location_total"] == 3100  # page 1 only
    assert "WARN" in capsys.readouterr().err


def test_global_stats_propagates_upstream_failure():
    def down(url):
        raise requests.ConnectionError("taginfo down")
    with pytest.raises(requests.ConnectionError):
        stats.global_stats(fetch=down)


def test_previous_global_reads_last_stats_file(tmp_path):
    path = tmp_path / "stats.json"
    path.write_text(json.dumps({"global": {"ct_total": 1, "source": "taginfo"}}),
                    encoding="utf-8")
    assert stats.previous_global(str(path)) == {"ct_total": 1, "source": "taginfo"}


def test_previous_global_missing_or_corrupt_file_is_none(tmp_path):
    assert stats.previous_global(str(tmp_path / "nope.json")) is None
    bad = tmp_path / "bad.json"
    bad.write_text("{half a fi", encoding="utf-8")
    assert stats.previous_global(str(bad)) is None


def test_fetch_taginfo_sends_identifying_user_agent(monkeypatch):
    calls = []

    def get(url, headers=None, timeout=None):
        calls.append(headers)
        r = requests.Response()
        r.status_code = 200
        r._content = b'{"data": []}'
        return r

    monkeypatch.setattr(stats.requests, "get", get)
    assert stats.fetch_taginfo(config.TAGINFO_STATS_URL) == {"data": []}
    assert calls[0]["User-Agent"].startswith("papa-map/0.1")
