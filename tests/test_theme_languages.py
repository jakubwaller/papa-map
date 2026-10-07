"""Every translated block of the MapComplete theme carries every site language.

MapComplete falls back to English for a language a block lacks, so a block added
in three languages silently puts the other 29 back on an English question flow.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
THEME = json.loads((ROOT / "theme" / "papamap.theme.json").read_text(encoding="utf-8"))


def site_languages():
    src = (ROOT / "web" / "i18n.js").read_text(encoding="utf-8")
    block = re.search(r"export const LANGS = \[(.*?)\]", src, re.S).group(1)
    return re.findall(r'"(\w+)"', block)


# MapComplete's Norwegian is nb_NO; the site's code is "no".
WANTED = {"nb_NO" if lang == "no" else lang for lang in site_languages()} | set(site_languages())


def blocks(node, path=""):
    # A translation block is a dict of strings keyed by languages. Any one
    # language key is enough to count — requiring "en" would let a block
    # written only in, say, de and fr pass as an ordinary nested object.
    if isinstance(node, dict):
        if (node and all(isinstance(v, str) for v in node.values())
                and set(node) & WANTED):
            yield path, node
            return
        for k, v in node.items():
            yield from blocks(v, f"{path}/{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from blocks(v, f"{path}/{i}")


# Keys whose value is reader-facing text in MapComplete. A plain string there
# is one language for everybody. Marker colours and icons under pointRendering
# use render/then for values that are rightly language-neutral.
TEXT_KEYS = {"title", "description", "shortDescription", "question", "hint", "name",
             "render", "then", "placeholder"}


def bare_strings(node, path=""):
    if isinstance(node, dict):
        for k, v in node.items():
            sub = f"{path}/{k}"
            if isinstance(v, str) and k in TEXT_KEYS and "/pointRendering/" not in sub:
                yield sub
            yield from bare_strings(v, sub)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from bare_strings(v, f"{path}/{i}")


def language_gaps(theme):
    gaps = [f"{path} is one language for everybody" for path in bare_strings(theme)]
    for path, block in blocks(theme):
        missing = WANTED - set(block)
        if missing:
            gaps.append(f"{path} lacks {sorted(missing)}")
    return gaps


def test_every_block_has_every_site_language():
    assert len(list(blocks(THEME))) > 100
    assert language_gaps(THEME) == []


@pytest.mark.parametrize("fragment", [
    {"tagRenderings": [{"question": "Does this place have a high chair?"}]},
    {"tagRenderings": [{"question": {"de": "Hochstuhl?", "fr": "Chaise haute ?"}}]},
])
def test_language_check_sees_bare_and_english_less_text(fragment):
    assert language_gaps(fragment)


def test_translations_keep_placeholders():
    for path, block in blocks(THEME):
        if "en" not in block:
            continue  # reported as a gap by the test above
        want = sorted(re.findall(r"\{[^{}]*\}", block["en"]))
        for lang, text in block.items():
            assert sorted(re.findall(r"\{[^{}]*\}", text)) == want, f"{path} [{lang}]"
