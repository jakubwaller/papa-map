import pytest

from pipeline.classify import (ACCESSIBLE_TOKENS, central_key, classify, men_only, play_state,
                               tokens, wheelchair_state)


@pytest.mark.parametrize("token", sorted(ACCESSIBLE_TOKENS))
def test_every_accessible_token_classifies_accessible(token):
    assert classify("yes", token) == "accessible"


def test_outdoor_is_accessible():
    # Open-air table, no room to be locked out of. On the wiki value list
    # since 24 Aug 2026 — adopted here only after that documentation existed.
    assert classify("yes", "outdoor") == "accessible"
    assert classify("yes", "female_toilet;outdoor") == "accessible"


def test_female_toilet_is_female_only_not_accessible():
    # "female_toilet" contains "male_toilet" as a substring — exact token
    # matching must keep it out of the accessible bucket.
    assert classify("yes", "female_toilet") == "female_only"


def test_semicolon_combos():
    assert classify("yes", "female_toilet;male_toilet") == "accessible"  # any accessible wins
    assert classify("yes", "male_toilet;female_toilet") == "accessible"
    assert classify("yes", "female_toilet;baby_room") == "female_only"  # unrecognized ignored
    assert classify("yes", " Female_Toilet ; Dedicated_Room ") == "accessible"  # trim + lowercase


def test_free_text_location_is_unknown():
    # Contains the word "room" but is not the exact token "room".
    assert classify("yes", "hinten im Flur beim Personalraum") == "unknown"
    assert classify("yes", "in the back of the staff room") == "unknown"


def test_missing_or_empty_location_is_unknown():
    assert classify("yes", None) == "unknown"
    assert classify("yes", "") == "unknown"
    assert classify("limited", " ; ") == "unknown"


def test_non_feature_values_return_none():
    assert classify("no", "male_toilet") is None  # stats only, never a feature
    assert classify("02", "male_toilet") is None  # junk numeric value
    assert classify(None, "male_toilet") is None
    assert classify("", None) is None


def test_centralkey_locked_objects_are_no_features():
    # A central-key door opens only with proof of disability. The key locks
    # the table when it gates the whole object, when the table sits in the
    # accessible cubicle, or when nothing says the key covers only a part.
    assert classify("yes", None, {"centralkey": "eurokey", "access": "centralkey"}) is None
    assert classify("yes", "wheelchair_toilet", {"centralkey": "eurokey"}) is None
    assert classify("yes", "male_toilet", {"centralkey": "nks", "access": "centralkey"}) is None
    assert classify("yes", None, {"centralkey": "yes"}) is None  # nothing scopes it
    assert classify("yes", None, {"centralkey": " Eurokey ", "unisex": "yes"}) is None
    assert classify("limited", "wheelchair_toilet", {"centralkey": "nks",
                                                     "wheelchair:access": "centralkey"}) is None


def test_centralkey_scoped_to_the_accessible_cubicle_keeps_the_pin():
    # UK practice: open male/female sections plus a RADAR-key disabled
    # cubicle, mapped as one object. The table is reachable unless it is in
    # the locked cubicle, so the object stays a feature.
    block = {"centralkey": "nks", "access": "yes", "wheelchair:access": "centralkey"}
    assert classify("yes", None, block) == "unknown"
    assert classify("yes", "male_toilet", block) == "accessible"
    assert classify("yes", "female_toilet", block) == "female_only"
    assert classify("yes", "wheelchair_toilet", block) is None
    assert classify("yes", "wheelchair_toilet;male_toilet", block) == "accessible"
    sections = {"centralkey": "nks", "male": "yes", "female": "yes"}
    assert classify("yes", None, sections) == "unknown"
    assert classify("yes", None, {"centralkey": "nks", "female": "yes"}) == "unknown"


def test_centralkey_no_or_absent_changes_nothing():
    assert classify("yes", "wheelchair_toilet", {"centralkey": "no"}) == "accessible"
    assert classify("yes", "wheelchair_toilet", {}) == "accessible"
    assert classify("yes", "wheelchair_toilet", None) == "accessible"
    assert classify("yes", "wheelchair_toilet", {"centralkey": ""}) == "accessible"


def test_limited_is_a_feature():
    assert classify("limited", "wheelchair_toilet") == "accessible"
    assert classify(" yes ", "unisex_toilet") == "accessible"  # tolerate stray whitespace


def test_tokens_splits_trims_and_lowercases():
    assert tokens("Female_Toilet; male_toilet ;") == ["female_toilet", "male_toilet"]
    assert tokens(None) == []
    assert tokens("") == []


def test_wheelchair_state_reads_only_the_three_wiki_values():
    assert wheelchair_state({"wheelchair": "yes"}) == "yes"
    assert wheelchair_state({"wheelchair": " LIMITED "}) == "limited"
    assert wheelchair_state({"wheelchair": "no"}) == "no"
    assert wheelchair_state({"wheelchair": "designated"}) is None
    assert wheelchair_state({}) is None
    assert wheelchair_state({"wheelchair": "no", "toilets:wheelchair": "yes"},
                            "toilets:wheelchair") == "yes"


def test_central_key_names_the_system_only_when_it_locks_the_table():
    assert central_key({"changing_table": "yes", "centralkey": "eurokey"}) == "eurokey"
    assert central_key({"centralkey": "NKS", "access": "centralkey"}) == "nks"
    # scoped to the cubicle: the table is reachable, so no key on the feature
    assert central_key({"centralkey": "eurokey", "male": "yes"}) is None
    assert central_key({"centralkey": "no"}) is None
    assert central_key({}) is None


def test_a_playground_is_its_own_answer_so_the_popup_never_asks():
    # v31, issue #119. play_state is what the popup's question hangs on, and
    # `leisure=playground` is not a kids_area answer — but it does settle the
    # question, because the object is an outdoor play area. Without this a
    # playground with a changing table was asked "play area for children?", and
    # the honest answer ("outdoors only") was not the one a reader in a hurry
    # would tap.
    assert play_state({"leisure": "playground"}) is False
    assert play_state({"leisure": "playground", "indoor": "no"}) is False
    assert play_state({"leisure": " Playground "}) is False
    # Indoors it is the ring, not the silence — has_play_area gets there first.
    assert play_state({"leisure": "playground", "indoor": "yes"}) is True
    assert play_state({"leisure": "playground", "kids_area:indoor": "yes"}) is True
    # Nothing else `leisure` says settles anything: a café is still asked.
    assert play_state({"leisure": "garden"}) is None
    assert play_state({"amenity": "cafe"}) is None
    # leisure=indoor_play was already True, by the tag and not by this rule.
    assert play_state({"leisure": "indoor_play"}) is True


@pytest.mark.parametrize("location", ["male_toilet", " Male_Toilet ", "male_toilet;baby_room",
                                      "male_toilet;male_toilet"])
def test_mens_room_alone_is_men_only(location):
    assert classify("yes", location) == "accessible"
    assert men_only(location)


@pytest.mark.parametrize("location", [
    None, "", "female_toilet",                    # never accessible to begin with
    "female_toilet;male_toilet",                  # both rooms: she has hers
    "male_toilet;wheelchair_toilet",              # the accessible cubicle is open to her
    "male_toilet;unisex_toilet", "unisex_toilet", "room",
])
def test_anything_else_is_not_men_only(location):
    assert not men_only(location)


def test_men_only_never_matches_female_toilet_by_substring():
    # "female_toilet" contains "male_toilet" — the same trap classify guards.
    assert not men_only("female_toilet")
    assert not men_only("female_toilet;baby_room")
