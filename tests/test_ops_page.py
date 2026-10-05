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


def test_healthy_page_carries_every_section():
    html = render()
    assert "<title>PapaMap ops</title>" in html
    assert 'name="robots" content="noindex"' in html
    assert "Healthy" in html and "Anomalies" not in html
    assert "1,931" in html and "1,821" in html and "94.3 %" in html
    assert "dataset built 2026-08-23T02:20:00+00:00 (3 h ago)" in html
    assert "since yesterday" in html and "last 7 days (3 runs)" in html
    assert "Edits through the PapaMap theme" in html
    assert "<b>4</b>" in html and "all 2 recorded days, 2026-08-21 → 2026-08-22" in html
    assert "as of 2026-08-17" not in html  # the tiles replace the dated line
    assert "finished" in html and "45" in html and "3 areas swept, 1 with zero tables" in html
    assert "round 2: Italy" in html
    assert "Baden-Württemberg" in html
    assert "Bayern" in html and "Berlin" in html
    assert "2026-08-21" in html and 'class="spark"' in html
    assert html.count('class="bars"') == 2  # transitions + theme edits
    # Every drawing carries a date axis and a value axis: two bar charts
    # plus the sparkline.
    assert html.count('class="bar-axis"') == 3
    assert html.count('class="chart-y"') == 3
    # The sparkline's caption says what the line is, in dates and numbers.
    assert ("Accessible pins in total, one point per nightly run: 1,810 on "
            "2026-08-21 → 1,821 on 2026-08-23") in html
    assert "no analytics" in html
    assert "<h2>Live updates</h2>" in html and "7,307,321" in html
    assert html.index("<h2>Dataset</h2>") < html.index("<h2>Live updates</h2>") \
        < html.index("<h2>Movement</h2>")


def test_live_updates_values_wrap_on_a_phone():
    # The shared td rule is nowrap; this table's values are sentences with
    # timestamps in them and pushed the page to 850px on a 375px screen.
    html = render()
    section = html[html.index("<h2>Live updates</h2>"):html.index("<h2>Movement</h2>")]
    assert '<table class="kv">' in section
    assert "table.kv td { white-space: normal; overflow-wrap: anywhere;" in html


def test_live_updates_section_absent_when_not_expected():
    assert "Live updates" not in render(delta=None, delta_expected=False)


def test_live_updates_missing_message():
    html = render(delta=None)
    assert ('<p class="bad">delta.json is missing — the live-updates follower '
            "is not running.</p>") in html
    assert "7,307,321" not in html


def test_live_updates_rows_when_healthy():
    html = render()
    assert "2026-08-23T05:28:00+00:00 (2 min ago)" in html
    assert "+3 / −1" in html and "+2 / −0" in html
    assert "matches the dataset" in html
    assert "<td>0</td>" in html  # pending lookups
    assert "unknown (state file not readable)" not in html


def test_live_updates_stale_tick_is_red():
    html = render(delta={**HEALTHY_DELTA, "stale": True, "age_min": 95.0})
    assert '<td class="bad">2026-08-23T05:28:00+00:00 (95 min ago)</td>' in html


def test_live_updates_base_behind_and_unknown():
    html = render(delta={**HEALTHY_DELTA, "base_ok": False,
                         "base": "2026-08-22T02:20:00+00:00"})
    assert ("BEHIND the dataset (2026-08-23T02:20:00+00:00) — readers ignore "
            "this delta") in html
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


def test_no_orphan_axis_when_the_sparkline_draws_nothing():
    """A history whose entries carry no counts gives _sparkline nothing to
    draw; the caption and date axis must vanish with it rather than label an
    empty space (reviewer finding on PR #78)."""
    html = render(history=[{"date": "2026-08-21"}, {"date": "2026-08-22"}])
    assert "Accessible pins in total" not in html
    # only the two bar charts' axes remain
    assert html.count('class="bar-axis"') == html.count('class="bars"')


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
    # 2026-08-23 is a third of it. The exact split rides in the title; the
    # bars are measured against the axis top of 10, not against the 9.
    assert 'title="2026-08-22 · 9 → accessible, 0 → female-only, 0 → unknown · +5 new, -0 gone"' in html
    assert '<div class="bar" style="height:90.0%">' in html
    assert '<div class="bar" style="height:30.0%">' in html
    assert '<span style="bottom:50%">5</span><span style="bottom:100%">10</span>' in html
    # The theme chart tops out at 3 changesets, drawn against 4 so that the
    # half label is a whole 2, never "1.5".
    assert 'title="2026-08-22 · 3 changesets"' in html
    assert '<div class="bar" style="height:75.0%">' in html
    assert '<div class="bar" style="height:25.0%">' in html
    assert '<span style="bottom:50%">2</span><span style="bottom:100%">4</span>' in html
    assert ">1.5</span>" not in html
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


