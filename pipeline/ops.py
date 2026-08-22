"""Anomaly-gated ops check: `python -m pipeline.ops`, daily via cron after the
build. Quiet inbox = healthy — a mail goes out only on an anomaly (stale or
missing data, a big count drop) plus one weekly all-clear digest, so silence
longer than a week means the watcher itself is broken.

The check reads the same GEOJSON_PATH/STATS_PATH the build writes (same env),
keeps yesterday's per-feature statuses in a local state file, and reports the
day's dataset changes: new/removed features and status transitions — a
grey->green transition is somebody answering the room question on OSM.

Everything in the report is aggregate: dataset counts derived from public ODbL
OSM data, plus (optionally) Cloudflare's zone-level request totals and an
OSMCha count of changesets made through the site's own MapComplete theme. No
visitor-level data is read, stored or sent.

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
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path

import requests

from . import ops_page
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
VISITS_HISTORY_DAYS = 400
# history.json, the leaderboard's per-region counts. The build writes it next
# to stats.json in every layout (Dockerfile, config defaults), so the sibling
# is the right default here too — config.HISTORY_PATH's own default is the
# checkout's web/data/, which an ops.env that only overrides the stats path
# (the documented minimum) would miss.
OPS_HISTORY_PATH = os.environ.get(
    "PAPAMAP_HISTORY_PATH", str(Path(STATS_PATH).parent / "history.json"))
# The build cron's log, `>> pipeline.log` in the repo directory where the ops
# cron also runs; read for the "last build" section, optional.
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


def find_anomalies(stats, counts, last_counts, now) -> list[str]:
    """Human-readable anomaly lines; empty list = healthy. `counts`/`stats`
    are None when the corresponding file is missing."""
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
    return anomalies


def render_report(counts, changes, history, anomalies, visits=None,
                  edits=None) -> str:
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
    if visits:
        lines.append(
            f"visits (Cloudflare, {visits['days']}d): "
            f"{visits['requests']} requests, {visits['uniques']} uniques")
    return "\n".join(lines) or "no data at all — nothing to report on"


def cf_visits(days=7, now=None, post=requests.post):
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
        # by_day is what the private ops page keeps: Cloudflare's free plan
        # forgets a day after about a week, the state file does not.
        return {"days": days,
                "requests": sum(g["sum"]["requests"] for g in groups),
                "uniques": sum(g["uniq"]["uniques"] for g in groups),
                "by_day": {g["dimensions"]["date"]: {
                    "requests": g["sum"]["requests"],
                    "uniques": g["uniq"]["uniques"]} for g in groups
                    if g.get("dimensions", {}).get("date")}}
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
    is aggregate — no mapper data is read or stored."""
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
                        "date__gte": since, "page_size": "1"})
        return {"days": days, "changesets": r.json()["count"]}
    except Exception as exc:  # like visits: decoration, never fail the check
        # Reported, not swallowed. A dropped line and a genuine zero both read
        # as "nobody edited through the site this week", and that is the one
        # number the digest exists to carry — so the failure says so out loud.
        print(f"WARN: OSMCha query failed: {exc}", file=sys.stderr)
        return {"days": days, "error": _short_exc(exc)}


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
              html_path=None, history_path=None, build_log_path=None,
              private_html_path=None):
    """Returns (anomalies, report). State is updated every run so the daily
    diff stays daily even when no mail goes out, and the ops page is
    rewritten every run from the same numbers. html_path="" skips the page."""
    now = now or datetime.now(timezone.utc)
    state_path = Path(state_path or STATE_PATH)
    stats = load_json(stats_path or STATS_PATH)
    geojson = load_json(geojson_path or GEOJSON_PATH)

    state = load_json(state_path) or {"statuses": {}, "history": []}
    prev_statuses, history = state["statuses"], state["history"]
    # The OSMCha count is only fetched on digest days (see below), so the
    # page shows the last one it got, dated — a number without its date
    # would read as today's.
    cached_edits = state.get("edits")
    last_counts = history[-1]["counts"] if history else None

    cur_statuses = feature_statuses(geojson) if geojson else None
    counts = counts_of(cur_statuses) if cur_statuses is not None else None
    changes = (diff_statuses(prev_statuses, cur_statuses)
               if cur_statuses is not None and prev_statuses else None)

    anomalies = find_anomalies(stats, counts, last_counts, now)
    weekly = now.weekday() == WEEKLY_DIGEST_WEEKDAY
    # Visits every run, not just digest days: the private page's curve is
    # built from per-day figures Cloudflare only keeps for about a week.
    # The mail still carries them on digest days only.
    visits = visits_fetch(now=now)
    edits = edits_fetch(now=now) if (anomalies or weekly) else None
    report = render_report(counts, changes, history, anomalies,
                           visits if (anomalies or weekly) else None, edits)
    visits_history = merge_visits(state.get("visits") or {}, visits, now)

    if edits and not edits.get("error"):
        cached_edits = dict(edits, as_of=now.strftime("%Y-%m-%d"))
    if cur_statuses is not None:
        history.append({"date": now.strftime("%Y-%m-%d"), "counts": counts,
                        "changes": changes or diff_statuses({}, {})})
        state = {"statuses": cur_statuses, "history": history[-HISTORY_DAYS:]}
        if cached_edits:
            state["edits"] = cached_edits
        if visits_history:
            state["visits"] = visits_history
        tmp = state_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(state))
        tmp.replace(state_path)

    html_path = OPS_HTML_PATH if html_path is None else html_path
    private_path = (OPS_PRIVATE_HTML_PATH if private_html_path is None
                    else private_html_path)
    ctx = dict(now=now, stats=stats, counts=counts, changes=changes,
               history=history[-HISTORY_DAYS:], anomalies=anomalies,
               edits=cached_edits,
               history_path=history_path or OPS_HISTORY_PATH,
               build_log_path=build_log_path or BUILD_LOG_PATH)
    if html_path:
        write_ops_page(html_path, **ctx)
    if private_path:
        write_ops_page(private_path, private=True, visits=visits_history, **ctx)

    if anomalies:
        mail("[papamap] ALERT: " + "; ".join(anomalies)[:120], report)
    elif weekly:
        mail("[papamap] weekly: all clear", report)
    return anomalies, report


def merge_visits(kept: dict, visits: dict | None, now: datetime) -> dict:
    """The per-day visit history, updated with what today's fetch returned.
    Today is left out — at 05:30 it is a fifth of a day — and every earlier
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
    found, text = run_check()
    print(text)
    sys.exit(1 if found else 0)
