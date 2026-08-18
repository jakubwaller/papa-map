import pytest
import requests

from pipeline import config, osm
from pipeline.classify import PLAY_AREA_VALUES
from pipeline.osm import element_coords, fetch_overpass


def test_element_coords_node_way_and_missing():
    assert element_coords({"lat": 53.5, "lon": 10.0}) == (53.5, 10.0)
    assert element_coords({"center": {"lat": 53.6, "lon": 9.9}}) == (53.6, 9.9)
    assert element_coords({"type": "way", "id": 1}) == (None, None)


def test_dedup_elements_keeps_first_occurrence_and_order():
    els = [{"type": "node", "id": 1, "v": "first"},
           {"type": "way", "id": 1},
           {"type": "node", "id": 2},
           {"type": "node", "id": 1, "v": "dup from second Land"}]
    out = osm.dedup_elements(els)
    assert out == els[:3]  # way#1 is not node#1; node#1's repeat dropped


def test_sweep_ql_unions_both_halves_into_one_query(load_fixture):
    ql = config.sweep_ql("Hamburg", "4")
    # One query, one area clause, one out — a second query would cost a whole
    # ~40 s Overpass slot per area for a few hundred objects nationwide.
    assert ql.count("out tags center;") == 1
    assert ql.count("area[") == 1
    assert 'nwr["changing_table"](area.a);' in ql
    assert 'nwr["leisure"="playground"]["indoor"="yes"](area.a);' in ql
    # The value regex is generated from the rule's own value set, so a value
    # added to PLAY_AREA_VALUES cannot be silently left out of the query.
    for value in PLAY_AREA_VALUES:
        assert value in ql
    assert "limited" not in ql and "outdoor" not in ql
    assert f"[timeout:{config.OVERPASS_QL_TIMEOUT}]" in ql


def test_backfill_query_stays_narrow():
    # The leaderboard has only ever counted changing tables, and attic queries
    # already take ~3 min per Land — the play half must not ride along there.
    ql = config.changing_table_ql("Hamburg", "4", date="2026-07-17T00:00:00Z")
    assert "kids_area" not in ql
    assert '[date:"2026-07-17T00:00:00Z"]' in ql


def test_multilingual_countries_are_selected_by_name_en():
    # Belgium's own `name` is "België / Belgique / Belgien" and Switzerland's
    # "Schweiz/Suisse/Svizzera/Svizra", so area["name"="Belgium"] resolves to
    # nothing — and run.py can only read a zero-object area as a failed sweep,
    # which burns six rounds and kills the whole build with an error about a
    # stale mirror. Every builder goes through _area_ql, so all of them must
    # agree on the selector.
    assert ('area["name:en"="Belgium"]["admin_level"="2"]'
            in config.changing_table_ql("Belgium", "2"))
    assert ('area["name:en"="Switzerland"]["admin_level"="2"]'
            in config.sweep_ql("Switzerland", "2"))
    assert ('area["name:en"="Czechia"]["admin_level"="2"]'
            in config.toilets_ql("Czechia", "2"))
    for name in sorted(config.NAME_EN_AREAS):
        ql = config.sweep_ql(name, "2")
        assert f'area["name:en"="{name}"]' in ql
        assert '["name"=' not in ql


def test_germany_and_denmark_keep_the_plain_name_selector():
    # "Deutschland" and "Danmark" are also the region keys in history.json and
    # the row labels on the leaderboard: selecting them by name:en would rename
    # them and orphan every existing baseline.
    for ql in (config.sweep_ql("Danmark", "2"), config.toilets_ql("Danmark", "2"),
               config.changing_table_ql("Danmark", "2")):
        assert 'area["name"="Danmark"]["admin_level"="2"]' in ql
        assert "name:en" not in ql
    assert 'area["name"="Bayern"]["admin_level"="4"]' in config.sweep_ql("Bayern", "4")
    assert "name:en" not in config.changing_table_ql()  # defaults to Deutschland/2
    # The city sweep names Kommuner and Kreise in their own language too.
    assert ('area["name"="Københavns Kommune"]["admin_level"="7"]'
            in config.changing_table_ids_ql("Københavns Kommune", "7"))


