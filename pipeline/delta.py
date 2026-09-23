from __future__ import annotations

import gzip
import io
import json
import os
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

import requests

from . import export
from .classify import PLAY_KEYS
from .config import GEOJSON_PATH, PLAY_GEOJSON_PATH, STATS_PATH

# A long-running follower, not the nightly sweep: it reads OSM's minutely
# replication diffs and turns the ones that matter into web/data/delta.json,
# so a reader's edit anywhere reaches every other reader within a few
# minutes instead of waiting for the 02:00 cron. The cron (pipeline.run)
# stays the reconciliation and the base this file resets against — nothing
# here writes OSM, and classification stays in pipeline.classify /
# pipeline.export, reused as-is (build_features / build_play_features), so
# the frontend never re-derives a status.
REPLICATION_BASE = "https://planet.openstreetmap.org/replication/minute"

# A descriptive UA, distinct from the Overpass one in config.USER_AGENT: this
# talks to planet.openstreetmap.org and api.openstreetmap.org, not Overpass.
DELTA_USER_AGENT = "papamap.de delta (+https://papamap.de)"

# web-data/private/ is never served (see docs/DEPLOY.md's private/ops.html) —
# the exact reason the delta follower's own bookkeeping lives there rather
# than under web/data/, which is served whole. Same override pattern as
# config.py's own PAPAMAP_* paths — the Dockerfile sets the others
# (PAPAMAP_GEOJSON_PATH etc.) to /out/*, and docker-compose.yml's `delta`
# service sets these two the same way, sharing the pipeline image's /out
# mount rather than needing one of its own.
STATE_PATH = os.environ.get("PAPAMAP_DELTA_STATE_PATH", "web-data/private/delta-state.json")
DELTA_PATH = os.environ.get("PAPAMAP_DELTA_PATH", "web/data/delta.json")

POLL_INTERVAL_S = float(os.environ.get("PAPAMAP_DELTA_POLL_S", "60"))
# "downtime... over 48h" in the design: past that, catching up minute by
# minute costs more than just rebasing on tonight's build.
MAX_GAP_H = float(os.environ.get("PAPAMAP_DELTA_MAX_GAP_H", "48"))

# The keys build_features/build_play_features care about, mirrored here only
# to decide whether a diff object is worth acting on at all — the same
# vocabulary classify.py reads (changing_table*, the play keys, the
# wheelchair keys) plus amenity=toilets, whose count feeds new_toilets_no_table.
WHEELCHAIR_KEYS = ("wheelchair", "toilets:wheelchair")


def is_relevant_tags(tags: dict) -> bool:
    """True when a diff object's *new* tags touch anything the pipeline
    reads. An object already in the base dataset is relevant regardless —
    that's a separate check in process_changes, because that's how a tag
    *removal* (the key vanishes from `tags` entirely) is still caught."""
    if any(k == "changing_table" or k.startswith("changing_table:") for k in tags):
        return True
    if any(k in tags for k in PLAY_KEYS):
        return True
    if tags.get("leisure") in ("indoor_play", "playground"):
        return True
    if tags.get("amenity") == "toilets":
        return True
    return any(k in tags for k in WHEELCHAIR_KEYS)


# ---- Replication state / diff fetch -----------------------------------------

def _seq_path(seq: int) -> str:
    s = f"{seq:09d}"
    return f"{s[0:3]}/{s[3:6]}/{s[6:9]}"


def parse_state_txt(text: str) -> dict:
    """`sequenceNumber=...` / `timestamp=2026-09-23T10\\:15\\:00Z` (the colons
    are Java-properties-escaped) -> {"seq": int, "timestamp": iso str}."""
    seq = ts = None
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("sequenceNumber="):
            seq = int(line.split("=", 1)[1])
        elif line.startswith("timestamp="):
            ts = line.split("=", 1)[1].replace("\\:", ":")
    return {"seq": seq, "timestamp": ts}


def fetch_state(seq: int | None = None, get=None) -> dict:
    """The top-level state.txt (current head) when seq is None, else the
    state of that one sequence — both 302 to S3, which `requests` follows by
    default."""
    get = get or requests.get
    url = (f"{REPLICATION_BASE}/state.txt" if seq is None
           else f"{REPLICATION_BASE}/{_seq_path(seq)}.state.txt")
    resp = get(url, headers={"User-Agent": DELTA_USER_AGENT}, timeout=30)
    resp.raise_for_status()
    return parse_state_txt(resp.text)


