import os
import time
from datetime import date

from pipeline import sweep_cache

TODAY = date(2026, 10, 16)
QL = '[out:json][timeout:55];area["ISO3166-2"="US-MO"]["admin_level"="4"]->.a;nwr(area.a);out;'
ANSWER = {"elements": [{"type": "node", "id": 1}]}


def test_an_answer_is_served_until_it_is_too_old(tmp_path):
    sweep_cache.save(str(tmp_path), QL, ANSWER, date(2026, 10, 9))
    assert sweep_cache.load(str(tmp_path), QL, TODAY, 7) == (ANSWER, 7)
    assert sweep_cache.load(str(tmp_path), QL, date(2026, 10, 17), 7) is None
    assert sweep_cache.load(str(tmp_path), QL, date(2026, 10, 8), 7) is None  # future-dated


def test_only_the_same_query_is_served(tmp_path):
    sweep_cache.save(str(tmp_path), QL, ANSWER, TODAY)
    # A timeout is tuning, not a definition; another selector is another area.
    assert sweep_cache.load(str(tmp_path), QL.replace("55", "90"), TODAY, 7) == (ANSWER, 0)
    assert sweep_cache.load(str(tmp_path), QL.replace("US-MO", "US-MN"), TODAY, 7) is None


def test_a_missing_or_corrupt_file_is_no_answer(tmp_path):
    assert sweep_cache.load(str(tmp_path / "nowhere"), QL, TODAY, 7) is None
    sweep_cache.save(str(tmp_path), QL, ANSWER, TODAY)
    (path,) = tmp_path.glob("*.json")
    for junk in ("{", "[]", '{"date": "2026-10-16"}', '{"date": "x", "answer": {}}'):
        path.write_text(junk, encoding="utf-8")
        assert sweep_cache.load(str(tmp_path), QL, TODAY, 7) is None


def test_prune_deletes_only_answers_too_old_to_use(tmp_path):
    sweep_cache.save(str(tmp_path), QL, ANSWER, TODAY)
    sweep_cache.save(str(tmp_path), QL.replace("US-MO", "US-MN"), ANSWER, TODAY)
    old, fresh = sorted(tmp_path.glob("*.json"))
    now = time.time()
    os.utime(old, (now - 9 * 86400, now - 9 * 86400))
    os.utime(fresh, (now - 7 * 86400, now - 7 * 86400))
    sweep_cache.prune(str(tmp_path), 7, now=now)
    assert list(tmp_path.glob("*.json")) == [fresh]
    sweep_cache.prune(str(tmp_path / "nowhere"), 7)  # no directory yet: nothing to do
