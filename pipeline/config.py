from __future__ import annotations

import os

USER_AGENT = "papa-map/0.1 (+https://papamap.de; papamap@jakubwaller.eu)"

OVERPASS_URL = os.environ.get("OVERPASS_URL", "https://overpass-api.de/api/interpreter")
# Mirrors tried in order until one returns data — a single flaky/overloaded
# instance (the 406/504 the main balancer hands back under load) no longer
# fails the whole build. Override the whole list with a comma-separated
# OVERPASS_URLS.
OVERPASS_URLS = [u.strip() for u in os.environ.get(
    "OVERPASS_URLS",
    ",".join((
        OVERPASS_URL,
        "https://overpass.private.coffee/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
    )),
).split(",") if u.strip()]
OVERPASS_RETRIES = int(os.environ.get("PAPAMAP_OVERPASS_RETRIES", "3"))
# Congested evenings 504 (or proxy-kill) for minutes at a stretch, not
# seconds — 5s·2^n rides that out where the old 2s·2^n just burned attempts.
OVERPASS_BACKOFF_S = float(os.environ.get("PAPAMAP_OVERPASS_BACKOFF_S", "5"))

# Germany-wide is ~13k changing_table + ~32k toilet objects (2026-07-30), but a
# single all-Germany area query computes for >60 s before the first response
# byte — and something in the network path (router/LB idle timeout, observed
# identically against two independent mirrors) kills exactly such connections.
# So the sweep is chunked per Bundesland: 16 small queries like the v0 Hamburg
# one (the largest, Bayern, measured 23 s), merged and deduped in run.py.
AREA_NAME = os.environ.get("PAPAMAP_AREA_NAME")  # set → single-area build
AREA_ADMIN_LEVEL = os.environ.get("PAPAMAP_AREA_ADMIN_LEVEL", "4")
DISPLAY_AREA_OVERRIDE = os.environ.get("PAPAMAP_DISPLAY_AREA")

BUNDESLAENDER = (
    "Baden-Württemberg", "Bayern", "Berlin", "Brandenburg", "Bremen",
    "Hamburg", "Hessen", "Mecklenburg-Vorpommern", "Niedersachsen",
    "Nordrhein-Westfalen", "Rheinland-Pfalz", "Saarland", "Sachsen",
    "Sachsen-Anhalt", "Schleswig-Holstein", "Thüringen",
)

# Sweep areas per country. Germany needs the 16-Land chunking above; Denmark
# is small enough to answer whole (933 changing_table + 4,655 amenity=toilets
# objects, one 14.5 s query measured 2026-08-04) and so sweeps as a single
# admin_level=2 area. That relation is Denmark proper — Grønland and Føroyar
# carry their own admin_level=2 relations and stay out, which the measured
# feature bbox (54.7–57.7 N) confirms.
COUNTRY_AREAS = {
    "de": tuple((name, "4") for name in BUNDESLAENDER),
    "dk": (("Danmark", "2"),),
}

# Fallback display name per country — each in its own language, since the
# joined label has no single reader. The frontend translates it properly via
# area_key and only falls back to this string when it has no translation.
COUNTRY_LABELS = {"de": "Deutschland", "dk": "Danmark"}

# Comma-separated subset for a cheaper build (PAPAMAP_COUNTRIES=dk builds
# Denmark alone in ~30 s instead of sweeping all 17 areas).
SWEEP_COUNTRIES = tuple(c.strip().lower() for c in os.environ.get(
    "PAPAMAP_COUNTRIES", "de,dk").split(",") if c.strip())


def _validated_countries() -> tuple[str, ...]:
    """SWEEP_COUNTRIES, refusing unknown codes — a typo'd PAPAMAP_COUNTRIES
    must fail the build loudly, not silently sweep fewer areas."""
    unknown = [c for c in SWEEP_COUNTRIES if c not in COUNTRY_AREAS]
    if unknown or not SWEEP_COUNTRIES:
        raise ValueError(
            f"PAPAMAP_COUNTRIES={','.join(SWEEP_COUNTRIES)!r}: unknown country "
            f"code(s) {unknown or ['(empty)']} — known: {sorted(COUNTRY_AREAS)}")
    return SWEEP_COUNTRIES


