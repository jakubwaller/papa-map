"""The per-area amenity=toilets counts, kept between builds.

Every sweep area used to cost two Overpass queries a night: the object sweep
and the counting query behind "N toilets mapped here, capacity tags on M".
The count is the slower of the two in the big areas (the UK: 45.2 s counting
against 41.9 s sweeping, Japan 49.7 s against 39.6 s), and it is the one
number on the site that moves by a few dozen a week — nobody maps toilets at
the pace they answer the changing-table room question. So the counts live
here, in a small JSON file next to history.json, and each area is recounted
on one night a week, staggered so a seventh of the areas is due every night
rather than all of them on Sunday. The 46-country build dropped from 208
queries to about 145 a night, which is the room the chunked US and Canada
sweeps took the same day (wave 2, 64 areas): 137 sweeps + a seventh of 137
counts + 62 cities ≈ 220, the pre-rota level, without the build growing
past the ops mail.

The cache is state, not output: the frontend never reads it. A missing or
unreadable file costs one full night of counts and nothing else.
"""
from __future__ import annotations

import hashlib
import json
import re
import zlib
from datetime import date
from pathlib import Path

from .export import write_json_atomic


_TIMEOUT_RE = re.compile(r"\[timeout:\d+\]")


def query_hash(ql: str) -> str:
    """Twelve hex digits of the count query that produced an entry. The
    query embeds the area selector, the admin level and the capacity-key
    regex; if any of them changes, the cached number was made under another
    definition and must not be summed with tonight's. The [timeout:N] header
    is stripped first: it is a tuning knob, not a definition, and a changed
    PAPAMAP_OVERPASS_QL_TIMEOUT must not buy a full night of recounts."""
    return hashlib.sha1(_TIMEOUT_RE.sub("", ql).encode("utf-8")).hexdigest()[:12]


def prune(cache: dict, today: date, period_days: int) -> dict:
    """Drop entries no build has refreshed in four periods — an area removed
    from PAPAMAP_COUNTRIES, or renamed upstream. A partial build must not
    prune the areas it did not sweep, so age is the only criterion."""
    keep = {}
    for name, entry in cache.items():
        age = age_days(entry, today) if isinstance(entry, dict) else None
        if age is not None and 0 <= age <= 4 * max(period_days, 1):
            keep[name] = entry
    return keep


def load(path: str) -> dict:
    """{area_name: {"total": int, "capacity": int, "level": "4",
    "query": "<query_hash>", "date": "YYYY-MM-DD"}},
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
           period_days: int, query: str | None = None) -> bool:
    """Whether tonight's build recounts this area: yes when the period is a
    night or less (the old every-night behaviour, PAPAMAP_TOILETS_COUNTS_
    PERIOD_DAYS=1), when there is no usable entry, when the entry was counted
    at another admin_level (a PAPAMAP_AREA_NAME=Hamburg level-6 debug run
    must not lend the city's count to the Land for a week) or by another
    query (`query` is tonight's query_hash; a widened capacity regex or a
    changed selector must not be summed with last week's definition), when
    the entry is older than a period (a missed night — the build failed, or
    the area was added to the rota mid-week), or when tonight is the area's
    slot and it was not already counted today (a manual re-run must not pay
    twice)."""
    if period_days <= 1:
        return True
    entry = cache.get(area_name)
    if not isinstance(entry, dict) or not all(
            isinstance(entry.get(k), int) and not isinstance(entry.get(k), bool)
            for k in ("total", "capacity")):
        return True
    if entry.get("level") != admin_level:
        return True
    if query is not None and entry.get("query") != query:
        return True
    age = age_days(entry, today)
    if age is None or age < 0 or age >= period_days:
        return True
    return age >= 1 and today.toordinal() % period_days == slot(area_name, period_days)
