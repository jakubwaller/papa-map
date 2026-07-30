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
OVERPASS_BACKOFF_S = float(os.environ.get("PAPAMAP_OVERPASS_BACKOFF_S", "2"))

# Germany-wide is ~13k changing_table + ~32k toilet objects (2026-07-30), but a
# single all-Germany area query computes for >60 s before the first response
# byte — and something in the network path (router/LB idle timeout, observed
# identically against two independent mirrors) kills exactly such connections.
# So the sweep is chunked per Bundesland: 16 small queries like the v0 Hamburg
# one (the largest, Bayern, measured 23 s), merged and deduped in run.py.
AREA_NAME = os.environ.get("PAPAMAP_AREA_NAME")  # set → single-area build
AREA_ADMIN_LEVEL = os.environ.get("PAPAMAP_AREA_ADMIN_LEVEL", "4")
DISPLAY_AREA = os.environ.get("PAPAMAP_DISPLAY_AREA") or AREA_NAME or "Deutschland"

BUNDESLAENDER = (
    "Baden-Württemberg", "Bayern", "Berlin", "Brandenburg", "Bremen",
    "Hamburg", "Hessen", "Mecklenburg-Vorpommern", "Niedersachsen",
    "Nordrhein-Westfalen", "Rheinland-Pfalz", "Saarland", "Sachsen",
    "Sachsen-Anhalt", "Schleswig-Holstein", "Thüringen",
)


def sweep_areas() -> list[tuple[str, str]]:
    """(name, admin_level) pairs the pipeline sweeps. PAPAMAP_AREA_NAME set →
    just that one area (e.g. Hamburg/4 for a city build); default is all 16
    Bundesländer."""
    if AREA_NAME:
        return [(AREA_NAME, AREA_ADMIN_LEVEL)]
    return [(name, "4") for name in BUNDESLAENDER]


# The query budget stays under the observed 60 s cutoff so the server answers
# (even with a timeout remark) instead of the connection dying mid-compute; the
# HTTP timeout must outlive the server-side [timeout:...] or requests aborts a
# query the server was still happily computing.
OVERPASS_QL_TIMEOUT = int(os.environ.get("PAPAMAP_OVERPASS_QL_TIMEOUT", "55"))
OVERPASS_HTTP_TIMEOUT = int(os.environ.get(
    "PAPAMAP_OVERPASS_HTTP_TIMEOUT", str(OVERPASS_QL_TIMEOUT + 60)))

GEOJSON_PATH = os.environ.get("PAPAMAP_GEOJSON_PATH", "web/data/changing_tables.geojson")
STATS_PATH = os.environ.get("PAPAMAP_STATS_PATH", "web/data/stats.json")

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
