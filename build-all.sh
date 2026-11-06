#!/bin/bash
# Submit Google Cloud Build image builds for every Spinnaker service.
#
# Usage: ./build-all.sh [service ...]
# With no arguments, builds all services. Builds are submitted with --async;
# follow them in the Cloud Build console or with `gcloud builds list --project=waze-ci`.

set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

SERVICES=(clouddriver deck echo fiat front50 gate igor kayenta orca rosco)
if [ "$#" -gt 0 ]; then
  SERVICES=("$@")
fi

for svc in "${SERVICES[@]}"; do
  if [ ! -x "$svc/build.sh" ]; then
    echo "Error: $svc/build.sh not found or not executable." >&2
    exit 1
  fi
  echo "=== Submitting $svc"
  "$svc/build.sh" --async
done