def fetch_osc(seq: int, get=None) -> bytes:
    """The gzipped .osc for one sequence, decompressed. 20-100 KB, ~0.05s to
    parse with iterparse (measured)."""
    get = get or requests.get
    url = f"{REPLICATION_BASE}/{_seq_path(seq)}.osc.gz"
    resp = get(url, headers={"User-Agent": DELTA_USER_AGENT}, timeout=60)
    resp.raise_for_status()
    return gzip.decompress(resp.content)


def parse_osc(fileobj) -> list[dict]:
    """One osmChange document -> a flat list of
    {action, type, id, version, timestamp, tags, lat?, lon?} — action is
    create/modify/delete, tags is {} for a bare <delete> (OSM diffs carry no
    tags there). Streamed with iterparse rather than a full DOM parse, which
    is what makes a 20-100 KB file ~0.05s (measured) rather than a full
    document build."""
    changes = []
    action = None
    for event, elem in ET.iterparse(fileobj, events=("start", "end")):
        if event == "start" and elem.tag in ("create", "modify", "delete"):
            action = elem.tag
        elif event == "end" and elem.tag in ("node", "way", "relation"):
            tags = {t.get("k"): t.get("v") for t in elem.findall("tag")}
            change = {
                "action": action,
                "type": elem.tag,
                "id": int(elem.get("id")),
                "version": int(elem.get("version")) if elem.get("version") else None,
                "timestamp": elem.get("timestamp"),
                "tags": tags,
            }
            if elem.tag == "node" and elem.get("lat") is not None and elem.get("lon") is not None:
                change["lat"] = float(elem.get("lat"))
                change["lon"] = float(elem.get("lon"))
            changes.append(change)
            elem.clear()
        elif event == "end" and elem.tag in ("create", "modify", "delete"):
            action = None
    return changes


def fetch_osm_full_centroid(osm_type: str, osm_id: int, get=None) -> tuple[float, float] | None:
    """A way/relation's diff entry carries no coordinates. Rare (a few a
    day, per the design) — only hit when the object isn't already in the
    base dataset (whose own coordinates are reused instead, see
    process_changes)."""
    if osm_type == "node":
        return None
    get = get or requests.get
    url = f"https://api.openstreetmap.org/api/0.6/{osm_type}/{osm_id}/full.json"
    resp = get(url, headers={"User-Agent": DELTA_USER_AGENT}, timeout=30)
    resp.raise_for_status()
    nodes = [el for el in resp.json().get("elements", []) if el.get("type") == "node"
             and "lat" in el and "lon" in el]
    if not nodes:
        return None
    lat = sum(n["lat"] for n in nodes) / len(nodes)
    lon = sum(n["lon"] for n in nodes) / len(nodes)
    return lat, lon


# ---- Base dataset (the nightly build's output, read back) ------------------

def _osm_url(osm_type: str, osm_id: int) -> str:
    return f"https://www.openstreetmap.org/{osm_type}/{osm_id}"


def _load_feature_collection(path: str) -> dict:
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return {f["properties"]["osm_url"]: f for f in data.get("features", [])}


def load_base_dataset(geojson_path: str = GEOJSON_PATH,
                      play_geojson_path: str = PLAY_GEOJSON_PATH) -> dict:
    """{"tables": {osm_url: feature}, "places": {osm_url: feature}} from the
    nightly build's own output — the authority on both "which objects are
    already pins" (for tag-removal and delete detection) and their
    coordinates (for a way/relation that doesn't carry its own)."""
    return {"tables": _load_feature_collection(geojson_path),
            "places": _load_feature_collection(play_geojson_path)}


# web-data/private/areas-bbox.json (never served, same directory as
# delta-state.json): one padded bbox per sweep area, written by the nightly
# build (pipeline.run.area_bboxes/compute_area_bboxes) from that area's own
# features — real per-area coverage rather than one box around the whole
# dataset. Missing on a fresh clone (no nightly build has run yet); run_tick
# falls back to dataset_bbox below and logs why, per the design.
AREAS_BBOX_PATH = os.environ.get("PAPAMAP_AREAS_BBOX_PATH", "web-data/private/areas-bbox.json")
# Grown from an area's own features' extent (compute_area_bboxes) — generous
# enough for an edit just outside a sweep area's own admin boundary (the
# Overpass area query already includes some of that), not for a whole
# neighbouring country the way dataset_bbox's 2 degrees has to be.
AREA_BBOX_PAD_DEG = 0.2


