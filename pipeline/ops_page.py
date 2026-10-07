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

The page reads top-down in the order the numbers are asked for (redesigned
2026-10-06): a status header, a "This week" strip of tiles, then — on the
private copy — Readers and Apps, then Edits via PapaMap (theme changesets
and in-app answers in one section), Movement on OSM (recolours per night,
"answered since launch" beside the dataset's green total with every
coverage step pinned and named, pins added and removed per night), Dataset
and Pipeline, the last one collapsed unless the night went wrong. Every
explanatory paragraph sits behind a "How this is counted" summary.

Rendering is string-building like the Land pages, no templates; the page is
English-only, like the report it mirrors. Charts are dependency-free: flex
columns and one stretched SVG polyline per line, the axes as HTML beside
the drawing, the exact numbers in tooltips and in a table under each."""
from __future__ import annotations

import ast
import math
import re
from datetime import date, datetime, timedelta, timezone

from .appstats import APP_STORE_LIVE_SINCE
from .export import THEME_LIVE_SINCE
from .pages import ICON, STYLE, esc

# What `python -m pipeline.run` prints, line by line (pipeline/run.py). The
# result dict is the one line a finished build always ends on, so it is the
# marker that separates one night from the next in an append-only log.
# The toilets figure may carry " (counted N d ago)" since the weekly rota
# (pipeline/toilet_counts.py): an area reused last week's count says so on
# its line, and the parser must still see it as an area line — otherwise a
# night that recounts a seventh of the areas shows a seventh of them swept.
# ", recount failed" marks the reuse that was not the rota's: tonight's count
# failed and the cached one stood in (the ops page names those areas).
AREA_LINE = re.compile(r"^\s+(?P<area>.+?): ct=(?P<ct>\d+) play=(?P<play>\d+) "
                       r"toilets=(?P<toilets>\d+)"
                       r"(?: \(counted \d+ d ago(?P<failed>, recount failed)?\))?\s*$")
WARN_LINE = re.compile(r"^\s*WARN\b(?P<text>.*)$")
ROUND_LINE = re.compile(r"^\s+round (?P<n>\d+): retrying (?P<names>.+)$")
RESULT_LINE = re.compile(r"^\{'features': .*\}\s*$")
LOG_TAIL_LINES = 5000

# stats.json's area_name joins config.COUNTRY_LABELS with " & ", and those
# name Germany and Denmark in their own language (a leftover from when the
# label had German and Danish readers; the map translates via area_key). The
# ops page is English-only, so it translates the two itself.
ENGLISH_AREA_NAMES = {"Deutschland": "Germany", "Danmark": "Denmark"}


def english_area(area_name: str) -> str:
    """'Deutschland & Danmark & Belgium' → '3 countries: Germany, Denmark,
    Belgium'; a single name passes through, translated if it needs to be."""
    names = [ENGLISH_AREA_NAMES.get(n, n) for n in area_name.split(" & ")]
    if len(names) == 1:
        return names[0]
    return f"{len(names)} countries: " + ", ".join(names)

OPS_STYLE = """\
  /* The page's own tokens on top of STYLE's: the amber for warnings, and
     the chart series. The two blues are the edits the site can claim
     (theme changesets under, in-app answers on top); green is a pin that
     turned green; the rest of the movement is a neutral grey, because red
     next to green fails every colour-vision check and the female-only
     recolours are a handful a month — they live in the tooltip and the
     table. Dark mode re-steps every series rather than lightening it. */
  :root { --amber: #8a5a0e; --soft: #f5f5f3;
          --s-theme: #0b5fa5; --s-app: #64a9e3; --s-green: #1a7f37;
          --s-rest: #c4c4c0; --s-total: #9a9a96; }
  @media (prefers-color-scheme: dark) {
    :root { --amber: #e0a943; --soft: #232326;
            --s-theme: #2060a6; --s-app: #5295d4; --s-green: #3fae5e;
            --s-rest: #4a4a4e; --s-total: #6e6e72; } }
  /* Wider than the Land pages: the private page puts two charts side by
     side, and six tiles in a row want the room. Phones get one column. */
  body { max-width: 70rem; }
  h2 { border-bottom: 0; margin-top: 0; padding-bottom: 0; font-size: 1.3rem; }
  h3 { font-size: 1rem; margin: 0; }
  section { margin-top: 2.8rem; display: flex; flex-direction: column; gap: 0.9rem; }
  .lead { color: var(--muted); font-size: 0.92rem; max-width: 72ch; margin: 0.25rem 0 0; }
  .meta { color: var(--muted); font-size: 0.9rem; margin: 0; }
  .ok { color: var(--green); font-weight: 600; }
  .bad { color: var(--red); font-weight: 600; }
  .warn { color: var(--amber); font-weight: 600; }
  ul.anomalies { margin: 0; }
  ul.anomalies li { color: var(--red); }
  /* A mirror's WARN line carries a full URL and sometimes CJK text from an
     OSM name; wrapped in a monospace <li> with nothing to break on, a single
     120+ char token would otherwise force the whole page wider than a phone
     screen instead of the list item alone. overflow-wrap: anywhere breaks
     such a token at any character, only when normal wrapping runs out of
     spaces to break on. */
  ul.warns { font-size: 0.85rem; font-family: ui-monospace, Menlo, monospace;
             padding-left: 1.2rem; overflow-wrap: anywhere; }
  /* The failed-build line quotes the exception message verbatim; a long
     traceback line (a file path, say) is the same hazard as a WARN line. */
  code { overflow-wrap: anywhere; }
  .head { display: flex; flex-direction: column; gap: 0.6rem; }
  .head .row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 1rem; }
  .head h1 { margin: 0; }
  .pill { display: inline-flex; align-items: center; gap: 0.45rem; border: 1px solid var(--line);
          border-radius: 999px; padding: 0.25rem 0.75rem 0.25rem 0.55rem; font-size: 0.85rem;
          font-weight: 600; min-height: 28px; }
  .pill .dot { margin: 0; }
  .tag { display: inline-block; border: 1px solid var(--line); border-radius: 999px;
         padding: 0 0.55rem; font-size: 0.78rem; color: var(--muted); font-weight: 400; }
  nav.jump { display: flex; flex-wrap: wrap; gap: 0.25rem 1.1rem; font-size: 0.9rem; }
  /* Stat tiles: label, the number, one line of context. The grid folds to
     two and then one column as the screen narrows. */
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(10.5rem, 1fr));
           gap: 0.75rem; }
  .tile { border: 1px solid var(--line); border-radius: 8px; padding: 0.75rem 0.9rem;
          display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
  .tile .l { font-size: 0.82rem; color: var(--muted); }
  .tile .v { font-size: 1.75rem; font-weight: 600; line-height: 1.15;
             font-variant-numeric: tabular-nums; display: flex; align-items: baseline;
             gap: 0.5rem; flex-wrap: wrap; }
  .tile .v small { font-size: 0.9rem; font-weight: 500; color: var(--muted); }
  .tile .s { font-size: 0.82rem; color: var(--muted); }
  .tile.dim .v { color: var(--muted); }
  .card { border: 1px solid var(--line); border-radius: 8px; padding: 1rem;
          display: flex; flex-direction: column; gap: 0.75rem; min-width: 0; }
  .two { display: grid; grid-template-columns: repeat(auto-fit, minmax(19rem, 1fr)); gap: 1rem; }
  .two > div { min-width: 0; display: flex; flex-direction: column; gap: 0.6rem; }
  .empty { border: 1px dashed var(--line); border-radius: 8px; padding: 0.9rem;
           color: var(--muted); font-size: 0.9rem; }
  /* Every chart is one frame: the value axis in the left column, the
     drawing, its date axis and (for the pinned lines) the pin list in the
     right. The axis is HTML beside the drawing rather than part of it (SVG
     text would be warped by the line's non-uniform viewBox stretch, and the
     column charts are plain divs), on the drawing's grid row so that its
     percentages and the drawing's refer to the same height. That is why
     the drawing itself carries no margin or padding: box-sizing is
     border-box, so a padding on it would shrink the box its bars are
     measured in while the axis beside it kept the full height. A frame
     that prints numbers above its columns, or pins above its line, gets
     the headroom as padding on the frame. */
  .chart { display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 0.5rem;
           row-gap: 0.25rem; margin: 0; }
  .chart-y { grid-area: 1 / 1; position: relative; min-width: 2.3rem;
             font-size: 0.75rem; color: var(--muted);
             font-variant-numeric: tabular-nums; }
  .chart-y span { position: absolute; right: 0; line-height: 1;
                  transform: translateY(50%); }
  .chart > .bars, .chart > .line, .chart > .stack { grid-area: 1 / 2; min-width: 0; }
  .chart > .x { grid-area: 2 / 2; }
  .chart > .pins { grid-area: 3 / 2; }
  .x { display: flex; justify-content: space-between; gap: 0.5rem; font-size: 0.75rem;
       color: var(--muted); font-variant-numeric: tabular-nums; }
  .x span:nth-child(2) { text-align: center; }
  .x span:first-child, .x span:last-child { white-space: nowrap; }
  .legend { display: flex; flex-wrap: wrap; gap: 0.3rem 1rem; font-size: 0.85rem;
            color: var(--muted); align-items: center; margin: 0; }
  .sw { width: 10px; height: 10px; border-radius: 2px; display: inline-block;
        margin-right: 0.4rem; vertical-align: -1px; }
  /* Column charts, one flex column per calendar day — the Bürgerwecker admin
     pattern: no library, the exact numbers live in each column's title. The
     background is the axis's three gridlines (0, half, top), drawn behind
     the bars without an element each. A stacked column is its segments
     bottom-up with a 2px surface gap between them; the top one is capped. */
  .bars { display: flex; align-items: flex-end; justify-content: center; gap: 2px; height: 120px;
          background:
            linear-gradient(var(--line), var(--line)) 0 0 / 100% 1px no-repeat,
            linear-gradient(var(--line), var(--line)) 0 50% / 100% 1px no-repeat,
            linear-gradient(var(--line), var(--line)) 0 100% / 100% 1px no-repeat; }
  .col { flex: 1 1 0; min-width: 0; max-width: 24px; height: 100%; display: flex;
         flex-direction: column; justify-content: flex-end; gap: 2px; position: relative; }
  .col:hover .seg { filter: brightness(1.18); }
  .seg { width: 100%; flex-shrink: 0; }
  .seg.cap { border-radius: 3px 3px 0 0; }
  .seg.theme { background: var(--s-theme); }
  .seg.app { background: var(--s-app); }
  .seg.green { background: var(--s-green); }
  .seg.rest { background: var(--s-rest); }
  .seg.gone { background: var(--s-rest); border-radius: 0 0 3px 3px; }
  .seg.clip { background: repeating-linear-gradient(135deg, var(--s-theme) 0 4px, var(--bg) 4px 6px); }
  .col .n { position: absolute; left: 50%; transform: translateX(-50%); bottom: 100%;
            font-size: 0.7rem; line-height: 1; margin-bottom: 3px; color: var(--muted);
            font-variant-numeric: tabular-nums; white-space: nowrap; }
  @media (max-width: 560px) { .col .n { display: none; } }
  /* The added/removed chart: two column rows on one axis, added growing
     up from the shared baseline, removed hanging down from it. */
  .stack { display: flex; flex-direction: column; }
  .stack .bars.down { align-items: flex-start;
          background:
            linear-gradient(var(--line), var(--line)) 0 0 / 100% 1px no-repeat,
            linear-gradient(var(--line), var(--line)) 0 100% / 100% 1px no-repeat; }
  .stack .bars.down .col { justify-content: flex-start; }
  /* Lines: one polyline (plus a 10 % wash where the line is cumulative) on
     the same three gridlines; pins are HTML over the SVG, a dashed line
     per coverage event with a numbered disc above it, the names in the
     list under the axis — nothing written sits inside the drawing. */
  .line { position: relative; height: 120px;
          background:
            linear-gradient(var(--line), var(--line)) 0 0 / 100% 1px no-repeat,
            linear-gradient(var(--line), var(--line)) 0 50% / 100% 1px no-repeat,
            linear-gradient(var(--line), var(--line)) 0 100% / 100% 1px no-repeat; }
  .line svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block;
              overflow: visible; }
  .line.ended, .x.ended, .pins.ended { margin-right: 2.9rem; }
  .mark { position: absolute; top: 0; bottom: 0; border-left: 1px dashed var(--grey);
          pointer-events: none; }
  .pin { position: absolute; top: -22px; width: 16px; height: 16px; margin-left: -8px;
         border-radius: 50%; background: var(--grey); color: var(--bg); font-size: 0.65rem;
         font-weight: 600; line-height: 16px; text-align: center; pointer-events: none; }
  .pins { display: flex; flex-wrap: wrap; gap: 0.25rem 0.9rem; font-size: 0.78rem;
          color: var(--muted); font-variant-numeric: tabular-nums; }
  .pins b { display: inline-block; width: 16px; height: 16px; border-radius: 50%;
            background: var(--grey); color: var(--bg); font-size: 0.65rem; font-weight: 600;
            line-height: 16px; text-align: center; margin-right: 0.3rem; vertical-align: 1px; }
  .end { position: absolute; right: -6px; transform: translate(100%, 50%); font-size: 0.78rem;
         font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .enddot { position: absolute; right: -5px; width: 10px; height: 10px; border-radius: 50%;
            transform: translateY(50%); box-shadow: 0 0 0 2px var(--bg); }
  /* The dataset as one proportion bar, three segments with surface gaps. */
  .share { display: flex; gap: 2px; height: 22px; border-radius: 4px; overflow: hidden; }
  .share div { min-width: 3px; }
  details { border-top: 1px solid var(--line); padding-top: 0.6rem; font-size: 0.9rem; }
  details > summary { cursor: pointer; font-weight: 600; margin: 0; display: flex;
                      flex-wrap: wrap; align-items: center; gap: 0.5rem; min-height: 28px; }
  details > p { color: var(--muted); max-width: 72ch; }
  details details { border-top: 0; padding-top: 0; }
  table { margin: 0.5rem 0 0; }
  th { color: var(--muted); }
  dl.kv { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 0.25rem 1rem;
          font-size: 0.9rem; margin: 0; }
  dl.kv dt { color: var(--muted); }
  dl.kv dd { margin: 0; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  td.pos { color: var(--green); } td.neg { color: var(--red); }
  footer { margin-top: 3rem; font-size: 0.85rem; color: var(--muted);
           border-top: 1px solid var(--line); padding-top: 0.8rem; }
"""


