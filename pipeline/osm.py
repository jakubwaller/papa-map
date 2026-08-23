from __future__ import annotations

import re
import sys
import time
from datetime import datetime, timedelta, timezone

import requests

from .classify import has_play_area
from .config import (OVERPASS_BACKOFF_S, OVERPASS_HTTP_TIMEOUT,
                     OVERPASS_MAX_DATA_AGE_H, OVERPASS_RETRIES,
                     OVERPASS_SLOT_WAIT_MAX_S, OVERPASS_STATUS_HOSTS,
                     OVERPASS_TRIP_AFTER, OVERPASS_TRIP_COOLDOWN_S,
                     OVERPASS_TRIP_MAX_S, OVERPASS_URLS, USER_AGENT)

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


def dedup_elements(elements) -> list:
    """Drop repeat (type, id) pairs, keeping first occurrence and order. The
    per-Bundesland sweep can return one object twice when it sits on (or its
    area assignment straddles) a Länder boundary."""
    seen, out = set(), []
    for el in elements:
        key = (el.get("type"), el.get("id"))
        if key in seen:
            continue
        seen.add(key)
        out.append(el)
    return out


def parse_counts(data: dict) -> list[int]:
    """The totals from a query's `out count;` statements, in statement order.
    Overpass answers each one with a synthetic element of type "count" whose
    tags carry the per-kind breakdown and a `total`; only the total interests
    us. Elements of any other type are ignored, so this is safe on a mixed
    response.

    A short list means the server answered fewer counts than the query asked
    for — the caller checks, because silently reading a missing count as zero
    would publish "0 toilets" as though it were a fact."""
    return [int((el.get("tags") or {}).get("total", 0))
            for el in data.get("elements", ()) or ()
            if el.get("type") == "count"]


def split_sweep(elements) -> tuple[list, list]:
    """The union sweep's answer (config.sweep_ql), back into its two halves:

      * objects carrying a `changing_table` tag — any value, since `no` and
        junk like "02" still feed the stats;
      * objects that carry none but do record an indoor play area.

    An object with both belongs to the first list only: it is already a pin,
    and its play corner rides along as the feature's `play` property. Anything
    in neither list is the Overpass prefilter being looser than has_play_area
    (`kids_area:indoor=no` over a bare `kids_area=yes`) and is dropped."""
    ct, play = [], []
    for el in elements:
        tags = el.get("tags") or {}
        if "changing_table" in tags:
            ct.append(el)
        elif has_play_area(tags):
            play.append(el)
    return ct, play


def slot_wait_s(url: str, get=None) -> float:
    """Seconds until overpass-api.de will accept a query from this IP, per
    its /api/status page ("2 slots available now." or "Slot available after:
    ..., in 37 seconds."). The main instance holds a used slot for ~40 s
    regardless of the query's runtime, so a sweep that fires back-to-back
    gets a 429 for two of every three queries; asking first is both quicker
    and politer than colliding. Hosts without that page (the mirrors) and any
    failure to read it answer 0 — the fetch then just tries."""
    host = url.split("/")[2] if "//" in url else ""
    if host not in OVERPASS_STATUS_HOSTS:
        return 0
    try:
        resp = (get or requests.get)(f"https://{host}/api/status",
                                     headers={"User-Agent": USER_AGENT}, timeout=15)
        text = resp.text
    except requests.RequestException:
        return 0
    if re.search(r"[1-9]\d* slots? available now", text):
        return 0
    waits = [int(x) for x in re.findall(r"in (\d+) seconds", text)]
    return min(min(waits) + 1, OVERPASS_SLOT_WAIT_MAX_S) if waits else 0


class StaleMirror(requests.RequestException):
    """The mirror answered from a database older than OVERPASS_MAX_DATA_AGE_H.
    Its data is complete and well-formed — just from another season."""


def check_fresh(data: dict, url: str, now: datetime | None = None,
                max_age_h: float | None = None) -> None:
    ts = (data.get("osm3s") or {}).get("timestamp_osm_base")
    if not ts:
        return  # not every frontend reports it; absence is not evidence
    base = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    max_age_h = OVERPASS_MAX_DATA_AGE_H if max_age_h is None else max_age_h
    age = (now or datetime.now(timezone.utc)) - base
    if age > timedelta(hours=max_age_h):
        raise StaleMirror(f"{url}: database is {age.days} days old ({ts})")


# --- Circuit breaker ---------------------------------------------------------
# Per host: when it may be contacted again (time.monotonic()), how many
# queries in a row exhausted their retries on it, and how many times in a row
# it has been rested — the cool-down doubles with the latter. A host that is
# resting is skipped without a single packet; when every configured host is
# resting, fetch_overpass raises OverpassUnavailable at once and the caller
# can wait breaker_wait_s() instead of failing area after area in
# milliseconds. See config.OVERPASS_TRIP_* for the numbers and the night that
# earned them.
_breaker: dict[str, dict] = {}


class OverpassUnavailable(requests.RequestException):
    """Every configured host is resting after failures; nothing was contacted."""


def _host(url: str) -> str:
    return url.split("/")[2] if "//" in url else url


def _state(url: str) -> dict:
    return _breaker.setdefault(_host(url), {"until": 0.0, "strikes": 0, "trips": 0})


