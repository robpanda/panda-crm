#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$ROOT_DIR"

AWS_REGION=${AWS_REGION:-us-east-2}
S3_BUCKET=${S3_BUCKET:-panda-crm-frontend-prod}
CLOUDFRONT_DISTRIBUTION_ID=${CLOUDFRONT_DISTRIBUTION_ID:-EDKIMD3LRK2M8}
BACKUP_PREFIX=${BACKUP_PREFIX:-}
INVALIDATION_PATHS=${INVALIDATION_PATHS:-/*}

if [ -z "$BACKUP_PREFIX" ]; then
  echo "BACKUP_PREFIX is required, for example s3://$S3_BUCKET/asset-backups/root-shell-YYYYMMDD-HHMMSS" >&2
  exit 1
fi

TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/panda-crm-root-shell-rollback-XXXXXX")
RESTORE_DIR="$TMP_DIR/root-shell"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

ROLLBACK_STATE_PATH="$TMP_DIR/rollback-state.json"
if aws s3 cp "$BACKUP_PREFIX/rollback-state.json" "$ROLLBACK_STATE_PATH" --region "$AWS_REGION" >/dev/null 2>&1; then
  STATE_BUCKET=$(node -p "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); data.bucket || '';" "$ROLLBACK_STATE_PATH")
  STATE_DIST=$(node -p "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); data.distributionId || '';" "$ROLLBACK_STATE_PATH")
  if [ -n "$STATE_BUCKET" ]; then
    S3_BUCKET="$STATE_BUCKET"
  fi
  if [ -n "$STATE_DIST" ]; then
    CLOUDFRONT_DISTRIBUTION_ID="$STATE_DIST"
  fi
fi

mkdir -p "$RESTORE_DIR"
aws s3 sync "$BACKUP_PREFIX/" "$RESTORE_DIR/" \
  --region "$AWS_REGION" \
  --exclude "rollback-state.json" \
  >/dev/null

if [ ! -f "$RESTORE_DIR/index.html" ]; then
  echo "Root shell backup at $BACKUP_PREFIX does not contain index.html" >&2
  exit 1
fi

aws s3 sync "$RESTORE_DIR/" "s3://$S3_BUCKET/" \
  --region "$AWS_REGION" \
  --delete \
  --exclude "analytics/*" \
  --exclude "analytics-assets/*" \
  --exclude "asset-backups/*" \
  --exclude "rollback-state.json" \
  >/dev/null

if [ -n "$CLOUDFRONT_DISTRIBUTION_ID" ]; then
  read -r -a INVALIDATION_PATH_ARRAY <<< "$INVALIDATION_PATHS"
  aws cloudfront create-invalidation \
    --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
    --paths "${INVALIDATION_PATH_ARRAY[@]}" \
    >/dev/null
fi

echo "✅ Root shell rolled back from $BACKUP_PREFIX"
