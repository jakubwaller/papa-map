from __future__ import annotations

import json
from datetime import date as _date, timedelta
from pathlib import Path

from .config import HISTORY_MAX_DAYS, PAGES_BASE_PATH, SITE_BASE_URL
from .export import write_text_atomic
from .pages import FOOTER, ICON, STYLE, UP, de_date, de_num, esc, sort_key

# Per-region history and the leaderboard pages built from it.
#
# The wickeltische index refuses to rank absolute counts, and for good reason:
# they measure how thoroughly a place has been mapped, not how well it is
# equipped. What *can* honestly be compared is change — who answered the most
# room questions lately. So the leaderboard ranks the movement of the answered
# share (accessible + female_only over total) in percentage points, over a
# roughly one-week window. Every answer counts, including "Damen-WC": the
# campaign asks for honest answers, not for green ones.
#
# The history file is the memory this needs: one entry per build day with
# [accessible, female_only, unknown] triples per region. It lives next to
# stats.json (the one writable mount under Docker), is written atomically like
# every other build artifact, and a same-date re-run replaces its day rather
# than fabricating a second one, keeping the build idempotent.

STATUS_IDX = ("accessible", "female_only", "unknown")
WINDOW_DAYS = 7

DE_FILE = "rangliste.html"
EN_FILE = "leaderboard.html"

MONTHS_EN = ("January", "February", "March", "April", "May", "June", "July",
             "August", "September", "October", "November", "December")


# ---- History ---------------------------------------------------------------

def load_history(path) -> dict:
    """{'v': 1, 'days': [...]} — a missing, unreadable or malformed file is a
    cold start, not an error: the first build simply writes day one."""
    try:
        with open(path) as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        return {"v": 1, "days": []}
    if not isinstance(data, dict) or not isinstance(data.get("days"), list):
        return {"v": 1, "days": []}
    return data


def counts_from_features(features, region_by_key, city_by_key,
                         region_names=(), city_names=()) -> tuple[dict, dict]:
    """Per-region and per-city [accessible, female_only, unknown] triples.

    Membership comes from the sweep-area maps — the same authority the Land
    pages use. Names passed in are pre-seeded with zero triples: a city whose
    sweep succeeded but that has no features must appear as [0, 0, 0], which
    is a different statement from being absent (sweep failed, unknown)."""
    regions = {name: [0, 0, 0] for name in region_names}
    cities = {name: [0, 0, 0] for name in city_names}
    for f in features:
        p = f["properties"]
        key = (p["osm_type"], p["osm_id"])
        status = p.get("status")
        idx = STATUS_IDX.index(status) if status in STATUS_IDX else 2
        region = region_by_key.get(key)
        if region is not None:
            regions.setdefault(region, [0, 0, 0])[idx] += 1
        city = city_by_key.get(key)
        if city is not None:
            cities.setdefault(city, [0, 0, 0])[idx] += 1
    return regions, cities


def append_day(history: dict, day: str, regions: dict, cities: dict,
               source: str = "build") -> dict:
    """Append one day's snapshot, replacing any existing entry for the same
    date (a manual afternoon re-run must not fabricate a second day), keep the
    list date-ordered and cap the tail."""
    days = [d for d in history.get("days", []) if d.get("date") != day]
    days.append({"date": day, "source": source,
                 "regions": regions, "cities": cities})
    days.sort(key=lambda d: d["date"])
    history["days"] = days[-HISTORY_MAX_DAYS:]
    history["v"] = 1
    return history


# ---- Deltas ----------------------------------------------------------------

def _share(triple) -> float | None:
    """Answered share in percent: the room question has an answer (accessible
    or female_only) — the one number the campaign moves. None when a region
    has no features at all (0/0 is no share, not 0 %)."""
    total = sum(triple)
    return 100.0 * (triple[0] + triple[1]) / total if total else None


