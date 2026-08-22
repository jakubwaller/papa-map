import json
import re
from datetime import datetime, timezone

import pytest
import requests

from pipeline import config
from pipeline.config import BUNDESLAENDER, CITY_AREAS, sweep_areas
from pipeline.run import run_pipeline

NOW = datetime(2026, 7, 26, 3, 0, tzinfo=timezone.utc)

# The default sweep: 16 Bundesländer at admin_level=4, then Denmark whole at
# admin_level=2. A full build follows up with one ids-only query per
# leaderboard city.
SWEEP = [(name, "4") for name in BUNDESLAENDER] + [("Danmark", "2")]
CITY_SWEEP = [(area, lvl) for _, area, lvl in CITY_AREAS]

# The seven neighbours that each answer whole inside the [timeout:55] budget,
# plus Germany and Denmark. Kept as its own name because several tests are
# about exactly this shape — one admin_level=2 area per country.
RING = ("de", "dk", "be", "nl", "at", "ch", "cz", "pl", "se")
RING_SWEEP = SWEEP + [("Belgium", "2"), ("Netherlands", "2"), ("Austria", "2"),
                      ("Switzerland", "2"), ("Czechia", "2"), ("Poland", "2"),
                      ("Sweden", "2")]

# The eleven-country set papamap.de swept 19–22 Aug 2026. The UK is one whole
# area like the neighbours; France is the second CHUNKED country, 13
# metropolitan régions at admin_level=4, because the country whole is an empty
# reply at 60.14 s. Kept as its own name because the countries_11 label test
# is about exactly this shape. Selecting it is not the default — see
# test_default_sweep_is_still_germany_and_denmark.
ELEVEN = RING + ("gb", "fr")
ELEVEN_SWEEP = (RING_SWEEP + [("United Kingdom", "2")]
                + [(n, "4") for n in config.FRANCE_REGIONS])

# What papamap.de actually sweeps (docker-compose.yml) since the
# Europe-complete expansion: the eleven above plus every remaining European
# sovereign, each one whole admin_level=2 area selected on name:en.
EUROPE_CODES = ("no", "fi", "is", "ie", "ee", "lv", "lt", "lu", "li", "ad",
                "mc", "sm", "mt", "es", "pt", "it", "gr", "cy", "si", "sk",
                "hu", "hr", "ro", "bg", "rs", "ba", "me", "al", "mk", "xk",
                "md", "ua", "by")
EUROPE = ELEVEN + EUROPE_CODES
EUROPE_SWEEP = ELEVEN_SWEEP + [(config.COUNTRY_AREAS[c][0][0], "2")
                               for c in EUROPE_CODES]


def _fake_overpass(load_fixture):
    """Answers every sweep area with the same fixtures — dedup_elements must
    collapse the 17 identical copies back to one, which is exactly what the
    totals in the tests assert. Records the (area, admin_level) pairs queried.

    The object sweep is one union query, so it answers with both halves glued
    together exactly as Overpass would; the ids-only city query and the
    backfill's narrow query carry no kids_area clause and get the
    changing_table fixture alone."""
    areas_seen = []

    def fetch(ql, **kwargs):
        # name:en for the countries whose own `name` is multilingual
        # (config.NAME_EN_AREAS) — an area is an area to the sweep either way,
        # so the recorder must not care which tag selected it.
        m = re.search(r'area\["name(?::en)?"="([^"]+)"\]\["admin_level"="(\d+)"\]', ql)
        assert m, f"no area clause in {ql!r}"
        areas_seen.append((m.group(1), m.group(2)))
        if '"kids_area"' in ql:
            return {"elements":
                    load_fixture("overpass_changing_tables.json")["elements"]
                    + load_fixture("overpass_play_places.json")["elements"]}
        if '"changing_table"' in ql:
            return load_fixture("overpass_changing_tables.json")
        assert '"amenity"="toilets"' in ql
        # Toilets come back as two server-side counts, not objects. Derived
        # from the same fixture so it stays the single source of truth: 3
        # toilets, 1 of them capacity-tagged.
        toilets = load_fixture("overpass_toilets.json")["elements"]
        return _count_answer(
            len(toilets),
            sum(1 for el in toilets
                if any(k.startswith("toilets:num_chambers")
                       for k in (el.get("tags") or {}))))
    fetch.areas_seen = areas_seen
    return fetch


