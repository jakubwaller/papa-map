"""pipeline.appstats — the store figures for the private ops page, offline:
every network call is a fake, every key is generated for the test."""
import base64
import gzip
import json
from datetime import datetime, timezone

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec, rsa

from pipeline import appstats

NOW = datetime(2026, 10, 6, 5, 30, tzinfo=timezone.utc)
APP = "6813376985"


class R:
    def __init__(self, status=200, body=b"", payload=None):
        self.status_code = status
        self.content = body
        self._payload = payload

    def json(self):
        if self._payload is None:
            raise ValueError("no json")
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


def pem(private_key):
    return private_key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption()).decode()


# ---- ratings -----------------------------------------------------------------

def lookup(cc_results):
    def get(url, params, timeout):
        assert url == appstats.ITUNES_LOOKUP_URL and params["id"] == APP
        cc = params["country"]
        if cc_results.get(cc) == "boom":
            raise ConnectionError("down")
        hit = cc_results.get(cc)
        return R(payload={"resultCount": 1 if hit else 0,
                          "results": [hit] if hit else []})
    return get


def test_itunes_ratings_sums_the_storefronts_that_have_any():
    hit = lambda n, avg: {"version": "1.2", "currentVersionReleaseDate":  # noqa: E731
                          "2026-10-02T23:04:26Z", "userRatingCount": n,
                          "averageUserRating": avg}
    get = lookup({"de": hit(2, 5.0), "cz": hit(1, 5.0), "at": hit(0, 0),
                  "us": hit(3, 4.0), "jp": "boom"})
    out = appstats.itunes_ratings(APP, ("de", "cz", "at", "us", "jp", "fr"), get)
    assert out["version"] == "1.2" and out["released"] == "2026-10-02"
    assert out["stores"] == {"de": {"count": 2, "avg": 5.0},
                             "cz": {"count": 1, "avg": 5.0},
                             "us": {"count": 3, "avg": 4.0}}
    assert out["total"] == 6 and out["avg"] == 4.5   # weighted, not of averages
    # nothing anywhere: a real zero, with the version still known
    out = appstats.itunes_ratings(APP, ("de",), lookup({"de": hit(0, 0)}))
    assert out["total"] == 0 and out["avg"] is None and out["version"] == "1.2"
    # every lookup failing is None, not "no ratings"
    assert appstats.itunes_ratings(APP, ("de", "cz"),
                                   lookup({"de": "boom", "cz": "boom"})) is None


# ---- App Store downloads -----------------------------------------------------

HEADER = ("Provider\tProvider Country\tSKU\tDeveloper\tTitle\tVersion\t"
          "Product Type Identifier\tUnits\tDeveloper Proceeds\tBegin Date\t"
          "End Date\tCustomer Currency\tCountry Code\tCurrency of Proceeds\t"
          "Apple Identifier\tCustomer Price\tPromo Code\tParent Identifier\t"
          "Subscription\tPeriod\tCategory\tCMB\tDevice\tSupported Platforms\t"
          "Proceeds Reason\tPreserved Pricing\tClient\tOrder Type")


def row(ptype, units, app_id=APP, cc="DE"):
    cells = ["APPLE", "US", "de.papamap.app", "Jakub Waller", "PapaMap", "1.2",
             ptype, str(units), "0", "10/04/2026", "10/04/2026", "EUR", cc,
             "EUR", app_id, "0", "", "", "", "", "Navigation", "", "iPhone",
             "iOS", "", "", "", ""]
    return "\t".join(cells)


SALES = "\n".join([HEADER, row("1F", 3), row("1T", 1, cc="CZ"), row("7F", 12),
                   row("3F", 2), row("1F", 5, app_id="123"), row("1", -1)])


def test_parse_sales_tsv_sorts_units_by_product_type_for_one_app():
    assert appstats.parse_sales_tsv(SALES, APP) == {
        "downloads": 3, "redownloads": 2, "updates": 12}   # 3 + 1 - 1, other app skipped
    assert appstats.parse_sales_tsv(HEADER + "\n", APP) == {
        "downloads": 0, "redownloads": 0, "updates": 0}


def test_asc_sales_day_tells_not_yet_from_no_sales_and_reads_gzip():
    seen = {}

    def get(url, timeout, headers, params):
        seen.update(headers=headers, params=params)
        day = params["filter[reportDate]"]
        if day == "2026-10-05":
            return R(404, payload={"errors": [{"detail": "Report is not available yet. Daily reports for the Americas are available by 5 am Pacific Time."}]})
        if day == "2026-10-03":
            return R(404, payload={"errors": [{"detail": "There were no sales for the date specified."}]})
        if day == "2026-10-02":
            return R(500, payload={"errors": [{"detail": "boom"}]})
        return R(200, body=gzip.compress(SALES.encode()))

    assert appstats.asc_sales_day("2026-10-05", "88", "tok", APP, get) is None
    assert appstats.asc_sales_day("2026-10-03", "88", "tok", APP, get) == {
        "downloads": 0, "redownloads": 0, "updates": 0}
    assert appstats.asc_sales_day("2026-10-04", "88", "tok", APP, get)["downloads"] == 3
    assert seen["headers"] == {"Authorization": "Bearer tok", "Accept": "application/a-gzip"}
    assert seen["params"] == {"filter[frequency]": "DAILY",
                              "filter[reportDate]": "2026-10-04",
                              "filter[reportSubType]": "SUMMARY",
                              "filter[reportType]": "SALES",
                              "filter[vendorNumber]": "88"}
    with pytest.raises(RuntimeError):
        appstats.asc_sales_day("2026-10-02", "88", "tok", APP, get)


