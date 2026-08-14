from __future__ import annotations

import json
import sys
from pathlib import Path

import requests

from .classify import centralkey_locked, classify, tokens
from .config import TAGINFO_STATS_URL, TAGINFO_VALUES_URL, USER_AGENT
from .osm import element_coords


def fetch_taginfo(url: str) -> dict:
    resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=60)
    resp.raise_for_status()
    return resp.json()


def local_stats(ct_data: dict, toilets_data: dict) -> dict:
    """The `local` stats block, from the two Overpass responses. ct_yes/no/
    limited are exact value counts, so junk values ("02") show up only in
    ct_objects. The feature-facing counters (ct_yes/ct_limited, location and
    status buckets) skip elements without usable coordinates and elements
    behind a central key — the same filters export.build_features applies — so
    the stats strip never claims more tables than the map has pins.
    centralkey_locked counts the key-locked drops that would otherwise be
    pins."""
    ct_yes = ct_no = ct_limited = yes_location_known = locked = 0
    status_counts = {"accessible": 0, "female_only": 0, "unknown": 0}
    elements = ct_data.get("elements", [])
    for el in elements:
        tags = el.get("tags") or {}
        value = (tags.get("changing_table") or "").strip()
        location = tags.get("changing_table:location")
        if value == "no":  # never a feature — coordinates irrelevant
            ct_no += 1
            continue
        if element_coords(el)[0] is None:
            continue  # build_features drops it, so we must not count it
        if centralkey_locked(tags.get("centralkey")):
            locked += 1  # would be a pin, but the door needs a Euro key
            continue
        if value == "yes":
            ct_yes += 1
            if location and location.strip():
                yes_location_known += 1
        elif value == "limited":
            ct_limited += 1
        status = classify(value, location)
        if status:
            status_counts[status] += 1
    toilets = toilets_data.get("elements", [])
    capacity = sum(1 for el in toilets
                   if any(k.startswith("toilets:num_chambers")
                          for k in (el.get("tags") or {})))
    return {
        "toilets_total": len(toilets), "ct_objects": len(elements),
        "ct_yes": ct_yes, "ct_no": ct_no, "ct_limited": ct_limited,
        "yes_location_known": yes_location_known,
        "yes_location_unknown": ct_yes - yes_location_known,
        "accessible": status_counts["accessible"],
        "female_only": status_counts["female_only"],
        "unknown": status_counts["unknown"],
        "centralkey_locked": locked,
        "capacity_tagged_toilets": capacity,
    }


def global_stats(fetch=fetch_taginfo) -> dict:
    """The `global` stats block, from the taginfo API (key stats + the values
    list, paginated when >999 distinct values exist). Raises on any
    upstream failure — the caller decides how to degrade. *_only means the
    value is exactly that token; male_any counts every value containing a
    male_toilet token after ';'-splitting (so combos count once)."""
    key_stats = fetch(TAGINFO_STATS_URL)
    values = fetch(TAGINFO_VALUES_URL)
    ct_total = next((d.get("count", 0) for d in key_stats.get("data", [])
                     if d.get("type") == "all"), 0)
    # changing_table:location attracts free text, so the number of DISTINCT
    # values grows past rp=999 eventually. Follow the response's own `total`
    # (count of distinct values) across pages rather than silently
    # undercounting from page 1 alone. Page cap guards a bogus `total`.
    rows = list(values.get("data", []))
    distinct = values.get("total") or 0
    page = 1
    while len(rows) < distinct and page < 20:
        page += 1
        more = fetch(TAGINFO_VALUES_URL.replace("page=1", f"page={page}")).get("data", [])
        if not more:
            break
        rows.extend(more)
    if len(rows) < distinct:
        print(f"WARN: taginfo values truncated ({len(rows)} of {distinct} distinct "
              "values fetched) — location_total undercounts", file=sys.stderr)
    total = female_only = male_only = male_any = 0
    for row in rows:
        count = row.get("count", 0)
        toks = tokens(row.get("value"))
        total += count
        if toks == ["female_toilet"]:
            female_only += count
        if toks == ["male_toilet"]:
            male_only += count
        if "male_toilet" in toks:
            male_any += count
    return {
        "ct_total": ct_total, "location_total": total,
        "location_female_only": female_only, "location_male_only": male_only,
        "location_male_any": male_any,
        "source": "taginfo",
        "data_until": values.get("data_until") or key_stats.get("data_until"),
    }


def previous_global(stats_path: str) -> dict | None:
    """The `global` block of the last stats.json, or None — the taginfo-down
    fallback (stale global beats no global)."""
    try:
        return json.loads(Path(stats_path).read_text(encoding="utf-8")).get("global")
    except (OSError, ValueError):
        return None
