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
