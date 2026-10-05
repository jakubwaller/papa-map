"""The store apps' numbers for the private ops page: App Store downloads from
App Store Connect's daily Sales report, App Store ratings per storefront from
the public iTunes lookup API, and Google Play installs from the Play Console's
statistics CSVs in Cloud Storage. Three sources, each optional and each on its
own: unset credentials leave its block out, a failing fetch is reported on
stderr and on the page and never fails the check. Everything here is an
aggregate the stores already show their developer — units per day, counts of
ratings — and nothing about any one reader.

Configuration, all from the environment (ops.env on the server, DEPLOY.md):

  PAPAMAP_APP_STORE_ID       the App Store id (6813376985); gates the ratings
  PAPAMAP_ANDROID_PACKAGE    the Play package (de.papamap.app); gates Play
  ASC_ISSUER_ID, ASC_KEY_ID  the App Store Connect API key (Admin or Sales)
  ASC_API_KEY_P8_B64         its .p8, base64 in one line (`base64 < AuthKey_*.p8`)
  ASC_VENDOR_NUMBER          App Store Connect → Payments and Financial Reports
  PLAY_SERVICE_ACCOUNT_JSON_B64  a service account's JSON key, base64 in one
                             line; the account needs "View app information and
                             download bulk reports" in the Play Console
  PLAY_STATS_BUCKET          the reports bucket, `gs://pubsite_prod_rev_…` or
                             the bare name (Play Console → Download reports →
                             Statistics → Copy Cloud Storage URI)
"""
from __future__ import annotations

import base64
import csv
import gzip
import io
import json
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone
from urllib.parse import quote

import requests

ITUNES_LOOKUP_URL = "https://itunes.apple.com/lookup"
ASC_SALES_URL = "https://api.appstoreconnect.apple.com/v1/salesReports"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GCS_READ_SCOPE = "https://www.googleapis.com/auth/devstorage.read_only"
GCS_OBJECT_URL = "https://storage.googleapis.com/storage/v1/b/{bucket}/o/{obj}"
TIMEOUT_S = 60

# The storefronts asked for ratings: the map's countries plus the stores
# where German-speaking readers end up. Ratings are per storefront — mamamap
# shows 6 in Germany and 27,548 in Japan — so a single lookup would miss
# most of them.
STOREFRONTS = ("de", "at", "ch", "cz", "sk", "pl", "nl", "be", "lu", "fr",
               "it", "es", "pt", "dk", "se", "no", "fi", "ie", "gb", "us",
               "ca", "au", "nz", "jp")
# The day 1.0 went Ready for Sale: no download can predate it, so a history
# reaching back to it is all time.
APP_STORE_LIVE_SINCE = "2026-09-25"
# Apple's daily report lands around 05:00 Pacific for the day before — well
# after the 07:30 CEST run — so the check asks for the last few days every
# run and lets a day that is "not available yet" wait for tomorrow.
SALES_LOOKBACK_DAYS = 7


# ---- App Store ratings (public, no credentials) -------------------------------

def itunes_ratings(app_id: str, storefronts=STOREFRONTS, get=requests.get) -> dict | None:
    """{"version", "released", "total", "avg", "stores": {cc: {"count",
    "avg"}}} over the storefronts that have any rating; None when every
    lookup failed (the API is flaky, not the app gone). A storefront where
    the app is not sold answers resultCount 0 and is skipped."""
    stores, version, released, failed = {}, None, None, 0
    for cc in storefronts:
        try:
            r = get(ITUNES_LOOKUP_URL, params={"id": app_id, "country": cc},
                    timeout=TIMEOUT_S)
            results = r.json().get("results") or []
        except Exception as exc:  # noqa: BLE001 — one store, not the block
            failed += 1
            print(f"WARN: iTunes lookup {cc} failed: {exc}", file=sys.stderr)
            continue
        if not results:
            continue
        hit = results[0]
        version = version or hit.get("version")
        released = released or str(hit.get("currentVersionReleaseDate") or "")[:10]
        count = int(hit.get("userRatingCount") or 0)
        if count:
            stores[cc] = {"count": count,
                          "avg": round(float(hit.get("averageUserRating") or 0), 2)}
    if failed == len(storefronts):
        return None
    total = sum(s["count"] for s in stores.values())
    avg = (round(sum(s["count"] * s["avg"] for s in stores.values()) / total, 2)
           if total else None)
    return {"version": version, "released": released or None,
            "total": total, "avg": avg, "stores": stores}


