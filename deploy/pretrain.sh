#!/bin/sh
# Train the models into the model_cache volume using the freshly built API image, so the
# next `docker compose up -d` starts in seconds instead of training for ~5 minutes.
# Usage: deploy/build.sh api && deploy/pretrain.sh && docker compose up -d
set -e
cd "$(dirname "$0")/.."
docker compose run --rm --no-deps -e PYTHONWARNINGS=ignore api \
  python -u -c "import ml_pipeline; ml_pipeline.build_artifacts()"