def test_edits_section_tiles_chart_labels_and_table():
    hist = days_from("2026-08-03", [1] * 39 + [9])
    html = render(edits_days=hist, now=datetime(2026, 9, 12, 5, 30,
                                                tzinfo=timezone.utc))
    assert "changesets, last 7 days, 2026-09-05 → 2026-09-11" in html
    assert "changesets, last 30 days, 2026-08-13 → 2026-09-11" in html
    assert "changesets, all time, theme live since 2026-08-13" in html
    assert "<b>15</b>" in html and "<b>38</b>" in html and "<b>48</b>" in html
    # the number sits above its column, on both charts: the 40 theme days
    # plus the fixture's two days with transitions
    assert '<span class="bar-n">9</span><div class="bar" style="height:90.0%">' in html
    assert html.count('data-labelled=""') == 2  # the CSS rule is the other mention
    assert html.count('class="bar-n"') == 40 + 2
    # every recorded day, newest first, in the details table
    assert "<summary>all 40 days</summary>" in html
    assert html.index('<td class="l">2026-09-11</td><td>9</td>') \
        < html.index('<td class="l">2026-09-10</td><td>1</td>')
    assert "has not answered" not in html and "split stops" not in html


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


def test_answers_section_tiles_chart_and_table():
    """The answers given on the map itself get the theme section's shape —
    tiles, labelled chart, table — from their own history, under the theme's
    section, with their own launch day for the all-time tile."""
    now = datetime(2026, 10, 6, 5, 30, tzinfo=timezone.utc)
    hist = days_from("2026-09-13", [1] * 22 + [7])          # ends 2026-10-05
    html = render(now=now, web_edits_days=hist,
                  edits={"days": 7, "changesets": 9, "as_of": "2026-10-06",
                         "web_changesets": 13})
    assert "<h2>Answers on the map itself</h2>" in html
    assert html.index("<h2>Edits through the PapaMap theme</h2>") \
        < html.index("<h2>Answers on the map itself</h2>") \
        < html.index("<h2>Last build</h2>")
    assert "answers, last 7 days, 2026-09-29 → 2026-10-05" in html
    assert "answers, all time, answering on the map since 2026-09-13" in html
    assert "answers, last 30 days" not in html  # 23 days cannot fill it
    assert "<b>13</b>" in html and "<b>29</b>" in html
    assert "Answers on the map itself per day" in html
    assert html.count('class="bars"') == 3   # transitions, theme, answers
    assert 'title="2026-10-05 · 7 answers"' in html
    assert 'title="2026-10-04 · 1 answer"' in html
    assert "<th>answers</th>" in html and "<summary>all 23 days</summary>" in html
    assert html.index('<td class="l">2026-10-05</td><td>7</td>') \
        < html.index('<td class="l">2026-10-04</td><td>1</td>')
    assert "answers query has not answered" not in html
    # a history stopping short of yesterday is said, in this section's words
    html = render(now=datetime(2026, 10, 9, 5, 30, tzinfo=timezone.utc),
                  web_edits_days=hist)
    assert ("The daily OSMCha answers query has not answered since "
            "2026-10-05: 3 days missing from the totals above") in html
    # a failed fetch: pointed at, not repeated, and no stale note on top
    html = render(now=datetime(2026, 10, 9, 5, 30, tzinfo=timezone.utc),
                  web_edits_days=hist, edits={"days": 7, "error": "timed out"})
    assert "Not counted this run" in html and html.count("Not zero.") == 1
    assert "answers query has not answered" not in html
    # the count arrived but the split did not (a week beyond one page): the
    # fresher number with its reason, not a claim that the query failed
    html = render(now=datetime(2026, 10, 9, 5, 30, tzinfo=timezone.utc),
                  web_edits_days=hist,
                  edits={"days": 7, "changesets": 9, "as_of": "2026-10-09",
                         "web_changesets": 130})
    assert ("OSMCha's 7-day count of answers as of 2026-10-09 is <b>130</b>, "
            "but the per-day split stops at 2026-10-05") in html
    assert "answers query has not answered" not in html
    # the theme answered today but the answers query did not: the stale note,
    # since the cached line carries no count
    html = render(now=datetime(2026, 10, 9, 5, 30, tzinfo=timezone.utc),
                  web_edits_days=hist,
                  edits={"days": 7, "changesets": 9, "as_of": "2026-10-09"})
    assert "has not answered since 2026-10-05: 3 days missing" in html