def is_tripped(url: str, now: float | None = None) -> bool:
    return (time.monotonic() if now is None else now) < _state(url)["until"]


def breaker_wait_s(urls=None, now: float | None = None) -> float:
    """Seconds until the first of `urls` may be contacted again — 0 when any
    of them may be contacted now."""
    now = time.monotonic() if now is None else now
    waits = [max(0.0, _state(u)["until"] - now) for u in (urls or OVERPASS_URLS)]
    return min(waits) if waits else 0.0


def reset_breaker() -> None:
    _breaker.clear()


def _refused(exc: Exception) -> bool:
    """A connection that never opened — refused, unreachable, no route. That is
    what a firewall ban (or a dead host) looks like, as opposed to a reset
    mid-transfer or a timeout, which a retry may well get past."""
    if not isinstance(exc, requests.ConnectionError) or isinstance(exc, requests.Timeout):
        return False
    cause = exc.args[0] if exc.args else None
    reason = getattr(cause, "reason", cause)
    text = f"{type(reason).__name__} {reason}".lower()
    return ("newconnectionerror" in text or "refused" in text
            or "unreachable" in text or "no route" in text)


def _trip(url: str, why: str, now: float | None = None) -> None:
    st = _state(url)
    st["trips"] += 1
    st["strikes"] = 0
    rest = min(OVERPASS_TRIP_COOLDOWN_S * 2 ** (st["trips"] - 1), OVERPASS_TRIP_MAX_S)
    st["until"] = (time.monotonic() if now is None else now) + rest
    print(f"  WARN {url}: resting it for {rest / 60:.0f} min ({why})", file=sys.stderr)


def _strike(url: str, exc: Exception | None) -> None:
    st = _state(url)
    st["strikes"] += 1
    if st["strikes"] >= OVERPASS_TRIP_AFTER:
        _trip(url, f"{st['strikes']} queries in a row failed, last: {_short(exc)}")


def _recover(url: str) -> None:
    st = _state(url)
    st["strikes"] = st["trips"] = 0


def _fetch_once(url: str, ql: str) -> dict:
    resp = requests.get(url, params={"data": ql},
                        headers={"User-Agent": USER_AGENT}, timeout=OVERPASS_HTTP_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    # A query that blows its [timeout:...] budget still answers HTTP 200 —
    # with the elements it got around to computing and a "runtime error"
    # remark. Writing that through would silently drop data, so it's treated
    # exactly like a 504: retryable, next mirror may be faster.
    remark = data.get("remark") or ""
    if "runtime error" in remark:
        raise requests.RequestException(f"overpass remark: {remark}")
    check_fresh(data, url)
    return data


def fetch_overpass(ql: str, urls=None, retries=None, backoff=None) -> dict:
    """Fetch from Overpass, trying each mirror in turn and retrying transient
    failures (429/5xx/406, timeouts, transport errors) with exponential backoff.
    A non-transient status (e.g. 400) raises at once — mirrors won't differ. A
    mirror answering from a stale database is skipped, not retried. Only when
    every mirror is exhausted does the last transient error propagate."""
    urls = urls or OVERPASS_URLS
    retries = OVERPASS_RETRIES if retries is None else retries
    backoff = OVERPASS_BACKOFF_S if backoff is None else backoff
    if not urls:
        raise ValueError("no Overpass URLs configured")
    last_exc: Exception | None = None
    resting = 0
    for url in urls:
        if is_tripped(url):
            resting += 1
            continue
        for attempt in range(retries):
            wait = slot_wait_s(url)
            if wait:
                time.sleep(wait)
            try:
                data = _fetch_once(url, ql)
            except requests.HTTPError as exc:
                if exc.response is None or exc.response.status_code not in _RETRY_STATUS:
                    raise
                last_exc = exc
            except StaleMirror as exc:
                print(f"  WARN {exc} — skipping mirror", file=sys.stderr)
                last_exc = exc
                break  # a frozen database will not thaw in five seconds
            except requests.RequestException as exc:  # timeouts, resets, DNS, etc.
                last_exc = exc
                if _refused(exc):
                    # A port that will not open will not open in five seconds
                    # either, and knocking three more times is exactly what a
                    # ban is meant to discourage. Rest the host at once.
                    _trip(url, _short(exc))
                    break
            else:
                _recover(url)
                return data
            if attempt < retries - 1:
                time.sleep(backoff * (2 ** attempt))
        else:
            # Without this line the nightly log only ever shows the *last*
            # mirror's excuse — on the 2026-08-15 heal that was always the
            # stale fallback, and why the main instance had failed was lost.
            print(f"  WARN {url}: gave up after {retries} attempts "
                  f"({_short(last_exc)})", file=sys.stderr)
            _strike(url, last_exc)
    if resting == len(urls):
        raise OverpassUnavailable(
            "every Overpass host is resting after failures, next one back in "
            f"{breaker_wait_s(urls) / 60:.0f} min")
    raise last_exc  # every mirror exhausted its retries


def _short(exc: Exception | None) -> str:
    if isinstance(exc, requests.HTTPError) and exc.response is not None:
        return f"HTTP {exc.response.status_code}"
    return str(exc).split(" for url:")[0][:120]
