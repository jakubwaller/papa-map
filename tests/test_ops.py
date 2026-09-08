import gzip
import json
from datetime import datetime, timezone
from pathlib import Path

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


def run(tmp_path, *, stats, gj, state=None, now=NOW, mails=None):
    state_path = tmp_path / "state.json"
    if state is not None:
        write(state_path, state)
    sent = mails if mails is not None else []
    anomalies, report = ops.run_check(
        now=now, state_path=str(state_path),
        stats_path=write(tmp_path / "stats.json", stats) if stats is not None
        else str(tmp_path / "absent-stats.json"),
        geojson_path=write(tmp_path / "gj.json", gj) if gj is not None
        else str(tmp_path / "absent-gj.json"),
        mail=lambda subject, body: sent.append((subject, body)),
        visits_fetch=lambda **kw: None,
        edits_fetch=lambda **kw: None,
        taps_read=lambda **kw: None,
        html_path=str(tmp_path / "ops.html"),
        private_html_path=str(tmp_path / "private-ops.html"))
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
    state = {"statuses": {}, "history": [dict(entry) for _ in range(120)]}
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

    def fake_get(url, timeout, headers, params):
        seen.update(url=url, headers=headers, params=params)

        class R:
            def json(self):
                return {"count": 3, "features": []}
        return R()

    edits = ops.osmcha_edits(now=NOW, get=fake_get)
    assert edits["days"] == 7 and edits["changesets"] == 3
    assert seen["url"] == ops.OSMCHA_URL
    assert seen["headers"]["Authorization"] == "Token token"
    # the changeset theme tag is the theme URL, not the id (MapComplete
    # stamps remote themes with forcedId = link)
    assert seen["params"]["metadata"] == f"theme={ops.PAPAMAP_THEME_URL}"
    assert seen["params"]["date__gte"] == "2026-07-27"  # NOW minus 7 days


def test_osmcha_edits_groups_by_complete_day(monkeypatch):
    """The chart's series: one count per complete day the window covers —
    a day without a changeset is a 0, not a hole, and today (partial at
    05:30) is left for tomorrow's window to report whole."""
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
    from datetime import date, timedelta
    many = {(date(2024, 1, 1) + timedelta(days=i)).isoformat(): 1
            for i in range(500)}
    assert len(ops.merge_edits(many, {"by_day": {"2026-08-02": 1}})) == \
        ops.EDITS_HISTORY_DAYS


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
        taps_read=lambda **kw: None,
        edits_fetch=lambda **kw: {"days": 7, "changesets": 2},
        html_path="", private_html_path="")
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


# ---- The app page's taps -----------------------------------------------------

def _ts(iso: str) -> float:
    return datetime.fromisoformat(iso).replace(tzinfo=timezone.utc).timestamp()


def _line(iso, method, uri, status):
    # The shape Caddy's json access log has after the Caddyfile's filter:
    # a timestamp, a method, a path, a status — nothing else.
    return json.dumps({"level": "info", "ts": _ts(iso), "logger": "http.log.access",
                       "msg": "handled request",
                       "request": {"method": method, "uri": uri}, "status": status})


def test_app_taps_counts_taps_per_utc_day_and_nothing_else(tmp_path):
    d = tmp_path / "caddy-logs"
    d.mkdir()
    (d / "app.log").write_text("\n".join([
        _line("2026-09-07T00:00:00", "POST", "/app/ja/iphone", 204),
        _line("2026-09-07T12:00:01", "POST", "/app/ja/android", 204),
        _line("2026-09-07T23:59:59", "POST", "/app/ja/iphone", 204),
        _line("2026-09-08T00:00:01", "POST", "/app/ja/iphone", 204),  # next UTC day
        _line("2026-09-07T12:00:04", "GET", "/app/ja/iphone", 404),    # a GET is not a tap
        _line("2026-09-07T12:00:05", "POST", "/app/ja/iphone", 404),   # no Origin: not answered 204
        _line("2026-09-07T12:00:06", "POST", "/app/ja/nope", 404),     # verify-curl, not a tap
        _line("2026-09-07T12:00:07", "GET", "/app.html", 200),         # never logged; skipped anyway
        "not json at all",
    ]) + "\n")
    # A rolled file, gzipped the way Caddy rolls them, counts too.
    with gzip.open(d / "app-2026-09-01T05-30-00.000.log.gz", "wt") as fh:
        fh.write(_line("2026-09-01T09:00:00", "POST", "/app/ja/android", 204) + "\n")
    assert ops.app_taps(str(d)) == {"by_day": {
        "2026-09-01": {"iphone": 0, "android": 1},
        "2026-09-07": {"iphone": 2, "android": 1},
        "2026-09-08": {"iphone": 1, "android": 0}}, "rejected": 1}


