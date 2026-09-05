# Deploying papa-map (static)

The site is static: the nightly pipeline writes two JSON files into `web/data/` and one HTML
page per Bundesland into `web/wickeltische/`, and any web server serves `web/` as plain files.
**No API process and no database** — nothing to keep running except a web server and cron.

The live deployment runs the bundled `docker-compose.yml`: a `caddy:2-alpine` container that
bind-mounts `web/`, which is why `git pull` is the whole deploy for a web-only change and no
image rebuild is involved. The exception is `deploy/papamap.Caddyfile`: Caddy reads it once at
container start, so a change there needs `docker compose restart papamap` after the pull —
the restart re-mounts the file and picks up the new content. (Verify with
`curl -s 'https://papamap.de/?lang=en' | grep og:title` — it must card in English.) Serving the directory with a static web server you already run works
just as well — both paths are below.

Works on any always-on Linux box. Substitute your own paths and domain; `DOMAIN` stands for
wherever you host it.

## One-time

With Docker, which is how the live site runs:

```bash
ssh <your-server>
git clone <repo-url> papa-map && cd papa-map
mkdir -p web-data/wickeltische             # mountpoint — see the warning further down
docker compose up -d papamap               # static server on :8012, no host port
docker compose run --build --rm pipeline   # first dataset build
```

The container publishes no host port; point your existing ingress at it. The live setup
reverse-proxies `papamap:8012` from a shared host Caddy over the external `web_proxy` network.

**Without Docker** — a venv plus any static web server:

```bash
ssh <your-server>
git clone <repo-url> papa-map && cd papa-map
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m pipeline.run    # first dataset build
```

(No git remote yet? `rsync -av --exclude .venv --exclude .git ./ <your-server>:~/papa-map/`
from the dev machine works the same; re-run it to update.)

Then serve `web/` with anything that can serve static files. Caddy example:

```
DOMAIN {
	encode gzip
	root * /path/to/papa-map/web
	file_server
}
```

If Caddy runs in a container, bind-mount the site into it first (add
`- /path/to/papa-map/web:/srv/papa-map:ro` to the caddy service's `volumes:` and point
`root` at `/srv/papa-map`), then `caddy reload`.

## Daily data refresh

`crontab -e`, matching the live schedule:
```cron
0 2 * * * cd /path/to/papa-map && docker compose run --build --rm pipeline >> pipeline.log 2>&1
```
Outside Docker the equivalent line is
`0 2 * * * cd /path/to/papa-map && ./.venv/bin/python -m pipeline.run >> pipeline.log 2>&1`.

**02:00, and it stays there — do not move it earlier.** The 46-country build measured 80
minutes from 02:00 on 2026-09-05, when it was still 208 queries (73 sweeps, 73 counts, 62
leaderboard cities); the ops mail below runs at 05:30, and a build still writing when the
digest reads `stats.json` is the one health signal the site has reporting a half-finished
dataset. (02:00 was the move for Europe-complete on 2026-08-22, 03:30 for the UK and
France before that.) What keeps the build from growing with the areas is the toilets-count
rota (2026-09-05): each area's `amenity=toilets` count is refreshed one night a week rather
than every night, so a night costs one query per area plus a seventh of the counts — which
is the room waves 2 and 3 took the same day: the US per state and Canada per province add
64 areas, Japan per prefecture 47 more, for about 270 queries a night (184 areas + 62
cities) — a third above the pre-rota night's 208, so expect ~105 minutes and a finish near
03:45, still an hour and three quarters before the ops mail.
**Earlier than 02:00 is not an option on this host:** the VPS runs Europe/Berlin, and 01:00
CEST is 23:00 UTC of the *previous* day. The rota dates its entries and the leaderboard its
history in UTC, so on the night of the spring clock change two builds would share one UTC
date — the leaderboard's same-date rule would drop a day of history. 02:00 local is 00:00
UTC at the earliest, on the right side of midnight all year.

