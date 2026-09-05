"""The toilets-count rota: every area's two counts are recounted one night a
week, not every night, and the cache that makes that possible never gets to
vouch for a mirror it has not seen."""
import json
from datetime import date, timedelta

import pytest

from pipeline import config, toilet_counts
from pipeline.run import run_pipeline

from test_run import (CITY_SWEEP, NOW, SWEEP, _count_answer, _fake_overpass,
                      _fake_taginfo)

TODAY = NOW.date()


def _kwargs(tmp_path, load_fixture, **over):
    kw = dict(geojson_path=str(tmp_path / "ct.geojson"),
              stats_path=str(tmp_path / "stats.json"),
              play_geojson_path=str(tmp_path / "play.geojson"),
              pages_dir=str(tmp_path / "pages"),
              history_path=str(tmp_path / "history.json"),
              counts_path=str(tmp_path / "toilets_counts.json"),
              taginfo_fetch=_fake_taginfo(load_fixture), now=NOW)
    kw.update(over)
    return kw


def _qh(name, level="4"):
    return toilet_counts.query_hash(config.toilets_counts_ql(name, level))


def _seed(path, areas, day, total=3, capacity=1):
    toilet_counts.save(str(path), {
        name: {"total": total, "capacity": capacity, "level": level,
               "query": _qh(name, level), "date": day.isoformat()}
        for name, level in areas})


def _entry(day, total=3, capacity=1, level="4", name="Bremen"):
    return {"total": total, "capacity": capacity, "level": level,
            "query": _qh(name, level), "date": day.isoformat()}


def _count_queries(fetch, area):
    """How many times the area sweep saw this area: once is the sweep alone,
    twice is sweep plus recount. The city ids queries come last and are cut
    off — Berlin and Hamburg are Länder *and* leaderboard cities."""
    return fetch.areas_seen[:len(fetch.areas_seen) - len(CITY_SWEEP)].count(area)


# ---- is_due, the rule itself

def test_missing_or_broken_entries_are_always_due():
    week_ago = TODAY - timedelta(days=6)
    assert toilet_counts.is_due({}, "Bremen", "4", TODAY, 7)
    for bad in ({**_entry(week_ago), "total": "3"},
                {**_entry(week_ago), "total": True},
                {**_entry(week_ago), "date": "not a date"},
                {**_entry(week_ago), "level": "6"}):
        assert toilet_counts.is_due({"Bremen": bad}, "Bremen", "4", TODAY, 7), bad
    # A count made by another query — a widened capacity regex, another
    # selector — is another definition, and is not summed with tonight's.
    assert toilet_counts.is_due({"Bremen": _entry(week_ago)}, "Bremen", "4",
                                TODAY, 7, query="000000000000")
    assert not toilet_counts.is_due({"Bremen": _entry(week_ago)}, "Bremen", "4",
                                    TODAY, 7, query=_qh("Bremen")) or \
        TODAY.toordinal() % 7 == toilet_counts.slot("Bremen", 7)
    # The same entry with nothing wrong is not due on an ordinary night.
    entry = _entry(TODAY - timedelta(days=1))
    if TODAY.toordinal() % 7 != toilet_counts.slot("Bremen", 7):
        assert not toilet_counts.is_due({"Bremen": entry}, "Bremen", "4", TODAY, 7)


def test_an_entry_from_the_future_is_due():
    # A clock that went backwards must not park an area for a week.
    cache = {"Bremen": _entry(TODAY + timedelta(days=1))}
    assert toilet_counts.is_due(cache, "Bremen", "4", TODAY, 7)


def test_a_period_of_one_night_recounts_every_night():
    cache = {"Bremen": _entry(TODAY)}
    assert toilet_counts.is_due(cache, "Bremen", "4", TODAY, 1)
    assert toilet_counts.is_due(cache, "Bremen", "4", TODAY, 0)


