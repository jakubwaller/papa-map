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
