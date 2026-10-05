"""Anomaly-gated ops check: `python -m pipeline.ops`, daily via cron after the
build. Quiet inbox = healthy — a mail goes out only on an anomaly (stale or
missing data, a big count drop) plus one weekly all-clear digest, so silence
longer than a week means the watcher itself is broken.

The check reads the same GEOJSON_PATH/STATS_PATH the build writes (same env),
keeps yesterday's per-feature statuses in a local state file, and reports the
day's dataset changes: new/removed features and status transitions — a
grey->green transition is somebody answering the room question on OSM.

Everything in the report is aggregate: dataset counts derived from public ODbL
OSM data, plus (optionally) Cloudflare's zone-level request totals and OSMCha
counts of changesets made through the site's own MapComplete theme and of
answers given on the map itself. No visitor-level data is read, stored or sent.

Mail goes out over plain SMTP submission (STARTTLS) — any provider that hands
out SMTP credentials works. Without PAPAMAP_SMTP_*/PAPAMAP_OPS_TO configured
the report only goes to stdout (the cron log) and the exit code still says
healthy/anomalous, so the check is useful before any mail is wired up.
"""
from __future__ import annotations

import json
import os
import re
import smtplib
import sys
from datetime import date, datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path

import requests

from . import appstats, ops_page
from .config import GEOJSON_PATH, STATS_PATH
from .export import PAPAMAP_THEME_URL, write_text_atomic

STATE_PATH = os.environ.get("PAPAMAP_OPS_STATE_PATH", "ops-state.json")
# The public ops page. Next to stats.json by default, because that directory
# is the one the served tree mounts back in (web-data/ -> /srv/data), so the
# page is reachable at /data/ops.html the moment it is written — and at
# /ops.html through the rewrite in deploy/papamap.Caddyfile. Empty string
# disables it.
OPS_HTML_PATH = os.environ.get(
    "PAPAMAP_OPS_HTML_PATH", str(Path(STATS_PATH).parent / "ops.html"))
# The private copy: the same page plus Cloudflare's zone-level request totals
# and their per-day history. Written into a private/ subdirectory so the
# served tree can mount it separately and gate it — see deploy/papamap.Caddyfile
# and docs/DEPLOY.md. Empty string disables it.
OPS_PRIVATE_HTML_PATH = os.environ.get(
    "PAPAMAP_OPS_PRIVATE_HTML_PATH",
    str(Path(STATS_PATH).parent / "private" / "ops.html"))
# The live-updates follower (pipeline/delta.py) writes delta.json next to
# stats.json and its private retry queue under private/; the ops service mounts
# the same directory, so the siblings are the right defaults. Empty string
# disables the live-updates check and section. The state file is optional:
# unreadable only means the pending count is unknown.
OPS_DELTA_PATH = os.environ.get(
    "PAPAMAP_OPS_DELTA_PATH", str(Path(STATS_PATH).parent / "delta.json"))
OPS_DELTA_STATE_PATH = os.environ.get(
    "PAPAMAP_OPS_DELTA_STATE_PATH",
    str(Path(STATS_PATH).parent / "private" / "delta-state.json"))
# The follower ticks every minute; half an hour without one at 07:30 means it
# is stuck or dead.
DELTA_STALE_AFTER_MIN = float(os.environ.get("PAPAMAP_OPS_DELTA_STALE_MIN", "30"))
# After a nightly build writes a new stats.json the follower needs a tick to
# rebase; a base mismatch inside this window is not an anomaly.
DELTA_REBASE_GRACE_MIN = 10
VISITS_HISTORY_DAYS = 400
# The per-day theme-changeset history, same idea as the visits history: kept
# far longer than any chart shows, because the state file is the only place
# the series exists at all.
EDITS_HISTORY_DAYS = 400
# How far back to ask Cloudflare for per-day figures. The free plan does NOT
# forget a day after a week: measured 2026-08-23, `httpRequests1dGroups` served
# every day back to this zone's first (2026-07-29, 26 rows). Fetch the whole
# window on every run, so the private page's history is Cloudflare's own and
# not just what this state file happened to catch. The `limit: 31` below is
# the ceiling — 30 complete days plus today.
CF_HISTORY_DAYS = 30
# ...but the mail digest still quotes a week, which is the number Jakub reads
# against last week's. Both come out of the same single request.
CF_REPORT_DAYS = 7
# history.json, the leaderboard's per-region counts. The build writes it next
# to stats.json in every layout (Dockerfile, config defaults), so the sibling
# is the right default here too — config.HISTORY_PATH's own default is the
# checkout's web/data/, which an ops.env that only overrides the stats path
# (the documented minimum) would miss.
OPS_HISTORY_PATH = os.environ.get(
    "PAPAMAP_HISTORY_PATH", str(Path(STATS_PATH).parent / "history.json"))
