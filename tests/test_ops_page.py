import json
from datetime import datetime, timezone

from pipeline import ops, ops_page

NOW = datetime(2026, 8, 23, 5, 30, tzinfo=timezone.utc)

FINISHED_BUILD = """\
#0 building with "default" instance using docker driver
  Baden-Württemberg: ct=830 play=210 toilets=4100
  Bayern: ct=1101 play=300 toilets=5200
  WARN Italy: HTTPSConnectionPool(host='overpass-api.de'): Read timed out.
  round 2: retrying Italy
  Italy: ct=0 play=12 toilets=900
  WARN: leaderboard skips Roma: gave up after 3 attempts
{'features': 1931, 'play_places': 522, 'ct_objects': 2100, 'toilets_total': 10200, 'global_source': 'taginfo', 'pages': 45}
"""


def day(date, acc, fem, unk, **changes):
    ch = ops.diff_statuses({}, {})
    ch.update(changes)
    return {"date": date, "counts": {"total": acc + fem + unk, "accessible": acc,
                                     "female_only": fem, "unknown": unk},
            "changes": ch}


def history_json(days):
    return {"v": 1, "days": [
        {"date": d, "source": "build", "regions": r, "cities": c}
        for d, r, c in days]}


# ---- pipeline.log ----------------------------------------------------------

def test_parse_last_finished_build():
    text = ("  Old: ct=1 play=1 toilets=1\n{'features': 1, 'pages': 1}\n"
            + FINISHED_BUILD)
    b = ops_page.parse_build_log(text)
    assert b["finished"] is True
    assert [a["area"] for a in b["areas"]] == ["Baden-Württemberg", "Bayern", "Italy"]
    assert b["areas"][2] == {"area": "Italy", "ct": 0, "play": 12, "toilets": 900}
    assert len(b["warns"]) == 2 and b["warns"][0].startswith("WARN Italy")
    assert b["rounds"] == ["round 2: Italy"]
    assert b["result"]["features"] == 1931 and b["result"]["pages"] == 45
    assert b["error"] is None


def test_parse_unfinished_build_after_a_finished_one():
    text = FINISHED_BUILD + "  Bayern: ct=1101 play=300 toilets=5200\n"
    b = ops_page.parse_build_log(text)
    assert b["finished"] is False and b["error"] is None
    assert [a["area"] for a in b["areas"]] == ["Bayern"]


def test_parse_failed_build_names_the_exception():
    text = (FINISHED_BUILD + "  Bayern: ct=1101 play=300 toilets=5200\n"
            "Traceback (most recent call last):\n"
            '  File "run.py", line 1, in <module>\n'
            "RuntimeError: Bayern failed in every round\n")
    b = ops_page.parse_build_log(text)
    assert b["finished"] is False
    assert b["error"] == "RuntimeError: Bayern failed in every round"


def test_parse_empty_or_buildless_log_is_none():
    assert ops_page.parse_build_log(None) is None
    assert ops_page.parse_build_log("") is None
    assert ops_page.parse_build_log("#0 docker noise\n") is None


# ---- history.json ----------------------------------------------------------

def test_region_rows_delta_against_a_week_ago():
    h = history_json([
        ("2026-08-15", {"Bayern": [100, 20, 500], "Danmark": [30, 5, 80]},
         {"Berlin": [10, 1, 300]}),
        ("2026-08-20", {"Bayern": [105, 20, 500], "Danmark": [30, 5, 80]},
         {"Berlin": [12, 1, 300]}),
        ("2026-08-22", {"Bayern": [110, 20, 495], "Danmark": [29, 5, 80],
                        "Italy": [7, 0, 40]},
         {"Berlin": [13, 1, 298]}),
    ])
    r = ops_page.region_rows(h, window_days=7)
    assert r["date"] == "2026-08-22" and r["base_date"] == "2026-08-15"
    by = {row["name"]: row for row in r["regions"]}
    assert by["Bayern"]["delta"] == 10 and by["Danmark"]["delta"] == -1
    assert by["Italy"]["delta"] is None  # new area, nothing to compare
    assert [row["name"] for row in r["regions"]] == ["Bayern", "Danmark", "Italy"]
    assert r["cities"][0] == {"name": "Berlin", "accessible": 13, "female_only": 1,
                              "unknown": 298, "total": 312, "delta": 3}


def test_region_rows_young_history_uses_oldest_day():
    h = history_json([
        ("2026-08-21", {"Bayern": [100, 20, 500]}, {}),
        ("2026-08-22", {"Bayern": [101, 20, 500]}, {}),
    ])
    r = ops_page.region_rows(h)
    assert r["base_date"] == "2026-08-21"
    assert r["regions"][0]["delta"] == 1