def _baseline(days, latest_date: str):
    """The newest entry at least WINDOW_DAYS older than the latest — weekly
    backfill snapshots make this an 7-8 day window in practice. A history
    younger than the window falls back to its oldest entry (a shorter, honest
    window the page dates explicitly); a single day has nothing to compare."""
    cutoff = (_date.fromisoformat(latest_date)
              - timedelta(days=WINDOW_DAYS)).isoformat()
    older = [d for d in days[:-1] if d.get("date", "") <= cutoff]
    if older:
        return older[-1]
    return days[0] if len(days) > 1 else None


def _ranked_rows(latest, base, group: str) -> list[dict]:
    rows = []
    for name, cur in latest.get(group, {}).items():
        row = {"name": name, "counts": cur, "total": sum(cur),
               "share": _share(cur), "delta_pp": None,
               "delta_accessible": None, "delta_total": None}
        prev = (base or {}).get(group, {}).get(name)
        if prev is not None:
            cur_share, prev_share = _share(cur), _share(prev)
            if cur_share is not None and prev_share is not None:
                row["delta_pp"] = cur_share - prev_share
            row["delta_accessible"] = cur[0] - prev[0]
            row["delta_total"] = sum(cur) - sum(prev)
        rows.append(row)
    # Movers first by share gained, ties by answers that turned green, then by
    # dataset growth; regions without a comparable baseline sort last. The
    # final name key makes the order byte-stable between runs.
    rows.sort(key=lambda r: (0 if r["delta_pp"] is not None else 1,
                             -(r["delta_pp"] or 0),
                             -(r["delta_accessible"] or 0),
                             -(r["delta_total"] or 0), sort_key(r["name"])))
    return rows


def leaderboard_data(history: dict) -> dict | None:
    """Everything the pages need: latest date, baseline date, ranked rows per
    group. None on an empty history (nothing to render)."""
    days = history.get("days") or []
    if not days:
        return None
    latest = days[-1]
    base = _baseline(days, latest["date"])
    return {"date": latest["date"],
            "base_date": base["date"] if base else None,
            "cities": _ranked_rows(latest, base, "cities"),
            "regions": _ranked_rows(latest, base, "regions")}


# ---- Rendering -------------------------------------------------------------
# Region names come from our own config, but they pass through esc() anyway —
# uniform with every other interpolated string in the generated pages.

FOOTER_EN = """\
<h2>Data &amp; licence</h2>
<p class="muted">All data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap
contributors</a>, under the <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a>. This
page is regenerated every night from an Overpass query and stores nothing about you.
How things are counted and coloured: <a href="{up}methods-en.html">Methods</a> ·
<a href="{up}impressum.html">Impressum</a> ·
<a href="{up}datenschutz.html">Datenschutz</a></p>
"""

SORT_STYLE = """\
  /* A sortable header must look exactly like the header text it replaced; the
     small arrow is the whole affordance. The button carries the cell's padding
     instead of sitting inside it, so the whole header is the tap target — 22px
     of text on a phone is not one. */
  th.sortable { padding: 0; }
  th button.sort { font: inherit; color: inherit; background: none; border: 0;
                   padding: 0.45rem 0.55rem; width: 100%; cursor: pointer;
                   display: flex; align-items: center; gap: 0.3em;
                   justify-content: flex-end; }
  th.l button.sort { justify-content: flex-start; }
  th button.sort:hover { color: var(--accent); }
  th button.sort:focus-visible { outline: 2px solid var(--accent);
                                 outline-offset: 2px; }
  .arr { font-size: 0.75em; }
  .arr::after { content: "\\2195"; opacity: 0.4; }
  th[aria-sort="ascending"] .arr::after { content: "\\25B2"; opacity: 1; }
  th[aria-sort="descending"] .arr::after { content: "\\25BC"; opacity: 1; }
  p.hint { font-size: 0.8rem; margin-top: -0.7rem; }
"""