# The build cron's log, `>> pipeline.log` in the repo directory; read for the
# "last build" section, optional. Under Docker the ops service mounts it
# read-only (docker-compose.yml).
BUILD_LOG_PATH = os.environ.get("PAPAMAP_BUILD_LOG_PATH", "pipeline.log")
STALE_AFTER_H = float(os.environ.get("PAPAMAP_OPS_STALE_H", "48"))
DROP_ALERT_PCT = float(os.environ.get("PAPAMAP_OPS_DROP_PCT", "20"))
# The mirror image of DROP_ALERT_PCT, and it exists because the drop check on
# its own is one-sided. The dataset only ever jumps by a fifth for one reason —
# the sweep got wider (a country added to PAPAMAP_COUNTRIES) — and the digest
# reports that as "+4,200 new" mapping activity, then carries it inside the
# rolling 7-day total for a week. That is the one number the weekly all-clear
# exists to convey, so a quiet inbox would be actively misleading. Higher than
# the drop threshold: real mapping never does this, but a Land coming back
# after a failed night legitimately can.
JUMP_ALERT_PCT = float(os.environ.get("PAPAMAP_OPS_JUMP_PCT", "25"))
HISTORY_DAYS = 90
WEEKLY_DIGEST_WEEKDAY = 0  # Monday

CF_GRAPHQL_URL = "https://api.cloudflare.com/client/v4/graphql"
OSMCHA_URL = "https://osmcha.org/api/v1/changesets/"
WEB_CREATED_BY = "PapaMap"   # created_by on the changesets web/osm.js opens
# OSMCha's metadata filter is a JSONB scan over its whole changeset table, and
# what it costs is not ours to predict: the same query measured 21.9 s on
# 2026-08-13, over 150 s on 2026-08-18 (280 s to complete), and 0.5 s on
# 2026-08-19. That is variance in their service, not drift we could track —
# so the budget is deliberately far above any measurement rather than fitted
# to the last one, and the caller reports a timeout instead of hiding it.
# Nothing waits on this: it runs once a day, after the build.
OSMCHA_TIMEOUT_S = float(os.environ.get("PAPAMAP_OSMCHA_TIMEOUT_S", "300"))

STATUS_KEYS = ("accessible", "female_only", "unknown")


def load_json(path):
    """None on missing/unreadable/unparsable — every caller treats that as
    'not there', and the anomaly checks report it."""
    try:
        with open(path) as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def feature_statuses(geojson) -> dict[str, str]:
    """{'node/123': 'unknown', ...} — the per-feature snapshot diffed day over
    day. Falls back to empty on malformed input."""
    out: dict[str, str] = {}
    if not geojson or not isinstance(geojson.get("features"), list):
        return out
    for f in geojson["features"]:
        p = (f or {}).get("properties") or {}
        if p.get("osm_type") is None or p.get("osm_id") is None:
            continue
        # A table behind a central key rides in the file for the wheelchair
        # chip (v26) but is not a pin; the report counts what the map shows.
        if p.get("key"):
            continue
        out[f"{p['osm_type']}/{p['osm_id']}"] = p.get("status") or "unknown"
    return out


def counts_of(statuses: dict[str, str]) -> dict[str, int]:
    counts = {k: 0 for k in STATUS_KEYS}
    for s in statuses.values():
        counts[s if s in counts else "unknown"] += 1
    counts["total"] = len(statuses)
    return counts


def diff_statuses(prev: dict[str, str], cur: dict[str, str]) -> dict[str, int]:
    """New/removed features and status transitions since the last snapshot.
    to_accessible from another status is the mission metric: one of them is a
    changing-room question answered on OSM."""
    d = {"new": 0, "gone": 0, "to_accessible": 0, "to_female_only": 0,
         "to_unknown": 0}
    for key, status in cur.items():
        if key not in prev:
            d["new"] += 1
        elif prev[key] != status:
            d[f"to_{status if status in STATUS_KEYS else 'unknown'}"] += 1
    d["gone"] = sum(1 for key in prev if key not in cur)
    return d


def _parse_time(value):
    try:
        return datetime.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None


def _list_len(container, key) -> int:
    try:
        v = container[key]
    except (TypeError, KeyError, IndexError):
        return 0
    return len(v) if isinstance(v, list) else 0