def _count_answer(*totals):
    """An Overpass `out count;` response: one synthetic element per count
    statement, shaped like the real server's (verified against Bremen on
    19 Aug 2026)."""
    return {"elements": [{"type": "count", "id": 0,
                          "tags": {"nodes": "0", "ways": "0", "relations": "0",
                                   "areas": "0", "total": str(n)}}
                         for n in totals]}


def _fake_taginfo(load_fixture):
    def fetch(url):
        if "key/stats" in url:
            return load_fixture("taginfo_key_stats.json")
        return load_fixture("taginfo_location_values.json")
    return fetch


def _taginfo_down(url):
    raise requests.ConnectionError("taginfo down")


def test_run_writes_both_files(tmp_path, load_fixture):
    geojson = tmp_path / "changing_tables.geojson"
    play_geojson = tmp_path / "play_places.geojson"
    stats = tmp_path / "stats.json"
    fake_overpass = _fake_overpass(load_fixture)
    summary = run_pipeline(
        geojson_path=str(geojson), stats_path=str(stats),
        play_geojson_path=str(play_geojson),
        overpass_fetch=fake_overpass, pages_dir=str(tmp_path / "pages"),
        history_path=str(tmp_path / "history.json"),
        taginfo_fetch=_fake_taginfo(load_fixture), now=NOW,
    )
    # Every element appears once in each of the 17 area sweeps; dedup by
    # (type, id) must collapse the totals back to a single fixture's worth.
    # 19 pages: 16 Länder + index + the two leaderboard languages. The play
    # fixture holds 5 objects, of which one is outdoors (dropped by the rule)
    # and one has no coordinates (dropped by the exporter).
    # Toilet counts SUM where objects dedup — the pipeline never sees the
    # objects, so it cannot tell one area's copy from another's. Here that
    # means 17 identical fixture answers really do add to 17x3; in the real
    # sweep the areas are disjoint, so summing is the correct total.
    assert summary == {"features": 7, "play_places": 3, "ct_objects": 9,
                       "toilets_total": 51, "global_source": "taginfo",
                       "pages": 19}
    # Still two object queries per area, not three: the play half rides along
    # in the changing_table sweep instead of costing its own Overpass slot.
    assert fake_overpass.areas_seen == ([a for a in SWEEP for _ in (1, 2)]
                                        + CITY_SWEEP)

    fc = json.loads(geojson.read_text(encoding="utf-8"))
    assert fc["type"] == "FeatureCollection"
    assert len(fc["features"]) == 7
    # The two datasets stay disjoint: a place is a pin or a prospect, never both.
    play_fc = json.loads(play_geojson.read_text(encoding="utf-8"))
    assert [f["properties"]["osm_id"] for f in play_fc["features"]] == [9001, 9002, 9003]
    pin_ids = {f["properties"]["osm_id"] for f in fc["features"]}
    assert pin_ids.isdisjoint({9001, 9002, 9003})

    payload = json.loads(stats.read_text(encoding="utf-8"))
    assert payload["generated_at"] == "2026-07-26T03:00:00+00:00"
    assert payload["area_name"] == "Deutschland & Danmark"
    assert payload["area_key"] == "de_dk"  # frontend translates this per language
    assert payload["local"]["ct_yes"] == 6
    assert payload["local"]["capacity_tagged_toilets"] == 17  # 1 per area, summed
    # One fixture pin carries kids_area=yes; three prospects have a play area
    # and no changing-table answer at all. Different numbers, different files.
    assert payload["local"]["play_tables"] == 1
    assert payload["local"]["play_places"] == 3
    assert payload["global"]["ct_total"] == 77287
    assert payload["global"]["source"] == "taginfo"