# ---- pipeline.log ----------------------------------------------------------

def parse_build_log(text: str | None) -> dict | None:
    """The last build in an append-only log, as data. None when there is no
    build in it at all. A build is the lines up to a result line; lines after
    the last result line are a build that has not finished — a run in
    progress at 07:30, or one that died, which the caller tells apart by
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
                "play": int(m["play"]), "toilets": int(m["toilets"]),
                **({"recount_failed": True} if m["failed"] else {})})
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


def group_warns(warns: list[str], limit: int = 40) -> list[tuple[int, str]]:
    """WARN lines folded into (count, message) rows, most frequent first. A
    bad night repeats the same three mirror messages a thousand times (1,126
    lines on 23 Aug 2026); the count is the information, not the repetition.
    Per-area failures differ only by the area and the query URL, so the URL
    is dropped and the area kept — "Poznań: 500 Server Error" is one row per
    area, which is what you want to read. Past `limit` rows the rest is one
    summary row."""
    counts: dict[str, int] = {}
    for w in warns:
        key = re.sub(r"\s+for url:.*$", "", w)
        key = re.sub(r"\?data=\S*", "?data=…", key)
        counts[key] = counts.get(key, 0) + 1
    rows = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    out = [(n, msg) for msg, n in rows[:limit]]
    rest = rows[limit:]
    if rest:
        out.append((sum(n for _, n in rest),
                    f"… {len(rest)} more distinct warnings"))
    return out


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


# One flex column per calendar day: at 60 the columns are still individually
# hoverable on a phone, and the table/tooltips carry anything older.
CHART_DAYS = 60
# The day the room question could first be answered on the map itself
# (web/osm.js, PR #92): no earlier changeset carries created_by=PapaMap, so
# a history reaching back to it is all time, as the theme's is to its launch.
WEB_ANSWERS_SINCE = "2026-09-13"


def _day_range(first: str, last: str, cap: int | None = CHART_DAYS) -> list[str]:
    """Every calendar day from `first` to `last` inclusive, at most the `cap`
    newest (None: all of them) — the continuous axis is what makes a missed
    night visible as a gap instead of silently stitching its neighbours
    together."""
    try:
        d1 = date.fromisoformat(last)
        d0 = date.fromisoformat(first)
        if cap is not None:
            d0 = max(d0, d1 - timedelta(days=cap - 1))
    except ValueError:
        return []
    return [(d0 + timedelta(days=i)).isoformat()
            for i in range((d1 - d0).days + 1)]


def transition_rows(history: list[dict]) -> list[tuple]:
    """(day, tooltip, transitions, to_accessible) per calendar day for the
    movement chart. Bar height counts status transitions only: new/gone swing
    by the thousands when an area fails or comes back, and would flatten the
    real signal — they stay in the tooltip. None = no run that day."""
    by_date = {e["date"]: e for e in history
               if isinstance(e.get("date"), str)}
    days = sorted(by_date)
    rows = []
    for d in _day_range(days[0], days[-1]) if days else []:
        e = by_date.get(d)
        if e is None:
            rows.append((d, f"{d} · no run", None, 0))
            continue
        ch = e.get("changes") or {}
        ta = ch.get("to_accessible", 0)
        tf, tu = ch.get("to_female_only", 0), ch.get("to_unknown", 0)
        tip = (f"{d} · {ta} → accessible, {tf} → female-only, {tu} → unknown"
               f" · +{ch.get('new', 0)} new, -{ch.get('gone', 0)} gone")
        rows.append((d, tip, ta + tf + tu, ta))
    return rows


def edits_rows(edits_days: dict | None, noun: str = "changeset") -> list[tuple]:
    """(day, tooltip, count, count) per calendar day for the theme-edits
    chart and its sibling for the answers (`noun` is what the tooltip counts).
    A day the state holds a 0 for is a real zero; a day it never fetched
    (OSMCha down, token unset) is None, not a claimed quiet."""
    days = sorted(edits_days or {})
    rows = []
    for d in _day_range(days[0], days[-1]) if days else []:
        n = (edits_days or {}).get(d)
        if n is None:
            rows.append((d, f"{d} · not fetched", None, 0))
        else:
            rows.append((d, f"{d} · {n} {noun}{'' if n == 1 else 's'}", n, n))
    return rows


def edit_totals(edits_days: dict | None,
                live_since: str = THEME_LIVE_SINCE) -> list[dict]:
    """The tiles over a per-day changeset history: the last 7 and 30 days
    and every recorded day. Windows are calendar days back from the newest
    *recorded* day, so a run of failed fetches shows up as the tile's dates
    standing still (and as `days` < `span`), never as the window quietly
    widening. A window the history cannot fill is left out — the all-days
    tile already says how much there is — and that tile is called all time
    once the history reaches back to `live_since` (the theme's launch, or
    the answers' first possible day), because no earlier changeset can
    carry the tag."""
    days = sorted((edits_days or {}).items())
    if not days:
        return []
    try:
        last = date.fromisoformat(days[-1][0])
    except ValueError:
        return []
    tiles = []
    for n in (7, 30):
        start = (last - timedelta(days=n - 1)).isoformat()
        if start <= days[0][0]:
            continue
        window = [(d, v) for d, v in days if d >= start]
        tiles.append({"label": f"last {n} days", "span": n,
                      "changesets": sum(v for _, v in window),
                      "days": len(window), "first": window[0][0],
                      "last": window[-1][0]})
    all_time = days[0][0] <= live_since
    tiles.append({"label": "all time" if all_time
                  else f"all {len(days)} recorded days",
                  "span": len(days), "changesets": sum(v for _, v in days),
                  "days": len(days), "first": days[0][0], "last": days[-1][0],
                  "all_time": all_time})
    return tiles


def _nice_top(hi: float, whole_half: bool = False) -> float:
    """The smallest round number (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 × a power of
    ten) at or above `hi`: the top of a zero-based axis that the line nearly
    fills, so 2,960 gets 3,000 rather than 5,000. With `whole_half`, only a
    top whose half is a whole number (2, 4, 6, 8, 10, 20, 30, … never 1, 3,
    5, 15 or 25): a chart of counts should not label a gridline "1.5". The
    price is a tallest column at 75 % or 83 % now and then instead of 100 %."""
    if hi <= 0:
        return 2 if whole_half else 1
    mag = 10 ** math.floor(math.log10(hi))
    for m in (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10):
        top = m * mag
        if top >= hi and not (whole_half and top % 2):
            return top
    return 10 * mag


def _y_labels(top: float) -> str:
    """The value axis every chart carries: 0, half and `top`, HTML beside the
    drawing at the heights the drawing uses (see .chart in OPS_STYLE). A
    small top can be a half-step (1.5, 15), so half of it is not always a
    whole number; print the one decimal rather than round 7.5 to "8"."""
    labels = "".join(
        f'<span style="bottom:{100 * t / top:.0f}%">'
        f'{t:,.0f}</span>' if t == int(t) else
        f'<span style="bottom:{100 * t / top:.0f}%">{t:,.1f}</span>'
        for t in (0, top / 2, top))
    return f'<div class="chart-y" aria-hidden="true">{labels}</div>'


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


def _missing_days(last: str, now: datetime) -> int:
    """How many complete days a per-day history stops short of yesterday —
    0 when it is current or its last date is unreadable."""
    yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")
    try:
        return (date.fromisoformat(yesterday) - date.fromisoformat(last)).days
    except ValueError:
        return 0




# ---- Coverage steps ---------------------------------------------------------

# The nights the sweep grew, with the label their chart pin carries. A night
# whose `new` figure is a jump (JUMP_SHARE of the dataset, at least JUMP_MIN)
# is a coverage step — coverage_steps() finds them in the history — and its
# label is the entry here nearest to it (within two days); a jump with no
# entry is the other thing that produces one, a sweep area back after a
# failed night, and a jump in `gone` is an area failing. Append a row when
# PAPAMAP_COUNTRIES grows; two expansions on consecutive nights share one
# row and one pin, as the two pairs here do.
COVERAGE_EVENTS = [
    ("2026-08-04", "Denmark"),
    ("2026-08-18", "7 neighbours 08-18, UK and France 08-19"),
    ("2026-08-24", "Europe, 44 countries"),
    ("2026-09-04", "AU and NZ 09-04, US, CA and JP 09-05"),
]
JUMP_SHARE = 0.02
JUMP_MIN = 200


def _event_label(day: str) -> str | None:
    try:
        d = date.fromisoformat(day)
    except ValueError:
        return None
    best = None
    for when, label in COVERAGE_EVENTS:
        gap = abs((date.fromisoformat(when) - d).days)
        if gap <= 2 and (best is None or gap < best[0]):
            best = (gap, label)
    return best[1] if best else None


def jump_nights(history: list[dict]) -> list[dict]:
    """Every run whose dataset jumped — `new` or `gone` at least JUMP_SHARE
    of the night before's total and JUMP_MIN — as {'date', 'label',
    'index'}, one per night, unfolded: the added/removed chart clips each
    of them. The label is the coverage event nearest to the night, else
    the other thing such a night is."""
    out: list[dict] = []
    prev_total = None
    for i, e in enumerate(history):
        c, ch = e.get("counts") or {}, e.get("changes") or {}
        total = c.get("total")
        new, gone = int(ch.get("new") or 0), int(ch.get("gone") or 0)
        day = str(e.get("date") or "")
        if prev_total:
            floor = max(JUMP_MIN, JUMP_SHARE * prev_total)
            if new >= floor:
                out.append({"date": day, "index": i, "label": (
                    _event_label(day)
                    or f"+{new:,} pins, sweep areas back after a failed night")})
            elif gone >= floor:
                out.append({"date": day, "index": i,
                            "label": f"−{gone:,} pins, a sweep area failed that night"})
        if isinstance(total, int):
            prev_total = total
    return out


def coverage_steps(history: list[dict]) -> list[dict]:
    """The jump nights folded into events — consecutive nights with the
    same label (two expansions in a row) become one entry at the first —
    with `index` the run's position in `history`, which is the x of its
    pin on the two lines."""
    steps: list[dict] = []
    for j in jump_nights(history):
        last = steps[-1] if steps else None
        if not (last and last["label"] == j["label"] and j["index"] - last["index"] <= 2):
            steps.append(dict(j))
    return steps


# ---- Chart pieces -----------------------------------------------------------

def _tile(label: str, value: str, sub: str = "", *, small: str = "",
          cls: str = "") -> str:
    """One stat tile: label, the number, one line of context. The caller
    escapes anything that came from outside."""
    return (f'<div class="tile{(" " + cls) if cls else ""}"><span class="l">{label}</span>'
            f'<span class="v">{value}{f" <small>{small}</small>" if small else ""}</span>'
            + (f'<span class="s">{sub}</span>' if sub else "") + "</div>\n")


def _axis(first, last, caption: str = "", ended: bool = False) -> str:
    """The date axis every chart gets: first and last date under the ends
    of the drawing, a caption between them."""
    return (f'<div class="x{" ended" if ended else ""}"><span>{esc(first)}</span>'
            f"<span>{caption}</span><span>{esc(last)}</span></div>\n")


def _frame(top: float, drawing: str, axis: str, *, pad: int = 0,
           extra: str = "") -> str:
    """One chart frame: the value axis for `top` left, the drawing and its
    date axis right. `pad` is headroom for numbers or pins above the
    drawing, on the frame so the drawing keeps its measured height."""
    style = f' style="padding-top:{pad}px"' if pad else ""
    return f'<div class="chart"{style}>{_y_labels(top)}{drawing}{axis}{extra}</div>\n'


def _columns(rows: list[tuple], top: float, *, labels_from: int | None = None,
             height: int = 120, cls: str = "") -> str:
    """The column chart: one column per row (day, tooltip, stack), the stack
    a list of (series class, value) bottom-up. A None stack is a day with no
    figure — an empty slot, not a zero. Segments are measured against `top`
    (a round axis top, never the tallest value), a total beyond it is drawn
    clipped and hatched with its number printed, and with `labels_from` the
    total is printed above every column reaching it — selectively, so the
    numbers that matter stay readable; the axis and the tooltip carry the
    rest. Dark mode and the colours are the segment classes' business."""
    cols = []
    prev_clipped = False
    for day, tip, stack in rows:
        total = sum(v for _, v in stack) if stack else 0
        parts = []
        clipped = bool(stack) and total > top
        if clipped:
            # Two coverage nights in a row (an expansion over two nights)
            # would print their numbers on top of each other: the second
            # keeps its number in the tooltip and the pin list.
            parts.append(("" if prev_clipped else f'<span class="n">{total:,}</span>')
                         + '<div class="seg clip cap" style="height:100%"></div>')
        elif stack and total:
            segs = [(c, v) for c, v in stack if v]
            html = []
            for j, (c, v) in enumerate(segs):
                cap = " cap" if j == len(segs) - 1 else ""
                html.append(f'<div class="seg {c}{cap}" style="height:{100 * v / top:.1f}%"></div>')
            if labels_from is not None and total >= labels_from:
                parts.append(f'<span class="n">{total:,}</span>')
            parts.extend(reversed(html))  # flex-end: the last child sits at the bottom
        cols.append(f'<div class="col" title="{esc(tip)}">{"".join(parts)}</div>')
        prev_clipped = clipped
    attr = f' style="height:{height}px"' if height != 120 else ""
    return f'<div class="bars{(" " + cls) if cls else ""}"{attr}>' + "".join(cols) + "</div>\n"


