"""The ops page — /ops.html, one static file `pipeline.ops` rewrites on every
run, from what the check already knows plus two files lying next to it:
history.json (the leaderboard's per-region daily counts) and pipeline.log
(last night's build, per area).

Public on purpose. Everything on it is an aggregate of public ODbL data or of
the build's own behaviour — counts, transitions, which areas answered, which
warned — so there is nothing to protect, and a page anybody can open doubles
as "is the site healthy" for a reader who wonders why a pin is a day old.
The one number the check knows and this page does NOT show is the Cloudflare
request total: methods.html promises "keine Analytics", and a visitor count on
a public page reads as the thing that promise rules out, even at CDN level.
It stays in the Monday mail.

Rendering is string-building like the Land pages, no templates; the page is
English-only, like the report it mirrors."""
from __future__ import annotations

import ast
import re
from datetime import datetime, timezone

from .pages import ICON, STYLE, esc

# What `python -m pipeline.run` prints, line by line (pipeline/run.py). The
# result dict is the one line a finished build always ends on, so it is the
# marker that separates one night from the next in an append-only log.
AREA_LINE = re.compile(r"^\s+(?P<area>.+?): ct=(?P<ct>\d+) play=(?P<play>\d+) "
                       r"toilets=(?P<toilets>\d+)\s*$")
WARN_LINE = re.compile(r"^\s*WARN\b(?P<text>.*)$")
ROUND_LINE = re.compile(r"^\s+round (?P<n>\d+): retrying (?P<names>.+)$")
RESULT_LINE = re.compile(r"^\{'features': .*\}\s*$")
LOG_TAIL_LINES = 5000

OPS_STYLE = """\
  .ok { color: var(--green); font-weight: 600; }
  .bad { color: var(--red); font-weight: 600; }
  ul.anomalies li { color: var(--red); }
  ul.warns { font-size: 0.85rem; font-family: ui-monospace, Menlo, monospace;
             padding-left: 1.2rem; }
  .kpis { display: flex; flex-wrap: wrap; gap: 0.6rem; margin: 1rem 0; }
  .kpi { flex: 1 1 9rem; border: 1px solid var(--line); border-radius: 6px;
         padding: 0.5rem 0.7rem; }
  .kpi b { display: block; font-size: 1.4rem; }
  .kpi span { color: var(--muted); font-size: 0.85rem; }
  details > summary { cursor: pointer; font-weight: 600; margin-top: 1.4rem; }
  svg.spark { width: 100%; height: 4rem; display: block; margin: 0.4rem 0; }
  td.pos { color: var(--green); } td.neg { color: var(--red); }
  footer { margin-top: 3rem; font-size: 0.85rem; color: var(--muted);
           border-top: 1px solid var(--line); padding-top: 0.8rem; }
"""


# ---- pipeline.log ----------------------------------------------------------

def parse_build_log(text: str | None) -> dict | None:
    """The last build in an append-only log, as data. None when there is no
    build in it at all. A build is the lines up to a result line; lines after
    the last result line are a build that has not finished — a run in
    progress at 05:30, or one that died, which the caller tells apart by
    whether there is a traceback."""
    if not text:
        return None
    lines = text.splitlines()[-LOG_TAIL_LINES:]
    results = [i for i, line in enumerate(lines) if RESULT_LINE.match(line)]
    after_last = lines[results[-1] + 1:] if results else lines
    unfinished = any(AREA_LINE.match(line) or "Traceback" in line
                     for line in after_last)
    if unfinished:
        segment, finished = after_last, False
    elif results:
        start = results[-2] + 1 if len(results) > 1 else 0
        segment, finished = lines[start:results[-1] + 1], True
    else:
        return None

    build = {"finished": finished, "areas": [], "warns": [], "rounds": [],
             "result": None, "error": None}
    traceback_seen = False
    for line in segment:
        m = AREA_LINE.match(line)
        if m:
            build["areas"].append({
                "area": m["area"], "ct": int(m["ct"]),
                "play": int(m["play"]), "toilets": int(m["toilets"])})
            continue
        m = ROUND_LINE.match(line)
        if m:
            build["rounds"].append(f"round {m['n']}: {m['names']}")
            continue
        m = WARN_LINE.match(line)
        if m:
            build["warns"].append(line.strip())
            continue
        if RESULT_LINE.match(line):
            try:
                build["result"] = ast.literal_eval(line.strip())
            except (ValueError, SyntaxError):
                build["result"] = None
            continue
        if "Traceback" in line:
            traceback_seen = True
        elif traceback_seen and line.strip() and not line.startswith(" "):
            build["error"] = line.strip()
    return build