def test_app_taps_without_the_log_directory_is_none_and_empty_is_a_warn(tmp_path, capsys):
    assert ops.app_taps(str(tmp_path / "caddy-logs")) is None
    (tmp_path / "caddy-logs").mkdir()
    assert ops.app_taps(str(tmp_path / "caddy-logs")) == {"by_day": {}, "rejected": 0}
    assert "no app*.log in" in capsys.readouterr().err
    assert ops.app_taps("") is None  # empty override disables, like the page paths


def test_tap_paths_are_the_caddyfiles():
    caddy = (Path(__file__).resolve().parents[1] / "deploy"
             / "papamap.Caddyfile").read_text()
    assert f"path {' '.join(ops.APP_TAP_PATHS)}" in caddy
    assert "header Origin https://papamap.de" in caddy
    assert "handle @tap {" in caddy and "respond 204" in caddy
    assert 'header Cache-Control "no-store"' in caddy
    # Only the tap paths are ever logged — no page views.
    assert "not path /app/ja/*" in caddy and "log_skip @outside_taps" in caddy
    for field in ("request>remote_ip", "request>client_ip", "request>headers",
                  "request>host", "request>proto"):
        assert f"{field} delete" in caddy, field


def test_merge_taps_keeps_the_larger_count_per_day_and_the_rolled_away_days():
    kept = {"2026-08-01": {"iphone": 5, "android": 1},          # rolled away: kept
            "2026-09-06": {"iphone": 3, "android": 2},          # half rolled away: kept
            "2026-09-07": {"iphone": 1, "android": 0}}          # yesterday partial: healed
    taps = {"by_day": {"2026-09-06": {"iphone": 1, "android": 2},
                       "2026-09-07": {"iphone": 4, "android": 2},
                       "2026-09-08": {"iphone": 1, "android": 0}}}
    merged = ops.merge_taps(kept, taps)
    assert merged == {"2026-08-01": {"iphone": 5, "android": 1},
                      "2026-09-06": {"iphone": 3, "android": 2},
                      "2026-09-07": {"iphone": 4, "android": 2},
                      "2026-09-08": {"iphone": 1, "android": 0}}
    assert list(merged) == sorted(merged)
    assert ops.merge_taps(kept, None) == kept
    assert ops.merge_taps({}, {"by_day": {}}) == {}


def test_taps_totals_week_is_seven_calendar_days_ending_today():
    now = datetime(2026, 9, 8, 5, 30, tzinfo=timezone.utc)
    days = {"2026-09-01": {"iphone": 1, "android": 0},   # 8th day back: out
            "2026-09-02": {"iphone": 1, "android": 0},   # 7th: in
            "2026-09-08": {"iphone": 1, "android": 2}}   # today: in
    assert ops.taps_totals(days, now) == {"iphone": 3, "android": 2, "recent": 4, "days": 7}
    assert ops.taps_totals({}, now) is None


