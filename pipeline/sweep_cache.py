"""Each sweep area's last good Overpass answer, kept between builds.

One area that failed every round used to abort the whole build: on
2026-10-16 Missouri alone threw away the other 183 areas after a 5 h first
round against a flaky Overpass. Now an area still failing when the sweep
gives up is built from its last good answer here instead, if that answer is
at most SWEEP_CACHE_MAX_DAYS old and was made by the same query, and a WARN
line names it for the ops page. Only an area with no such answer still
aborts the build.

State like toilets_counts.json, but under private/: it is ~25 MB of raw
answers nobody should download. Deleting it only removes the fallback.
"""
from __future__ import annotations

import json
import time
from datetime import date
from pathlib import Path

from .export import write_json_atomic
from .toilet_counts import age_days, query_hash


def _path(cache_dir: str, ql: str) -> Path:
    # Keyed by the query, so a changed sweep definition never serves an
    # answer made under the old one ([timeout:N] is ignored, as for counts).
    return Path(cache_dir) / f"{query_hash(ql)}.json"


def save(cache_dir: str, ql: str, answer: dict, today: date) -> None:
    write_json_atomic({"date": today.isoformat(), "answer": answer},
                      str(_path(cache_dir, ql)))


def load(cache_dir: str, ql: str, today: date, max_days: int) -> tuple[dict, int] | None:
    """(answer, age in days), or None when this query has no answer from the
    last max_days — a missing, corrupt or future-dated file included."""
    try:
        entry = json.loads(_path(cache_dir, ql).read_text(encoding="utf-8"))
        answer = entry["answer"]
    except (OSError, ValueError, KeyError, TypeError):
        return None
    age = age_days(entry, today)
    if age is None or not 0 <= age <= max_days or not isinstance(answer, dict):
        return None
    return answer, age


def prune(cache_dir: str, max_days: int, now: float | None = None) -> None:
    """Delete answers too old to be used again: those left behind by a changed
    query or a removed country. Age is the only test, as in
    toilet_counts.prune, so a partial build does not delete the areas it
    skipped."""
    cutoff = (time.time() if now is None else now) - (max_days + 1) * 86400
    for path in Path(cache_dir).glob("*.json"):
        try:
            if path.stat().st_mtime < cutoff:
                path.unlink()
        except OSError:
            pass