def _line(values: list, top: float, color_var: str, *, area: bool = False,
          pins: list[dict] | None = None, end: str | None = None,
          height: int = 120) -> str:
    """One polyline on the three gridlines, zero-based: a min-to-max axis
    made 941 → 2,960 look like the same climb as 2,950 → 2,960. The viewBox
    is stretched non-uniformly, so the stroke is told not to scale and
    every label is HTML over the SVG: the pins (a dashed line and a numbered
    disc at a value's x) and the end label with its dot. `values` may hold
    None for a run without the figure; such a point is skipped."""
    pts = [(i, v) for i, v in enumerate(values) if isinstance(v, (int, float))]
    if len(pts) < 2:
        return ""
    w, h = 600, 100
    n = len(values)
    x = lambda i: i * w / (n - 1)  # noqa: E731
    coords = " ".join(f"{x(i):.1f},{h - v / top * h:.1f}" for i, v in pts)
    lo, hi = min(v for _, v in pts), max(v for _, v in pts)
    poly = (f'<polygon points="0,{h} {coords} {x(pts[-1][0]):.1f},{h}" '
            f'style="fill:var({color_var});opacity:0.1"/>' if area else "")
    svg = (f'<svg viewBox="0 0 {w} {h}" preserveAspectRatio="none" role="img" '
           f'aria-label="{lo:,} to {hi:,}">{poly}'
           f'<polyline fill="none" stroke="var({color_var})" stroke-width="2" '
           'stroke-linejoin="round" stroke-linecap="round" '
           f'vector-effect="non-scaling-stroke" points="{coords}"/></svg>')
    over = ""
    for k, p in enumerate(pins or [], 1):
        left = 100 * p["index"] / (n - 1)
        over += (f'<div class="mark" style="left:{left:.1f}%"></div>'
                 f'<div class="pin" style="left:{left:.1f}%">{k}</div>')
    if end is not None:
        bottom = 100 * pts[-1][1] / top
        over += (f'<div class="enddot" style="bottom:{bottom:.1f}%;'
                 f'background:var({color_var})"></div>'
                 f'<div class="end" style="bottom:{bottom:.1f}%">{end}</div>')
    attr = f' style="height:{height}px"' if height != 120 else ""
    return (f'<div class="line{" ended" if end is not None else ""}"{attr}>'
            f"{svg}{over}</div>\n")


def _pins(steps: list[dict], ended: bool = False) -> str:
    """The list under a pinned chart: the number, then what happened."""
    if not steps:
        return ""
    items = "".join(f"<span><b>{k}</b>{esc(s['label'])}, {esc(s['date'])}</span>"
                    for k, s in enumerate(steps, 1))
    return f'<div class="pins{" ended" if ended else ""}">{items}</div>\n'


def _legend(*items: tuple) -> str:
    return ('<p class="legend">' + "".join(
        f'<span><span class="sw" style="background:var({var})"></span>{text}</span>'
        for var, text in items) + "</p>\n")


def _window(history: list[dict], n: int) -> dict:
    return _sum_changes(history[-n:]) if history else {
        k: 0 for k in ("new", "gone", "to_accessible", "to_female_only", "to_unknown")}


# ---- Readers (private) ------------------------------------------------------

