"""The IANA time zone a place's opening_hours are meant in.

The popup's "Open now" badge used to read the device's clock, which is right
only while the reader and the place share a zone — and the map spans about
fifteen of them. The zone is a property of the place, so it is decided here,
next to the area that found the object, and published two ways (CONTRACT v80):
stats.json's `area_tz` names each swept area's default zone once, and a feature
carries its own `tz` only where the coordinate rules below disagree with that
default. Most areas lie in a single zone, so almost no feature carries one.

The rules are approximate on purpose: straight lines through the US Midwest,
the Australian outback and the Canadian north, not the legal boundaries. A
border town an hour off is accepted; a Tokyo café evaluated on Berlin's clock
was not. Zone names are plain strings — the pipeline image's Python may have
no tz database, and nothing here needs one; only the tests check the names.
"""
from __future__ import annotations

from .config import AREA_COUNTRY

# Every country key in config.COUNTRY_AREAS. For the chunked US and Canada the
# per-state AREA_TZ below decides; their entries here only cover a single-area
# build named by hand.
COUNTRY_TZ = {
    "de": "Europe/Berlin", "dk": "Europe/Copenhagen", "be": "Europe/Brussels",
    "nl": "Europe/Amsterdam", "at": "Europe/Vienna", "ch": "Europe/Zurich",
    "cz": "Europe/Prague", "pl": "Europe/Warsaw", "se": "Europe/Stockholm",
    "gb": "Europe/London", "fr": "Europe/Paris", "no": "Europe/Oslo",
    "fi": "Europe/Helsinki", "is": "Atlantic/Reykjavik", "ie": "Europe/Dublin",
    "ee": "Europe/Tallinn", "lv": "Europe/Riga", "lt": "Europe/Vilnius",
    "lu": "Europe/Luxembourg", "li": "Europe/Vaduz", "ad": "Europe/Andorra",
    "mc": "Europe/Monaco", "sm": "Europe/San_Marino", "mt": "Europe/Malta",
    "es": "Europe/Madrid", "pt": "Europe/Lisbon", "it": "Europe/Rome",
    "gr": "Europe/Athens", "cy": "Asia/Nicosia", "si": "Europe/Ljubljana",
    "sk": "Europe/Bratislava", "hu": "Europe/Budapest", "hr": "Europe/Zagreb",
    "ro": "Europe/Bucharest", "bg": "Europe/Sofia", "rs": "Europe/Belgrade",
    "ba": "Europe/Sarajevo", "me": "Europe/Podgorica", "al": "Europe/Tirane",
    "mk": "Europe/Skopje", "xk": "Europe/Belgrade", "md": "Europe/Chisinau",
    "ua": "Europe/Kiev", "by": "Europe/Minsk",
    "au": "Australia/Sydney", "nz": "Pacific/Auckland",
    "us": "America/New_York", "ca": "America/Toronto", "jp": "Asia/Tokyo",
}

