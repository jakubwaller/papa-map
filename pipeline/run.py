from __future__ import annotations

import sys
from datetime import datetime, timezone

from . import export, osm, stats
from .config import (DISPLAY_AREA, GEOJSON_PATH, STATS_PATH, changing_table_ql,
                     sweep_areas, toilets_ql)


def run_pipeline(geojson_path=GEOJSON_PATH, stats_path=STATS_PATH, areas=None,
                 display_area=None, overpass_fetch=osm.fetch_overpass,
                 taginfo_fetch=stats.fetch_taginfo, now=None):
    """One idempotent build: Overpass (per sweep area) -> classify -> GeoJSON +
    stats.json. Any Overpass failure aborts before anything is written (old
    files survive); an HTTP-200 response resolving an area to zero objects
    (stale mirror area database, typo'd PAPAMAP_AREA_NAME) aborts the same
    way; a taginfo failure only degrades the global block to the previous one."""
    areas = areas or sweep_areas()
    display_area = display_area or DISPLAY_AREA
    ct_elements, toilets_elements = [], []
    for area_name, admin_level in areas:
        ct = overpass_fetch(changing_table_ql(area_name, admin_level))
        toilets = overpass_fetch(toilets_ql(area_name, admin_level))
        # Every sweep area has at least one amenity=toilets or changing_table
        # object. Both empty means the *area* didn't resolve — a fallback
        # mirror whose area database is stale/ungenerated answers 200 with no
        # elements, and writing that through would silently drop the area (or,
        # single-area, wipe the served dataset).
        if not ct.get("elements") and not toilets.get("elements"):
            raise RuntimeError(
                f"area {area_name!r} resolved to zero objects on this mirror "
                "(stale area database or typo'd PAPAMAP_AREA_NAME?) — "
                "refusing to overwrite existing data")
        ct_elements.extend(ct["elements"])
        toilets_elements.extend(toilets["elements"])
        print(f"  {area_name}: ct={len(ct['elements'])} "
              f"toilets={len(toilets['elements'])}", file=sys.stderr)
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
        "local": local,
        "global": global_block,
    }, stats_path)
    return {"features": exported, "ct_objects": local["ct_objects"],
            "toilets_total": local["toilets_total"], "global_source": global_source}


if __name__ == "__main__":
    print(run_pipeline())