def test_region_rows_handles_missing_history():
    assert ops_page.region_rows(None) == {"date": None, "base_date": None,
                                          "regions": [], "cities": []}


# ---- Rendering -------------------------------------------------------------

def render(**kw):
    args = dict(now=NOW, stats={"generated_at": "2026-08-23T02:20:00+00:00",
                                "area_name": "Europe",
                                "local": {"toilets_total": 10200, "ct_yes": 2000},
                                "global": {"ct_total": 79053,
                                           "data_until": "2026-08-22T00:59:34Z"}},
                counts={"total": 1931, "accessible": 1821, "female_only": 60,
                        "unknown": 50},
                changes={"new": 3, "gone": 1, "to_accessible": 2,
                         "to_female_only": 0, "to_unknown": 1},
                history=[day("2026-08-21", 1810, 60, 50),
                         day("2026-08-22", 1819, 60, 51, new=5, to_accessible=9),
                         day("2026-08-23", 1821, 60, 50, new=3, gone=1,
                             to_accessible=2, to_unknown=1)],
                anomalies=[], edits={"days": 7, "changesets": 4,
                                     "as_of": "2026-08-17"},
                regions=ops_page.region_rows(history_json([
                    ("2026-08-22", {"Bayern": [110, 20, 495]},
                     {"Berlin": [13, 1, 298]})])),
                build=ops_page.parse_build_log(FINISHED_BUILD))
    args.update(kw)
    return ops_page.render_page(**args)


def test_healthy_page_carries_every_section():
    html = render()
    assert "<title>PapaMap ops</title>" in html
    assert 'name="robots" content="noindex"' in html
    assert "Healthy" in html and "Anomalies" not in html
    assert "1,931" in html and "1,821" in html and "94.3 %" in html
    assert "dataset built 2026-08-23T02:20:00+00:00 (3 h ago)" in html
    assert "since yesterday" in html and "last 7 days (3 runs)" in html
    assert "<b>4</b> changesets" in html and "as of 2026-08-17" in html
    assert "finished" in html and "45" in html and "3 areas swept, 1 with zero tables" in html
    assert "round 2: Italy" in html
    assert "Baden-Württemberg" in html
    assert "Bayern" in html and "Berlin" in html
    assert "2026-08-21" in html and 'class="spark"' in html
    assert "no analytics" in html


def test_anomalies_replace_the_healthy_line_and_escape():
    html = render(anomalies=["stats.json is missing <b>or</b> unreadable"])
    assert "Healthy" not in html
    assert "stats.json is missing &lt;b&gt;or&lt;/b&gt; unreadable" in html


def test_cloudflare_visits_never_reach_the_page():
    # The check knows a zone-level request total on digest days; the public
    # page shows none of it — methods.html promises "keine Analytics".
    html = render()
    assert "Cloudflare" not in html and "visits" not in html.lower()


def test_page_survives_missing_everything():
    html = render(stats=None, counts=None, changes=None, history=[],
                  edits=None, regions=None, build=None)
    assert "no dataset" in html
    assert "changing_tables.geojson is missing" in html
    assert "No build found" in html
    assert "<h2>Regions</h2>" not in html and "<h2>Daily runs</h2>" not in html


def test_failed_build_and_osmcha_failure_are_said_out_loud():
    html = render(build=ops_page.parse_build_log(
        FINISHED_BUILD + "  Bayern: ct=1 play=1 toilets=1\nTraceback (most recent call last):\n"
        "RuntimeError: boom\n"),
        edits={"days": 7, "error": "Read timed out."})
    assert "failed" in html and "RuntimeError: boom" in html
    assert "unknown" in html and "Not zero." in html


def test_area_names_are_escaped():
    html = render(build=ops_page.parse_build_log(
        "  <script>alert(1)</script>: ct=1 play=1 toilets=1\n{'features': 1}\n"))
    assert "<script>alert" not in html and "&lt;script&gt;" in html


# ---- run_check writes it -----------------------------------------------------

def test_page_and_history_default_next_to_stats(monkeypatch):
    # An ops.env that overrides only the stats path (the documented minimum)
    # must still find history.json and land the page in the served directory.
    import importlib
    monkeypatch.setenv("PAPAMAP_STATS_PATH", "/srv/out/stats.json")
    monkeypatch.delenv("PAPAMAP_HISTORY_PATH", raising=False)
    monkeypatch.delenv("PAPAMAP_OPS_HTML_PATH", raising=False)
    from pipeline import config
    importlib.reload(config)
    mod = importlib.reload(ops)
    try:
        assert mod.OPS_HTML_PATH == "/srv/out/ops.html"
        assert mod.OPS_HISTORY_PATH == "/srv/out/history.json"
    finally:
        monkeypatch.delenv("PAPAMAP_STATS_PATH")
        importlib.reload(config)
        importlib.reload(ops)