# The dominant zone of every US state, DC and Canadian province / territory,
# keyed by config's display names. "Dominant" is where most people live:
# Kentucky is Eastern (Louisville, Lexington), Tennessee Central (Nashville,
# Memphis), Idaho Mountain (Boise); the coordinate rules move the rest.
AREA_TZ = {
    "Alabama": "America/Chicago", "Alaska": "America/Anchorage",
    "Arizona": "America/Phoenix", "Arkansas": "America/Chicago",
    "California": "America/Los_Angeles", "Colorado": "America/Denver",
    "Connecticut": "America/New_York", "Delaware": "America/New_York",
    "District of Columbia": "America/New_York", "Florida": "America/New_York",
    "Georgia": "America/New_York", "Hawaii": "Pacific/Honolulu",
    "Idaho": "America/Boise", "Illinois": "America/Chicago",
    "Indiana": "America/Indiana/Indianapolis", "Iowa": "America/Chicago",
    "Kansas": "America/Chicago", "Kentucky": "America/New_York",
    "Louisiana": "America/Chicago", "Maine": "America/New_York",
    "Maryland": "America/New_York", "Massachusetts": "America/New_York",
    "Michigan": "America/Detroit", "Minnesota": "America/Chicago",
    "Mississippi": "America/Chicago", "Missouri": "America/Chicago",
    "Montana": "America/Denver", "Nebraska": "America/Chicago",
    "Nevada": "America/Los_Angeles", "New Hampshire": "America/New_York",
    "New Jersey": "America/New_York", "New Mexico": "America/Denver",
    "New York": "America/New_York", "North Carolina": "America/New_York",
    "North Dakota": "America/Chicago", "Ohio": "America/New_York",
    "Oklahoma": "America/Chicago", "Oregon": "America/Los_Angeles",
    "Pennsylvania": "America/New_York", "Rhode Island": "America/New_York",
    "South Carolina": "America/New_York", "South Dakota": "America/Chicago",
    "Tennessee": "America/Chicago", "Texas": "America/Chicago",
    "Utah": "America/Denver", "Vermont": "America/New_York",
    "Virginia": "America/New_York", "Washington": "America/Los_Angeles",
    "West Virginia": "America/New_York", "Wisconsin": "America/Chicago",
    "Wyoming": "America/Denver",
    "Alberta": "America/Edmonton", "British Columbia": "America/Vancouver",
    "Manitoba": "America/Winnipeg", "New Brunswick": "America/Moncton",
    "Newfoundland and Labrador": "America/St_Johns",
    "Northwest Territories": "America/Edmonton", "Nova Scotia": "America/Halifax",
    "Nunavut": "America/Iqaluit", "Ontario": "America/Toronto",
    "Prince Edward Island": "America/Halifax", "Quebec": "America/Toronto",
    "Saskatchewan": "America/Regina", "Yukon": "America/Whitehorse",
}


def area_default_tz(area: str | None) -> str | None:
    """The zone a sweep area (or leaderboard city) mostly lies in, or None
    for an area config does not know."""
    if area is None:
        return None
    return AREA_TZ.get(area) or COUNTRY_TZ.get(AREA_COUNTRY.get(area))


def area_tz_table(areas) -> dict[str, str]:
    """stats.json's `area_tz`: {area: default zone} for the swept areas,
    leaving out any config does not know (a hand-named single-area build)."""
    table = {}
    for area in areas:
        tz = area_default_tz(area)
        if tz is not None:
            table[area] = tz
    return table


# The Queensland / New South Wales border east of 141°E, as (lon, lat)
# points: along 29°S to Mungindi, down the Barwon and Macintyre past
# Goondiwindi (QLD) and Boggabilla (NSW), the Dumaresq past Texas, up the
# range from Wallangarra to Killarney, and along the McPherson Range to
# Point Danger between Coolangatta (QLD) and Tweed Heads (NSW). Straight
# lines between them: a town right on the border can still land on the
# wrong side, the towns either side of it do not.
_QLD_BORDER = ((141.0, -29.0), (148.95, -29.0), (150.34, -28.575), (151.15, -28.93),
               (151.95, -28.97), (152.30, -28.36), (152.65, -28.32), (152.9, -28.28),
               (153.3, -28.26), (153.55, -28.17))


def _qld_border_lat(lon: float) -> float:
    pts = _QLD_BORDER
    if lon <= pts[0][0]:
        return pts[0][1]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if lon <= x1:
            return y0 + (lon - x0) / (x1 - x0) * (y1 - y0)
    return pts[-1][1]


def _australia(lat: float, lon: float) -> str | None:
    if lon < 129:
        return "Australia/Perth"
    if lon < 138 and lat > -26:
        return "Australia/Darwin"
    if lon < 141 and lat <= -26:
        return "Australia/Adelaide"
    # Queensland keeps no summer time.
    if (lon >= 138 and lat > -26) or (lon >= 141 and lat > _qld_border_lat(lon)):
        return "Australia/Brisbane"
    # Broken Hill, in New South Wales, keeps South Australia's clock.
    if -32.6 < lat < -31.0 and lon < 142.0:
        return "Australia/Broken_Hill"
    return None


def _nunavut(lat: float, lon: float) -> str | None:
    if lon < -102:
        return "America/Cambridge_Bay"
    if lon < -85:
        return "America/Rankin_Inlet"
    return None


