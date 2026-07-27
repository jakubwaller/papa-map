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

AREA_NAME = os.environ.get("PAPAMAP_AREA_NAME", "Hamburg")
AREA_ADMIN_LEVEL = os.environ.get("PAPAMAP_AREA_ADMIN_LEVEL", "4")

GEOJSON_PATH = os.environ.get("PAPAMAP_GEOJSON_PATH", "web/data/changing_tables.geojson")
STATS_PATH = os.environ.get("PAPAMAP_STATS_PATH", "web/data/stats.json")

TAGINFO_STATS_URL = ("https://taginfo.openstreetmap.org/api/4/key/stats"
                     "?key=changing_table")
TAGINFO_VALUES_URL = ("https://taginfo.openstreetmap.org/api/4/key/values"
                      "?key=changing_table:location&rp=999&page=1"
                      "&sortname=count&sortorder=desc")


def _area_ql(area_name: str | None, admin_level: str | None) -> str:
    area_name = area_name or AREA_NAME
    admin_level = admin_level or AREA_ADMIN_LEVEL
    return ('[out:json][timeout:90];'
            f'area["name"="{area_name}"]["admin_level"="{admin_level}"]->.a;')


def changing_table_ql(area_name: str | None = None, admin_level: str | None = None) -> str:
    """All objects carrying a changing_table tag (any value — `no` and junk
    values feed the stats even though only yes/limited become features)."""
    return _area_ql(area_name, admin_level) + 'nwr["changing_table"](area.a);out tags center;'


def toilets_ql(area_name: str | None = None, admin_level: str | None = None) -> str:
    """All amenity=toilets, tags only — counted for the honesty stat and
    scanned for toilets:num_chambers* capacity tags. No geometry needed."""
    return _area_ql(area_name, admin_level) + 'nwr["amenity"="toilets"](area.a);out tags;'
