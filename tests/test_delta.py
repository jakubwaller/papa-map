import gzip
import json
from datetime import datetime, timezone

import pytest

from pipeline import delta

NOW = datetime(2026, 9, 23, 10, 20, tzinfo=timezone.utc)


def _osc(*blocks: str) -> bytes:
    body = "".join(blocks)
    xml = f'<?xml version="1.0" encoding="UTF-8"?>\n<osmChange version="0.6" generator="test">{body}</osmChange>'
    return xml.encode("utf-8")


def _node(action: str, id_: int, version: int, ts: str, lat: float, lon: float, tags: dict) -> str:
    tag_xml = "".join(f'<tag k="{k}" v="{v}"/>' for k, v in tags.items())
    return (f'<{action}><node id="{id_}" version="{version}" timestamp="{ts}" '
            f'lat="{lat}" lon="{lon}">{tag_xml}</node></{action}>')


def _way(action: str, id_: int, version: int, ts: str, tags: dict) -> str:
    tag_xml = "".join(f'<tag k="{k}" v="{v}"/>' for k, v in tags.items())
    return f'<{action}><way id="{id_}" version="{version}" timestamp="{ts}">{tag_xml}</way></{action}>'


def _delete(kind: str, id_: int, version: int, ts: str) -> str:
    return f'<delete><{kind} id="{id_}" version="{version}" timestamp="{ts}" visible="false"/></delete>'


# ---- parse_osc --------------------------------------------------------------

def test_parse_osc_create_modify_delete():
    xml = _osc(
        _node("create", 1, 1, "2026-09-23T10:01:00Z", 53.55, 10.0,
              {"changing_table": "yes", "changing_table:location": "male_toilet"}),
        _node("modify", 2, 3, "2026-09-23T10:02:00Z", 53.56, 10.1,
              {"changing_table": "yes", "changing_table:location": "female_toilet"}),
        _delete("node", 3, 5, "2026-09-23T10:03:00Z"),
    )
    changes = delta.parse_osc(__import__("io").BytesIO(xml))
    assert [c["action"] for c in changes] == ["create", "modify", "delete"]
    assert changes[0]["type"] == "node" and changes[0]["id"] == 1
    assert changes[0]["tags"]["changing_table:location"] == "male_toilet"
    assert changes[0]["lat"] == 53.55 and changes[0]["lon"] == 10.0
    assert changes[1]["version"] == 3
    assert changes[2]["action"] == "delete" and changes[2]["tags"] == {}
    assert "lat" not in changes[2]


def test_parse_osc_way_has_no_coordinates():
    xml = _osc(_way("modify", 10, 2, "2026-09-23T10:04:00Z", {"amenity": "toilets"}))
    changes = delta.parse_osc(__import__("io").BytesIO(xml))
    assert changes[0]["type"] == "way"
    assert "lat" not in changes[0] and "lon" not in changes[0]


# ---- relevance ---------------------------------------------------------------

@pytest.mark.parametrize("tags", [
    {"changing_table": "yes"},
    {"changing_table:location": "male_toilet"},
    {"kids_area": "yes"},
    {"kids_area:indoor": "yes"},
    {"leisure": "indoor_play"},
    {"leisure": "playground"},
    {"amenity": "toilets"},
    {"wheelchair": "yes"},
    {"toilets:wheelchair": "yes"},
])
def test_relevant_tags(tags):
    assert delta.is_relevant_tags(tags)


@pytest.mark.parametrize("tags", [
    {}, {"shop": "bakery"}, {"amenity": "cafe"}, {"leisure": "pitch"},
])
def test_irrelevant_tags(tags):
    assert not delta.is_relevant_tags(tags)


# ---- process_changes: the pytest fixture scenarios asked for ----------------

def _empty_dataset():
    return {"tables": {}, "places": {}}


