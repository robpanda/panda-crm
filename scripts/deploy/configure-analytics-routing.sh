#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$ROOT_DIR"

AWS_REGION=${AWS_REGION:-us-east-2}
CLOUDFRONT_DISTRIBUTION_ID=${CLOUDFRONT_DISTRIBUTION_ID:-EDKIMD3LRK2M8}
ANALYTICS_FUNCTION_NAME=${ANALYTICS_FUNCTION_NAME:-analytics-spa-rewrite}
ANALYTICS_PATH_PATTERN=${ANALYTICS_PATH_PATTERN:-/analytics*}

TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/panda-crm-analytics-routing-XXXXXX")
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

FUNCTION_CODE="$ROOT_DIR/scripts/deploy/cloudfront/analytics-spa-rewrite.js"
FUNCTION_CONFIG="$TMP_DIR/function-config.json"
DIST_CONFIG_RAW="$TMP_DIR/distribution-config.json"
DIST_CONFIG_PATCHED="$TMP_DIR/distribution-config-patched.json"

cat > "$FUNCTION_CONFIG" <<JSON
{
  "Comment": "Analytics SPA rewrite for /analytics* paths",
  "Runtime": "cloudfront-js-2.0"
}
JSON

if aws cloudfront describe-function --name "$ANALYTICS_FUNCTION_NAME" >/dev/null 2>&1; then
  FUNCTION_ETAG=$(aws cloudfront describe-function --name "$ANALYTICS_FUNCTION_NAME" --query 'ETag' --output text)
  aws cloudfront update-function \
    --name "$ANALYTICS_FUNCTION_NAME" \
    --if-match "$FUNCTION_ETAG" \
    --function-config "file://$FUNCTION_CONFIG" \
    --function-code "fileb://$FUNCTION_CODE" \
    >/dev/null
else
  aws cloudfront create-function \
    --name "$ANALYTICS_FUNCTION_NAME" \
    --function-config "file://$FUNCTION_CONFIG" \
    --function-code "fileb://$FUNCTION_CODE" \
    >/dev/null
fi

FUNCTION_ETAG=$(aws cloudfront describe-function --name "$ANALYTICS_FUNCTION_NAME" --query 'ETag' --output text)
aws cloudfront publish-function --name "$ANALYTICS_FUNCTION_NAME" --if-match "$FUNCTION_ETAG" >/dev/null
FUNCTION_ARN=$(aws cloudfront describe-function --name "$ANALYTICS_FUNCTION_NAME" --stage LIVE --query 'FunctionSummary.FunctionMetadata.FunctionARN' --output text)

aws cloudfront get-distribution-config --id "$CLOUDFRONT_DISTRIBUTION_ID" > "$DIST_CONFIG_RAW"
DIST_ETAG=$(jq -r '.ETag' "$DIST_CONFIG_RAW")

node "$ROOT_DIR/scripts/deploy/cloudfront/build-analytics-distribution-config.mjs" \
  "$DIST_CONFIG_RAW" \
  "$DIST_CONFIG_PATCHED" \
  "$FUNCTION_ARN" \
  "$ANALYTICS_PATH_PATTERN"

aws cloudfront update-distribution \
  --id "$CLOUDFRONT_DISTRIBUTION_ID" \
  --if-match "$DIST_ETAG" \
  --distribution-config "file://$DIST_CONFIG_PATCHED" \
  >/dev/null

echo "[analytics-routing] updated CloudFront behavior $ANALYTICS_PATH_PATTERN with function $ANALYTICS_FUNCTION_NAME"
