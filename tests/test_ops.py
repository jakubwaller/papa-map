import json
from datetime import datetime, timezone

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
        edits_fetch=lambda **kw: None)
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
    assert edits == {"days": 7, "changesets": 3}
    assert seen["url"] == ops.OSMCHA_URL
    assert seen["headers"]["Authorization"] == "Token token"
    # the changeset theme tag is the theme URL, not the id (MapComplete
    # stamps remote themes with forcedId = link)
    assert seen["params"]["metadata"] == f"theme={ops.PAPAMAP_THEME_URL}"
    assert seen["params"]["date__gte"] == "2026-07-27"  # NOW minus 7 days


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
                return {"count": 0}
        return R()

    assert ops.osmcha_edits(now=NOW, get=fake_get) == {"days": 7,
                                                       "changesets": 0}
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
        edits_fetch=lambda **kw: {"days": 7, "changesets": 2})
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