def test_run_check_writes_the_page_and_caches_edits(tmp_path):
    gj = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": None,
         "properties": {"osm_type": "node", "osm_id": 1, "status": "accessible"}}]}
    stats = {"generated_at": NOW.isoformat(timespec="seconds")}
    (tmp_path / "stats.json").write_text(json.dumps(stats))
    (tmp_path / "gj.json").write_text(json.dumps(gj))
    (tmp_path / "history.json").write_text(json.dumps(history_json([
        ("2026-08-23", {"Bayern": [1, 0, 0]}, {})])))
    (tmp_path / "pipeline.log").write_text(FINISHED_BUILD)
    state_path = tmp_path / "state.json"
    html_path = tmp_path / "out" / "ops.html"
    monday = datetime(2026, 8, 24, 5, 30, tzinfo=timezone.utc)

    def run(now, edits):
        return ops.run_check(
            now=now, state_path=str(state_path),
            stats_path=str(tmp_path / "stats.json"),
            geojson_path=str(tmp_path / "gj.json"),
            mail=lambda *a: None, visits_fetch=lambda **kw: None,
            edits_fetch=lambda **kw: edits,
            html_path=str(html_path), history_path=str(tmp_path / "history.json"),
            build_log_path=str(tmp_path / "pipeline.log"),
            private_html_path=str(tmp_path / "out" / "private" / "ops.html"))

    run(NOW, {"days": 7, "changesets": 9})  # Sunday: no digest, no fetch
    html = html_path.read_text()
    assert "PapaMap ops" in html and "Bayern" in html and "finished" in html
    assert "changesets" not in html  # nothing fetched yet, nothing cached

    run(monday, {"days": 7, "changesets": 9})
    state = json.loads(state_path.read_text())
    assert state["edits"] == {"days": 7, "changesets": 9, "as_of": "2026-08-24"}
    assert "<b>9</b> changesets" in html_path.read_text()

    # A failed fetch keeps the last good number, dated.
    run(datetime(2026, 8, 31, 5, 30, tzinfo=timezone.utc),
        {"days": 7, "error": "timed out"})
    html = html_path.read_text()
    assert "<b>9</b> changesets" in html and "as of 2026-08-24" in html


def test_run_check_with_empty_html_path_writes_nothing(tmp_path):
    (tmp_path / "stats.json").write_text(json.dumps(
        {"generated_at": NOW.isoformat(timespec="seconds")}))
    ops.run_check(now=NOW, state_path=str(tmp_path / "state.json"),
                  stats_path=str(tmp_path / "stats.json"),
                  geojson_path=str(tmp_path / "absent.json"),
                  mail=lambda *a: None, visits_fetch=lambda **kw: None,
                  edits_fetch=lambda **kw: None, html_path="",
                  private_html_path="")
    assert not list(tmp_path.glob("**/*.html"))


def test_unwritable_page_does_not_fail_the_check(tmp_path, capsys):
    (tmp_path / "stats.json").write_text(json.dumps(
        {"generated_at": NOW.isoformat(timespec="seconds")}))
    blocker = tmp_path / "blocker"
    blocker.write_text("a file where the page's directory should be")
    anomalies, report = ops.run_check(
        now=NOW, state_path=str(tmp_path / "state.json"),
        stats_path=str(tmp_path / "stats.json"),
        geojson_path=str(tmp_path / "absent.json"),
        mail=lambda *a: None, visits_fetch=lambda **kw: None,
        edits_fetch=lambda **kw: None, html_path=str(blocker / "ops.html"),
        private_html_path="")
    assert "ops page not written" in capsys.readouterr().err
    assert report  # the check itself still answered


# ---- The private copy --------------------------------------------------------

VISITS = {"2026-08-20": {"requests": 2500, "uniques": 600},
          "2026-08-21": {"requests": 2600, "uniques": 640},
          "2026-08-22": {"requests": 2400, "uniques": 590}}


def test_private_page_carries_visitors_and_public_never_does():
    private = render(private=True, visits=VISITS)
    assert "<title>PapaMap ops (private)</title>" in private
    assert "<h2>Visitors</h2>" in private
    assert "1,830" in private and "7,500" in private  # 3-day sums
    assert "uniques, last 3 days" in private
    assert "2026-08-21" in private and "640" in private
    assert "identifies nobody" in private
    public = render(private=False, visits=VISITS)
    assert "Visitors" not in public and "7,500" not in public
    assert "no analytics" in public