def test_create_new_table_upserts_accessible():
    changes = delta.parse_osc(__import__("io").BytesIO(_osc(
        _node("create", 100, 1, "2026-09-23T10:05:00Z", 53.55, 10.0,
              {"changing_table": "yes", "changing_table:location": "male_toilet"}))))
    events = delta.process_changes(changes, _empty_dataset())
    assert len(events) == 1
    url, kind, feat = events[0]
    assert kind == "table"
    assert feat["properties"]["status"] == "accessible"
    assert feat["properties"]["osm_version"] == 1
    assert feat["properties"]["edited_at"] == "2026-09-23T10:05:00Z"


def test_modify_tag_added_switches_status():
    base = {"tables": {"https://www.openstreetmap.org/node/200": {
        "geometry": {"coordinates": [10.0, 53.55]},
        "properties": {"osm_url": "https://www.openstreetmap.org/node/200",
                       "osm_type": "node", "osm_id": 200, "status": "unknown"},
    }}, "places": {}}
    changes = delta.parse_osc(__import__("io").BytesIO(_osc(
        _node("modify", 200, 2, "2026-09-23T10:06:00Z", 53.55, 10.0,
              {"changing_table": "yes", "changing_table:location": "female_toilet"}))))
    events = delta.process_changes(changes, base)
    assert events == [("https://www.openstreetmap.org/node/200", "table", events[0][2])]
    assert events[0][2]["properties"]["status"] == "female_only"


def test_modify_tag_removed_becomes_removal():
    # The location tag is gone entirely (not blank) — same object, no
    # location any more: status drops to "unknown", still a feature (yes is
    # still yes), so it must stay an upsert, not a removal.
    base = {"tables": {"https://www.openstreetmap.org/node/201": {
        "geometry": {"coordinates": [10.0, 53.55]},
        "properties": {"osm_url": "https://www.openstreetmap.org/node/201"},
    }}, "places": {}}
    changes = delta.parse_osc(__import__("io").BytesIO(_osc(
        _node("modify", 201, 4, "2026-09-23T10:07:00Z", 53.55, 10.0,
              {"changing_table": "yes"}))))
    events = delta.process_changes(changes, base)
    assert events[0][1] == "table"
    assert events[0][2]["properties"]["status"] == "unknown"


def test_modify_changing_table_removed_entirely_is_a_removal():
    base = {"tables": {"https://www.openstreetmap.org/node/202": {
        "geometry": {"coordinates": [10.0, 53.55]},
        "properties": {"osm_url": "https://www.openstreetmap.org/node/202"},
    }}, "places": {}}
    changes = delta.parse_osc(__import__("io").BytesIO(_osc(
        _node("modify", 202, 4, "2026-09-23T10:08:00Z", 53.55, 10.0,
              {"amenity": "cafe"}))))
    events = delta.process_changes(changes, base)
    assert events == [("https://www.openstreetmap.org/node/202", "table", None)]


def test_delete_known_table_is_a_removal():
    base = {"tables": {"https://www.openstreetmap.org/node/203": {
        "geometry": {"coordinates": [10.0, 53.55]},
        "properties": {"osm_url": "https://www.openstreetmap.org/node/203"},
    }}, "places": {}}
    changes = delta.parse_osc(__import__("io").BytesIO(_osc(_delete("node", 203, 9, "2026-09-23T10:09:00Z"))))
    events = delta.process_changes(changes, base)
    assert events == [("https://www.openstreetmap.org/node/203", "table", None)]


def test_way_in_dataset_reuses_its_coordinates():
    url = "https://www.openstreetmap.org/way/300"
    base = {"tables": {url: {
        "geometry": {"coordinates": [10.5, 53.6]},
        "properties": {"osm_url": url},
    }}, "places": {}}
    changes = delta.parse_osc(__import__("io").BytesIO(_osc(
        _way("modify", 300, 2, "2026-09-23T10:10:00Z",
             {"changing_table": "yes", "changing_table:location": "unisex_toilet"}))))
    events = delta.process_changes(changes, base)
    assert events[0][2]["geometry"]["coordinates"] == [10.5, 53.6]