def delta_summary(delta, delta_state, stats, now) -> dict | None:
    """What the ops check and page need to know about the live-updates
    follower, from delta.json, its state file and stats.json (each None when
    unreadable). None when there is no delta.json. Never raises."""
    if delta is None:
        return None
    if not isinstance(delta, dict):
        delta = {}
    generated = delta.get("generated")
    age_min = None
    parsed = _parse_time(generated) if isinstance(generated, str) else None
    if parsed is not None:
        try:
            age_min = (now - parsed).total_seconds() / 60
        except TypeError:  # naive vs aware
            age_min = None
    data_base = None
    if isinstance(stats, dict):
        data_base = stats.get("data_base") or stats.get("generated_at")
    base = delta.get("base")
    tables, places = delta.get("tables"), delta.get("places")
    pending = pending_oldest = pending_max = None
    entries = None
    if isinstance(delta_state, dict):
        # No key at all is an older follower: nothing queued.
        entries = delta_state.get("pending", [])
    if isinstance(entries, list):
        entries = [e for e in entries if isinstance(e, dict)]
        pending = len(entries)
        sinces = [e["since"] for e in entries if isinstance(e.get("since"), str)]
        attempts = [e["attempts"] for e in entries
                    if isinstance(e.get("attempts"), int)
                    and not isinstance(e.get("attempts"), bool)]
        pending_oldest = min(sinces) if sinces else None
        pending_max = max(attempts) if attempts else None
    return {
        "generated": generated, "age_min": age_min,
        "stale": age_min is None or age_min > DELTA_STALE_AFTER_MIN,
        "seq": delta.get("seq"), "base": base, "data_base": data_base,
        "base_ok": None if data_base is None else str(base) >= str(data_base),
        "tables_upsert": _list_len(tables, "upsert"),
        "tables_remove": _list_len(tables, "remove"),
        "places_upsert": _list_len(places, "upsert"),
        "places_remove": _list_len(places, "remove"),
        "toilets_no_table": (len(delta["new_toilets_no_table"])
                             if isinstance(delta.get("new_toilets_no_table"), list)
                             else 0),
        "pending": pending, "pending_oldest": pending_oldest,
        "pending_max_attempts": pending_max,
    }


def find_anomalies(stats, counts, last_counts, now, delta=None,
                   delta_expected=False) -> list[str]:
    """Human-readable anomaly lines; empty list = healthy. `counts`/`stats`
    are None when the corresponding file is missing. `delta` is
    delta_summary()'s dict; with `delta_expected` a missing or stale
    delta.json, or one based on an older dataset, is an anomaly too."""
    anomalies = []
    if stats is None:
        anomalies.append("stats.json is missing or unreadable")
    else:
        try:
            generated = datetime.fromisoformat(str(stats.get("generated_at")))
            age_h = (now - generated).total_seconds() / 3600
            if age_h > STALE_AFTER_H:
                anomalies.append(
                    f"dataset is stale: generated_at {stats['generated_at']} "
                    f"is {age_h:.0f}h old (limit {STALE_AFTER_H:.0f}h) — "
                    "cron or build broken?")
        except (TypeError, ValueError):
            anomalies.append(
                f"stats.json has no parsable generated_at "
                f"({stats.get('generated_at')!r})")
    if counts is None:
        anomalies.append("changing_tables.geojson is missing or unreadable")
    elif last_counts:
        for key, label in (("total", "feature count"),
                           ("accessible", "accessible count")):
            before, after = last_counts.get(key, 0), counts.get(key, 0)
            if before > 0 and after < before * (1 - DROP_ALERT_PCT / 100):
                anomalies.append(
                    f"{label} dropped {before} -> {after} "
                    f"(>{DROP_ALERT_PCT:.0f}%) — Overpass hiccup or "
                    "classification regression?")
            elif before > 0 and after > before * (1 + JUMP_ALERT_PCT / 100):
                anomalies.append(
                    f"{label} jumped {before} -> {after} "
                    f"(>{JUMP_ALERT_PCT:.0f}%) — sweep widened rather than "
                    "mapping activity? the 'since yesterday' and 7-day "
                    "figures below count the new area as new pins")
    if delta_expected:
        if delta is None:
            anomalies.append(
                "delta.json is missing or unreadable — is the live-updates "
                "follower running? (docker compose up -d delta)")
        elif delta["age_min"] is None:
            anomalies.append(
                f"delta.json has no parsable generated ({delta['generated']!r})")
        elif delta["stale"]:
            anomalies.append(
                f"live updates are stale: delta.json generated "
                f"{delta['generated']} is {delta['age_min']:.0f} min old "
                f"(limit {DELTA_STALE_AFTER_MIN:.0f} min) — follower stuck or "
                "dead? (docker logs papamap-delta)")
        if delta is not None and delta["base_ok"] is False:
            built = _parse_time((stats or {}).get("generated_at"))
            try:
                old = (built is None
                       or (now - built).total_seconds() / 60 > DELTA_REBASE_GRACE_MIN)
            except TypeError:
                old = True
            if old:
                anomalies.append(
                    f"delta.json base {delta['base']} is behind the dataset's "
                    f"data_base {delta['data_base']} — the follower has not "
                    "rebased on last night's build, readers ignore the delta "
                    "until it does")
    return anomalies


