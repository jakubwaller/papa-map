import json
import os
from datetime import datetime, timedelta, timezone

import requests

from pipeline import ops

NOW = datetime(2026, 8, 3, 5, 30, tzinfo=timezone.utc)  # a Monday
TUESDAY = datetime(2026, 8, 4, 5, 30, tzinfo=timezone.utc)


def geojson(features):
    return {"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": {"type": "Point", "coordinates": [10, 53]},
         "properties": {"osm_type": t, "osm_id": i, "status": s}}
        for t, i, s in features]}


def write(path, obj):
    path.write_text(json.dumps(obj))
    return str(path)


def fresh_stats(generated=None):
    return {"generated_at": (generated or NOW).isoformat(timespec="seconds")}


def fresh_delta(stats, now, minutes=2):
    """A healthy delta.json: ticked `minutes` ago, based on the dataset."""
    base = ((stats or {}).get("data_base") or (stats or {}).get("generated_at")
            or now.isoformat(timespec="seconds"))
    return {"generated": (now - timedelta(minutes=minutes)).isoformat(
                timespec="seconds"),
            "base": base, "seq": 7307321,
            "tables": {"upsert": [], "remove": []},
            "places": {"upsert": [], "remove": []},
            "new_toilets_no_table": []}


def run(tmp_path, *, stats, gj, state=None, now=NOW, mails=None,
        delta="fresh", delta_state=None, stats_mtime=None):
    """`stats_mtime` dates the stats.json write; default is when it is
    written here, i.e. the real clock, not `now`."""
    state_path = tmp_path / "state.json"
    if delta == "off":
        delta_path = ""
    elif delta is None:
        delta_path = str(tmp_path / "absent-delta.json")
    else:
        delta_path = write(tmp_path / "delta.json",
                           fresh_delta(stats, now) if delta == "fresh"
                           else delta)
    delta_state_path = (write(tmp_path / "delta-state.json", delta_state)
                        if delta_state is not None
                        else str(tmp_path / "absent-delta-state.json"))
    if state is not None:
        write(state_path, state)
    sent = mails if mails is not None else []
    stats_path = (write(tmp_path / "stats.json", stats) if stats is not None
                  else str(tmp_path / "absent-stats.json"))
    if stats is not None and stats_mtime is not None:
        os.utime(stats_path, (stats_mtime.timestamp(),) * 2)
    anomalies, report = ops.run_check(
        now=now, state_path=str(state_path),
        stats_path=stats_path,
        geojson_path=write(tmp_path / "gj.json", gj) if gj is not None
        else str(tmp_path / "absent-gj.json"),
        mail=lambda subject, body: sent.append((subject, body)),
        visits_fetch=lambda **kw: None,
        edits_fetch=lambda **kw: None,
        html_path=str(tmp_path / "ops.html"),
        private_html_path=str(tmp_path / "private-ops.html"),
        delta_path=delta_path, delta_state_path=delta_state_path)
    return anomalies, report, sent, state_path


def test_healthy_non_monday_sends_nothing(tmp_path):
    anomalies, report, sent, _ = run(
        tmp_path, stats=fresh_stats(),
        gj=geojson([("node", 1, "unknown")]), now=TUESDAY)
    assert anomalies == [] and sent == []
    assert "1 features" in report


def test_monday_sends_all_clear_digest(tmp_path):
    _, _, sent, _ = run(tmp_path, stats=fresh_stats(),
                        gj=geojson([("node", 1, "accessible")]), now=NOW)
    assert [s for s, _ in sent] == ["[papamap] weekly: all clear"]


def test_stale_stats_alerts_any_day(tmp_path):
    old = datetime(2026, 8, 1, 4, 30, tzinfo=timezone.utc)  # 73h before TUESDAY
    anomalies, _, sent, _ = run(tmp_path, stats=fresh_stats(old),
                                gj=geojson([("node", 1, "unknown")]), now=TUESDAY)
    assert any("stale" in a for a in anomalies)
    assert sent and sent[0][0].startswith("[papamap] ALERT")