def test_way_not_in_dataset_uses_coord_fetch():
    changes = delta.parse_osc(__import__("io").BytesIO(_osc(
        _way("create", 301, 1, "2026-09-23T10:11:00Z",
             {"changing_table": "yes", "changing_table:location": "room"}))))
    calls = []

    def fake_coord_fetch(osm_type, osm_id):
        calls.append((osm_type, osm_id))
        return (53.7, 10.2)

    events = delta.process_changes(changes, _empty_dataset(), coord_fetch=fake_coord_fetch)
    assert calls == [("way", 301)]
    assert events[0][2]["geometry"]["coordinates"] == [10.2, 53.7]


def test_irrelevant_object_dropped():
    changes = delta.parse_osc(__import__("io").BytesIO(_osc(
        _node("create", 400, 1, "2026-09-23T10:12:00Z", 53.55, 10.0, {"shop": "bakery"}))))
    assert delta.process_changes(changes, _empty_dataset()) == []


def test_new_toilet_without_table_is_flagged():
    changes = delta.parse_osc(__import__("io").BytesIO(_osc(
        _node("create", 500, 1, "2026-09-23T10:13:00Z", 53.55, 10.0, {"amenity": "toilets"}))))
    events = delta.process_changes(changes, _empty_dataset())
    assert events == [("https://www.openstreetmap.org/node/500", "toilet_no_table",
                       {"osm_url": "https://www.openstreetmap.org/node/500",
                        "lon": 10.0, "lat": 53.55, "t": "2026-09-23T10:13:00Z"})]


def test_outside_bbox_new_object_dropped_but_known_object_kept():
    bbox = (9.0, 53.0, 11.0, 54.0)
    far_changes = delta.parse_osc(__import__("io").BytesIO(_osc(
        _node("create", 600, 1, "2026-09-23T10:14:00Z", 10.0, 100.0,
              {"changing_table": "yes"}))))
    assert delta.process_changes(far_changes, _empty_dataset(), bbox=bbox) == []
    url = "https://www.openstreetmap.org/node/601"
    base = {"tables": {url: {"geometry": {"coordinates": [100.0, 10.0]},
                             "properties": {"osm_url": url}}}, "places": {}}
    known_changes = delta.parse_osc(__import__("io").BytesIO(_osc(
        _node("modify", 601, 2, "2026-09-23T10:14:00Z", 10.0, 100.0,
              {"changing_table": "yes"}))))
    events = delta.process_changes(known_changes, base, bbox=bbox)
    assert len(events) == 1  # known objects are kept regardless of bbox


# ---- accumulation ------------------------------------------------------------

def test_apply_events_upsert_then_delete_then_upsert_again():
    acc = delta.new_accumulator()
    url = "https://www.openstreetmap.org/node/1"
    feat = {"properties": {"osm_url": url, "status": "accessible"}}
    delta.apply_events(acc, [(url, "table", feat)])
    assert url in acc["tables_upsert"]
    delta.apply_events(acc, [(url, "table", None)])
    assert url not in acc["tables_upsert"] and url in acc["tables_remove"]
    delta.apply_events(acc, [(url, "table", feat)])
    assert url in acc["tables_upsert"] and url not in acc["tables_remove"]


def test_render_delta_shape():
    acc = delta.new_accumulator()
    url = "https://www.openstreetmap.org/node/1"
    acc["tables_upsert"][url] = {"properties": {"osm_url": url}}
    acc["tables_remove"].add("https://www.openstreetmap.org/node/2")
    out = delta.render_delta(acc, "2026-09-22T02:00:00+00:00", 12345, now=NOW)
    assert out["base"] == "2026-09-22T02:00:00+00:00"
    assert out["seq"] == 12345
    assert out["tables"]["upsert"] == [{"properties": {"osm_url": url}}]
    assert out["tables"]["remove"] == ["https://www.openstreetmap.org/node/2"]
    assert out["places"] == {"upsert": [], "remove": []}
    assert out["new_toilets_no_table"] == []
    assert out["generated"] == NOW.isoformat(timespec="seconds")


# ---- state.txt parsing / start-seq estimation --------------------------------

def test_parse_state_txt():
    text = "#comment\nsequenceNumber=6234567\ntimestamp=2026-09-23T10\\:15\\:00Z\n"
    assert delta.parse_state_txt(text) == {"seq": 6234567, "timestamp": "2026-09-23T10:15:00Z"}


