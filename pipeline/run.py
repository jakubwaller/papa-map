from __future__ import annotations

import sys
import time
from datetime import datetime, timezone

from . import export, leaderboard, osm, pages, stats
from .config import (BUNDESLAENDER, CITY_AREAS, GEOJSON_PATH, HISTORY_PATH,
                     PAGES_DIR, STATS_PATH, SWEEP_PAUSE_S, SWEEP_ROUNDS,
                     changing_table_ids_ql, changing_table_ql,
                     display_area as configured_area, sweep_areas, toilets_ql)


def run_pipeline(geojson_path=GEOJSON_PATH, stats_path=STATS_PATH, areas=None,
                 display_area=None, area_key=None, overpass_fetch=osm.fetch_overpass,
                 taginfo_fetch=stats.fetch_taginfo, now=None,
                 sweep_rounds=None, sweep_pause_s=None, pages_dir=PAGES_DIR,
                 cities=None, history_path=HISTORY_PATH):
    """One idempotent build: Overpass (per sweep area) -> classify -> GeoJSON +
    stats.json + the per-Bundesland pages, plus (on a full build) the
    per-region history and the leaderboard pages rendered from it. An area
    whose queries fail on every
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
        lands = {n for n, lvl in areas if lvl == "4" and n in BUNDESLAENDER}
        cities = CITY_AREAS if len(lands) == len(BUNDESLAENDER) else ()
    # A hand-passed display_area is a name only — no translation can exist for
    # it, so its area_key stays None unless the caller supplies one too.
    if display_area is None:
        display_area, configured_key = configured_area()
        area_key = configured_key if area_key is None else area_key
    rounds = SWEEP_ROUNDS if sweep_rounds is None else sweep_rounds
    pause = SWEEP_PAUSE_S if sweep_pause_s is None else sweep_pause_s
    ct_elements, toilets_elements = [], []
    # Which sweep area each object came from. The geojson carries coordinates
    # and no region field, so the Overpass area query is the only authority on
    # which Land an object sits in — and it is free, since the sweep is already
    # chunked per Land. First sweep wins for an object on (or area-assigned
    # across) a boundary, which is the same copy dedup_elements() keeps.
    ct_area, toilets_area = {}, {}
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
                ct = overpass_fetch(changing_table_ql(area_name, admin_level))
                toilets = overpass_fetch(toilets_ql(area_name, admin_level))
                # Every sweep area has at least one amenity=toilets or
                # changing_table object. Both empty means the *area* didn't
                # resolve — a fallback mirror whose area database is stale/
                # ungenerated answers 200 with no elements, and writing that
                # through would silently drop the area (or, single-area, wipe
                # the served dataset). Retryable: a later round may hit a
                # mirror with a healthy area database.
                if not ct.get("elements") and not toilets.get("elements"):
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
            # elements its first, half-successful attempt already collected.
            ct_elements.extend(ct["elements"])
            toilets_elements.extend(toilets["elements"])
            for el in ct["elements"]:
                ct_area.setdefault((el.get("type"), el.get("id")), area_name)
            for el in toilets["elements"]:
                toilets_area.setdefault((el.get("type"), el.get("id")), area_name)
            print(f"  {area_name}: ct={len(ct['elements'])} "
                  f"toilets={len(toilets['elements'])}", file=sys.stderr)
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
    toilets_data = {"elements": osm.dedup_elements(toilets_elements)}
    features = export.build_features(ct_data)
    local = stats.local_stats(ct_data, toilets_data)

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
    land_names = sorted((n for n, lvl in areas if lvl == "4" and n in BUNDESLAENDER),
                        key=pages.sort_key)
    written = []
    if land_names:
        by_area = pages.group_by_area(features, ct_area)
        toilets_by_area = {}
        for el in toilets_data["elements"]:
            area = toilets_area.get((el.get("type"), el.get("id")))
            if area:
                toilets_by_area[area] = toilets_by_area.get(area, 0) + 1
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

    return {"features": exported, "ct_objects": local["ct_objects"],
            "toilets_total": local["toilets_total"],
            "global_source": global_source, "pages": len(written)}


if __name__ == "__main__":
    print(run_pipeline())