# Progressive enhancement, deliberately: the table arrives sorted by the column
# the page is about, so a reader with JavaScript blocked loses a convenience,
# not the content. Sort values ride on each cell's data-v — "20,0 %" and "+12,3"
# are for reading, and nothing should have to parse a decimal comma back.
SORT_JS = """\
<script>
(function () {
  var tables = document.querySelectorAll("table[data-sortable]");
  var hinted = false;
  for (var t = 0; t < tables.length; t++) upgrade(tables[t]);

  function upgrade(table) {
    var head = table.tHead && table.tHead.rows[0];
    var body = table.tBodies[0];
    if (!head || !body) return;
    for (var i = 0; i < head.cells.length; i++) arm(table, body, head.cells[i], i);
    // Once per page: the second table works the same way and does not need to
    // be told so again.
    var hint = hinted ? null : table.getAttribute("data-sort-hint");
    if (hint) {
      hinted = true;
      var p = document.createElement("p");
      p.className = "muted hint";
      p.textContent = hint;
      table.parentNode.parentNode.insertBefore(p, table.parentNode.nextSibling);
    }
  }

  function arm(table, body, th, index) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sort";
    btn.innerHTML = th.innerHTML + '<span class="arr" aria-hidden="true"></span>';
    th.innerHTML = "";
    th.className = th.className ? th.className + " sortable" : "sortable";
    th.appendChild(btn);
    btn.addEventListener("click", function () {
      // A column already sorted flips; a fresh one opens the way its header
      // asked for — biggest share first, but rank and names from the top.
      var dir = th.hasAttribute("aria-sort")
        ? (th.getAttribute("aria-sort") === "ascending" ? -1 : 1)
        : (th.getAttribute("data-first") === "asc" ? 1 : -1);
      sort(body, index, th.getAttribute("data-sort"), dir);
      for (var i = 0; i < table.tHead.rows[0].cells.length; i++)
        table.tHead.rows[0].cells[i].removeAttribute("aria-sort");
      th.setAttribute("aria-sort", dir === 1 ? "ascending" : "descending");
    });
  }

  function sort(body, index, kind, dir) {
    var rows = [];
    for (var i = 0; i < body.rows.length; i++)
      rows.push({ row: body.rows[i], i: i,
                  v: body.rows[i].cells[index].getAttribute("data-v") });
    rows.sort(function (a, b) {
      // An empty cell is unknown, not small: it stays at the bottom in both
      // directions instead of flooding the top when the order is reversed.
      if (a.v === null && b.v === null) return a.i - b.i;
      if (a.v === null) return 1;
      if (b.v === null) return -1;
      var d = kind === "num" ? parseFloat(a.v) - parseFloat(b.v)
                             : a.v.localeCompare(b.v);
      return d ? d * dir : a.i - b.i;
    });
    for (var j = 0; j < rows.length; j++) body.appendChild(rows[j].row);
  }
})();
</script>
"""

