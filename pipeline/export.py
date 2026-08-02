from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

from .classify import classify
from .osm import element_coords


PAPAMAP_THEME_URL = ("https://raw.githubusercontent.com/jakubwaller/papa-map/"
                     "main/theme/papamap.theme.json")


def _mapcomplete_url(amenity, osm_type, osm_id, lat, lon):
    """Deep link into MapComplete, landing next to the feature with the object
    preselected via the #<type>/<id> fragment (format per MapComplete's
    Docs/URL_Parameters.md). The official toilets theme only selects
    amenity=toilets; everything else (cafés, shops, ...) is covered by the
    second layer of our own theme, loaded via userlayout."""
    if amenity == "toilets":
        return f"https://mapcomplete.org/toilets?z=18&lat={lat}&lon={lon}#{osm_type}/{osm_id}"
    return (f"https://mapcomplete.org/theme.html?userlayout={PAPAMAP_THEME_URL}"
            f"&z=18&lat={lat}&lon={lon}#{osm_type}/{osm_id}")


def build_features(ct_data: dict) -> list[dict]:
    """GeoJSON features for changing_table=yes/limited objects with usable
    coordinates. `no` and junk values are dropped here (stats still see them)."""
    features = []
    for el in ct_data.get("elements", []):
        tags = el.get("tags") or {}
        value = (tags.get("changing_table") or "").strip()
        location = tags.get("changing_table:location")
        status = classify(value, location)
        if status is None:
            continue
        lat, lon = element_coords(el)
        if lat is None:
            continue
        osm_type, osm_id = el["type"], el["id"]
        amenity = tags.get("amenity")
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "osm_type": osm_type, "osm_id": osm_id,
                "name": tags.get("name"), "amenity": amenity,
                "changing_table": value, "location_raw": location,
                "status": status,
                # the table-specific fee wins over the venue-level fee tag
                "fee": tags.get("changing_table:fee") or tags.get("fee"),
                "opening_hours": tags.get("opening_hours"),
                "osm_url": f"https://www.openstreetmap.org/{osm_type}/{osm_id}",
                "mapcomplete_url": _mapcomplete_url(amenity, osm_type, osm_id, lat, lon),
            },
        })
    return features


def write_json_atomic(obj, out_path: str) -> None:
    """Write JSON via a temp file in the same directory + atomic rename, so a
    crash mid-write never leaves a half-written file for the site to serve.
    The temp name is unique (mkstemp) so two overlapping runs — nightly cron
    plus a manual `python -m pipeline.run` — can't publish each other's
    half-written file; fsync before the rename so a power cut can't atomically
    publish an empty/truncated file."""
    path = Path(out_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=path.name + ".", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(json.dumps(obj, ensure_ascii=False))
            fh.flush()
            os.fsync(fh.fileno())
        os.chmod(tmp, 0o644)  # mkstemp creates 0600 — unreadable to the web server
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def export_geojson(features: list[dict], out_path: str) -> int:
    write_json_atomic({"type": "FeatureCollection", "features": features}, out_path)
    return len(features)


def export_stats(stats: dict, out_path: str) -> None:
    write_json_atomic(stats, out_path)
