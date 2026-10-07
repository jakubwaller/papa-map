"""The methods pages state the classification rule; classify.py applies it.

Each of the 32 pages has a green and a red list item (`<span class="dot g">`,
`<span class="dot r">`) whose <code> runs are the tokens. The prose around them
is translated and may say anything; the tokens must be exactly classify.py's,
so a token added to or removed from the rule fails here until every page says so.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

from pipeline.classify import ACCESSIBLE_TOKENS, FEMALE_TOKEN

WEB = Path(__file__).resolve().parent.parent / "web"
PAGES = sorted(WEB.glob("methods*.html"))


def item_tokens(html, dot):
    items = re.findall(rf'<li><span class="dot {dot}"></span>(.*?)</li>', html, re.S)
    assert len(items) == 1, f"{len(items)} 'dot {dot}' items"
    return set(re.findall(r"<code>([^<]+)</code>", items[0]))


def test_every_language_has_a_methods_page():
    assert len(PAGES) == 32  # methods.html plus 31 translations


@pytest.mark.parametrize("page", PAGES, ids=lambda p: p.name)
def test_green_and_red_lists_are_the_classified_tokens(page):
    html = page.read_text(encoding="utf-8")
    green = item_tokens(html, "g")
    assert green == ACCESSIBLE_TOKENS, f"off by {sorted(green ^ ACCESSIBLE_TOKENS)}"
    assert item_tokens(html, "r") == {FEMALE_TOKEN}