def test_split_sweep_sorts_the_union_into_pins_and_prospects(load_fixture):
    elements = (load_fixture("overpass_changing_tables.json")["elements"]
                + load_fixture("overpass_play_places.json")["elements"])
    ct, play = osm.split_sweep(elements)
    # Every changing_table object stays on the pin side whatever its value —
    # `no` and junk still feed the stats.
    assert len(ct) == 9
    assert all("changing_table" in el["tags"] for el in ct)
    # ...including the café that has both a table and a play corner: it is
    # already a pin, and its corner rides along as the feature's `play` flag.
    assert 3 in [el["id"] for el in ct]
    # The outdoor kids' area is the Overpass prefilter being looser than the
    # rule, and must not survive the split.
    assert [el["id"] for el in play] == [9001, 9002, 9003, 9005]


def test_split_sweep_ignores_objects_matching_neither_half():
    ct, play = osm.split_sweep([{"type": "node", "id": 1, "tags": {"amenity": "cafe"}},
                                {"type": "node", "id": 2}])
    assert (ct, play) == ([], [])


def test_fetch_retries_on_runtime_error_remark(monkeypatch):
    # Overpass answers a blown [timeout:...] budget with HTTP 200, partial
    # elements and a "runtime error" remark — that must retry, not pass.
    responses = [{"elements": [], "remark": 'runtime error: Query timed out in "query"'},
                 {"elements": [{"type": "node", "id": 1}]}]
    calls = []

    def get(url, params=None, headers=None, timeout=None):
        calls.append(url)
        r = _resp(200, url)
        r.json = lambda i=len(calls) - 1: responses[i]
        return r

    monkeypatch.setattr(osm.requests, "get", get)
    monkeypatch.setattr(osm.time, "sleep", lambda s: None)
    assert fetch_overpass("out;", urls=["http://m1"], retries=2, backoff=0) == responses[1]
    assert calls == ["http://m1", "http://m1"]


def test_http_timeout_outlives_ql_timeout():
    # A Germany-wide query legitimately runs for minutes; requests must not
    # hang up on a server that is still within its own [timeout:...] budget.
    from pipeline import config
    assert config.OVERPASS_HTTP_TIMEOUT > config.OVERPASS_QL_TIMEOUT
    assert f"[timeout:{config.OVERPASS_QL_TIMEOUT}]" in config.changing_table_ql()


def _resp(status, url):
    r = requests.Response()
    r.status_code = status
    r.url = url
    r._content = b'{"elements": []}'
    return r


def _fake_get(sequence):
    """Return a stand-in for requests.get that yields one entry of `sequence`
    per call (an int status code -> Response, an Exception -> raised) and
    records the URLs and headers it was hit with."""
    seen, headers_seen = [], []

    def _get(url, params=None, headers=None, timeout=None):
        seen.append(url)
        headers_seen.append(headers or {})
        item = sequence[len(seen) - 1]
        if isinstance(item, Exception):
            raise item
        return _resp(item, url)

    return _get, seen, headers_seen


def test_fetch_sends_identifying_user_agent(monkeypatch):
    get, seen, headers = _fake_get([200])
    monkeypatch.setattr(osm.requests, "get", get)
    fetch_overpass("out;", urls=["http://m1"], retries=1, backoff=0)
    assert headers[0]["User-Agent"].startswith("papa-map/0.1")
    assert "papamap@jakubwaller.eu" in headers[0]["User-Agent"]


def test_fetch_retries_transient_then_succeeds(monkeypatch):
    get, seen, _ = _fake_get([503, 200])
    monkeypatch.setattr(osm.requests, "get", get)
    monkeypatch.setattr(osm.time, "sleep", lambda s: None)
    assert fetch_overpass("out;", urls=["http://m1"], retries=3, backoff=0) == {"elements": []}
    assert seen == ["http://m1", "http://m1"]  # retried the same mirror


