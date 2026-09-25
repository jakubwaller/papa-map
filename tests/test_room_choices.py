import re
from pathlib import Path

from pipeline.room_choices import ROOM_CHOICES, answer_men_only_table, answer_status_table

WEB_OSM_JS = Path(__file__).resolve().parents[1] / "web" / "osm.js"


def _js_rooms() -> dict:
    """Reads web/osm.js's own `export const ROOMS = {...}` object literal
    back, rather than trusting a hand-copied Python mirror to stay in sync —
    this is the drift guard the live-updates CONTRACT amendment promises: a
    reader's own choice (roomPatch's ROOMS) and the pipeline's answer_status
    lookup (ROOM_CHOICES) must always agree on what OSM value each choice
    writes."""
    text = WEB_OSM_JS.read_text(encoding="utf-8")
    m = re.search(r"export const ROOMS = \{(.*?)\n\};", text, re.S)
    assert m, "web/osm.js: export const ROOMS = {...} not found"
    body = m.group(1)
    # Strip // line comments before pulling `key: "value"` pairs — the block
    # is heavily commented (see web/osm.js).
    body = re.sub(r"//[^\n]*", "", body)
    pairs = re.findall(r'(\w+)\s*:\s*"([^"]*)"', body)
    assert pairs, "web/osm.js: no key: \"value\" pairs parsed out of ROOMS"
    return dict(pairs)


def test_room_choices_mirrors_web_osm_js_rooms():
    js_rooms = _js_rooms()
    assert ROOM_CHOICES == js_rooms, (
        "pipeline.room_choices.ROOM_CHOICES has drifted from web/osm.js's "
        "ROOMS — update both in the same commit")


def test_answer_status_table_covers_every_choice_plus_none():
    table = answer_status_table()
    assert set(table) == set(ROOM_CHOICES) | {"none"}
    assert table["none"] is None


def test_answer_status_matches_classify_for_each_choice():
    from pipeline.classify import classify
    table = answer_status_table()
    for choice, location in ROOM_CHOICES.items():
        assert table[choice] == classify("yes", location)


def test_both_is_accessible():
    # female_toilet;male_toilet — the two-toilet café case — any accessible
    # token wins, so "both" always reads as accessible, never female_only.
    assert answer_status_table()["both"] == "accessible"


def test_female_is_female_only():
    assert answer_status_table()["female"] == "female_only"


def test_answer_men_only_is_the_mens_room_alone():
    table = answer_men_only_table()
    assert set(table) == set(ROOM_CHOICES) | {"none"}
    assert [c for c, v in table.items() if v] == ["male"]