def test_single_area_build_keeps_its_own_name(tmp_path, load_fixture):
    stats = tmp_path / "stats.json"
    run_pipeline(
        geojson_path=str(tmp_path / "ct.geojson"), stats_path=str(stats),
        areas=[("Hamburg", "4")], display_area="Hamburg",
        pages_dir=str(tmp_path / "pages"),
        overpass_fetch=_fake_overpass(load_fixture),
        taginfo_fetch=_fake_taginfo(load_fixture), now=NOW,
    )
    payload = json.loads(stats.read_text(encoding="utf-8"))
    assert payload["area_name"] == "Hamburg"
    # A hand-named area has no translation, so the frontend must print the
    # name as given rather than look up a key that doesn't exist.
    assert payload["area_key"] is None


def test_run_is_idempotent(tmp_path, load_fixture):
    kwargs = dict(geojson_path=str(tmp_path / "ct.geojson"),
                  stats_path=str(tmp_path / "stats.json"),
                  pages_dir=str(tmp_path / "pages"),
                  history_path=str(tmp_path / "history.json"),
                  overpass_fetch=_fake_overpass(load_fixture),
                  taginfo_fetch=_fake_taginfo(load_fixture), now=NOW)
    assert run_pipeline(**kwargs) == run_pipeline(**kwargs)
    # The same-date re-run replaced its history entry, not appended a second.
    history = json.loads((tmp_path / "history.json").read_text(encoding="utf-8"))
    assert [d["date"] for d in history["days"]] == ["2026-07-26"]


def test_taginfo_down_keeps_previous_global_block(tmp_path, load_fixture, capsys):
    stats = tmp_path / "stats.json"
    old_global = {"ct_total": 70000, "source": "taginfo", "data_until": "2026-07-01"}
    stats.write_text(json.dumps({"generated_at": "old", "global": old_global}),
                     encoding="utf-8")
    summary = run_pipeline(
        geojson_path=str(tmp_path / "ct.geojson"), stats_path=str(stats),
        overpass_fetch=_fake_overpass(load_fixture), pages_dir=str(tmp_path / "pages"),
        history_path=str(tmp_path / "history.json"),
        taginfo_fetch=_taginfo_down, now=NOW,
    )
    assert summary["global_source"] == "previous"
    assert "WARN" in capsys.readouterr().err
    payload = json.loads(stats.read_text(encoding="utf-8"))
    assert payload["global"] == old_global  # stale global kept
    assert payload["generated_at"] == "2026-07-26T03:00:00+00:00"  # local still fresh
    assert payload["local"]["ct_objects"] == 9


def test_zero_object_area_refuses_to_overwrite(tmp_path, load_fixture):
    # A stale fallback mirror (or typo'd area name) answers HTTP 200 with no
    # elements — that must never wipe the served dataset.
    geojson = tmp_path / "ct.geojson"
    stats = tmp_path / "stats.json"
    geojson.write_text('{"type": "FeatureCollection", "features": [{"good": true}]}',
                       encoding="utf-8")
    stats.write_text('{"local": {"ct_objects": 9}}', encoding="utf-8")

    def empty_overpass(ql, **kwargs):
        return {"elements": []}

    with pytest.raises(RuntimeError, match="zero objects"):
        run_pipeline(geojson_path=str(geojson), stats_path=str(stats),
                     overpass_fetch=empty_overpass,
                     taginfo_fetch=_fake_taginfo(load_fixture), now=NOW,
                     sweep_rounds=2, sweep_pause_s=0)
    # old files survive untouched
    assert json.loads(geojson.read_text(encoding="utf-8"))["features"] == [{"good": True}]
    assert json.loads(stats.read_text(encoding="utf-8"))["local"]["ct_objects"] == 9


