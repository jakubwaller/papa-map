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


def test_group_warns_folds_repeats_and_drops_query_urls():
    warns = (["WARN https://overpass.kumi.systems/api/interpreter: gave up after 3 attempts (HTTP 500)"] * 300
             + ["WARN Poznań: 500 Server Error: Internal Server Error for url: https://x/api?data=%5Bout%3Ajson%5D",
                "WARN Poznań: 500 Server Error: Internal Server Error for url: https://x/api?data=%5Bother",
                "WARN Stockholm: 500 Server Error: Internal Server Error for url: https://x/api?data=%5Bq"]
             + ["WARN: leaderboard skips Roma: gave up after 3 attempts"])
    rows = ops_page.group_warns(warns)
    assert rows[0] == (300, "WARN https://overpass.kumi.systems/api/interpreter: gave up after 3 attempts (HTTP 500)")
    assert (2, "WARN Poznań: 500 Server Error: Internal Server Error") in rows
    assert (1, "WARN Stockholm: 500 Server Error: Internal Server Error") in rows
    assert len(rows) == 4
    many = [f"WARN area{i}: failed" for i in range(50)]
    rows = ops_page.group_warns(many, limit=40)
    assert len(rows) == 41 and rows[-1] == (10, "… 10 more distinct warnings")


def test_page_shows_warning_groups_not_every_line():
    build = ops_page.parse_build_log(
        "".join("  WARN https://m/api: gave up after 3 attempts (HTTP 500)\n" for _ in range(500))
        + "{'features': 1}\n")
    html = render(build=build)
    assert "500 warnings, 1 distinct" in html
    assert "500 × WARN https://m/api" in html
    assert html.count("gave up after 3 attempts") == 1


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
                edits_days={"2026-08-21": 1, "2026-08-22": 3},
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
    assert html.count('class="bars"') == 2  # transitions + theme edits
    # Every drawing carries a date axis: two bar charts plus the sparkline.
    assert html.count('class="bar-axis"') == 3
    # The sparkline's caption says what the line is, in dates and numbers.
    assert ("Accessible pins in total, one point per nightly run: 1,810 on "
            "2026-08-21 → 1,821 on 2026-08-23") in html
    assert "no analytics" in html


def test_young_edit_history_is_explained_not_silent():
    """The OSMCha line is a 7-day total; until the first successful daily
    fetch there is no per-day series, and saying so beats a chart that looks
    broken (asked about on day one)."""
    html = render(edits_days=None)
    assert "appears here once the first daily OSMCha fetch succeeds" in html
    html = render(edits_days={"2026-08-22": 3})
    assert "appears here once" not in html
    html = render(edits=None, edits_days=None)
    assert "appears here once" not in html  # no OSMCha at all, no promise


def test_unfinished_or_failed_build_is_never_healthy():
    running = ops_page.parse_build_log(
        FINISHED_BUILD + "  Bayern: ct=1 play=1 toilets=1\n")
    html = render(build=running)
    assert "Healthy" not in html
    assert "Last build had not finished when this report ran" in html
    assert "serving the previous dataset (3 h old)" in html
    failed = ops_page.parse_build_log(
        FINISHED_BUILD + "  Bayern: ct=1 play=1 toilets=1\nTraceback (most recent call last):\n"
        "RuntimeError: boom\n")
    html = render(build=failed)
    assert "Healthy" not in html and "Last build failed" in html
    # Anomalies still win over the build state.
    html = render(build=running, anomalies=["stats.json is missing"])
    assert "Anomalies" in html and "Last build had not" not in html
    # No log at all is not a failed build.
    assert "Healthy" in render(build=None)


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
                  edits=None, edits_days=None, regions=None, build=None)
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


# ---- The movement charts -----------------------------------------------------