def test_estimate_start_seq():
    seq = delta.estimate_start_seq(
        base_iso="2026-09-23T08:00:00Z",
        current_seq=6234567,
        current_ts_iso="2026-09-23T10:00:00Z",
        margin_min=10)
    # 2 hours since base = 120 sequences, plus the 10-minute margin.
    assert seq == 6234567 - 120 - 10


def test_find_start_seq_verifies_and_backs_off():
    # The naive estimate overshoots (lands after base); find_start_seq must
    # walk further back until the sequence's own timestamp is <= base.
    states = {
        None: {"seq": 1000, "timestamp": "2026-09-23T10:00:00Z"},
        990: {"seq": 990, "timestamp": "2026-09-23T09:55:00Z"},  # after base: too late
        960: {"seq": 960, "timestamp": "2026-09-23T09:25:00Z"},  # after base still
        930: {"seq": 930, "timestamp": "2026-09-23T08:55:00Z"},  # <= base: good
    }

    def fake_fetch_state(seq=None):
        return states[seq]

    start = delta.find_start_seq("2026-09-23T09:00:00Z", fetch_state=fake_fetch_state,
                                 max_backoff=8, backoff_step=30)
    assert start == 930


# ---- run_tick: sequence-gap catch-up via a fake fetcher ----------------------

def _write_stats(path, data_base):
    path.write_text(json.dumps({"generated_at": data_base, "data_base": data_base}), encoding="utf-8")


def _write_fc(path, features):
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features}), encoding="utf-8")


def test_run_tick_catches_up_a_sequence_gap(tmp_path):
    stats_path = tmp_path / "stats.json"
    geojson_path = tmp_path / "changing_tables.geojson"
    play_path = tmp_path / "play_places.geojson"
    delta_path = tmp_path / "delta.json"
    _write_stats(stats_path, "2026-09-23T08:00:00+00:00")
    _write_fc(geojson_path, [])
    _write_fc(play_path, [])

    osc_by_seq = {
        101: _osc(_node("create", 1, 1, "2026-09-23T10:01:00Z", 53.5, 10.0,
                        {"changing_table": "yes", "changing_table:location": "male_toilet"})),
        102: _osc(_node("create", 2, 1, "2026-09-23T10:02:00Z", 53.5, 10.1,
                        {"changing_table": "yes", "changing_table:location": "female_toilet"})),
        103: _osc(_node("create", 1, 2, "2026-09-23T10:03:00Z", 53.5, 10.0,
                        {"changing_table": "yes", "changing_table:location": "unisex_toilet"})),
    }

    def fake_fetch_state(seq=None):
        return {"seq": 103, "timestamp": "2026-09-23T10:03:00Z"}

    def fake_fetch_osc(seq):
        return osc_by_seq[seq]

    state = {"seq": 100, "base": "2026-09-23T08:00:00+00:00"}
    new_state, out = delta.run_tick(
        state, geojson_path=str(geojson_path), play_geojson_path=str(play_path),
        stats_path=str(stats_path), delta_path=str(delta_path),
        fetch_state=fake_fetch_state, fetch_osc=fake_fetch_osc, now=NOW)

    assert new_state == {"seq": 103, "base": "2026-09-23T08:00:00+00:00"}
    urls = {f["properties"]["osm_url"] for f in out["tables"]["upsert"]}
    assert urls == {"https://www.openstreetmap.org/node/1", "https://www.openstreetmap.org/node/2"}
    # node/1 was created then modified within the gap — the later version
    # (unisex_toilet, accessible) must win, not the first one seen.
    node1 = next(f for f in out["tables"]["upsert"] if f["properties"]["osm_id"] == 1)
    assert node1["properties"]["location_raw"] == "unisex_toilet"
    assert node1["properties"]["osm_version"] == 2