def test_the_rota_recounts_each_area_once_a_week_on_its_own_night():
    # Over any seven consecutive nights an entry counted on night 0 is due
    # exactly once, on the night that is its slot — and never on night 0
    # itself, which would charge a manual re-run a second count.
    period = 7
    cache = {"Bremen": _entry(TODAY)}
    due_nights = [n for n in range(period)
                  if toilet_counts.is_due(cache, "Bremen", "4",
                                          TODAY + timedelta(days=n), period)]
    assert len(due_nights) == 1 and due_nights[0] >= 1
    assert (TODAY + timedelta(days=due_nights[0])).toordinal() % period == \
        toilet_counts.slot("Bremen", period)


def test_an_entry_older_than_a_period_is_due_whatever_the_slot():
    cache = {"Bremen": _entry(TODAY - timedelta(days=7))}
    assert toilet_counts.is_due(cache, "Bremen", "4", TODAY, 7)


def test_slots_spread_the_sweep_areas_over_the_week():
    # 17 areas over 7 nights: no night carries more than half of them. A
    # degenerate hash would put every recount on Sunday, which is the
    # all-in-one-night the rota exists to avoid.
    nights = [toilet_counts.slot(name, 7) for name, _ in SWEEP]
    assert max(nights.count(n) for n in range(7)) <= len(SWEEP) // 2


def test_load_survives_a_missing_or_corrupt_file(tmp_path):
    assert toilet_counts.load(str(tmp_path / "nope.json")) == {}
    (tmp_path / "bad.json").write_text("{not json", encoding="utf-8")
    assert toilet_counts.load(str(tmp_path / "bad.json")) == {}
    (tmp_path / "list.json").write_text("[1, 2]", encoding="utf-8")
    assert toilet_counts.load(str(tmp_path / "list.json")) == {}


# ---- run_pipeline, end to end

def test_first_build_counts_everything_and_remembers_it(tmp_path, load_fixture):
    fake = _fake_overpass(load_fixture)
    summary = run_pipeline(**_kwargs(tmp_path, load_fixture, overpass_fetch=fake))
    assert summary["toilets_total"] == 51
    assert fake.areas_seen == [a for a in SWEEP for _ in (1, 2)] + CITY_SWEEP
    cache = json.loads((tmp_path / "toilets_counts.json").read_text(encoding="utf-8"))
    assert set(cache["areas"]) == {name for name, _ in SWEEP}
    assert cache["areas"]["Bremen"] == {"total": 3, "capacity": 1,
                                        "level": "4", "query": _qh("Bremen"),
                                        "date": "2026-07-26"}


def test_a_same_day_rerun_reuses_every_count(tmp_path, load_fixture):
    first = _fake_overpass(load_fixture)
    kw = _kwargs(tmp_path, load_fixture, overpass_fetch=first)
    a = run_pipeline(**kw)
    second = _fake_overpass(load_fixture)
    b = run_pipeline(**dict(kw, overpass_fetch=second))
    assert a == b  # same numbers on the site, half the Overpass slots
    assert second.areas_seen == SWEEP + CITY_SWEEP


def test_only_the_areas_whose_night_it_is_are_recounted(tmp_path, load_fixture):
    _seed(tmp_path / "toilets_counts.json", SWEEP, TODAY - timedelta(days=3),
          total=100, capacity=9)
    fake = _fake_overpass(load_fixture)
    summary = run_pipeline(**_kwargs(tmp_path, load_fixture, overpass_fetch=fake))
    due = {name for name, level in SWEEP
           if toilet_counts.is_due(
               {name: _entry(TODAY - timedelta(days=3), 100, 9, level, name)},
               name, level, TODAY, 7)}
    for area in SWEEP:
        assert _count_queries(fake, area) == (2 if area[0] in due else 1), area
    # Cached areas contribute their cached number; recounted ones the fresh 3.
    assert summary["toilets_total"] == 3 * len(due) + 100 * (len(SWEEP) - len(due))
    cache = json.loads((tmp_path / "toilets_counts.json").read_text(encoding="utf-8"))
    for name, _ in SWEEP:
        assert cache["areas"][name]["date"] == ("2026-07-26" if name in due
                                                else "2026-07-23")