# ---- App Store downloads (App Store Connect, Sales report) -------------------

def asc_token(issuer: str, key_id: str, p8_pem: str, now: float | None = None) -> str:
    """A 10-minute App Store Connect bearer: ES256 over iss/iat/exp/aud with
    the key id in the header, exactly what app/ios/asc.mjs mints for the
    build runner."""
    import jwt  # PyJWT[crypto]; imported here so the check runs without it
    #            when no store credentials are configured
    iat = int(now if now is not None else time.time())
    return jwt.encode({"iss": issuer, "iat": iat, "exp": iat + 600,
                       "aud": "appstoreconnect-v1"},
                      p8_pem, algorithm="ES256", headers={"kid": key_id})


def parse_sales_tsv(text: str, app_id: str) -> dict:
    """Units for one app out of a daily SALES SUMMARY report: first-time
    downloads (product types 1*, F1*), re-downloads (3*) and updates (7*).
    Units can be negative (refunds, reversed installs); they are summed as
    Apple reports them. Rows of other apps and products are ignored."""
    out = {"downloads": 0, "redownloads": 0, "updates": 0}
    rows = csv.DictReader(io.StringIO(text), delimiter="\t")
    for row in rows:
        if str(row.get("Apple Identifier", "")).strip() != str(app_id):
            continue
        ptype = str(row.get("Product Type Identifier", "")).strip()
        try:
            units = int(float(row.get("Units") or 0))
        except ValueError:
            continue
        if ptype.startswith("1") or ptype.startswith("F1"):
            out["downloads"] += units
        elif ptype.startswith("3"):
            out["redownloads"] += units
        elif ptype.startswith("7"):
            out["updates"] += units
    return out


def asc_sales_day(day: str, vendor: str, token: str, app_id: str,
                  get=requests.get) -> dict | None:
    """The app's units for one day, or None when Apple has not published the
    day yet. Apple answers 404 both for "not available yet" and for "no sales
    for the date" — the second is a real zero and is returned as one."""
    r = get(ASC_SALES_URL, timeout=TIMEOUT_S,
            headers={"Authorization": f"Bearer {token}",
                     "Accept": "application/a-gzip"},
            params={"filter[frequency]": "DAILY", "filter[reportDate]": day,
                    "filter[reportSubType]": "SUMMARY",
                    "filter[reportType]": "SALES",
                    "filter[vendorNumber]": vendor})
    if r.status_code == 404:
        detail = ""
        try:
            detail = " ".join(e.get("detail", "") for e in r.json().get("errors", []))
        except ValueError:
            pass
        if "no sales" in detail.lower():
            return {"downloads": 0, "redownloads": 0, "updates": 0}
        return None  # not available yet (or an unknown 404: tomorrow again)
    r.raise_for_status()
    body = r.content
    try:
        body = gzip.decompress(body)
    except OSError:
        pass  # already plain text
    return parse_sales_tsv(body.decode("utf-8", errors="replace"), app_id)


def _asc_env() -> dict | None:
    issuer = os.environ.get("ASC_ISSUER_ID")
    key_id = os.environ.get("ASC_KEY_ID")
    p8_b64 = os.environ.get("ASC_API_KEY_P8_B64")
    vendor = os.environ.get("ASC_VENDOR_NUMBER")
    if not (issuer and key_id and p8_b64 and vendor):
        return None
    return {"issuer": issuer, "key_id": key_id, "vendor": vendor,
            "p8": base64.b64decode(p8_b64).decode("utf-8")}