def test_missing_files_alert(tmp_path):
    anomalies, _, sent, _ = run(tmp_path, stats=None, gj=None, now=TUESDAY)
    assert len(anomalies) == 2 and sent[0][0].startswith("[papamap] ALERT")


def test_count_drop_alerts_but_wobble_does_not(tmp_path):
    state = {"statuses": {}, "history": [
        {"date": "2026-08-03", "counts": {"total": 100, "accessible": 0,
                                          "female_only": 0, "unknown": 100},
         "changes": ops.diff_statuses({}, {})}]}
    anomalies, _, _, _ = run(
        tmp_path, stats=fresh_stats(TUESDAY), now=TUESDAY, state=state,
        gj=geojson([("node", i, "unknown") for i in range(70)]))
    assert any("dropped" in a for a in anomalies)
    anomalies, _, _, _ = run(
        tmp_path, stats=fresh_stats(TUESDAY), now=TUESDAY, state=state,
        gj=geojson([("node", i, "unknown") for i in range(95)]))
    assert anomalies == []


def test_transitions_counted_and_state_updated(tmp_path):
    state = {"statuses": {"node/1": "unknown", "node/2": "unknown",
                          "node/3": "accessible"},
             "history": [{"date": "2026-08-03",
                          "counts": {"total": 3, "accessible": 1,
                                     "female_only": 0, "unknown": 2},
                          "changes": ops.diff_statuses({}, {})}]}
    _, report, _, state_path = run(
        tmp_path, stats=fresh_stats(TUESDAY), now=TUESDAY, state=state,
        gj=geojson([("node", 1, "accessible"), ("node", 2, "female_only"),
                    ("node", 4, "unknown")]))
    assert "1 -> accessible" in report and "1 -> female-only" in report
    assert "+1 new" in report and "-1 gone" in report
    new_state = json.loads(state_path.read_text())
    assert new_state["statuses"]["node/1"] == "accessible"
    assert len(new_state["history"]) == 2


def test_history_capped(tmp_path):
    entry = {"date": "2026-01-01",
             "counts": {"total": 1, "accessible": 0, "female_only": 0,
                        "unknown": 1},
             "changes": ops.diff_statuses({}, {})}
    state = {"statuses": {}, "history": [dict(entry) for _ in range(ops.HISTORY_DAYS + 20)]}
    _, _, _, state_path = run(tmp_path, stats=fresh_stats(TUESDAY),
                              now=TUESDAY, state=state,
                              gj=geojson([("node", 1, "unknown")]))
    assert len(json.loads(state_path.read_text())["history"]) == ops.HISTORY_DAYS


def test_first_run_has_no_diff_or_drop_alert(tmp_path):
    anomalies, report, _, _ = run(tmp_path, stats=fresh_stats(TUESDAY),
                                  now=TUESDAY,
                                  gj=geojson([("node", 1, "unknown")]))
    assert anomalies == []
    assert "since yesterday" not in report


def test_unparsable_generated_at_alerts(tmp_path):
    anomalies, _, _, _ = run(tmp_path, stats={"generated_at": "soon"},
                             gj=geojson([("node", 1, "unknown")]), now=TUESDAY)
    assert any("generated_at" in a for a in anomalies)


def test_osmcha_edits_without_token_is_none(monkeypatch):
    monkeypatch.delenv("OSMCHA_TOKEN", raising=False)
    assert ops.osmcha_edits(get=lambda *a, **kw: 1 / 0) is None