def test_transition_rows_keep_the_axis_continuous():
    """A missed night is a visible gap, not two days silently stitched
    together — and bar height counts transitions only, because new/gone swing
    by the thousands when an area fails or comes back."""
    rows = ops_page.transition_rows([
        day("2026-08-20", 1, 1, 1, to_accessible=4, to_female_only=1,
            new=2000, gone=3),
        day("2026-08-22", 1, 1, 1, to_accessible=2, new=3, gone=1),
    ])
    assert [r[0] for r in rows] == ["2026-08-20", "2026-08-21", "2026-08-22"]
    assert rows[0][2] == 5 and rows[0][3] == 4       # new/gone not in the bar
    assert "+2000 new" in rows[0][1]                 # but in the tooltip
    assert rows[1] == ("2026-08-21", "2026-08-21 · no run", None, 0)
    assert rows[2][1] == ("2026-08-22 · 2 → accessible, 0 → female-only, "
                          "0 → unknown · +3 new, -1 gone")


def test_transition_rows_show_at_most_chart_days():
    from datetime import date, timedelta
    hist = [day((date(2026, 1, 1) + timedelta(days=i)).isoformat(), 1, 1, 1,
                to_accessible=1) for i in range(200)]
    rows = ops_page.transition_rows(hist)
    assert len(rows) == ops_page.CHART_DAYS
    assert rows[-1][0] == "2026-07-19"               # the newest day survives


def test_edits_rows_tell_zero_from_not_fetched():
    rows = ops_page.edits_rows({"2026-08-20": 2, "2026-08-22": 0})
    assert rows[0] == ("2026-08-20", "2026-08-20 · 2 changesets", 2, 2)
    assert rows[1] == ("2026-08-21", "2026-08-21 · not fetched", None, 0)
    assert rows[2] == ("2026-08-22", "2026-08-22 · 0 changesets", 0, 0)


def test_charts_scale_bars_and_carry_the_numbers_in_tooltips():
    html = render()
    assert "Status transitions per day" in html
    assert "Changesets through the PapaMap theme per day" in html
    # 2026-08-22 is the tallest movement day (9 transitions, all accessible);
    # 2026-08-23 is a third of it. The exact split rides in the title.
    assert 'title="2026-08-22 · 9 → accessible, 0 → female-only, 0 → unknown · +5 new, -0 gone"' in html
    assert '<div class="bar" style="height:100.0%">' in html
    assert '<div class="bar" style="height:33.3%">' in html
    assert 'title="2026-08-22 · 3 changesets"' in html
    assert "background:var(--green)" in html and "background:var(--accent)" in html
    # 2026-08-21 had zero transitions and one changeset: an empty stub in the
    # first chart, a real bar in the second.
    assert '<div class="bar empty">' in html


def test_all_zero_edit_history_is_words_not_stub_bars():
    html = render(edits_days={"2026-08-21": 0, "2026-08-22": 0})
    assert "No changesets through the theme in the 2 recorded days" in html
    assert html.count('class="bars"') == 1           # the movement chart stays
    html = render(edits_days=None)
    assert "No changesets through the theme" not in html
    assert html.count('class="bars"') == 1


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

    # Fetched every run, Sunday included — the per-day chart is built run by
    # run, the way the visits history is.
    run(NOW, {"days": 7, "changesets": 9,
              "by_day": {"2026-08-21": 1, "2026-08-22": 8}})
    html = html_path.read_text()
    assert "PapaMap ops" in html and "Bayern" in html and "finished" in html
    assert "<b>9</b> changesets" in html and "as of 2026-08-23" in html
    state = json.loads(state_path.read_text())
    # by_day lives in edits_days, not inside the cached line
    assert state["edits"] == {"days": 7, "changesets": 9, "as_of": "2026-08-23"}
    assert state["edits_days"] == {"2026-08-21": 1, "2026-08-22": 8}

    run(monday, {"days": 7, "changesets": 9,
                 "by_day": {"2026-08-22": 8, "2026-08-23": 2}})
    state = json.loads(state_path.read_text())
    assert state["edits"] == {"days": 7, "changesets": 9, "as_of": "2026-08-24"}
    assert state["edits_days"] == {"2026-08-21": 1, "2026-08-22": 8,
                                   "2026-08-23": 2}
    html = html_path.read_text()
    assert "<b>9</b> changesets" in html
    assert "Changesets through the PapaMap theme per day" in html

    # A failed fetch keeps the last good number, dated, and the day history.
    run(datetime(2026, 8, 31, 5, 30, tzinfo=timezone.utc),
        {"days": 7, "error": "timed out"})
    html = html_path.read_text()
    assert "<b>9</b> changesets" in html and "as of 2026-08-24" in html
    state = json.loads(state_path.read_text())
    assert state["edits_days"] == {"2026-08-21": 1, "2026-08-22": 8,
                                   "2026-08-23": 2}


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
    # Three days of history is one window, not three: the 7-, 30- and
    # whole-history tiles collapse to a single pair rather than repeating.
    assert "uniques, all 3 days" in private
    assert private.count("<span>uniques,") == 1
    assert private.count("<span>requests,") == 1
    assert "2026-08-21" in private and "640" in private
    assert "identifies nobody" in private
    public = render(private=False, visits=VISITS)
    assert "Visitors" not in public and "7,500" not in public
    assert "no analytics" in public



