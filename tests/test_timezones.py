from __future__ import annotations

import io

import pytest

from pipeline import config, delta, timezones
from pipeline.export import build_features, build_play_features
from pipeline.timezones import area_default_tz, area_tz_table, tz_override, zone_for


def test_single_zone_area_takes_its_country_default_and_no_override():
    assert zone_for("Bayern", 48.14, 11.58) == "Europe/Berlin"
    assert tz_override("Bayern", 48.14, 11.58) is None


@pytest.mark.parametrize("lat,lon,zone", [
    (-31.95, 115.86, "Australia/Perth"),
    (-12.46, 130.84, "Australia/Darwin"),
    (-34.93, 138.60, "Australia/Adelaide"),
    (-27.47, 153.03, "Australia/Brisbane"),
    (-33.87, 151.21, "Australia/Sydney"),
    # Tweed Heads: New South Wales, a street south of Queensland's border.
    (-28.18, 153.54, "Australia/Sydney"),
    (-28.17, 153.54, "Australia/Brisbane"),   # Coolangatta, across the street
    # Either side of the rest of the border (NSW keeps summer time, QLD not).
    (-28.22, 152.03, "Australia/Brisbane"),   # Warwick
    (-28.65, 151.93, "Australia/Brisbane"),   # Stanthorpe
    (-28.42, 151.08, "Australia/Brisbane"),   # Inglewood
    (-28.85, 151.17, "Australia/Brisbane"),   # Texas, QLD
    (-28.23, 153.27, "Australia/Brisbane"),   # Springbrook
    (-28.55, 150.31, "Australia/Brisbane"),   # Goondiwindi
    (-28.33, 152.29, "Australia/Brisbane"),   # Killarney
    (-28.60, 150.37, "Australia/Sydney"),     # Boggabilla, across the Macintyre
    (-29.05, 152.02, "Australia/Sydney"),     # Tenterfield
    (-28.39, 152.61, "Australia/Sydney"),     # Woodenbong
    (-28.33, 153.39, "Australia/Sydney"),     # Murwillumbah
    (-28.64, 153.61, "Australia/Sydney"),     # Byron Bay
    (-31.95, 141.45, "Australia/Broken_Hill"),
])
def test_australia_splits_by_coordinates(lat, lon, zone):
    assert zone_for("Australia", lat, lon) == zone


def test_the_default_zone_is_never_an_override():
    assert tz_override("Australia", -33.87, 151.21) is None
    assert tz_override("Australia", -31.95, 115.86) == "Australia/Perth"


@pytest.mark.parametrize("area,lat,lon,zone", [
    ("Spain", 28.12, -15.43, "Atlantic/Canary"),
    ("Spain", 40.42, -3.70, "Europe/Madrid"),
    ("Portugal", 37.74, -25.67, "Atlantic/Azores"),
    ("Portugal", 32.65, -16.91, "Europe/Lisbon"),
    ("New Zealand", -43.95, -176.56, "Pacific/Chatham"),
    ("Texas", 31.76, -106.49, "America/Denver"),
    ("Texas", 29.76, -95.37, "America/Chicago"),
    ("Florida", 30.42, -87.22, "America/Chicago"),
    ("Florida", 25.76, -80.19, "America/New_York"),
    ("Ontario", 49.77, -94.49, "America/Winnipeg"),
    ("Ontario", 43.65, -79.38, "America/Toronto"),
    ("Idaho", 47.68, -116.78, "America/Los_Angeles"),
    ("Idaho", 43.62, -116.20, "America/Boise"),
    # British Columbia: the Peace River country and the Northern Rockies lie
    # west of the 120°W border and keep UTC-7 all year; Mackenzie is Pacific.
    ("British Columbia", 55.76, -120.24, "America/Dawson_Creek"),   # Dawson Creek
    ("British Columbia", 56.25, -120.85, "America/Dawson_Creek"),   # Fort St. John
    ("British Columbia", 55.70, -121.63, "America/Dawson_Creek"),   # Chetwynd
    ("British Columbia", 58.81, -122.70, "America/Fort_Nelson"),    # Fort Nelson
    ("British Columbia", 55.34, -123.09, "America/Vancouver"),      # Mackenzie
    ("British Columbia", 53.92, -122.75, "America/Vancouver"),      # Prince George
    ("British Columbia", 49.51, -115.77, "America/Edmonton"),       # Cranbrook
    ("British Columbia", 49.10, -116.51, "America/Creston"),        # Creston
    ("British Columbia", 51.00, -118.20, "America/Vancouver"),      # Revelstoke
])
def test_multi_zone_areas(area, lat, lon, zone):
    assert zone_for(area, lat, lon) == zone


def test_every_configured_area_has_a_default_zone():
    missing = [name for areas in config.COUNTRY_AREAS.values() for name, _ in areas
               if area_default_tz(name) is None]
    assert missing == []
    assert set(timezones.COUNTRY_TZ) == set(config.COUNTRY_AREAS)