def test_osmcha_edits_queries_theme_url_and_window(monkeypatch):
    monkeypatch.setenv("OSMCHA_TOKEN", "token")
    seen = {}

    calls = []

    def fake_get(url, timeout, headers, params):
        seen.update(url=url, headers=headers, params=params)
        calls.append(params)

        class R:
            def json(self):
                if len(calls) == 1:
                    return {"count": 3, "features": []}
                return {"count": 2, "features": [
                    {"properties": {"date": "2026-08-01T10:00:00Z"}},
                    {"properties": {"date": "2026-08-02T23:59:00Z"}}]}
        return R()

    edits = ops.osmcha_edits(now=NOW, get=fake_get)
    assert edits["days"] == 7 and edits["changesets"] == 3
    # the answers come back as a page too, grouped by complete day like the
    # theme's — their own series, never merged into by_day
    assert calls[1]["page_size"] == "100"
    assert edits["web_by_day"] == {"2026-07-27": 0, "2026-07-28": 0,
                                   "2026-07-29": 0, "2026-07-30": 0,
                                   "2026-07-31": 0, "2026-08-01": 1,
                                   "2026-08-02": 1}
    assert set(edits["by_day"].values()) == {0}  # the theme page: no features
    assert seen["url"] == ops.OSMCHA_URL
    assert seen["headers"]["Authorization"] == "Token token"
    # the changeset theme tag is the theme URL, not the id (MapComplete
    # stamps remote themes with forcedId = link); the second query is the
    # in-page answers, which web/osm.js tags created_by=PapaMap, counted
    # apart from the theme's and never added to it — through OSMCha's
    # `editor` filter, because created_by lives in that column and never in
    # the metadata JSON: `metadata=created_by=PapaMap` is a guaranteed 0
    # (what the digest printed from 2026-09-13 to 2026-10-05).
    assert calls[0]["metadata"] == f"theme={ops.PAPAMAP_THEME_URL}"
    assert calls[1]["editor"] == "PapaMap"
    assert "metadata" not in calls[1]
    assert calls[0]["date__gte"] == calls[1]["date__gte"] == "2026-07-27"  # NOW minus 7 days
    assert edits["web_changesets"] == 2
    report = ops.render_report(None, None, [], [], edits=edits)
    assert "edits via papamap theme (OSMCha, 7d): 3 changesets" in report
    assert "answers on the map itself (OSMCha, created_by=PapaMap, 7d): 2 changesets" in report


def test_osmcha_second_query_failing_keeps_the_theme_count(monkeypatch):
    """The created_by slice is decoration on top of the theme count: when its
    query dies (a second call on a day the theme query's metadata scan has
    already taken 150 s) the
    theme count, its chart point and the cache all survive; only the
    'answers on the map itself' line is missing."""
    monkeypatch.setenv("OSMCHA_TOKEN", "token")
    calls = []

    def fake_get(url, timeout, headers, params):
        calls.append(params)
        if len(calls) == 2:
            raise TimeoutError("read timed out")

        class R:
            def json(self):
                return {"count": 3, "features": []}
        return R()

    edits = ops.osmcha_edits(now=NOW, get=fake_get)
    assert edits["changesets"] == 3 and "error" not in edits
    assert "web_changesets" not in edits
    report = ops.render_report(None, None, [], [], edits=edits)
    assert "edits via papamap theme (OSMCha, 7d): 3 changesets" in report
    assert "answers on the map itself" not in report


def test_osmcha_edits_groups_by_complete_day(monkeypatch):
    """The chart's series: one count per complete day the window covers —
    a day without a changeset is a 0, not a hole, and today (partial at
    07:30) is left for tomorrow's window to report whole."""
    monkeypatch.setenv("OSMCHA_TOKEN", "token")
    features = [{"properties": {"date": d}} for d in
                ("2026-08-02T09:15:00Z", "2026-08-02T18:00:00Z",
                 "2026-07-29T12:00:00Z", "2026-08-03T04:00:00Z")]  # last=today

    def fake_get(url, timeout, headers, params):
        class R:
            def json(self):
                return {"count": 4, "features": features}
        return R()

    edits = ops.osmcha_edits(now=NOW, get=fake_get)   # NOW is 2026-08-03
    assert edits["changesets"] == 4                   # the dated total is whole
    assert edits["by_day"] == {"2026-07-27": 0, "2026-07-28": 0,
                               "2026-07-29": 1, "2026-07-30": 0,
                               "2026-07-31": 0, "2026-08-01": 0,
                               "2026-08-02": 2}       # today's edit excluded


