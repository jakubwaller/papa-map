import json
import re
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


def test_warns_and_code_wrap_instead_of_forcing_the_page_wider():
    """A stale-mirror or CJK-name WARN line is a monospace <li> with a full
    URL in it, and a URL of 120+ chars has no space to wrap on — unlike the
    tables (wrapped in .scroll, which scrolls sideways on its own), the
    warnings list has nothing to contain it, so the whole page widened past
    the phone viewport instead (real bug, iPhone screenshot: headings cut off
    at the left edge). overflow-wrap: anywhere is what makes an unbreakable
    token break inside its own box; this pins the rule in the CSS and checks
    that a long unspaced line still reaches the page whole, unshortened."""
    assert re.search(r"ul\.warns\s*\{[^}]*overflow-wrap:\s*anywhere", ops_page.OPS_STYLE)
    assert re.search(r"code\s*\{[^}]*overflow-wrap:\s*anywhere", ops_page.OPS_STYLE)

    long_url = "https://overpass-mirror.example/" + "a" * 140
    cjk = "警告：東京都渋谷区のマッピングデータベースが64日前のものです、同期に失敗しました"
    log = (FINISHED_BUILD.rsplit("{'features'", 1)[0]
           + f"  WARN {long_url}: database is 64 days old — skipping mirror\n"
           + f"  WARN {cjk}\n"
           "{'features': 1931, 'pages': 45}\n")
    html = render(build=ops_page.parse_build_log(log))
    # The fix is layout-only: the long line still reaches the page whole,
    # not truncated or otherwise altered.
    assert long_url in html
    assert cjk in html


def test_a_failed_recount_is_named_on_the_ops_page():
    # A count that fell back to the cache looks like a rota reuse on the area
    # line except for its suffix; the page must say which areas, well before
    # the cache drops the entry and the build starts failing.
    log = (FINISHED_BUILD.split("  Italy: ct=0")[0]
           + "  United Kingdom: ct=700 play=90 toilets=8000 (counted 12 d ago, recount failed)\n"
           + "  Bremen: ct=9 play=4 toilets=50 (counted 3 d ago)\n"
           "{'features': 1931, 'pages': 45}\n")
    build = ops_page.parse_build_log(log)
    flagged = [a["area"] for a in build["areas"] if a.get("recount_failed")]
    assert flagged == ["United Kingdom"]
    html = render(build=build)
    assert "1 toilet counts from the cache" in html
    assert "last count kept for United Kingdom" in html
    quiet = render(build=ops_page.parse_build_log(FINISHED_BUILD))
    assert "last count kept for" not in quiet


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

HEALTHY_DELTA = {
    "generated": "2026-08-23T05:28:00+00:00", "age_min": 2.0, "stale": False,
    "seq": 7307321, "base": "2026-08-23T02:20:00+00:00",
    "data_base": "2026-08-23T02:20:00+00:00", "base_ok": True,
    "tables_upsert": 3, "tables_remove": 1, "places_upsert": 2,
    "places_remove": 0, "toilets_no_table": 4, "pending": 0,
    "pending_oldest": None, "pending_max_attempts": None}


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
                build=ops_page.parse_build_log(FINISHED_BUILD),
                delta=dict(HEALTHY_DELTA), delta_expected=True)
    args.update(kw)
    return ops_page.render_page(**args)


def test_young_edit_history_is_explained_not_silent():
    """The OSMCha line is a 7-day total; until a daily fetch records the
    per-day split there is no series, and saying so beats a chart that looks
    broken (asked about on day one). The sentence allows for the one success
    that records no split — a week beyond one OSMCha page is counted whole —
    and never renders under the failure line, which it would contradict."""
    html = render(edits_days=None)
    assert "appears here once a daily OSMCha fetch records the split" in html
    html = render(edits_days={"2026-08-22": 3})
    assert "appears here once" not in html
    html = render(edits=None, edits_days=None)
    assert "appears here once" not in html  # no OSMCha at all, no promise
    html = render(edits={"days": 7, "error": "Read timed out."},
                  edits_days=None)
    assert "Not zero." in html and "appears here once" not in html


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


def days_from(first, values):
    from datetime import date, timedelta
    d0 = date.fromisoformat(first)
    return {(d0 + timedelta(days=i)).isoformat(): v
            for i, v in enumerate(values)}


def test_edit_totals_are_calendar_windows_back_from_the_newest_day():
    """7 and 30 days counted back from the newest recorded day, plus every
    recorded day; a window the history cannot fill is left to the all-days
    tile, and that tile is 'all time' only once the history reaches the
    theme's launch."""
    # 40 days ending 2026-09-11, 1 changeset a day except a 9 on the last
    hist = days_from("2026-08-03", [1] * 39 + [9])
    tiles = ops_page.edit_totals(hist)
    assert [t["label"] for t in tiles] == ["last 7 days", "last 30 days",
                                           "all time"]
    assert tiles[0]["changesets"] == 15 and tiles[0]["first"] == "2026-09-05"
    assert tiles[1]["changesets"] == 38 and tiles[1]["first"] == "2026-08-13"
    assert tiles[2]["changesets"] == 48 and tiles[2]["all_time"]
    assert all(t["last"] == "2026-09-11" for t in tiles)
    # 18 days, like the live state on 2026-09-12: no 30-day tile, and the
    # rest is "recorded", not "all time" — the theme is older than that.
    tiles = ops_page.edit_totals(days_from("2026-08-25", [1] * 18))
    assert [t["label"] for t in tiles] == ["last 7 days",
                                           "all 18 recorded days"]
    assert tiles[1]["changesets"] == 18 and not tiles[1]["all_time"]
    # a history exactly one window long is the all-days tile, not both
    tiles = ops_page.edit_totals(days_from("2026-09-05", [2] * 7))
    assert [t["label"] for t in tiles] == ["all 7 recorded days"]
    # a gap inside the window is counted as the days there are, and said
    hist = days_from("2026-08-01", [1] * 40)
    del hist["2026-09-07"], hist["2026-09-08"]
    tiles = ops_page.edit_totals(hist)
    assert tiles[0]["changesets"] == 5 and tiles[0]["days"] == 5
    assert tiles[0]["span"] == 7
    assert ops_page.edit_totals(None) == [] and ops_page.edit_totals({}) == []
    # the answers series has its own first possible day
    hist = days_from("2026-09-13", [1] * 23)
    assert ops_page.edit_totals(hist, ops_page.WEB_ANSWERS_SINCE)[-1]["all_time"]
    assert not ops_page.edit_totals(hist)[-1]["all_time"]  # theme is older


def test_edits_section_says_when_the_fetch_stopped_or_lost_its_split():
    now = datetime(2026, 9, 12, 5, 30, tzinfo=timezone.utc)
    hist = days_from("2026-09-01", [1] * 8)          # stops at 09-08
    html = render(edits_days=hist, now=now,
                  edits={"days": 7, "changesets": 7, "as_of": "2026-09-09"})
    assert ("The daily OSMCha query has not answered since 2026-09-08: "
            "3 days missing from the totals above") in html
    assert "8 of 7" not in html
    # a one-day gap reads in the singular
    html = render(edits_days=days_from("2026-09-01", [1] * 10), now=now)
    assert "1 day missing" in html
    # the count arrived on the 12th but the split did not (window beyond one
    # page): the fresher number is shown, with the reason
    html = render(edits_days=hist, now=now,
                  edits={"days": 7, "changesets": 120, "as_of": "2026-09-12"})
    assert ("OSMCha's 7-day count as of 2026-09-12 is <b>120</b> changesets, "
            "but the per-day split stops at 2026-09-08") in html
    assert "has not answered" not in html
    # a cached line with an unreadable date must not silence the stale note
    html = render(edits_days=hist, now=now,
                  edits={"days": 7, "changesets": 7, "as_of": "yesterday-ish"})
    assert "3 days missing" in html and "split stops" not in html
    # a failed fetch on top of a fresh history: the error line, no stale note
    html = render(edits_days=days_from("2026-09-01", [1] * 11), now=now,
                  edits={"days": 7, "error": "Read timed out."})
    assert "Not zero." in html and "has not answered" not in html


