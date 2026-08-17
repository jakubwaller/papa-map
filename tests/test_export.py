import json

import pytest

from pipeline import export
from pipeline.export import (build_features, build_play_features,
                             export_geojson, write_json_atomic)


def test_build_features_keeps_only_yes_and_limited(load_fixture):
    feats = build_features(load_fixture("overpass_changing_tables.json"))
    ids = [f["properties"]["osm_id"] for f in feats]
    # 5 (changing_table=no) and 6 (junk "02") are stats-only, never features
    assert ids == [1, 2, 3, 4, 7, 8, 9]
    statuses = {f["properties"]["osm_id"]: f["properties"]["status"] for f in feats}
    assert statuses == {1: "accessible", 2: "female_only", 3: "unknown",
                        4: "accessible", 7: "unknown", 8: "accessible",
                        9: "female_only"}


def test_centralkey_locked_element_never_becomes_a_pin(load_fixture):
    ct = load_fixture("overpass_changing_tables.json")
    ct["elements"].append({"type": "node", "id": 50, "lat": 53.55, "lon": 10.0,
                           "tags": {"changing_table": "yes",
                                    "changing_table:location": "wheelchair_toilet",
                                    "centralkey": "eurokey"}})
    ids = [f["properties"]["osm_id"] for f in build_features(ct)]
    assert 50 not in ids


def test_way_and_relation_use_center_geometry(load_fixture):
    feats = {f["properties"]["osm_id"]: f
             for f in build_features(load_fixture("overpass_changing_tables.json"))}
    assert feats[3]["properties"]["osm_type"] == "way"
    assert feats[3]["geometry"]["coordinates"] == [9.9633, 53.5637]  # lon, lat
    assert feats[8]["properties"]["osm_type"] == "relation"
    assert feats[8]["geometry"]["coordinates"] == [10.0010, 53.5580]


def test_feature_properties_match_data_contract(load_fixture):
    feats = {f["properties"]["osm_id"]: f["properties"]
             for f in build_features(load_fixture("overpass_changing_tables.json"))}
    assert feats[1] == {
        "osm_type": "node", "osm_id": 1, "name": "Hauptbahnhof WC",
        "amenity": "toilets", "changing_table": "yes",
        "location_raw": "male_toilet", "status": "accessible",
        "play": False,
        "fee": "yes", "opening_hours": "24/7",
        "osm_url": "https://www.openstreetmap.org/node/1",
        "mapcomplete_url": ("https://mapcomplete.org/theme.html?userlayout="
                            "https://raw.githubusercontent.com/jakubwaller/papa-map/"
                            "main/theme/papamap.theme.json"
                            "&z=18&lat=53.5528&lon=10.0065#node/1"),
    }
    assert feats[2]["name"] is None
    assert feats[3]["location_raw"] is None
    assert feats[4]["fee"] == "no"  # changing_table:fee wins over fee=yes
    assert feats[7]["location_raw"] == "hinten im Flur beim Personalraum"


def test_play_area_is_a_property_not_a_status(load_fixture):
    feats = {f["properties"]["osm_id"]: f["properties"]
             for f in build_features(load_fixture("overpass_changing_tables.json"))}
    assert feats[3]["play"] is True    # cafe with kids_area=yes
    assert feats[7]["play"] is False   # restaurant with kids_area=no
    assert feats[1]["play"] is False   # no kids_area tag at all
    # the badge never moves a pin's color
    assert feats[3]["status"] == "unknown"


def test_play_area_recognizes_all_three_tagging_patterns():
    def play(tags):
        tags = {"changing_table": "yes", **tags}
        el = {"type": "node", "id": 1, "lat": 53.5, "lon": 10.0, "tags": tags}
        return build_features({"elements": [el]})[0]["properties"]["play"]

    assert play({"kids_area": "yes"}) is True
    assert play({"kids_area": "indoor"}) is True
    assert play({"kids_area": "designated"}) is True
    assert play({"kids_area:indoor": "yes"}) is True       # the wiki's own form
    assert play({"kids_area:indoor": "designated"}) is True
    assert play({"leisure": "indoor_play"}) is True
    assert play({"leisure": "playground", "indoor": "yes"}) is True
    # an outdoor sandpit is not the promise the badge makes
    assert play({"kids_area": "outdoor"}) is False
    assert play({"kids_area": "no"}) is False
    assert play({"kids_area": "limited"}) is False         # "toys, but no area"
    assert play({"kids_area:indoor": "no"}) is False
    # explicit beats ambiguous: kids_area=yes doesn't say indoor, :indoor=no does
    assert play({"kids_area": "yes", "kids_area:indoor": "no"}) is False
    assert play({"kids_area": "yes", "kids_area:outdoor": "yes"}) is True
    assert play({"kids_area": "no", "kids_area:indoor": "yes"}) is True
    # a plain outdoor playground stays out, indoor= is what makes it count
    assert play({"leisure": "playground"}) is False
    assert play({"leisure": "playground", "indoor": "no"}) is False
    assert play({}) is False
    # case and whitespace are the mapper's, not ours
    assert play({"kids_area": " Yes "}) is True