def test_a_period_old_cache_is_recounted_in_full(tmp_path, load_fixture):
    _seed(tmp_path / "toilets_counts.json", SWEEP, TODAY - timedelta(days=8))
    fake = _fake_overpass(load_fixture)
    run_pipeline(**_kwargs(tmp_path, load_fixture, overpass_fetch=fake))
    assert fake.areas_seen == [a for a in SWEEP for _ in (1, 2)] + CITY_SWEEP


def test_period_one_is_the_old_every_night_behaviour(tmp_path, load_fixture):
    _seed(tmp_path / "toilets_counts.json", SWEEP, TODAY)
    fake = _fake_overpass(load_fixture)
    run_pipeline(**_kwargs(tmp_path, load_fixture, overpass_fetch=fake,
                           counts_period_days=1))
    assert fake.areas_seen == [a for a in SWEEP for _ in (1, 2)] + CITY_SWEEP


def test_an_empty_sweep_recounts_rather_than_trusting_the_cache(tmp_path, load_fixture):
    # A stale mirror answers the sweep with no elements. Yesterday's count
    # says the area holds toilets — but that number is not evidence about
    # *this* mirror, so the count must be fetched again and, being zero
    # here too, fail the zero-objects check as before.
    _seed(tmp_path / "toilets_counts.json", SWEEP, TODAY)
    seen = []

    def empty(ql, **kwargs):
        seen.append(ql)
        return {"elements": []}

    with pytest.raises(RuntimeError, match="zero objects"):
        run_pipeline(**_kwargs(tmp_path, load_fixture, overpass_fetch=empty,
                               sweep_rounds=1, sweep_pause_s=0))
    assert any('"amenity"="toilets"' in ql for ql in seen)
    # Nothing was published, so nothing was remembered either.
    cache = json.loads((tmp_path / "toilets_counts.json").read_text(encoding="utf-8"))
    assert all(e["date"] == TODAY.isoformat() and e["total"] == 3
               for e in cache["areas"].values())


def test_a_one_count_answer_still_fails_the_area(tmp_path, load_fixture):
    inner = _fake_overpass(load_fixture)

    def one_count(ql, **kwargs):
        if '"amenity"="toilets"' in ql:
            return _count_answer(5)
        return inner(ql, **kwargs)

    with pytest.raises(RuntimeError, match="expected 2"):
        run_pipeline(**_kwargs(tmp_path, load_fixture, overpass_fetch=one_count,
                               sweep_rounds=1, sweep_pause_s=0))


def test_the_rota_is_reported_in_the_build_log(tmp_path, load_fixture, capsys):
    _seed(tmp_path / "toilets_counts.json", SWEEP, TODAY - timedelta(days=3))
    run_pipeline(**_kwargs(tmp_path, load_fixture,
                           overpass_fetch=_fake_overpass(load_fixture)))
    err = capsys.readouterr().err
    assert "(counted 3 d ago)" in err
    assert "toilet counts:" in err and "counted tonight" in err


def test_the_reused_count_suffix_still_parses_as_an_area_line():
    # The ops page reads the build log; an area line that reused last week's
    # count must still count as swept, or a rota night shows a seventh of
    # the areas and a half-done build can pass for a finished one.
    from pipeline.ops_page import AREA_LINE
    m = AREA_LINE.match("  Bremen: ct=3 play=1 toilets=3 (counted 3 d ago)")
    assert m and m.group("area") == "Bremen" and m.group("toilets") == "3"
    assert AREA_LINE.match("  Bremen: ct=3 play=1 toilets=3")
    assert not AREA_LINE.match("  Bremen: ct=3 play=1 toilets=3 nonsense")


def test_an_empty_count_body_is_not_remembered(tmp_path, load_fixture):
    # A mirror without an area database answers the count with no elements.
    # Tonight that reads as 0 toilets, as it always did; but the rota must
    # not keep that zero for a week — the next night recounts.
    inner = _fake_overpass(load_fixture)

    def empty_counts(ql, **kwargs):
        if '"amenity"="toilets"' in ql:
            return {"elements": []}
        return inner(ql, **kwargs)

    summary = run_pipeline(**_kwargs(tmp_path, load_fixture,
                                     overpass_fetch=empty_counts))
    assert summary["toilets_total"] == 0
    assert not (tmp_path / "toilets_counts.json").exists()