**The pipeline container is on the host network** (`network_mode: host` in
`docker-compose.yml`), so it has the host's IPv6 address. Overpass banned this host's IPv4
address at the TCP level on 2026-08-23 while still answering it over IPv6, and the bridge
networks are IPv4-only — every container query failed for six hours and the run looked
like an outage. beer-map on the same host also queries Overpass from the same addresses;
its jobs sit at 04:00 and Sunday 05:00, after this one. Keep the two apart: the ban arrived
four minutes after both started in the same minute (02:00 at the time).

The pipeline writes atomically (temp file + rename), so the server never serves a
half-written file; if taginfo or Overpass is down, the previous JSON stays in place.

The same run rewrites `web/wickeltische/` — the per-area pages (16 Bundesländer + index,
one page per other swept country in its own language, and four hubs over chunk pages:
france.html + 13 régions, united-states.html + 50 states and DC, canada.html + 13
provinces and territories, nihon.html + 47 prefectures), plus the 32 leaderboard pages. They
are build output, not repo content, so **a fresh clone serves 404s there until the first
build runs**: the sitemap lists all 221 of those URLs unconditionally. Run the pipeline once
after deploying rather than waiting for the nightly cron.

A full build also maintains `history.json` next to the other generated JSON (the
per-region daily counts behind `wickeltische/rangliste.html`) — same directory, same
mounts, nothing new to wire up. It is state, not a nightly rebuild: deleting it resets
the leaderboard to day one, so leave it alone when cleaning build output, and seed it
with `pipeline.backfill` when deploying fresh — on the VPS, detached, with a bigger query
budget than the nightly build (attic queries over a whole Land take ~3 minutes):

```bash
docker compose run -d --name papamap-backfill -e PAPAMAP_OVERPASS_QL_TIMEOUT=300 \
  pipeline python -u -m pipeline.backfill 2026-08-07
docker logs -f papamap-backfill      # one line per region; ~1 h per date
```

It writes into the same mounted `history.json` and never overwrites a day that exists,
so it is safe to run next to (or after) the nightly build. Re-render the pages afterwards
with a build, or wait for the next one.

`toilets_counts.json` in the same directory is state too — the per-area
`amenity=toilets` counts with the date each was last counted, which is what lets the
build recount every area one night a week instead of every night. Like `history.json`
it is served, at `/data/toilets_counts.json` (public aggregates, nothing else). Unlike
`history.json`, it is read at the start of a build and written whole at the end, so a manual
`docker compose run` that overlaps the nightly build writes back the snapshot it loaded and
drops the entries the other build committed in between — those areas recount the next night,
a one-night cost and nothing worse, but do not run two builds at once expecting both to keep
their counts. Deleting it costs
exactly one night of counting (every area is recounted, as before the rota) and
nothing else; `PAPAMAP_TOILETS_COUNTS_PERIOD_DAYS=1` on a manual run recounts
everything regardless.

Under Docker the pages need a writable mount like the JSON does. The image sets
`PAPAMAP_PAGES_DIR=/out/wickeltische` and compose mounts `./web-data/wickeltische` back into
the served tree at `/srv/wickeltische`, so the URL stays `DOMAIN/wickeltische/`. **The
`papamap` container has to be recreated (`docker compose up -d papamap`) for that mount to
exist** — a `git pull` alone leaves it serving the old volume set and every Land page 404s.
`mkdir -p web-data/wickeltische` first, or Docker creates it root-owned.

`web/wickeltische/.gitkeep` is tracked for the same reason `web/data/.gitkeep` is: `/srv` is
mounted **read-only**, so Docker cannot create `/srv/wickeltische` to mount onto and the
container fails to start outright — not a 404, the whole site goes down. The mountpoint has
to be in the repo. (Learned the hard way: recreating the container without it took papamap.de
offline until the directory existed.)

About that cron line: **`--build` is not optional.** The `pipeline` service copies `pipeline/` into its
image (the site is bind-mounted, the pipeline code is not), so a plain
`docker compose run` keeps executing whatever code the image was last built with.
Without it a `git pull` looks like a successful deploy, the build runs green, and
it silently produces a dataset from the old code — which is exactly what happened
when Denmark was added.

## Ops mail (optional, recommended)

