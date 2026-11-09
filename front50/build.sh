#!/bin/bash
# Build and push the front50 image with two tags:
#   <version>           moves to the newest build
#   <version>-<git sha> fixed, identifies the commit
# Override the version with VERSION=..., and pass extra gcloud flags (for example --async).

COMMIT_SHA=$(git rev-parse --short HEAD)
REPO_ROOT=$(git rev-parse --show-toplevel)
VERSION=${VERSION:-2026.3.2}

if [ -z "$REPO_ROOT" ]; then
  echo "Error: Could not find repository root."
  exit 1
fi

cd "$REPO_ROOT"

gcloud builds submit . --config=front50/cloudbuild-ubuntu.yaml --project=waze-ci \
  --substitutions=COMMIT_SHA="${COMMIT_SHA}",_VERSION="${VERSION}" "$@"

echo "Images: europe-west1-docker.pkg.dev/waze-ci/waze-spinnaker-images/front50:${VERSION} and europe-west1-docker.pkg.dev/waze-ci/waze-spinnaker-images/front50:${VERSION}-${COMMIT_SHA}"
