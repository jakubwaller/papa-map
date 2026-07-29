FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY pipeline ./pipeline
# The pipeline only writes; the served files come from a bind mount, so the
# site can be updated with a git pull and no image rebuild.
ENV PAPAMAP_GEOJSON_PATH=/out/changing_tables.geojson \
    PAPAMAP_STATS_PATH=/out/stats.json
CMD ["python", "-m", "pipeline.run"]