def compute_area_bboxes(elements_with_area, pad_deg: float = AREA_BBOX_PAD_DEG) -> dict:
    """`elements_with_area`: an iterable of (lat, lon, area_name) — every
    changing-table and play-place object the nightly sweep found, each
    already knowing which area it came from (pipeline.run's ct_area/
    play_area, the same per-area sweep authority the pages and the
    leaderboard use). Returns {area_name: [min_lon, min_lat, max_lon,
    max_lat]}, padded. An entry with no usable coordinates or no area is
    skipped, never crashes the build."""
    boxes: dict[str, list[float]] = {}
    for lat, lon, area in elements_with_area:
        if lat is None or lon is None or not area:
            continue
        b = boxes.setdefault(area, [lon, lat, lon, lat])
        b[0], b[1] = min(b[0], lon), min(b[1], lat)
        b[2], b[3] = max(b[2], lon), max(b[3], lat)
    return {area: [b[0] - pad_deg, b[1] - pad_deg, b[2] + pad_deg, b[3] + pad_deg]
            for area, b in boxes.items()}


def load_area_bboxes(path: str = AREAS_BBOX_PATH) -> dict | None:
    """The nightly build's per-area boxes, or None when the file doesn't
    exist yet (a fresh clone before the first new-format nightly build) or
    fails to parse — the caller logs and falls back to dataset_bbox."""
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) and data else None


def dataset_bbox(base_dataset: dict, pad_deg: float = 2.0) -> tuple | None:
    """A bounding box around every object the base dataset already has —
    the fallback used only while web-data/private/areas-bbox.json does not
    exist yet (a fresh clone, or a checkout that has not rebuilt since this
    file started being written): config.py has no real per-country polygons
    on hand either way, so this coarser approximation stands in until the
    next nightly build produces real per-area boxes. Padded by pad_deg (~2
    degrees, generous next to a Bundesland). None (no filtering) when the
    dataset is empty, e.g. right after a fresh clone."""
    lons, lats = [], []
    for group in base_dataset.values():
        for f in group.values():
            lon, lat = f["geometry"]["coordinates"]
            lons.append(lon)
            lats.append(lat)
    if not lons:
        return None
    return (min(lons) - pad_deg, min(lats) - pad_deg,
            max(lons) + pad_deg, max(lats) + pad_deg)


def in_bbox(lon: float, lat: float, bbox: tuple | None) -> bool:
    if bbox is None:
        return True
    min_lon, min_lat, max_lon, max_lat = bbox
    return min_lon <= lon <= max_lon and min_lat <= lat <= max_lat


def in_any_bbox(lon: float, lat: float, boxes) -> bool:
    """True when (lon, lat) falls inside at least one of `boxes` (an
    iterable of 4-tuples/lists). Empty or None -> no filtering, the same
    'nothing to compare against, let it through' rule a single missing
    dataset_bbox already followed."""
    if not boxes:
        return True
    return any(in_bbox(lon, lat, tuple(b)) for b in boxes)