def _seq(v) -> str:
    return f"{v:,}" if isinstance(v, int) and not isinstance(v, bool) else str(v)


def render_report(counts, changes, history, anomalies, visits=None,
                  edits=None, delta=None, app_days=None, ratings=None) -> str:
    lines = []
    if anomalies:
        lines.append("ANOMALIES:")
        lines.extend(f"  - {a}" for a in anomalies)
        lines.append("")
    if counts:
        lines.append(
            f"dataset: {counts['total']} features — "
            f"{counts['accessible']} accessible / "
            f"{counts['female_only']} female-only / "
            f"{counts['unknown']} unknown")
    if changes is not None:
        lines.append(
            f"since yesterday: +{changes['new']} new, -{changes['gone']} gone, "
            f"{changes['to_accessible']} -> accessible, "
            f"{changes['to_female_only']} -> female-only, "
            f"{changes['to_unknown']} -> unknown")
    week = history[-7:]
    if week:
        lines.append(
            f"last {len(week)} days: "
            f"+{sum(e['changes']['new'] for e in week)} new, "
            f"{sum(e['changes']['to_accessible'] for e in week)} -> accessible, "
            f"{sum(e['changes']['to_female_only'] for e in week)} -> female-only")
    if edits and edits.get("error"):
        lines.append(
            f"edits via papamap theme (OSMCha, {edits['days']}d): "
            f"UNKNOWN — query failed ({edits['error']}). Not zero.")
    elif edits:
        lines.append(
            f"edits via papamap theme (OSMCha, {edits['days']}d): "
            f"{edits['changesets']} changesets")
        if "web_changesets" in edits:
            lines.append(
                f"answers on the map itself (OSMCha, created_by=PapaMap, "
                f"{edits['days']}d): {edits['web_changesets']} changesets")
    if delta:
        age = ("(age unknown)" if delta["age_min"] is None
               else f"({delta['age_min']:.0f} min ago)")
        pending = delta["pending"]
        lines.append(
            f"live updates: seq {_seq(delta['seq'])}, last tick "
            f"{delta['generated']} {age}, "
            f"+{delta['tables_upsert']}/-{delta['tables_remove']} tables, "
            f"+{delta['places_upsert']}/-{delta['places_remove']} places "
            "since the base"
            + (f", {pending} lookup(s) pending"
               if isinstance(pending, int) and pending > 0 else "")
            + (" — base BEHIND the dataset" if delta["base_ok"] is False
               else ""))
    if visits and visits["days"]:
        lines.append(
            f"visits (Cloudflare, {visits['days']}d): "
            f"{visits['requests']} requests, {visits['uniques']} uniques")
    # The store apps, from the state's per-day history: the last seven
    # recorded days of each store, each counted over the days it has.
    if app_days:
        week = sorted(app_days.items())[-7:]
        ios = [v["ios_downloads"] for _, v in week if "ios_downloads" in v]
        android = [v["android_installs"] for _, v in week
                   if "android_installs" in v]
        parts = []
        if ios:
            parts.append(f"{sum(ios)} App Store downloads ({len(ios)}d)")
        if android:
            parts.append(f"{sum(android)} Play installs ({len(android)}d)")
        if parts:
            lines.append("apps: " + ", ".join(parts))
    if ratings and ratings.get("total") is not None:
        lines.append(
            f"App Store ratings: {ratings['total']}"
            + (f", avg {ratings['avg']}" if ratings.get("avg") else "")
            + (f" (as of {ratings['as_of']})" if ratings.get("as_of") else ""))
    return "\n".join(lines) or "no data at all — nothing to report on"