def test_failed_area_is_retried_in_a_later_round(tmp_path, load_fixture):
    # A congested spell kills one Land on every mirror mid-sweep; the sweep
    # must finish the others and pick the failed one up next round instead of
    # aborting the build.
    inner = _fake_overpass(load_fixture)
    fail_next = {"Bayern"}

    def flaky(ql, **kwargs):
        if any(f'"{name}"' in ql for name in fail_next):
            fail_next.clear()
            raise requests.ConnectionError("mirror cascade exhausted")
        return inner(ql, **kwargs)

    summary = run_pipeline(
        geojson_path=str(tmp_path / "ct.geojson"),
        stats_path=str(tmp_path / "stats.json"),
        overpass_fetch=flaky, taginfo_fetch=_fake_taginfo(load_fixture),
        pages_dir=str(tmp_path / "pages"),
        history_path=str(tmp_path / "history.json"), now=NOW, sweep_pause_s=0)
    assert summary["features"] == 7  # nothing lost, Bayern landed on round 2
    # failed ct, then both queries
    assert inner.areas_seen.count(("Bayern", "4")) == 2


def test_sweep_aborts_when_an_area_fails_every_round(tmp_path, load_fixture):
    def always_down(ql, **kwargs):
        if '"Saarland"' in ql:
            raise requests.ConnectionError("still dead")
        return _fake_overpass(load_fixture)(ql, **kwargs)

    with pytest.raises(RuntimeError, match="Saarland.*after 3 rounds"):
        run_pipeline(geojson_path=str(tmp_path / "ct.geojson"),
                     stats_path=str(tmp_path / "stats.json"),
                     overpass_fetch=always_down,
                     taginfo_fetch=_fake_taginfo(load_fixture),
                     now=NOW, sweep_rounds=3, sweep_pause_s=0)
    assert not (tmp_path / "ct.geojson").exists()  # nothing half-written


def test_taginfo_down_with_no_previous_stats_degrades_to_null(tmp_path, load_fixture, capsys):
    stats = tmp_path / "stats.json"
    summary = run_pipeline(
        geojson_path=str(tmp_path / "ct.geojson"), stats_path=str(stats),
        overpass_fetch=_fake_overpass(load_fixture), pages_dir=str(tmp_path / "pages"),
        history_path=str(tmp_path / "history.json"),
        taginfo_fetch=_taginfo_down, now=NOW,
    )
    assert summary["global_source"] is None
    assert "WARN" in capsys.readouterr().err
    assert json.loads(stats.read_text(encoding="utf-8"))["global"] is None


def test_full_build_writes_history_and_leaderboard(tmp_path, load_fixture):
    history_path = tmp_path / "history.json"
    run_pipeline(
        geojson_path=str(tmp_path / "ct.geojson"),
        stats_path=str(tmp_path / "stats.json"),
        pages_dir=str(tmp_path / "pages"), history_path=str(history_path),
        overpass_fetch=_fake_overpass(load_fixture),
        taginfo_fetch=_fake_taginfo(load_fixture), now=NOW)
    history = json.loads(history_path.read_text(encoding="utf-8"))
    assert [d["date"] for d in history["days"]] == ["2026-07-26"]
    day = history["days"][0]
    assert day["source"] == "build"
    # Every sweep answers with the same fixture, so first-wins assignment puts
    # every deduped object into the first Land and the first city — and every
    # other region must still appear as an explicit zero triple, which is a
    # different statement from being absent (absent = sweep failed).
    assert day["regions"]["Baden-Württemberg"] == [3, 2, 2]
    assert day["regions"]["Danmark"] == [0, 0, 0]
    assert len(day["regions"]) == 17
    assert day["cities"]["Berlin"] == [3, 2, 2]
    assert day["cities"]["København"] == [0, 0, 0]
    assert len(day["cities"]) == len(CITY_AREAS)
    de = (tmp_path / "pages" / "rangliste.html").read_text(encoding="utf-8")
    en = (tmp_path / "pages" / "leaderboard.html").read_text(encoding="utf-8")
    assert 'lang="de"' in de and "Die Rangliste" in de
    assert 'lang="en"' in en and "The leaderboard" in en


