#!/bin/bash

# Find the repository root
COMMIT_SHA=$(git rev-parse --short HEAD)
REPO_ROOT=$(git rev-parse --show-toplevel)

if [ -z "$REPO_ROOT" ]; then
  echo "Error: Could not find repository root."
  exit 1
fi

cd "$REPO_ROOT"

# Extra arguments (for example --async) are passed through to gcloud.
gcloud builds submit . --config=deck/cloudbuild-ubuntu.yaml --project=waze-ci --substitutions=COMMIT_SHA="${COMMIT_SHA}" "$@"

echo "Image: europe-west1-docker.pkg.dev/waze-ci/waze-spinnaker-images/deck:2026.3.x-${COMMIT_SHA}"