# ---- run_check writes it -----------------------------------------------------


def test_run_check_keeps_the_answers_history(tmp_path):
    """The answers series is merged and saved like the theme's, rendered on
    the page, and a fetch that lost the second query keeps it as it was."""
    gj = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": None,
         "properties": {"osm_type": "node", "osm_id": 1, "status": "accessible"}}]}
    (tmp_path / "stats.json").write_text(json.dumps(
        {"generated_at": NOW.isoformat(timespec="seconds")}))
    (tmp_path / "gj.json").write_text(json.dumps(gj))
    state_path = tmp_path / "state.json"
    html_path = tmp_path / "ops.html"

    def run(edits):
        return ops.run_check(
            now=NOW, state_path=str(state_path),
            stats_path=str(tmp_path / "stats.json"),
            geojson_path=str(tmp_path / "gj.json"),
            mail=lambda *a: None, visits_fetch=lambda **kw: None,
            edits_fetch=lambda **kw: edits, html_path=str(html_path),
            history_path=str(tmp_path / "absent.json"),
            build_log_path=str(tmp_path / "absent.log"),
            private_html_path="", delta_path="")

    run({"days": 7, "changesets": 9, "by_day": {"2026-08-22": 8},
         "web_changesets": 3,
         "web_by_day": {"2026-08-21": 1, "2026-08-22": 2}})
    state = json.loads(state_path.read_text())
    assert state["web_edits_days"] == {"2026-08-21": 1, "2026-08-22": 2}
    assert state["edits_days"] == {"2026-08-22": 8}
    assert state["edits"]["web_changesets"] == 3
    html = html_path.read_text()
    assert "<h2>Edits via PapaMap</h2>" in html
    # the fixture's August days are older than the answers' first possible
    # day, so the one tile is already "all time"
    assert "3 in the app since 2026-09-13" in html
    assert 'title="2026-08-22 · 8 theme changesets · 2 answers in the app"' in html
    run({"days": 7, "changesets": 9, "by_day": {"2026-08-22": 8}})
    state = json.loads(state_path.read_text())
    assert state["web_edits_days"] == {"2026-08-21": 1, "2026-08-22": 2}
    assert "web_changesets" not in state["edits"]
    assert 'title="2026-08-22 · 8 theme changesets · 2 answers in the app"' in html_path.read_text()

def test_page_and_history_default_next_to_stats(monkeypatch):
    # An ops.env that overrides only the stats path (the documented minimum)
    # must still find history.json and land the page in the served directory.
    import importlib
    monkeypatch.setenv("PAPAMAP_STATS_PATH", "/srv/out/stats.json")
    monkeypatch.delenv("PAPAMAP_HISTORY_PATH", raising=False)
    monkeypatch.delenv("PAPAMAP_OPS_HTML_PATH", raising=False)
    monkeypatch.delenv("PAPAMAP_OPS_DELTA_PATH", raising=False)
    monkeypatch.delenv("PAPAMAP_OPS_DELTA_STATE_PATH", raising=False)
    from pipeline import config
    importlib.reload(config)
    mod = importlib.reload(ops)
    try:
        assert mod.OPS_HTML_PATH == "/srv/out/ops.html"
        assert mod.OPS_HISTORY_PATH == "/srv/out/history.json"
        assert mod.OPS_DELTA_PATH == "/srv/out/delta.json"
        assert mod.OPS_DELTA_STATE_PATH == "/srv/out/private/delta-state.json"
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
            private_html_path=str(tmp_path / "out" / "private" / "ops.html"),
            delta_path="")

    # Fetched every run, Sunday included — the per-day chart is built run by
    # run, the way the visits history is.
    run(NOW, {"days": 7, "changesets": 9,
              "by_day": {"2026-08-21": 1, "2026-08-22": 8}})
    html = html_path.read_text()
    assert "PapaMap ops" in html and "Bayern" in html and "finished" in html
    assert '<span class="v">9</span>' in html and "All 2 recorded days" in html
    assert "has not answered" not in html  # 2026-08-22 is yesterday: fresh
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
    assert '<span class="v">11</span>' in html and "All 3 recorded days" in html
    assert "edits per day" in html

    # A failed fetch keeps the day history, and the page says the totals
    # stopped: seven days (08-24 .. 08-30) are missing by the 31st.
    run(datetime(2026, 8, 31, 5, 30, tzinfo=timezone.utc),
        {"days": 7, "error": "timed out"})
    html = html_path.read_text()
    assert '<span class="v">11</span>' in html
    assert ("has not answered since 2026-08-23: 7 days missing from the "
            "totals above") in html
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
                  private_html_path="", delta_path="")
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
        private_html_path="", delta_path="")
    assert "ops page not written" in capsys.readouterr().err
    assert report  # the check itself still answered


# ---- The private copy --------------------------------------------------------


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
            build_log_path=str(tmp_path / "none.log"), delta_path="")

    # A Sunday: fetched (for the history) but not mailed.
    run(NOW, {"2026-08-22": {"requests": 2400, "uniques": 590},
              "2026-08-23": {"requests": 100, "uniques": 10}})
    assert calls == [NOW] and sent == []
    state = json.loads(state_path.read_text())
    assert state["visits"] == {"2026-08-22": {"requests": 2400, "uniques": 590}}
    private = private_path.read_text()
    assert "<h2>Readers</h2>" in private and "2,400" in private
    assert "2,400" not in public_path.read_text()

    # Monday: the digest carries the 7-day line as before.
    monday = datetime(2026, 8, 24, 5, 30, tzinfo=timezone.utc)
    run(monday, {"2026-08-23": {"requests": 2500, "uniques": 600}})
    assert any("visits (Cloudflare, 7d): 2500 requests" in b for b in sent)
    state = json.loads(state_path.read_text())
    assert list(state["visits"]) == ["2026-08-22", "2026-08-23"]


def test_area_label_is_english_and_counted():
    """stats.json names Germany and Denmark in their own language; the
    English-only ops page must not (asked 2026-09-24)."""
    assert ops_page.english_area("Deutschland & Danmark & Belgium") == \
        "3 countries: Germany, Denmark, Belgium"
    assert ops_page.english_area("Danmark") == "Denmark"
    html = render(stats={"generated_at": "2026-08-23T02:20:00+00:00",
                         "area_name": "Deutschland & Danmark"})
    assert "2 countries: Germany, Denmark" in html
    assert "Danmark" not in html