def test_ring_build_files_each_neighbour_under_its_english_name(
        tmp_path, load_fixture, monkeypatch):
    # A nine-country build end to end: every neighbour is swept as one area,
    # lands in history.json under the same English string the query selected it
    # by (so the leaderboard prints "Belgium" next to "Bayern"), and changes
    # nothing about the pages — those follow BUNDESLAENDER, not the sweep.
    monkeypatch.setattr(config, "SWEEP_COUNTRIES", RING)
    fake_overpass = _fake_overpass(load_fixture)
    stats = tmp_path / "stats.json"
    history_path = tmp_path / "history.json"
    summary = run_pipeline(
        geojson_path=str(tmp_path / "ct.geojson"), stats_path=str(stats),
        play_geojson_path=str(tmp_path / "play.geojson"),
        pages_dir=str(tmp_path / "pages"), history_path=str(history_path),
        overpass_fetch=fake_overpass,
        taginfo_fetch=_fake_taginfo(load_fixture), now=NOW)
    assert fake_overpass.areas_seen == ([a for a in RING_SWEEP for _ in (1, 2)]
                                        + CITY_SWEEP)
    payload = json.loads(stats.read_text(encoding="utf-8"))
    assert payload["area_key"] == "countries_9"
    day = json.loads(history_path.read_text(encoding="utf-8"))["days"][0]
    assert len(day["regions"]) == 24
    # First-wins assignment again puts every deduped object in the first area;
    # the neighbours must still each appear as an explicit zero triple, keyed
    # by the name the sweep asked for.
    assert day["regions"]["Baden-Württemberg"] == [3, 2, 2]
    assert day["regions"]["Belgium"] == [0, 0, 0]
    assert day["regions"]["Sweden"] == [0, 0, 0]
    # Still 16 Länder + index + the two leaderboard languages: a country that
    # is not a Bundesland gets no page, whatever else was swept.
    written = sorted(p.name for p in (tmp_path / "pages").glob("*.html"))
    assert summary["pages"] == len(written) == 19
    assert not [p for p in written if "belgi" in p or "sweden" in p]


def test_city_sweep_failure_degrades_to_warn(tmp_path, load_fixture, capsys):
    # A city failing every round must cost exactly one city on the leaderboard
    # — never the build. The map is the artifact that must not be held hostage.
    inner = _fake_overpass(load_fixture)

    def flaky(ql, **kwargs):
        if "Københavns Kommune" in ql:
            raise requests.ConnectionError("kommune down")
        return inner(ql, **kwargs)

    history_path = tmp_path / "history.json"
    summary = run_pipeline(
        geojson_path=str(tmp_path / "ct.geojson"),
        stats_path=str(tmp_path / "stats.json"),
        pages_dir=str(tmp_path / "pages"), history_path=str(history_path),
        overpass_fetch=flaky, taginfo_fetch=_fake_taginfo(load_fixture),
        now=NOW, sweep_rounds=2, sweep_pause_s=0)
    assert summary["features"] == 7
    assert "leaderboard skips København" in capsys.readouterr().err
    day = json.loads(history_path.read_text(encoding="utf-8"))["days"][0]
    assert "København" not in day["cities"]
    assert day["cities"]["Berlin"] == [3, 2, 2]


def test_denmark_sweeps_whole_at_country_level():
    # Denmark answers in one query (933 changing_table + 4,655 toilet objects,
    # 14.5 s measured), so it must sweep as a single admin_level=2 area — not
    # chunked like Germany, and not at Germany's admin_level=4.
    areas = sweep_areas()
    assert ("Danmark", "2") in areas
    assert areas == SWEEP


def test_default_sweep_is_still_germany_and_denmark(monkeypatch):
    # The seven neighbours are *selectable*, not selected: papamap.de keeps
    # building de,dk until the operator sets PAPAMAP_COUNTRIES, and every
    # served number (stats strip, leaderboard, per-Land pages) is about those
    # two. This is the assertion that fails if the default ever moves quietly.
    #
    # It reads DEFAULT_COUNTRIES rather than SWEEP_COUNTRIES on purpose: the
    # latter has already absorbed the environment, so this test would fail for
    # an operator who has exported PAPAMAP_COUNTRIES — punishing exactly the
    # person this change invites to try a wider build.
    assert config.DEFAULT_COUNTRIES == "de,dk"
    monkeypatch.setattr(config, "SWEEP_COUNTRIES",
                        tuple(config.DEFAULT_COUNTRIES.split(",")))
    areas = sweep_areas()
    assert areas == SWEEP
    assert not [a for a in areas if a[0] in config.NAME_EN_AREAS]
    assert config.display_area() == ("Deutschland & Danmark", "de_dk")