L = {
    "de": {
        "file": DE_FILE,
        "title": "Wickeltisch-Rangliste — PapaMap",
        "desc": ("Wo wurde zuletzt beantwortet, in welchem Raum der Wickeltisch "
                 "hängt? Veränderung in Prozentpunkten, jede Nacht neu aus "
                 "OpenStreetMap."),
        "back": ('<p class="back"><a href="{up}">&larr; Zur Karte</a> · '
                 '<a href="./">Bundesländer</a> · '
                 f'<a href="{EN_FILE}">English</a></p>\n'),
        "h1": "Die Rangliste",
        "stand": "Stand {date} · Daten aus OpenStreetMap",
        "stand_base": ("Stand {date} · Veränderung gegenüber dem {base} · "
                       "Daten aus OpenStreetMap"),
        "intro1": (
            "<p>Wer die meisten Wickeltische hat, steht hier absichtlich "
            "nicht. Absolute Zahlen messen vor allem, wie gründlich irgendwo "
            "gemappt wurde, nicht wie gut eine Stadt versorgt ist — eine "
            "Rangliste daraus wäre irreführend (warum, steht in den "
            '<a href="{up}methods.html">Methoden</a>). Ehrlich vergleichen '
            "lässt sich die Veränderung: wo zuletzt beantwortet wurde, in "
            "welchem Raum der Wickeltisch hängt. Genau das zählt diese Seite "
            "— den Anteil der Orte mit beantworteter Raumfrage, und wer ihn "
            "zuletzt am stärksten gesteigert hat.</p>\n"),
        "intro2": (
            "<p>Jede Antwort zählt, auch „nur im Damen-WC“ — die Karte lebt "
            "von ehrlichen Antworten, nicht von grünen Pins. Beantworten "
            "kannst du die Frage vor Ort in unter einer Minute: grauen Pin "
            'auf der <a href="{up}">Karte</a> antippen und dem '
            'MapComplete-Link folgen. <a href="{up}methods.html#contribute">'
            "Schritt für Schritt</a>.</p>\n"),
        "fresh": ("<p>Die Aufzeichnung hat am {date} begonnen. Sobald es "
                  "einen Vergleichszeitpunkt gibt, steht hier, wer sich "
                  "bewegt hat.</p>\n"),
        "quiet": ("<p>Seit dem {base} hat sich nirgends etwas bewegt. Die "
                  "grauen Pins warten.</p>\n"),
        "cities_h2": "Städte",
        "cities_note": ("<p>{n} große Städte, sortiert nach der Veränderung "
                        "des beantworteten Anteils. Berlin, Hamburg und "
                        "Bremen stehen auch unten bei den Ländern — hier "
                        "zählt die Stadt.</p>\n"),
        "regions_h2": "Bundesländer und Dänemark",
        "regions_note": ("<p>Dieselbe Rechnung für die 16 Bundesländer und "
                         "Dänemark als Ganzes.</p>\n"),
        "col_name_city": "Stadt", "col_name_region": "Region",
        "col_delta": "Δ Punkte", "col_share": "beantwortet",
        "col_total": "Orte", "col_acc": "+ erreichbar", "col_new": "+ Orte",
        "sort_hint": ("Auf eine Spaltenüberschrift tippen, um danach zu "
                      "sortieren — nochmal tippen dreht die Richtung um."),
        "footer": FOOTER,
    },
    "en": {
        "file": EN_FILE,
        "title": "PapaMap Leaderboard",
        "desc": ("Where did the room question — which room is the changing "
                 "table in? — get answered lately? Change in percentage "
                 "points, rebuilt nightly from OpenStreetMap."),
        "back": ('<p class="back"><a href="{up}">&larr; To the map</a> · '
                 f'<a href="{DE_FILE}">Deutsch</a></p>\n'),
        "h1": "The leaderboard",
        "stand": "As of {date} · Data from OpenStreetMap",
        "stand_base": ("As of {date} · Change since {base} · "
                       "Data from OpenStreetMap"),
        "intro1": (
            "<p>Which city has the most changing tables is deliberately not "
            "on this page. Absolute counts mostly measure how thoroughly a "
            "place has been mapped, not how well it is equipped — ranking "
            "them would mislead (the "
            '<a href="{up}methods-en.html">methods page</a> explains why). '
            "What can honestly be compared is change: where the room "
            "question — which room is the changing table in? — got answered "
            "lately. That is what this page counts — the share of places "
            "with an answered room question, and who has raised it most.</p>\n"),
        "intro2": (
            "<p>Every answer counts, including “women's toilet only” — the "
            "map runs on honest answers, not on green pins. Answering takes "
            'under a minute on site: tap a grey pin on the <a href="{up}">'
            "map</a> and follow its MapComplete link. "
            '<a href="{up}methods-en.html#contribute">Step by step</a>.</p>\n'),
        "fresh": ("<p>Recording started on {date}. As soon as there is a "
                  "point of comparison, this page will show who moved.</p>\n"),
        "quiet": ("<p>Nothing has moved anywhere since {base}. The grey "
                  "pins are waiting.</p>\n"),
        "cities_h2": "Cities",
        "cities_note": ("<p>{n} big cities, sorted by the change of their "
                        "answered share. Berlin, Hamburg and Bremen also "
                        "appear under the states below — here the city "
                        "counts.</p>\n"),
        "regions_h2": "German states and Denmark",
        "regions_note": ("<p>The same arithmetic for the 16 Bundesländer "
                         "and Denmark as a whole.</p>\n"),
        "col_name_city": "City", "col_name_region": "Region",
        "col_delta": "Δ points", "col_share": "answered",
        "col_total": "places", "col_acc": "+ reachable", "col_new": "+ places",
        "sort_hint": ("Tap a column header to sort by it — tap again to "
                      "reverse."),
        "footer": FOOTER_EN,
    },
}


