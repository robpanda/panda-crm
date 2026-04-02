#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$ROOT_DIR"

AWS_REGION=${AWS_REGION:-us-east-2}
S3_BUCKET=${S3_BUCKET:-panda-crm-frontend-prod}
CLOUDFRONT_DISTRIBUTION_ID=${CLOUDFRONT_DISTRIBUTION_ID:-EDKIMD3LRK2M8}
BACKUP_PREFIX=${BACKUP_PREFIX:-}

if [ -z "$BACKUP_PREFIX" ]; then
  echo "BACKUP_PREFIX is required, for example s3://$S3_BUCKET/asset-backups/analytics-YYYYMMDD-HHMMSS" >&2
  exit 1
fi

TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/panda-crm-analytics-rollback-XXXXXX")

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

ROLLBACK_STATE_PATH="$TMP_DIR/rollback-state.json"
if ! aws s3 cp "$BACKUP_PREFIX/rollback-state.json" "$ROLLBACK_STATE_PATH" --region "$AWS_REGION" >/dev/null 2>&1; then
  echo "Rollback state not found at $BACKUP_PREFIX/rollback-state.json" >&2
  exit 1
fi

ANALYTICS_EMPTY=$(node -p "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); data.analyticsEmpty ? 'true' : 'false';" "$ROLLBACK_STATE_PATH")
ANALYTICS_ASSETS_EMPTY=$(node -p "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); data.analyticsAssetsEmpty ? 'true' : 'false';" "$ROLLBACK_STATE_PATH")
ROUTING_CONFIG_PATH=$(node -p "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); data.routingConfigPath || '';" "$ROLLBACK_STATE_PATH")

if [ "$ANALYTICS_EMPTY" = "true" ]; then
  aws s3 rm "s3://$S3_BUCKET/analytics" --recursive --region "$AWS_REGION" >/dev/null 2>&1 || true
else
  aws s3 sync "$BACKUP_PREFIX/analytics" "s3://$S3_BUCKET/analytics" --region "$AWS_REGION" --delete
fi

if [ "$ANALYTICS_ASSETS_EMPTY" = "true" ]; then
  aws s3 rm "s3://$S3_BUCKET/analytics-assets" --recursive --region "$AWS_REGION" >/dev/null 2>&1 || true
else
  aws s3 sync "$BACKUP_PREFIX/analytics-assets" "s3://$S3_BUCKET/analytics-assets" --region "$AWS_REGION" --delete
fi

if [ -n "$CLOUDFRONT_DISTRIBUTION_ID" ] && [ -n "$ROUTING_CONFIG_PATH" ]; then
  DIST_CONFIG_RAW="$TMP_DIR/distribution-config-raw.json"
  DIST_CONFIG_ONLY="$TMP_DIR/distribution-config.json"
  aws s3 cp "$ROUTING_CONFIG_PATH" "$DIST_CONFIG_RAW" --region "$AWS_REGION" >/dev/null
  node -e "const fs=require('fs'); const input=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); fs.writeFileSync(process.argv[2], JSON.stringify(input.DistributionConfig || input, null, 2));" "$DIST_CONFIG_RAW" "$DIST_CONFIG_ONLY"
  DIST_ETAG=$(aws cloudfront get-distribution-config --id "$CLOUDFRONT_DISTRIBUTION_ID" --query 'ETag' --output text)
  aws cloudfront update-distribution \
    --id "$CLOUDFRONT_DISTRIBUTION_ID" \
    --if-match "$DIST_ETAG" \
    --distribution-config "file://$DIST_CONFIG_ONLY" \
    >/dev/null
fi

if [ -n "$CLOUDFRONT_DISTRIBUTION_ID" ]; then
  aws cloudfront create-invalidation \
    --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
    --paths "/analytics" "/analytics/" "/analytics/*" "/analytics-assets/*" \
    >/dev/null
fi

echo "✅ Analytics frontend rolled back from $BACKUP_PREFIX"
