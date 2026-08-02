import json
from datetime import datetime, timezone

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
        visits_fetch=lambda **kw: None)
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