def cf_visits(days=CF_HISTORY_DAYS, report_days=CF_REPORT_DAYS,
              now=None, post=requests.post):
    """Zone-level request/unique totals — aggregate only, no visitor data.
    Optional: needs CF_ANALYTICS_TOKEN (Analytics:Read, papamap zone only) and
    CF_ZONE_TAG; absent or failing, the report just omits the block."""
    token, zone = os.environ.get("CF_ANALYTICS_TOKEN"), os.environ.get("CF_ZONE_TAG")
    if not token or not zone:
        return None
    now = now or datetime.now(timezone.utc)
    query = """
      query($zone: String!, $since: String!) {
        viewer { zones(filter: {zoneTag: $zone}) {
          httpRequests1dGroups(limit: 31, filter: {date_geq: $since}) {
            dimensions { date } sum { requests } uniq { uniques } } } } }"""
    since = datetime.fromtimestamp(
        now.timestamp() - days * 86400, tz=timezone.utc).strftime("%Y-%m-%d")
    try:
        r = post(CF_GRAPHQL_URL, timeout=30,
                 headers={"Authorization": f"Bearer {token}"},
                 json={"query": query,
                       "variables": {"zone": zone, "since": since}})
        groups = r.json()["data"]["viewer"]["zones"][0]["httpRequests1dGroups"]
        # by_day is the whole fetched window and feeds the private page's
        # history; the totals are the mail's week. Today is excluded from the
        # totals — at 07:30 it is a third of a day and would drag the week
        # down — but kept out of by_day by merge_visits, not here.
        by_day = {g["dimensions"]["date"]: {
            "requests": g["sum"]["requests"],
            "uniques": g["uniq"]["uniques"]} for g in groups
            if g.get("dimensions", {}).get("date")}
        today = now.strftime("%Y-%m-%d")
        week = sorted(d for d in by_day if d < today)[-report_days:]
        return {"days": len(week),
                "requests": sum(by_day[d]["requests"] for d in week),
                "uniques": sum(by_day[d]["uniques"] for d in week),
                "by_day": by_day}
    except Exception as exc:  # visits are decoration — never fail the check
        print(f"WARN: Cloudflare analytics failed: {exc}", file=sys.stderr)
        return None


def osmcha_edits(days=7, now=None, get=requests.get):
    """Changesets saved through the site's own MapComplete theme — the
    attributable slice of the mission metric. MapComplete stamps a remote
    theme's changesets with theme=<the theme's URL> (DetermineTheme.ts:
    forcedId = link), so the filter is the exact URL every pin embeds;
    OSMCha's metadata filter matches case-insensitive substrings. Optional:
    needs OSMCHA_TOKEN (free account on osmcha.org, token under account
    settings); absent or failing, the report just omits the line. The count
    is aggregate — no mapper data is read or stored: the changesets come back
    as features, but only their dates are counted (by_day, the chart's
    series) and the rest is dropped on the floor."""
    token = os.environ.get("OSMCHA_TOKEN")
    if not token:
        return None
    now = now or datetime.now(timezone.utc)
    since = datetime.fromtimestamp(
        now.timestamp() - days * 86400, tz=timezone.utc).strftime("%Y-%m-%d")
    try:
        r = get(OSMCHA_URL, timeout=OSMCHA_TIMEOUT_S,
                headers={"Authorization": f"Token {token}"},
                params={"metadata": f"theme={PAPAMAP_THEME_URL}",
                        "date__gte": since, "page_size": "100"})
        data = r.json()
        out = {"days": days, "changesets": data["count"]}
        by_day = edits_by_day(data, since, now)
        if by_day is not None:
            out["by_day"] = by_day
        # The answers given on the map itself (web/osm.js) are the reader's
        # own changesets tagged created_by=PapaMap — a second slice, counted
        # on its own line and never folded into the theme's number, with a
        # per-day series of its own (web_by_day, the page's second chart;
        # kept since 2026-10-05, a count alone before that). The filter is
        # OSMCha's `editor` parameter, never `metadata=created_by=…`: OSMCha
        # stores created_by in its own `editor` column and drops it from the
        # metadata JSON (osmcha's changeset.py, set_fields), so a metadata
        # filter on that key matches nothing by construction — this line
        # read 0 from the day it shipped (2026-09-13) to 2026-10-05 while
        # the public OSM API listed PapaMap changesets in the same week.
        # `editor` is a case-insensitive substring match like the metadata
        # filter. Its own try, because it is a second query on a day the
        # first one already cost up to 150 s: a failure here drops this
        # line and says so, and never the theme count fetched a moment ago.
        try:
            r = get(OSMCHA_URL, timeout=OSMCHA_TIMEOUT_S,
                    headers={"Authorization": f"Token {token}"},
                    params={"editor": WEB_CREATED_BY,
                            "date__gte": since, "page_size": "100"})
            web = r.json()
            out["web_changesets"] = int(web["count"])
            web_by_day = edits_by_day(web, since, now)
            if web_by_day is not None:
                out["web_by_day"] = web_by_day
        except Exception as exc:
            print(f"WARN: OSMCha created_by query failed: {exc}", file=sys.stderr)
        return out
    except Exception as exc:  # like visits: decoration, never fail the check
        # Reported, not swallowed. A dropped line and a genuine zero both read
        # as "nobody edited through the site this week", and that is the one
        # number the digest exists to carry — so the failure says so out loud.
        print(f"WARN: OSMCha query failed: {exc}", file=sys.stderr)
        return {"days": days, "error": _short_exc(exc)}


