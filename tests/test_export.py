import json

import pytest

from pipeline import export
from pipeline.export import build_features, export_geojson, write_json_atomic


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
