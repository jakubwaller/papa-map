import json

from pipeline import backfill, leaderboard
from pipeline.config import changing_table_ids_ql


def day(date, regions=None, cities=None, source="build"):
    return {"date": date, "source": source,
            "regions": regions or {}, "cities": cities or {}}


# ---- History ----------------------------------------------------------------

def test_load_history_cold_start(tmp_path):
    assert leaderboard.load_history(tmp_path / "missing.json") == {
        "v": 1, "days": []}
    broken = tmp_path / "broken.json"
    broken.write_text("{not json", encoding="utf-8")
    assert leaderboard.load_history(broken) == {"v": 1, "days": []}
    wrong_shape = tmp_path / "wrong.json"
    wrong_shape.write_text('{"days": "nope"}', encoding="utf-8")
    assert leaderboard.load_history(wrong_shape) == {"v": 1, "days": []}


def test_append_day_replaces_same_date_and_keeps_order():
    history = {"v": 1, "days": [day("2026-08-14", regions={"A": [1, 0, 0]})]}
    leaderboard.append_day(history, "2026-08-14", {"A": [2, 0, 0]}, {})
    assert [d["date"] for d in history["days"]] == ["2026-08-14"]
    assert history["days"][0]["regions"] == {"A": [2, 0, 0]}
    # A backfilled day arriving after the fact still sorts before it.
    leaderboard.append_day(history, "2026-08-10", {}, {}, source="backfill")
    assert [d["date"] for d in history["days"]] == ["2026-08-10", "2026-08-14"]


def test_append_day_caps_history(monkeypatch):
    monkeypatch.setattr(leaderboard, "HISTORY_MAX_DAYS", 3)
    history = {"v": 1, "days": []}
    for i in range(1, 6):
        leaderboard.append_day(history, f"2026-08-{i:02d}", {}, {})
    assert [d["date"] for d in history["days"]] == [
        "2026-08-03", "2026-08-04", "2026-08-05"]


def test_counts_from_features_seeds_zeros_and_assigns():
    features = [
        {"properties": {"osm_type": "node", "osm_id": 1, "status": "accessible"}},
        {"properties": {"osm_type": "node", "osm_id": 2, "status": "female_only"}},
        {"properties": {"osm_type": "node", "osm_id": 3, "status": "unknown"}},
        {"properties": {"osm_type": "node", "osm_id": 4, "status": "weird"}},
        {"properties": {"osm_type": "node", "osm_id": 5, "status": "accessible"}},
    ]
    region_by_key = {("node", 1): "Bayern", ("node", 2): "Bayern",
                     ("node", 3): "Bayern", ("node", 4): "Bayern"}
    city_by_key = {("node", 1): "München"}
    regions, cities = leaderboard.counts_from_features(
        features, region_by_key, city_by_key,
        region_names=["Bayern", "Danmark"], city_names=["München", "Berlin"])
    # id 4's junk status falls back to unknown; id 5 belongs to no region and
    # counts nowhere; regions/cities without features stay explicit zeros.
    assert regions == {"Bayern": [1, 1, 2], "Danmark": [0, 0, 0]}
    assert cities == {"München": [1, 0, 0], "Berlin": [0, 0, 0]}


# ---- Deltas -----------------------------------------------------------------

def test_baseline_is_newest_entry_at_least_a_week_back():
    history = {"v": 1, "days": [
        day("2026-08-01"), day("2026-08-07"), day("2026-08-13"),
        day("2026-08-14")]}
    assert leaderboard.leaderboard_data(history)["base_date"] == "2026-08-07"


def test_young_history_falls_back_to_oldest_entry():
    history = {"v": 1, "days": [day("2026-08-13"), day("2026-08-14")]}
    assert leaderboard.leaderboard_data(history)["base_date"] == "2026-08-13"


def test_single_day_has_no_baseline():
    history = {"v": 1, "days": [day("2026-08-14", regions={"A": [1, 0, 1]})]}
    data = leaderboard.leaderboard_data(history)
    assert data["base_date"] is None
    assert data["regions"][0]["delta_pp"] is None


def test_ranking_by_answered_share_gain():
    history = {"v": 1, "days": [
        day("2026-08-07", regions={
            "A": [1, 0, 9], "B": [5, 0, 5], "C": [2, 0, 8], "E": [1, 0, 9]}),
        day("2026-08-14", regions={
            "A": [3, 0, 7], "B": [6, 0, 4], "C": [2, 0, 8], "D": [4, 0, 6],
            "E": [1, 2, 7]}),
    ]}
    data = leaderboard.leaderboard_data(history)
    rows = {r["name"]: r for r in data["regions"]}
    assert rows["A"]["delta_pp"] == 20.0
    assert rows["E"]["delta_pp"] == 20.0
    assert rows["B"]["delta_pp"] == 10.0
    assert rows["C"]["delta_pp"] == 0.0
    assert rows["D"]["delta_pp"] is None  # not in the baseline yet
    # Equal share gain: A's answers turned accessible, E's female_only — the
    # accessible tiebreak puts A first. D, uncomparable, sorts last.
    assert [r["name"] for r in data["regions"]] == ["A", "E", "B", "C", "D"]


