from __future__ import annotations

import json
from datetime import date as _date, timedelta
from pathlib import Path

from .config import (AREA_COUNTRY, BUNDESLAENDER, CANADA_PROVINCES,
                     COUNTRY_PAGES, FRANCE_REGIONS, LANG_HOME_CC, US_STATES,
                     chunked_area_names,
                     HISTORY_MAX_DAYS, PAGES_BASE_PATH, SITE_BASE_URL)
from .export import write_text_atomic
from .leaderboard_strings import DE_FILE, EN_FILE, L
from .pages import ICON, STYLE, UP, _og, esc, slugify, sort_key

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
  /* The language switcher, styled like the methods pages': muted, roomy line
     height for 31 entries, the current language bold instead of linked. */
  .back.langs { margin-top: -0.7rem; color: var(--muted); line-height: 1.9; }
  .back.langs strong { color: var(--fg); font-weight: 600; }
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


def _fmt_date(iso: str, lang: str) -> str:
    # Month names and their arrangement come from the language's L entry, so a
    # 31st language is a table row, not another branch here.
    try:
        y, m, d = int(iso[0:4]), int(iso[5:7]), int(iso[8:10])
        return L[lang]["date_fmt"].format(d=d, m=L[lang]["months"][m - 1], y=y)
    except (ValueError, IndexError, TypeError):
        return ""


def _fmt_int(n: int, lang: str) -> str:
    return f"{int(n):,}".replace(",", L[lang]["thousands"])


def _fmt_share(share, lang: str) -> str:
    if share is None:
        return "–"
    return f"{share:.1f}".replace(".", L[lang]["decimal"]) + "&nbsp;%"


def _fmt_delta_pp(pp, lang: str) -> str:
    """Signed, one decimal. A dash for None and for anything that rounds to
    zero — a column of "+0,0" would drown the rows that actually moved."""
    if pp is None or abs(round(pp, 1)) < 0.05:
        return "–"
    return f"{pp:+.1f}".replace(".", L[lang]["decimal"])


def _fmt_delta_int(n) -> str:
    return "–" if not n else f"{n:+d}"


def _head(lang: str, tab: dict, base_url: str, base_path: str) -> str:
    # Every language lists every other, or search engines treat the set as
    # unreciprocated and ignore it — same rule the methods pages follow.
    def url(code: str) -> str:
        return f"{base_url}{base_path}{L[code]['file']}"
    alternates = "\n".join(
        f'<link rel="alternate" hreflang="{code}" href="{esc(url(code))}">'
        for code in L)
    return f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(tab["title"])}</title>
