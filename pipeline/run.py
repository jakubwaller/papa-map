from __future__ import annotations

import sys
import time
from datetime import datetime, timezone

from . import export, osm, pages, stats
from .config import (BUNDESLAENDER, GEOJSON_PATH, PAGES_DIR, STATS_PATH,
                     SWEEP_PAUSE_S, SWEEP_ROUNDS, changing_table_ql,
                     display_area as configured_area, sweep_areas, toilets_ql)


def run_pipeline(geojson_path=GEOJSON_PATH, stats_path=STATS_PATH, areas=None,
                 display_area=None, area_key=None, overpass_fetch=osm.fetch_overpass,
                 taginfo_fetch=stats.fetch_taginfo, now=None,
                 sweep_rounds=None, sweep_pause_s=None, pages_dir=PAGES_DIR):
    """One idempotent build: Overpass (per sweep area) -> classify -> GeoJSON +
    stats.json + the per-Bundesland pages. An area whose queries fail on every
    mirror — including one that resolves to zero objects (stale mirror area
    database, typo'd PAPAMAP_AREA_NAME) — is retried in later sweep rounds
    after a cool-down; only an area still failing after every round aborts the
    build, before anything is written (old files survive). A taginfo failure
    only degrades the global block to the previous one."""
    areas = areas or sweep_areas()
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
    remaining = list(areas)
    last_exc: Exception | None = None
    for rnd in range(rounds):
        if rnd and remaining:
            print(f"  round {rnd + 1}: retrying "
                  f"{', '.join(name for name, _ in remaining)}", file=sys.stderr)
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
        remaining = failed
        if not remaining:
            break
    if remaining:
        raise RuntimeError(
            f"sweep failed for {', '.join(name for name, _ in remaining)} "
            f"after {rounds} rounds — refusing to overwrite existing data "
            f"(last error: {last_exc})")
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

    return {"features": exported, "ct_objects": local["ct_objects"],
            "toilets_total": local["toilets_total"],
            "global_source": global_source, "pages": len(written)}


if __name__ == "__main__":
    print(run_pipeline())
