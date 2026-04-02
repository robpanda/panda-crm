#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$ROOT_DIR"

./scripts/deploy/preflight.sh

AWS_REGION=${AWS_REGION:-us-east-2}
S3_BUCKET=${S3_BUCKET:-panda-crm-frontend-prod}
CLOUDFRONT_DISTRIBUTION_ID=${CLOUDFRONT_DISTRIBUTION_ID:-EDKIMD3LRK2M8}
RUN_NPM_CI=${RUN_NPM_CI:-1}
BUILD_ROOT=${BUILD_ROOT:-1}
INVALIDATION_PATHS=${INVALIDATION_PATHS:-/*}

BUILD_SHA=$(git rev-parse HEAD)
BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
RELEASE_TS=$(date -u +%Y%m%d-%H%M%S)
BACKUP_PREFIX=${BACKUP_PREFIX:-s3://$S3_BUCKET/asset-backups/root-shell-$RELEASE_TS}
TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/panda-crm-root-shell-deploy-XXXXXX")

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

export AWS_REGION
export VITE_API_BASE=${VITE_API_BASE:-https://bamboo.pandaadmin.com}
export VITE_BUILD_SHA="$BUILD_SHA"
export VITE_BUILD_TIME="$BUILD_TIME"

cd frontend
if [ "$RUN_NPM_CI" = "1" ]; then
  npm ci
fi

if [ "$BUILD_ROOT" = "1" ]; then
  npm run build:root
fi
cd "$ROOT_DIR"

aws s3 sync "s3://$S3_BUCKET/" "$BACKUP_PREFIX/" \
  --region "$AWS_REGION" \
  --exclude "analytics/*" \
  --exclude "analytics-assets/*" \
  --exclude "asset-backups/*" \
  >/dev/null

ROLLBACK_STATE_PATH="$TMP_DIR/rollback-state.json"
cat > "$ROLLBACK_STATE_PATH" <<JSON
{
  "bucket": "$S3_BUCKET",
  "distributionId": "$CLOUDFRONT_DISTRIBUTION_ID",
  "generatedAt": "$BUILD_TIME"
}
JSON

aws s3 cp "$ROLLBACK_STATE_PATH" "$BACKUP_PREFIX/rollback-state.json" --region "$AWS_REGION" >/dev/null

aws s3 sync frontend/dist "s3://$S3_BUCKET/" \
  --region "$AWS_REGION" \
  --delete \
  --exclude "analytics/*" \
  --exclude "analytics-assets/*" \
  --exclude "asset-backups/*"

if [ -n "$CLOUDFRONT_DISTRIBUTION_ID" ]; then
  read -r -a INVALIDATION_PATH_ARRAY <<< "$INVALIDATION_PATHS"
  aws cloudfront create-invalidation \
    --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
    --paths "${INVALIDATION_PATH_ARRAY[@]}" \
    >/dev/null
fi

echo "✅ Root shell deployed"
echo "Backup prefix: $BACKUP_PREFIX"