def test_nice_top_with_a_whole_half_skips_the_odd_tops():
    """A column chart of counts labels 0, half and top: the top must halve
    to a whole number, so 1, 3, 5, 15 and 25 are skipped for the next round
    number up. Hundreds and above always halve whole."""
    for hi, top in ((1, 2), (2, 2), (3, 4), (5, 6), (7, 8), (9, 10),
                    (12, 20), (15, 20), (21, 30), (25, 30), (30, 30),
                    (101, 150), (150, 150), (0, 2)):
        assert ops_page._nice_top(hi, whole_half=True) == top, hi
    # the sparkline's plain rule is unchanged
    assert ops_page._nice_top(3) == 3 and ops_page._nice_top(15) == 15


# ---- Apps (private page) -----------------------------------------------------

APP_DAYS = {
    "2026-10-01": {"ios_downloads": 4, "ios_redownloads": 1, "ios_updates": 10,
                   "android_installs": 2, "android_uninstalls": 0,
                   "android_active": 20},
    "2026-10-02": {"ios_downloads": 6, "ios_redownloads": 0, "ios_updates": 12,
                   "android_installs": 1, "android_uninstalls": 1,
                   "android_active": 21},
    "2026-10-03": {"android_installs": 3, "android_uninstalls": 0,
                   "android_active": 24},
}
RATINGS = {"version": "1.2", "released": "2026-10-02", "total": 3, "avg": 5.0,
           "stores": {"de": {"count": 2, "avg": 5.0},
                      "cz": {"count": 1, "avg": 5.0}},
           "as_of": "2026-10-04"}


def test_run_check_keeps_the_app_history_and_the_digest_says_it(tmp_path):
    gj = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": None,
         "properties": {"osm_type": "node", "osm_id": 1, "status": "accessible"}}]}
    monday = datetime(2026, 10, 5, 5, 30, tzinfo=timezone.utc)
    (tmp_path / "stats.json").write_text(json.dumps(
        {"generated_at": monday.isoformat(timespec="seconds")}))
    (tmp_path / "gj.json").write_text(json.dumps(gj))
    state_path = tmp_path / "state.json"
    private_path = tmp_path / "private" / "ops.html"
    apps = {"ratings": {"version": "1.2", "released": "2026-10-02", "total": 3,
                        "avg": 5.0, "stores": {"de": {"count": 2, "avg": 5.0},
                                               "cz": {"count": 1, "avg": 5.0}}},
            "ios": {"by_day": {"2026-10-03": {"downloads": 4, "redownloads": 0,
                                              "updates": 9}},
                    "pending": ["2026-10-04"]},
            "android": {"by_day": {
                "2026-10-03": {"installs": 2, "uninstalls": 0, "active": 20},
                "2026-10-04": {"installs": 1, "uninstalls": 0, "active": 21}}}}

    def run(now, fetch):
        return ops.run_check(
            now=now, state_path=str(state_path),
            stats_path=str(tmp_path / "stats.json"),
            geojson_path=str(tmp_path / "gj.json"),
            mail=lambda *a: None, visits_fetch=lambda **kw: None,
            edits_fetch=lambda **kw: None, apps_fetch=fetch,
            html_path=str(tmp_path / "ops.html"),
            history_path=str(tmp_path / "absent.json"),
            build_log_path=str(tmp_path / "absent.log"),
            private_html_path=str(private_path), delta_path="")

    _, report = run(monday, lambda **kw: apps)
    state = json.loads(state_path.read_text())
    assert state["app_days"] == {
        "2026-10-03": {"ios_downloads": 4, "ios_redownloads": 0, "ios_updates": 9,
                       "android_installs": 2, "android_uninstalls": 0,
                       "android_active": 20},
        "2026-10-04": {"android_installs": 1, "android_uninstalls": 0,
                       "android_active": 21}}
    assert state["app_ratings"]["total"] == 3
    assert state["app_ratings"]["as_of"] == "2026-10-05"
    assert "apps: 4 App Store downloads (1d), 3 Play installs (2d)" in report
    assert "App Store ratings: 3, avg 5.0 (as of 2026-10-05)" in report
    private = private_path.read_text()
    assert "<h2>Apps</h2>" in private
    assert "Apple has not published 2026-10-04 yet." in private
    assert "<h2>Apps</h2>" not in (tmp_path / "ops.html").read_text()
    # a run with nothing configured keeps the history and the snapshot, and
    # a Tuesday's report says nothing about the apps
    _, report = run(datetime(2026, 10, 6, 5, 30, tzinfo=timezone.utc),
                    lambda **kw: None)
    state = json.loads(state_path.read_text())
    assert state["app_days"]["2026-10-04"]["android_installs"] == 1
    assert state["app_ratings"]["as_of"] == "2026-10-05"
    assert "apps:" not in report and "ratings" not in report


def test_run_check_survives_an_app_fetch_that_raises(tmp_path, capsys):
    """The store block is decoration: a fetch that blows up is reported and
    the state, the pages and the mail still happen."""
    (tmp_path / "stats.json").write_text(json.dumps(
        {"generated_at": NOW.isoformat(timespec="seconds")}))
    (tmp_path / "gj.json").write_text(json.dumps(
        {"type": "FeatureCollection", "features": [
            {"type": "Feature", "geometry": None,
             "properties": {"osm_type": "node", "osm_id": 1, "status": "accessible"}}]}))
    state_path = tmp_path / "state.json"

    def boom(**kw):
        raise ValueError("Unable to load PEM file")

    ops.run_check(now=NOW, state_path=str(state_path),
                  stats_path=str(tmp_path / "stats.json"),
                  geojson_path=str(tmp_path / "gj.json"),
                  mail=lambda *a: None, visits_fetch=lambda **kw: None,
                  edits_fetch=lambda **kw: None, apps_fetch=boom,
                  html_path=str(tmp_path / "ops.html"),
                  history_path=str(tmp_path / "absent.json"),
                  build_log_path=str(tmp_path / "absent.log"),
                  private_html_path=str(tmp_path / "private.html"), delta_path="")
    assert state_path.exists() and (tmp_path / "private.html").exists()
    assert "WARN: app stats failed: Unable to load PEM file" in capsys.readouterr().err
    assert "<h2>Apps</h2>" in (tmp_path / "private.html").read_text()


def test_healthy_page_carries_every_section():
    html = render()
    assert "<title>PapaMap ops</title>" in html
    assert 'name="robots" content="noindex"' in html
    assert "Healthy" in html and "Anomalies" not in html
    assert "1,931" in html and "1,821" in html and "94.3 %" in html
    assert "dataset built 2026-08-23T02:20:00+00:00 (3 h ago)" in html
    # The sections, in the order the numbers are read; the public page has
    # neither Readers nor Apps.
    order = ["<h2>This week</h2>", "<h2>Edits via PapaMap</h2>",
             "<h2>Movement on OSM</h2>", "<h2>Dataset</h2>", "<h2>Pipeline</h2>"]
    assert [html.index(h) for h in order] == sorted(html.index(h) for h in order)
    assert "<h2>Readers</h2>" not in html and "<h2>Apps</h2>" not in html
    assert 'href="#readers"' not in html and 'href="#edits"' in html
    # the windows table moved into the movement details
    assert "since yesterday" in html and "last 7 days (3 runs)" in html
    assert "<b>new</b> and <b>gone</b> are pins" in html
    # edits: the fixture's two theme days, no in-app history
    assert '<span class="v">4</span>' in html
    assert "All 2 recorded days" in html and "4 theme · – in the app" in html
    assert "as of 2026-08-17" not in html  # the tiles replace the dated line
    # pipeline: last build collapsed, areas, retries, regions, daily runs
    assert "finished" in html and "45" in html and "3 areas swept, 1 with zero tables" in html
    assert "round 2: Italy" in html
    assert "Baden-Württemberg" in html
    assert "Bayern" in html and "Berlin" in html
    assert "Daily runs" in html and "Regions and cities" in html
    # Every drawing is a frame with a value axis and a date axis: the
    # recolours, the edits, the two pinned lines, the cumulative edits line
    # and the added/removed pair (two column rows in one frame).
    assert html.count('class="bars"') == 3 and html.count('class="bars down"') == 1
    assert html.count('<div class="line') == 3
    assert html.count('class="chart-y"') == 6
    assert html.count('<div class="x') == 6
    assert "Answered since launch" in html and "Accessible pins in the dataset" in html
    assert "no analytics" in html
    # the live-updates card sits inside Dataset
    assert "<h3>Live updates" in html and "7,307,321" in html
    assert html.index("<h2>Dataset</h2>") < html.index("<h3>Live updates") \
        < html.index("<h2>Pipeline</h2>")