def readers_stats(readers: dict | None, now: datetime) -> dict | None:
    """The numbers over the readers series ({day: count}, complete UTC days,
    from the fleet collector's ledger): the newest day and whether it is
    yesterday, the average over the newest seven recorded days and the
    seven before them, the newest 30 days' sum, the best day. None without
    a day."""
    days = sorted((readers or {}).items())
    if not days:
        return None
    yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")
    last_day, last = days[-1]
    week = days[-7:]
    before = days[-14:-7]
    best_day, best = max(days, key=lambda kv: (kv[1], kv[0]))
    return {"last_day": last_day, "last": last, "is_yesterday": last_day == yesterday,
            "week_avg": round(sum(v for _, v in week) / len(week)),
            "week_days": len(week),
            "before_avg": (round(sum(v for _, v in before) / len(before))
                           if before else None),
            "month": sum(v for _, v in days[-30:]), "month_days": len(days[-30:]),
            "best": best, "best_day": best_day,
            "first": days[0][0], "days": len(days)}


def _readers_section(readers: dict | None, visits: dict | None,
                     now: datetime) -> str:
    """The private page's first section. Readers are the fleet collector's
    count — distinct browser addresses on document paths per complete UTC
    day, crawlers, link previews and floods taken out — which the check
    copies into its state when the ledger is mounted. Cloudflare's raw
    uniques and requests, bots included, stay underneath for reference,
    and carry the section alone while there is no readers series."""
    p = ['<section id="readers">\n<div><h2>Readers</h2>\n'
         '<p class="lead">People who opened a page: distinct browser addresses '
         "on document paths per complete UTC day, with crawlers, link previews "
         "and floods taken out. Cloudflare's raw uniques sit underneath for "
         "reference only.</p></div>\n"]
    st = readers_stats(readers, now)
    vdays = sorted((visits or {}).items())
    if st is None:
        if not vdays:
            p.append('<p class="muted">No readers or Cloudflare figures yet — '
                     "PAPAMAP_READERS_LEDGER_PATH and CF_ANALYTICS_TOKEN/CF_ZONE_TAG "
                     "unset, or the first fetch is still to come.</p>\n</section>\n")
            return "".join(p)
        p.append('<p class="muted">No readers series yet — '
                 "PAPAMAP_READERS_LEDGER_PATH unset, or the ledger has no "
                 "complete day for this zone yet. Cloudflare's uniques stand in, "
                 "bots included.</p>\n")
        week = vdays[-7:]
        p.append('<div class="tiles">\n'
                 + _tile("Uniques yesterday", _n(vdays[-1][1]["uniques"]),
                         esc(vdays[-1][0]))
                 + _tile("Uniques, last 7 days", _n(sum(v["uniques"] for _, v in week)),
                         f"{esc(week[0][0])} → {esc(week[-1][0])}")
                 + _tile("Requests, last 7 days", _n(sum(v["requests"] for _, v in week)),
                         "every request the edge saw")
                 + "</div>\n")
        rows = [(d, f"{d} · {v['uniques']:,} uniques · {v['requests']:,} requests",
                 [("theme", v["uniques"])]) for d, v in vdays[-CHART_DAYS:]]
        top = _nice_top(max(v["uniques"] for _, v in vdays[-CHART_DAYS:]) or 1,
                        whole_half=True)
        p.append(_frame(top, _columns(rows, top),
                        _axis(rows[0][0], rows[-1][0], "Cloudflare uniques per day")))
    else:
        label = "Yesterday" if st["is_yesterday"] else f"Newest day, {esc(st['last_day'])}"
        p.append('<div class="tiles">\n'
                 + _tile(label, _n(st["last"]),
                         esc(st["last_day"]) + ", complete UTC day"
                         if st["is_yesterday"] else "the ledger stops here")
                 + _tile("7-day average", _n(st["week_avg"]),
                         (f"week before {_n(st['before_avg'])}" if st["before_avg"] is not None
                          else f"{st['week_days']} day{'s' if st['week_days'] != 1 else ''} recorded"))
                 + _tile(f"Last {st['month_days']} days", _n(st["month"]),
                         "readers summed, a daily reader counted daily")
                 + _tile("Best day", _n(st["best"]), esc(st["best_day"]))
                 + "</div>\n")
        missing = _missing_days(st["last_day"], now)
        if missing > 0:
            p.append(f'<p class="warn">The readers ledger has no complete day after '
                     f"{esc(st['last_day'])}: {missing} day{'' if missing == 1 else 's'} "
                     "missing from the tiles and the chart, which stop there.</p>\n")
        days = sorted(readers.items())
        span = _day_range(days[0][0], days[-1][0])
        rows = [(d, f"{d} · {readers[d]:,} readers" if d in readers else f"{d} · no count",
                 [("theme", readers[d])] if d in readers else None) for d in span]
        top = _nice_top(max(readers[d] for d in span if d in readers) or 1, whole_half=True)
        p.append(_frame(top, _columns(rows, top),
                        _axis(span[0], span[-1], f"readers per day, the last {len(span)} days")))
    # The raw figures, every day either source has, newest first.
    all_days = sorted(set(readers or {}) | set(visits or {}), reverse=True)
    if all_days:
        p.append(f'<details>\n<summary>Every day <span class="tag">'
                 f"Cloudflare raw figures, bots included</span></summary>\n"
                 '<p>Zone-level totals per complete UTC day, every request the '
                 "edge saw. On a normal day most of the uniques are not people, "
                 "which is why the chart counts readers instead.</p>\n"
                 '<div class="scroll">\n<table>\n<thead><tr><th class="l">day</th>'
                 "<th>readers</th><th>uniques</th><th>requests</th></tr></thead>\n<tbody>\n")
        for d in all_days:
            r = (readers or {}).get(d)
            v = (visits or {}).get(d) or {}
            p.append(f'<tr><td class="l">{esc(d)}</td><td>{_n(r)}</td>'
                     f'<td>{_n(v.get("uniques"))}</td><td>{_n(v.get("requests"))}</td></tr>\n')
        p.append("</tbody>\n</table>\n</div>\n</details>\n")
    p.append("</section>\n")
    return "".join(p)


# ---- Apps (private) ---------------------------------------------------------