`python -m pipeline.ops` compares today's dataset against yesterday's snapshot (state in
`ops-state.json`, gitignored) and mails only on an anomaly — stale `generated_at` (>48 h),
missing files, a >20% drop **or a >25% jump** in the total or accessible count — plus one
all-clear digest every
Monday, so a silent week means the watcher itself died. The digest carries the day's and week's
changes (new features, grey→green transitions = answered room questions) and, per configured
token, zone-level visit totals (Cloudflare) and the count of changesets made through the
site's own MapComplete theme (OSMCha) — the attributable slice of the mission metric.
Everything is aggregate; no visitor or mapper data.

The OSMCha line can read `UNKNOWN — query failed (…). Not zero.` That is the metadata filter
timing out, not a week without edits. Its cost swings unpredictably — the same query took 21.9 s
on 2026-08-13, over 150 s on 2026-08-18 and 0.5 s on 2026-08-19 — so `OSMCHA_TIMEOUT_S` is set
to 300 s, well above any measurement, and overridable with `PAPAMAP_OSMCHA_TIMEOUT_S`. If the
line says UNKNOWN, re-run the check before believing anything about that week.

The OSMCha window is fetched on **every** run, not just digest days: the ops page draws a
per-day chart of theme changesets, and that series only exists in `ops-state.json`
(`edits_days`), built a run at a time the way the visits history is. The mail still quotes
the count on digest days only.

```cron
30 5 * * * cd /path/to/papa-map && set -a && . ./ops.env && set +a && ./.venv/bin/python -m pipeline.ops >> ops.log 2>&1
```

The same run rewrites the **ops page**, `https://papamap.de/ops.html` — public, English-only,
the report as a page plus what the mail has no room for: per-area results and warnings from
last night's `pipeline.log`, per-region counts with a week's delta from `history.json`, the
daily run history, the last OSMCha count dated, and two per-day movement charts — status
transitions, and changesets through the site's theme. Everything on it is aggregate; the one number
it deliberately omits is the Cloudflare request total, because `methods.html` promises
"keine Analytics" and a traffic figure on a public page reads as exactly that.