def test_week_strip_answers_the_week_before_any_chart():
    html = render()
    strip = html[html.index("<h2>This week</h2>"):html.index("<h2>Edits via PapaMap</h2>")]
    assert strip.count('<span class="l">') == 4
    # two recorded days: the strip shows them, not an unfillable week
    assert "Edits via PapaMap, 2 days" in strip and '<span class="v">4</span>' in strip
    assert "4 through the theme · – answered in the app" in strip
    assert "Turned green on OSM, 3 runs" in strip and '<span class="v">11</span>' in strip
    assert "Tables added on OSM, 3 runs" in strip and '<span class="v">+8</span>' in strip
    assert "1 removed · 1,931 on the map now" in strip
    assert "Last build" in strip and '<span class="ok">finished</span>' in strip
    assert "3 areas · 2 warnings, 2 distinct · 1 retry round" in strip
    # the private page leads with readers and the apps
    private = render(private=True, readers={"2026-08-22": 74, "2026-08-21": 60})
    strip = private[private.index("<h2>This week</h2>"):private.index("<h2>Readers</h2>")]
    assert strip.count('<span class="l">') == 6
    assert strip.index("Readers yesterday") < strip.index("App downloads") \
        < strip.index("Edits via PapaMap")
    assert '<span class="v">74</span>' in strip and "7-day average 67" in strip
    assert "no store figures yet" in strip
    # a failed build is the tile's word, in red
    failed = ops_page.parse_build_log(
        FINISHED_BUILD + "  Bayern: ct=1 play=1 toilets=1\nTraceback (most recent call last):\n"
        "RuntimeError: boom\n")
    assert '<span class="bad">failed</span>' in render(build=failed)


def test_live_updates_card_inside_dataset():
    html = render()
    card = html[html.index("<h3>Live updates"):html.index("<h3>Behind the counts</h3>")]
    assert '<dl class="kv">' in card and "in sync" in card
    assert "2026-08-23T05:28:00+00:00 (2 min ago)" in card
    assert "+3 / −1" in card and "+2 / −0" in card
    assert "matches the dataset" in card
    assert "<dd>0</dd>" in card  # pending lookups
    assert "unknown (state file not readable)" not in card
    # the values may wrap: the kv grid breaks a bare timestamp anywhere
    assert "dl.kv dd { margin: 0; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }" in html


def test_live_updates_section_absent_when_not_expected():
    assert "Live updates" not in render(delta=None, delta_expected=False)


def test_live_updates_missing_message():
    html = render(delta=None)
    assert ('<p class="bad">delta.json is missing — the live-updates follower '
            "is not running.</p>") in html
    assert "7,307,321" not in html


def test_live_updates_stale_tick_is_red():
    html = render(delta={**HEALTHY_DELTA, "stale": True, "age_min": 95.0})
    assert '<dd class="bad">2026-08-23T05:28:00+00:00 (95 min ago)</dd>' in html
    assert '<span class="bad">stale</span>' in html


def test_live_updates_base_behind_and_unknown():
    html = render(delta={**HEALTHY_DELTA, "base_ok": False,
                         "base": "2026-08-22T02:20:00+00:00"})
    assert ("BEHIND the dataset (2026-08-23T02:20:00+00:00) — readers ignore "
            "this delta") in html
    assert '<span class="bad">behind</span>' in html
    html = render(delta={**HEALTHY_DELTA, "base_ok": None, "data_base": None})
    assert "dataset base unknown" in html


def test_live_updates_pending_rows():
    html = render(delta={**HEALTHY_DELTA, "pending": 2,
                         "pending_oldest": "2026-08-23T01:00:00+00:00",
                         "pending_max_attempts": 3})
    assert ("2, oldest queued 2026-08-23T01:00:00+00:00, up to 3 retries"
            in html)
    html = render(delta={**HEALTHY_DELTA, "pending": None})
    assert "unknown (state file not readable)" in html


def test_live_updates_escapes_file_strings():
    html = render(delta={**HEALTHY_DELTA, "base": "<b>x</b>"})
    assert "<b>x</b>" not in html and "&lt;b&gt;x&lt;/b&gt;" in html


def test_no_total_line_when_the_history_carries_no_counts():
    """Entries without counts give the dataset-total line nothing to draw;
    its frame must vanish with it rather than label an empty space, while
    the answered-since-launch line (from the diffs) stays."""
    html = render(history=[{"date": "2026-08-21"}, {"date": "2026-08-22"}])
    assert "Accessible pins in the dataset" not in html
    assert "Answered since launch" in html
    assert html.count('<div class="line') == 2  # answered + cumulative edits


def test_charts_scale_bars_and_carry_the_numbers_in_tooltips():
    html = render()
    # 2026-08-22 is the tallest movement night (9 transitions, all
    # accessible); 2026-08-23 a third of it. The split rides in the title;
    # the bars are measured against the axis top of 10, not against the 9,
    # and a night of 5 or more prints its number above the column.
    assert 'title="2026-08-22 · 9 → accessible, 0 → female-only, 0 → unknown · +5 new, -0 gone"' in html
    assert '<span class="n">9</span><div class="seg green cap" style="height:90.0%">' in html
    assert ('<div class="seg rest cap" style="height:10.0%"></div>'
            '<div class="seg green" style="height:20.0%"></div>') in html
    assert '<span style="bottom:50%">5</span><span style="bottom:100%">10</span>' in html
    # the edits chart tops out at 3 changesets, drawn against 4 so that the
    # half label is a whole 2, never "1.5"; the in-app segment is absent on
    # a day without answers, and the theme segment is then the capped one
    assert 'title="2026-08-22 · 3 theme changesets · 0 answers in the app"' in html
    assert '<div class="seg theme cap" style="height:75.0%">' in html
    assert '<div class="seg theme cap" style="height:25.0%">' in html
    assert '<span style="bottom:50%">2</span><span style="bottom:100%">4</span>' in html
    assert ">1.5</span>" not in html
    # 2026-08-21 had zero transitions: an empty column, titled
    assert '<div class="col" title="2026-08-21 · 0 → accessible, 0 → female-only, 0 → unknown · +0 new, -0 gone"></div>' in html
    # stacked: a day with both series puts the answers on top of the theme
    html = render(web_edits_days={"2026-08-22": 1})
    assert ('<div class="col" title="2026-08-22 · 3 theme changesets · 1 answer in the app">'
            '<div class="seg app cap" style="height:25.0%"></div>'
            '<div class="seg theme" style="height:75.0%"></div></div>') in html


