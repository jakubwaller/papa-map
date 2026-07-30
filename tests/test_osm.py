import pytest
import requests

from pipeline import osm
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


def test_fetch_raises_when_all_mirrors_exhausted(monkeypatch):
    get, seen, _ = _fake_get([504, 504, 504, 504])
    monkeypatch.setattr(osm.requests, "get", get)
    monkeypatch.setattr(osm.time, "sleep", lambda s: None)
    with pytest.raises(requests.HTTPError):
        fetch_overpass("out;", urls=["http://m1", "http://m2"], retries=2, backoff=0)
    assert seen == ["http://m1", "http://m1", "http://m2", "http://m2"]
