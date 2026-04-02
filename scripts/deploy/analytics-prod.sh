#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$ROOT_DIR"

./scripts/deploy/preflight.sh

AWS_REGION=${AWS_REGION:-us-east-2}
S3_BUCKET=${S3_BUCKET:-panda-crm-frontend-prod}
CLOUDFRONT_DISTRIBUTION_ID=${CLOUDFRONT_DISTRIBUTION_ID:-EDKIMD3LRK2M8}
CONFIGURE_ANALYTICS_ROUTING=${CONFIGURE_ANALYTICS_ROUTING:-1}

BUILD_SHA=$(git rev-parse HEAD)
BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
RELEASE_TS=$(date -u +%Y%m%d-%H%M%S)
BACKUP_PREFIX=${BACKUP_PREFIX:-s3://$S3_BUCKET/asset-backups/analytics-$RELEASE_TS}
TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/panda-crm-analytics-deploy-XXXXXX")

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

export AWS_REGION
export VITE_API_BASE=${VITE_API_BASE:-https://bamboo.pandaadmin.com}
export VITE_BUILD_SHA="$BUILD_SHA"
export VITE_BUILD_TIME="$BUILD_TIME"
if [ -n "${ALLOW_DIRTY_DEPLOY:-}" ] && [ -z "${ALLOW_DIRTY_RELEASE:-}" ]; then
  export ALLOW_DIRTY_RELEASE=1
fi

cd frontend
npm ci
npm run build:analytics
npm run smoke:analytics:dist
BLAST_RADIUS_ARGS=(--skip-current-build --current-dist dist)
if [ "${ALLOW_NON_ANALYTICS_SOURCE_CHANGES:-}" = "1" ]; then
  echo "[analytics-prod] WARN: allowing non-analytics source changes for a coordinated release; enforcing artifact policy only." >&2
  BLAST_RADIUS_ARGS+=(--skip-source-policy)
fi
npm run check:blast-radius:analytics -- "${BLAST_RADIUS_ARGS[@]}"
cd "$ROOT_DIR"

ANALYTICS_OBJECT_COUNT=$(
  aws s3api list-objects-v2 \
    --bucket "$S3_BUCKET" \
    --prefix "analytics/" \
    --max-keys 1 \
    --query 'length(Contents || `[]`)' \
    --output text \
    --region "$AWS_REGION" 2>/dev/null || echo 0
)

ANALYTICS_ASSETS_OBJECT_COUNT=$(
  aws s3api list-objects-v2 \
    --bucket "$S3_BUCKET" \
    --prefix "analytics-assets/" \
    --max-keys 1 \
    --query 'length(Contents || `[]`)' \
    --output text \
    --region "$AWS_REGION" 2>/dev/null || echo 0
)

if [ "${ANALYTICS_OBJECT_COUNT:-0}" -gt 0 ]; then
  aws s3 sync "s3://$S3_BUCKET/analytics" "$BACKUP_PREFIX/analytics" --region "$AWS_REGION" >/dev/null
fi

if [ "${ANALYTICS_ASSETS_OBJECT_COUNT:-0}" -gt 0 ]; then
  aws s3 sync "s3://$S3_BUCKET/analytics-assets" "$BACKUP_PREFIX/analytics-assets" --region "$AWS_REGION" >/dev/null
fi

ROUTING_BACKUP_PATH=""
if [ -n "$CLOUDFRONT_DISTRIBUTION_ID" ]; then
  DIST_CONFIG_PATH="$TMP_DIR/distribution-config.json"
  aws cloudfront get-distribution-config --id "$CLOUDFRONT_DISTRIBUTION_ID" > "$DIST_CONFIG_PATH"
  ROUTING_BACKUP_PATH="$BACKUP_PREFIX/cloudfront/distribution-config.json"
  aws s3 cp "$DIST_CONFIG_PATH" "$ROUTING_BACKUP_PATH" --region "$AWS_REGION" >/dev/null
fi

ROUTING_BACKUP_JSON=null
if [ -n "$ROUTING_BACKUP_PATH" ]; then
  ROUTING_BACKUP_JSON="\"$ROUTING_BACKUP_PATH\""
fi

ROLLBACK_STATE_PATH="$TMP_DIR/rollback-state.json"
cat > "$ROLLBACK_STATE_PATH" <<JSON
{
  "bucket": "$S3_BUCKET",
  "distributionId": "$CLOUDFRONT_DISTRIBUTION_ID",
  "analyticsEmpty": $([ "${ANALYTICS_OBJECT_COUNT:-0}" -gt 0 ] && echo false || echo true),
  "analyticsAssetsEmpty": $([ "${ANALYTICS_ASSETS_OBJECT_COUNT:-0}" -gt 0 ] && echo false || echo true),
  "routingConfigPath": $ROUTING_BACKUP_JSON,
  "generatedAt": "$BUILD_TIME"
}
JSON

aws s3 cp "$ROLLBACK_STATE_PATH" "$BACKUP_PREFIX/rollback-state.json" --region "$AWS_REGION" >/dev/null

if [ "$CONFIGURE_ANALYTICS_ROUTING" = "1" ]; then
  ./scripts/deploy/configure-analytics-routing.sh
fi

aws s3 cp frontend/dist/analytics/index.html "s3://$S3_BUCKET/analytics/index.html" --region "$AWS_REGION"
aws s3 cp frontend/dist/analytics/manifest.json "s3://$S3_BUCKET/analytics/manifest.json" --region "$AWS_REGION"
aws s3 cp frontend/dist/analytics/release-manifest.json "s3://$S3_BUCKET/analytics/release-manifest.json" --region "$AWS_REGION"
aws s3 sync frontend/dist/analytics-assets "s3://$S3_BUCKET/analytics-assets" --region "$AWS_REGION"

if [ -n "$CLOUDFRONT_DISTRIBUTION_ID" ]; then
  aws cloudfront create-invalidation \
    --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
    --paths "/analytics" "/analytics/" "/analytics/*" "/analytics-assets/*" \
    >/dev/null
fi

echo "✅ Analytics frontend deployed"
echo "Backup prefix: $BACKUP_PREFIX"
