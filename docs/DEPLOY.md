# Deploying papa-map (static)

v0 is a static site: the nightly pipeline writes two JSON files into `web/data/` and one HTML
page per Bundesland into `web/wickeltische/`, and any web server serves `web/` as plain files.
**No container, no API process, no database** — there is nothing to keep running except cron.

Works on any small always-on box (a Raspberry Pi is plenty). Substitute your own paths and
domain below; `DOMAIN` stands for wherever you host it.

## One-time

```bash
ssh <your-server>
git clone <repo-url> papa-map && cd papa-map
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m pipeline.run    # first dataset build
```

(No git remote yet? `rsync -av --exclude .venv --exclude .git ./ <your-server>:~/papa-map/`
from the dev machine works the same; re-run it to update.)

Serve `web/` with anything that can serve static files. Caddy example:

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

`crontab -e`:
```cron
0 4 * * * cd /path/to/papa-map && ./.venv/bin/python -m pipeline.run >> pipeline.log 2>&1
```

The pipeline writes atomically (temp file + rename), so the server never serves a
half-written file; if taginfo or Overpass is down, the previous JSON stays in place.

The same run rewrites `web/wickeltische/` — the per-Bundesland pages. They are build output,
not repo content, so **a fresh clone serves 404s there until the first build runs**: the
sitemap lists those 17 URLs unconditionally. Run the pipeline once after deploying rather
than waiting for the nightly cron.

A full build also maintains `history.json` next to the other generated JSON (the
per-region daily counts behind `wickeltische/rangliste.html`) — same directory, same
mounts, nothing new to wire up. It is state, not a nightly rebuild: deleting it resets
the leaderboard to day one, so leave it alone when cleaning build output, and seed it
with `python -m pipeline.backfill` (see the README) when deploying fresh.

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

Running it from the bundled `docker-compose.yml` instead? Then the cron line is:
```cron
30 4 * * * cd /path/to/papa-map && docker compose run --build --rm pipeline >> pipeline.log 2>&1
```
**`--build` is not optional.** The `pipeline` service copies `pipeline/` into its
image (the site is bind-mounted, the pipeline code is not), so a plain
`docker compose run` keeps executing whatever code the image was last built with.
Without it a `git pull` looks like a successful deploy, the build runs green, and
it silently produces a dataset from the old code — which is exactly what happened
when Denmark was added.

## Ops mail (optional, recommended)

`python -m pipeline.ops` compares today's dataset against yesterday's snapshot (state in
`ops-state.json`, gitignored) and mails only on an anomaly — stale `generated_at` (>48 h),
missing files, a >20% drop in the total or accessible count — plus one all-clear digest every
Monday, so a silent week means the watcher itself died. The digest carries the day's and week's
changes (new features, grey→green transitions = answered room questions) and, per configured
token, zone-level visit totals (Cloudflare) and the count of changesets made through the
site's own MapComplete theme (OSMCha) — the attributable slice of the mission metric.
Everything is aggregate; no visitor or mapper data.

```cron
30 5 * * * cd /path/to/papa-map && set -a && . ./ops.env && set +a && ./.venv/bin/python -m pipeline.ops >> ops.log 2>&1
```

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