def test_all_zero_edit_history_is_words_not_stub_bars():
    html = render(edits_days={"2026-08-21": 0, "2026-08-22": 0})
    assert "No edits via PapaMap in the 2 recorded days" in html
    assert html.count('class="bars"') == 2           # recolours + added
    html = render(edits_days=None)
    assert "No edits via PapaMap" not in html
    assert html.count('class="bars"') == 2


def test_edits_section_tiles_chart_and_table():
    hist = days_from("2026-08-03", [1] * 39 + [9])
    html = render(edits_days=hist, now=datetime(2026, 9, 12, 5, 30,
                                                tzinfo=timezone.utc))
    sec = html[html.index("<h2>Edits via PapaMap</h2>"):html.index("<h2>Movement on OSM</h2>")]
    assert ('<span class="l">Last 7 days</span><span class="v">15</span>'
            '<span class="s">15 theme · – in the app · 2026-09-05 → 2026-09-11</span>') in sec
    assert ('<span class="l">Last 30 days</span><span class="v">38</span>'
            '<span class="s">38 theme · – in the app · 2026-08-13 → 2026-09-11</span>') in sec
    assert ('<span class="l">All time</span><span class="v">48</span>'
            '<span class="s">48 theme since 2026-08-13 · no in-app history yet</span>') in sec
    assert ('<span class="l">Best day</span><span class="v">9</span>'
            '<span class="s">2026-09-11, 9 theme · 0 in the app</span>') in sec
    # the chart prints no number per column — the axis, the tooltip and the
    # table carry them — and the cumulative line ends on the total
    assert sec.count('class="n"') == 0
    assert '<div class="end" style="bottom:96.0%">48</div>' in sec  # 48 of 50
    assert "added up since the first recorded day" in sec
    # every recorded day, newest first, both columns and the total
    assert 'How this is counted <span class="tag">every day, 40 days</span>' in sec
    assert sec.index('<td class="l">2026-09-11</td><td>9</td><td>–</td><td>9</td>') \
        < sec.index('<td class="l">2026-09-10</td><td>1</td><td>–</td><td>1</td>')
    assert "has not answered" not in html and "split stops" not in html


def test_edits_section_merges_both_series():
    """Theme changesets and in-app answers are disjoint changesets, so the
    tiles add them and say the split; all time needs the theme's launch, or
    the answers' when there is no theme history yet."""
    now = datetime(2026, 10, 6, 5, 30, tzinfo=timezone.utc)
    web = days_from("2026-09-13", [1] * 22 + [7])          # ends 2026-10-05
    theme = days_from("2026-08-13", [1] * 54)             # ends 2026-10-05
    html = render(now=now, edits_days=theme, web_edits_days=web,
                  edits={"days": 7, "changesets": 7, "as_of": "2026-10-06",
                         "web_changesets": 13})
    sec = html[html.index("<h2>Edits via PapaMap</h2>"):html.index("<h2>Movement on OSM</h2>")]
    assert ('<span class="v">20</span><span class="s">7 theme · 13 in the app · '
            "2026-09-29 → 2026-10-05</span>") in sec
    assert ('<span class="l">All time</span><span class="v">83</span>'
            '<span class="s">54 theme since 2026-08-13 · 29 in the app since 2026-09-13</span>') in sec
    assert ('<span class="l">Best day</span><span class="v">8</span>'
            '<span class="s">2026-10-05, 1 theme · 7 in the app</span>') in sec
    assert "through the MapComplete theme" in sec and "answered in the app or on the site" in sec
    assert 'title="2026-10-05 · 1 theme changeset · 7 answers in the app"' in sec
    assert '<td class="l">2026-10-05</td><td>1</td><td>7</td><td>8</td>' in sec
    # answers only: all time from the answers' own launch
    html = render(now=now, web_edits_days=web, edits_days=None,
                  edits={"days": 7, "changesets": 9, "as_of": "2026-10-06",
                         "web_changesets": 13})
    assert ('<span class="l">All time</span><span class="v">29</span>'
            '<span class="s">no theme history yet · 29 in the app since 2026-09-13</span>') in html
    assert "answers query has not answered" not in html
    # a history stopping short of yesterday is said, per series
    late = datetime(2026, 10, 9, 5, 30, tzinfo=timezone.utc)
    html = render(now=late, web_edits_days=web, edits_days=None)
    assert ("The daily OSMCha answers query has not answered since "
            "2026-10-05: 3 days missing from the totals above") in html
    html = render(now=late, web_edits_days=web, edits_days=theme)
    assert "The daily OSMCha query has not answered since 2026-10-05" in html
    assert "The daily OSMCha answers query has not answered since 2026-10-05" in html
    # a failed fetch: said once, no stale note on top
    html = render(now=late, web_edits_days=web, edits_days=theme,
                  edits={"days": 7, "error": "timed out"})
    assert html.count("Not zero.") == 1 and "has not answered" not in html
    # the count arrived but the split did not (a week beyond one page)
    html = render(now=late, web_edits_days=web, edits_days=None,
                  edits={"days": 7, "changesets": 9, "as_of": "2026-10-09",
                         "web_changesets": 130})
    assert ("OSMCha's 7-day count of answers as of 2026-10-09 is <b>130</b>, "
            "but the per-day split stops at 2026-10-05") in html
    assert "answers query has not answered" not in html
    # the theme answered today but the answers query did not: the cached
    # line carries no count, so the stale note stands
    html = render(now=late, web_edits_days=web, edits_days=None,
                  edits={"days": 7, "changesets": 9, "as_of": "2026-10-09"})
    assert "answers query has not answered since 2026-10-05: 3 days missing" in html


def test_young_answers_history_shows_the_count_or_says_none_yet():
    """Before either per-day series exists the cached 7-day counts are the
    whole section; with a theme history but no answers history the all-time
    tile says so instead of showing nothing, or a zero."""
    html = render(edits_days=None,
                  edits={"days": 7, "changesets": 4, "as_of": "2026-08-17",
                         "web_changesets": 2})
    assert ("OSMCha, 7 d as of 2026-08-17: <b>4</b> changesets through the theme, "
            "<b>2</b> answers on the map itself.") in html
    assert "appears here once a daily OSMCha fetch records the split" in html
    html = render()
    assert "4 theme · – in the app" in html and "<b>0</b> answers" not in html
    html = render(edits_days=days_from("2026-08-13", [1] * 10))
    assert "10 theme since 2026-08-13 · no in-app history yet" in html
    # a cached line dated today without the count: the theme query answered
    # this run and the answers query did not — said, not "not yet"
    html = render(edits={"days": 7, "changesets": 4, "as_of": "2026-08-23"})
    assert ("Answers on the map itself not counted this run — the OSMCha "
            "answers query failed while the theme query answered. Not zero.") in html


