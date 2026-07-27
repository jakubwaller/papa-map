import pytest

from pipeline.classify import ACCESSIBLE_TOKENS, classify, tokens


@pytest.mark.parametrize("token", sorted(ACCESSIBLE_TOKENS))
def test_every_accessible_token_classifies_accessible(token):
    assert classify("yes", token) == "accessible"


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


def test_limited_is_a_feature():
    assert classify("limited", "wheelchair_toilet") == "accessible"
    assert classify(" yes ", "unisex_toilet") == "accessible"  # tolerate stray whitespace


def test_tokens_splits_trims_and_lowercases():
    assert tokens("Female_Toilet; male_toilet ;") == ["female_toilet", "male_toilet"]
    assert tokens(None) == []
    assert tokens("") == []