def _apps_section(apps: dict | None, app_days: dict | None,
                  ratings: dict | None, now: datetime) -> str:
    """The private page's Apps section: App Store downloads per day (App
    Store Connect's daily Sales report), Google Play installs per day (the
    Play Console's statistics CSVs) and App Store ratings per storefront
    (the public lookup API) — what the stores show their developer, nothing
    about any one reader. One card per store; each source stands alone, and
    unset, failed and not-yet-published are each said in words, never shown
    as a zero. `apps` is this run's fetch (None when no store id is
    configured), `app_days` the state's per-day history, `ratings` the last
    snapshot."""
    p = ['<section id="apps">\n<div><h2>Apps</h2>\n']
    if apps is None and not app_days and not ratings:
        p.append('<p class="lead">No store figures — PAPAMAP_APP_STORE_ID / '
                 "PAPAMAP_ANDROID_PACKAGE unset, or the first fetch is still "
                 "to come.</p></div>\n</section>\n")
        return "".join(p)
    p.append('<p class="lead">What the stores show their developer, per '
             "complete day: App Store downloads from the daily Sales report, "
             "Google Play installs from the Console's statistics, ratings from "
             "the public store pages. Days are the stores' own; Apple "
             "publishes a day the afternoon after, so yesterday arrives "
             "tomorrow.</p></div>\n")
    days = sorted((app_days or {}).items())
    ios = {d: v["ios_downloads"] for d, v in days if "ios_downloads" in v}
    android = {d: v["android_installs"] for d, v in days
               if "android_installs" in v}
    ios_fetch = (apps or {}).get("ios") if apps else "skipped"
    android_fetch = (apps or {}).get("android") if apps else "skipped"
    p.append('<div class="two">\n')

    # ---- App Store
    head = ["<h3>App Store</h3>"]
    if ratings and ratings.get("version"):
        head.append(f'<span class="meta">version {esc(str(ratings["version"]))}'
                    + (f' since {esc(str(ratings["released"]))}'
                       if ratings.get("released") else "") + "</span>")
    p.append('<div class="card">\n<div class="row" style="display:flex;flex-wrap:wrap;'
             f'align-items:baseline;gap:0.6rem">{"".join(head)}</div>\n')
    notes = []
    if ios_fetch is None:
        notes.append('<p class="muted">Downloads not fetched — ASC_ISSUER_ID, '
                     "ASC_KEY_ID, ASC_API_KEY_P8_B64 and ASC_VENDOR_NUMBER unset "
                     "(DEPLOY.md).</p>\n")
    elif isinstance(ios_fetch, dict) and ios_fetch.get("error"):
        notes.append(f'<p class="warn">App Store report: failed '
                     f'({esc(ios_fetch["error"])}). Not zero.</p>\n')
    elif isinstance(ios_fetch, dict) and ios_fetch.get("pending"):
        pend = sorted(ios_fetch["pending"])
        notes.append(f'<p class="muted">Apple has not published '
                     f"{', '.join(esc(d) for d in pend)} yet.</p>\n")
    tiles = edit_totals(ios, APP_STORE_LIVE_SINCE)
    by_label = {t["label"]: t for t in tiles}
    rating_tile = ""
    if ratings:
        stores = ", ".join(f"{esc(cc)} {_n(s['count'])}"
                           for cc, s in sorted(ratings.get("stores", {}).items(),
                                               key=lambda kv: -kv[1]["count"]))
        rating_tile = _tile("Ratings", _n(ratings.get("total", 0)),
                            stores or "no storefront yet",
                            small=(f"{ratings['avg']} average" if ratings.get("avg") else ""))
    if tiles:
        week = by_label.get("last 7 days")
        allt = tiles[-1]
        p.append('<div class="tiles">\n')
        if week:
            sub = f"{esc(week['first'])} → {esc(week['last'])}"
            if week["days"] < week["span"]:
                sub += f" ({week['days']} of {week['span']} days published)"
            p.append(_tile("Downloads, 7 days", _n(week["changesets"]), sub))
        p.append(_tile("Since launch" if allt.get("all_time")
                       else f"All {allt['days']} published days",
                       _n(allt["changesets"]),
                       f"in the store since {APP_STORE_LIVE_SINCE}" if allt.get("all_time")
                       else f"{esc(allt['first'])} → {esc(allt['last'])}"))
        p.append(rating_tile + "</div>\n")
        p.extend(notes)
        rows = [(d, f"{d} · {v:,} download{'' if v == 1 else 's'}",
                 [("theme", max(0, v))]) for d, v in sorted(ios.items())[-CHART_DAYS:]]
        top = _nice_top(max(v for _, _, s in rows for _, v in s) or 1, whole_half=True)
        p.append(_frame(top, _columns(rows, top, labels_from=1, height=90),
                        _axis(rows[0][0], rows[-1][0], "first-time downloads per day"),
                        pad=16))
        redl = sum(v.get("ios_redownloads", 0) for _, v in days)
        upd = sum(v.get("ios_updates", 0) for _, v in days)
        p.append(f'<p class="meta">The same days also saw {_n(redl)} re-downloads '
                 f"and {_n(upd)} updates.</p>\n")
    else:
        if rating_tile:
            p.append('<div class="tiles">\n' + rating_tile + "</div>\n")
        p.extend(notes)
        if ios_fetch not in (None, "skipped") and not (isinstance(ios_fetch, dict)
                                                       and ios_fetch.get("error")):
            p.append('<p class="muted">No published day yet.</p>\n')
    if ratings and ratings.get("failed"):
        p.append('<p class="muted">Storefronts that did not answer this '
                 f"run, their last counts kept: "
                 f"{esc(', '.join(ratings['failed']))}.</p>\n")
    if ratings and ratings.get("as_of"):
        p.append(f'<p class="meta">Ratings as of {esc(str(ratings["as_of"]))}.</p>\n')
    p.append("</div>\n")

    # ---- Google Play
    p.append('<div class="card">\n<h3>Google Play</h3>\n')
    tiles = edit_totals(android, "0000-01-01")  # no fixed launch day: closed testing first
    if android_fetch is None:
        p.append('<div class="tiles">\n'
                 + _tile("Installs, 7 days", "–", "no report yet", cls="dim")
                 + _tile("Active devices", "–", "no report yet", cls="dim")
                 + "</div>\n"
                 '<div class="empty">Installs not fetched — '
                 "PLAY_SERVICE_ACCOUNT_JSON_B64 and PLAY_STATS_BUCKET unset "
                 "(DEPLOY.md). The Play Console publishes its first statistics "
                 "report some days after the first install; until then there "
                 "is no bucket to read.</div>\n")
    elif isinstance(android_fetch, dict) and android_fetch.get("error"):
        p.append(f'<p class="warn">Play statistics: failed '
                 f'({esc(android_fetch["error"])}). Not zero.</p>\n')
    if tiles:
        by_label = {t["label"]: t for t in tiles}
        week = by_label.get("last 7 days")
        p.append('<div class="tiles">\n')
        if week:
            sub = f"{esc(week['first'])} → {esc(week['last'])}"
            if week["days"] < week["span"]:
                sub += f" ({week['days']} of {week['span']} days reported)"
            p.append(_tile("Installs, 7 days", _n(week["changesets"]), sub))
        allt = tiles[-1]
        p.append(_tile(f"All {allt['days']} reported days", _n(allt["changesets"]),
                       f"{esc(allt['first'])} → {esc(allt['last'])}"))
        active = [(d, v["android_active"]) for d, v in days if "android_active" in v]
        if active:
            p.append(_tile("Active devices", _n(active[-1][1]), esc(active[-1][0])))
        p.append("</div>\n")
        rows = [(d, f"{d} · {v:,} install{'' if v == 1 else 's'}",
                 [("theme", max(0, v))]) for d, v in sorted(android.items())[-CHART_DAYS:]]
        top = _nice_top(max(v for _, _, s in rows for _, v in s) or 1, whole_half=True)
        p.append(_frame(top, _columns(rows, top, labels_from=1, height=90),
                        _axis(rows[0][0], rows[-1][0], "installs per day"), pad=16))
    elif android_fetch not in (None, "skipped") and not (
            isinstance(android_fetch, dict) and android_fetch.get("error")):
        p.append('<p class="muted">No reported day yet.</p>\n')
    p.append("</div>\n</div>\n")

    # ---- every day, both stores side by side
    if days:
        rows = list(reversed(days))
        cell = lambda v, k: _n(v[k]) if k in v else "–"  # noqa: E731
        p.append(f"<details>\n<summary>Every day, both stores "
                 f'<span class="tag">{len(rows)} days</span></summary>\n'
                 '<div class="scroll">\n<table>\n<thead><tr><th class="l">day</th>'
                 "<th>downloads</th><th>re-downloads</th><th>updates</th>"
                 "<th>installs</th><th>uninstalls</th><th>active</th>"
                 "</tr></thead>\n<tbody>\n")
        for d, v in rows:
            p.append(f'<tr><td class="l">{esc(d)}</td>'
                     f'<td>{cell(v, "ios_downloads")}</td>'
                     f'<td>{cell(v, "ios_redownloads")}</td>'
                     f'<td>{cell(v, "ios_updates")}</td>'
                     f'<td>{cell(v, "android_installs")}</td>'
                     f'<td>{cell(v, "android_uninstalls")}</td>'
                     f'<td>{cell(v, "android_active")}</td></tr>\n')
        p.append("</tbody>\n</table>\n</div>\n</details>\n")
    p.append("</section>\n")
    return "".join(p)


# ---- Edits via PapaMap ------------------------------------------------------

def _stale_notes(edits: dict | None, last: str, now: datetime, *,
                 web: bool = False) -> str:
    """The amber sentence over a per-day history that stops short: a count
    fresher than the split is a window beyond one OSMCha page, counted
    whole; otherwise the daily query has not answered since `last`."""
    failed = bool((edits or {}).get("error"))
    count = ((edits or {}).get("web_changesets") if web
             else (edits or {}).get("changesets")) if not failed else None
    as_of = (edits or {}).get("as_of") if count is not None else None
    try:
        count_through = ((date.fromisoformat(as_of) - timedelta(days=1)).isoformat()
                         if as_of else None)
    except ValueError:
        count_through = None
    noun = "answers" if web else "changesets"
    if count_through and count_through > last:
        what = f"count of answers" if web else "count"
        return (f'<p class="warn">OSMCha\'s {edits.get("days", 7)}-day {what} as '
                f"of {esc(as_of)} is <b>{_n(count)}</b>{'' if web else ' changesets'}, "
                f"but the per-day split stops at {esc(last)}: a window beyond one "
                "OSMCha page (~100 changesets) is counted whole, never split.</p>\n")
    missing = _missing_days(last, now)
    if missing > 0 and not failed:
        which = "answers query" if web else "query"
        return (f'<p class="warn">The daily OSMCha {which} has not answered '
                f"since {esc(last)}: {missing} day{'' if missing == 1 else 's'} "
                f"missing from the totals above, which stop at {esc(last)}.</p>\n")
    return ""


def _edits_section(edits: dict | None, edits_days: dict | None,
                   web_edits_days: dict | None, now: datetime) -> str:
    """The OSM changesets the site can claim, in one section: saved through
    its MapComplete theme (OSMCha's metadata filter on the theme URL) or an
    answer given on the map itself under the reader's own account (tagged
    created_by=PapaMap, OSMCha's editor filter). The two sets are disjoint,
    so the tiles add them, with the split beneath; the chart stacks the
    answers on the theme's changesets per day; the line adds them up since
    the first recorded day. Each series keeps its own stale note. While
    neither has a per-day history the dated OSMCha line (`edits`, the
    mail's figure) stands in, and a young history says so rather than
    looking broken."""
    p = ['<section id="edits">\n<div><h2>Edits via PapaMap</h2>\n'
         '<p class="lead">OSM changesets the site can claim: saved through its '
         "MapComplete theme, or an answer given on the map itself under the "
         "reader's own OSM account. Complete UTC days, counted by OSMCha, so "
         "today is counted tomorrow.</p></div>\n"]
    failed = bool((edits or {}).get("error"))
    if failed:
        p.append(f'<p>OSMCha, {edits.get("days", 7)} d: '
                 f'<span class="bad">unknown</span> — query failed '
                 f'({esc(edits["error"])}). Not zero.</p>\n')
    theme_tiles = edit_totals(edits_days)
    web_tiles = edit_totals(web_edits_days, WEB_ANSWERS_SINCE)
    if not theme_tiles and not web_tiles:
        if edits and not failed:
            as_of = f' as of {esc(edits["as_of"])}' if edits.get("as_of") else ""
            p.append(f'<p>OSMCha, {edits.get("days", 7)} d{as_of}: '
                     f'<b>{_n(edits.get("changesets"))}</b> changesets through the theme'
                     + (f', <b>{_n(edits["web_changesets"])}</b> answers on the map itself'
                        if edits.get("web_changesets") is not None else "")
                     + ".</p>\n")
            # The line is a 7-day total; without this sentence its lack of
            # a per-day breakdown reads as the chart being broken rather
            # than young (asked about on day one). Not under the error
            # line, where a promise about successes would contradict it.
            p.append('<p class="muted">A per-day chart of these appears here '
                     "once a daily OSMCha fetch records the split — the check "
                     "asks every run; a success covers a week, though a week "
                     "beyond ~100 changesets is counted whole rather than "
                     "split.</p>\n")
        p.append("</section>\n")
        return "".join(p)

    theme_by = {t["label"]: t for t in theme_tiles}
    web_by = {t["label"]: t for t in web_tiles}
    theme_all = theme_tiles[-1] if theme_tiles else None
    web_all = web_tiles[-1] if web_tiles else None

    def split(t, w) -> str:
        return (f"{_n(t['changesets']) if t else '–'} theme · "
                f"{_n(w['changesets']) if w else '–'} in the app")

    p.append('<div class="tiles">\n')
    for label, title in (("last 7 days", "Last 7 days"), ("last 30 days", "Last 30 days")):
        t, w = theme_by.get(label), web_by.get(label)
        if not t and not w:
            continue
        ref = t or w
        sub = split(t, w) + f" · {esc(ref['first'])} → {esc(ref['last'])}"
        p.append(_tile(title, _n((t or {}).get("changesets", 0)
                                 + (w or {}).get("changesets", 0)), sub))
    # All time once either series reaches back to its own launch; the
    # sub-line says per series whether it does, or how much there is.
    all_time = bool((theme_all and theme_all.get("all_time"))
                    or (web_all and web_all.get("all_time")))
    total_all = (theme_all or {}).get("changesets", 0) + (web_all or {}).get("changesets", 0)
    if all_time:
        parts = []
        if theme_all:
            parts.append(f"{_n(theme_all['changesets'])} theme"
                         + (f" since {THEME_LIVE_SINCE}" if theme_all.get("all_time")
                            else f" in {theme_all['days']} recorded days"))
        else:
            parts.append("no theme history yet")
        if web_all:
            parts.append(f"{_n(web_all['changesets'])} in the app"
                         + (f" since {WEB_ANSWERS_SINCE}" if web_all.get("all_time")
                            else f" in {web_all['days']} recorded days"))
        else:
            parts.append("no in-app history yet")
        p.append(_tile("All time", _n(total_all), " · ".join(parts)))
    else:
        ref = theme_all or web_all
        p.append(_tile(f"All {ref['days']} recorded days", _n(total_all),
                       split(theme_all, web_all)))
    # The busiest day across both series.
    union = sorted(set(edits_days or {}) | set(web_edits_days or {}))
    per_day = {d: ((edits_days or {}).get(d) or 0, (web_edits_days or {}).get(d) or 0)
               for d in union}
    best_day = max(union, key=lambda d: (sum(per_day[d]), d))
    if sum(per_day[best_day]):
        t, w = per_day[best_day]
        p.append(_tile("Best day", _n(t + w),
                       f"{esc(best_day)}, {_n(t)} theme · {_n(w)} in the app"))
    p.append("</div>\n")

    if theme_all:
        p.append(_stale_notes(edits, theme_all["last"], now))
    if web_all:
        p.append(_stale_notes(edits, web_all["last"], now, web=True))
    elif (edits and not failed and edits.get("web_changesets") is None
          and edits.get("as_of") == now.strftime("%Y-%m-%d")):
        # The cached line is rebuilt by every run whose theme query answered,
        # so a line dated today without the answers count means that query
        # failed this run — not that nobody has answered yet.
        p.append('<p class="muted">Answers on the map itself not counted this '
                 "run — the OSMCha answers query failed while the theme query "
                 "answered. Not zero.</p>\n")

    span = _day_range(union[0], union[-1])
    rows = []
    for d in span:
        if d not in per_day:
            rows.append((d, f"{d} · not fetched", None))
            continue
        t, w = per_day[d]
        rows.append((d, f"{d} · {t} theme changeset{'' if t == 1 else 's'} · "
                        f"{w} answer{'' if w == 1 else 's'} in the app",
                     [("theme", t), ("app", w)]))
    hi = max(sum(s[1] for s in st) for _, _, st in rows if st)
    if hi:
        p.append(_legend(("--s-theme", "through the MapComplete theme"),
                         ("--s-app", "answered in the app or on the site")))
        top = _nice_top(hi, whole_half=True)
        p.append(_frame(top, _columns(rows, top),
                        _axis(span[0], span[-1], "edits per day")))
        running, cum = 0, []
        for d in _day_range(union[0], union[-1], cap=None):
            running += sum(per_day.get(d, (0, 0)))
            cum.append(running)
        ctop = _nice_top(running)
        p.append(_frame(ctop, _line(cum, ctop, "--s-theme", area=True,
                                    end=f"{running:,}", height=100),
                        _axis(union[0], union[-1], "added up since the first recorded day",
                              ended=True)))
    else:
        p.append(f'<p class="muted">No edits via PapaMap in the {len(union)} '
                 "recorded days.</p>\n")

    p.append('<details>\n<summary>How this is counted '
             f'<span class="tag">every day, {len(union)} days</span></summary>\n'
             "<p>MapComplete stamps a remote theme's changesets with the theme's "
             "URL; answers given on the map are changesets tagged "
             "<code>created_by=PapaMap</code>. The two sets are disjoint, so the "
             "total adds them. Windows count back from the newest recorded day, "
             "so a failing OSMCha fetch shows as the dates standing still, never "
             "as a quiet week. A window beyond one OSMCha page (~100 changesets) "
             "is counted whole and not split by day.</p>\n"
             '<div class="scroll">\n<table>\n<thead><tr><th class="l">day</th>'
             "<th>theme</th><th>in the app</th><th>total</th></tr></thead>\n<tbody>\n")
    for d in reversed(union):
        t = (edits_days or {}).get(d)
        w = (web_edits_days or {}).get(d)
        p.append(f'<tr><td class="l">{esc(d)}</td><td>{_n(t)}</td><td>{_n(w)}</td>'
                 f'<td>{_n((t or 0) + (w or 0))}</td></tr>\n')
    p.append("</tbody>\n</table>\n</div>\n</details>\n</section>\n")
    return "".join(p)


