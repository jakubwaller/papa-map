from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_every_output_path_is_redirected_into_the_mount():
    # The pipeline container writes into /out (docker-compose mounts
    # ./web-data there); a PAPAMAP_*_PATH default not overridden by an ENV
    # line in the Dockerfile lands in the container's own filesystem and
    # vanishes with it. areas.json did exactly that on its first night
    # (2026-09-17): the page writer ran, the file was never served.
    config = (ROOT / "pipeline" / "config.py").read_text(encoding="utf-8")
    dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    paths = set(re.findall(r'os\.environ\.get\("(PAPAMAP_[A-Z_]+_PATH)"', config))
    assert paths, "no output paths found in config.py"
    missing = [p for p in sorted(paths) if not re.search(rf"(^|\s){p}=/out/", dockerfile, re.M)]
    assert not missing, f"Dockerfile lacks an ENV line into /out for: {missing}"