def test_coverage_steps_find_the_jumps_and_name_them():
    """A night whose `new` is a jump is a coverage step: labelled from
    COVERAGE_EVENTS when one is within two days, else as a sweep area back;
    a jump in `gone` is an area failing; consecutive nights with one label
    (two expansions in a row) fold into one pin."""
    hist = [day("2026-08-22", 900, 50, 4000),
            day("2026-08-23", 900, 50, 4000, new=20),
            day("2026-08-24", 1300, 70, 9000, new=5420),          # Europe
            day("2026-08-25", 1301, 70, 9010, new=12),
            day("2026-09-04", 1400, 72, 9600, new=700),           # AU/NZ
            day("2026-09-05", 1700, 80, 11000, new=1800),         # US/CA/JP
            day("2026-09-10", 1500, 70, 9500, gone=2000),         # an area failed
            day("2026-09-11", 1700, 80, 11000, new=2000),         # ... and came back
            day("2026-09-12", 1702, 80, 11001, new=3)]
    steps = ops_page.coverage_steps(hist)
    assert [(s["date"], s["label"], s["index"]) for s in steps] == [
        ("2026-08-24", "Europe, 44 countries", 2),
        ("2026-09-04", "AU and NZ 09-04, US, CA and JP 09-05", 4),
        ("2026-09-10", "−2,000 pins, a sweep area failed that night", 6),
        ("2026-09-11", "+2,000 pins, sweep areas back after a failed night", 7)]
    # the added/removed chart clips every jump night, the pair's second too
    assert [(j["date"], j["index"]) for j in ops_page.jump_nights(hist)] == [
        ("2026-08-24", 2), ("2026-09-04", 4), ("2026-09-05", 5),
        ("2026-09-10", 6), ("2026-09-11", 7)]
    # a small dataset's floor is the absolute minimum, not the share
    assert ops_page.coverage_steps([day("2026-08-01", 10, 0, 100),
                                    day("2026-08-02", 10, 0, 150, new=50)]) == []
    assert ops_page.coverage_steps([]) == []


def test_answered_since_launch_and_the_total_share_the_pins():
    hist = [day("2026-08-22", 900, 50, 4000),
            day("2026-08-23", 902, 50, 4000, to_accessible=2),
            day("2026-08-24", 1300, 70, 9000, new=5420, to_accessible=1),
            day("2026-08-25", 1304, 70, 9010, new=12, to_accessible=4)]
    html = render(history=hist)
    sec = html[html.index("<h2>Movement on OSM</h2>"):html.index("<h2>Dataset</h2>")]
    assert "Turned green, 4 runs" in sec and '<span class="v">7</span>' in sec
    assert "7 in 4 runs · 7 since 2026-08-22" in sec
    # the answered line climbs 0, 2, 3, 7 against a top of 8 and ends on 7;
    # the total line sits at 900..1,304 against 1,500; both carry pin 1 at
    # the Europe night, two thirds of the way along
    assert 'points="0.0,100.0 200.0,75.0 400.0,62.5 600.0,12.5"' in sec
    assert '<div class="end" style="bottom:87.5%">7</div>' in sec
    assert '<div class="end" style="bottom:86.9%">1,304</div>' in sec
    assert sec.count('<div class="mark" style="left:66.7%"></div>'
                     '<div class="pin" style="left:66.7%">1</div>') == 2
    assert sec.count('<div class="pins ended"><span><b>1</b>Europe, 44 countries, '
                     "2026-08-24</span></div>") == 2
    assert '<span style="bottom:50%">1,500</span>' not in sec  # top is 1,500: labelled 750
    assert '<span style="bottom:100%">1,500</span>' in sec
    # the coverage night is drawn clipped in the added chart, its number on it
    assert ('<div class="col" title="2026-08-24 · +5,420 new · a coverage night, drawn clipped">'
            '<span class="n">5,420</span><div class="seg clip cap" style="height:100%"></div></div>') in sec
    assert '<span style="bottom:100%">20</span>' in sec  # the ordinary nights set the top
    assert '<span style="bottom:0%">−2</span>' in sec


def test_dataset_section_is_one_proportion_bar():
    html = render()
    sec = html[html.index("<h2>Dataset</h2>"):html.index("<h2>Pipeline</h2>")]
    assert "1,931 changing tables on the map tonight" in sec
    assert ('<div style="width:94.3%;background:var(--s-green)" '
            'title="1,821 accessible · 94.3 %"></div>') in sec
    assert "60 female-only · 3.1 %" in sec and "50 room unknown · 2.6 %" in sec
    assert "79,053 changing tables worldwide (taginfo, 2026-08-22)" in sec
    assert "<dt>toilets in the swept area</dt><dd>10,200</dd>" in sec
    html = render(counts=None)
    assert "changing_tables.geojson is missing" in html


def test_column_chart_pieces():
    """Every column chart is a frame: the value axis in the left column at
    the heights the drawing uses, the drawing and the date axis in the
    right. Segments are measured against the round top; a total beyond it
    is clipped and hatched with its number; `labels_from` prints the totals
    that reach it."""
    rows = [("2026-09-01", "a", [("theme", 7)]), ("2026-09-02", "b", None),
            ("2026-09-03", "c", [("theme", 1), ("app", 1)]),
            ("2026-09-04", "d", [("theme", 40)])]
    html = ops_page._frame(8, ops_page._columns(rows, 8, labels_from=7),
                           ops_page._axis("2026-09-01", "2026-09-04", "per day"), pad=16)
    assert html.startswith('<div class="chart" style="padding-top:16px">'
                           '<div class="chart-y" aria-hidden="true">'
                           '<span style="bottom:0%">0</span>'
                           '<span style="bottom:50%">4</span>'
                           '<span style="bottom:100%">8</span></div>'
                           '<div class="bars">')
    assert html.count('class="col"') == 4
    assert ('<div class="col" title="a"><span class="n">7</span>'
            '<div class="seg theme cap" style="height:87.5%"></div></div>') in html
    assert '<div class="col" title="b"></div>' in html
    assert ('<div class="col" title="c"><div class="seg app cap" style="height:12.5%"></div>'
            '<div class="seg theme" style="height:12.5%"></div></div>') in html
    assert ('<div class="col" title="d"><span class="n">40</span>'
            '<div class="seg clip cap" style="height:100%"></div></div>') in html
    assert html.endswith('<div class="x"><span>2026-09-01</span><span>per day</span>'
                         '<span>2026-09-04</span></div>\n</div>\n')
    assert ops_page._columns([], 8) == '<div class="bars"></div>\n'
    # two clipped nights in a row: the second keeps its number off the chart
    html = ops_page._columns([("a", "a", [("theme", 50)]), ("b", "b", [("theme", 60)]),
                              ("c", "c", [("theme", 1)]), ("d", "d", [("theme", 70)])], 8)
    assert html.count('class="n"') == 2 and ">50<" in html and ">70<" in html


def test_line_chart_pieces():
    assert ops_page._nice_top(2960) == 3000
    assert ops_page._nice_top(941) == 1000
    assert ops_page._nice_top(1821) == 2000
    html = ops_page._line([941, 2960], 3000, "--s-total", end="2,960")
    # 2,960 of 3,000 sits just under the top edge, 941 a third of the way up
    assert 'points="0.0,68.6 600.0,1.3"' in html
    assert 'stroke="var(--s-total)"' in html and "non-scaling-stroke" in html
    assert html.startswith('<div class="line ended">')
    assert ('<div class="enddot" style="bottom:98.7%;background:var(--s-total)"></div>'
            '<div class="end" style="bottom:98.7%">2,960</div>') in html
    # a cumulative line gets the wash under it; pins sit at their run's x
    html = ops_page._line([0, 1, 3, 4], 4, "--s-green", area=True,
                          pins=[{"index": 2, "label": "x", "date": "2026-09-03"}])
    assert '<polygon points="0,100 0.0,100.0 200.0,75.0 400.0,25.0 600.0,0.0 600.0,100"' in html
    assert ('<div class="mark" style="left:66.7%"></div>'
            '<div class="pin" style="left:66.7%">1</div>') in html
    assert html.startswith('<div class="line">')
    assert ops_page._pins([{"label": "x", "date": "2026-09-03"}]) == \
        '<div class="pins"><span><b>1</b>x, 2026-09-03</span></div>\n'
    assert ops_page._pins([]) == ""
    # a run without the figure is skipped, not drawn as zero
    assert 'points="0.0,50.0 600.0,0.0"' in ops_page._line([2, None, 4], 4, "--s-green")
    assert ops_page._line([5], 5, "--s-green") == ""
    assert ops_page._line([None, 5], 5, "--s-green") == ""
    # a half-step top keeps its half exact rather than rounding 7.5 to "8"
    assert '<span style="bottom:50%">7.5</span>' in ops_page._y_labels(15)