def test_private_page_without_figures_says_so():
    html = render(private=True, visits=None)
    assert "<h2>Visitors</h2>" in html and "No Cloudflare figures yet" in html


def test_cf_visits_returns_per_day_figures(monkeypatch):
    monkeypatch.setenv("CF_ANALYTICS_TOKEN", "t")
    monkeypatch.setenv("CF_ZONE_TAG", "z")
    groups = [{"dimensions": {"date": "2026-08-21"},
               "sum": {"requests": 10}, "uniq": {"uniques": 3}},
              {"dimensions": {"date": "2026-08-22"},
               "sum": {"requests": 20}, "uniq": {"uniques": 4}}]

    class R:
        def json(self):
            return {"data": {"viewer": {"zones": [
                {"httpRequests1dGroups": groups}]}}}

    seen = {}

    def post(url, **kw):
        seen["query"] = kw["json"]["query"]
        return R()

    v = ops.cf_visits(now=NOW, post=post)
    assert "dimensions { date }" in seen["query"]
    assert v["requests"] == 30 and v["uniques"] == 7
    assert v["by_day"] == {"2026-08-21": {"requests": 10, "uniques": 3},
                           "2026-08-22": {"requests": 20, "uniques": 4}}


def test_merge_visits_skips_today_overwrites_earlier_and_caps():
    kept = {"2026-08-21": {"requests": 1, "uniques": 1},
            "2026-08-01": {"requests": 5, "uniques": 5}}
    fetched = {"by_day": {"2026-08-21": {"requests": 2600, "uniques": 640},
                          "2026-08-22": {"requests": 2400, "uniques": 590},
                          "2026-08-23": {"requests": 300, "uniques": 90}}}
    merged = ops.merge_visits(kept, fetched, NOW)  # NOW is 2026-08-23
    assert list(merged) == ["2026-08-01", "2026-08-21", "2026-08-22"]
    assert merged["2026-08-21"] == {"requests": 2600, "uniques": 640}
    assert ops.merge_visits(kept, None, NOW) == dict(sorted(kept.items()))
    from datetime import date, timedelta
    many = {(date(2024, 1, 1) + timedelta(days=i)).isoformat():
            {"requests": 1, "uniques": 1} for i in range(500)}
    assert len(ops.merge_visits(many, {"by_day": {"2026-08-22": {"requests": 1, "uniques": 1}}}, NOW)) == ops.VISITS_HISTORY_DAYS


def test_run_check_fetches_visits_daily_and_writes_the_private_page(tmp_path):
    (tmp_path / "stats.json").write_text(json.dumps(
        {"generated_at": NOW.isoformat(timespec="seconds")}))
    (tmp_path / "gj.json").write_text(json.dumps({"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": None,
         "properties": {"osm_type": "node", "osm_id": 1, "status": "unknown"}}]}))
    state_path = tmp_path / "state.json"
    private_path = tmp_path / "out" / "private" / "ops.html"
    public_path = tmp_path / "out" / "ops.html"
    sent = []
    calls = []

    def run(now, by_day):
        return ops.run_check(
            now=now, state_path=str(state_path),
            stats_path=str(tmp_path / "stats.json"),
            geojson_path=str(tmp_path / "gj.json"),
            mail=lambda subject, body: sent.append(body),
            visits_fetch=lambda **kw: (calls.append(kw["now"]) or
                                       {"days": 7, "requests": sum(v["requests"] for v in by_day.values()),
                                        "uniques": 1, "by_day": by_day}),
            edits_fetch=lambda **kw: None,
            html_path=str(public_path), private_html_path=str(private_path),
            history_path=str(tmp_path / "none.json"),
            build_log_path=str(tmp_path / "none.log"))

    # A Sunday: fetched (for the history) but not mailed.
    run(NOW, {"2026-08-22": {"requests": 2400, "uniques": 590},
              "2026-08-23": {"requests": 100, "uniques": 10}})
    assert calls == [NOW] and sent == []
    state = json.loads(state_path.read_text())
    assert state["visits"] == {"2026-08-22": {"requests": 2400, "uniques": 590}}
    private = private_path.read_text()
    assert "<h2>Visitors</h2>" in private and "2,400" in private
    assert "2,400" not in public_path.read_text()

    # Monday: the digest carries the 7-day line as before.
    monday = datetime(2026, 8, 24, 5, 30, tzinfo=timezone.utc)
    run(monday, {"2026-08-23": {"requests": 2500, "uniques": 600}})
    assert any("visits (Cloudflare, 7d): 2500 requests" in b for b in sent)
    state = json.loads(state_path.read_text())
    assert list(state["visits"]) == ["2026-08-22", "2026-08-23"]
