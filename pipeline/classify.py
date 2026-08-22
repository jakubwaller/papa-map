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

# Values that affirm a kids' area, on `kids_area` or on its `:indoor` sub-key.
# The wiki defines kids_area as "Kids' area or Children's corner", `yes` as "an
# area where kids can play" and `designated` as a purpose-built one; `limited`
# is explicitly "toys are available, but no designated area", so it stays out
# along with `no`, `outdoor` and anything unrecognized.
PLAY_AREA_VALUES = {"yes", "indoor", "designated"}


def centralkey_locked(tags: dict, location: str | None = None) -> bool:
    """True when a central key system (`centralkey` tag present and not `no`)
    stands between the map's audience and the table. The Euro key, the UK's
    RADAR/NKS key and their siblings are issued only against proof of
    disability, so a door they gate is closed to most dads.

    The key locks the table when any of these holds:

      * `access=centralkey` — the key gates the whole object;
      * `changing_table:location` names only `wheelchair_toilet` — the table
        sits in the one cubicle such a key is for;
      * nothing scopes the key to a sub-part. A toilet block with open male
        and female sections plus a key-locked accessible cubicle is commonly
        mapped as ONE object (UK practice, raised by Robert Whittaker,
        22 Aug 2026); the tagging that says so is `wheelchair:access=centralkey`
        or `male=yes` / `female=yes`. Without it the key is taken to cover the
        object.

    Everything else with a `centralkey` tag is an ordinary feature — grey when
    nobody has recorded the room, which is the question the map then asks.

    `location` overrides the dict's `changing_table:location`, for callers
    that already hold the value separately (classify)."""
    if _v(tags, "centralkey") in ("", "no"):
        return False
    if _v(tags, "access") == "centralkey":
        return True
    if location is None:
        location = tags.get("changing_table:location")
    toks = tokens(location)
    if toks and all(t == "wheelchair_toilet" for t in toks):
        return True
    scoped = (_v(tags, "wheelchair:access") == "centralkey"
              or _v(tags, "male") == "yes" or _v(tags, "female") == "yes")
    return not scoped


def tokens(location: str | None) -> list[str]:
    """Split a changing_table:location value on ';' (the OSM list separator)
    into trimmed, lowercased tokens. None/empty -> no tokens."""
    if not location:
        return []
    return [t.strip().lower() for t in location.split(";") if t.strip()]


def _v(tags: dict, key: str) -> str:
    return (tags.get(key) or "").strip().lower()


def has_play_area(tags: dict) -> bool:
    """True when the object also offers an indoor place for the kid to play,
    by any of the four ways OSM records one:

      * `kids_area:indoor` in PLAY_AREA_VALUES — the wiki's documented way to
        say indoor, and the one that settles the question outright;
      * `kids_area` in PLAY_AREA_VALUES — the play corner of a cafe, restaurant,
        bakery or shop, which is the most-used tag by a distance. The value
        alone doesn't say indoor or outdoor, so an explicit
        `kids_area:indoor=no` overrules it;
      * `leisure=indoor_play` — a commercial indoor playground;
      * `leisure=playground` + `indoor=yes` — the same thing, mapped the other
        way round.

    This is a badge, never a status: an object without any of these tags is
    *unrecorded*, not "has no play area", so there is no third state to render
    and no call to action attached to its absence. `changing_table:location`
    can honestly show a grey pin because the object is known to have a table;
    here the silence covers ~13k pins and means nothing."""
    indoor_sub = _v(tags, "kids_area:indoor")
    if indoor_sub in PLAY_AREA_VALUES:
        return True
    # An explicit "the kids' area is not indoors" beats the ambiguous bare tag.
    if _v(tags, "kids_area") in PLAY_AREA_VALUES and indoor_sub != "no":
        return True
    leisure = _v(tags, "leisure")
    if leisure == "indoor_play":
        return True
    return leisure == "playground" and _v(tags, "indoor") == "yes"


def classify(changing_table: str | None, location: str | None,
             tags: dict | None = None) -> str | None:
    """Status of one OSM object: 'accessible' | 'female_only' | 'unknown', or
    None when the object is not a feature at all (changing_table not
    yes/limited, or locked behind a central key — see centralkey_locked, which
    reads the object's other tags, hence the optional dict). Any accessible token wins;
    else an exact female_toilet token means female_only; else (no tag, free
    text, unrecognized) -> unknown."""
    if (changing_table or "").strip() not in FEATURE_VALUES:
        return None
    if tags and centralkey_locked(tags, location):
        return None
    toks = tokens(location)
    if any(t in ACCESSIBLE_TOKENS for t in toks):
        return "accessible"
    if FEMALE_TOKEN in toks:
        return "female_only"
    return "unknown"