def test_osmcha_truncated_page_keeps_the_count_but_not_the_days(monkeypatch,
                                                                capsys):
    """More changesets than one page: a partial grouping would silently
    under-draw days, and following pagination repeats OSMCha's expensive
    scan — so by_day is dropped for the run and the count stays exact."""
    monkeypatch.setenv("OSMCHA_TOKEN", "token")

    def fake_get(url, timeout, headers, params):
        class R:
            def json(self):
                return {"count": 250, "next": "https://osmcha.org/?page=2",
                        "features": [{"properties": {"date": "2026-08-02T09:00:00Z"}}]}
        return R()

    edits = ops.osmcha_edits(now=NOW, get=fake_get)
    assert edits["changesets"] == 250
    assert "by_day" not in edits
    assert "exceeds one page" in capsys.readouterr().err


def test_merge_edits_overwrites_fetched_days_and_caps():
    kept = {"2026-07-27": 1, "2026-08-01": 5}
    merged = ops.merge_edits(kept, {"by_day": {"2026-08-01": 2,
                                               "2026-08-02": 3}})
    assert merged == {"2026-07-27": 1, "2026-08-01": 2, "2026-08-02": 3}
    assert ops.merge_edits(kept, None) == dict(sorted(kept.items()))
    assert ops.merge_edits(kept, {"days": 7, "error": "timed out"}) == \
        dict(sorted(kept.items()))
    # the answers series is merged from its own key, and never from by_day
    both = {"by_day": {"2026-08-01": 2}, "web_by_day": {"2026-08-01": 1}}
    assert ops.merge_edits({}, both, "web_by_day") == {"2026-08-01": 1}
    assert ops.merge_edits({}, both) == {"2026-08-01": 2}
    from datetime import date, timedelta
    many = {(date(2024, 1, 1) + timedelta(days=i)).isoformat(): 1
            for i in range(500)}
    assert len(ops.merge_edits(many, {"by_day": {"2026-08-02": 1}})) == \
        ops.EDITS_HISTORY_DAYS


def test_backfill_edits_merges_the_days_and_touches_nothing_else(tmp_path,
                                                               capsys):
    """One wider fetch fills the days before the daily fetch existed; the
    snapshot, history and cached line stay as they were, and a fetch that
    returns no split (beyond one page, failed, no token) changes nothing."""
    state_path = tmp_path / "state.json"
    state = {"statuses": {"node/1": "accessible"},
             "history": [{"date": "2026-09-11", "counts": {}, "changes": {}}],
             "edits": {"days": 7, "changesets": 15, "as_of": "2026-09-12"},
             "edits_days": {"2026-08-25": 0, "2026-08-26": 1}}
    write(state_path, state)
    seen = {}

    def fetch(days, now):
        seen["days"] = days
        return {"days": days, "changesets": 40,
                "by_day": {"2026-08-13": 2, "2026-08-14": 3, "2026-08-25": 1}}

    now = datetime(2026, 9, 12, 8, 0, tzinfo=timezone.utc)
    edits = ops.backfill_edits(31, state_path=str(state_path), now=now,
                               fetch=fetch)
    assert seen["days"] == 31 and edits["changesets"] == 40
    saved = json.loads(state_path.read_text())
    assert saved["edits_days"] == {"2026-08-13": 2, "2026-08-14": 3,
                                   "2026-08-25": 1, "2026-08-26": 1}
    for key in ("statuses", "history", "edits"):
        assert saved[key] == state[key]
    out = capsys.readouterr().out
    assert "40 changesets in the 31 days to 2026-09-12" in out
    # 2026-08-25 came back as 1 where the state held 0: overwritten and said
    assert ("2 days added (2026-08-13 → 2026-08-14), 1 recorded day changed, "
            "history now 4 days") in out

    before = state_path.read_text()
    assert ops.backfill_edits(31, state_path=str(state_path), now=now,
                              fetch=lambda **kw: {"days": 31, "changesets": 400})
    assert state_path.read_text() == before
    assert "no new days, history unchanged at 4 days" in capsys.readouterr().out
    # a day OSMCha now counts differently (a changeset deleted since) is
    # written and said, not called unchanged
    assert ops.backfill_edits(31, state_path=str(state_path), now=now,
                              fetch=lambda **kw: {"days": 31, "changesets": 39,
                                                  "by_day": {"2026-08-14": 2}})
    assert json.loads(state_path.read_text())["edits_days"]["2026-08-14"] == 2
    assert ("no new days, 1 recorded day changed, history now 4 days"
            in capsys.readouterr().out)
    before = state_path.read_text()
    failed = ops.backfill_edits(31, state_path=str(state_path), now=now,
                                fetch=lambda **kw: {"days": 31, "error": "x"})
    assert failed["error"] == "x" and state_path.read_text() == before
    assert ops.backfill_edits(31, state_path=str(state_path), now=now,
                              fetch=lambda **kw: None) is None
    assert "OSMCHA_TOKEN unset" in capsys.readouterr().err


