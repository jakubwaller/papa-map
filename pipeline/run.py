from __future__ import annotations

import sys
import time
from datetime import datetime, timezone

from . import delta, export, leaderboard, osm, pages, stats, toilet_counts
from .room_choices import answer_status_table
from .config import (AREAS_PATH, BUNDESLAENDER, CITY_AREAS, GEOJSON_PATH, HISTORY_PATH,
                     PAGES_DIR, PLAY_GEOJSON_PATH, STATS_PATH, SWEEP_CITY_ROUNDS,
                     SWEEP_DEADLINE_S, SWEEP_PAUSE_S, SWEEP_ROUNDS,
                     TOILETS_COUNTS_PATH,
                     TOILETS_COUNTS_PERIOD_DAYS, changing_table_ids_ql,
                     display_area as configured_area, sweep_areas, sweep_ql,
                     toilets_counts_ql)


def run_pipeline(geojson_path=GEOJSON_PATH, stats_path=STATS_PATH, areas=None,
                 display_area=None, area_key=None, overpass_fetch=osm.fetch_overpass,
                 taginfo_fetch=stats.fetch_taginfo, now=None,
                 sweep_rounds=None, sweep_pause_s=None,
                 sweep_deadline_s=None, pages_dir=PAGES_DIR,
                 cities=None, history_path=HISTORY_PATH,
                 play_geojson_path=PLAY_GEOJSON_PATH,
                 counts_path=None, counts_period_days=None,
                 areas_path=AREAS_PATH, areas_bbox_path=None):
    """One idempotent build: Overpass (per sweep area) -> classify -> GeoJSON +
    play_places.geojson + stats.json + the per-Bundesland pages, plus (on a
    full build) the per-region history and the leaderboard pages rendered from
    it. An area whose queries fail on every
    mirror — including one that resolves to zero objects (stale mirror area
    database, typo'd PAPAMAP_AREA_NAME) — is retried in later sweep rounds
    after a cool-down, until SWEEP_DEADLINE_S; only an area still failing
    when no further round fits aborts the build, before anything is written
    (old files survive). A taginfo failure only degrades the global block to
    the previous one."""
    areas = areas or sweep_areas()
    # The leaderboard compares regions over time, so it only makes sense on
    # the full default build: a partial or single-area sweep writing history
    # would poison every later delta with a day that misses most regions.
    if cities is None:
        # `n in BUNDESLAENDER`, not just `lvl == "4"`: France's 13 régions are
        # also admin_level=4, so the level alone stopped identifying a German
        # Land the day France joined. Same in land_names below.
        lands = {n for n, lvl in areas if lvl == "4" and n in BUNDESLAENDER}
        cities = CITY_AREAS if len(lands) == len(BUNDESLAENDER) else ()
    # A hand-passed display_area is a name only — no translation can exist for
    # it, so its area_key stays None unless the caller supplies one too.
    if display_area is None:
        display_area, configured_key = configured_area()
        area_key = configured_key if area_key is None else area_key
    rounds = SWEEP_ROUNDS if sweep_rounds is None else sweep_rounds
    pause = SWEEP_PAUSE_S if sweep_pause_s is None else sweep_pause_s
    budget = SWEEP_DEADLINE_S if sweep_deadline_s is None else sweep_deadline_s
    # Resolved at call time, not in the signature, so a test can point the
    # module at a temp file and never touch the checkout's web/data.
    counts_path = TOILETS_COUNTS_PATH if counts_path is None else counts_path
    areas_bbox_path = delta.AREAS_BBOX_PATH if areas_bbox_path is None else areas_bbox_path
    counts_period = (TOILETS_COUNTS_PERIOD_DAYS if counts_period_days is None
                     else counts_period_days)
    # One clock read for the whole build, taken at its START: the rota dates
    # its entries and the leaderboard its history from the same instant, so a
    # build that crosses UTC midnight cannot date its counts a day before the
    # history it shipped. generated_at was read at the end of the build until
    # 2026-09-05; the start is what the runbook's cron argument counts on.
    build_time = now or datetime.now(timezone.utc)
    today = build_time.date()
    counts_cache = toilet_counts.load(counts_path)
    counts_fresh: dict[str, tuple[int, int, str, str]] = {}  # recounted tonight
    counts_reused = 0
    ct_elements, play_elements = [], []
    # Toilets arrive as two server-side counts per area, not objects
    # (config.toilets_counts_ql). Keyed by area and *assigned*, never added to
    # a running total, so a retried area overwrites its earlier attempt
    # instead of counting it twice — the job dedup_elements does for the
    # object halves.
    toilets_by_area: dict[str, int] = {}
    toilets_capacity_by_area: dict[str, int] = {}
    # Which sweep area each changing-table object came from. The geojson
    # carries coordinates and no region field, so the Overpass area query is
    # the only authority on which Land an object sits in — and it is free,
    # since the sweep is already chunked per Land. First sweep wins for an
    # object on (or area-assigned across) a boundary, which is the same copy
    # dedup_elements() keeps.
    ct_area = {}
    # The same, for the play-only half of the same per-area sweep (v48's
    # per-area delta bboxes, compute_area_bboxes below): a play place never
    # gets a `ct_area` entry (build_features never sees it), but it comes
    # from the very same area's Overpass answer, so it is free here too.
    play_area = {}
    # The minimum osm3s.timestamp_osm_base across every Overpass answer of
    # the night — the DATA timestamp, not the build time, which can lag it by
    # a day (CLAUDE.md). Persisted into stats.json as data_base so
    # pipeline.delta knows exactly which replication sequence the nightly
    # build is reconciled to and can reset itself there when a new build
    # lands. Not every mirror reports it (osm.check_fresh already tolerates
    # that), so this stays None when none of tonight's answers did.
    base_timestamps: list[str] = []

    def _note_base(data: dict) -> None:
        ts = (data.get("osm3s") or {}).get("timestamp_osm_base")
        if ts:
            base_timestamps.append(ts)

    # Which leaderboard city each object lies in, from an ids-only query per
    # city — the same area-query authority as ct_area, at a fraction of the
    # payload. City sweeps are non-fatal: the map must never be held hostage
    # by the leaderboard, so a city that fails every round is WARNed and
    # simply absent from today's history entry.
    city_ids: dict[str, set] = {}
    remaining = list(areas)
    remaining_cities = list(cities)
    last_exc: Exception | None = None
    deadline = time.monotonic() + budget
    rnd = 0
    while True:
        if rnd:
            if not remaining and not remaining_cities:
                break
            if rounds is not None and rnd >= rounds:
                break
            # Only the leaderboard is left: it gets the old fixed rounds, not
            # the deadline — the map is not held until 06:30 for a city.
            if not remaining and rnd >= SWEEP_CITY_ROUNDS:
                break
            # When every host is resting (osm.py's breaker), a 120 s pause
            # would only spend the round on instant failures — wait for the
            # first host to come back instead. Each consecutive trip doubles
            # that rest, so rounds against a dead service stretch over
            # hours with a handful of requests, not thousands.
            rest = osm.breaker_wait_s()
            if time.monotonic() + max(pause, rest) > deadline:
                print(f"  no round {rnd + 1}: it would start past the "
                      f"{budget / 3600:g} h sweep deadline", file=sys.stderr)
                break
            names = ([name for name, _ in remaining]
                     + [display for display, _, _ in remaining_cities])
            print(f"  round {rnd + 1}: retrying {', '.join(names)}",
                  file=sys.stderr)
            if rest > pause:
                print(f"  every Overpass host is resting — waiting "
                      f"{rest / 60:.0f} min before round {rnd + 1}", file=sys.stderr)
            time.sleep(max(pause, rest))
        failed = []
        for i, (area_name, admin_level) in enumerate(remaining):
            try:
                sweep = overpass_fetch(sweep_ql(area_name, admin_level))
                _note_base(sweep)
                # The toilets are recounted on the area's night of the rota
                # (toilet_counts.is_due) — and whenever the sweep came back
                # empty, whatever the rota says: the zero-objects check below
                # needs a count fetched tonight, and a cached number would
                # vouch for an area database it never saw.
                count_ql = toilets_counts_ql(area_name, admin_level)
                count_key = toilet_counts.query_hash(count_ql)
                recount = (not sweep.get("elements") or toilet_counts.is_due(
                    counts_cache, area_name, admin_level, today, counts_period,
                    query=count_key))
                remember = False
                if recount:
                    count_answer = overpass_fetch(count_ql)
                    _note_base(count_answer)
                    counts = osm.parse_counts(count_answer)
                    # A real answer carries one count per `out count;`
                    # statement, two zeros included when the area resolved to
                    # nothing — so *no* counts at all is not "no toilets", it
                    # is a response that was never a count answer (the empty
                    # body a mirror with no area database returns), and the
                    # zero-objects check below names that properly. Exactly
                    # one count is the genuinely broken case: reading the
                    # missing one as zero would publish "no capacity tags
                    # anywhere" as though it were a fact.
                    if len(counts) == 1:
                        raise RuntimeError(
                            f"area {area_name!r}: toilets query answered 1 "
                            "count, expected 2")
                    toilets_total, capacity_total = counts or (0, 0)
                    # Only a real, non-zero two-count answer is worth
                    # remembering. The empty body a mirror without an area
                    # database returns reads as (0, 0) tonight, as it always
                    # did — and so does a mirror whose area database has the
                    # area but nothing in it (two zero counts). Before the
                    # rota the next night healed either; a cached zero would
                    # stand for a week. Every swept area has mapped toilets,
                    # so a zero total is never worth a week.
                    remember = len(counts) == 2 and toilets_total > 0
                else:
                    cached = counts_cache[area_name]
                    toilets_total, capacity_total = cached["total"], cached["capacity"]
                # Every sweep area has at least one amenity=toilets or
                # changing_table object. Both empty means the *area* didn't
                # resolve — a fallback mirror whose area database is stale/
                # ungenerated answers 200 with no elements, and writing that
                # through would silently drop the area (or, single-area, wipe
                # the served dataset). Retryable: a later round may hit a
                # mirror with a healthy area database.
                if not sweep.get("elements") and not toilets_total:
                    raise RuntimeError(
                        f"area {area_name!r} resolved to zero objects on this "
                        "mirror (stale area database or typo'd "
                        "PAPAMAP_AREA_NAME?)")
            except osm.OverpassUnavailable as exc:
                # Nothing was contacted and nothing will be until the rest is
                # over: the remaining areas fail as one, silently.
                print(f"  WARN {area_name} and {len(remaining) - i - 1} more: {exc}",
                      file=sys.stderr)
                last_exc = exc
                failed.extend(remaining[i:])
                break
            except Exception as exc:
                print(f"  WARN {area_name}: {exc}", file=sys.stderr)
                last_exc = exc
                failed.append((area_name, admin_level))
                continue
            # A retried area re-fetches both queries; dedup absorbs any
            # elements its first, half-successful attempt already collected,
            # and the toilet counts are assigned rather than accumulated.
            ct, play = osm.split_sweep(sweep["elements"])
            ct_elements.extend(ct)
            play_elements.extend(play)
            toilets_by_area[area_name] = toilets_total
            toilets_capacity_by_area[area_name] = capacity_total
            if remember:
                counts_fresh[area_name] = (toilets_total, capacity_total,
                                           admin_level, count_key)
            elif not recount:
                counts_reused += 1
            for el in ct:
                ct_area.setdefault((el.get("type"), el.get("id")), area_name)
            for el in play:
                play_area.setdefault((el.get("type"), el.get("id")), area_name)
            counted = ("" if recount else
                       f" (counted {toilet_counts.age_days(counts_cache[area_name], today)} d ago)")
            print(f"  {area_name}: ct={len(ct)} play={len(play)} "
                  f"toilets={toilets_total}{counted}", file=sys.stderr)
        failed_cities = []
        for i, (display, area_name, admin_level) in enumerate(remaining_cities):
            try:
                ids = overpass_fetch(changing_table_ids_ql(area_name, admin_level))
                _note_base(ids)
                # Every listed city has changing tables in reality, so zero
                # elements means the area didn't resolve — same stale-mirror
                # trap as above, and retryable for the same reason.
                if not ids.get("elements"):
                    raise RuntimeError(
                        f"city area {area_name!r} resolved to zero objects "
                        "on this mirror")
            except osm.OverpassUnavailable as exc:
                print(f"  WARN {display} and {len(remaining_cities) - i - 1} more: {exc}",
                      file=sys.stderr)
                failed_cities.extend(remaining_cities[i:])
                break
            except Exception as exc:
                print(f"  WARN {display}: {exc}", file=sys.stderr)
                failed_cities.append((display, area_name, admin_level))
                continue
            city_ids[display] = {(el.get("type"), el.get("id"))
                                 for el in ids["elements"]}
        remaining, remaining_cities = failed, failed_cities
        rnd += 1
    if remaining:
        raise RuntimeError(
            f"sweep failed for {', '.join(name for name, _ in remaining)} "
            f"after {rnd} rounds — refusing to overwrite existing data "
            f"(last error: {last_exc})")
    if remaining_cities:
        print(f"  WARN: leaderboard skips "
              f"{', '.join(d for d, _, _ in remaining_cities)} today "
              f"(city sweep failed after {rnd} rounds)", file=sys.stderr)
    # An object on (or area-assigned across) a Länder boundary shows up in two
    # sweeps — count and plot it once.
    ct_data = {"elements": osm.dedup_elements(ct_elements)}
    play_data = {"elements": osm.dedup_elements(play_elements)}
    features = export.build_features(ct_data, ct_area)
    play_features = export.build_play_features(play_data, ct_data)
    # The key-locked tables ride along in the GeoJSON for the wheelchair chip
    # (v26) and nowhere else: the pages, the leaderboard and the history
    # count pins, and a table behind a Euro key is not one.
    open_features = [f for f in features if f["properties"]["key"] is None]
    # Summed, where the object halves are deduped: a count cannot tell us
    # whether a toilet on a Länder boundary was already counted next door.
    # Overpass assigns a node to exactly one area, so only a *way* straddling
    # a boundary can be double-counted; on 19 Aug 2026 the per-area sums
    # matched the deduped totals exactly (73,860) across all 24 areas.
    toilets_counts = {"total": sum(toilets_by_area.values()),
                      "capacity_tagged": sum(toilets_capacity_by_area.values())}
    local = stats.local_stats(ct_data, toilets_counts, play_data)

    try:
        global_block = stats.global_stats(fetch=taginfo_fetch)
        global_source = "taginfo"
    except Exception as exc:  # taginfo down must not kill the build
        print(f"WARN: taginfo stats failed, keeping previous global block: {exc}",
              file=sys.stderr)
        global_block = stats.previous_global(stats_path)
        global_source = "previous" if global_block else None

    generated_at = build_time.isoformat(timespec="seconds")
    exported = export.export_geojson(features, geojson_path)
    export.export_geojson(play_features, play_geojson_path)
    export.export_stats({
        "generated_at": generated_at,
        "area_name": display_area,
        "area_key": area_key,
        "local": local,
        "global": global_block,
        # The DATA timestamp (min across tonight's Overpass answers), not the
        # build time above — pipeline.delta resets against this. None on a
        # mirror that never reports osm3s.timestamp_osm_base.
        "data_base": min(base_timestamps) if base_timestamps else None,
        # CONTRACT.md's live-updates amendment: every room a reader can
        # answer with, mapped to the status classify() gives it — the one
        # lookup the frontend may use for its own answer, in room_choices.py
        # so both this and pipeline.delta build it the same way.
        "answer_status": answer_status_table(),
    }, stats_path)
    # One padded bbox per sweep area (pipeline.delta's real country-coverage
    # filter, v48 follow-up) — never served (web-data/private/, like
    # delta-state.json), written whole on every build the same way
    # toilets_counts.json is, from every changing-table and play-place
    # object this build found, each already knowing its own area (ct_area/
    # play_area, the same per-area sweep authority the pages use). A write
    # failure (a read-only mount) must not stop the pages the way the
    # toilets-count cache's own failure doesn't — the delta follower falls
    # back to its own whole-dataset approximation and logs it.
    try:
        elements_with_area = (
            [(*osm.element_coords(el), ct_area.get((el.get("type"), el.get("id"))))
             for el in ct_data["elements"]]
            + [(*osm.element_coords(el), play_area.get((el.get("type"), el.get("id"))))
               for el in play_data["elements"]])
        export.write_json_atomic(delta.compute_area_bboxes(elements_with_area), areas_bbox_path)
    except OSError as exc:
        print(f"  WARN area bboxes not saved to {areas_bbox_path}: {exc} — "
              "pipeline.delta falls back to its own whole-dataset approximation",
              file=sys.stderr)
    print(f"  toilet counts: {len(toilets_by_area) - counts_reused} area(s) "
          f"counted tonight, {counts_reused} reused from {counts_path}",
          file=sys.stderr)

    # The area pages, written last: they are derived from the same features
    # the map just got, and the map data is the artifact that must never be
    # missing. German pages only appear when all 16 Länder were swept
    # (PAPAMAP_COUNTRIES=dk must not publish an index claiming Germany has one
    # Bundesland — and a partial German sweep can't reach here, the sweep
    # above aborts unless every area succeeded); every other swept country
    # gets one page in its own language, France additionally its 13 région
    # pages. The routing and the reasoning live in config.COUNTRY_PAGES and
    # pages.write_all_pages.
    # areas.json goes next to stats.json: the map footer reads it to name the
    # area page for the view on screen (CONTRACT.md v32).
    written = pages.write_all_pages(areas, open_features, ct_area, toilets_by_area,
                                    pages_dir, generated_at, areas_path=areas_path)

    # History + leaderboard, only when the city sweep ran (i.e. a full build).
    # The history append replaces a same-date entry, so a manual re-run after
    # the nightly cron updates today rather than fabricating a second day.
    if cities:
        # Scoped to the city's country: a level-8 "Birmingham" is also a
        # town in Alabama, and since the US is swept its ids would match.
        city_by_key = leaderboard.city_membership(cities, city_ids, ct_area)
        region_counts, city_counts = leaderboard.counts_from_features(
            open_features, ct_area, city_by_key,
            region_names=[name for name, _ in areas],
            city_names=list(city_ids))
        history = leaderboard.load_history(history_path)
        leaderboard.append_day(history, generated_at[:10],
                               region_counts, city_counts)
        export.write_json_atomic(history, history_path)
        written += leaderboard.write_leaderboard_pages(history, pages_dir)

    # The recounts are remembered last, once everything they served is on
    # disk: a build that died anywhere before this line must recount
    # tomorrow rather than trust numbers it never published — and a cache
    # that cannot be written (a read-only mount) must not stop the pages.
    if counts_fresh:
        for name, (total, capacity, level, key) in counts_fresh.items():
            counts_cache[name] = {"total": total, "capacity": capacity,
                                  "level": level, "query": key,
                                  "date": today.isoformat()}
        try:
            toilet_counts.save(
                counts_path, toilet_counts.prune(counts_cache, today, counts_period))
        except OSError as exc:
            print(f"  WARN toilet counts not saved to {counts_path}: {exc} — "
                  "every area is recounted tomorrow", file=sys.stderr)

    # play_places is the open questions, as in stats.json, not the file's
    # length: the answered-no places (v27) ride in the same file and get
    # their own number, so the ops page prints one meaning per label.
    return {"features": exported, "play_places": local["play_places"],
            "play_places_no": local["play_places_no"],
            "ct_objects": local["ct_objects"],
            "toilets_total": local["toilets_total"],
            "global_source": global_source, "pages": len(written)}


if __name__ == "__main__":
    print(run_pipeline())