# ---- Rendering --------------------------------------------------------------

def test_render_german_page(tmp_path):
    history = {"v": 1, "days": [
        day("2026-08-07", regions={"Bayern": [1, 0, 9]},
            cities={"München": [1, 0, 1]}),
        day("2026-08-14", regions={"Bayern": [3, 0, 7]},
            cities={"München": [1, 1, 0]}),
    ]}
    html = leaderboard.render_leaderboard(
        "de", leaderboard.leaderboard_data(history))
    assert 'lang="de"' in html
    assert "+20,0" in html  # German decimal comma
    assert "Veränderung gegenüber dem 7. August 2026" in html
    assert 'hreflang="en"' in html and "leaderboard.html" in html
    assert "Damen-WC" in html  # the honesty line about red answers


def test_render_quiet_and_fresh_notes():
    still = {"Bayern": [2, 0, 8]}
    history = {"v": 1, "days": [day("2026-08-01", regions=dict(still)),
                                day("2026-08-14", regions=dict(still))]}
    html = leaderboard.render_leaderboard(
        "de", leaderboard.leaderboard_data(history))
    assert "nirgends etwas bewegt" in html
    fresh = {"v": 1, "days": [day("2026-08-14", regions=dict(still))]}
    html = leaderboard.render_leaderboard(
        "en", leaderboard.leaderboard_data(fresh))
    assert 'lang="en"' in html
    assert "Recording started on 14 August 2026" in html


def test_write_leaderboard_pages(tmp_path):
    assert leaderboard.write_leaderboard_pages({"v": 1, "days": []},
                                               str(tmp_path)) == []
    history = {"v": 1, "days": [day("2026-08-14",
                                    regions={"Bayern": [1, 0, 1]})]}
    written = leaderboard.write_leaderboard_pages(history, str(tmp_path))
    assert sorted(p.rsplit("/", 1)[-1] for p in written) == [
        "leaderboard.html", "rangliste.html"]
    for p in written:
        assert "OpenStreetMap" in open(p, encoding="utf-8").read()


# ---- Backfill ---------------------------------------------------------------

def test_ids_ql_and_attic_date():
    ql = changing_table_ids_ql("Berlin", "4", date="2026-07-17T00:00:00Z")
    assert 'area["name"="Berlin"]["admin_level"="4"]' in ql
    assert '[date:"2026-07-17T00:00:00Z"]' in ql
    assert ql.endswith("out ids;")


def test_backfill_seeds_history_through_the_build_path(tmp_path, load_fixture):
    history_path = tmp_path / "history.json"
    calls = []

    def fake_fetch(ql):
        calls.append(ql)
        if "out ids" in ql:
            return {"elements": [{"type": "node", "id": 1}]}
        return load_fixture("overpass_changing_tables.json")

    added = backfill.backfill(
        ["2026-07-24", "2026-07-17"], history_path=str(history_path),
        areas=[("Hamburg", "4"), ("Danmark", "2")],
        cities=[("Berlin", "Berlin", "4")],
        fetch=fake_fetch, pause_s=0, sleep=lambda s: None)
    assert added == ["2026-07-17", "2026-07-24"]  # oldest first
    history = json.loads(history_path.read_text(encoding="utf-8"))
    assert [d["date"] for d in history["days"]] == ["2026-07-17", "2026-07-24"]
    first = history["days"][0]
    assert first["source"] == "backfill"
    # Same fixture from both areas: dedup + first-wins, like the live sweep.
    assert first["regions"] == {"Hamburg": [3, 2, 2], "Danmark": [0, 0, 0]}
    assert first["cities"] == {"Berlin": [1, 0, 0]}  # node/1 is accessible
    assert all('[date:"' in q for q in calls)


def test_backfill_never_overwrites_an_existing_day(tmp_path):
    history_path = tmp_path / "history.json"
    sentinel = day("2026-07-24", regions={"Bayern": [9, 9, 9]})
    history_path.write_text(json.dumps({"v": 1, "days": [sentinel]}),
                            encoding="utf-8")

    def must_not_fetch(ql):
        raise AssertionError("a skipped date must not query Overpass")

    added = backfill.backfill(["2026-07-24"], history_path=str(history_path),
                              areas=[("Hamburg", "4")], cities=[],
                              fetch=must_not_fetch, pause_s=0,
                              sleep=lambda s: None)
    assert added == []
    unchanged = json.loads(history_path.read_text(encoding="utf-8"))
    assert unchanged["days"] == [sentinel]