def test_asc_token_is_es256_with_the_key_id_in_the_header():
    key = ec.generate_private_key(ec.SECP256R1())
    tok = appstats.asc_token("issuer-1", "KEYID", pem(key), now=1_700_000_000)
    assert jwt.get_unverified_header(tok) == {"alg": "ES256", "kid": "KEYID", "typ": "JWT"}
    claims = jwt.decode(tok, key.public_key(), algorithms=["ES256"],
                        audience="appstoreconnect-v1",
                        options={"verify_exp": False})
    assert claims == {"iss": "issuer-1", "iat": 1_700_000_000,
                      "exp": 1_700_000_600, "aud": "appstoreconnect-v1"}


def test_app_store_downloads_asks_the_lookback_and_keeps_pending_days(monkeypatch):
    key = ec.generate_private_key(ec.SECP256R1())
    env = {"issuer": "i", "key_id": "k", "vendor": "88", "p8": pem(key)}
    asked = []

    def get(url, timeout, headers, params):
        day = params["filter[reportDate]"]
        asked.append(day)
        if day >= "2026-10-04":
            return R(404, payload={"errors": [{"detail": "Report is not available yet."}]})
        return R(200, body=SALES.encode())  # plain text is read too

    out = appstats.app_store_downloads(APP, {}, NOW, get=get, env=env)
    assert asked == [f"2026-10-0{d}" for d in (5, 4, 3, 2, 1)] + ["2026-09-30", "2026-09-29"]
    assert out["pending"] == ["2026-10-05", "2026-10-04"]
    assert set(out["by_day"]) == {"2026-10-03", "2026-10-02", "2026-10-01",
                                  "2026-09-30", "2026-09-29"}
    assert out["by_day"]["2026-10-01"]["downloads"] == 3
    # unset credentials: None, nothing asked
    monkeypatch.delenv("ASC_ISSUER_ID", raising=False)
    assert appstats.app_store_downloads(APP, {}, NOW, get=get) is None
    # a failing request is reported with what was fetched before it
    def bad(url, timeout, headers, params):
        if params["filter[reportDate]"] == "2026-10-03":
            raise TimeoutError("read timed out")
        return R(200, body=SALES.encode())
    out = appstats.app_store_downloads(APP, {}, NOW, get=bad, env=env)
    assert out["error"] == "read timed out" and set(out["by_day"]) == {"2026-10-05", "2026-10-04"}


def test_asc_env_decodes_the_base64_key(monkeypatch):
    monkeypatch.setenv("ASC_ISSUER_ID", "i")
    monkeypatch.setenv("ASC_KEY_ID", "k")
    monkeypatch.setenv("ASC_VENDOR_NUMBER", "88")
    monkeypatch.setenv("ASC_API_KEY_P8_B64", base64.b64encode(b"-----BEGIN PRIVATE KEY-----\nx\n").decode())
    assert appstats._asc_env() == {"issuer": "i", "key_id": "k", "vendor": "88",
                                   "p8": "-----BEGIN PRIVATE KEY-----\nx\n"}
    monkeypatch.delenv("ASC_VENDOR_NUMBER")
    assert appstats._asc_env() is None


# ---- Google Play installs ----------------------------------------------------

INSTALLS = ("Date,Package Name,Daily Device Installs,Daily Device Uninstalls,"
            "Daily Device Upgrades,Total User Installs,Daily User Installs,"
            "Daily User Uninstalls,Active Device Installs,Install events,"
            "Update events,Uninstall events\n"
            "2026-10-01,de.papamap.app,4,1,0,40,3,1,30,4,2,1\n"
            "2026-10-02,de.papamap.app,2,0,5,42,2,0,32,2,5,0\n")


def test_parse_installs_csv_reads_utf16_and_the_user_columns():
    raw = INSTALLS.encode("utf-16")  # with BOM, as Play writes it
    assert appstats.parse_installs_csv(raw) == {
        "2026-10-01": {"installs": 3, "uninstalls": 1, "active": 30},
        "2026-10-02": {"installs": 2, "uninstalls": 0, "active": 32}}
    # the newer column set: events only
    newer = ("Date,Package Name,Install events,Update events,Uninstall events,"
             "Active Device Installs\n2026-10-03,de.papamap.app,7,1,2,35\n")
    assert appstats.parse_installs_csv(newer.encode("utf-8")) == {
        "2026-10-03": {"installs": 7, "uninstalls": 2, "active": 35}}
    assert appstats.parse_installs_csv(b"") == {}