def test_report_carries_the_tap_line_every_day_and_state_keeps_the_days(tmp_path):
    taps = {"by_day": {"2026-08-03": {"iphone": 4, "android": 2}}}
    state_path = tmp_path / "state.json"
    write(state_path, {"statuses": {}, "history": [],
                       "app_taps": {"2026-07-01": {"iphone": 1, "android": 0}}})
    sent = []
    _, report = ops.run_check(
        now=TUESDAY, state_path=str(state_path),
        stats_path=write(tmp_path / "stats.json", fresh_stats(TUESDAY)),
        geojson_path=write(tmp_path / "gj.json", geojson([("node", 1, "unknown")])),
        mail=lambda subject, body: sent.append((subject, body)),
        visits_fetch=lambda **kw: None, edits_fetch=lambda **kw: None,
        taps_read=lambda **kw: taps,
        html_path=str(tmp_path / "ops.html"),
        private_html_path=str(tmp_path / "private-ops.html"))
    # A Tuesday: no mail, but the line is in the report (ops.log) regardless.
    assert sent == []
    assert "app page: 5 iPhone + 2 Android taps in all (6 in the last 7d)" in report
    state = json.loads(state_path.read_text())
    assert state["app_taps"] == {"2026-07-01": {"iphone": 1, "android": 0},
                                 "2026-08-03": {"iphone": 4, "android": 2}}
    private = (tmp_path / "private-ops.html").read_text()
    assert "<h2>App page</h2>" in private and "7</b><span>taps, all 2 days" in private
    assert "App page" not in (tmp_path / "ops.html").read_text()


def test_report_has_no_tap_line_without_any_history(tmp_path):
    _, report, _, _ = run(tmp_path, stats=fresh_stats(), gj=geojson([]))
    assert "app page" not in report


def test_app_taps_survives_a_half_written_rolled_gz_and_skips_its_twin(tmp_path, capsys):
    d = tmp_path / "caddy-logs"
    d.mkdir()
    good = _line("2026-09-07T12:00:00", "POST", "/app/ja/iphone", 204)
    # Caddy mid-roll: the finished plain file and its half-written .gz twin.
    (d / "app-2026-09-06T05-30-00.000.log").write_text(good + "\n")
    (d / "app-2026-09-06T05-30-00.000.log.gz").write_bytes(b"\x1f\x8b\x08\x00trunc")
    # A corrupt .gz without a twin: warned about, not fatal.
    (d / "app-2026-09-01T05-30-00.000.log.gz").write_bytes(
        b"\x1f\x8b\x08\x00\x00\x00\x00\x00\x00\x03garbage")
    (d / "app.log").write_text(good + "\n")
    assert ops.app_taps(str(d))["by_day"] == {"2026-09-07": {"iphone": 2, "android": 0}}
    err = capsys.readouterr().err
    assert "app-2026-09-01T05-30-00.000.log.gz unreadable" in err
    assert "app-2026-09-06" not in err  # the twin was skipped, not read


def test_app_taps_warns_when_the_timestamp_format_changes(tmp_path, capsys):
    d = tmp_path / "caddy-logs"
    d.mkdir()
    (d / "app.log").write_text(json.dumps({
        "ts": "2026-09-07T12:00:00Z",
        "request": {"method": "POST", "uri": "/app/ja/iphone"}, "status": 204}) + "\n")
    assert ops.app_taps(str(d))["by_day"] == {}
    assert "1 app-log lines had no unix-seconds ts" in capsys.readouterr().err


def test_app_taps_counts_upper_case_paths_like_caddy_answers_them(tmp_path):
    d = tmp_path / "caddy-logs"
    d.mkdir()
    (d / "app.log").write_text(
        _line("2026-09-07T12:00:00", "POST", "/APP/JA/ANDROID", 204) + "\n"
        + _line("2026-09-07T12:00:01", "POST", "/app/ja/iph%6Fne", 204) + "\n")
    assert ops.app_taps(str(d))["by_day"] == {"2026-09-07": {"iphone": 1, "android": 1}}


