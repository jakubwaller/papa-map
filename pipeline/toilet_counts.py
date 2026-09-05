"""The per-area amenity=toilets counts, kept between builds.

Every sweep area used to cost two Overpass queries a night: the object sweep
and the counting query behind "N toilets mapped here, capacity tags on M".
The count is the slower of the two in the big areas (the UK: 45.2 s counting
against 41.9 s sweeping, Japan 49.7 s against 39.6 s), and it is the one
number on the site that moves by a few dozen a week — nobody maps toilets at
the pace they answer the changing-table room question. So the counts live
here, in a small JSON file next to history.json, and each area is recounted
on one night a week, staggered so a seventh of the areas is due every night
rather than all of them on Sunday. The 46-country build drops from 208
queries to about 145 a night, which is the room the chunked US and Canada
sweeps need (wave 2, ~63 areas) without the build growing past the ops mail.

The cache is state, not output: the frontend never reads it. A missing or
unreadable file costs one full night of counts and nothing else.
"""
from __future__ import annotations

import json
import zlib
from datetime import date
from pathlib import Path

from .export import write_json_atomic


def load(path: str) -> dict:
    """{area_name: {"total": int, "capacity": int, "level": "4",
    "date": "YYYY-MM-DD"}},
    or {} when the file is missing or not what we wrote — a corrupt cache is
    a full recount, never a crash."""
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    areas = data.get("areas") if isinstance(data, dict) else None
    return dict(areas) if isinstance(areas, dict) else {}


def save(path: str, cache: dict) -> None:
    write_json_atomic({"areas": cache}, path)


def slot(area_name: str, period_days: int) -> int:
    """The night of the period an area is recounted on. A hash of the name,
    not its position in the sweep list, so adding a country does not shuffle
    every other area onto a different night."""
    return zlib.crc32(area_name.encode("utf-8")) % period_days


def age_days(entry, today: date) -> int | None:
    try:
        return (today - date.fromisoformat(entry["date"])).days
    except (KeyError, TypeError, ValueError):
        return None


def is_due(cache: dict, area_name: str, admin_level: str, today: date,
           period_days: int) -> bool:
    """Whether tonight's build recounts this area: yes when the period is a
    night or less (the old every-night behaviour, PAPAMAP_TOILETS_COUNTS_
    PERIOD_DAYS=1), when there is no usable entry, when the entry was counted
    at another admin_level (a PAPAMAP_AREA_NAME=Hamburg level-6 debug run
    must not lend the city's count to the Land for a week), when the entry
    is older than a period (a missed night — the build failed, or the area
    was added to the rota mid-week), or when tonight is the area's slot and
    it was not already counted today (a manual re-run must not pay twice)."""
    if period_days <= 1:
        return True
    entry = cache.get(area_name)
    if not isinstance(entry, dict) or not all(
            isinstance(entry.get(k), int) and not isinstance(entry.get(k), bool)
            for k in ("total", "capacity")):
        return True
    if entry.get("level") != admin_level:
        return True
    age = age_days(entry, today)
    if age is None or age < 0 or age >= period_days:
        return True
    return age >= 1 and today.toordinal() % period_days == slot(area_name, period_days)