def test_google_token_signs_rs256_and_exchanges_it():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    sa = {"client_email": "ops@proj.iam.gserviceaccount.com",
          "private_key": pem(key), "token_uri": "https://oauth2.googleapis.com/token"}
    seen = {}

    def post(url, timeout, data):
        seen.update(url=url, data=data)
        return R(200, payload={"access_token": "ya29.x", "expires_in": 3600})

    assert appstats.google_token(sa, post=post, now=1_700_000_000) == "ya29.x"
    assert seen["url"] == sa["token_uri"]
    assert seen["data"]["grant_type"] == "urn:ietf:params:oauth:grant-type:jwt-bearer"
    claims = jwt.decode(seen["data"]["assertion"], key.public_key(),
                        algorithms=["RS256"], audience=sa["token_uri"],
                        options={"verify_exp": False})
    assert claims == {"iss": sa["client_email"], "scope": appstats.GCS_READ_SCOPE,
                      "aud": sa["token_uri"], "iat": 1_700_000_000,
                      "exp": 1_700_003_600}


def test_play_installs_reads_two_months_and_skips_a_missing_one(monkeypatch):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    env = {"sa": {"client_email": "a@b", "private_key": pem(key)},
           "bucket": "pubsite_prod_rev_123"}
    asked = []

    def get(url, params, timeout, headers):
        asked.append(url)
        assert headers == {"Authorization": "Bearer tok"} and params == {"alt": "media"}
        if "202609" in url:
            return R(404)
        return R(200, body=INSTALLS.encode("utf-16"))

    post = lambda url, timeout, data: R(200, payload={"access_token": "tok"})  # noqa: E731
    out = appstats.play_installs("de.papamap.app", NOW, get=get, post=post, env=env)
    assert asked == [
        "https://storage.googleapis.com/storage/v1/b/pubsite_prod_rev_123/o/"
        "stats%2Finstalls%2Finstalls_de.papamap.app_202609_overview.csv",
        "https://storage.googleapis.com/storage/v1/b/pubsite_prod_rev_123/o/"
        "stats%2Finstalls%2Finstalls_de.papamap.app_202610_overview.csv"]
    assert out == {"by_day": {
        "2026-10-01": {"installs": 3, "uninstalls": 1, "active": 30},
        "2026-10-02": {"installs": 2, "uninstalls": 0, "active": 32}}}
    # a token failure is an error, said; unset env is None
    bad_post = lambda url, timeout, data: R(401, payload={"error": "invalid_grant"})  # noqa: E731
    out = appstats.play_installs("de.papamap.app", NOW, get=get, post=bad_post, env=env)
    assert out["error"] == "HTTP 401" and out["by_day"] == {}
    monkeypatch.delenv("PLAY_STATS_BUCKET", raising=False)
    assert appstats.play_installs("de.papamap.app", NOW, get=get, post=post) is None


def test_play_env_accepts_a_gs_uri(monkeypatch):
    monkeypatch.setenv("PLAY_SERVICE_ACCOUNT_JSON_B64",
                       base64.b64encode(json.dumps({"client_email": "a@b"}).encode()).decode())
    monkeypatch.setenv("PLAY_STATS_BUCKET", "gs://pubsite_prod_rev_123/stats/installs/")
    assert appstats._play_env() == {"sa": {"client_email": "a@b"},
                                    "bucket": "pubsite_prod_rev_123"}


# ---- the check's side --------------------------------------------------------

def test_fetch_all_is_none_without_either_store_id(monkeypatch):
    monkeypatch.delenv("PAPAMAP_APP_STORE_ID", raising=False)
    monkeypatch.delenv("PAPAMAP_ANDROID_PACKAGE", raising=False)
    assert appstats.fetch_all(now=NOW, get=lambda *a, **k: 1 / 0) is None


def test_merge_app_days_writes_each_stores_columns_alone_and_never_today():
    kept = {"2026-10-01": {"ios_downloads": 1, "ios_redownloads": 0, "ios_updates": 2,
                           "android_installs": 3, "android_uninstalls": 0, "android_active": 30}}
    apps = {"ios": {"by_day": {"2026-10-01": {"downloads": 2, "redownloads": 1, "updates": 2},
                               "2026-10-02": {"downloads": 4, "redownloads": 0, "updates": 9},
                               "2026-10-06": {"downloads": 1, "redownloads": 0, "updates": 0}}},
            "android": None}   # Play unset or failed: its columns stay
    merged = appstats.merge_app_days(kept, apps, NOW)
    assert merged == {
        "2026-10-01": {"ios_downloads": 2, "ios_redownloads": 1, "ios_updates": 2,
                       "android_installs": 3, "android_uninstalls": 0, "android_active": 30},
        "2026-10-02": {"ios_downloads": 4, "ios_redownloads": 0, "ios_updates": 9}}
    assert appstats.merge_app_days(kept, None, NOW) == kept
    assert appstats.merge_app_days(kept, {"ios": {"error": "x", "by_day": {}}}, NOW) == kept