# ---- Movement on OSM --------------------------------------------------------

def _movement_section(history: list[dict], changes: dict | None,
                      now: datetime) -> str:
    """What happened to the map by anyone, in any editor: each nightly
    dataset diffed against the night before. The tiles are the windows, the
    first chart the recolours per night (green = somebody answered the room
    question, the mission metric; the other recolours grey), the pair under
    it the answers added up since the first run — a line that does not jump
    when a country joins, because a country adds pins, not answers — beside
    the dataset's green total, whose steps are exactly those joins and are
    pinned as such; the last chart the pins that entered and left, with a
    coverage night drawn clipped. The windows table and the definitions sit
    in the details, where they were asked about twice."""
    p = ['<section id="movement">\n<div><h2>Movement on OSM</h2>\n'
         '<p class="lead">What happened to the map by anyone, in any editor: '
         "each nightly dataset diffed against the night before. A grey pin "
         "that turned green is somebody answering the room question, the "
         "mission metric.</p></div>\n"]
    if not history:
        p.append('<p class="muted">No nightly run recorded yet.</p>\n</section>\n')
        return "".join(p)
    week, month, ever = _window(history, 7), _window(history, 30), _window(history, 10 ** 6)
    first = str(history[0].get("date") or "")
    nw, nm = min(7, len(history)), min(30, len(history))
    p.append('<div class="tiles">\n'
             + _tile(f"Turned green, {nw} runs", _n(week["to_accessible"]),
                     f"{_n(month['to_accessible'])} in {nm} runs · "
                     f"{_n(ever['to_accessible'])} since {esc(first)}")
             + _tile(f"Tables added, {nw} runs", _signed(week["new"]),
                     f"{_signed(month['new'])} in {nm} runs")
             + _tile(f"Tables removed, {nw} runs", _signed(-week["gone"]) if week["gone"] else "0",
                     f"{_signed(-month['gone']) if month['gone'] else '0'} in {nm} runs")
             + _tile(f"Other recolours, {nw} runs",
                     _n(week["to_female_only"] + week["to_unknown"]),
                     f"{nm} runs: {_n(month['to_female_only'])} → female-only, "
                     f"{_n(month['to_unknown'])} → unknown")
             + "</div>\n")

    # Recolours per night.
    by_date = {str(e.get("date")): e for e in history if isinstance(e.get("date"), str)}
    dates = sorted(by_date)
    span = _day_range(dates[0], dates[-1]) if dates else []
    rows, hi = [], 0
    for d in span:
        e = by_date.get(d)
        if e is None:
            rows.append((d, f"{d} · no run", None))
            continue
        ch = e.get("changes") or {}
        ta, tf, tu = ch.get("to_accessible", 0), ch.get("to_female_only", 0), ch.get("to_unknown", 0)
        hi = max(hi, ta + tf + tu)
        rows.append((d, f"{d} · {ta} → accessible, {tf} → female-only, {tu} → unknown"
                        f" · +{ch.get('new', 0)} new, -{ch.get('gone', 0)} gone",
                     [("green", ta), ("rest", tf + tu)]))
    if hi:
        top = _nice_top(hi, whole_half=True)
        p.append(_legend(("--s-green", "turned green (→ accessible)"),
                         ("--s-rest", "other recolours (→ female-only, → unknown)")))
        p.append(_frame(top, _columns(rows, top, labels_from=5),
                        _axis(span[0], span[-1],
                              "recoloured pins per night · hover a night for new and gone too"),
                        pad=16))

    # Answered since the first run, beside the dataset's green total.
    steps = coverage_steps(history)
    cum, running = [], 0
    for e in history:
        running += (e.get("changes") or {}).get("to_accessible", 0) or 0
        cum.append(running)
    last = str(history[-1].get("date") or "")
    acc = [(e.get("counts") or {}).get("accessible") for e in history]
    acc_pts = [v for v in acc if isinstance(v, int)]
    p.append('<div class="two">\n')
    if len(history) >= 2:
        ctop = _nice_top(running)
        p.append('<div>\n<h3>Answered since launch</h3>\n'
                 '<p class="meta">Grey → green transitions added up, one point per '
                 "nightly run. A country joining the sweep adds pins, not answers, "
                 "so this line does not jump when coverage grows.</p>\n"
                 + _frame(ctop, _line(cum, ctop, "--s-green", area=True, pins=steps,
                                      end=f"{running:,}"),
                          _axis(first, last, "numbered: the sweep grew", ended=True),
                          pad=26, extra=_pins(steps, ended=True))
                 + "</div>\n")
    if len(acc_pts) >= 2:
        ttop = _nice_top(max(acc_pts))
        p.append('<div>\n<h3 class="muted">Accessible pins in the dataset</h3>\n'
                 '<p class="meta">The green set as the map shows it. Every step is '
                 "coverage, not editing: the pin says which countries joined that "
                 "night.</p>\n"
                 + _frame(ttop, _line(acc, ttop, "--s-total", pins=steps,
                                      end=f"{acc_pts[-1]:,}"),
                          _axis(first, last, f"{acc_pts[0]:,} → {acc_pts[-1]:,}", ended=True),
                          pad=26, extra=_pins(steps, ended=True))
                 + "</div>\n")
    p.append("</div>\n")

    # Entered and left, per night, on one baseline.
    jump_days = {j["date"] for j in jump_nights(history)}
    up, down = [], []
    hi_new = hi_gone = 0
    for d in span:
        e = by_date.get(d)
        if e is None:
            up.append((d, f"{d} · no run", None))
            down.append((d, f"{d} · no run", None))
            continue
        ch = e.get("changes") or {}
        new, gone = ch.get("new", 0) or 0, ch.get("gone", 0) or 0
        why = " · a coverage night, drawn clipped" if d in jump_days else ""
        up.append((d, f"{d} · +{new:,} new{why}", [("theme", new)]))
        down.append((d, f"{d} · −{gone:,} gone{why}", [("gone", gone)]))
        if d not in jump_days:
            hi_new, hi_gone = max(hi_new, new), max(hi_gone, gone)
    if hi_new or hi_gone:
        top_new = _nice_top(hi_new or 1, whole_half=True)
        top_gone = _nice_top(hi_gone or 1, whole_half=True)
        # One value axis over the two rows: added fills the upper 90px,
        # removed hangs in the lower 30px, labels at the heights they use.
        y = ('<div class="chart-y" aria-hidden="true">'
             f'<span style="bottom:100%">{top_new:,.0f}</span>'
             f'<span style="bottom:62.5%">{top_new / 2:,.0f}</span>'
             '<span style="bottom:25%">0</span>'
             f'<span style="bottom:0%">−{top_gone:,.0f}</span></div>')
        drawing = ('<div class="stack">'
                   + _columns(up, top_new, height=90)
                   + _columns(down, top_gone, height=30, cls="down")
                   + "</div>")
        p.append(_legend(("--s-theme", "tables added"), ("--s-rest", "tables removed")))
        p.append(f'<div class="chart" style="padding-top:16px">{y}{drawing}'
                 + _axis(span[0], span[-1], "pins that entered or left the dataset, per night")
                 + "</div>\n")

    p.append('<details>\n<summary>How this is counted '
             '<span class="tag">windows</span></summary>\n'
             "<p><b>new</b> and <b>gone</b> are pins that entered or left the "
             "dataset: a changing table newly tagged or removed on OSM, or a whole "
             "sweep area that failed one night and came back. The → columns count "
             "pins present both nights whose colour changed; <b>→ accessible</b> "
             "is the mission metric, somebody answered the room question on OSM. "
             "A pin that arrives already green is new, not a transition. The slice "
             "of this made through the site itself is the section above.</p>\n"
             '<div class="scroll">\n<table>\n<thead><tr><th class="l">window</th>'
             "<th>new</th><th>gone</th><th>→ accessible</th>"
             "<th>→ female-only</th><th>→ unknown</th></tr></thead>\n<tbody>\n")
    p.append(_changes_row("since yesterday", changes))
    for n, label in ((7, "last 7 days"), (30, "last 30 days")):
        window = history[-n:]
        p.append(_changes_row(f"{label} ({len(window)} runs)",
                              _sum_changes(window) if window else None))
    p.append("</tbody>\n</table>\n</div>\n</details>\n</section>\n")
    return "".join(p)


