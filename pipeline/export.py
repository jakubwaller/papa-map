from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

from .classify import central_key, classify, has_play_area, wheelchair_state
from .osm import element_coords


PAPAMAP_THEME_URL = ("https://raw.githubusercontent.com/jakubwaller/papa-map/"
                     "main/theme/papamap.theme.json")
# The day every pin on the site started opening this theme (PRs #19/#20,
# deployed 2026-08-13). No changeset saved through the site before it carries
# the theme tag, so a per-day count reaching back to this date is the whole
# story — the ops page may call its sum "all time".
THEME_LIVE_SINCE = "2026-08-13"


def _mapcomplete_url(osm_type, osm_id, lat, lon):
    """Deep link into MapComplete, landing next to the feature with the object
    preselected via the #<type>/<id> fragment (format per MapComplete's
    Docs/URL_Parameters.md). Always our own theme via userlayout — its
    dad_toilet layer covers amenity=toilets too, and edits made through it
    carry theme=papamap in the changeset, so website contributions stay
    countable (the official toilets theme would tag them theme=toilets,
    indistinguishable from any other MapComplete user)."""
    return (f"https://mapcomplete.org/theme.html?userlayout={PAPAMAP_THEME_URL}"
            f"&z=18&lat={lat}&lon={lon}#{osm_type}/{osm_id}")


def build_features(ct_data: dict) -> list[dict]:
    """GeoJSON features for changing_table=yes/limited objects with usable
    coordinates. `no` and junk values are dropped here (stats still see them).

    Key-locked objects (classify.central_key) are emitted too, since v26, with
    `key` naming the key system; everything else carries `key: null`. They
    are not pins: the frontend hides them unless the wheelchair chip is on,
    and run.py hands only the `key: null` features to the area pages and the
    leaderboard, so no count anywhere grows by them. Their `status` is the
    room rule alone — the door is what the key locks, not the room behind
    it."""
    features = []
    for el in ct_data.get("elements", []):
        tags = el.get("tags") or {}
        value = (tags.get("changing_table") or "").strip()
        location = tags.get("changing_table:location")
        key = central_key(tags, location)
        status = classify(value, location, None if key else tags)
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
                # Free: the sweep already asks for every tag on these objects,
                # so the play corner costs no extra Overpass query.
                "play": has_play_area(tags),
                # Free for the same reason. Tri-state or null, shown verbatim
                # in the popup; only wheelchair=yes drives a filter.
                "wheelchair": wheelchair_state(tags),
                "toilets_wheelchair": wheelchair_state(tags, "toilets:wheelchair"),
                "wheelchair_description": tags.get("wheelchair:description"),
                "key": key,
                # the table-specific fee wins over the venue-level fee tag
                "fee": tags.get("changing_table:fee") or tags.get("fee"),
                "opening_hours": tags.get("opening_hours"),
                "osm_url": f"https://www.openstreetmap.org/{osm_type}/{osm_id}",
                "mapcomplete_url": _mapcomplete_url(osm_type, osm_id, lat, lon),
            },
        })
    return features


# What the object *is*, most specific first — a shopping centre is both
# shop=mall and building=retail, and only the first says anything useful. Used
# for the popup subtitle; None when the object is tagged in none of them.
KIND_KEYS = ("leisure", "amenity", "shop", "tourism", "healthcare")


def build_play_features(play_data: dict, ct_data: dict | None = None) -> list[dict]:
    """GeoJSON features for places that record an indoor play area and are not
    pins — the prospecting list, and a strictly different dataset from the
    pins.

    These are not a fourth status. A pin is a place where a table is *known* to
    exist and the only open question is which room; here either nobody has
    answered the first question, so there is no color to give them and
    nothing to say about a dad's chances — or (v27) somebody answered it with
    `changing_table=no`, which is no color either: red would tell a mother
    there is a table for her. What both have is the one thing that gets a
    father through the door with a toddler, which makes the first the
    best-targeted list of places worth asking about — the popup's MapComplete
    link opens on exactly that question — and the second worth a visit anyway.

    The two are told apart by `changing_table`: `"no"` for the answered ones
    (they come from `ct_data`, the sweep's changing_table half, which build_
    features drops), `None` for the open questions (from `play_data`). Any
    other value is a pin or junk, never a place."""
    features = []
    elements = list(play_data.get("elements", [])) + list((ct_data or {}).get("elements", []))
    for el in elements:
        tags = el.get("tags") or {}
        # Applied here as well as in osm.split_sweep, the same way
        # build_features re-applies classify(): what a file contains must be
        # decided by the exporter, not by whoever assembled its input.
        value = (tags.get("changing_table") or "").strip()
        if value not in ("", "no") or not has_play_area(tags):
            continue
        lat, lon = element_coords(el)
        if lat is None:
            continue
        osm_type, osm_id = el["type"], el["id"]
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "osm_type": osm_type, "osm_id": osm_id,
                "name": tags.get("name"),
                "kind": next((tags[k] for k in KIND_KEYS if tags.get(k)), None),
                # "no" or None — see the docstring; never anything else.
                "changing_table": value or None,
                "opening_hours": tags.get("opening_hours"),
                "osm_url": f"https://www.openstreetmap.org/{osm_type}/{osm_id}",
                "mapcomplete_url": _mapcomplete_url(osm_type, osm_id, lat, lon),
            },
        })
    return features


def write_text_atomic(text: str, out_path: str) -> None:
    """Write text via a temp file in the same directory + atomic rename, so a
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
            fh.write(text)
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


def write_json_atomic(obj, out_path: str) -> None:
    write_text_atomic(json.dumps(obj, ensure_ascii=False), out_path)


def export_geojson(features: list[dict], out_path: str) -> int:
    write_json_atomic({"type": "FeatureCollection", "features": features}, out_path)
    return len(features)


def export_stats(stats: dict, out_path: str) -> None:
    write_json_atomic(stats, out_path)