It is written to `PAPAMAP_OPS_HTML_PATH`, default `ops.html` next to `stats.json` — under the
Docker layout that is `web-data/ops.html`, served at `/data/ops.html` and rewritten to
`/ops.html` by `deploy/papamap.Caddyfile`. That rewrite is new as of this page: after
pulling it, `docker compose restart papamap` (the Caddyfile is a bind mount; a running
container does not re-read it). `PAPAMAP_BUILD_LOG_PATH` (default `pipeline.log`, i.e. the
build cron's log in the repo directory) feeds the build section; absent, the page says so.
Set `PAPAMAP_OPS_HTML_PATH=` (empty) to not write the page at all. A page that fails to
render or write is a WARN in `ops.log`, never a failed check.

### The private ops page

The same run also writes a **private copy** — the public page plus a Visitors block:
Cloudflare's zone-level requests and uniques per complete UTC day, window sums, a curve, and a
table of the whole history. The per-day figures are fetched on every run (the mail still quotes
them on digest days only) and kept in `ops-state.json` under `visits`, capped at 400 days.
`PAPAMAP_OPS_PRIVATE_HTML_PATH` (default `private/ops.html` next to `stats.json`, i.e.
`web-data/private/ops.html`; empty disables).

**Each run asks Cloudflare for 30 days, not the week the mail quotes.** Measured 2026-08-23:
the free plan's `httpRequests1dGroups` served every day back to this zone's first
(2026-07-29, 26 rows), so the earlier "it forgets a day after about a week" belief was wrong
and the state was a week deep for no reason. One request feeds both readers — the page's
history and the mail's seven-day total — so nothing costs more. It also means a fresh state
file backfills a month on its first run rather than growing a day at a time.

It is served at `https://papamap.de/private/ops.html` **only once you add the auth snippet** —
`deploy/papamap.Caddyfile` answers 404 under `/private/` until `deploy/private/*.caddy`
exists, so a checkout without it never exposes the page. Access is a token in the URL, the
way Bürgerwecker's admin works: bookmark `…/private/ops.html?token=…`; the first visit also
sets a cookie, so the plain URL works afterwards in that browser. One-time setup on the server:

```sh
cd ~/papa-map
mkdir -p web-data/private                      # before `up`: Docker would create it as root
T=$(openssl rand -base64 30 | tr -d '/+=')
sed "s/REPLACE-WITH-THE-TOKEN/$T/g" deploy/private/ops-auth.caddy.example > deploy/private/ops-auth.caddy
chmod 600 deploy/private/ops-auth.caddy
docker compose up -d papamap                   # first time: new mounts, recreate; later: restart
curl -sI https://papamap.de/private/ops.html | head -1                    # HTTP/2 404
curl -sI "https://papamap.de/private/ops.html?token=$T" | head -1         # 200 + Set-Cookie
echo "https://papamap.de/private/ops.html?token=$T"                       # bookmark this
```

(`web/private/.gitkeep` is the mountpoint inside the read-only `/srv` — it is tracked, and
without it the container refuses to start and the whole site answers 502.)

To rotate the token, regenerate the snippet and `docker compose restart papamap` (it is a
bind mount — restart, not reload). Everyone's cookie stops working at the same moment.

`ops.env` (git-ignored, `chmod 600`) holds the same `PAPAMAP_*` path overrides as the build cron
(if any) plus:

```sh
PAPAMAP_SMTP_HOST=smtp.protonmail.ch   # any SMTP submission host works
PAPAMAP_SMTP_PORT=587                  # STARTTLS
PAPAMAP_SMTP_USER=ops@example.com      # Proton: the address paired with the SMTP token
PAPAMAP_SMTP_PASSWORD=...              # Proton: the generated SMTP token
PAPAMAP_OPS_TO=you@example.com         # without SMTP creds + TO, report goes to ops.log only
PAPAMAP_OPS_FROM=ops@example.com       # optional, defaults to PAPAMAP_SMTP_USER
CF_ANALYTICS_TOKEN=...                 # optional: Analytics:Read, this zone only
CF_ZONE_TAG=...                        # the zone id from the Cloudflare dashboard
OSMCHA_TOKEN=...                       # optional: osmcha.org API token (log in once with the
                                       # OSM account, token is under account settings) — adds
                                       # the papamap-theme changeset count to the digest
```

(Proton SMTP tokens exist from the Unlimited plan up and pair with a custom-domain
address — Settings → IMAP/SMTP → SMTP tokens. Any other provider's SMTP relay works
with the same four variables.)

## Update the app

```bash
cd ~/papa-map && git pull        # or re-run the rsync
.venv/bin/pip install -r requirements.txt   # only if requirements changed
.venv/bin/python -m pipeline.run            # optional: rebuild data now instead of waiting for cron
```

No restart — the server picks up changed web files immediately, because they are
bind-mounted. **The pipeline is different if you run it under Docker:** its code
lives in the image, so a `git pull` alone leaves the old build logic in place. Add
`docker compose build pipeline` (or use `run --build`, as in the cron above) after
any change under `pipeline/`.

## Verify

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://DOMAIN/
curl -s https://DOMAIN/data/stats.json | head
tail -n 20 /path/to/papa-map/pipeline.log
```

**After a change to `PAPAMAP_COUNTRIES`, check the served `area_key` before believing the
deploy.** The site's copy is bind-mounted and live within seconds of a `git pull`, while the
dataset only changes on the next build — so the two can disagree, and the failure is silent
prose rather than an error:

```bash
curl -s https://DOMAIN/data/stats.json | grep -o '"area_key": *"[^"]*"'   # want countries_49
curl -s https://DOMAIN/ | grep -c 'areaFallback">49 Länder'              # want 1
```

Both or neither. If `area_key` still counts the old set, the build has not run under the new
variable yet — run it by hand rather than waiting for cron, or the site claims a coverage it
does not have until the next morning. `/data/*` is served with `Cache-Control: max-age=900`,
so allow up to 15 minutes, or add `?x=1` to bust it.