def app_store_downloads(app_id: str, known_days: dict, now: datetime,
                        get=requests.get, env: dict | None = None) -> dict | None:
    """{"by_day": {date: {downloads, redownloads, updates}}, "pending":
    [dates Apple has not published]} for the last SALES_LOOKBACK_DAYS
    complete days — every one of them asked for again, so a day first seen
    as "not available yet" fills in tomorrow and a report Apple restates
    overwrites. None when the ASC_* variables are unset; {"error": …} when
    the first request fails (the rest would fail the same way)."""
    env = env or _asc_env()
    if not env:
        return None
    token = asc_token(env["issuer"], env["key_id"], env["p8"], now.timestamp())
    by_day, pending = {}, []
    for back in range(1, SALES_LOOKBACK_DAYS + 1):
        day = (now.date() - timedelta(days=back)).isoformat()
        try:
            units = asc_sales_day(day, env["vendor"], token, app_id, get)
        except Exception as exc:  # noqa: BLE001 — reported, never fatal
            print(f"WARN: App Store sales report {day} failed: {exc}",
                  file=sys.stderr)
            return {"error": str(exc)[:80], "by_day": by_day, "pending": pending}
        if units is None:
            pending.append(day)
        else:
            by_day[day] = units
    return {"by_day": by_day, "pending": pending}


# ---- Google Play installs (Cloud Storage reports) ----------------------------

