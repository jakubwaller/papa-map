FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY pipeline ./pipeline
# The pipeline only writes; the served files come from a bind mount, so the
# site can be updated with a git pull and no image rebuild. Everything the build
# generates — including the per-Bundesland pages — has to land under /out, the
# one writable mount: the repo's own web/ is not mounted here, so a page written
# to the default path would go into the container's own filesystem and vanish
# with it. docker-compose.yml serves /out/wickeltische back at /srv/wickeltische.
ENV PAPAMAP_GEOJSON_PATH=/out/changing_tables.geojson \
    PAPAMAP_STATS_PATH=/out/stats.json \
    PAPAMAP_PAGES_DIR=/out/wickeltische
CMD ["python", "-m", "pipeline.run"]
