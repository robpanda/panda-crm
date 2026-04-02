#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$ROOT_DIR"

./scripts/deploy/preflight.sh

AWS_REGION=${AWS_REGION:-us-east-2}
S3_BUCKET=${S3_BUCKET:-panda-crm-frontend-prod}
CLOUDFRONT_DISTRIBUTION_ID=${CLOUDFRONT_DISTRIBUTION_ID:-EDKIMD3LRK2M8}
ANALYTICS_FUNCTION_NAME=${ANALYTICS_FUNCTION_NAME:-analytics-spa-rewrite}
CONFIGURE_ANALYTICS_ROUTING=${CONFIGURE_ANALYTICS_ROUTING:-1}
RELEASE_TS=$(date -u +%Y%m%d-%H%M%S)
ROOT_BACKUP_PREFIX=${ROOT_BACKUP_PREFIX:-s3://$S3_BUCKET/asset-backups/root-shell-$RELEASE_TS}
ANALYTICS_BACKUP_PREFIX=${ANALYTICS_BACKUP_PREFIX:-s3://$S3_BUCKET/asset-backups/analytics-$RELEASE_TS}

ROOT_ATTEMPTED=0
ANALYTICS_ATTEMPTED=0

rollback_on_error() {
  local exit_code=$?

  if [ "$exit_code" -eq 0 ]; then
    return
  fi

  echo "[root-and-analytics] ERROR: coordinated release failed, starting best-effort rollback" >&2

  if [ "$ROOT_ATTEMPTED" = "1" ]; then
    BACKUP_PREFIX="$ROOT_BACKUP_PREFIX" \
    AWS_REGION="$AWS_REGION" \
    S3_BUCKET="$S3_BUCKET" \
    CLOUDFRONT_DISTRIBUTION_ID="$CLOUDFRONT_DISTRIBUTION_ID" \
    ./scripts/deploy/root-shell-rollback.sh || true
  fi

  if [ "$ANALYTICS_ATTEMPTED" = "1" ]; then
    BACKUP_PREFIX="$ANALYTICS_BACKUP_PREFIX" \
    AWS_REGION="$AWS_REGION" \
    S3_BUCKET="$S3_BUCKET" \
    CLOUDFRONT_DISTRIBUTION_ID="$CLOUDFRONT_DISTRIBUTION_ID" \
    ./scripts/deploy/analytics-rollback.sh || true
  fi

  exit "$exit_code"
}
trap rollback_on_error ERR

ROOT_ATTEMPTED=1
BACKUP_PREFIX="$ROOT_BACKUP_PREFIX" \
AWS_REGION="$AWS_REGION" \
S3_BUCKET="$S3_BUCKET" \
CLOUDFRONT_DISTRIBUTION_ID="$CLOUDFRONT_DISTRIBUTION_ID" \
VITE_API_BASE="${VITE_API_BASE:-https://bamboo.pandaadmin.com}" \
./scripts/deploy/root-shell-prod.sh

ANALYTICS_ATTEMPTED=1
BACKUP_PREFIX="$ANALYTICS_BACKUP_PREFIX" \
AWS_REGION="$AWS_REGION" \
S3_BUCKET="$S3_BUCKET" \
CLOUDFRONT_DISTRIBUTION_ID="$CLOUDFRONT_DISTRIBUTION_ID" \
ANALYTICS_FUNCTION_NAME="$ANALYTICS_FUNCTION_NAME" \
CONFIGURE_ANALYTICS_ROUTING="$CONFIGURE_ANALYTICS_ROUTING" \
ALLOW_NON_ANALYTICS_SOURCE_CHANGES=1 \
VITE_API_BASE="${VITE_API_BASE:-https://bamboo.pandaadmin.com}" \
./scripts/deploy/analytics-prod.sh

trap - ERR

echo "✅ Coordinated root shell + analytics deploy complete"
echo "Root backup prefix: $ROOT_BACKUP_PREFIX"
echo "Analytics backup prefix: $ANALYTICS_BACKUP_PREFIX"