def test_backfill_edits_fills_the_answers_series_too(tmp_path, capsys):
    """The fetch carries both series; both are merged and each is said on
    its own line. A fetch with the answers count but no split (beyond one
    page) leaves that series alone and says so; a fetch without the count
    at all (the second query failed) does not touch it either."""
    state_path = tmp_path / "state.json"
    write(state_path, {"statuses": {}, "history": [],
                       "edits_days": {"2026-09-01": 1},
                       "web_edits_days": {"2026-09-13": 1}})
    now = datetime(2026, 10, 5, 8, 0, tzinfo=timezone.utc)
    ops.backfill_edits(31, state_path=str(state_path), now=now,
                       fetch=lambda **kw: {
                           "days": 31, "changesets": 40,
                           "by_day": {"2026-09-04": 2},
                           "web_changesets": 9,
                           "web_by_day": {"2026-09-13": 2, "2026-09-14": 3}})
    saved = json.loads(state_path.read_text())
    assert saved["edits_days"] == {"2026-09-01": 1, "2026-09-04": 2}
    assert saved["web_edits_days"] == {"2026-09-13": 2, "2026-09-14": 3}
    out = capsys.readouterr().out
    assert "40 changesets in the 31 days to 2026-10-05; 1 days added" in out
    assert ("9 answers on the map itself in the same window; 1 days added "
            "(2026-09-14 → 2026-09-14), 1 recorded day changed, "
            "history now 2 days") in out
    before = state_path.read_text()
    ops.backfill_edits(31, state_path=str(state_path), now=now,
                       fetch=lambda **kw: {"days": 31, "changesets": 400,
                                           "web_changesets": 120})
    assert state_path.read_text() == before
    assert ("120 answers on the map itself in the same window; no new days, "
            "history unchanged at 2 days") in capsys.readouterr().out
    ops.backfill_edits(31, state_path=str(state_path), now=now,
                       fetch=lambda **kw: {"days": 31, "changesets": 400})
    assert state_path.read_text() == before
    assert "answers on the map itself" not in capsys.readouterr().out


def test_osmcha_edits_failure_reports_itself_rather_than_reading_as_zero(
        monkeypatch):
    """A failed query and a genuine zero must not render the same. The
    JSONB scan behind the metadata filter slows down as OSM grows — it went
    21.9 s -> 150 s+ in five days — so this failure is expected to recur,
    and "0 changesets" is the answer nobody may guess from silence."""
    monkeypatch.setenv("OSMCHA_TOKEN", "token")

    def boom(*a, **kw):
        raise requests.exceptions.ReadTimeout(
            "HTTPSConnectionPool(host='osmcha.org', port=443): "
            "Read timed out. (read timeout=300)")

    edits = ops.osmcha_edits(now=NOW, get=boom)
    assert edits["days"] == 7
    assert "changesets" not in edits  # never a number we did not receive
    assert "Read timed out" in edits["error"]

    line = [ln for ln in ops.render_report(None, None, [], [], edits=edits)
            .splitlines() if "OSMCha" in ln]
    assert len(line) == 1
    assert "UNKNOWN" in line[0] and "Not zero." in line[0]


def test_osmcha_timeout_is_generous_enough_for_the_jsonb_scan():
    """Guards the 2026-08-18 regression: at 120 s the query timed out and
    the digest silently dropped the line for weeks."""
    assert ops.OSMCHA_TIMEOUT_S >= 300