def test_play_features_are_their_own_dataset(load_fixture):
    # These carry no status and no changing_table field at all: nobody has
    # answered the first question, so there is nothing to color them by.
    feats = build_play_features(load_fixture("overpass_play_places.json"))
    assert [f["properties"]["osm_id"] for f in feats] == [9001, 9002, 9003]
    assert feats[0]["properties"] == {
        "osm_type": "node", "osm_id": 9001, "name": "Café Bauklotz",
        "kind": "cafe", "opening_hours": "Mo-Fr 09:00-18:00",
        "osm_url": "https://www.openstreetmap.org/node/9001",
        "mapcomplete_url": ("https://mapcomplete.org/theme.html?userlayout="
                            "https://raw.githubusercontent.com/jakubwaller/papa-map/"
                            "main/theme/papamap.theme.json"
                            "&z=18&lat=53.5545&lon=9.9925#node/9001"),
    }
    for f in feats:
        assert "status" not in f["properties"]
        assert "changing_table" not in f["properties"]


def test_play_feature_kind_takes_the_most_specific_tag(load_fixture):
    feats = {f["properties"]["osm_id"]: f["properties"]
             for f in build_play_features(load_fixture("overpass_play_places.json"))}
    # leisure beats the shop tag on the same object — "indoor_play" says what
    # the place is, "toys" says what it also sells.
    assert feats[9002]["kind"] == "indoor_play"
    assert feats[9002]["osm_type"] == "way"   # via out center
    assert feats[9003]["name"] is None        # unnamed indoor playground
    assert feats[9003]["opening_hours"] is None


def test_play_feature_without_coordinates_is_dropped(load_fixture):
    # Same rule as the pins: a relation Overpass gave no center to cannot be
    # drawn, so it must not be counted as if it could.
    ids = [f["properties"]["osm_id"]
           for f in build_play_features(load_fixture("overpass_play_places.json"))]
    assert 9005 not in ids


def test_mapcomplete_url_always_uses_own_theme(load_fixture):
    # theme=papamap in the changeset is what makes website edits countable,
    # so toilets get the userlayout theme too — never the official one
    feats = {f["properties"]["osm_id"]: f["properties"]
             for f in build_features(load_fixture("overpass_changing_tables.json"))}
    theme = ("https://mapcomplete.org/theme.html?userlayout="
             "https://raw.githubusercontent.com/jakubwaller/papa-map/"
             "main/theme/papamap.theme.json")
    assert feats[3]["mapcomplete_url"] == (  # cafe
        f"{theme}&z=18&lat=53.5637&lon=9.9633#way/3")
    assert feats[7]["mapcomplete_url"] == (  # restaurant
        f"{theme}&z=18&lat=53.561&lon=9.956#node/7")
    assert feats[8]["mapcomplete_url"] == (  # toilets
        f"{theme}&z=18&lat=53.558&lon=10.001#relation/8")


def test_element_without_coordinates_is_dropped():
    feats = build_features({"elements": [
        {"type": "way", "id": 1, "tags": {"changing_table": "yes"}}]})
    assert feats == []


def test_export_geojson_writes_feature_collection(tmp_path, load_fixture):
    out = tmp_path / "changing_tables.geojson"
    n = export_geojson(build_features(load_fixture("overpass_changing_tables.json")), str(out))
    assert n == 7
    fc = json.loads(out.read_text(encoding="utf-8"))
    assert fc["type"] == "FeatureCollection"
    assert len(fc["features"]) == 7


def test_atomic_write_leaves_no_temp_file(tmp_path):
    out = tmp_path / "deep" / "stats.json"  # parent dirs get created
    write_json_atomic({"ok": True}, str(out))
    assert json.loads(out.read_text(encoding="utf-8")) == {"ok": True}
    assert list(out.parent.iterdir()) == [out]


def test_atomic_write_keeps_old_file_when_rename_fails(tmp_path, monkeypatch):
    out = tmp_path / "stats.json"
    out.write_text('{"old": true}', encoding="utf-8")

    def boom(src, dst):
        raise OSError("disk full")

    monkeypatch.setattr(export.os, "replace", boom)
    with pytest.raises(OSError):
        write_json_atomic({"new": True}, str(out))
    # the served file is only ever touched by the rename
    assert json.loads(out.read_text(encoding="utf-8")) == {"old": True}