def test_last_build_is_collapsed_unless_it_went_wrong():
    html = render()
    assert ('<details id="build">\n<summary>Last build <span class="ok">finished</span> '
            '<span class="tag">1,931 features</span> <span class="tag">3 areas swept, '
            '1 with zero tables</span> <span class="warn">2 warnings</span></summary>') in html
    running = ops_page.parse_build_log(
        FINISHED_BUILD + "  Bayern: ct=1 play=1 toilets=1\n")
    html = render(build=running)
    assert '<details id="build" open>\n<summary>Last build <span class="bad">not finished</span>' in html
    assert "no build found in pipeline.log" in render(build=None)


# ---- The private copy --------------------------------------------------------

VISITS = {"2026-08-20": {"requests": 2500, "uniques": 600},
          "2026-08-21": {"requests": 2600, "uniques": 640},
          "2026-08-22": {"requests": 2400, "uniques": 590}}

READERS = {"2026-08-20": 70, "2026-08-21": 64, "2026-08-22": 74}


def test_private_page_leads_with_readers_and_the_public_never_does():
    private = render(private=True, readers=READERS, visits=VISITS)
    assert "<title>PapaMap ops (private)</title>" in private
    assert "<h2>Readers</h2>" in private
    assert private.index("<h2>This week</h2>") < private.index("<h2>Readers</h2>") \
        < private.index("<h2>Apps</h2>") < private.index("<h2>Edits via PapaMap</h2>")
    sec = private[private.index("<h2>Readers</h2>"):private.index("<h2>Apps</h2>")]
    assert ('<span class="l">Yesterday</span><span class="v">74</span>'
            '<span class="s">2026-08-22, complete UTC day</span>') in sec
    assert ('<span class="l">7-day average</span><span class="v">69</span>'
            '<span class="s">3 days recorded</span>') in sec
    assert ('<span class="l">Last 3 days</span><span class="v">208</span>') in sec
    assert ('<span class="l">Best day</span><span class="v">74</span>'
            '<span class="s">2026-08-22</span>') in sec
    assert 'title="2026-08-21 · 64 readers"' in sec
    assert "readers per day, the last 3 days" in sec
    assert '<span style="bottom:100%">80</span>' in sec
    # the raw figures sit in the collapsed table, every day either source has
    assert "Cloudflare raw figures, bots included" in sec
    assert '<td class="l">2026-08-21</td><td>64</td><td>640</td><td>2,600</td>' in sec
    assert "identifies nobody" in private
    public = render(private=False, readers=READERS, visits=VISITS)
    assert "Readers" not in public and "7,500" not in public and "640" not in public
    assert "no analytics" in public


def test_readers_series_with_a_gap_and_an_old_newest_day():
    readers = {"2026-08-10": 50, "2026-08-12": 90}
    html = render(private=True, readers=readers)
    sec = html[html.index("<h2>Readers</h2>"):html.index("<h2>Apps</h2>")]
    assert ('<span class="l">Newest day, 2026-08-12</span><span class="v">90</span>'
            '<span class="s">the ledger stops here</span>') in sec
    assert '<div class="col" title="2026-08-11 · no count"></div>' in sec
    assert "Readers, 2026-08-12" in html  # the week strip says which day
    # and a ledger that stopped answering is said, not left to the dates
    assert ("The readers ledger has no complete day after 2026-08-12: 10 days "
            "missing from the tiles and the chart, which stop there.") in sec
    fresh = render(private=True, readers={"2026-08-22": 74})
    assert "readers ledger has no complete day" not in fresh


def test_readers_stats_windows():
    from datetime import date, timedelta
    start = date(2026, 7, 1)
    readers = {(start + timedelta(days=i)).isoformat(): 10 + i for i in range(40)}
    st = ops_page.readers_stats(readers, datetime(2026, 8, 10, 5, 30, tzinfo=timezone.utc))
    assert st["last_day"] == "2026-08-09" and st["is_yesterday"] and st["last"] == 49
    assert st["week_avg"] == 46 and st["before_avg"] == 39
    assert st["month"] == sum(range(20, 50)) and st["month_days"] == 30
    assert st["best"] == 49 and st["best_day"] == "2026-08-09"
    assert ops_page.readers_stats(None, NOW) is None
    assert ops_page.readers_stats({}, NOW) is None


def test_private_page_without_a_readers_series_shows_the_uniques():
    html = render(private=True, visits=VISITS)
    sec = html[html.index("<h2>Readers</h2>"):html.index("<h2>Apps</h2>")]
    assert "No readers series yet" in sec
    assert ('<span class="l">Uniques yesterday</span><span class="v">590</span>'
            '<span class="s">2026-08-22</span>') in sec
    assert ('<span class="l">Uniques, last 7 days</span><span class="v">1,830</span>'
            '<span class="s">2026-08-20 → 2026-08-22</span>') in sec
    assert '<span class="v">7,500</span>' in sec
    assert 'title="2026-08-21 · 640 uniques · 2,600 requests"' in sec
    assert "Cloudflare uniques per day" in sec
    assert '<td class="l">2026-08-21</td><td>–</td><td>640</td><td>2,600</td>' in sec
    html = render(private=True, visits=None)
    assert "<h2>Readers</h2>" in html and "No readers or Cloudflare figures yet" in html


def test_readers_ledger_is_read_final_days_only(tmp_path, capsys):
    ledger = tmp_path / "readers-history.json"
    ledger.write_text(json.dumps({"zones": {
        "papamap.de": {"2026-08-21": {"count": 64, "limited": False, "final": True},
                       "2026-08-22": {"count": 74, "limited": True, "final": True},
                       "2026-08-23": {"count": 9, "limited": False, "final": False},
                       "total": {"count": 138, "limited": False, "final": True},
                       "bad": "not an entry"},
        "other.example": {"2026-08-22": {"count": 1, "final": True}}}}))
    assert ops.read_readers_ledger(str(ledger)) == {"2026-08-21": 64, "2026-08-22": 74}
    assert ops.read_readers_ledger(str(ledger), "other.example") == {"2026-08-22": 1}
    assert ops.read_readers_ledger("") is None
    assert ops.read_readers_ledger(str(tmp_path / "absent.json")) is None
    assert ops.read_readers_ledger(str(ledger), "nobody.example") is None
    err = capsys.readouterr().err
    assert err.count("WARN: readers ledger not read") == 2
    # merged like the visits: the ledger's final day overwrites, capped
    kept = {"2026-08-21": 60, "2026-08-20": 70}
    assert ops.merge_readers(kept, {"2026-08-21": 64, "2026-08-22": 74}) == \
        {"2026-08-20": 70, "2026-08-21": 64, "2026-08-22": 74}
    assert ops.merge_readers(kept, None) == {"2026-08-20": 70, "2026-08-21": 60}
    from datetime import date, timedelta
    big = {(date(2025, 1, 1) + timedelta(days=i)).isoformat(): 1 for i in range(450)}
    merged = ops.merge_readers(big, {"2027-01-01": 1})
    assert len(merged) == ops.READERS_HISTORY_DAYS and "2027-01-01" in merged