def google_token(sa: dict, scope: str = GCS_READ_SCOPE, post=requests.post,
                 now: float | None = None) -> str:
    """An hour's OAuth bearer for a service account: a self-signed RS256 JWT
    exchanged at Google's token endpoint."""
    import jwt
    iat = int(now if now is not None else time.time())
    assertion = jwt.encode({"iss": sa["client_email"], "scope": scope,
                            "aud": sa.get("token_uri", GOOGLE_TOKEN_URL),
                            "iat": iat, "exp": iat + 3600},
                           sa["private_key"], algorithm="RS256")
    r = post(sa.get("token_uri", GOOGLE_TOKEN_URL), timeout=TIMEOUT_S,
             data={"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                   "assertion": assertion})
    r.raise_for_status()
    return r.json()["access_token"]


def parse_installs_csv(raw: bytes) -> dict:
    """{date: {"installs", "uninstalls", "active"}} from one month's
    installs_<package>_<YYYYMM>_overview.csv. Play writes UTF-16 with a BOM;
    the column set has changed over the years, so the three figures are read
    by whichever header carries them: daily user installs/uninstalls (else
    the install/uninstall event counts) and active device installs."""
    # ASCII bytes "decode" as UTF-16 without complaint, so the byte-order
    # mark decides, not a failed attempt.
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        text = raw.decode("utf-16", errors="replace")
    else:
        text = raw.decode("utf-8-sig", errors="replace")
    rows = csv.DictReader(io.StringIO(text.lstrip("\ufeff")))
    out = {}
    for row in rows:
        day = str(row.get("Date") or "").strip()
        if len(day) != 10:
            continue

        def num(*names):
            for n in names:
                v = row.get(n)
                if v not in (None, ""):
                    try:
                        return int(float(v))
                    except ValueError:
                        return 0
            return 0
        out[day] = {"installs": num("Daily User Installs", "Install events"),
                    "uninstalls": num("Daily User Uninstalls", "Uninstall events"),
                    "active": num("Active Device Installs")}
    return out


def _play_env() -> dict | None:
    sa_b64 = os.environ.get("PLAY_SERVICE_ACCOUNT_JSON_B64")
    bucket = os.environ.get("PLAY_STATS_BUCKET")
    if not (sa_b64 and bucket):
        return None
    bucket = bucket.replace("gs://", "").strip("/").split("/")[0]
    return {"sa": json.loads(base64.b64decode(sa_b64)), "bucket": bucket}


def play_installs(package: str, now: datetime, get=requests.get,
                  post=requests.post, env: dict | None = None) -> dict | None:
    """{"by_day": {date: {installs, uninstalls, active}}} from this month's
    and last month's overview CSVs (Play restates a month's file daily, so
    both are read whole every run). None when PLAY_* is unset; {"error": …}
    when the token or a fetch fails. A month without a file (the app not yet
    in the store) is skipped, not an error."""
    env = env or _play_env()
    if not env:
        return None
    try:
        token = google_token(env["sa"], post=post, now=now.timestamp())
    except Exception as exc:  # noqa: BLE001
        print(f"WARN: Google token failed: {exc}", file=sys.stderr)
        return {"error": str(exc)[:80], "by_day": {}}
    by_day = {}
    first = now.date().replace(day=1)
    months = [(first - timedelta(days=1)).strftime("%Y%m"), first.strftime("%Y%m")]
    for ym in months:
        obj = f"stats/installs/installs_{package}_{ym}_overview.csv"
        try:
            r = get(GCS_OBJECT_URL.format(bucket=env["bucket"], obj=quote(obj, safe="")),
                    params={"alt": "media"}, timeout=TIMEOUT_S,
                    headers={"Authorization": f"Bearer {token}"})
            if r.status_code == 404:
                continue
            r.raise_for_status()
            by_day.update(parse_installs_csv(r.content))
        except Exception as exc:  # noqa: BLE001
            print(f"WARN: Play installs {ym} failed: {exc}", file=sys.stderr)
            return {"error": str(exc)[:80], "by_day": by_day}
    return {"by_day": by_day}


# ---- All three, for the check -------------------------------------------------

def fetch_all(now: datetime | None = None, known_days: dict | None = None,
              get=requests.get, post=requests.post) -> dict | None:
    """What the check asks for every run. None when neither store id is
    configured (the tests' default, and a checkout without ops.env); else
    {"ratings": …|None, "ios": …|None, "android": …|None} with each source's
    own answer, None where its credentials are unset."""
    now = now or datetime.now(timezone.utc)
    app_id = os.environ.get("PAPAMAP_APP_STORE_ID")
    package = os.environ.get("PAPAMAP_ANDROID_PACKAGE")
    if not app_id and not package:
        return None
    out = {"ratings": None, "ios": None, "android": None}
    if app_id:
        out["ratings"] = itunes_ratings(app_id, get=get)
        out["ios"] = app_store_downloads(app_id, known_days or {}, now, get=get)
    if package:
        out["android"] = play_installs(package, now, get=get, post=post)
    return out


def merge_app_days(kept: dict, apps: dict | None, now: datetime,
                   cap: int = 400) -> dict:
    """The per-day app history: {date: {ios_downloads, ios_redownloads,
    ios_updates, android_installs, android_uninstalls, android_active}},
    each store's keys written only when its fetch answered — a failed or
    unconfigured source leaves its columns as they were. Today is never
    stored (Play's current day is partial; Apple has no report for it)."""
    merged = {d: dict(v) for d, v in kept.items()}
    today = now.strftime("%Y-%m-%d")

    def put(day, values):
        if day >= today:
            return
        merged.setdefault(day, {}).update(values)

    ios = (apps or {}).get("ios") or {}
    for day, u in (ios.get("by_day") or {}).items():
        put(day, {"ios_downloads": int(u.get("downloads", 0)),
                  "ios_redownloads": int(u.get("redownloads", 0)),
                  "ios_updates": int(u.get("updates", 0))})
    android = (apps or {}).get("android") or {}
    for day, u in (android.get("by_day") or {}).items():
        put(day, {"android_installs": int(u.get("installs", 0)),
                  "android_uninstalls": int(u.get("uninstalls", 0)),
                  "android_active": int(u.get("active", 0))})
    return dict(sorted(merged.items())[-cap:])
