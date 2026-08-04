from __future__ import annotations

import sys
import time
from datetime import datetime, timezone

from . import export, osm, stats
from .config import (GEOJSON_PATH, STATS_PATH, SWEEP_PAUSE_S, SWEEP_ROUNDS,
                     changing_table_ql, display_area as configured_area,
                     sweep_areas, toilets_ql)


def run_pipeline(geojson_path=GEOJSON_PATH, stats_path=STATS_PATH, areas=None,
                 display_area=None, area_key=None, overpass_fetch=osm.fetch_overpass,
                 taginfo_fetch=stats.fetch_taginfo, now=None,
                 sweep_rounds=None, sweep_pause_s=None):
    """One idempotent build: Overpass (per sweep area) -> classify -> GeoJSON +
    stats.json. An area whose queries fail on every mirror — including one that
    resolves to zero objects (stale mirror area database, typo'd
    PAPAMAP_AREA_NAME) — is retried in later sweep rounds after a cool-down;
    only an area still failing after every round aborts the build, before
    anything is written (old files survive). A taginfo failure only degrades
    the global block to the previous one."""
    areas = areas or sweep_areas()
    # A hand-passed display_area is a name only — no translation can exist for
    # it, so its area_key stays None unless the caller supplies one too.
    if display_area is None:
        display_area, configured_key = configured_area()
        area_key = configured_key if area_key is None else area_key
    rounds = SWEEP_ROUNDS if sweep_rounds is None else sweep_rounds
    pause = SWEEP_PAUSE_S if sweep_pause_s is None else sweep_pause_s
    ct_elements, toilets_elements = [], []
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

    exported = export.export_geojson(features, geojson_path)
    export.export_stats({
        "generated_at": (now or datetime.now(timezone.utc)).isoformat(timespec="seconds"),
        "area_name": display_area,
        "area_key": area_key,
        "local": local,
        "global": global_block,
    }, stats_path)
    return {"features": exported, "ct_objects": local["ct_objects"],
            "toilets_total": local["toilets_total"], "global_source": global_source}


if __name__ == "__main__":
    print(run_pipeline())