# ---- Dataset ----------------------------------------------------------------

def _live_updates(d: dict | None) -> str:
    """The follower's card: what delta.json and its state file say."""
    if d is None:
        return ('<div class="card">\n<h3>Live updates</h3>\n<p class="bad">delta.json '
                "is missing — the live-updates follower is not running.</p>\n</div>\n")
    age = ("age unknown" if d["age_min"] is None
           else f"{d['age_min']:.0f} min ago")
    tick = f"{esc(str(d['generated']))} ({age})"
    if d["base_ok"] is True:
        base_note = ' · <span class="ok">matches the dataset</span>'
        state = '<span class="ok">in sync</span>'
    elif d["base_ok"] is False:
        base_note = (f' · <span class="bad">BEHIND the dataset '
                     f'({esc(str(d["data_base"]))}) — readers ignore this '
                     "delta</span>")
        state = '<span class="bad">behind</span>'
    else:
        base_note = ' · <span class="muted">dataset base unknown</span>'
        state = ""
    if d["stale"]:
        state = '<span class="bad">stale</span>'
    pending = d["pending"]
    if pending is None:
        pending_txt = "unknown (state file not readable)"
    else:
        pending_txt = _n(pending)
        if pending > 0:
            pending_txt += (f", oldest queued {esc(str(d['pending_oldest']))}, "
                            f"up to {_n(d['pending_max_attempts'])} retries")
    seq = d["seq"]
    seq_txt = (_n(seq) if isinstance(seq, int) and not isinstance(seq, bool)
               else esc(str(seq)))
    rows = [
        ("last tick", tick, ' class="bad"' if d["stale"] else ""),
        ("replication sequence", seq_txt, ""),
        ("base", esc(str(d["base"])) + base_note, ""),
        ("tables since the base",
         f"+{_n(d['tables_upsert'])} / −{_n(d['tables_remove'])}", ""),
        ("play places since the base",
         f"+{_n(d['places_upsert'])} / −{_n(d['places_remove'])}", ""),
        ("new toilets without a table answer", _n(d["toilets_no_table"]), ""),
        ("pending coordinate lookups", pending_txt, ""),
    ]
    out = [f'<div class="card">\n<h3>Live updates {state}</h3>\n'
           '<p class="meta">A follower reads OpenStreetMap\'s minutely diffs and '
           "writes delta.json; the map merges it over the nightly dataset, so an "
           "edit anywhere shows within a few minutes instead of after the next "
           'build.</p>\n<dl class="kv">\n']
    out.extend(f"<dt>{label}</dt><dd{cls}>{val}</dd>\n" for label, val, cls in rows)
    out.append("</dl>\n</div>\n")
    return "".join(out)


def _dataset_section(counts: dict | None, local: dict, glob: dict,
                     delta: dict | None, delta_expected: bool) -> str:
    p = ['<section id="dataset">\n<div><h2>Dataset</h2>\n']
    if counts:
        total = counts["total"]
        p.append(f'<p class="lead">{_n(total)} changing tables on the map tonight, '
                 "by what the map knows about the room.</p></div>\n")
        segs = (("accessible", "--s-green", "accessible"),
                ("female_only", "--red", "female-only"),
                ("unknown", "--s-rest", "room unknown"))
        p.append('<div class="share">')
        for key, var, label in segs:
            share = 100 * counts[key] / total if total else 0
            p.append(f'<div style="width:{share:.1f}%;background:var({var})" '
                     f'title="{_n(counts[key])} {label} · {_pct(counts[key], total)}"></div>')
        p.append("</div>\n")
        items = [(var, f"{_n(counts[key])} {label} · {_pct(counts[key], total)}")
                 for key, var, label in segs]
        legend = _legend(*items)
        if glob.get("ct_total") is not None:
            legend = legend.replace(
                "</p>\n",
                f'<span style="margin-left:auto">{_n(glob["ct_total"])} changing tables '
                f'worldwide (taginfo, {esc(str(glob.get("data_until", "")))[:10]})</span></p>\n')
        p.append(legend)
    else:
        p.append('<p class="bad">changing_tables.geojson is missing.</p></div>\n')
    cards = []
    if delta_expected:
        cards.append(_live_updates(delta))
    if local:
        rows = []
        for key, label in (("toilets_total", "toilets in the swept area"),
                           ("ct_objects", "objects tagged changing_table=*"),
                           ("ct_yes", "… of which changing_table=yes"),
                           ("centralkey_locked", "dropped: locked behind a central key"),
                           ("play_places", "play places (no changing-table answer)"),
                           ("play_places_no", "play places that answered no"),
                           ("play_tables", "play places with a changing table"),
                           ("capacity_tagged_toilets", "toilets with toilets:num_chambers*")):
            if key in local:
                rows.append(f"<dt>{label}</dt><dd>{_n(local[key])}</dd>\n")
        cards.append('<div class="card">\n<h3>Behind the counts</h3>\n<dl class="kv">\n'
                     + "".join(rows) + "</dl>\n</div>\n")
    if cards:
        p.append('<div class="two">\n' + "".join(cards) + "</div>\n")
    p.append("</section>\n")
    return "".join(p)


# ---- Pipeline ---------------------------------------------------------------

