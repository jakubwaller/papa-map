"""The MapComplete theme spells out the classification rule on its own.

Its marker colours, status texts and filters carry copies of the green and red
token lists as tag regexes, and MapComplete loads the theme from this repo at
runtime. A token added to classify.py but not to every copy here would paint a
pin green on papamap.de and grey (or red) behind the MapComplete edit link.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from pipeline.classify import ACCESSIBLE_TOKENS, FEATURE_VALUES, FEMALE_TOKEN

ROOT = Path(__file__).resolve().parent.parent
THEME = json.loads((ROOT / "theme" / "papamap.theme.json").read_text(encoding="utf-8"))

# `changing_table:location~i~(.*;)? *(a|b|c) *(;.*)?` — one ;-list token, any
# position. The `!~i~` form is the same match negated.
LOCATION_RE = re.compile(r"changing_table:location!?~i~\(\.\*;\)\? \*\(?([\w|]+)\)? \*\(;\.\*\)\?")


def strings(node):
    if isinstance(node, str):
        yield node
    elif isinstance(node, dict):
        for v in node.values():
            yield from strings(v)
    elif isinstance(node, list):
        for v in node:
            yield from strings(v)


def tag_conditions():
    # Tag conditions are whole strings; translated prose that merely mentions
    # the key ("changing_table tag") never starts with key + operator.
    return [s for s in strings(THEME) if re.match(r"changing_table(:location)?(!?~|=)", s)]


def test_every_location_regex_lists_exactly_the_green_or_the_red_tokens():
    regexes = [s for s in tag_conditions() if re.match(r"changing_table:location!?~", s)]
    seen = set()
    for s in regexes:
        m = LOCATION_RE.fullmatch(s)
        assert m, f"unrecognised location regex: {s}"
        toks = frozenset(m.group(1).split("|"))
        assert toks in (ACCESSIBLE_TOKENS, {FEMALE_TOKEN}), (
            f"{s}: off by {sorted(toks ^ ACCESSIBLE_TOKENS)} from ACCESSIBLE_TOKENS")
        seen.add(toks)
    assert seen == {frozenset(ACCESSIBLE_TOKENS), frozenset({FEMALE_TOKEN})}


def test_location_answers_are_the_classified_vocabulary():
    values = {s.split("=", 1)[1] for s in tag_conditions()
              if s.startswith("changing_table:location=")}
    assert values == ACCESSIBLE_TOKENS | {FEMALE_TOKEN}


def test_changing_table_values_are_the_feature_values():
    values = {s.split("=", 1)[1] for s in tag_conditions() if s.startswith("changing_table=")}
    assert values - {"no"} == FEATURE_VALUES