def test_visitor_windows_are_distinct_and_the_table_holds_every_day():
    """The bug this pins: with a week of history, days[-7:] and days[-30:] are
    the same seven days, so the page printed 'uniques, last 7 days' twice with
    identical numbers. Only windows of different length may appear, and the
    table shows the whole history rather than a 30-day tail."""
    from datetime import date, timedelta
    start = date(2026, 7, 1)
    visits = {(start + timedelta(days=i)).isoformat():
              {"requests": 100 + i, "uniques": 10 + i} for i in range(40)}
    html = render(private=True, visits=visits)
    for label in ("uniques, last 7 days", "uniques, last 30 days",
                  "uniques, all 40 days"):
        assert html.count(label) == 1, label
    assert html.count("<span>uniques,") == 3
    assert "all 40 days</summary>" in html
    assert "2026-07-01" in html and "2026-08-09" in html   # first and last row
    assert html.count("<tr><td class=\"l\">2026-0") >= 40


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


def test_cf_visits_fetches_a_month_but_reports_the_week(monkeypatch):
    """One request serves both readers: the private page's history wants every
    day Cloudflare still holds (the free plan keeps ~30, not the week the old
    comment claimed), the mail wants the last seven complete days."""
    monkeypatch.setenv("CF_ANALYTICS_TOKEN", "t")
    monkeypatch.setenv("CF_ZONE_TAG", "z")
    from datetime import date, timedelta
    # 30 complete days ending yesterday, plus today's partial figure.
    days = [(date(2026, 8, 23) - timedelta(days=n)) for n in range(30, -1, -1)]
    groups = [{"dimensions": {"date": d.isoformat()},
               "sum": {"requests": 100}, "uniq": {"uniques": 10}} for d in days]
    groups[-1]["sum"]["requests"] = 7        # today, still running
    groups[-1]["uniq"]["uniques"] = 1

    class R:
        def json(self):
            return {"data": {"viewer": {"zones": [
                {"httpRequests1dGroups": groups}]}}}

    seen = {}

    def post(url, **kw):
        seen.update(kw["json"]["variables"])
        return R()

    v = ops.cf_visits(now=NOW, post=post)                 # NOW is 2026-08-23
    assert seen["since"] == "2026-07-24"                  # a month back
    assert len(v["by_day"]) == 31                         # everything fetched
    assert v["days"] == 7                                 # but a week reported
    assert v["requests"] == 700 and v["uniques"] == 70    # today's 7 excluded


def test_cf_visits_reports_no_window_before_the_first_complete_day(monkeypatch):
    """A zone whose only row is today has nothing to say about a week, and the
    mail line is suppressed rather than printing a zero that reads as traffic
    collapse. The partial day still reaches by_day, where merge_visits drops it."""
    monkeypatch.setenv("CF_ANALYTICS_TOKEN", "t")
    monkeypatch.setenv("CF_ZONE_TAG", "z")
    groups = [{"dimensions": {"date": "2026-08-23"},
               "sum": {"requests": 40}, "uniq": {"uniques": 9}}]

    class R:
        def json(self):
            return {"data": {"viewer": {"zones": [
                {"httpRequests1dGroups": groups}]}}}

    v = ops.cf_visits(now=NOW, post=lambda url, **kw: R())
    assert v["days"] == 0 and v["requests"] == 0 and v["uniques"] == 0
    assert v["by_day"] == {"2026-08-23": {"requests": 40, "uniques": 9}}
    assert "visits (Cloudflare" not in ops.render_report(
        None, None, [], [], visits=v)


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