# ---- history.json ----------------------------------------------------------

def region_rows(history: dict | None, window_days: int = 7) -> dict:
    """Per-region and per-city rows from the leaderboard's history: today's
    triple [accessible, female_only, unknown] and the accessible delta against
    the newest day at least `window_days` older — or the oldest day there is,
    when the history is younger than the window. {'date', 'base_date',
    'regions': [...], 'cities': [...]}, rows sorted by accessible desc."""
    days = (history or {}).get("days") or []
    if not days:
        return {"date": None, "base_date": None, "regions": [], "cities": []}
    last = days[-1]
    try:
        cutoff = (datetime.fromisoformat(last["date"]).timestamp()
                  - window_days * 86400)
        older = [d for d in days[:-1]
                 if datetime.fromisoformat(d["date"]).timestamp() <= cutoff]
    except (TypeError, ValueError):
        older = []
    base = older[-1] if older else (days[0] if len(days) > 1 else None)

    def rows(kind: str) -> list[dict]:
        out = []
        base_map = (base or {}).get(kind) or {}
        for name, triple in (last.get(kind) or {}).items():
            acc, fem, unk = (list(triple) + [0, 0, 0])[:3]
            before = base_map.get(name)
            delta = acc - before[0] if before else None
            out.append({"name": name, "accessible": acc, "female_only": fem,
                        "unknown": unk, "total": acc + fem + unk,
                        "delta": delta})
        out.sort(key=lambda r: (-r["accessible"], r["name"]))
        return out

    return {"date": last.get("date"),
            "base_date": base.get("date") if base else None,
            "regions": rows("regions"), "cities": rows("cities")}


# ---- Rendering -------------------------------------------------------------

def _n(v) -> str:
    return "–" if v is None else f"{v:,}"


def _signed(v) -> str:
    if v is None:
        return "–"
    return f"{v:+,}" if v else "0"


def _signed_cell(v) -> str:
    cls = "pos" if (v or 0) > 0 else "neg" if (v or 0) < 0 else "zero"
    return f'<td class="{cls}">{_signed(v)}</td>'


def _pct(part, whole) -> str:
    return f"{100 * part / whole:.1f} %" if whole else "–"


def _sparkline(values: list[int], color_var: str) -> str:
    """One polyline, no axes: the shape is the information, the table below
    has the numbers. Two points minimum, or there is no line to draw."""
    pts = [v for v in values if isinstance(v, (int, float))]
    if len(pts) < 2:
        return ""
    lo, hi = min(pts), max(pts)
    span = (hi - lo) or 1
    w, h = 600, 60
    step = w / (len(pts) - 1)
    coords = " ".join(
        f"{i * step:.1f},{h - 4 - (v - lo) / span * (h - 8):.1f}"
        for i, v in enumerate(pts))
    return (f'<svg class="spark" viewBox="0 0 {w} {h}" preserveAspectRatio="none" '
            f'role="img" aria-label="{lo:,} to {hi:,}">'
            f'<polyline fill="none" stroke="var({color_var})" stroke-width="2" '
            f'points="{coords}"/></svg>')


def _age_hours(stats: dict | None, now: datetime) -> float | None:
    try:
        generated = datetime.fromisoformat(str((stats or {}).get("generated_at")))
        return (now - generated).total_seconds() / 3600
    except (TypeError, ValueError):
        return None


def _sum_changes(entries: list[dict]) -> dict:
    keys = ("new", "gone", "to_accessible", "to_female_only", "to_unknown")
    return {k: sum((e.get("changes") or {}).get(k, 0) for e in entries)
            for k in keys}


def _changes_row(label: str, c: dict | None) -> str:
    if c is None:
        return f"<tr><td>{esc(label)}</td>" + "<td>–</td>" * 5 + "</tr>"
    return (f"<tr><td>{esc(label)}</td>"
            f"<td>{_signed(c['new'])}</td><td>{_signed(-c['gone'])}</td>"
            f"<td>{_n(c['to_accessible'])}</td>"
            f"<td>{_n(c['to_female_only'])}</td>"
            f"<td>{_n(c['to_unknown'])}</td></tr>")


