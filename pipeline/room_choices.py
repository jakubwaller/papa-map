from __future__ import annotations

from .classify import classify, men_only

# Mirrors web/osm.js's ROOMS exactly — the vocabulary a reader's own tap
# writes to OSM (roomPatch). Kept here, not imported (there is nothing to
# import: it's JS), so tests/test_room_choices.py reads web/osm.js's own
# object literal back and fails the moment the two drift, which is the
# guard CONTRACT.md's live-updates amendment promises.
ROOM_CHOICES = {
    "both": "female_toilet;male_toilet",
    "male": "male_toilet",
    "female": "female_toilet",
    "unisex": "unisex_toilet",
    "wheelchair": "wheelchair_toilet",
    "dedicated": "dedicated_room",
    "room": "room",
    "sales": "sales_area",
    "outdoor": "outdoor",
}


def answer_status_table() -> dict:
    """{choice: status} for every room a reader can answer with, plus
    "none" (a play place with no table at all — never a status, always
    None). What classify("yes", location) returns for each ROOM_CHOICES
    value — the *only* place the frontend is allowed to borrow a status
    from for its own answer, per CONTRACT.md; every other pin keeps waiting
    for the pipeline. Built fresh at every run so a change to classify.py's
    rule (or to ROOM_CHOICES itself) is picked up automatically, never
    hand-copied into stats.json."""
    table = {choice: classify("yes", location) for choice, location in ROOM_CHOICES.items()}
    table["none"] = None
    return table


def answer_men_only_table() -> dict:
    """{choice: bool} beside answer_status_table: whether the reader's own
    answer puts the table in the men's room only (CONTRACT v50), so the
    mama reading can recolour that answer instantly too without reading the
    tag itself. Same keys, "none" included (always False)."""
    table = {choice: classify("yes", location) == "accessible" and men_only(location)
             for choice, location in ROOM_CHOICES.items()}
    table["none"] = False
    return table