def test_run_check_copies_the_readers_into_the_state_and_the_page(tmp_path):
    (tmp_path / "stats.json").write_text(json.dumps(
        {"generated_at": NOW.isoformat(timespec="seconds")}))
    (tmp_path / "gj.json").write_text(json.dumps({"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": None,
         "properties": {"osm_type": "node", "osm_id": 1, "status": "unknown"}}]}))
    ledger = tmp_path / "readers-history.json"
    ledger.write_text(json.dumps({"zones": {"papamap.de": {
        "2026-08-22": {"count": 74, "limited": False, "final": True},
        "2026-08-23": {"count": 9, "limited": False, "final": False}}}}))
    state_path = tmp_path / "state.json"
    private_path = tmp_path / "private" / "ops.html"
    sent = []

    def run(now, path):
        return ops.run_check(
            now=now, state_path=str(state_path),
            stats_path=str(tmp_path / "stats.json"),
            geojson_path=str(tmp_path / "gj.json"),
            mail=lambda subject, body: sent.append(body),
            visits_fetch=lambda **kw: None, edits_fetch=lambda **kw: None,
            html_path=str(tmp_path / "ops.html"), private_html_path=str(private_path),
            history_path=str(tmp_path / "none.json"),
            build_log_path=str(tmp_path / "none.log"), delta_path="",
            readers_ledger_path=path)

    run(NOW, str(ledger))
    assert json.loads(state_path.read_text())["readers_days"] == {"2026-08-22": 74}
    private = private_path.read_text()
    assert "Readers yesterday" in private and '<span class="v">74</span>' in private
    assert "readers" not in (tmp_path / "ops.html").read_text().lower()
    # the ledger gone: the series stays, and the Monday digest quotes it
    monday = datetime(2026, 8, 24, 5, 30, tzinfo=timezone.utc)
    run(monday, str(tmp_path / "absent.json"))
    assert json.loads(state_path.read_text())["readers_days"] == {"2026-08-22": 74}
    assert any("readers (fleet ledger, 1d to 2026-08-22): 74 total, 74/day" in b
               for b in sent)
    # no path: nothing read, nothing in the state
    sent.clear()
    run(datetime(2026, 8, 25, 5, 30, tzinfo=timezone.utc), "")
    assert json.loads(state_path.read_text())["readers_days"] == {"2026-08-22": 74}


def test_apps_section_is_private_and_absent_from_the_public_page():
    """Downloads, installs, ratings: one card per store, one table with
    both side by side, on the private page only."""
    now = datetime(2026, 10, 4, 5, 30, tzinfo=timezone.utc)
    apps = {"ratings": RATINGS,
            "ios": {"by_day": {}, "pending": ["2026-10-03"]},
            "android": {"by_day": {}}}
    html = render(now=now, private=True, apps=apps, app_days=APP_DAYS,
                  app_ratings=RATINGS)
    assert "<h2>Apps</h2>" in html
    assert html.index("<h2>Readers</h2>") < html.index("<h2>Apps</h2>") \
        < html.index("<h2>Edits via PapaMap</h2>")
    sec = html[html.index("<h2>Apps</h2>"):html.index("<h2>Edits via PapaMap</h2>")]
    assert "<h3>App Store</h3>" in sec and "version 1.2 since 2026-10-02" in sec
    assert ('<span class="l">Ratings</span><span class="v">3 <small>5.0 average</small>'
            '</span><span class="s">de 2, cz 1</span>') in sec
    assert "Ratings as of 2026-10-04." in sec
    assert "Apple has not published 2026-10-03 yet." in sec
    assert ('<span class="l">All 2 published days</span><span class="v">10</span>'
            '<span class="s">2026-10-01 → 2026-10-02</span>') in sec
    assert "saw 1 re-downloads and 22 updates" in sec
    assert ('<span class="l">All 3 reported days</span><span class="v">6</span>'
            '<span class="s">2026-10-01 → 2026-10-03</span>') in sec
    assert ('<span class="l">Active devices</span><span class="v">24</span>'
            '<span class="s">2026-10-03</span>') in sec
    assert "first-time downloads per day" in sec and "installs per day" in sec
    assert 'title="2026-10-02 · 6 downloads"' in sec
    assert 'title="2026-10-03 · 3 installs"' in sec
    assert 'Every day, both stores <span class="tag">3 days</span>' in sec
    assert ('<td class="l">2026-10-03</td><td>–</td><td>–</td><td>–</td>'
            "<td>3</td><td>0</td><td>24</td>") in sec
    # the public page carries none of it, by design
    public = render(now=now, apps=apps, app_days=APP_DAYS, app_ratings=RATINGS)
    assert "<h2>Apps</h2>" not in public and "Ratings" not in public
    assert "2026-10-03</td>" not in public and "downloads" not in public


def test_apps_section_says_unset_failed_and_no_day_yet_in_words():
    now = datetime(2026, 10, 4, 5, 30, tzinfo=timezone.utc)
    html = render(now=now, private=True)
    assert ("No store figures — PAPAMAP_APP_STORE_ID / PAPAMAP_ANDROID_PACKAGE "
            "unset") in html
    # ids set, credentials not: each store names what is missing
    html = render(now=now, private=True,
                  apps={"ratings": None, "ios": None, "android": None})
    assert ("Downloads not fetched — ASC_ISSUER_ID, ASC_KEY_ID, "
            "ASC_API_KEY_P8_B64 and ASC_VENDOR_NUMBER unset") in html
    assert ("Installs not fetched — PLAY_SERVICE_ACCOUNT_JSON_B64 and "
            "PLAY_STATS_BUCKET unset") in html
    assert "No published day yet" not in html
    # failures are said and never shown as a zero
    html = render(now=now, private=True, app_days={},
                  apps={"ratings": None,
                        "ios": {"error": "HTTP 401", "by_day": {}, "pending": []},
                        "android": {"error": "invalid_grant", "by_day": {}}})
    assert "App Store report: failed (HTTP 401). Not zero." in html
    assert "Play statistics: failed (invalid_grant). Not zero." in html
    assert "No published day yet" not in html and "No reported day yet" not in html
    # configured and answering, no day yet
    html = render(now=now, private=True,
                  apps={"ratings": None, "ios": {"by_day": {}, "pending": []},
                        "android": {"by_day": {}}})
    assert "No published day yet." in html and "No reported day yet." in html
    # the all-time tile once the history reaches the App Store launch, and
    # the week strip names the launch too
    hist = {d: {"ios_downloads": 1} for d in
            (f"2026-09-{n:02d}" for n in range(25, 31))}
    html = render(now=now, private=True, app_days=hist,
                  apps={"ratings": None, "ios": {"by_day": {}, "pending": []},
                        "android": None})
    assert ('<span class="l">Since launch</span><span class="v">6</span>'
            '<span class="s">in the store since 2026-09-25</span>') in html
    assert "6 since launch 2026-09-25 · Play: no report yet" in html