def _fmt_date(iso: str, lang: str) -> str:
    if lang == "de":
        return de_date(iso)
    try:
        y, m, d = int(iso[0:4]), int(iso[5:7]), int(iso[8:10])
        return f"{d} {MONTHS_EN[m - 1]} {y}"
    except (ValueError, IndexError, TypeError):
        return ""


def _fmt_int(n: int, lang: str) -> str:
    return de_num(n) if lang == "de" else f"{int(n):,}"


def _fmt_share(share, lang: str) -> str:
    if share is None:
        return "–"
    s = f"{share:.1f}"
    return (s.replace(".", ",") if lang == "de" else s) + "&nbsp;%"


def _fmt_delta_pp(pp, lang: str) -> str:
    """Signed, one decimal. A dash for None and for anything that rounds to
    zero — a column of "+0,0" would drown the rows that actually moved."""
    if pp is None or abs(round(pp, 1)) < 0.05:
        return "–"
    s = f"{pp:+.1f}"
    return s.replace(".", ",") if lang == "de" else s


def _fmt_delta_int(n) -> str:
    return "–" if not n else f"{n:+d}"


def _head(lang: str, tab: dict, base_url: str, base_path: str) -> str:
    de_url = f"{base_url}{base_path}{DE_FILE}"
    en_url = f"{base_url}{base_path}{EN_FILE}"
    canonical = de_url if lang == "de" else en_url
    return f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(tab["title"])}</title>