def _rule_zones():
    # Every zone a rule can answer, found by probing the rules on a grid wide
    # enough to reach every branch.
    zones = set()
    for rule in timezones._RULES.values():
        for lat in range(-60, 85, 1):
            for lon in range(-180, 181, 1):
                zone = rule(float(lat), float(lon))
                if zone:
                    zones.add(zone)
    return zones


def test_every_zone_name_is_a_real_iana_zone():
    zoneinfo = pytest.importorskip("zoneinfo")
    names = (set(timezones.COUNTRY_TZ.values()) | set(timezones.AREA_TZ.values())
             | _rule_zones())
    try:
        zoneinfo.ZoneInfo("Europe/Berlin")
    except zoneinfo.ZoneInfoNotFoundError:
        pytest.skip("no tz database on this Python")
    bad = []
    for name in sorted(names):
        try:
            zoneinfo.ZoneInfo(name)
        except zoneinfo.ZoneInfoNotFoundError:
            bad.append(name)
    assert bad == []


def test_an_unknown_area_has_no_zone():
    assert zone_for(None, 0, 0) is None
    assert tz_override(None, 0, 0) is None
    assert zone_for("Atlantis", 0, 0) is None
    # Missing coordinates fall back to the default, never a rule's guess.
    assert zone_for("Australia", None, None) == "Australia/Sydney"


def test_area_tz_table_names_each_known_area_once():
    assert area_tz_table(["Bayern", "Danmark", "Atlantis", "Arizona"]) == {
        "Bayern": "Europe/Berlin", "Danmark": "Europe/Copenhagen",
        "Arizona": "America/Phoenix"}


def _node(id_, lat, lon, tags):
    return {"type": "node", "id": id_, "lat": lat, "lon": lon, "tags": tags}


def test_built_features_carry_tz_only_off_their_areas_default():
    ct = {"elements": [_node(1, -31.95, 115.86, {"changing_table": "yes"}),
                       _node(2, 48.14, 11.58, {"changing_table": "yes"})]}
    feats = {f["properties"]["osm_id"]: f["properties"]
             for f in build_features(ct, {("node", 1): "Australia", ("node", 2): "Bayern"})}
    assert feats[1]["tz"] == "Australia/Perth"
    assert "tz" not in feats[2]


def test_play_places_carry_their_area_and_tz():
    play = {"elements": [_node(3, -31.95, 115.86, {"amenity": "cafe", "kids_area": "yes"}),
                         _node(4, 48.14, 11.58, {"amenity": "cafe", "kids_area": "yes"})]}
    feats = {f["properties"]["osm_id"]: f["properties"]
             for f in build_play_features(play, None,
                                          {("node", 3): "Australia", ("node", 4): "Bayern"})}
    assert feats[3]["area"] == "Australia" and feats[3]["tz"] == "Australia/Perth"
    assert feats[4]["area"] == "Bayern" and "tz" not in feats[4]


def _osc(*bodies):
    return ('<?xml version="1.0"?><osmChange version="0.6">'
            + "".join(bodies) + "</osmChange>").encode()


def _create(id_, lat, lon, tags):
    tag_xml = "".join(f'<tag k="{k}" v="{v}"/>' for k, v in tags.items())
    return (f'<create><node id="{id_}" version="1" timestamp="2026-10-07T10:00:00Z" '
            f'lat="{lat}" lon="{lon}">{tag_xml}</node></create>')


def test_a_delta_upsert_carries_tz_like_the_nightly_build():
    boxes = {"Australia": (112.0, -44.0, 154.0, -10.0)}
    changes = delta.parse_osc(io.BytesIO(_osc(
        _create(901, -31.95, 115.86, {"changing_table": "yes"}),
        _create(902, -31.95, 115.86, {"amenity": "cafe", "kids_area": "yes"}))))
    events = delta.process_changes(changes, {"tables": {}, "places": {}},
                                   area_boxes=list(boxes.values()),
                                   area_boxes_by_name=boxes)
    by_kind = {kind: feat for _, kind, feat in events}
    assert by_kind["table"]["properties"]["tz"] == "Australia/Perth"
    assert by_kind["place"]["properties"]["tz"] == "Australia/Perth"
    assert by_kind["place"]["properties"]["area"] == "Australia"


def test_a_known_place_keeps_its_area_on_a_delta_upsert():
    url = "https://www.openstreetmap.org/node/903"
    base = {"tables": {}, "places": {url: {
        "geometry": {"coordinates": [115.86, -31.95]},
        "properties": {"osm_url": url, "area": "Australia"}}}}
    changes = delta.parse_osc(io.BytesIO(_osc(
        '<modify><node id="903" version="2" timestamp="2026-10-07T10:00:00Z" '
        'lat="-31.95" lon="115.86"><tag k="amenity" v="cafe"/>'
        '<tag k="kids_area" v="yes"/></node></modify>')))
    events = delta.process_changes(changes, base)
    assert events[0][2]["properties"]["area"] == "Australia"
    assert events[0][2]["properties"]["tz"] == "Australia/Perth"
