"""Every translated block of the MapComplete theme carries every site language.

MapComplete falls back to English for a language a block lacks, so a block added
in three languages silently puts the other 29 back on an English question flow.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
THEME = json.loads((ROOT / "theme" / "papamap.theme.json").read_text(encoding="utf-8"))


def site_languages():
    src = (ROOT / "web" / "i18n.js").read_text(encoding="utf-8")
    block = re.search(r"export const LANGS = \[(.*?)\]", src, re.S).group(1)
    return re.findall(r'"(\w+)"', block)


def blocks(node, path=""):
    if isinstance(node, dict):
        if "en" in node and all(isinstance(v, str) for v in node.values()):
            yield path, node
            return
        for k, v in node.items():
            yield from blocks(v, f"{path}/{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from blocks(v, f"{path}/{i}")


def test_every_block_has_every_site_language():
    # MapComplete's Norwegian is nb_NO; the site's code is "no".
    wanted = {"nb_NO" if lang == "no" else lang for lang in site_languages()} | set(site_languages())
    found = list(blocks(THEME))
    assert len(found) > 100
    for path, block in found:
        missing = wanted - set(block)
        assert not missing, f"{path} lacks {sorted(missing)}"


def test_translations_keep_placeholders():
    for path, block in blocks(THEME):
        want = sorted(re.findall(r"\{[^{}]*\}", block["en"]))
        for lang, text in block.items():
            assert sorted(re.findall(r"\{[^{}]*\}", text)) == want, f"{path} [{lang}]"