def test_the_cache_is_written_after_the_pages(tmp_path, load_fixture, monkeypatch):
    # The cache is the last thing a build writes: a save that fails (a
    # read-only mount) must find the pages already on disk, and a build that
    # dies earlier must leave no entry to trust tomorrow.
    order = []
    real_save = toilet_counts.save
    real_pages = pages_mod = __import__("pipeline.pages", fromlist=["x"])
    real_write_all = pages_mod.write_all_pages

    def spy_save(path, cache):
        order.append("cache"); real_save(path, cache)

    def spy_pages(*a, **k):
        order.append("pages"); return real_write_all(*a, **k)

    monkeypatch.setattr(toilet_counts, "save", spy_save)
    monkeypatch.setattr(pages_mod, "write_all_pages", spy_pages)
    run_pipeline(**_kwargs(tmp_path, load_fixture,
                           overpass_fetch=_fake_overpass(load_fixture)))
    assert order == ["pages", "cache"]


def test_the_query_hash_ignores_the_timeout_knob():
    a = config.toilets_counts_ql("Bremen", "4")
    b = a.replace("[timeout:55]", "[timeout:300]")
    assert "[timeout:300]" in b
    assert toilet_counts.query_hash(a) == toilet_counts.query_hash(b)
    assert toilet_counts.query_hash(a) != toilet_counts.query_hash(
        config.toilets_counts_ql("Bremen", "6"))


def test_prune_drops_only_entries_no_build_has_touched_in_four_periods():
    cache = {"Bremen": _entry(TODAY - timedelta(days=27)),
             "Gone": _entry(TODAY - timedelta(days=29)),
             "Future": _entry(TODAY + timedelta(days=2)),
             "Broken": {"total": 3}}
    assert set(toilet_counts.prune(cache, TODAY, 7)) == {"Bremen"}


def test_a_cache_that_cannot_be_written_is_a_warning_not_a_failure(
        tmp_path, load_fixture, capsys):
    kw = _kwargs(tmp_path, load_fixture, overpass_fetch=_fake_overpass(load_fixture),
                 counts_path=str(tmp_path / "ro" / "toilets_counts.json"))
    (tmp_path / "ro").mkdir()
    (tmp_path / "ro").chmod(0o500)
    try:
        summary = run_pipeline(**kw)
    finally:
        (tmp_path / "ro").chmod(0o700)
    assert summary["features"] == 7  # the build finished and published
    assert "WARN toilet counts not saved" in capsys.readouterr().err
    assert not (tmp_path / "ro" / "toilets_counts.json").exists()


def test_cache_dates_match_the_history_date(tmp_path, load_fixture):
    from datetime import datetime, timezone
    late = datetime(2026, 7, 26, 23, 59, 30, tzinfo=timezone.utc)
    run_pipeline(**_kwargs(tmp_path, load_fixture,
                           overpass_fetch=_fake_overpass(load_fixture), now=late))
    cache = json.loads((tmp_path / "toilets_counts.json").read_text(encoding="utf-8"))
    history = json.loads((tmp_path / "history.json").read_text(encoding="utf-8"))
    assert {e["date"] for e in cache["areas"].values()} == {"2026-07-26"}
    assert [d["date"] for d in history["days"]] == ["2026-07-26"]


def test_a_two_zero_count_answer_is_not_remembered(tmp_path, load_fixture):
    # A mirror whose area database has the area but nothing in it answers
    # two zero counts — a real two-count answer, and still not evidence
    # about the toilets of an area that has changing tables. Used tonight,
    # not kept.
    inner = _fake_overpass(load_fixture)

    def zero_counts(ql, **kwargs):
        if '"amenity"="toilets"' in ql:
            return _count_answer(0, 0)
        return inner(ql, **kwargs)

    summary = run_pipeline(**_kwargs(tmp_path, load_fixture,
                                     overpass_fetch=zero_counts))
    assert summary["toilets_total"] == 0
    assert not (tmp_path / "toilets_counts.json").exists()