def _region_table(rows: list[dict], name_col: str) -> str:
    parts = ['<div class="scroll">\n<table>\n<thead><tr>'
             f'<th class="l">{esc(name_col)}</th><th>accessible</th>'
             '<th>female-only</th><th>unknown</th><th>total</th>'
             '<th>Δ accessible</th></tr></thead>\n<tbody>\n']
    for r in rows:
        parts.append(
            f'<tr><td class="l">{esc(r["name"])}</td>'
            f'<td>{_n(r["accessible"])}</td><td>{_n(r["female_only"])}</td>'
            f'<td>{_n(r["unknown"])}</td><td>{_n(r["total"])}</td>'
            f'{_signed_cell(r["delta"])}</tr>\n')
    parts.append("</tbody>\n</table>\n</div>\n")
    return "".join(parts)


def _visitors(visits: dict | None) -> str:
    """The private page's extra section: Cloudflare zone-level requests and
    uniques per complete day, from the state's own history. Uniques are
    Cloudflare's per-day figure, so a week's sum counts a daily reader seven
    times — the table says so rather than pretending otherwise."""
    days = sorted((visits or {}).items())
    if not days:
        return ('<h2>Visitors</h2>\n<p class="muted">No Cloudflare figures yet '
                "— CF_ANALYTICS_TOKEN/CF_ZONE_TAG unset, or the first fetch is "
                "still to come.</p>\n")
    parts = ["<h2>Visitors</h2>\n"
             '<p class="muted">Cloudflare zone-level totals per complete UTC day '
             "— every request the edge saw, crawlers included. Uniques are "
             "per day, so a window's sum counts a daily reader once per day."
             "</p>\n"
             '<div class="kpis">\n']
    for n in (7, 30):
        window = days[-n:]
        req = sum(v["requests"] for _, v in window)
        uni = sum(v["uniques"] for _, v in window)
        parts.append(f'<div class="kpi"><b>{_n(uni)}</b>'
                     f"<span>uniques, last {len(window)} days</span></div>\n"
                     f'<div class="kpi"><b>{_n(req)}</b>'
                     f"<span>requests, last {len(window)} days</span></div>\n")
    parts.append("</div>\n")
    uniques = [v["uniques"] for _, v in days]
    if len(uniques) >= 2:
        parts.append(f'<p class="muted">Daily uniques, {esc(days[0][0])} → '
                     f"{esc(days[-1][0])}</p>\n")
        parts.append(_sparkline(uniques, "--accent"))
    recent = list(reversed(days[-30:]))
    parts.append(f"<details>\n<summary>last {len(recent)} of {len(days)} days</summary>\n"
                 '<div class="scroll">\n<table>\n<thead><tr><th class="l">day</th>'
                 "<th>uniques</th><th>requests</th></tr></thead>\n<tbody>\n")
    for day, v in recent:
        parts.append(f'<tr><td class="l">{esc(day)}</td><td>{_n(v["uniques"])}</td>'
                     f'<td>{_n(v["requests"])}</td></tr>\n')
    parts.append("</tbody>\n</table>\n</div>\n</details>\n")
    return "".join(parts)


