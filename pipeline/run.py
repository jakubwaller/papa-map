from __future__ import annotations

import sys
from datetime import datetime, timezone

from . import export, osm, stats
from .config import AREA_NAME, GEOJSON_PATH, STATS_PATH, changing_table_ql, toilets_ql


def run_pipeline(geojson_path=GEOJSON_PATH, stats_path=STATS_PATH, area_name=AREA_NAME,
                 overpass_fetch=osm.fetch_overpass, taginfo_fetch=stats.fetch_taginfo,
                 now=None):
    """One idempotent build: Overpass -> classify -> GeoJSON + stats.json.
    An Overpass failure aborts before anything is written (old files survive);
    an HTTP-200 response resolving the area to zero objects (stale mirror area
    database, typo'd PAPAMAP_AREA_NAME) aborts the same way; a taginfo failure
    only degrades the global block to the previous one."""
    ct_data = overpass_fetch(changing_table_ql(area_name))
    toilets_data = overpass_fetch(toilets_ql(area_name))
    # Any real target area has at least one amenity=toilets or changing_table
    # object. Both empty means the *area* didn't resolve — a fallback mirror
    # whose area database is stale/ungenerated answers 200 with no elements,
    # and writing that through would silently wipe the served dataset.
    if not ct_data.get("elements") and not toilets_data.get("elements"):
        raise RuntimeError(
            f"area {area_name!r} resolved to zero objects on this mirror "
            "(stale area database or typo'd PAPAMAP_AREA_NAME?) — "
            "refusing to overwrite existing data")
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
        "area_name": area_name,
        "local": local,
        "global": global_block,
    }, stats_path)
    return {"features": exported, "ct_objects": local["ct_objects"],
            "toilets_total": local["toilets_total"], "global_source": global_source}


if __name__ == "__main__":
    print(run_pipeline())
