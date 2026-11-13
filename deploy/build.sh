#!/bin/sh
# Build images with host networking (bridge BuildKit is slow on this VPS).
# Usage: deploy/build.sh [api|web]  (no argument = build both)
set -e
cd "$(dirname "$0")/.."
target="${1:-all}"
if [ "$target" = all ] || [ "$target" = api ]; then
  docker build --network host -t sport-dashboard-api:latest ./backend
fi
if [ "$target" = all ] || [ "$target" = web ]; then
  docker build --network host -t sport-dashboard-web:latest ./frontend
fi