<meta name="description" content="{esc(tab["desc"])}">
<link rel="canonical" href="{esc(url(lang))}">
{_og(tab["title"], tab["desc"], url(lang), lang, base_url)}
{alternates}
<link rel="alternate" hreflang="x-default" href="{esc(url("de"))}">
{ICON}
<style>
{STYLE}{SORT_STYLE}</style>
</head>
<body>
"""


def _back(lang: str, tab: dict) -> str:
    """The back row plus the language switcher, generated like the methods
    pages': endonyms, the current language as <strong>, every language listed.

    The second link goes to the reader's own country page — until 2026-08-23
    every language linked the German Bundesland index here, a leftover from
    when those were the only pages. German keeps that link (its home IS the
    Bundesland hub); everyone else gets LANG_HOME_CC's country, labelled by
    its endonym, whose own country list reaches the other 43."""
    home_cc = LANG_HOME_CC[lang]
    if home_cc == "de":
        home_label, home_href = "Bundesländer", "./"
    else:
        home_label = COUNTRY_PAGES[home_cc][1]
        home_href = f"{slugify(home_label)}.html"
    entries = []
    for code, t in L.items():
        if code == lang:
            entries.append(f'<strong lang="{code}">{t["lang_name"]}</strong>')
        else:
            entries.append(f'<a href="{t["file"]}" hreflang="{code}" '
                           f'lang="{code}">{t["lang_name"]}</a>')
    return (f'<p class="back"><a href="{UP}">{tab["back_map"]}</a> · '
            f'<a href="{esc(home_href)}">{esc(home_label)}</a></p>\n'
            f'<p class="back langs">' + "\n  &middot; ".join(entries) + "</p>\n")


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
        # Both tables mix eleven countries since 21 Aug 2026, and a reader
        # meeting "Gent" between two Bundesländer deserves to know whose city
        # is moving without guessing from the spelling. Codes, not names: two
        # letters read the same in both page languages and keep the column
        # narrower than its own header.
        + _th(tab["col_country"], "text", "asc")
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
        # A row whose name is in no config map is a history key from an area
        # since removed from config — a dash, not a KeyError on every build.
        country = AREA_COUNTRY.get(r["name"])
        cells = [
            # Rank keeps its number under every sort order: it says "third
            # biggest mover", which stays true while you look at the table by
            # size. Rows without one sort last, restoring the default order.
            _cell(str(rank), rank) if mover else _cell("–", None, "zero"),
            _cell(esc(r["name"]), sort_key(r["name"])[0], "l"),
            (_cell(country.upper(), country) if country
             else _cell("–", None, "zero")),
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


def _region_kinds(rows) -> tuple[int, dict, list[str]]:
    """(Bundesland rows, {"fr": région rows, "us": state rows, "ca": province
    rows}, names of the whole-country rows), read off the rows about to be
    printed.

    The regions table shows whatever the sweep produced, and since 18 Aug 2026
    that is a list the operator can extend: PAPAMAP_COUNTRIES=de,dk,be,… puts
    Belgium and its neighbours next to Bayern. A heading that hard-codes "16
    Bundesländer und Dänemark" is then simply false, so the section counts the
    table in front of it instead.

    "Everything not a Bundesland is a country swept whole" was true until
    France, and would now print Bretagne and Corse as sovereign states. The
    whole-country list is therefore filtered against every chunk name in
    config.COUNTRY_AREAS, not just the German ones — so a chunked country
    this function does not know is at worst missing from the sentence, never
    miscounted in it. The US and Canada joined the chunked set on
    2026-09-05; the US count is the states alone, the District of Columbia
    being named on its own by the clause. Country names sort like every other
    name column."""
    chunks = chunked_area_names()
    names = [r["name"] for r in rows]
    lands = sum(1 for n in names if n in BUNDESLAENDER)
    states = {n for n, _ in US_STATES} - {"District of Columbia"}
    provinces = {n for n, _ in CANADA_PROVINCES}
    kinds = {"fr": sum(1 for n in names if n in FRANCE_REGIONS),
             "us": sum(1 for n in names if n in states),
             "ca": sum(1 for n in names if n in provinces)}
    countries = [n for n in names if n not in chunks]
    return lands, kinds, sorted(countries, key=sort_key)


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
    parts.append(_back(lang, tab))
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
        lands, kinds, countries = _region_kinds(data["regions"])
        fr_regions = kinds["fr"]
        # Which sentence fits is a question about *which* countries are in the
        # table, never about how many. The default build's one country is
        # Denmark and the German page has always named it outright, so that
        # sentence stays untouched — but it may only be used when Denmark is
        # in fact the country there. Gating on len(countries) == 1 instead
        # would print "Bundesländer und Dänemark" over a table whose only
        # country row is Switzerland (PAPAMAP_COUNTRIES=de,ch), and gating on
        # "no countries" would print it over a table with no country row at
        # all (PAPAMAP_COUNTRIES=de). Past Denmark alone, no sentence can name
        # them all without becoming a list, so the copy counts them and then
        # names them once — a reader who meets "Czechia" between two
        # Bundesländer can find out what it is.
        if any(kinds.values()):
            # Another chunked country is in the table, so the two-way split
            # the sentences below assume no longer describes it: France
            # contributes régions, the US states, Canada provinces — none of
            # them Bundesländer or whole countries. Named rather than
            # counted-and-listed, because 13 (or 51) more names would turn
            # the sentence into a directory.
            kind = "_regions"
        elif countries == ["Danmark"]:
            kind = ""
        elif len(countries) > 1:
            kind = "_many"
        elif countries:
            # One country that is not Denmark: name it instead of counting it,
            # because "für 1 Länder" is not German and "für ein Land" would
            # withhold the one fact the sentence exists to give.
            kind = "_one"
        else:
            kind = "_lands"
        parts.append(f'<h2>{esc(tab["regions_h2" + kind])}</h2>\n')
        names = esc(", ".join(countries))
        # Only the _regions sentence is assembled; the other three spell
        # themselves out and ignore {list}.
        clauses = []
        if lands:
            clauses.append(tab["cl_lands"].format(n=lands))
        if fr_regions:
            clauses.append(tab["cl_regions"].format(r=fr_regions))
        if kinds["us"]:
            clauses.append(tab["cl_states"].format(s=kinds["us"]))
        if kinds["ca"]:
            clauses.append(tab["cl_provinces"].format(p=kinds["ca"]))
        if len(countries) == 1:
            clauses.append(tab["cl_country_one"].format(names=names))
        elif countries:
            clauses.append(tab["cl_country_many"].format(
                c=len(countries), names=names))
        listed = (tab["and_sep"].join((", ".join(clauses[:-1]), clauses[-1]))
                  if len(clauses) > 1 else (clauses[0] if clauses else ""))
        parts.append(tab["regions_note" + kind].format(
            n=lands, r=fr_regions, c=len(countries), names=names, list=listed))
        parts.append(_table(data["regions"], tab["col_name_region"], tab, lang))

    parts.append(tab["footer"].format(up=UP))
    if data["cities"] or data["regions"]:
        parts.append(SORT_JS)
    parts.append("\n</body>\n</html>\n")
    return "".join(parts)


def write_leaderboard_pages(history: dict, out_dir: str,
                            base_url: str = SITE_BASE_URL,
                            base_path: str = PAGES_BASE_PATH) -> list:
    """Every language version, atomically each — same discipline as the Land
    pages. An empty history writes nothing (there is nothing to say yet)."""
    data = leaderboard_data(history)
    if data is None:
        return []
    written = []
    for lang in L:
        path = str(Path(out_dir) / L[lang]["file"])
        write_text_atomic(render_leaderboard(lang, data, base_url, base_path), path)
        written.append(path)
    return written