def test_osmcha_edits_passes_the_configured_timeout(monkeypatch):
    monkeypatch.setenv("OSMCHA_TOKEN", "token")
    seen = {}

    def fake_get(url, timeout, headers, params):
        seen["timeout"] = timeout

        class R:
            def json(self):
                return {"count": 0, "features": []}
        return R()

    edits = ops.osmcha_edits(now=NOW, get=fake_get)
    assert edits["days"] == 7 and edits["changesets"] == 0
    assert seen["timeout"] == ops.OSMCHA_TIMEOUT_S


def test_a_genuine_zero_still_prints(tmp_path):
    """`if edits:` on a dict is truthy at zero — keep it that way, since
    "0 changesets" is a real and reportable answer."""
    report = ops.render_report(None, None, [], [],
                               edits={"days": 7, "changesets": 0})
    assert "0 changesets" in report


def test_digest_carries_edits_line(tmp_path):
    sent = []
    ops.run_check(
        now=NOW, state_path=str(tmp_path / "state.json"),
        stats_path=write(tmp_path / "stats.json", fresh_stats()),
        geojson_path=write(tmp_path / "gj.json",
                           geojson([("node", 1, "unknown")])),
        mail=lambda subject, body: sent.append((subject, body)),
        visits_fetch=lambda **kw: None,
        edits_fetch=lambda **kw: {"days": 7, "changesets": 2},
        html_path="", private_html_path="", delta_path="")
    assert "edits via papamap theme (OSMCha, 7d): 2 changesets" in sent[0][1]


def test_send_mail_unconfigured_is_false(monkeypatch):
    for key in ("PAPAMAP_SMTP_HOST", "PAPAMAP_SMTP_USER",
                "PAPAMAP_SMTP_PASSWORD", "PAPAMAP_OPS_TO"):
        monkeypatch.delenv(key, raising=False)
    assert ops.send_mail("s", "b") is False


