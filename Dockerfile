FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# The pmtiles CLI, for the weekly city extracts (pipeline/tiles.py). A pinned
# release, its checksum checked, so the image never depends on what a
# "latest" URL answers. The one Go binary is the only non-Python thing here.
# Fetched in a RUN, not an ADD: a URL ADD asks github.com for its ETag on every
# rebuild and fails the build when it does not answer, which would take the
# nightly pipeline and the 07:30 ops watcher down with it. A RUN is cached on
# its command text, so a rebuild needs no network until the pin changes.
# python:3.12-slim has no curl, hence urllib.
ARG PMTILES_VERSION=1.31.2
ARG PMTILES_SHA256=3ed7dbf4ec2e6dfe5e25b6f70d1ffc932729f93c86db353bf514dd71010a312f
RUN python -c "import sys, urllib.request; open(sys.argv[2], 'wb').write(urllib.request.urlopen(sys.argv[1], timeout=120).read())" \
        "https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/go-pmtiles_${PMTILES_VERSION}_Linux_x86_64.tar.gz" \
        /tmp/pmtiles.tar.gz \
    && echo "${PMTILES_SHA256}  /tmp/pmtiles.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/pmtiles.tar.gz -C /usr/local/bin pmtiles && rm /tmp/pmtiles.tar.gz
COPY pipeline ./pipeline
# The pipeline only writes; the served files come from a bind mount, so the
# site can be updated with a git pull and no image rebuild. Everything the build
# generates — including the per-Bundesland pages — has to land under /out, the
# one writable mount: the repo's own web/ is not mounted here, so a page written
# to the default path would go into the container's own filesystem and vanish
# with it. docker-compose.yml serves /out/wickeltische back at /srv/wickeltische.
ENV PAPAMAP_GEOJSON_PATH=/out/changing_tables.geojson \
    PAPAMAP_PLAY_GEOJSON_PATH=/out/play_places.geojson \
    PAPAMAP_STATS_PATH=/out/stats.json \
    PAPAMAP_PAGES_DIR=/out/wickeltische \
    PAPAMAP_HISTORY_PATH=/out/history.json \
    PAPAMAP_TOILETS_COUNTS_PATH=/out/toilets_counts.json \
    PAPAMAP_AREAS_PATH=/out/areas.json \
    PMTILES_BIN=/usr/local/bin/pmtiles
CMD ["python", "-m", "pipeline.run"]