def test_country_subset_builds_only_that_country(monkeypatch):
    monkeypatch.setattr(config, "SWEEP_COUNTRIES", ("dk",))
    assert config.sweep_areas() == [("Danmark", "2")]
    assert config.display_area() == ("Danmark", "dk")


def test_single_neighbour_is_named_by_the_string_it_is_selected_by(monkeypatch):
    # PAPAMAP_COUNTRIES=ch is the cheap one-country build. Switzerland has no
    # single endonym to print instead ("Schweiz/Suisse/Svizzera/Svizra" is the
    # whole `name` tag), so label and selector are the same English string and
    # stats.json can never name an area no query asked for.
    monkeypatch.setattr(config, "SWEEP_COUNTRIES", ("ch",))
    assert config.sweep_areas() == [("Switzerland", "2")]
    assert config.display_area() == ("Switzerland", "ch")


def test_ring_subset_sweeps_each_neighbour_as_one_country_area(monkeypatch):
    # Each neighbour answers whole inside the [timeout:55] budget, so it is a
    # single admin_level=2 area; only Germany still needs the 16-Land chunking
    # that the ~60 s network-path cutoff forces.
    monkeypatch.setattr(config, "SWEEP_COUNTRIES", RING)
    areas = config.sweep_areas()
    assert areas == RING_SWEEP
    assert len(areas) == 24  # 16 Bundesländer + 8 whole countries
    assert all(lvl == "2" for name, lvl in areas if name not in BUNDESLAENDER)


def test_eleven_country_set_chunks_france_and_sweeps_the_uk_whole(monkeypatch):
    monkeypatch.setattr(config, "SWEEP_COUNTRIES", ELEVEN)
    areas = config.sweep_areas()
    assert areas == ELEVEN_SWEEP
    # 16 Bundesländer + 8 whole countries + the UK + 13 French régions.
    assert len(areas) == 38
    assert ("United Kingdom", "2") in areas
    # France must never appear as one area: that query returns nothing at all.
    assert ("France", "2") not in areas
    assert sum(1 for n, lvl in areas if n in config.FRANCE_REGIONS) == 13


def test_french_regions_are_selected_by_name_not_name_en(monkeypatch):
    # The opposite of the neighbours. name:en is actively wrong on this set —
    # "Bourgogne – Franche-Comté" carries an en dash and "Ile-de-France" drops
    # the accent — and a miss resolves to zero objects, which run.py can only
    # read as a failed sweep.
    for region in config.FRANCE_REGIONS:
        assert region not in config.NAME_EN_AREAS, region
        assert config.area_name_key(region) == "name"
        assert f'area["name"="{region}"]' in config.sweep_ql(region, "4")


def test_france_overseas_regions_are_excluded_by_name_not_by_level():
    # The five DROM are admin_level=4 as well, so the level does not filter
    # them — only the hard-coded allowlist does. Sweeping them would put pins
    # in the Caribbean, outside the frontend's maxBounds where nothing can be
    # panned to.
    for drom in ("Guadeloupe", "Martinique", "Guyane", "La Réunion", "Mayotte"):
        assert drom not in config.FRANCE_REGIONS
    assert len(config.FRANCE_REGIONS) == 13


def test_united_kingdom_needs_no_name_en_and_stays_one_area():
    assert "United Kingdom" not in config.NAME_EN_AREAS
    assert config.area_name_key("United Kingdom") == "name"
    assert config.COUNTRY_AREAS["gb"] == (("United Kingdom", "2"),)


