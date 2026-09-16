"""Offline city basemaps for the store app: one PMTiles extract per city.

The app (app/) keeps a whole city's basemap on the phone. The tiles come from
the Protomaps daily planet build (https://build.protomaps.com/, CC0 / ODbL
data), cut to a city's box with `pmtiles extract`, which reads only the
bytes it needs over HTTP range requests — no planet download, about 20–100 MB
per city at zoom 14. The catalogue the app shows is `index.json` next to the
files. Weekly, not nightly: a basemap changes slowly and the Protomaps bucket
is meant for extracts, not for hammering (docs/DEPLOY.md has the cron).

The cities are the leaderboard's 62 (pipeline/config.CITY_AREAS_BY_COUNTRY),
each with a lon/lat box resolved once from Nominatim on 2026-09-16 and padded
by 0.01°. Hamburg's is the city, not the Land: the Land's box reaches Neuwerk
in the North Sea and would triple the file for a sandbank.

    python -m pipeline.tiles --out web-data/tiles            # all cities
    python -m pipeline.tiles --out web-data/tiles --only hamburg

The website never reads these: tile.openstreetmap.org stays the online
basemap, and its policy forbids caching it (web/sw.js). These files are a
different source under a different licence, downloaded on purpose.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import os
import subprocess
import urllib.request
from pathlib import Path

log = logging.getLogger(__name__)

BUILD_BASE = "https://build.protomaps.com/"
MAXZOOM = 14    # zoom 15 doubles the size (Hamburg 24 → 58 MB); vector tiles overzoom sharply
PMTILES_BIN = os.environ.get("PMTILES_BIN", "pmtiles")

# (slug, display name, country code, (west, south, east, north))
CITIES: tuple[tuple[str, str, str, tuple[float, float, float, float]], ...] = (
    ("berlin", "Berlin", "de", (13.08, 52.33, 13.77, 52.69)),
    ("hamburg", "Hamburg", "de", (9.72, 53.38, 10.34, 53.75)),
    ("munchen", "München", "de", (11.35, 48.05, 11.73, 48.26)),
    ("koln", "Köln", "de", (6.76, 50.82, 7.17, 51.09)),
    ("frankfurt-am-main", "Frankfurt am Main", "de", (8.46, 50.01, 8.81, 50.24)),
    ("stuttgart", "Stuttgart", "de", (9.03, 48.68, 9.33, 48.88)),
    ("dusseldorf", "Düsseldorf", "de", (6.68, 51.11, 6.95, 51.36)),
    ("leipzig", "Leipzig", "de", (12.23, 51.23, 12.55, 51.46)),
    ("dortmund", "Dortmund", "de", (7.29, 51.41, 7.65, 51.61)),
    ("essen", "Essen", "de", (6.88, 51.34, 7.15, 51.54)),
    ("dresden", "Dresden", "de", (13.57, 50.96, 13.98, 51.19)),
    ("nurnberg", "Nürnberg", "de", (10.98, 49.32, 11.29, 49.55)),
    ("duisburg", "Duisburg", "de", (6.62, 51.32, 6.84, 51.57)),
    ("bochum", "Bochum", "de", (7.09, 51.4, 7.36, 51.54)),
    ("wuppertal", "Wuppertal", "de", (7.0, 51.16, 7.32, 51.33)),
    ("bielefeld", "Bielefeld", "de", (8.37, 51.9, 8.67, 52.12)),
    ("bonn", "Bonn", "de", (7.01, 50.62, 7.22, 50.78)),
    ("munster", "Münster", "de", (7.46, 51.83, 7.78, 52.07)),
    ("karlsruhe", "Karlsruhe", "de", (8.27, 48.93, 8.55, 49.1)),
    ("mannheim", "Mannheim", "de", (8.4, 49.4, 8.6, 49.6)),
    ("augsburg", "Augsburg", "de", (10.75, 48.25, 10.97, 48.47)),
    ("wiesbaden", "Wiesbaden", "de", (8.1, 49.98, 8.4, 50.16)),
    ("bremen", "Bremen", "de", (8.47, 53.0, 9.0, 53.61)),
    ("hannover", "Hannover", "de", (9.59, 52.29, 9.93, 52.46)),
    ("kobenhavn", "København", "dk", (12.44, 55.6, 12.74, 55.74)),
    ("aarhus", "Aarhus", "dk", (9.94, 55.99, 10.4, 56.34)),
    ("odense", "Odense", "dk", (10.17, 55.28, 10.59, 55.49)),
    ("aalborg", "Aalborg", "dk", (9.38, 56.8, 10.4, 57.24)),
    ("brussels", "Brussels", "be", (4.23, 50.75, 4.49, 50.92)),
    ("antwerpen", "Antwerpen", "be", (4.21, 51.13, 4.52, 51.39)),
    ("gent", "Gent", "be", (3.57, 50.97, 3.86, 51.2)),
    ("amsterdam", "Amsterdam", "nl", (4.72, 52.27, 5.09, 52.44)),
    ("rotterdam", "Rotterdam", "nl", (4.37, 51.85, 4.61, 52.0)),
    ("den-haag", "Den Haag", "nl", (4.17, 52.0, 4.43, 52.15)),
    ("utrecht", "Utrecht", "nl", (4.96, 52.02, 5.21, 52.15)),
    ("wien", "Wien", "at", (16.17, 48.11, 16.59, 48.33)),
    ("graz", "Graz", "at", (15.34, 47.0, 15.54, 47.14)),
    ("linz", "Linz", "at", (14.24, 48.2, 14.42, 48.39)),
    ("zurich", "Zürich", "ch", (8.44, 47.31, 8.64, 47.44)),
    ("bern", "Bern", "ch", (7.28, 46.91, 7.51, 47.0)),
    ("basel", "Basel", "ch", (7.54, 47.51, 7.64, 47.6)),
    ("geneve", "Genève", "ch", (6.1, 46.17, 6.19, 46.24)),
    ("praha", "Praha", "cz", (14.21, 49.93, 14.72, 50.19)),
    ("brno", "Brno", "cz", (16.42, 49.1, 16.74, 49.3)),
    ("warszawa", "Warszawa", "pl", (20.84, 52.09, 21.28, 52.38)),
    ("krakow", "Kraków", "pl", (19.78, 49.96, 20.23, 50.14)),
    ("wroclaw", "Wrocław", "pl", (16.8, 51.03, 17.19, 51.22)),
    ("gdansk", "Gdańsk", "pl", (18.42, 54.26, 19.08, 54.59)),
    ("poznan", "Poznań", "pl", (16.72, 52.28, 17.08, 52.52)),
    ("stockholm", "Stockholm", "se", (17.75, 59.22, 18.21, 59.45)),
    ("goteborg", "Göteborg", "se", (11.22, 57.49, 12.25, 57.88)),
    ("malmo", "Malmö", "se", (12.71, 55.47, 13.16, 55.69)),
    ("london", "London", "gb", (-0.52, 51.28, 0.34, 51.7)),
    ("birmingham", "Birmingham", "gb", (-2.04, 52.37, -1.72, 52.62)),
    ("manchester", "Manchester", "gb", (-2.33, 53.33, -2.14, 53.55)),
    ("glasgow", "Glasgow", "gb", (-4.4, 55.77, -4.06, 55.94)),
    ("edinburgh", "Edinburgh", "gb", (-3.46, 55.81, -3.06, 56.01)),
    ("paris", "Paris", "fr", (2.21, 48.81, 2.48, 48.91)),
    ("marseille", "Marseille", "fr", (5.22, 43.16, 5.54, 43.4)),
    ("lyon", "Lyon", "fr", (4.76, 45.7, 4.91, 45.82)),
    ("toulouse", "Toulouse", "fr", (1.34, 43.52, 1.53, 43.68)),
    ("bordeaux", "Bordeaux", "fr", (-0.65, 44.8, -0.52, 44.93)),
)


def slugs() -> list[str]:
    return [c[0] for c in CITIES]


def latest_build(today: dt.date | None = None, probe=None) -> str:
    """The newest daily build that answers, as YYYYMMDD. Yesterday's is
    usually the newest complete one; walk back a week before giving up."""
    today = today or dt.date.today()
    probe = probe or _head_ok
    for back in range(1, 8):
        day = (today - dt.timedelta(days=back)).strftime("%Y%m%d")
        if probe(f"{BUILD_BASE}{day}.pmtiles"):
            return day
    raise RuntimeError("no Protomaps build answered in the last week")


def _head_ok(url: str) -> bool:
    req = urllib.request.Request(url, method="HEAD",
                                 headers={"User-Agent": "papamap-tiles (https://papamap.de)"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status == 200
    except Exception:
        return False


def extract_command(build: str, slug: str, bbox, out_dir: Path) -> list[str]:
    w, s, e, n = bbox
    return [PMTILES_BIN, "extract", f"{BUILD_BASE}{build}.pmtiles",
            str(out_dir / f"{slug}.pmtiles"),
            f"--bbox={w},{s},{e},{n}", f"--maxzoom={MAXZOOM}"]


def catalogue(out_dir: Path, build: str, generated: str | None = None) -> dict:
    """index.json: only the cities whose file is actually there."""
    cities = []
    for slug, name, cc, bbox in CITIES:
        f = out_dir / f"{slug}.pmtiles"
        if not f.exists():
            continue
        cities.append({"slug": slug, "name": name, "cc": cc, "bbox": list(bbox),
                       "bytes": f.stat().st_size, "maxzoom": MAXZOOM})
    return {"generated": generated or dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "build": build, "source": "Protomaps daily build, OpenStreetMap data",
            "cities": cities}


def run(out_dir: Path, only: list[str] | None = None, build: str | None = None) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    build = build or latest_build()
    wanted = set(only) if only else set(slugs())
    failed = []
    for slug, name, _cc, bbox in CITIES:
        if slug not in wanted:
            continue
        tmp = out_dir / f"{slug}.pmtiles.tmp"
        cmd = extract_command(build, slug, bbox, out_dir)
        cmd[3] = str(tmp)
        log.info("extracting %s (%s)", name, slug)
        try:
            subprocess.run(cmd, check=True, timeout=1800)
            tmp.replace(out_dir / f"{slug}.pmtiles")   # atomic: a download never sees a half file
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
            log.error("%s failed: %s", slug, exc)
            failed.append(slug)
            tmp.unlink(missing_ok=True)
    index = catalogue(out_dir, build)
    tmp_index = out_dir / "index.json.tmp"
    tmp_index.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    tmp_index.replace(out_dir / "index.json")
    log.info("catalogue: %d cities, build %s, failed: %s", len(index["cities"]), build, failed or "none")
    return index


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--only", nargs="*", help="city slugs (default: all)")
    ap.add_argument("--build", help="YYYYMMDD of the Protomaps build (default: newest)")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    unknown = set(a.only or []) - set(slugs())
    if unknown:
        ap.error(f"unknown city slugs: {sorted(unknown)}")
    run(a.out, a.only, a.build)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