def test_refused_taps_outnumbering_counted_ones_is_a_warn(tmp_path, capsys):
    """A tap path answering 404 is the Origin gate refusing the request. The
    page never sees that (fetch resolves, "Danke" shows), so zero taps would
    read as no interest — the run has to say so instead."""
    d = tmp_path / "caddy-logs"
    d.mkdir()
    now = datetime(2026, 9, 8, 5, 30, tzinfo=timezone.utc)
    (d / "app.log").write_text("\n".join([
        _line("2026-09-07T12:00:00", "POST", "/app/ja/iphone", 404),
        _line("2026-09-07T12:00:01", "POST", "/app/ja/android", 404),
        _line("2026-09-08T04:00:00", "POST", "/app/ja/iphone", 404),
        _line("2026-09-07T12:00:02", "POST", "/app/ja/iphone", 204),
    ]) + "\n")
    out = ops.app_taps(str(d), now=now)
    assert out["rejected"] == 3 and out["by_day"] == {"2026-09-07": {"iphone": 1, "android": 0}}
    assert ("3 tap POSTs were refused (not 204) against 1 counted in the last 7 days"
            in capsys.readouterr().err)
    # The other way round — a stray curl or two — is not worth a line, and
    # neither are two with nothing counted yet: the deploy's own verify-curl
    # is one of them.
    (d / "app.log").write_text("\n".join([
        _line("2026-09-07T12:00:00", "POST", "/app/ja/iphone", 404),
        _line("2026-09-07T12:00:01", "POST", "/app/ja/iphone", 404),
    ]) + "\n")
    ops.app_taps(str(d), now=now)
    assert "refused" not in capsys.readouterr().err
    (d / "app.log").write_text("\n".join([
        _line("2026-09-07T12:00:00", "POST", "/app/ja/iphone", 404),
        _line("2026-09-07T12:00:02", "POST", "/app/ja/iphone", 204),
        _line("2026-09-07T12:00:03", "POST", "/app/ja/iphone", 204),
    ]) + "\n")
    ops.app_taps(str(d), now=now)
    assert "refused" not in capsys.readouterr().err


def test_refused_taps_are_judged_against_recent_days_not_all_time(tmp_path, capsys):
    """A page that worked for a month and then broke has hundreds of counted
    taps behind it; the week in which every tap is refused must still warn.
    And refusals older than the window are history, not a warning."""
    d = tmp_path / "caddy-logs"
    d.mkdir()
    now = datetime(2026, 10, 8, 5, 30, tzinfo=timezone.utc)
    good_month = [_line(f"2026-09-{day:02d}T12:00:00", "POST", "/app/ja/iphone", 204)
                  for day in range(1, 31) for _ in range(10)]
    broken_week = [_line(f"2026-10-0{day}T12:00:00", "POST", "/app/ja/android", 404)
                   for day in range(2, 8)]
    (d / "app.log").write_text("\n".join(good_month + broken_week) + "\n")
    out = ops.app_taps(str(d), now=now)
    assert out["rejected"] == 6 and sum(v["iphone"] for v in out["by_day"].values()) == 300
    assert "6 tap POSTs were refused (not 204) against 0 counted" in capsys.readouterr().err
    # The same refusals seen a fortnight later, with taps flowing again
    (d / "app.log").write_text("\n".join(
        broken_week + [_line("2026-10-20T12:00:00", "POST", "/app/ja/iphone", 204)]) + "\n")
    ops.app_taps(str(d), now=datetime(2026, 10, 22, tzinfo=timezone.utc))
    assert "refused" not in capsys.readouterr().err


def test_vanished_log_directory_with_history_is_a_warn(tmp_path, capsys):
    state_path = tmp_path / "state.json"
    write(state_path, {"statuses": {}, "history": [],
                       "app_taps": {"2026-07-01": {"iphone": 1, "android": 0}}})
    ops.run_check(
        now=TUESDAY, state_path=str(state_path),
        stats_path=write(tmp_path / "stats.json", fresh_stats(TUESDAY)),
        geojson_path=write(tmp_path / "gj.json", geojson([("node", 1, "unknown")])),
        mail=lambda *a: None, visits_fetch=lambda **kw: None,
        edits_fetch=lambda **kw: None, taps_read=lambda **kw: None,
        html_path="", private_html_path="")
    assert "app-log directory is gone but the tap history is not" in capsys.readouterr().err
    # Without history, the same None is a checkout without the container: quiet.
    write(state_path, {"statuses": {}, "history": []})
    ops.run_check(
        now=TUESDAY, state_path=str(state_path),
        stats_path=str(tmp_path / "stats.json"), geojson_path=str(tmp_path / "gj.json"),
        mail=lambda *a: None, visits_fetch=lambda **kw: None,
        edits_fetch=lambda **kw: None, taps_read=lambda **kw: None,
        html_path="", private_html_path="")
    assert "app-log directory" not in capsys.readouterr().err

