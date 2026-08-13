"""Guard against MapComplete theme rot: `python -m pipeline.theme_check`,
run by CI weekly and on any change under theme/.

Since the v4 contract amendment every MapComplete link on the site loads
theme/papamap.theme.json at runtime from this repo's raw URL, so nobody
migrates it when MapComplete's theme format changes — it would just stop
loading, silently, on every pin. Two checks against that:

1. Validate the local theme against MapComplete's published ThemeConfigJson
   schema, after undoing two known artifacts of their schema generator
   (documented in theme/README.md; both still present on master as of
   2026-08, and MapComplete's own bundled toilets theme fails them too):
   the Record<string,string> definition matches only {}, and freeform
   demands the internal helperArgs property.
2. Fetch the exact raw URL baked into every pin and fail if it stops
   serving JSON (branch renamed, file moved, repo gone private).

Exit 0 = both hold. Any failure prints why and exits 1, which is the CI
signal to look at what MapComplete changed."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import requests
from jsonschema import Draft7Validator

from .config import USER_AGENT
from .export import PAPAMAP_THEME_URL

SCHEMA_URL = ("https://raw.githubusercontent.com/pietervdvn/MapComplete/"
              "master/Docs/Schemas/ThemeConfigJson.schema.json")
THEME_PATH = Path(__file__).resolve().parent.parent / "theme" / "papamap.theme.json"


def fetch_json(url):
    r = requests.get(url, timeout=30, headers={"User-Agent": USER_AGENT})
    r.raise_for_status()
    return r.json()


def undo_generator_artifacts(schema) -> list[str]:
    """Patch the two degenerate constructs in place; the returned notes say
    what was undone so the log shows when upstream fixes them (at which point
    these patches become no-ops and can go)."""
    notes = []
    for name, defn in schema.get("definitions", {}).items():
        if (name.startswith("Record<")
                and defn.get("additionalProperties") is False
                and not defn.get("properties")):
            defn.pop("additionalProperties")
            defn["type"] = "object"
            notes.append(f"opened degenerate {name}")
        freeform = defn.get("properties", {}).get("freeform")
        if freeform and freeform.get("required") == ["helperArgs"]:
            del freeform["required"]
            notes.append(f"dropped freeform helperArgs requirement in {name}")
    return notes


def validate_theme(theme, schema) -> list[str]:
    errors = sorted(Draft7Validator(schema).iter_errors(theme),
                    key=lambda e: list(e.absolute_path))
    return [f"{'/'.join(map(str, e.absolute_path)) or '<root>'}: {e.message}"
            for e in errors]


def main() -> int:
    theme = json.loads(THEME_PATH.read_text(encoding="utf-8"))
    failures = []

    try:
        schema = fetch_json(SCHEMA_URL)
    except Exception as exc:
        failures.append(f"could not fetch MapComplete schema: {exc}")
    else:
        for note in undo_generator_artifacts(schema):
            print(f"schema patch: {note}")
        for err in validate_theme(theme, schema):
            failures.append(f"schema violation: {err}")

    try:
        served = fetch_json(PAPAMAP_THEME_URL)
        if served.get("id") != theme.get("id"):
            failures.append(
                f"raw URL serves theme id {served.get('id')!r}, "
                f"expected {theme.get('id')!r}: {PAPAMAP_THEME_URL}")
        elif served != theme:
            # legitimate on a branch that edits the theme; drift on main
            print("note: raw URL content differs from checkout "
                  "(unmerged theme change?)")
    except Exception as exc:
        failures.append(
            f"raw URL baked into every pin is broken: {PAPAMAP_THEME_URL} "
            f"({exc})")

    for f in failures:
        print(f"FAIL: {f}")
    if not failures:
        print(f"theme OK: schema valid, {PAPAMAP_THEME_URL} serves it")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