def test_europe_complete_set_sweeps_every_new_country_whole(monkeypatch):
    # Every country added 2026-08-22 is one admin_level=2 area selected on
    # name:en; only Germany and France stay chunked. A name missing from
    # NAME_EN_AREAS would be selected on `name`, resolve to zero objects for
    # the multilingual ones, and read as a failed sweep — so the membership
    # check here is load-bearing, not bookkeeping.
    monkeypatch.setattr(config, "SWEEP_COUNTRIES", EUROPE)
    areas = config.sweep_areas()
    assert areas == EUROPE_SWEEP
    # 16 Bundesländer + Danmark + 7 neighbours + UK + 13 régions + 33 new.
    assert len(areas) == 71
    for code in EUROPE_CODES:
        (name, lvl), = config.COUNTRY_AREAS[code]
        assert lvl == "2", name
        assert name in config.NAME_EN_AREAS, name
        assert f'area["name:en"="{name}"]' in config.sweep_ql(name, "2")
        assert name not in config.chunked_area_names(), name


def test_every_country_code_has_a_label(monkeypatch):
    # display_area() indexes COUNTRY_LABELS with no .get(): a code present in
    # COUNTRY_AREAS but missing here is a bare KeyError at the top of the run.
    assert set(config.COUNTRY_AREAS) == set(config.COUNTRY_LABELS)


def test_chunked_area_names_covers_both_chunked_countries():
    # The leaderboard uses this to avoid printing Bretagne as a sovereign state.
    chunks = config.chunked_area_names()
    assert set(config.BUNDESLAENDER) <= chunks
    assert set(config.FRANCE_REGIONS) <= chunks
    for whole in ("Danmark", "Sweden", "United Kingdom", "Poland"):
        assert whole not in chunks


def test_display_area_counts_the_set_past_two_countries(monkeypatch):
    monkeypatch.setattr(config, "SWEEP_COUNTRIES", RING)
    name, key = config.display_area()
    # The key counts the set instead of naming it: a key per set would need
    # three new translations every time a country is added, a count needs one
    # string per language, ever.
    assert key == "countries_9"
    assert name == ("Deutschland & Danmark & Belgium & Netherlands & Austria "
                    "& Switzerland & Czechia & Poland & Sweden")
    # The eleven-country shape the live site published 19–22 Aug 2026.
    monkeypatch.setattr(config, "SWEEP_COUNTRIES", ELEVEN)
    name11, key11 = config.display_area()
    assert key11 == "countries_11"
    assert name11.endswith("& Sweden & United Kingdom & France")
    # What the deployment publishes now.
    monkeypatch.setattr(config, "SWEEP_COUNTRIES", EUROPE)
    _, key44 = config.display_area()
    assert key44 == f"countries_{len(EUROPE)}"
    # Three countries is already past the point where naming the set scales.
    monkeypatch.setattr(config, "SWEEP_COUNTRIES", ("de", "dk", "nl"))
    assert config.display_area() == ("Deutschland & Danmark & Netherlands",
                                     "countries_3")


def test_hand_named_neighbour_resolves_like_the_nightly_sweep(monkeypatch):
    # PAPAMAP_AREA_NAME=Switzerland is the debug build for one country; it must
    # select by the same tag the sweep uses, or it resolves to zero objects and
    # dies six rounds later blaming a stale mirror.
    monkeypatch.setattr(config, "AREA_NAME", "Switzerland")
    monkeypatch.setattr(config, "AREA_ADMIN_LEVEL", "2")
    assert config.sweep_areas() == [("Switzerland", "2")]
    assert 'area["name:en"="Switzerland"]' in config.sweep_ql("Switzerland", "2")


def test_unknown_country_code_fails_the_build(monkeypatch):
    # Silently sweeping fewer areas would overwrite the live dataset with a
    # partial one — a typo has to abort instead.
    monkeypatch.setattr(config, "SWEEP_COUNTRIES", ("de", "dl"))
    with pytest.raises(ValueError, match="dl"):
        config.sweep_areas()
    monkeypatch.setattr(config, "SWEEP_COUNTRIES", ())
    with pytest.raises(ValueError, match="empty"):
        config.sweep_areas()


