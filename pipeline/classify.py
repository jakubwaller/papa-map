from __future__ import annotations

# Rooms a dad can reach the table in. Token matching is EXACT, never substring:
# "female_toilet" *contains* "male_toilet", so a substring check would classify
# every women's-room table as dad-accessible.
ACCESSIBLE_TOKENS = {"male_toilet", "unisex_toilet", "dedicated_room", "room",
                     "wheelchair_toilet", "sales_area"}
FEMALE_TOKEN = "female_toilet"

# Only these changing_table values become map features; `no` (and junk like
# "02") count only in stats.
FEATURE_VALUES = {"yes", "limited"}


def centralkey_locked(centralkey: str | None) -> bool:
    """True when the object sits behind a central key system (`centralkey`
    tag present and not `no`). The Euro key and its siblings are issued only
    against proof of disability, so whatever room the table is in, the map's
    audience can't open the door."""
    return bool(centralkey) and centralkey.strip().lower() not in ("", "no")


def tokens(location: str | None) -> list[str]:
    """Split a changing_table:location value on ';' (the OSM list separator)
    into trimmed, lowercased tokens. None/empty -> no tokens."""
    if not location:
        return []
    return [t.strip().lower() for t in location.split(";") if t.strip()]


def classify(changing_table: str | None, location: str | None,
             centralkey: str | None = None) -> str | None:
    """Status of one OSM object: 'accessible' | 'female_only' | 'unknown', or
    None when the object is not a feature at all (changing_table not
    yes/limited, or locked behind a central key). Any accessible token wins;
    else an exact female_toilet token means female_only; else (no tag, free
    text, unrecognized) -> unknown."""
    if (changing_table or "").strip() not in FEATURE_VALUES:
        return None
    if centralkey_locked(centralkey):
        return None
    toks = tokens(location)
    if any(t in ACCESSIBLE_TOKENS for t in toks):
        return "accessible"
    if FEMALE_TOKEN in toks:
        return "female_only"
    return "unknown"