def test_send_mail_smtp_flow(monkeypatch):
    monkeypatch.setenv("PAPAMAP_SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("PAPAMAP_SMTP_USER", "ops@example.com")
    monkeypatch.setenv("PAPAMAP_SMTP_PASSWORD", "token")
    monkeypatch.setenv("PAPAMAP_OPS_TO", "inbox@example.com")
    monkeypatch.delenv("PAPAMAP_OPS_FROM", raising=False)
    calls = {}

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            calls["connect"] = (host, port)

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def starttls(self):
            calls["starttls"] = True

        def login(self, user, password):
            calls["login"] = (user, password)

        def send_message(self, msg):
            calls["msg"] = msg

    assert ops.send_mail("subject", "body", smtp=FakeSMTP) is True
    assert calls["connect"] == ("smtp.example.com", 587)
    assert calls["starttls"] and calls["login"] == ("ops@example.com", "token")
    assert calls["msg"]["From"] == "ops@example.com"
    assert calls["msg"]["To"] == "inbox@example.com"
    assert calls["msg"]["Subject"] == "subject"


def test_feature_statuses_skip_the_key_locked_tables():
    # v26 keeps them in the GeoJSON for the wheelchair chip; the report's
    # totals and day-over-day diff are over the pins, like the map's numbers.
    def feat(i, **props):
        return {"type": "Feature", "properties": {"osm_type": "node", "osm_id": i,
                                                  "status": "accessible", **props}}
    fc = {"features": [feat(1), feat(2, key="eurokey"), feat(3, key=None)]}
    assert ops.feature_statuses(fc) == {"node/1": "accessible", "node/3": "accessible"}


# ---- Live updates (delta.json) -------------------------------------------------

def test_healthy_with_fresh_delta_reports_the_live_updates_line(tmp_path):
    anomalies, report, sent, _ = run(
        tmp_path, stats=fresh_stats(), gj=geojson([("node", 1, "unknown")]),
        now=TUESDAY)
    assert anomalies == [] and sent == []
    assert ("live updates: seq 7,307,321, last tick 2026-08-04T05:28:00+00:00 "
            "(2 min ago), +0/-0 tables, +0/-0 places since the base") in report


def test_missing_delta_alerts(tmp_path):
    anomalies, _, sent, _ = run(
        tmp_path, stats=fresh_stats(TUESDAY), gj=geojson([("node", 1, "unknown")]),
        now=TUESDAY, delta=None)
    assert anomalies == [
        "delta.json is missing or unreadable — is the live-updates follower "
        "running? (docker compose up -d delta)"]
    assert sent[0][0].startswith("[papamap] ALERT")


def test_empty_delta_path_disables_the_check(tmp_path):
    anomalies, report, sent, _ = run(
        tmp_path, stats=fresh_stats(TUESDAY), gj=geojson([("node", 1, "unknown")]),
        now=TUESDAY, delta="off")
    assert anomalies == [] and sent == []
    assert "live updates" not in report


def test_stale_delta_alerts(tmp_path):
    stats = fresh_stats(TUESDAY)
    anomalies, _, _, _ = run(
        tmp_path, stats=stats, gj=geojson([("node", 1, "unknown")]),
        now=TUESDAY, delta=fresh_delta(stats, TUESDAY, minutes=45))
    assert len(anomalies) == 1
    assert "live updates are stale" in anomalies[0]
    assert "45 min old (limit 30 min)" in anomalies[0]


def test_delta_base_behind_alerts_after_the_grace_period(tmp_path):
    # generated_at is the build's START; a late build wrote stats.json
    # hours after it.
    five_h_ago = TUESDAY - timedelta(hours=5)
    stats = {"generated_at": five_h_ago.isoformat(timespec="seconds"),
             "data_base": "2026-08-03T02:00:00Z"}
    delta = fresh_delta(stats, TUESDAY)
    delta["base"] = "2026-08-02T02:00:00Z"
    anomalies, report, _, _ = run(
        tmp_path, stats=stats, gj=geojson([("node", 1, "unknown")]),
        now=TUESDAY, delta=delta, stats_mtime=TUESDAY - timedelta(hours=2))
    assert len(anomalies) == 1
    assert "base 2026-08-02T02:00:00Z is behind the dataset's data_base " \
           "2026-08-03T02:00:00Z" in anomalies[0]
    assert "base BEHIND the dataset" in report

    # The build wrote stats.json three minutes ago: the follower needs a
    # tick, however long ago the build started.
    anomalies, _, _, _ = run(
        tmp_path, stats=stats, gj=geojson([("node", 1, "unknown")]),
        now=TUESDAY, delta=delta, stats_mtime=TUESDAY - timedelta(minutes=3))
    assert anomalies == []


def test_rebase_grace_falls_back_to_generated_at_without_a_write_time():
    stats = {"generated_at": (TUESDAY - timedelta(hours=5)).isoformat(
                 timespec="seconds"),
             "data_base": "2026-08-03T02:00:00Z"}
    delta = ops.delta_summary(
        dict(fresh_delta(stats, TUESDAY), base="2026-08-02T02:00:00Z"),
        None, stats, TUESDAY)
    def behind(**kw):
        return [a for a in ops.find_anomalies(
            stats, None, None, TUESDAY, delta=delta, delta_expected=True, **kw)
            if "has not rebased" in a]
    assert behind(stats_written=TUESDAY - timedelta(minutes=3)) == []
    assert len(behind(stats_written=TUESDAY - timedelta(hours=2))) == 1
    assert len(behind(stats_written=None)) == 1
    stats["generated_at"] = (TUESDAY - timedelta(minutes=3)).isoformat(
        timespec="seconds")
    assert behind(stats_written=None) == []


def test_unparsable_delta_generated_alerts(tmp_path):
    stats = fresh_stats(TUESDAY)
    delta = fresh_delta(stats, TUESDAY)
    delta["generated"] = "yesterday-ish"
    anomalies, _, _, _ = run(
        tmp_path, stats=stats, gj=geojson([("node", 1, "unknown")]),
        now=TUESDAY, delta=delta)
    assert anomalies == [
        "delta.json has no parsable generated ('yesterday-ish')"]


def test_delta_summary_counts_and_pending():
    delta = {"generated": "2026-08-03T05:29:00+00:00", "base": "B", "seq": 5,
             "tables": {"upsert": [{}, {}], "remove": ["u"]},
             "places": {"upsert": [{}], "remove": []},
             "new_toilets_no_table": [{}, {}, {}]}
    state = {"seq": 5, "base": "B", "pending": [
        {"type": "node", "id": 1, "version": 2, "attempts": 0,
         "since": "2026-08-03T05:00:00+00:00"},
        {"type": "way", "id": 2, "version": 1, "attempts": 3,
         "since": "2026-08-02T23:00:00+00:00"}]}
    s = ops.delta_summary(delta, state, {"generated_at": "B"}, NOW)
    assert (s["tables_upsert"], s["tables_remove"]) == (2, 1)
    assert (s["places_upsert"], s["places_remove"]) == (1, 0)
    assert s["toilets_no_table"] == 3 and s["seq"] == 5
    assert s["age_min"] == 1.0 and s["stale"] is False
    assert s["data_base"] == "B" and s["base_ok"] is True
    assert s["pending"] == 2
    assert s["pending_oldest"] == "2026-08-02T23:00:00+00:00"
    assert s["pending_max_attempts"] == 3

    # An older follower wrote no queue: nothing pending is the honest answer.
    s = ops.delta_summary(delta, {"seq": 5, "base": "B"}, None, NOW)
    assert s["pending"] == 0 and s["pending_oldest"] is None
    assert s["pending_max_attempts"] is None
    assert s["data_base"] is None and s["base_ok"] is None

    s = ops.delta_summary(delta, None, None, NOW)
    assert s["pending"] is None
    assert ops.delta_summary(None, None, None, NOW) is None


def test_delta_summary_survives_garbage():
    s = ops.delta_summary({"tables": "nope", "generated": 5},
                          {"pending": "x"}, {"generated_at": 7}, NOW)
    assert s["stale"] is True and s["age_min"] is None
    assert s["tables_upsert"] == 0 and s["places_remove"] == 0
    assert s["pending"] is None
    s = ops.delta_summary({"tables": {"upsert": 3}, "places": [1]},
                          {"pending": [1, {"since": 3, "attempts": "x"}]},
                          None, NOW)
    assert s["tables_upsert"] == 0


def test_mail_week_line_counts_tonight(tmp_path):
    # The page's 7-day row includes tonight; so must the mail's, or a jump
    # the alert says is "counted below" is missing from it.
    entry = {"date": "2026-08-01",
             "counts": {"total": 1, "accessible": 0, "female_only": 0,
                        "unknown": 1},
             "changes": dict(ops.diff_statuses({}, {}), new=2)}
    state = {"statuses": {"node/1": "unknown"},
             "history": [dict(entry) for _ in range(3)]}
    _, report, _, _ = run(
        tmp_path, stats=fresh_stats(TUESDAY), now=TUESDAY, state=state,
        gj=geojson([("node", 1, "accessible"), ("node", 2, "unknown")]))
    assert "last 4 days: +7 new, 1 -> accessible, 0 -> female-only" in report

    # A first run after a reset: tonight alone, singular.
    state = {"statuses": {"node/1": "unknown"}, "history": []}
    _, report, _, state_path = run(
        tmp_path, stats=fresh_stats(TUESDAY), now=TUESDAY, state=state,
        gj=geojson([("node", 1, "accessible")]))
    assert "last 1 day: +0 new, 1 -> accessible" in report
    assert len(json.loads(state_path.read_text())["history"]) == 1


def test_mail_week_line_includes_a_jump(tmp_path):
    entry = {"date": "2026-08-03",
             "counts": {"total": 2, "accessible": 0, "female_only": 0,
                        "unknown": 2},
             "changes": ops.diff_statuses({}, {})}
    state = {"statuses": {"node/1": "unknown", "node/2": "unknown"},
             "history": [entry]}
    anomalies, report, _, _ = run(
        tmp_path, stats=fresh_stats(TUESDAY), now=TUESDAY, state=state,
        gj=geojson([("node", i, "unknown") for i in range(1, 11)]))
    assert any("jumped 2 -> 10" in a for a in anomalies)
    assert "last 2 days: +8 new" in report