def test_a_country_not_in_the_list_fails_the_build(monkeypatch):
    # "zz" is not a country and never will be — deliberately bogus rather than
    # a real ISO code, because this test used to say "fr" and quietly stopped
    # testing anything the day France was added. Asking for an unknown code
    # must abort the build rather than build the rest and publish a map that
    # quietly stops at the border.
    monkeypatch.setattr(config, "SWEEP_COUNTRIES", ("de", "zz"))
    with pytest.raises(ValueError, match="zz"):
        config.sweep_areas()
    with pytest.raises(ValueError, match="fr"):
        config.display_area()  # the stats strip must not degrade quietly either


def test_hand_named_area_has_no_translation_key(monkeypatch):
    monkeypatch.setattr(config, "DISPLAY_AREA_OVERRIDE", "Hamburg")
    assert config.display_area() == ("Hamburg", None)


def test_a_retried_area_does_not_double_count_its_toilets(tmp_path, load_fixture):
    # The failure the object halves are immune to and the counts are not:
    # Bayern's sweep succeeds, its toilets query dies, and round 2 re-fetches
    # BOTH. dedup_elements collapses the repeated objects, but a count carries
    # no identity — so the counts are stored per area and overwritten, never
    # added to a running total. 17 areas x 3 fixture toilets = 51 either way.
    inner = _fake_overpass(load_fixture)
    fail_next = {"Bayern"}

    def flaky(ql, **kwargs):
        if '"amenity"="toilets"' in ql and any(f'"{n}"' in ql for n in fail_next):
            fail_next.clear()
            raise requests.ConnectionError("mirror cascade exhausted")
        return inner(ql, **kwargs)

    summary = run_pipeline(
        geojson_path=str(tmp_path / "ct.geojson"),
        stats_path=str(tmp_path / "stats.json"),
        overpass_fetch=flaky, taginfo_fetch=_fake_taginfo(load_fixture),
        pages_dir=str(tmp_path / "pages"),
        history_path=str(tmp_path / "history.json"), now=NOW, sweep_pause_s=0)
    assert summary["toilets_total"] == 51
    # Bayern really was swept twice — otherwise the assertion above is vacuous.
    assert inner.areas_seen.count(("Bayern", "4")) == 3


def test_a_half_answered_count_query_is_an_error_not_a_zero(tmp_path, load_fixture):
    # One count where two were asked for means the second `out count;` did not
    # run. Reading the missing one as zero would publish "no capacity tags in
    # this Land" as a fact, so it fails the area and is retried instead.
    inner = _fake_overpass(load_fixture)

    def truncated(ql, **kwargs):
        if '"amenity"="toilets"' in ql and '"Saarland"' in ql:
            return _count_answer(325)  # total only, capacity count missing
        return inner(ql, **kwargs)

    with pytest.raises(RuntimeError, match="1 count"):
        run_pipeline(geojson_path=str(tmp_path / "ct.geojson"),
                     stats_path=str(tmp_path / "stats.json"),
                     overpass_fetch=truncated,
                     taginfo_fetch=_fake_taginfo(load_fixture),
                     pages_dir=str(tmp_path / "pages"),
                     history_path=str(tmp_path / "history.json"),
                     now=NOW, sweep_rounds=2, sweep_pause_s=0)


def test_per_land_toilet_counts_reach_the_bundesland_pages(tmp_path, load_fixture):
    # The page for each Land prints its own toilet count, which now comes
    # straight from that area's count query rather than from tallying objects
    # back to the area they were fetched from.
    run_pipeline(geojson_path=str(tmp_path / "ct.geojson"),
                 stats_path=str(tmp_path / "stats.json"),
                 overpass_fetch=_fake_overpass(load_fixture),
                 taginfo_fetch=_fake_taginfo(load_fixture),
                 pages_dir=str(tmp_path / "pages"),
                 history_path=str(tmp_path / "history.json"), now=NOW)
    page = (tmp_path / "pages" / "bayern.html").read_text(encoding="utf-8")
    assert "3 öffentliche Toiletten" in page