def sweep_areas() -> list[tuple[str, str]]:
    """(name, admin_level) pairs the pipeline sweeps. PAPAMAP_AREA_NAME set →
    just that one area (e.g. Hamburg/4 for a city build); default is all 16
    Bundesländer plus Denmark."""
    if AREA_NAME:
        return [(AREA_NAME, AREA_ADMIN_LEVEL)]
    return [area for c in _validated_countries() for area in COUNTRY_AREAS[c]]


def display_area() -> tuple[str, str | None]:
    """(name, i18n key) for the stats strip. The key ("de_dk", "dk", …) lets
    the frontend print the area in the reader's own language; it is None for a
    build whose area was named by hand, where no translation can exist."""
    override = DISPLAY_AREA_OVERRIDE or AREA_NAME
    if override:
        return override, None
    countries = _validated_countries()
    return (" & ".join(COUNTRY_LABELS[c] for c in countries),
            "_".join(countries))


# A congested evening can kill a query on every mirror (observed 2026-07-30:
# four Länder in, then all mirrors dead for minutes) — so beyond the per-query
# mirror cascade, run.py sweeps failed areas again in later rounds after a
# cool-down instead of aborting the 15 good fetches with them.
SWEEP_ROUNDS = int(os.environ.get("PAPAMAP_SWEEP_ROUNDS", "3"))
SWEEP_PAUSE_S = float(os.environ.get("PAPAMAP_SWEEP_PAUSE_S", "120"))

# The query budget stays under the observed 60 s cutoff so the server answers
# (even with a timeout remark) instead of the connection dying mid-compute; the
# HTTP timeout must outlive the server-side [timeout:...] or requests aborts a
# query the server was still happily computing.
OVERPASS_QL_TIMEOUT = int(os.environ.get("PAPAMAP_OVERPASS_QL_TIMEOUT", "55"))
OVERPASS_HTTP_TIMEOUT = int(os.environ.get(
    "PAPAMAP_OVERPASS_HTTP_TIMEOUT", str(OVERPASS_QL_TIMEOUT + 60)))

GEOJSON_PATH = os.environ.get("PAPAMAP_GEOJSON_PATH", "web/data/changing_tables.geojson")
STATS_PATH = os.environ.get("PAPAMAP_STATS_PATH", "web/data/stats.json")

# One static page per Bundesland, regenerated by every full build (pipeline/
# pages.py). Both values are public URLs — changing PAGES_BASE_PATH changes 17
# indexed addresses, so it also means updating web/sitemap.xml and the footer
# link in web/index.html. The trailing slash is part of it.
SITE_BASE_URL = os.environ.get("PAPAMAP_SITE_BASE_URL", "https://papamap.de").rstrip("/")
PAGES_BASE_PATH = "/wickeltische/"
PAGES_DIR = os.environ.get("PAPAMAP_PAGES_DIR", "web/wickeltische")

TAGINFO_STATS_URL = ("https://taginfo.openstreetmap.org/api/4/key/stats"
                     "?key=changing_table")
TAGINFO_VALUES_URL = ("https://taginfo.openstreetmap.org/api/4/key/values"
                      "?key=changing_table:location&rp=999&page=1"
                      "&sortname=count&sortorder=desc")


def _area_ql(area_name: str, admin_level: str) -> str:
    return (f'[out:json][timeout:{OVERPASS_QL_TIMEOUT}];'
            f'area["name"="{area_name}"]["admin_level"="{admin_level}"]->.a;')


def changing_table_ql(area_name: str = "Deutschland", admin_level: str = "2") -> str:
    """All objects carrying a changing_table tag (any value — `no` and junk
    values feed the stats even though only yes/limited become features)."""
    return _area_ql(area_name, admin_level) + 'nwr["changing_table"](area.a);out tags center;'


def toilets_ql(area_name: str = "Deutschland", admin_level: str = "2") -> str:
    """All amenity=toilets, tags only — counted for the honesty stat and
    scanned for toilets:num_chambers* capacity tags. No geometry needed."""
    return _area_ql(area_name, admin_level) + 'nwr["amenity"="toilets"](area.a);out tags;'