def test_fetch_falls_over_to_next_mirror(monkeypatch):
    get, seen, _ = _fake_get([406, 406, 200])
    monkeypatch.setattr(osm.requests, "get", get)
    monkeypatch.setattr(osm.time, "sleep", lambda s: None)
    assert fetch_overpass("out;", urls=["http://m1", "http://m2"],
                          retries=2, backoff=0) == {"elements": []}
    assert seen == ["http://m1", "http://m1", "http://m2"]  # m1 exhausted, then m2


def test_fetch_retries_transport_error(monkeypatch):
    get, seen, _ = _fake_get([requests.ConnectionError("reset"), 200])
    monkeypatch.setattr(osm.requests, "get", get)
    monkeypatch.setattr(osm.time, "sleep", lambda s: None)
    assert fetch_overpass("out;", urls=["http://m1"], retries=2, backoff=0) == {"elements": []}
    assert seen == ["http://m1", "http://m1"]


def test_fetch_raises_on_non_transient_status(monkeypatch):
    get, seen, _ = _fake_get([400])  # bad query — no mirror will differ
    monkeypatch.setattr(osm.requests, "get", get)
    monkeypatch.setattr(osm.time, "sleep", lambda s: None)
    with pytest.raises(requests.HTTPError):
        fetch_overpass("out;", urls=["http://m1", "http://m2"], retries=3, backoff=0)
    assert seen == ["http://m1"]  # aborted before retrying or falling over


def test_fetch_raises_when_all_mirrors_exhausted(monkeypatch, capsys):
    get, seen, _ = _fake_get([504, 504, requests.ConnectTimeout("slow"), 504])
    monkeypatch.setattr(osm.requests, "get", get)
    monkeypatch.setattr(osm.time, "sleep", lambda s: None)
    with pytest.raises(requests.HTTPError):
        fetch_overpass("out;", urls=["http://m1", "http://m2"], retries=2, backoff=0)
    assert seen == ["http://m1", "http://m1", "http://m2", "http://m2"]
    # Each exhausted mirror says so, with its own last excuse — the log must
    # show why the main instance failed, not just what the last fallback said.
    err = capsys.readouterr().err
    assert "WARN http://m1: gave up after 2 attempts (HTTP 504)" in err
    assert "WARN http://m2: gave up after 2 attempts (HTTP 504)" in err


def test_fetch_success_after_retry_logs_nothing(monkeypatch, capsys):
    get, seen, _ = _fake_get([503, 200])
    monkeypatch.setattr(osm.requests, "get", get)
    monkeypatch.setattr(osm.time, "sleep", lambda s: None)
    fetch_overpass("out;", urls=["http://m1"], retries=3, backoff=0)
    assert capsys.readouterr().err == ""  # a healthy night stays quiet


def _fake_get_json(sequence):
    """Like _fake_get, but each entry is the JSON body a 200 answer carries."""
    seen = []

    def _get(url, params=None, headers=None, timeout=None):
        seen.append(url)
        r = _resp(200, url)
        r.json = lambda i=len(seen) - 1: sequence[i]
        return r

    return _get, seen


def test_check_fresh_accepts_recent_and_missing_timestamp():
    from datetime import datetime, timezone
    now = datetime(2026, 8, 15, 8, 0, tzinfo=timezone.utc)
    osm.check_fresh({"osm3s": {"timestamp_osm_base": "2026-08-15T07:34:33Z"},
                     "elements": []}, "http://m1", now=now)
    osm.check_fresh({"elements": []}, "http://m1", now=now)  # no osm3s block at all


def test_check_fresh_rejects_frozen_database():
    # overpass.kumi.systems, 2026-08-15: HTTP 200, no remark, database from May.
    from datetime import datetime, timezone
    now = datetime(2026, 8, 15, 8, 0, tzinfo=timezone.utc)
    with pytest.raises(osm.StaleMirror, match="75 days old"):
        osm.check_fresh({"osm3s": {"timestamp_osm_base": "2026-05-31T22:37:44Z"},
                         "elements": []}, "http://m1", now=now)