def _british_columbia(lat: float, lon: float) -> str | None:
    # North of 53.8°N the province ends at 120°W, so the Peace River country
    # (Dawson Creek, Fort St. John, Chetwynd) and the Northern Rockies (Fort
    # Nelson), on UTC-7 all year, lie WEST of it; Mackenzie, at -123.1, is
    # Pacific.
    if lat > 57.5 and lon > -127.5:
        return "America/Fort_Nelson"
    if lat > 55.0 and lon > -122.5:
        return "America/Dawson_Creek"
    # Creston keeps Mountain Standard Time all year, unlike the rest of the
    # East Kootenay around it.
    if lat < 49.3 and -116.9 < lon < -116.2:
        return "America/Creston"
    # The East Kootenay and Golden are Mountain; the West Kootenay (Nelson,
    # Kaslo, Crawford Bay) is Pacific. South of 50.5°N the line runs down the
    # Purcells, east of Kootenay Lake; north of it, west of Golden.
    if lat < 51.5 and lon > (-117.3 if lat > 50.5 else -116.6):
        return "America/Edmonton"
    return None


def _denmark(lat: float, lon: float) -> str | None:
    if lat > 61 and lon < -5:
        return "Atlantic/Faroe"
    if lon < -10:
        return "America/Nuuk"
    return None


# area → rule(lat, lon) returning a zone, or None for "the area's default".
_RULES = {
    "Australia": _australia,
    "Spain": lambda lat, lon: "Atlantic/Canary" if lon < -13 and lat < 30 else None,
    "Portugal": lambda lat, lon: "Atlantic/Azores" if lon < -20 else None,
    "New Zealand": lambda lat, lon: "Pacific/Chatham" if lon < 0 else None,
    "Netherlands": lambda lat, lon: "America/Kralendijk" if lat < 20 else None,
    "Danmark": _denmark,
    "Florida": lambda lat, lon: "America/Chicago" if lon < -85.0 else None,
    "Texas": lambda lat, lon: "America/Denver" if lon < -104.9 else None,
    "Tennessee": lambda lat, lon: "America/New_York" if lon > -85.45 else "America/Chicago",
    "Kentucky": lambda lat, lon: "America/New_York" if lon > -85.95 else "America/Chicago",
    "Indiana": lambda lat, lon: ("America/Chicago"
                                 if lon < -86.9 and (lat > 41.0 or lat < 38.4) else None),
    "Michigan": lambda lat, lon: "America/Chicago" if lon < -87.7 and lat > 45.0 else None,
    "Nebraska": lambda lat, lon: "America/Denver" if lon < -101.0 else None,
    "Kansas": lambda lat, lon: "America/Denver" if lon < -101.5 else None,
    "South Dakota": lambda lat, lon: "America/Denver" if lon < -100.4 else None,
    "North Dakota": lambda lat, lon: ("America/Denver"
                                      if lon < -101.3 and lat < 47.3 else None),
    "Idaho": lambda lat, lon: "America/Los_Angeles" if lat > 45.5 else None,
    "Ontario": lambda lat, lon: "America/Winnipeg" if lon < -90.0 else None,
    "British Columbia": _british_columbia,
    "Newfoundland and Labrador": lambda lat, lon: ("America/Goose_Bay"
                                                   if lat > 51.7 else None),
    "Nunavut": _nunavut,
}


def zone_for(area: str | None, lat: float | None, lon: float | None) -> str | None:
    """The zone of a point found by `area`'s sweep: the area's default,
    refined by the coordinate rule of a multi-zone area. None only for an
    area config does not know."""
    default = area_default_tz(area)
    rule = _RULES.get(area) if area is not None else None
    if rule is None or lat is None or lon is None:
        return default
    return rule(lat, lon) or default


def tz_override(area: str | None, lat: float | None, lon: float | None) -> str | None:
    """The feature's `tz` property: its zone where that differs from the
    area's default in stats.json's `area_tz`, else None (and no property)."""
    zone = zone_for(area, lat, lon)
    return zone if zone != area_default_tz(area) else None