def render_page(*, now: datetime, stats: dict | None, counts: dict | None,
                changes: dict | None, history: list[dict],
                anomalies: list[str], edits: dict | None = None,
                regions: dict | None = None, build: dict | None = None,
                site_url: str = "https://papamap.de",
                private: bool = False, visits: dict | None = None) -> str:
    """The whole page. `history` is the ops state's daily list (oldest first,
    the entry for today already appended); `regions` is region_rows()'s
    output; `build` is parse_build_log()'s; `edits` the cached OSMCha line.
    `private` adds the Visitors section from `visits` ({date: {requests,
    uniques}}); the public page ignores `visits` entirely, by design."""
    now = now.astimezone(timezone.utc)
    age = _age_hours(stats, now)
    local = (stats or {}).get("local") or {}
    glob = (stats or {}).get("global") or {}
    regions = regions or {"date": None, "base_date": None,
                          "regions": [], "cities": []}

    p = [f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>PapaMap ops{" (private)" if private else ""}</title>
{ICON}
<style>
{STYLE}{OPS_STYLE}</style>
</head>
<body>
<p class="back"><a href="/">← Map</a> · <a href="/wickeltische/leaderboard.html">Leaderboard</a> · <a href="/methods-en.html">Methods</a></p>
<h1>PapaMap ops{" <span class=\"muted\">private</span>" if private else ""}</h1>
"""]
    stamp = now.strftime("%Y-%m-%d %H:%M UTC")
    built = (stats or {}).get("generated_at")
    built_txt = (f"dataset built {esc(str(built))}"
                 + (f" ({age:.0f} h ago)" if age is not None else "")
                 if built else "no dataset")
    area = (stats or {}).get("area_name")
    p.append(f'<p class="muted">Report {stamp} · {built_txt}'
             + (f" · {esc(area)}" if area else "") + "</p>\n")

    # Status
    if anomalies:
        p.append('<p class="bad">Anomalies</p>\n<ul class="anomalies">\n')
        p.extend(f"<li>{esc(a)}</li>\n" for a in anomalies)
        p.append("</ul>\n")
    else:
        p.append('<p class="ok">Healthy — fresh dataset, counts within bounds.</p>\n')

    # Dataset
    p.append("<h2>Dataset</h2>\n")
    if counts:
        total = counts["total"]
        p.append('<div class="kpis">\n')
        for key, label in (("total", "changing tables"),
                           ("accessible", "accessible"),
                           ("female_only", "female-only"),
                           ("unknown", "room unknown")):
            share = "" if key == "total" else f" · {_pct(counts[key], total)}"
            p.append(f'<div class="kpi"><b>{_n(counts[key])}</b>'
                     f'<span>{label}{share}</span></div>\n')
        p.append("</div>\n")
    else:
        p.append('<p class="bad">changing_tables.geojson is missing.</p>\n')
    if local:
        p.append("<table>\n<tbody>\n")
        for key, label in (("toilets_total", "toilets in the swept area"),
                           ("ct_objects", "objects tagged changing_table=*"),
                           ("ct_yes", "… of which changing_table=yes"),
                           ("centralkey_locked", "dropped: locked behind a central key"),
                           ("play_places", "play places"),
                           ("play_tables", "play places with a changing table"),
                           ("capacity_tagged_toilets", "toilets with changing_table:count")):
            if key in local:
                p.append(f"<tr><td class=\"l\">{label}</td><td>{_n(local[key])}</td></tr>\n")
        if glob.get("ct_total") is not None:
            p.append(f'<tr><td class="l">changing tables worldwide (taginfo, '
                     f'{esc(str(glob.get("data_until", "")))[:10]})</td>'
                     f'<td>{_n(glob["ct_total"])}</td></tr>\n')
        p.append("</tbody>\n</table>\n")

    # Movement
    p.append("<h2>Movement</h2>\n"
             '<p class="muted">A → accessible is the mission metric: somebody '
             "answered the room question on OSM. New/gone count pins entering "
             "and leaving the dataset, which includes areas that failed or "
             "came back.</p>\n"
             '<div class="scroll">\n<table>\n<thead><tr><th class="l">window</th>'
             "<th>new</th><th>gone</th><th>→ accessible</th>"
             "<th>→ female-only</th><th>→ unknown</th></tr></thead>\n<tbody>\n")
    p.append(_changes_row("since yesterday", changes))
    # `history` already carries today's entry when the page is rendered after
    # the state update; the windows below are the last N entries either way.
    for n, label in ((7, "last 7 days"), (30, "last 30 days")):
        window = history[-n:]
        p.append(_changes_row(f"{label} ({len(window)} runs)",
                              _sum_changes(window) if window else None))
    p.append("</tbody>\n</table>\n</div>\n")

    if edits and edits.get("error"):
        p.append(f'<p>Edits through the PapaMap theme (OSMCha, {edits.get("days", 7)} d): '
                 f'<span class="bad">unknown</span> — query failed '
                 f'({esc(edits["error"])}). Not zero.</p>\n')
    elif edits:
        as_of = f' as of {esc(edits["as_of"])}' if edits.get("as_of") else ""
        p.append(f'<p>Edits through the PapaMap theme (OSMCha, {edits.get("days", 7)} d'
                 f'{as_of}): <b>{_n(edits.get("changesets"))}</b> changesets.</p>\n')

    acc_series = [e.get("counts", {}).get("accessible") for e in history]
    if len(acc_series) >= 2:
        p.append(f'<p class="muted">Accessible, last {len(history)} runs '
                 f'({_n(acc_series[0])} → {_n(acc_series[-1])})</p>\n')
        p.append(_sparkline(acc_series, "--green"))

    if private:
        p.append(_visitors(visits))

    # Last build
    p.append("<h2>Last build</h2>\n")
    if build is None:
        p.append('<p class="muted">No build found in pipeline.log.</p>\n')
    else:
        if build["finished"]:
            r = build["result"] or {}
            p.append('<p><span class="ok">finished</span>'
                     + (f' — {_n(r.get("features"))} features, '
                        f'{_n(r.get("play_places"))} play places, '
                        f'{_n(r.get("pages"))} pages, '
                        f'global block from {esc(str(r.get("global_source", "?")))}'
                        if r else "") + ".</p>\n")
        elif build["error"]:
            p.append(f'<p><span class="bad">failed</span> — '
                     f'<code>{esc(build["error"])}</code>. The site keeps '
                     "serving the previous dataset.</p>\n")
        else:
            p.append('<p><span class="bad">not finished</span> when this '
                     "report ran — still running, or killed without a "
                     "traceback.</p>\n")
        if build["rounds"]:
            p.append("<p>Retries: " + " · ".join(esc(x) for x in build["rounds"])
                     + "</p>\n")
        if build["warns"]:
            p.append(f'<p class="bad">{len(build["warns"])} warnings</p>\n'
                     '<ul class="warns">\n')
            p.extend(f"<li>{esc(w)}</li>\n" for w in build["warns"])
            p.append("</ul>\n")
        if build["areas"]:
            zero = sum(1 for a in build["areas"] if a["ct"] == 0)
            p.append(f"<details>\n<summary>{len(build['areas'])} areas swept"
                     + (f", {zero} with zero tables" if zero else "")
                     + "</summary>\n"
                     '<div class="scroll">\n<table>\n<thead><tr><th class="l">area</th>'
                     "<th>changing tables</th><th>play places</th>"
                     "<th>toilets</th></tr></thead>\n<tbody>\n")
            for a in build["areas"]:
                cls = ' class="bad"' if a["ct"] == 0 else ""
                p.append(f'<tr><td class="l"{cls}>{esc(a["area"])}</td>'
                         f'<td>{_n(a["ct"])}</td><td>{_n(a["play"])}</td>'
                         f'<td>{_n(a["toilets"])}</td></tr>\n')
            p.append("</tbody>\n</table>\n</div>\n</details>\n")

    # Regions and cities
    if regions["regions"] or regions["cities"]:
        base = regions["base_date"]
        p.append("<h2>Regions</h2>\n"
                 f'<p class="muted">Per sweep area on {esc(str(regions["date"]))}'
                 + (f", Δ accessible against {esc(base)}" if base else
                    ", no earlier day to compare against")
                 + ". The public <a href=\"/wickeltische/leaderboard.html\">"
                 "leaderboard</a> ranks the same rows by movement.</p>\n")
        if regions["cities"]:
            p.append(f"<details>\n<summary>{len(regions['cities'])} cities</summary>\n"
                     + _region_table(regions["cities"], "city") + "</details>\n")
        if regions["regions"]:
            p.append(f"<details>\n<summary>{len(regions['regions'])} regions</summary>\n"
                     + _region_table(regions["regions"], "region") + "</details>\n")

    # Daily history
    if history:
        recent = list(reversed(history[-30:]))
        p.append("<h2>Daily runs</h2>\n"
                 f"<details>\n<summary>last {len(recent)} of {len(history)} runs</summary>\n"
                 '<div class="scroll">\n<table>\n<thead><tr><th class="l">date</th>'
                 "<th>total</th><th>accessible</th><th>female-only</th>"
                 "<th>unknown</th><th>new</th><th>gone</th><th>→ acc.</th>"
                 "<th>→ fem.</th><th>→ unk.</th></tr></thead>\n<tbody>\n")
        for e in recent:
            c, ch = e.get("counts") or {}, e.get("changes") or {}
            p.append(f'<tr><td class="l">{esc(str(e.get("date", "")))}</td>'
                     f'<td>{_n(c.get("total"))}</td><td>{_n(c.get("accessible"))}</td>'
                     f'<td>{_n(c.get("female_only"))}</td><td>{_n(c.get("unknown"))}</td>'
                     f'<td>{_n(ch.get("new"))}</td><td>{_n(ch.get("gone"))}</td>'
                     f'<td>{_n(ch.get("to_accessible"))}</td>'
                     f'<td>{_n(ch.get("to_female_only"))}</td>'
                     f'<td>{_n(ch.get("to_unknown"))}</td></tr>\n')
        p.append("</tbody>\n</table>\n</div>\n</details>\n")

    p.append(f"""<footer>
<p>Everything on this page is an aggregate of public OpenStreetMap data (ODbL) and of this site's own nightly build. {"The Visitors block is Cloudflare's zone-level count of requests, kept per day; it identifies nobody." if private else "No visitor data is collected, stored or shown — the site has no analytics."}</p>
<p>Sources: <a href="/data/stats.json">stats.json</a> · <a href="/data/history.json">history.json</a> · <a href="/data/changing_tables.geojson">changing_tables.geojson</a> · <a href="{esc(site_url)}/methods-en.html">how the classification works</a></p>
</footer>
</body>
</html>
""")
    return "".join(p)
