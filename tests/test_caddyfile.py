from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CADDYFILE = ROOT / "deploy" / "papamap.Caddyfile"

# No Caddy in the pytest run (CI's deploy-config job validates the syntax);
# these pin the cache headers that only show on the live site otherwise.


def _block(text: str, opener: str) -> str:
    start = text.index(opener)
    end = text.index("\n\t}", start)
    return text[start:end]


def test_private_route_is_never_cached():
    # The site-wide default is `public, max-age=3600`; under /private/ that
    # kept a cookie-less 404 for an hour and declared a token-gated page
    # storable by any shared cache. The Set must come before the snippet.
    route = _block(CADDYFILE.read_text(encoding="utf-8"), "route /private/* {")
    lines = [ln.strip() for ln in route.splitlines()[1:] if ln.strip()]
    assert lines[0] == 'header Cache-Control "private, no-store"'
    assert lines.index("import /etc/caddy/private/*.caddy") > 0


def test_service_worker_is_revalidated_every_time():
    # On the hour default Cloudflare held sw.js for four (DEPLOY.md).
    text = CADDYFILE.read_text(encoding="utf-8")
    assert re.search(r"^\t@sw path /sw\.js$", text, re.M)
    assert re.search(r'^\theader @sw Cache-Control "no-cache"$', text, re.M)


def test_private_page_has_no_second_public_address():
    # web-data/private sits inside the /data mount, so the ops page also lives
    # at /data/private/. Only this block hides it, and the 404 in /private/*
    # must stay behind the snippet's file_server as the last thing to run.
    text = CADDYFILE.read_text(encoding="utf-8")
    data = _block(text, "handle /data/private/* {")
    assert [ln.strip() for ln in data.splitlines()[1:] if ln.strip()] == ["respond 404"]
    route = _block(text, "route /private/* {")
    assert [ln.strip() for ln in route.splitlines() if ln.strip()][-1] == "respond 404"
