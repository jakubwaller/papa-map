from __future__ import annotations

from .classify import classify

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