def read_data_base(stats_path: str = STATS_PATH) -> str | None:
    """The DATA timestamp the nightly build is reconciled to — `data_base`
    (pipeline.run, the minimum osm3s.timestamp_osm_base across the night's
    Overpass queries), falling back to `generated_at` (the BUILD time, which
    can lag the data by a day per Overpass — CLAUDE.md) only for a stats.json
    written before this field existed."""
    try:
        stats = json.loads(Path(stats_path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return stats.get("data_base") or stats.get("generated_at")


# ---- Where to (re)start -----------------------------------------------------

def _parse_iso(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def estimate_start_seq(base_iso: str, current_seq: int, current_ts_iso: str,
                       margin_min: int = 10) -> int:
    """current_seq - minutes_since_base - margin, per the design — one
    sequence is one minute of replication, so subtracting the elapsed
    minutes lands close to the base, and the margin plus the verification
    in find_start_seq cover the estimate being a little off."""
    minutes_since_base = max(0.0, (_parse_iso(current_ts_iso) - _parse_iso(base_iso)).total_seconds() / 60.0)
    return max(1, current_seq - int(minutes_since_base) - margin_min)


def find_start_seq(base_iso: str, fetch_state=fetch_state, max_backoff: int = 8,
                   backoff_step: int = 30) -> int:
    """estimate_start_seq, verified against that sequence's own .state.txt
    timestamp and walked further back while it still lands after the base —
    overlap into already-reconciled changes is harmless (the newest object
    version wins), landing after the base is not (a missed edit)."""
    current = fetch_state()
    seq = estimate_start_seq(base_iso, current["seq"], current["timestamp"])
    base_dt = _parse_iso(base_iso)
    for _ in range(max_backoff):
        st = fetch_state(seq)
        if not st.get("timestamp") or _parse_iso(st["timestamp"]) <= base_dt:
            break
        seq = max(1, seq - backoff_step)
    return seq


# ---- Turning diff objects into features, with the nightly build's own code -

def process_changes(changes: list[dict], base_dataset: dict, area_boxes=None,
                    coord_fetch=None) -> list[tuple]:
    """changes (parse_osc's shape) -> a list of (osm_url, kind, feature_or_none)
    events, kind in {"table", "place", "toilet_no_table"}, feature_or_none
    being None for a removal. Features are built with export.build_features /
    export.build_play_features — the exact functions the nightly build
    calls — never a re-derivation of status here. `area_boxes`: an iterable
    of per-area bboxes (load_area_bboxes' values, or a single dataset_bbox
    wrapped in a list as the fallback) — a brand-new object is kept only
    inside at least one of them (in_any_bbox); an object already in the base
    dataset is always kept, box or no box."""
    events = []
    for ch in changes:
        osm_type, osm_id = ch["type"], ch["id"]
        url = _osm_url(osm_type, osm_id)
        was_table = url in base_dataset["tables"]
        was_place = url in base_dataset["places"]
        if ch["action"] == "delete":
            if was_table:
                events.append((url, "table", None))
            if was_place:
                events.append((url, "place", None))
            continue
        tags = ch.get("tags") or {}
        if not (is_relevant_tags(tags) or was_table or was_place):
            continue
        lat, lon = ch.get("lat"), ch.get("lon")
        if lat is None:
            ref = base_dataset["tables"].get(url) or base_dataset["places"].get(url)
            if ref:
                lon, lat = ref["geometry"]["coordinates"]
            elif coord_fetch:
                got = coord_fetch(osm_type, osm_id)
                if got:
                    lat, lon = got
        if lat is None or lon is None:
            continue  # no coordinate reachable — drop rather than guess
        if not (was_table or was_place) and not in_any_bbox(lon, lat, area_boxes):
            continue  # a brand-new object outside every covered sweep area
        el = {"type": osm_type, "id": osm_id, "tags": tags, "lat": lat, "lon": lon}
        table_feats = export.build_features({"elements": [el]})
        place_feats = export.build_play_features({"elements": [el]}, {"elements": []})
        table_feat = table_feats[0] if table_feats else None
        place_feat = place_feats[0] if place_feats else None
        for f in (table_feat, place_feat):
            if f is not None:
                f["properties"]["osm_version"] = ch.get("version")
                f["properties"]["edited_at"] = ch.get("timestamp")
        if table_feat is not None:
            events.append((url, "table", table_feat))
        elif was_table:
            events.append((url, "table", None))
        if place_feat is not None:
            events.append((url, "place", place_feat))
        elif was_place:
            events.append((url, "place", None))
        value = (tags.get("changing_table") or "").strip()
        if (tags.get("amenity") == "toilets" and table_feat is None and place_feat is None
                and value != "no"):
            events.append((url, "toilet_no_table",
                          {"osm_url": url, "lon": lon, "lat": lat, "t": ch.get("timestamp")}))
    return events


def new_accumulator() -> dict:
    return {"tables_upsert": {}, "tables_remove": set(),
            "places_upsert": {}, "places_remove": set(),
            "new_toilets_no_table": {}}


def apply_events(acc: dict, events: list[tuple]) -> dict:
    for url, kind, feat in events:
        if kind == "table":
            acc["tables_remove"].discard(url)
            if feat is None:
                acc["tables_upsert"].pop(url, None)
                acc["tables_remove"].add(url)
            else:
                acc["tables_upsert"][url] = feat
        elif kind == "place":
            acc["places_remove"].discard(url)
            if feat is None:
                acc["places_upsert"].pop(url, None)
                acc["places_remove"].add(url)
            else:
                acc["places_upsert"][url] = feat
        elif kind == "toilet_no_table":
            acc["new_toilets_no_table"][url] = feat
    return acc


def render_delta(acc: dict, base_iso: str, seq: int, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    return {
        "generated": now.isoformat(timespec="seconds"),
        "base": base_iso,
        "seq": seq,
        "tables": {"upsert": list(acc["tables_upsert"].values()),
                  "remove": sorted(acc["tables_remove"])},
        "places": {"upsert": list(acc["places_upsert"].values()),
                  "remove": sorted(acc["places_remove"])},
        "new_toilets_no_table": list(acc["new_toilets_no_table"].values()),
    }


def load_accumulator(delta_path: str, expected_base: str) -> dict:
    """Seeds the in-memory accumulator from the delta.json already on disk,
    so a restarted process picks up where it left off instead of losing
    everything accumulated since the base. Empty (fresh start) whenever the
    file is missing/unreadable or its base doesn't match — a new nightly
    base always starts empty, which is also the reset path."""
    acc = new_accumulator()
    try:
        data = json.loads(Path(delta_path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return acc
    if data.get("base") != expected_base:
        return acc
    for f in data.get("tables", {}).get("upsert", []):
        acc["tables_upsert"][f["properties"]["osm_url"]] = f
    for u in data.get("tables", {}).get("remove", []):
        acc["tables_remove"].add(u)
    for f in data.get("places", {}).get("upsert", []):
        acc["places_upsert"][f["properties"]["osm_url"]] = f
    for u in data.get("places", {}).get("remove", []):
        acc["places_remove"].add(u)
    for t in data.get("new_toilets_no_table", []):
        acc["new_toilets_no_table"][t["osm_url"]] = t
    return acc


def load_state(state_path: str) -> dict | None:
    try:
        return json.loads(Path(state_path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def save_state(state_path: str, state: dict) -> None:
    export.write_json_atomic(state, state_path)


def run_tick(state: dict | None, *, geojson_path: str = GEOJSON_PATH,
            play_geojson_path: str = PLAY_GEOJSON_PATH, stats_path: str = STATS_PATH,
            delta_path: str = DELTA_PATH, areas_bbox_path: str = AREAS_BBOX_PATH,
            fetch_state=fetch_state, fetch_osc=fetch_osc,
            coord_fetch=None, max_gap_h: float = MAX_GAP_H,
            now: datetime | None = None) -> tuple[dict, dict]:
    """One catch-up tick: process every sequence from state+1 up to the
    replication head, so downtime is caught up automatically. Returns
    (new_state, delta_dict). Raises on a hard failure (no data base yet,
    network down) — the caller (run_forever) is what keeps the last good
    delta.json and retries."""
    now = now or datetime.now(timezone.utc)
    base_iso = read_data_base(stats_path)
    if base_iso is None:
        raise RuntimeError("no data base yet — stats.json missing (build has not run)")
    base_dataset = load_base_dataset(geojson_path, play_geojson_path)
    area_boxes_by_name = load_area_bboxes(areas_bbox_path)
    if area_boxes_by_name is None:
        # First run before a new nightly build has written the file (a
        # fresh clone, or a checkout mid-upgrade) — log it and fall back to
        # one box around the whole loaded dataset, same as before this file
        # existed.
        print(f"  delta: {areas_bbox_path} not found yet — falling back to "
              "the whole dataset's own extent for new-object filtering",
              file=sys.stderr)
        single = dataset_bbox(base_dataset)
        area_boxes = [single] if single else None
    else:
        area_boxes = list(area_boxes_by_name.values())

    current = fetch_state()
    need_reset = state is None or state.get("base") != base_iso
    if not need_reset and current["seq"] - state["seq"] > max_gap_h * 60:
        need_reset = True

    if need_reset:
        start_seq = find_start_seq(base_iso, fetch_state=fetch_state)
        acc = new_accumulator()
        last_seq = start_seq - 1
    else:
        acc = load_accumulator(delta_path, base_iso)
        last_seq = state["seq"]

    for seq in range(last_seq + 1, current["seq"] + 1):
        raw = fetch_osc(seq)
        changes = parse_osc(io.BytesIO(raw))
        apply_events(acc, process_changes(changes, base_dataset, area_boxes=area_boxes, coord_fetch=coord_fetch))
        last_seq = seq

    delta = render_delta(acc, base_iso, last_seq, now=now)
    return {"seq": last_seq, "base": base_iso}, delta


def run_forever(poll_s: float = POLL_INTERVAL_S, state_path: str = STATE_PATH,
                delta_path: str = DELTA_PATH, **kwargs) -> None:
    """The `delta` compose service's entrypoint. Never crash-loops: a
    network error (or any other tick failure) is logged and the previous
    delta.json is left exactly as it was, retried next tick."""
    print(f"  delta: following {REPLICATION_BASE}, polling every {poll_s:.0f}s",
          file=sys.stderr)
    while True:
        try:
            state = load_state(state_path)
            new_state, delta = run_tick(state, delta_path=delta_path, **kwargs)
            export.write_json_atomic(delta, delta_path)
            save_state(state_path, new_state)
            print(f"  delta: seq {new_state['seq']} base {new_state['base']} — "
                  f"{len(delta['tables']['upsert'])} table(s), "
                  f"{len(delta['places']['upsert'])} place(s) upserted", file=sys.stderr)
        except Exception as exc:  # noqa: BLE001 — must never crash-loop
            print(f"  WARN delta tick failed, keeping last good delta.json: {exc}",
                  file=sys.stderr)
        time.sleep(poll_s)


def main() -> None:
    run_forever()


if __name__ == "__main__":
    main()
