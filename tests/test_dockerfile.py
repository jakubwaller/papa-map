from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_every_output_path_is_redirected_into_the_mount():
    # The pipeline container writes into /out (docker-compose mounts
    # ./web-data there); a PAPAMAP_*_PATH default not overridden by an ENV
    # line in the Dockerfile lands in the container's own filesystem and
    # vanishes with it — a _DIR output (the pages) the same way. areas.json did exactly that on its first night
    # (2026-09-17): the page writer ran, the file was never served.
    config = (ROOT / "pipeline" / "config.py").read_text(encoding="utf-8")
    dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    paths = set(re.findall(r'os\.environ\.get\("(PAPAMAP_[A-Z_]+_(?:PATH|DIR))"', config))
    assert paths, "no output paths found in config.py"
    missing = [p for p in sorted(paths) if not re.search(rf"(^|\s){p}=/out/", dockerfile, re.M)]
    assert not missing, f"Dockerfile lacks an ENV line into /out for: {missing}"


def test_no_url_add_so_a_rebuild_needs_no_network():
    # An `ADD https://…` is re-checked against the remote on every build, and
    # every cron runs `--build`: a github.com hiccup at 02:00 would fail the
    # nightly build and, at 07:30, the ops watcher that should report it. The
    # download lives in a RUN instead, cached on its command text.
    dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    assert not re.search(r"^\s*ADD\s+(--\S+\s+)*https?://", dockerfile, re.M | re.I)


def test_pmtiles_pin_is_a_version_and_its_checksum():
    dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    assert re.search(r"^ARG PMTILES_VERSION=\d+\.\d+\.\d+$", dockerfile, re.M)
    assert re.search(r"^ARG PMTILES_SHA256=[0-9a-f]{64}$", dockerfile, re.M)
    # The URL follows the version ARG and the checksum check reads the SHA ARG,
    # so bumping one line without the other fails the build, not silently.
    assert "/v${PMTILES_VERSION}/go-pmtiles_${PMTILES_VERSION}_" in dockerfile
    assert '"${PMTILES_SHA256}  /tmp/pmtiles.tar.gz" | sha256sum -c -' in dockerfile
