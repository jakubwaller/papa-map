FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# The pmtiles CLI, for the weekly city extracts (pipeline/tiles.py). A pinned
# release, its checksum checked, so the image never depends on what a
# "latest" URL answers. The one Go binary is the only non-Python thing here.
ARG PMTILES_VERSION=1.31.2
ARG PMTILES_SHA256=0019dfc4b32d63c1392aa264aed2253c1e0c2fb09216f8e2cc269bbfb8bb49b5
ADD https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/go-pmtiles-${PMTILES_VERSION}_Linux_x86_64.tar.gz /tmp/pmtiles.tar.gz
RUN echo "${PMTILES_SHA256}  /tmp/pmtiles.tar.gz" | sha256sum -c - \
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
    PMTILES_BIN=/usr/local/bin/pmtiles
CMD ["python", "-m", "pipeline.run"]