def test_run_tick_resets_on_new_base_and_rebuilds_from_scratch(tmp_path):
    stats_path = tmp_path / "stats.json"
    geojson_path = tmp_path / "changing_tables.geojson"
    play_path = tmp_path / "play_places.geojson"
    delta_path = tmp_path / "delta.json"
    _write_stats(stats_path, "2026-09-23T08:00:00+00:00")
    _write_fc(geojson_path, [])
    _write_fc(play_path, [])
    # A stale delta.json from the previous base, with an object that must
    # NOT survive the reset — the new build already accounts for it.
    delta_path.write_text(json.dumps({
        "base": "2026-09-22T02:00:00+00:00", "seq": 50,
        "tables": {"upsert": [{"properties": {"osm_url":
                   "https://www.openstreetmap.org/node/999"}}], "remove": []},
        "places": {"upsert": [], "remove": []}, "new_toilets_no_table": [],
    }), encoding="utf-8")

    def fake_fetch_state(seq=None):
        if seq is None:
            return {"seq": 200, "timestamp": "2026-09-23T10:00:00Z"}
        return {"seq": seq, "timestamp": "2026-09-23T08:00:00Z"}

    def fake_fetch_osc(seq):
        return _osc()  # empty diffs — only the reset matters here

    new_state, out = delta.run_tick(
        None, geojson_path=str(geojson_path), play_geojson_path=str(play_path),
        stats_path=str(stats_path), delta_path=str(delta_path),
        fetch_state=fake_fetch_state, fetch_osc=fake_fetch_osc, now=NOW)

    assert new_state["base"] == "2026-09-23T08:00:00+00:00"
    assert out["tables"]["upsert"] == []  # the stale object did not survive the reset


def test_run_tick_output_dir_has_only_state_and_delta_files(tmp_path):
    # No .osc/.osc.gz or any other artifact may be left on disk — everything
    # OSM-fetched stays in memory (gzip.decompress into bytes, parsed with
    # iterparse straight off a BytesIO) and only delta.json (+ its atomic
    # tmp file, renamed away) and delta-state.json are ever written.
    stats_path = tmp_path / "stats.json"
    geojson_path = tmp_path / "changing_tables.geojson"
    play_path = tmp_path / "play_places.geojson"
    out_dir = tmp_path / "out"
    out_dir.mkdir()
    delta_path = out_dir / "delta.json"
    state_path = out_dir / "delta-state.json"
    _write_stats(stats_path, "2026-09-23T08:00:00+00:00")
    _write_fc(geojson_path, [])
    _write_fc(play_path, [])

    def fake_fetch_state(seq=None):
        return {"seq": 1, "timestamp": "2026-09-23T08:00:00Z"}

    def fake_fetch_osc(seq):
        return _osc(_node("create", 1, 1, "2026-09-23T08:00:30Z", 53.5, 10.0,
                          {"changing_table": "yes"}))

    state = None
    new_state, out = delta.run_tick(
        state, geojson_path=str(geojson_path), play_geojson_path=str(play_path),
        stats_path=str(stats_path), delta_path=str(delta_path),
        fetch_state=fake_fetch_state, fetch_osc=fake_fetch_osc, now=NOW)
    delta.export.write_json_atomic(out, str(delta_path))
    delta.save_state(str(state_path), new_state)

    assert sorted(p.name for p in out_dir.iterdir()) == ["delta-state.json", "delta.json"]


# ---- read_data_base ----------------------------------------------------------

def test_read_data_base_prefers_data_base_over_generated_at(tmp_path):
    stats_path = tmp_path / "stats.json"
    stats_path.write_text(json.dumps({"generated_at": "2026-09-23T03:00:00+00:00",
                                      "data_base": "2026-09-22T22:00:00+00:00"}), encoding="utf-8")
    assert delta.read_data_base(str(stats_path)) == "2026-09-22T22:00:00+00:00"


def test_read_data_base_falls_back_to_generated_at(tmp_path):
    stats_path = tmp_path / "stats.json"
    stats_path.write_text(json.dumps({"generated_at": "2026-09-23T03:00:00+00:00"}), encoding="utf-8")
    assert delta.read_data_base(str(stats_path)) == "2026-09-23T03:00:00+00:00"


def test_read_data_base_none_when_stats_missing(tmp_path):
    assert delta.read_data_base(str(tmp_path / "missing.json")) is None