def edits_by_day(data, since: str, now: datetime) -> dict | None:
    """{date: changesets} for every complete day the window covers, from one
    OSMCha page. Days without a changeset are 0, not absent — the chart has
    to tell 'zero edits' from 'never fetched'. Today is excluded (a partial
    day; tomorrow's window covers it whole). None when the answer is bigger
    than the page: a truncated grouping would under-draw days silently, and
    following pagination would repeat OSMCha's expensive JSONB scan — the
    dated total is still exact, only the per-day split waits."""
    if data.get("next"):
        print("WARN: OSMCha window exceeds one page; per-day counts "
              "skipped this run", file=sys.stderr)
        return None
    today = now.strftime("%Y-%m-%d")
    try:
        d = date.fromisoformat(since)
    except ValueError:
        return None
    counts: dict[str, int] = {}
    while d.isoformat() < today:
        counts[d.isoformat()] = 0
        d += timedelta(days=1)
    for f in data.get("features") or []:
        day = str((f.get("properties") or {}).get("date") or "")[:10]
        if day in counts:
            counts[day] += 1
    return counts


def merge_edits(kept: dict, edits: dict | None, key: str = "by_day") -> dict:
    """merge_visits' sibling for the per-day changeset counts: every complete
    day today's fetch covered overwrites the stored one (the fetch is
    OSMCha's fresher answer), capped and sorted. `key` names the series in
    the fetch — by_day for the theme, web_by_day for the answers given on
    the map itself. A fetch without it — failed, truncated, or token unset —
    changes nothing."""
    merged = dict(kept)
    for day, n in ((edits or {}).get(key) or {}).items():
        merged[day] = int(n)
    return dict(sorted(merged.items())[-EDITS_HISTORY_DAYS:])


def save_state(state_path: Path, state: dict) -> None:
    tmp = state_path.with_suffix(".tmp")
    tmp.write_text(json.dumps(state))
    tmp.replace(state_path)


def backfill_edits(days: int, state_path=None, now=None,
                   fetch=osmcha_edits) -> dict | None:
    """One wider OSMCha fetch merged into the state's per-day history, and
    nothing else touched: no snapshot diff, no history entry, no mail, no
    page. The daily fetch began on 2026-08-31 and looks a week back, so the
    history starts on 2026-08-25 while the theme has been live since
    THEME_LIVE_SINCE — run once with a window reaching back to the launch
    and the page's all-time tile becomes literally that. Same one-page limit
    as the daily fetch: a window beyond ~100 changesets returns its count
    but no split, and the history is left exactly as it was."""
    state_path = Path(state_path or STATE_PATH)
    edits = fetch(days=days, now=now or datetime.now(timezone.utc))
    if not edits:
        print("WARN: OSMCHA_TOKEN unset, nothing fetched", file=sys.stderr)
        return None
    if edits.get("error"):
        return edits  # osmcha_edits already said so on stderr
    state = load_json(state_path) or {"statuses": {}, "history": []}
    before = state.get("edits_days") or {}
    merged = merge_edits(before, edits)
    # The answers given on the map itself are a second series, filled the
    # same way when the fetch carried their count (and left alone when the
    # second query failed — that is not a window of zeros).
    web_before = state.get("web_edits_days") or {}
    web_merged = (merge_edits(web_before, edits, "web_by_day")
                  if "web_changesets" in edits else web_before)
    if merged != before:
        state["edits_days"] = merged
    if web_merged != web_before:
        state["web_edits_days"] = web_merged
    if merged != before or web_merged != web_before:
        save_state(state_path, state)
    when = (now or datetime.now(timezone.utc)).strftime("%Y-%m-%d")
    print(f"{edits['changesets']} changesets in the {days} days to {when}; "
          + _merge_summary(before, merged))
    if "web_changesets" in edits:
        print(f"{edits['web_changesets']} answers on the map itself in the "
              "same window; " + _merge_summary(web_before, web_merged))
    return edits


def _merge_summary(before: dict, merged: dict) -> str:
    """What a backfill did to one series, in the words the log keeps."""
    added = sorted(set(merged) - set(before))
    changed = sum(1 for d in before if d in merged and merged[d] != before[d])
    return ((f"{len(added)} days added ({added[0]} → {added[-1]})" if added
             else "no new days")
            + (f", {changed} recorded day{'s' if changed != 1 else ''} changed"
               if changed else "")
            + (f", history now {len(merged)} days" if added or changed
               else f", history unchanged at {len(merged)} days"))


