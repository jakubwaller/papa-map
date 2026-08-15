"""One-time seeding of the leaderboard history from Overpass attic queries:
`python -m pipeline.backfill 2026-07-17 2026-07-24 ...` reconstructs one
history entry per date (midnight UTC) so the leaderboard can show a real
week-over-week delta on day one instead of staying empty for its first week.

Each date costs one changing_table tag query per sweep area plus one ids
query per city (~45 queries), spaced with a pause — attic queries are heavier
for the servers than live ones, and this runs attended, once. Much heavier:
Baden-Württemberg alone computes for ~3 minutes on the main instance even
off-peak, so the nightly `[timeout:55]` can never finish it. Run this where
no 60 s connection cutoff exists (the VPS, not a laptop) with
`PAPAMAP_OVERPASS_QL_TIMEOUT=300`; one date is roughly an hour. A date already
present in the history is skipped, never overwritten: build days are the
better data, and re-running the backfill must be a no-op.
"""
from __future__ import annotations

import sys
import time
from datetime import date as _date

from . import export, leaderboard, osm
from .config import (CITY_AREAS, HISTORY_PATH, changing_table_ids_ql,
                     changing_table_ql, sweep_areas)

QUERY_PAUSE_S = 3.0


def snapshot(date_iso: str, areas=None, cities=CITY_AREAS,
             fetch=osm.fetch_overpass, pause_s=QUERY_PAUSE_S,
             sleep=time.sleep) -> tuple[dict, dict]:
    """(regions, cities) count triples as of date_iso, computed through the
    same path as the nightly build: same queries, same first-wins area
    assignment, same dedup, same classify via build_features — so a backfilled
    day and a build day are comparable by construction."""
    areas = areas or sweep_areas()
    attic = f"{date_iso}T00:00:00Z"
    ct_elements, ct_area = [], {}
    for name, lvl in areas:
        data = fetch(changing_table_ql(name, lvl, date=attic))
        # Same trap as the live sweep: an area resolving to zero objects is a
        # stale mirror or a typo, and writing it through would poison every
        # delta computed against this day.
        if not data.get("elements"):
            raise RuntimeError(
                f"area {name!r} resolved to zero objects at {attic}")
        ct_elements.extend(data["elements"])
        for el in data["elements"]:
            ct_area.setdefault((el.get("type"), el.get("id")), name)
        print(f"  {date_iso} {name}: ct={len(data['elements'])}",
              file=sys.stderr)
        sleep(pause_s)
    features = export.build_features(
        {"elements": osm.dedup_elements(ct_elements)})
    city_ids: dict[str, set] = {}
    for display, area_name, lvl in cities:
        data = fetch(changing_table_ids_ql(area_name, lvl, date=attic))
        if not data.get("elements"):
            raise RuntimeError(
                f"city area {area_name!r} resolved to zero objects at {attic}")
        city_ids[display] = {(el.get("type"), el.get("id"))
                             for el in data["elements"]}
        sleep(pause_s)
    city_by_key: dict[tuple, str] = {}
    for display, _, _ in cities:
        for key in city_ids.get(display, ()):
            city_by_key.setdefault(key, display)
    return leaderboard.counts_from_features(
        features, ct_area, city_by_key,
        region_names=[n for n, _ in areas], city_names=list(city_ids))


def backfill(dates, history_path=HISTORY_PATH, **snapshot_kwargs) -> list[str]:
    """Seed the history with the given dates (oldest first). The file is
    written after every date, so an aborted run keeps what it finished."""
    history = leaderboard.load_history(history_path)
    have = {d.get("date") for d in history["days"]}
    added = []
    for date_iso in sorted(dates):
        if date_iso in have:
            print(f"  {date_iso}: already in history, skipping",
                  file=sys.stderr)
            continue
        regions, cities_counts = snapshot(date_iso, **snapshot_kwargs)
        leaderboard.append_day(history, date_iso, regions, cities_counts,
                               source="backfill")
        export.write_json_atomic(history, history_path)
        have.add(date_iso)
        added.append(date_iso)
    return added


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        sys.exit("usage: python -m pipeline.backfill YYYY-MM-DD [YYYY-MM-DD ...]")
    for arg in args:  # fail loudly on a typo'd date, before any query runs
        _date.fromisoformat(arg)
    done = backfill(args)
    print(f"seeded {len(done)} day(s): {', '.join(done) or 'none'}")
