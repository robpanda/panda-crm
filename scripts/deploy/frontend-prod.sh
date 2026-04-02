#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$ROOT_DIR"

if [ "${ALLOW_FULL_FRONTEND_DEPLOY:-}" != "1" ]; then
  echo "[frontend-prod] ERROR: full frontend deploys now require ALLOW_FULL_FRONTEND_DEPLOY=1." >&2
  echo "[frontend-prod] Use scripts/deploy/analytics-prod.sh for reporting/analytics releases." >&2
  echo "[frontend-prod] Use scripts/deploy/root-and-analytics-prod.sh for coordinated root-shell plus analytics releases." >&2
  exit 1
fi

./scripts/deploy/preflight.sh

if [ -z "${AWS_REGION:-}" ]; then
  export AWS_REGION=us-east-2
fi

S3_BUCKET=${S3_BUCKET:-panda-crm-frontend-prod}
CLOUDFRONT_DISTRIBUTION_ID=${CLOUDFRONT_DISTRIBUTION_ID:-EDKIMD3LRK2M8}

BUILD_SHA=$(git rev-parse HEAD)
BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

export VITE_API_BASE=${VITE_API_BASE:-https://bamboo.pandaadmin.com}
export VITE_BUILD_SHA="$BUILD_SHA"
export VITE_BUILD_TIME="$BUILD_TIME"

cd frontend
npm ci
npm run build

aws s3 sync dist s3://$S3_BUCKET/ --delete --region $AWS_REGION

if [ -n "$CLOUDFRONT_DISTRIBUTION_ID" ]; then
  aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_DISTRIBUTION_ID --paths "/*"
fi

echo "✅ Frontend deployed"