def _build_details(build: dict | None, now: datetime, stats: dict | None) -> str:
    """Last build, parsed from pipeline.log. Collapsed when it finished —
    per-area counts and mirror warnings are for whoever runs the pipeline,
    not for a reader checking the site is alive — and open when it did
    not, because the status line at the top sends the reader here."""
    if build is None:
        return ('<details id="build">\n<summary>Last build <span class="tag">no build '
                "found in pipeline.log</span></summary>\n"
                '<p class="muted">No build found in pipeline.log.</p>\n</details>\n')
    r = build["result"] or {}
    tags = []
    if build["finished"]:
        tags.append('<span class="ok">finished</span>')
        if r:
            tags.append(f'<span class="tag">{_n(r.get("features"))} features</span>')
    else:
        tags.append('<span class="bad">failed</span>' if build["error"]
                    else '<span class="bad">not finished</span>')
    if build["areas"]:
        zero = sum(1 for a in build["areas"] if a["ct"] == 0)
        tags.append(f'<span class="tag">{len(build["areas"])} areas swept'
                    + (f", {zero} with zero tables" if zero else "") + "</span>")
    failed_counts = [a["area"] for a in build["areas"] if a.get("recount_failed")]
    if failed_counts:
        tags.append(f'<span class="warn">{len(failed_counts)} toilet counts '
                    "from the cache</span>")
    if build["warns"]:
        tags.append(f'<span class="warn">{len(build["warns"]):,} warnings</span>')
    p = [f"<details id=\"build\"{'' if build['finished'] else ' open'}>\n"
         f"<summary>Last build {' '.join(tags)}</summary>\n"]
    if build["finished"]:
        p.append('<p><span class="ok">finished</span>'
                 + (f' — {_n(r.get("features"))} features, '
                    f'{_n(r.get("play_places"))} play places'
                    + (f' + {_n(r["play_places_no"])} that answered no'
                       if r.get("play_places_no") else "") + ", "
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
    if failed_counts:
        p.append('<p class="bad">Toilet count failed tonight, last count kept for '
                 + esc(", ".join(failed_counts)) + ". The cache drops a count "
                 "after four periods (28 days on the weekly rota); an area whose "
                 "count is still failing then fails the build.</p>\n")
    if build["warns"]:
        groups = group_warns(build["warns"])
        p.append(f'<p class="bad">{len(build["warns"]):,} warnings, '
                 f'{len(groups)} distinct</p>\n<ul class="warns">\n')
        p.extend(f"<li>{n:,} × {esc(msg)}</li>\n" if n > 1
                 else f"<li>{esc(msg)}</li>\n" for n, msg in groups)
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
    p.append("</details>\n")
    return "".join(p)


def _pipeline_section(build: dict | None, regions: dict, history: list[dict],
                      now: datetime, stats: dict | None) -> str:
    p = ['<section id="pipeline">\n<div><h2>Pipeline</h2>\n'
         '<p class="lead">For whoever runs the build. Collapsed when the night '
         "went fine, open when it did not.</p></div>\n"]
    p.append(_build_details(build, now, stats))
    if regions["regions"] or regions["cities"]:
        base = regions["base_date"]
        p.append("<details>\n<summary>Regions and cities "
                 f'<span class="tag">{len(regions["regions"])} regions · '
                 f'{len(regions["cities"])} cities'
                 + (f" · Δ accessible against {esc(base)}" if base else "")
                 + "</span></summary>\n"
                 f'<p>Per sweep area on {esc(str(regions["date"]))}'
                 + (f", Δ accessible against {esc(base)}" if base else
                    ", no earlier day to compare against")
                 + '. The public <a href="/wickeltische/leaderboard.html">'
                 "leaderboard</a> ranks the same rows by movement.</p>\n")
        if regions["cities"]:
            p.append(f"<details>\n<summary>{len(regions['cities'])} cities</summary>\n"
                     + _region_table(regions["cities"], "city") + "</details>\n")
        if regions["regions"]:
            p.append(f"<details>\n<summary>{len(regions['regions'])} regions</summary>\n"
                     + _region_table(regions["regions"], "region") + "</details>\n")
        p.append("</details>\n")
    if history:
        recent = list(reversed(history[-30:]))
        p.append("<details>\n<summary>Daily runs "
                 f'<span class="tag">last {len(recent)} of {len(history)}</span></summary>\n'
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
    p.append("</section>\n")
    return "".join(p)


# ---- The page ---------------------------------------------------------------

def _week_strip(*, private: bool, readers: dict | None, app_days: dict | None,
                apps: dict | None, edits_days: dict | None,
                web_edits_days: dict | None, history: list[dict], counts: dict | None,
                build: dict | None, now: datetime) -> str:
    """The row of tiles under the header: the week's answers before any
    chart, in the order Jakub reads them — readers and the apps on the
    private page, then the edits the site can claim, what moved on OSM, and
    whether last night's build went through."""
    tiles = []
    if private:
        st = readers_stats(readers, now)
        if st:
            label = "Readers yesterday" if st["is_yesterday"] else f"Readers, {esc(st['last_day'])}"
            sub = f"7-day average {_n(st['week_avg'])}"
            if st["before_avg"] is not None:
                sub += f" · week before {_n(st['before_avg'])}"
            tiles.append(_tile(label, _n(st["last"]), sub))
        else:
            tiles.append(_tile("Readers", "–", "no readers series yet", cls="dim"))
        days = sorted((app_days or {}).items())
        ios = {d: v["ios_downloads"] for d, v in days if "ios_downloads" in v}
        ios_tiles = {t["label"]: t for t in edit_totals(ios, APP_STORE_LIVE_SINCE)}
        android = {d: v["android_installs"] for d, v in days if "android_installs" in v}
        and_tiles = {t["label"]: t for t in edit_totals(android, "0000-01-01")}
        week = ios_tiles.get("last 7 days")
        allt = edit_totals(ios, APP_STORE_LIVE_SINCE)
        if week or allt:
            sub = (f"{_n(allt[-1]['changesets'])} since launch {APP_STORE_LIVE_SINCE}"
                   if allt and allt[-1].get("all_time")
                   else f"{_n(allt[-1]['changesets'])} in {allt[-1]['days']} published days"
                   if allt else "")
            a_week = and_tiles.get("last 7 days")
            sub += (f" · Play {_n(a_week['changesets'])} installs" if a_week
                    else " · Play: no report yet")
            tiles.append(_tile("App downloads, 7 days",
                               _n(week["changesets"]) if week else "–",
                               sub, small="App Store"))
        else:
            tiles.append(_tile("App downloads", "–", "no store figures yet", cls="dim"))
    # The last 7 days of each series — or every recorded day while a
    # series is younger than a week, so a young page still has its number.
    def recent(tiles: list[dict]) -> dict | None:
        by = {t["label"]: t for t in tiles}
        return by.get("last 7 days") or (tiles[-1] if tiles else None)
    t = recent(edit_totals(edits_days))
    w = recent(edit_totals(web_edits_days, WEB_ANSWERS_SINCE))
    if t or w:
        span = max(x["span"] for x in (t, w) if x)
        tiles.append(_tile(f"Edits via PapaMap, {span} days",
                           _n((t or {}).get("changesets", 0) + (w or {}).get("changesets", 0)),
                           f"{_n(t['changesets']) if t else '–'} through the theme · "
                           f"{_n(w['changesets']) if w else '–'} answered in the app"))
    else:
        tiles.append(_tile("Edits via PapaMap", "–", "no per-day history yet", cls="dim"))
    if history:
        week, month = _window(history, 7), _window(history, 30)
        nw, nm = min(7, len(history)), min(30, len(history))
        tiles.append(_tile(f"Turned green on OSM, {nw} runs", _n(week["to_accessible"]),
                           f"by anyone, in any editor · {_n(month['to_accessible'])} in {nm} runs"))
        tiles.append(_tile(f"Tables added on OSM, {nw} runs", _signed(week["new"]),
                           f"{_n(week['gone'])} removed"
                           + (f" · {_n(counts['total'])} on the map now" if counts else "")))
    if build is None:
        tiles.append(_tile("Last build", "–", "no build found in pipeline.log", cls="dim"))
    else:
        if build["finished"]:
            value, cls = '<span class="ok">finished</span>', ""
        elif build["error"]:
            value, cls = '<span class="bad">failed</span>', ""
        else:
            value, cls = '<span class="bad">not finished</span>', ""
        bits = []
        if build["areas"]:
            bits.append(f"{len(build['areas'])} areas")
        if build["warns"]:
            bits.append(f"{len(build['warns']):,} warnings, "
                        f"{len(group_warns(build['warns']))} distinct")
        if build["rounds"]:
            bits.append(f"{len(build['rounds'])} retry round{'s' if len(build['rounds']) != 1 else ''}")
        tiles.append(_tile("Last build", value, " · ".join(bits) or '<a href="#build">details</a>',
                           cls=cls))
    return ('<section id="week">\n<div class="row" style="display:flex;flex-wrap:wrap;'
            'align-items:baseline;gap:0.3rem 0.8rem"><h2>This week</h2>'
            '<span class="meta">each tile names its own window</span></div>\n'
            '<div class="tiles">\n' + "".join(tiles) + "</div>\n</section>\n")


def render_page(*, now: datetime, stats: dict | None, counts: dict | None,
                changes: dict | None, history: list[dict],
                anomalies: list[str], edits: dict | None = None,
                edits_days: dict | None = None,
                web_edits_days: dict | None = None,
                regions: dict | None = None, build: dict | None = None,
                site_url: str = "https://papamap.de",
                private: bool = False, visits: dict | None = None,
                readers: dict | None = None,
                apps: dict | None = None, app_days: dict | None = None,
                app_ratings: dict | None = None,
                delta: dict | None = None, delta_expected: bool = False) -> str:
    """The whole page. `history` is the ops state's daily list (oldest first,
    the entry for today already appended); `regions` is region_rows()'s
    output; `build` is parse_build_log()'s; `edits` the cached OSMCha line,
    `edits_days` its per-day history ({date: changesets}), `web_edits_days`
    the same for the answers given on the map itself. `private` adds the
    Readers section from `readers` ({date: count}) and `visits` ({date:
    {requests, uniques}}) and the Apps section from `apps` (this run's
    store fetches), `app_days` (the per-day store history) and
    `app_ratings` (the last ratings snapshot); the public page ignores all
    five entirely, by design."""
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
<div class="head">
<p class="back" style="display:flex;flex-wrap:wrap;gap:0.3rem 1rem;align-items:center;margin:0"><a href="/">← Map</a> <a href="/wickeltische/leaderboard.html">Leaderboard</a> <a href="/methods-en.html">Methods</a><span style="flex:1 1 auto"></span><span class="tag">{"private" if private else "public · noindex"}</span></p>
"""]
    # Status. Three states, not two: the anomaly rules tolerate one missed
    # night on purpose (48 h before the mail goes out), but a page that said
    # "Healthy" over a build that never finished was read as exactly that on
    # 23 Aug 2026. The build's own outcome gets its own colour.
    if anomalies:
        pill = '<span class="pill"><span class="dot r"></span>Anomalies</span>'
        note = ""
    elif build is not None and not build["finished"]:
        what = ("failed" if build["error"] else
                "had not finished when this report ran")
        pill = f'<span class="pill"><span class="dot" style="background:var(--amber)"></span>Last build {what}</span>'
        note = (f'<span class="warn">The site is serving the previous dataset'
                f"{f' ({age:.0f} h old)' if age is not None else ''}. "
                'Details under <a href="#build">Last build</a>.</span>')
    else:
        pill = '<span class="pill"><span class="dot g"></span>Healthy</span>'
        note = '<span class="meta">fresh dataset · counts within bounds · last build finished</span>'
    p.append(f'<div class="row"><h1>PapaMap ops</h1>{pill}{note}</div>\n')
    stamp = now.strftime("%Y-%m-%d %H:%M UTC")
    built = (stats or {}).get("generated_at")
    built_txt = (f"dataset built {esc(str(built))}"
                 + (f" ({age:.0f} h ago)" if age is not None else "")
                 if built else "no dataset")
    area = (stats or {}).get("area_name")
    p.append(f'<p class="meta">Report {stamp} · {built_txt}'
             + (f" · {esc(english_area(area))}" if area else "") + "</p>\n")
    if anomalies:
        p.append('<ul class="anomalies">\n')
        p.extend(f"<li>{esc(a)}</li>\n" for a in anomalies)
        p.append("</ul>\n")
    jumps = ([('#readers', 'Readers'), ('#apps', 'Apps')] if private else []) + [
        ("#edits", "Edits via PapaMap"), ("#movement", "Movement on OSM"),
        ("#dataset", "Dataset"), ("#pipeline", "Pipeline")]
    p.append('<nav class="jump">' + "".join(f'<a href="{h}">{t}</a>' for h, t in jumps)
             + "</nav>\n</div>\n")

    p.append(_week_strip(private=private, readers=readers, app_days=app_days,
                         apps=apps, edits_days=edits_days,
                         web_edits_days=web_edits_days, history=history,
                         counts=counts, build=build, now=now))
    if private:
        p.append(_readers_section(readers, visits, now))
        p.append(_apps_section(apps, app_days, app_ratings, now))
    p.append(_edits_section(edits, edits_days, web_edits_days, now))
    p.append(_movement_section(history, changes, now))
    p.append(_dataset_section(counts, local, glob, delta, delta_expected))
    p.append(_pipeline_section(build, regions, history, now, stats))

    p.append(f"""<footer>
<p>Everything on this page is an aggregate of public OpenStreetMap data (ODbL) and of this site's own nightly build. {"The Readers block counts browser addresses per day at the CDN edge and identifies nobody." if private else "No visitor data is collected, stored or shown — the site has no analytics."}</p>
<p>Sources: <a href="/data/stats.json">stats.json</a> · <a href="/data/history.json">history.json</a> · <a href="/data/changing_tables.geojson">changing_tables.geojson</a> · <a href="{esc(site_url)}/methods-en.html">how the classification works</a></p>
<p><a href="https://jakubwaller.eu" rel="author">Made with &hearts; in Hamburg by Jakub Waller</a></p>
</footer>
</body>
</html>
""")
    return "".join(p)