def _short_exc(exc: Exception) -> str:
    """The readable core of an exception. requests buries the one useful
    phrase ("Read timed out. (read timeout=300)") inside connection-pool and
    URL boilerplate, and this line has to stay legible in an email subject."""
    text = (str(exc) or exc.__class__.__name__).split(" (Caused by")[0]
    text = re.sub(r"^HTTP[S]?ConnectionPool\([^)]*\):\s*", "", text.strip())
    return text[:80]


def send_mail(subject, body, smtp=smtplib.SMTP) -> bool:
    """Plain SMTP submission with STARTTLS (Proton SMTP token, Mailjet relay,
    anything). False = not configured or failed; the report is on stdout
    either way."""
    host = os.environ.get("PAPAMAP_SMTP_HOST")
    user = os.environ.get("PAPAMAP_SMTP_USER")
    password = os.environ.get("PAPAMAP_SMTP_PASSWORD")
    to = os.environ.get("PAPAMAP_OPS_TO")
    sender = os.environ.get("PAPAMAP_OPS_FROM") or user
    port = int(os.environ.get("PAPAMAP_SMTP_PORT", "587"))
    if not (host and user and password and to):
        print("mail not configured (PAPAMAP_SMTP_HOST/USER/PASSWORD, "
              "PAPAMAP_OPS_TO) — stdout only", file=sys.stderr)
        return False
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = sender, to, subject
    msg.set_content(body)
    try:
        with smtp(host, port, timeout=30) as conn:
            conn.starttls()
            conn.login(user, password)
            conn.send_message(msg)
        return True
    except Exception as exc:
        print(f"WARN: sending mail failed: {exc}", file=sys.stderr)
        return False


def run_check(now=None, state_path=None, geojson_path=None, stats_path=None,
              mail=send_mail, visits_fetch=cf_visits, edits_fetch=osmcha_edits,
              apps_fetch=appstats.fetch_all,
              html_path=None, history_path=None, build_log_path=None,
              private_html_path=None, delta_path=None, delta_state_path=None):
    """Returns (anomalies, report). State is updated every run so the daily
    diff stays daily even when no mail goes out, and the ops page is
    rewritten every run from the same numbers. html_path="" skips the page;
    delta_path="" skips the live-updates check."""
    now = now or datetime.now(timezone.utc)
    state_path = Path(state_path or STATE_PATH)
    stats = load_json(stats_path or STATS_PATH)
    geojson = load_json(geojson_path or GEOJSON_PATH)

    state = load_json(state_path) or {"statuses": {}, "history": []}
    prev_statuses, history = state["statuses"], state["history"]
    # The last OSMCha count that actually arrived, dated — the fetch can fail
    # for days (their metadata scan times out), and a number without its date
    # would read as today's.
    cached_edits = state.get("edits")
    last_counts = history[-1]["counts"] if history else None

    cur_statuses = feature_statuses(geojson) if geojson else None
    counts = counts_of(cur_statuses) if cur_statuses is not None else None
    changes = (diff_statuses(prev_statuses, cur_statuses)
               if cur_statuses is not None and prev_statuses else None)

    delta_path = OPS_DELTA_PATH if delta_path is None else delta_path
    delta_state_path = (OPS_DELTA_STATE_PATH if delta_state_path is None
                        else delta_state_path)
    summary = (delta_summary(load_json(delta_path),
                             load_json(delta_state_path) if delta_state_path
                             else None, stats, now)
               if delta_path else None)
    anomalies = find_anomalies(stats, counts, last_counts, now,
                               delta=summary, delta_expected=bool(delta_path))
    weekly = now.weekday() == WEEKLY_DIGEST_WEEKDAY
    # Visits and edits every run, not just digest days: the page's per-day
    # charts are built run by run — the visits curve from figures Cloudflare
    # keeps for about a month, the theme-edits bars from a window OSMCha is
    # asked for daily. The mail still carries both on digest days only.
    visits = visits_fetch(now=now)
    edits = edits_fetch(now=now)
    # The store apps too (pipeline/appstats.py): downloads, installs and
    # ratings into their own history; None when no store id is configured.
    try:
        apps = apps_fetch(now=now, known_days=state.get("app_days") or {})
    except Exception as exc:  # noqa: BLE001 — decoration, never the check
        print(f"WARN: app stats failed: {exc}", file=sys.stderr)
        apps = None
    app_days = appstats.merge_app_days(state.get("app_days") or {}, apps, now)
    app_ratings = appstats.merge_ratings(
        state.get("app_ratings"), (apps or {}).get("ratings"),
        now.strftime("%Y-%m-%d"))
    digest = anomalies or weekly
    report = render_report(counts, changes, history, anomalies,
                           visits if digest else None, edits, delta=summary,
                           app_days=app_days if digest else None,
                           ratings=app_ratings if digest else None)
    visits_history = merge_visits(state.get("visits") or {}, visits, now)
    edits_days = merge_edits(state.get("edits_days") or {}, edits)
    web_edits_days = merge_edits(state.get("web_edits_days") or {}, edits,
                                 "web_by_day")

    if edits and not edits.get("error"):
        # by_day stays out of the cached line: the merged history above is
        # its home, and the line is just "N changesets (7 d, dated)".
        cached_edits = {"days": edits["days"], "changesets": edits["changesets"],
                        "as_of": now.strftime("%Y-%m-%d")}
        if "web_changesets" in edits:
            cached_edits["web_changesets"] = edits["web_changesets"]
    if cur_statuses is not None:
        history.append({"date": now.strftime("%Y-%m-%d"), "counts": counts,
                        "changes": changes or diff_statuses({}, {})})
        state = {"statuses": cur_statuses, "history": history[-HISTORY_DAYS:]}
        if cached_edits:
            state["edits"] = cached_edits
        if edits_days:
            state["edits_days"] = edits_days
        if web_edits_days:
            state["web_edits_days"] = web_edits_days
        if visits_history:
            state["visits"] = visits_history
        if app_days:
            state["app_days"] = app_days
        if app_ratings:
            state["app_ratings"] = app_ratings
        save_state(state_path, state)

    html_path = OPS_HTML_PATH if html_path is None else html_path
    private_path = (OPS_PRIVATE_HTML_PATH if private_html_path is None
                    else private_html_path)
    ctx = dict(now=now, stats=stats, counts=counts, changes=changes,
               history=history[-HISTORY_DAYS:], anomalies=anomalies,
               edits=cached_edits, edits_days=edits_days,
               web_edits_days=web_edits_days,
               delta=summary, delta_expected=bool(delta_path),
               history_path=history_path or OPS_HISTORY_PATH,
               build_log_path=build_log_path or BUILD_LOG_PATH)
    if html_path:
        write_ops_page(html_path, **ctx)
    if private_path:
        write_ops_page(private_path, private=True, visits=visits_history,
                       apps=apps, app_days=app_days, app_ratings=app_ratings,
                       **ctx)

    if anomalies:
        mail("[papamap] ALERT: " + "; ".join(anomalies)[:120], report)
    elif weekly:
        mail("[papamap] weekly: all clear", report)
    return anomalies, report


