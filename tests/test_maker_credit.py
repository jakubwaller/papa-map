"""The maker credit ("Made with ♥ in Hamburg by Jakub Waller" → jakubwaller.eu)
is on every public page: the static ones under web/ and every generated
footer in both string tables. A new language that forgets it fails here."""
from __future__ import annotations

import inspect
from pathlib import Path

from pipeline import leaderboard_strings, ops_page, pages_l10n

WEB = Path(__file__).resolve().parents[1] / "web"
CREDIT_HREF = 'href="https://jakubwaller.eu"'


def _static_pages() -> list[Path]:
    named = ["index.html", "index-en.html", "app.html", "app-en.html", "impressum.html"]
    return [WEB / n for n in named] + sorted(WEB.glob("methods*.html"))


def test_every_static_page_carries_the_credit_once():
    missing = []
    for page in _static_pages():
        html = page.read_text(encoding="utf-8")
        if html.count(CREDIT_HREF) != 1:
            missing.append(page.name)
    assert not missing, f"credit missing or duplicated on: {missing}"


def test_every_generated_footer_carries_the_credit():
    missing = []
    for table_name, table in (("pages_l10n", pages_l10n.L), ("leaderboard_strings", leaderboard_strings.L)):
        for lang, strings in table.items():
            if CREDIT_HREF not in strings["footer"]:
                missing.append(f"{table_name}[{lang}]")
    assert not missing, f"footer without the credit: {missing}"


def test_ops_page_footer_carries_the_credit():
    assert CREDIT_HREF in inspect.getsource(ops_page)
