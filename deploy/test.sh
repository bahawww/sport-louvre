#!/bin/sh
# Run the backend test suite inside the API image (the host has no scikit-learn).
# Trains once into a throwaway cache dir unless MODEL_CACHE is given.
set -e
cd "$(dirname "$0")/.."
cache="${MODEL_CACHE:-$PWD/backend/.model-cache}"
mkdir -p "$cache"
docker run --rm --network host \
  -v "$PWD/data/Football_Player_Market_Value_Trajectories:/app/data:ro" \
  -v "$PWD/backend:/app/src:ro" -v "$cache:/app/cache" \
  -w /app/src -e PYTHONDONTWRITEBYTECODE=1 -e PYTHONWARNINGS=ignore \
  sport-dashboard-api:latest \
  sh -c "pip install -q --no-cache-dir --root-user-action=ignore pytest==8.3.4 httpx==0.28.1 && python -u -m pytest -q -p no:cacheprovider tests $*"