def merge_visits(kept: dict, visits: dict | None, now: datetime) -> dict:
    """The per-day visit history, updated with what today's fetch returned.
    Today is left out — at 07:30 it is a third of a day — and every earlier
    day in the answer overwrites the stored one, so a partial figure stored
    by a run that happened late in the day heals on the next. Capped, and
    returned sorted by date so the page can draw it as it is."""
    merged = dict(kept)
    today = now.strftime("%Y-%m-%d")
    for day, v in ((visits or {}).get("by_day") or {}).items():
        if day < today and isinstance(v, dict):
            merged[day] = {"requests": int(v.get("requests", 0)),
                           "uniques": int(v.get("uniques", 0))}
    return dict(sorted(merged.items())[-VISITS_HISTORY_DAYS:])


def write_ops_page(path, *, history_path, build_log_path, **ctx) -> None:
    """The page is decoration on the check: a failure to render or write it
    is reported and never fails the run (the state is already saved, the
    mail already sent)."""
    try:
        log_text = Path(build_log_path).read_text(errors="replace")
    except OSError:
        log_text = None
    try:
        page = ops_page.render_page(
            regions=ops_page.region_rows(load_json(history_path)),
            build=ops_page.parse_build_log(log_text), **ctx)
        write_text_atomic(page, str(path))
    except Exception as exc:  # noqa: BLE001 — see docstring
        print(f"WARN: ops page not written: {exc}", file=sys.stderr)


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(
        description="The daily check: diff, mail, ops page.")
    ap.add_argument("--backfill-edits", type=int, metavar="DAYS",
                    help="instead of the check, fetch DAYS days of theme "
                         "changesets from OSMCha once and merge the per-day "
                         "counts into the state (see backfill_edits)")
    args = ap.parse_args()
    if args.backfill_edits is not None:
        edits = backfill_edits(args.backfill_edits)
        sys.exit(0 if edits and not edits.get("error") else 1)
    found, text = run_check()
    print(text)
    sys.exit(1 if found else 0)