def test_young_answers_history_shows_the_count_or_says_none_yet():
    """Before the per-day series exists the cached 7-day count is the whole
    section; a state from before the count existed says so instead of
    showing nothing (or, worse, a zero)."""
    html = render(edits={"days": 7, "changesets": 4, "as_of": "2026-08-17",
                         "web_changesets": 2})
    assert "OSMCha, 7 d as of 2026-08-17: <b>2</b> answers." in html
    assert ("A per-day chart of these appears here once a daily OSMCha "
            "fetch records the split.") in html
    html = render()
    assert "<h2>Answers on the map itself</h2>" in html
    assert "No count yet" in html and "<b>0</b> answers" not in html
    assert html.count('class="bars"') == 2  # no chart without a history
    # a cached line dated today without the count: the theme query answered
    # this run and the answers query did not — said, not "not yet"
    html = render(edits={"days": 7, "changesets": 4, "as_of": "2026-08-23"})
    assert ("Not counted this run — the OSMCha answers query failed while "
            "the theme query above answered. Not zero.") in html
    assert "No count yet" not in html


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
    assert "<h2>Answers on the map itself</h2>" in html
    # the fixture's August days are older than the answers' first possible
    # day, so the one tile is already "all time"
    assert "answers, all time, answering on the map since 2026-09-13" in html
    assert "<b>3</b>" in html and 'title="2026-08-22 · 2 answers"' in html
    run({"days": 7, "changesets": 9, "by_day": {"2026-08-22": 8}})
    state = json.loads(state_path.read_text())
    assert state["web_edits_days"] == {"2026-08-21": 1, "2026-08-22": 2}
    assert "web_changesets" not in state["edits"]
    assert 'title="2026-08-22 · 2 answers"' in html_path.read_text()

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
    assert "<b>9</b>" in html and "all 2 recorded days" in html
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
    assert "<b>11</b>" in html and "all 3 recorded days" in html
    assert "Changesets through the PapaMap theme per day" in html

    # A failed fetch keeps the day history, and the page says the totals
    # stopped: seven days (08-24 .. 08-30) are missing by the 31st.
    run(datetime(2026, 8, 31, 5, 30, tzinfo=timezone.utc),
        {"days": 7, "error": "timed out"})
    html = html_path.read_text()
    assert "<b>11</b>" in html
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
            build_log_path=str(tmp_path / "none.log"), delta_path="")

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


def test_column_charts_carry_the_axis_a_phone_needs():
    """Below 560 px the number above each column is hidden (the columns are
    too narrow), and a title tooltip needs a mouse — so on a phone the
    charts said nothing (Trello feedback, 2026-09-27). Every column chart
    now sits in the same frame as the sparkline, with the value axis in the
    left column and the date axis under the drawing."""
    rows = [("2026-09-01", "a", 7, 7), ("2026-09-02", "b", 0, 0),
            ("2026-09-03", "c", 2, 1)]
    html = ops_page._day_bars(rows, "--accent", labels=True)
    assert html.startswith('<div class="chart" data-labelled="">'
                           '<div class="chart-y" aria-hidden="true">'
                           '<span style="bottom:0%">0</span>'
                           '<span style="bottom:50%">4</span>'
                           '<span style="bottom:100%">8</span></div>'
                           '<div class="bars">')
    assert html.count('class="bar-col"') == 3
    assert 'style="height:87.5%"' in html and 'style="height:25.0%"' in html
    assert html.endswith('<div class="bar-axis"><span>2026-09-01</span>'
                         '<span>2026-09-03</span></div>\n</div>\n')
    # an unlabelled chart is the same frame without the headroom attribute
    assert ops_page._day_bars(rows).startswith('<div class="chart"><div class="chart-y"')
    assert ops_page._day_bars([("2026-09-01", "a", 0, 0)]) == ""


def test_sparkline_has_a_zero_based_labelled_y_axis():
    assert ops_page._nice_top(2960) == 3000
    assert ops_page._nice_top(941) == 1000
    assert ops_page._nice_top(1821) == 2000
    html = ops_page._sparkline([941, 2960], "--green", "2026-08-02", "2026-09-24")
    assert '<span style="bottom:0%">0</span>' in html
    assert '<span style="bottom:50%">1,500</span>' in html
    assert '<span style="bottom:100%">3,000</span>' in html
    # 2,960 of 3,000 sits just under the top edge, 941 a third of the way up
    assert 'points="0.0,68.6 600.0,1.3"' in html
    assert 'class="bar-axis"' in html and "2026-09-24" in html
    # the same frame as the column charts, axis first, date axis last
    assert html.startswith('<div class="chart"><div class="chart-y" aria-hidden="true">')
    assert html.endswith('</div>\n</div>\n')
    # a half-step top keeps its half exact rather than rounding 7.5 to "8"
    html = ops_page._sparkline([3, 12], "--accent", "a", "b")
    assert '<span style="bottom:50%">7.5</span>' in html
    assert '<span style="bottom:100%">15</span>' in html
    html = ops_page._sparkline([0, 0], "--accent", "a", "b")
    assert ">0.5</span>" in html and ">1</span>" in html


def test_last_build_is_collapsed_unless_it_went_wrong():
    html = render()
    assert "<details>\n<summary>finished, 1,931 features · 2 warnings" in html
    running = ops_page.parse_build_log(
        FINISHED_BUILD + "  Bayern: ct=1 play=1 toilets=1\n")
    html = render(build=running)
    assert "<details open>\n<summary>not finished" in html
