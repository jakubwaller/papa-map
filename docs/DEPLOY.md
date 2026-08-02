# Deploying papa-map (static)

v0 is a static site: the nightly pipeline writes two JSON files into `web/data/`, and any web
server serves `web/` as plain files. **No container, no API process, no database** — there is
nothing to keep running except cron.

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

## Ops mail (optional, recommended)

`python -m pipeline.ops` compares today's dataset against yesterday's snapshot (state in
`ops-state.json`, gitignored) and mails only on an anomaly — stale `generated_at` (>48 h),
missing files, a >20% drop in the total or accessible count — plus one all-clear digest every
Monday, so a silent week means the watcher itself died. The digest carries the day's and week's
changes (new features, grey→green transitions = answered room questions) and, if a Cloudflare
token is configured, zone-level visit totals. Everything is aggregate; no visitor data.

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

No image rebuild, no restart — the server picks up changed files immediately.

## Verify

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://DOMAIN/
curl -s https://DOMAIN/data/stats.json | head
tail -n 20 /path/to/papa-map/pipeline.log
```
