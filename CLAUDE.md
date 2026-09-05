# CLAUDE.md

Guidance for coding agents working in this repository.

## What this is

A static map of places in 48 countries (44 European, plus Australia, New Zealand, the United
States and Canada) with a baby changing table, coloured by whether a dad
can reach it: green = accessible room, red = women's room only, grey = nobody has recorded the room.
A Python pipeline queries Overpass and taginfo and writes GeoJSON + one static page per swept area
(Bundesländer in German, every country in its own language, French régions) into `web/wickeltische/`;
a vanilla-JS frontend renders them; a `caddy:2-alpine` container serves `web/` behind the
shared host Caddy. OSM is the only data source and the only write destination — this repo owns no
data and writes nothing to OSM itself.

`README.md` covers usage and the build. `web/methods.html` is the honest public account of the
classification rule, and it is the thing to keep truthful when the rule changes.

## Commands

```bash
python -m pipeline.run     # full build → web/data/*.json + web/wickeltische/*.html (~5 min)
pytest -v                  # pipeline tests, offline (fixtures only)
node --test web/*.test.js  # frontend pure functions
python -m pipeline.theme_check   # MapComplete theme rot guard
```

Code targets Python 3.9+ — every module starts with `from __future__ import annotations`, which is
what keeps `str | None` hints working on the system Python. Keep it that way.

## Things that are easy to get wrong

**Token matching in `pipeline/classify.py` is EXACT, never substring.** `"female_toilet"` contains
`"male_toilet"`, so a substring check silently classifies every women's-room table as
dad-accessible — inverting the entire point of the map. `ACCESSIBLE_TOKENS`, `FEMALE_TOKEN` and
`FEATURE_VALUES` are the vocabulary; changing any of them changes what the site claims, so update
`web/methods.html` in the same commit.

**`CONTRACT.md` is the pipeline↔frontend contract.** Classification lives only in Python; the
frontend consumes the `status` property and never re-derives it. `STATUSES` in `web/datasource.js`
is the stable key set the UI renders zero badges from. Changing the emitted shape means amending
CONTRACT.md — it is versioned by amendment, currently v21.

**Overpass lies in two directions.** An all-Germany area query dies at a ~60 s network idle cutoff,
so Germany stays chunked per Bundesland — and **France per région**, for the same reason and
measured the same way (empty reply at 60.14 s for the country whole, 19 Aug 2026) — and the
**US per state and Canada per province** since 2026-09-05, both dead whole on 2026-09-04. Four
chunked countries, so a 13-entry `COUNTRY_AREAS["fr"]` is not redundant; collapsing it to one
`admin_level=2` area brings back the failure and adds pins in the Caribbean, because the five
overseas régions are `admin_level=4` too. The US and Canadian chunks are selected by
`ISO3166-2` code (`AREA_SELECTORS`), never by name: a level-4 "Florida" is also a department
of Uruguay. The other 44 answer whole. And a mirror can return HTTP
200 from a database months out of date — `pipeline/osm.py` reads `osm3s.timestamp_osm_base` and
raises `StaleMirror`, which is skipped rather than retried on the same host. Never "simplify" any of
these away.

**`pipeline/osm.py` has a circuit breaker, and it is deliberately blunt.** A host whose port
refuses the connection is rested on the spot with a doubling cool-down, three queries in a row
exhausting their retries rest it too, and a round in which every host is resting fails as one.
The night of 2026-08-23 (IPv4 banned, mirrors 500) the pipeline sent thousands of requests at
hosts that had stopped talking to it; the breaker is what keeps a ban from being earned twice.
Don't trade it for more retries.

**Judge a new sweep area on the slower of its TWO queries.** Every area has two, `sweep_ql`
nightly and `toilets_counts_ql` on one night a week (the rota in `pipeline/toilet_counts.py`,
since 2026-09-05), and the cheap-looking counting one can be the slower:
the UK measured 41.9 s sweeping but **45.2 s counting**, which is 82 % of the `[timeout:55]` budget
and the tightest area in the project. The line is ~45 s (the slowest area otherwise shipped is the
Netherlands at 41.7 s).

**The MapComplete theme is loaded at runtime from this repo's raw URL**, so nobody migrates it when
MapComplete's format changes — it would just stop loading, silently, on every grey pin.
`pipeline/theme_check.py` is the guard and runs in CI weekly; take a failure there seriously.

**The pipeline container runs on the host network on purpose** (`network_mode: host`). The
bridge networks are IPv4-only, and Overpass has banned this host's IPv4 address at the TCP
level while still answering it over IPv6 (2026-08-23). Putting the service back on
`web_proxy` makes the next ban look like a full Overpass outage again.

**`web/data/` and `web/wickeltische/` are build output** and git-ignored. In the container they are
bind-mounted back into the served tree because `web/` itself is read-only to the pipeline.

## Working in this repo

**Work in a git worktree, not this checkout.** More than one session runs here at once and they
share the working tree. Run `git status` before you edit anything: modified or untracked files you
did not create mean someone else is mid-task, and a `git add -A` or `git checkout -- .` will eat
their work with no warning. Isolate instead:

```bash
git fetch origin
git worktree add -b <branch> ~/gitlab/.worktrees/papa-map-<task> origin/main
```

Branch from `origin/main`, never the local `main` — that ref is whatever a past session left
checked out, and fetching is safe from any session while pulling rewrites files under a
concurrent one. For the same reason, read `git show origin/main:<path>` rather than the shared
checkout when you need to know what is on `main`.

Stage by naming paths, never `git add -A` / `git commit -a`, in any checkout you share.

## Shipping

Branch, PR, squash-merge — never push to `main` directly, even for a one-line docs change.

1. `pytest -v` and `node --test web/*.test.js` green before anything else.
2. Branch off `origin/main`, commit, `gh pr create`, let CI (`ci.yml`, `theme-check.yml`) run.
3. `gh pr merge --squash --delete-branch`.
4. Deploy and verify per **[`docs/DEPLOY.md`](docs/DEPLOY.md)** — that file is the runbook and the
   only place deploy commands live. Do not copy them here; a second copy is what rots.

Verify against **https://papamap.de**, the canonical host. `www.papamap.de` and
`papamap.jakubwaller.eu` only redirect there, so checking them reports a healthy deploy as a
failure.

A web-only change (HTML/CSS/JS) does not need a dataset rebuild — `git pull` on the server is the
whole deploy, because the site is bind-mounted rather than baked into the image.

If tests or the post-deploy check fail, stop and report rather than merging or leaving the server
half-deployed.