<meta name="description" content="{esc(tab["desc"])}">
<link rel="canonical" href="{esc(canonical)}">
<link rel="alternate" hreflang="de" href="{esc(de_url)}">
<link rel="alternate" hreflang="en" href="{esc(en_url)}">
<link rel="alternate" hreflang="x-default" href="{esc(de_url)}">
{ICON}
<style>
{STYLE}{SORT_STYLE}</style>
</head>
<body>
"""


def _num_attr(v) -> str | None:
    """The sort value a cell carries for the client-side sorter. Kept separate
    from the rendered text on purpose: "20,0 %" and "+12,3" are for reading,
    and no browser should have to guess which comma is a decimal point."""
    return None if v is None else f"{v:g}"


def _cell(text: str, value=None, cls: str = "") -> str:
    attrs = f' class="{cls}"' if cls else ""
    if value is not None:
        attrs += f' data-v="{esc(value)}"'
    return f"<td{attrs}>{text}</td>"


def _th(label: str, kind: str, first: str, cls: str = "",
        sorted_dir: str = "") -> str:
    """data-sort is how the column compares ("num"/"text"), data-first which
    way it opens on the first click. The two are separate because rank is the
    counter-example to every rule of thumb: it is a number, and #1 belongs at
    the top. Without JavaScript this is an ordinary header cell."""
    attrs = f' class="{cls}"' if cls else ""
    attrs += f' data-sort="{kind}" data-first="{first}"'
    if sorted_dir:
        attrs += f' aria-sort="{sorted_dir}"'
    return f"<th{attrs}>{esc(label)}</th>"


def _table(rows, name_col: str, tab: dict, lang: str) -> str:
    parts = [f'<div class="scroll">\n<table data-sortable '
             f'data-sort-hint="{esc(tab["sort_hint"])}">\n<thead>\n']
    parts.append(
        "<tr>" + _th("#", "num", "asc")
        + _th(name_col, "text", "asc", cls="l")
        # The page arrives sorted by this column, so it is the one that starts
        # out marked — a sort indicator that lies on first paint is worse than
        # none at all.
        + _th(tab["col_delta"], "num", "desc", sorted_dir="descending")
        + _th(tab["col_share"], "num", "desc")
        + _th(tab["col_total"], "num", "desc")
        + _th(tab["col_acc"], "num", "desc")
        + _th(tab["col_new"], "num", "desc")
        + "</tr>\n</thead>\n<tbody>\n")
    rank = 0
    for r in rows:
        mover = r["delta_pp"] is not None and r["delta_pp"] > 0
        if mover:
            rank += 1
        cells = [
            # Rank keeps its number under every sort order: it says "third
            # biggest mover", which stays true while you look at the table by
            # size. Rows without one sort last, restoring the default order.
            _cell(str(rank), rank) if mover else _cell("–", None, "zero"),
            _cell(esc(r["name"]), sort_key(r["name"])[0], "l"),
        ]
        for text, value in (
                (_fmt_delta_pp(r["delta_pp"], lang), _num_attr(r["delta_pp"])),
                (_fmt_share(r["share"], lang), _num_attr(r["share"])),
                (_fmt_int(r["total"], lang), _num_attr(r["total"])),
                (_fmt_delta_int(r["delta_accessible"]),
                 _num_attr(r["delta_accessible"])),
                (_fmt_delta_int(r["delta_total"]),
                 _num_attr(r["delta_total"]))):
            cells.append(_cell(text, value, "zero" if text == "–" else ""))
        parts.append("<tr>" + "".join(cells) + "</tr>\n")
    parts.append("</tbody>\n</table>\n</div>\n")
    return "".join(parts)


def render_leaderboard(lang: str, data: dict, base_url: str = SITE_BASE_URL,
                       base_path: str = PAGES_BASE_PATH) -> str:
    tab = L[lang]
    date = _fmt_date(data["date"], lang)
    base = _fmt_date(data["base_date"], lang) if data["base_date"] else None
    moved = any(
        (r["delta_pp"] or 0) > 0 or (r["delta_accessible"] or 0) > 0
        or (r["delta_total"] or 0) > 0
        for r in data["cities"] + data["regions"])

    parts = [_head(lang, tab, base_url, base_path)]
    parts.append(tab["back"].format(up=UP))
    parts.append(f'<h1>{esc(tab["h1"])}</h1>\n')
    stand = (tab["stand_base"].format(date=esc(date), base=esc(base))
             if base else tab["stand"].format(date=esc(date)))
    parts.append(f'<p class="muted">{stand}</p>\n')
    parts.append(tab["intro1"].format(up=UP))
    parts.append(tab["intro2"].format(up=UP))
    if base is None:
        parts.append(tab["fresh"].format(date=esc(date)))
    elif not moved:
        parts.append(tab["quiet"].format(base=esc(base)))

    if data["cities"]:
        parts.append(f'<h2>{esc(tab["cities_h2"])}</h2>\n')
        parts.append(tab["cities_note"].format(n=len(data["cities"])))
        parts.append(_table(data["cities"], tab["col_name_city"], tab, lang))
    if data["regions"]:
        parts.append(f'<h2>{esc(tab["regions_h2"])}</h2>\n')
        parts.append(tab["regions_note"])
        parts.append(_table(data["regions"], tab["col_name_region"], tab, lang))

    parts.append(tab["footer"].format(up=UP))
    if data["cities"] or data["regions"]:
        parts.append(SORT_JS)
    parts.append("\n</body>\n</html>\n")
    return "".join(parts)


def write_leaderboard_pages(history: dict, out_dir: str,
                            base_url: str = SITE_BASE_URL,
                            base_path: str = PAGES_BASE_PATH) -> list:
    """Both language versions, atomically each — same discipline as the Land
    pages. An empty history writes nothing (there is nothing to say yet)."""
    data = leaderboard_data(history)
    if data is None:
        return []
    written = []
    for lang in ("de", "en"):
        path = str(Path(out_dir) / L[lang]["file"])
        write_text_atomic(render_leaderboard(lang, data, base_url, base_path), path)
        written.append(path)
    return written
