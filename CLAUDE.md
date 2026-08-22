# CLAUDE.md

Guidance for coding agents working in this repository.

## What this is

A static map of places in 44 European countries with a baby changing table, coloured by whether a dad
can reach it: green = accessible room, red = women's room only, grey = nobody has recorded the room.
A Python pipeline queries Overpass and taginfo and writes GeoJSON + one static German page per
Bundesland; a vanilla-JS frontend renders them; a `caddy:2-alpine` container serves `web/` behind the
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
CONTRACT.md — it is versioned by amendment, currently v13.

**Overpass lies in two directions.** An all-Germany area query dies at a ~60 s network idle cutoff,
so Germany stays chunked per Bundesland — and **France per région**, for the same reason and
measured the same way (empty reply at 60.14 s for the country whole, 19 Aug 2026). Two chunked
countries now, so a 13-entry `COUNTRY_AREAS["fr"]` is not redundant; collapsing it to one
`admin_level=2` area brings back the failure and adds pins in the Caribbean, because the five
overseas régions are `admin_level=4` too. The other 42 answer whole. And a mirror can return HTTP
200 from a database months out of date — `pipeline/osm.py` reads `osm3s.timestamp_osm_base` and
raises `StaleMirror`, which is skipped rather than retried on the same host. Never "simplify" any of
these away.

**Judge a new sweep area on the slower of its TWO queries.** Every area is fetched twice a night,
by `sweep_ql` and by `toilets_counts_ql`, and the cheap-looking counting one can be the slower:
the UK measured 41.9 s sweeping but **45.2 s counting**, which is 82 % of the `[timeout:55]` budget
and the tightest area in the project. The line is ~45 s (the slowest area otherwise shipped is the
Netherlands at 41.7 s).

**The MapComplete theme is loaded at runtime from this repo's raw URL**, so nobody migrates it when
MapComplete's format changes — it would just stop loading, silently, on every grey pin.
`pipeline/theme_check.py` is the guard and runs in CI weekly; take a failure there seriously.

**`web/data/` and `web/wickeltische/` are build output** and git-ignored. In the container they are
bind-mounted back into the served tree because `web/` itself is read-only to the pipeline.

## Working in this repo

**Work in a git worktree, not this checkout.** More than one session runs here at once and they
share the working tree. Run `git status` before you edit anything: modified or untracked files you
did not create mean someone else is mid-task, and a `git add -A` or `git checkout -- .` will eat
their work with no warning. Isolate instead:

```bash
git worktree add -b <branch> ~/gitlab/.worktrees/papa-map-<task> main
```

Stage by naming paths, never `git add -A` / `git commit -a`, in any checkout you share.

## Shipping

Branch, PR, squash-merge — never push to `main` directly, even for a one-line docs change.

1. `pytest -v` and `node --test web/*.test.js` green before anything else.
2. Branch off `main`, commit, `gh pr create`, let CI (`ci.yml`, `theme-check.yml`) run.
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
