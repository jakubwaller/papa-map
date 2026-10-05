import json
import sys
from pathlib import Path

import pytest

# Make `import pipeline` work no matter how pytest is invoked (beer-map does
# this via pyproject pythonpath; that file isn't owned by the pipeline agent).
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

FIXTURES = Path(__file__).resolve().parent / "fixtures"


@pytest.fixture
def load_fixture():
    def _load(name: str):
        return json.loads((FIXTURES / name).read_text(encoding="utf-8"))
    return _load


@pytest.fixture(autouse=True)
def _fresh_breaker():
    """osm.py's circuit breaker is module state; one test's failures must
    not rest a host for the next."""
    from pipeline import osm
    osm.reset_breaker()
    yield
    osm.reset_breaker()


@pytest.fixture(autouse=True)
def _isolated_toilet_counts(tmp_path, monkeypatch):
    """The toilets-count cache is state under web/data/; every run_pipeline
    call in the suite must read and write its own temp copy, never the
    checkout's. run_pipeline resolves the default at call time for this."""
    from pipeline import run
    monkeypatch.setattr(run, "TOILETS_COUNTS_PATH",
                        str(tmp_path / "toilets_counts.json"))


@pytest.fixture(autouse=True)
def _isolated_areas_bbox(tmp_path, monkeypatch):
    """web-data/private/areas-bbox.json (pipeline.delta's country-coverage
    filter) is state under the checkout the same way the toilets-count cache
    is — every run_pipeline call in the suite defaults to a temp copy unless
    a test passes its own areas_bbox_path. run.py resolves the default at
    call time from pipeline.delta.AREAS_BBOX_PATH."""
    from pipeline import delta
    monkeypatch.setattr(delta, "AREAS_BBOX_PATH", str(tmp_path / "areas-bbox.json"))


@pytest.fixture(autouse=True)
def _isolated_web_output(tmp_path, monkeypatch):
    """Everything else run_pipeline writes by default — the two GeoJSON files,
    stats.json, areas.json, history.json and the pages directory — lives under
    the checkout's web/ as well. Until 2026-10-05 a test that left any of them
    at its default wrote fixture output over the real web/data/areas.json and
    play_places.geojson and every page under web/wickeltische/ (a browser check
    against that web/ then found three play places). run_pipeline resolves each
    default at call time, like the two above, so one temp directory covers them
    all. The pages directory is created here: nothing in the pipeline creates
    it (web/wickeltische/ is tracked as a .gitkeep)."""
    from pipeline import run
    out = tmp_path / "web"
    (out / "wickeltische").mkdir(parents=True)
    for name, filename in (("GEOJSON_PATH", "changing_tables.geojson"),
                           ("PLAY_GEOJSON_PATH", "play_places.geojson"),
                           ("STATS_PATH", "stats.json"),
                           ("AREAS_PATH", "areas.json"),
                           ("HISTORY_PATH", "history.json")):
        monkeypatch.setattr(run, name, str(out / filename))
    monkeypatch.setattr(run, "PAGES_DIR", str(out / "wickeltische"))
