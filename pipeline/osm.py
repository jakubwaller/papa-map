from __future__ import annotations

import time

import requests

from .config import OVERPASS_BACKOFF_S, OVERPASS_RETRIES, OVERPASS_URLS, USER_AGENT

# Transient responses worth retrying: rate limiting (429), gateway/overload
# (5xx), and the 406 the main balancer returns when its backends are saturated.
# Anything else (e.g. 400 for a bad query) is our fault and no mirror will fix it.
_RETRY_STATUS = {406, 429, 500, 502, 503, 504}


def element_coords(el) -> tuple[float | None, float | None]:
    """lat/lon of a node, or the `out center` centroid for ways/relations."""
    if "lat" in el and "lon" in el:
        return el["lat"], el["lon"]
    c = el.get("center")
    return (c["lat"], c["lon"]) if c else (None, None)


def _fetch_once(url: str, ql: str) -> dict:
    resp = requests.get(url, params={"data": ql},
                        headers={"User-Agent": USER_AGENT}, timeout=120)
    resp.raise_for_status()
    return resp.json()


def fetch_overpass(ql: str, urls=None, retries=None, backoff=None) -> dict:
    """Fetch from Overpass, trying each mirror in turn and retrying transient
    failures (429/5xx/406, timeouts, transport errors) with exponential backoff.
    A non-transient status (e.g. 400) raises at once — mirrors won't differ. Only
    when every mirror is exhausted does the last transient error propagate."""
    urls = urls or OVERPASS_URLS
    retries = OVERPASS_RETRIES if retries is None else retries
    backoff = OVERPASS_BACKOFF_S if backoff is None else backoff
    if not urls:
        raise ValueError("no Overpass URLs configured")
    last_exc: Exception | None = None
    for url in urls:
        for attempt in range(retries):
            try:
                return _fetch_once(url, ql)
            except requests.HTTPError as exc:
                if exc.response is None or exc.response.status_code not in _RETRY_STATUS:
                    raise
                last_exc = exc
            except requests.RequestException as exc:  # timeouts, resets, DNS, etc.
                last_exc = exc
            if attempt < retries - 1:
                time.sleep(backoff * (2 ** attempt))
    raise last_exc  # every mirror exhausted its retries