def test_fetch_skips_stale_mirror_without_retrying(monkeypatch, capsys):
    from datetime import datetime, timezone
    stale = {"osm3s": {"timestamp_osm_base": "2026-05-31T22:37:44Z"},
             "elements": [{"type": "node", "id": 1}]}
    fresh = {"osm3s": {"timestamp_osm_base": datetime.now(timezone.utc).isoformat()},
             "elements": [{"type": "node", "id": 1}, {"type": "node", "id": 2}]}
    get, seen = _fake_get_json([stale, fresh])
    monkeypatch.setattr(osm.requests, "get", get)
    monkeypatch.setattr(osm.time, "sleep", lambda s: None)
    assert fetch_overpass("out;", urls=["http://m1", "http://m2"],
                          retries=3, backoff=0) == fresh
    assert seen == ["http://m1", "http://m2"]  # m1 dropped after one look, no retries
    assert "WARN http://m1: database is" in capsys.readouterr().err


def test_fetch_raises_stale_when_no_mirror_is_fresh(monkeypatch):
    stale = {"osm3s": {"timestamp_osm_base": "2026-05-31T22:37:44Z"}, "elements": []}
    get, seen = _fake_get_json([stale, stale])
    monkeypatch.setattr(osm.requests, "get", get)
    monkeypatch.setattr(osm.time, "sleep", lambda s: None)
    with pytest.raises(osm.StaleMirror):
        fetch_overpass("out;", urls=["http://m1", "http://m2"], retries=3, backoff=0)
    assert seen == ["http://m1", "http://m2"]


class _Text:
    def __init__(self, text):
        self.text = text


def test_slot_wait_parses_the_main_instance_status_page():
    api = "https://overpass-api.de/api/interpreter"
    free = _Text("Connected as: 1\nRate limit: 2\n2 slots available now.\n")
    one_free = _Text("Rate limit: 2\n1 slots available now.\n"
                     "Slot available after: 2026-08-15T10:48:03Z, in 36 seconds.\n")
    none_free = _Text("Rate limit: 2\n"
                      "Slot available after: 2026-08-15T10:48:03Z, in 29 seconds.\n"
                      "Slot available after: 2026-08-15T10:48:07Z, in 33 seconds.\n")
    assert osm.slot_wait_s(api, get=lambda *a, **k: free) == 0
    assert osm.slot_wait_s(api, get=lambda *a, **k: one_free) == 0
    assert osm.slot_wait_s(api, get=lambda *a, **k: none_free) == 30  # soonest slot + 1


def test_slot_wait_is_capped_and_zero_for_mirrors_or_errors():
    api = "https://overpass-api.de/api/interpreter"
    far = _Text("Slot available after: 2026-08-15T11:00:00Z, in 900 seconds.\n")
    assert osm.slot_wait_s(api, get=lambda *a, **k: far) == osm.OVERPASS_SLOT_WAIT_MAX_S

    def boom(*a, **k):
        raise requests.ConnectionError("status down")
    assert osm.slot_wait_s(api, get=boom) == 0
    # Mirrors have no such page: never even asked.
    assert osm.slot_wait_s("https://overpass.kumi.systems/api/interpreter",
                           get=boom) == 0
    assert osm.slot_wait_s("http://m1", get=boom) == 0


def test_fetch_sleeps_the_reported_slot_wait_before_querying(monkeypatch):
    slept, asked = [], []
    monkeypatch.setattr(osm, "slot_wait_s", lambda url: asked.append(url) or 7)
    monkeypatch.setattr(osm.time, "sleep", lambda s: slept.append(s))
    get, seen, _ = _fake_get([200])
    monkeypatch.setattr(osm.requests, "get", get)
    fetch_overpass("out;", urls=["http://m1"], retries=1, backoff=0)
    assert asked == ["http://m1"] and slept == [7]  # asked first, waited, then queried
