from __future__ import annotations

import sys
import time
from datetime import datetime, timezone

from . import export, leaderboard, osm, pages, stats
from .config import (BUNDESLAENDER, CITY_AREAS, GEOJSON_PATH, HISTORY_PATH,
                     PAGES_DIR, PLAY_GEOJSON_PATH, STATS_PATH, SWEEP_PAUSE_S,
                     SWEEP_ROUNDS, changing_table_ids_ql,
                     display_area as configured_area, sweep_areas, sweep_ql,
                     toilets_counts_ql)


def run_pipeline(geojson_path=GEOJSON_PATH, stats_path=STATS_PATH, areas=None,
                 display_area=None, area_key=None, overpass_fetch=osm.fetch_overpass,
                 taginfo_fetch=stats.fetch_taginfo, now=None,
                 sweep_rounds=None, sweep_pause_s=None, pages_dir=PAGES_DIR,
                 cities=None, history_path=HISTORY_PATH,
                 play_geojson_path=PLAY_GEOJSON_PATH):
    """One idempotent build: Overpass (per sweep area) -> classify -> GeoJSON +
    play_places.geojson + stats.json + the per-Bundesland pages, plus (on a
    full build) the per-region history and the leaderboard pages rendered from
    it. An area whose queries fail on every
    mirror — including one that resolves to zero objects (stale mirror area
    database, typo'd PAPAMAP_AREA_NAME) — is retried in later sweep rounds
    after a cool-down; only an area still failing after every round aborts the
    build, before anything is written (old files survive). A taginfo failure
    only degrades the global block to the previous one."""
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
    # Which leaderboard city each object lies in, from an ids-only query per
    # city — the same area-query authority as ct_area, at a fraction of the
    # payload. City sweeps are non-fatal: the map must never be held hostage
    # by the leaderboard, so a city that fails every round is WARNed and
    # simply absent from today's history entry.
    city_ids: dict[str, set] = {}
    remaining = list(areas)
    remaining_cities = list(cities)
    last_exc: Exception | None = None
    for rnd in range(rounds):
        if rnd and (remaining or remaining_cities):
            names = ([name for name, _ in remaining]
                     + [display for display, _, _ in remaining_cities])
            print(f"  round {rnd + 1}: retrying {', '.join(names)}",
                  file=sys.stderr)
            time.sleep(pause)
        failed = []
        for area_name, admin_level in remaining:
            try:
                sweep = overpass_fetch(sweep_ql(area_name, admin_level))
                counts = osm.parse_counts(
                    overpass_fetch(toilets_counts_ql(area_name, admin_level)))
                # A real answer carries one count per `out count;` statement,
                # two zeros included when the area resolved to nothing — so
                # *no* counts at all is not "no toilets", it is a response
                # that was never a count answer (the empty body a mirror with
                # no area database returns), and the zero-objects check below
                # names that properly. Exactly one count is the genuinely
                # broken case: reading the missing one as zero would publish
                # "no capacity tags anywhere" as though it were a fact.
                if len(counts) == 1:
                    raise RuntimeError(
                        f"area {area_name!r}: toilets query answered 1 count, "
                        "expected 2")
                toilets_total, capacity_total = counts or (0, 0)
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
            for el in ct:
                ct_area.setdefault((el.get("type"), el.get("id")), area_name)
            print(f"  {area_name}: ct={len(ct)} play={len(play)} "
                  f"toilets={toilets_total}", file=sys.stderr)
        failed_cities = []
        for display, area_name, admin_level in remaining_cities:
            try:
                ids = overpass_fetch(changing_table_ids_ql(area_name, admin_level))
                # Every listed city has changing tables in reality, so zero
                # elements means the area didn't resolve — same stale-mirror
                # trap as above, and retryable for the same reason.
                if not ids.get("elements"):
                    raise RuntimeError(
                        f"city area {area_name!r} resolved to zero objects "
                        "on this mirror")
            except Exception as exc:
                print(f"  WARN {display}: {exc}", file=sys.stderr)
                failed_cities.append((display, area_name, admin_level))
                continue
            city_ids[display] = {(el.get("type"), el.get("id"))
                                 for el in ids["elements"]}
        remaining, remaining_cities = failed, failed_cities
        if not remaining and not remaining_cities:
            break
    if remaining:
        raise RuntimeError(
            f"sweep failed for {', '.join(name for name, _ in remaining)} "
            f"after {rounds} rounds — refusing to overwrite existing data "
            f"(last error: {last_exc})")
    if remaining_cities:
        print(f"  WARN: leaderboard skips "
              f"{', '.join(d for d, _, _ in remaining_cities)} today "
              f"(city sweep failed after {rounds} rounds)", file=sys.stderr)
    # An object on (or area-assigned across) a Länder boundary shows up in two
    # sweeps — count and plot it once.
    ct_data = {"elements": osm.dedup_elements(ct_elements)}
    play_data = {"elements": osm.dedup_elements(play_elements)}
    features = export.build_features(ct_data)
    play_features = export.build_play_features(play_data)
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

    generated_at = (now or datetime.now(timezone.utc)).isoformat(timespec="seconds")
    exported = export.export_geojson(features, geojson_path)
    exported_play = export.export_geojson(play_features, play_geojson_path)
    export.export_stats({
        "generated_at": generated_at,
        "area_name": display_area,
        "area_key": area_key,
        "local": local,
        "global": global_block,
    }, stats_path)

    # The Bundesland pages, written last: they are derived from the same
    # features the map just got, and the map data is the artifact that must
    # never be missing. A build that sweeps no German Land (PAPAMAP_COUNTRIES=dk,
    # a single-area debug build) writes none at all rather than publishing an
    # index page that claims Germany has one Bundesland. A partial German sweep
    # can't reach here: the sweep above aborts unless every area succeeded.
    # Membership in BUNDESLAENDER is what makes this German-only; French
    # régions share admin_level=4 and must not get /wickeltische/ pages, whose
    # whole premise is that "Wickeltisch Bayern" is searched in German.
    land_names = sorted((n for n, lvl in areas if lvl == "4" and n in BUNDESLAENDER),
                        key=pages.sort_key)
    written = []
    if land_names:
        by_area = pages.group_by_area(features, ct_area)
        summaries = [pages.summarize(name, by_area.get(name, []),
                                     toilets_by_area.get(name, 0))
                     for name in land_names]
        written = pages.write_pages(summaries, pages_dir, generated_at)

    # History + leaderboard, only when the city sweep ran (i.e. a full build).
    # The history append replaces a same-date entry, so a manual re-run after
    # the nightly cron updates today rather than fabricating a second day.
    if cities:
        city_by_key = {}
        # Config order, so an object inside two city areas would land in the
        # same city every night — cities don't overlap today, but the
        # first-wins rule matches how ct_area handles Länder boundaries.
        for display, _, _ in cities:
            for key in city_ids.get(display, ()):
                city_by_key.setdefault(key, display)
        region_counts, city_counts = leaderboard.counts_from_features(
            features, ct_area, city_by_key,
            region_names=[name for name, _ in areas],
            city_names=list(city_ids))
        history = leaderboard.load_history(history_path)
        leaderboard.append_day(history, generated_at[:10],
                               region_counts, city_counts)
        export.write_json_atomic(history, history_path)
        written += leaderboard.write_leaderboard_pages(history, pages_dir)

    return {"features": exported, "play_places": exported_play,
            "ct_objects": local["ct_objects"],
            "toilets_total": local["toilets_total"],
            "global_source": global_source, "pages": len(written)}


if __name__ == "__main__":
    print(run_pipeline())
