#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$ROOT_DIR"

AWS_REGION=${AWS_REGION:-us-east-2}
S3_BUCKET=${S3_BUCKET:-panda-crm-frontend-prod}
CLOUDFRONT_DISTRIBUTION_ID=${CLOUDFRONT_DISTRIBUTION_ID:-EDKIMD3LRK2M8}
ROOT_BACKUP_PREFIX=${ROOT_BACKUP_PREFIX:-}
ANALYTICS_BACKUP_PREFIX=${ANALYTICS_BACKUP_PREFIX:-}

if [ -z "$ROOT_BACKUP_PREFIX" ]; then
  echo "ROOT_BACKUP_PREFIX is required" >&2
  exit 1
fi

if [ -z "$ANALYTICS_BACKUP_PREFIX" ]; then
  echo "ANALYTICS_BACKUP_PREFIX is required" >&2
  exit 1
fi

BACKUP_PREFIX="$ROOT_BACKUP_PREFIX" \
AWS_REGION="$AWS_REGION" \
S3_BUCKET="$S3_BUCKET" \
CLOUDFRONT_DISTRIBUTION_ID="$CLOUDFRONT_DISTRIBUTION_ID" \
./scripts/deploy/root-shell-rollback.sh

BACKUP_PREFIX="$ANALYTICS_BACKUP_PREFIX" \
AWS_REGION="$AWS_REGION" \
S3_BUCKET="$S3_BUCKET" \
CLOUDFRONT_DISTRIBUTION_ID="$CLOUDFRONT_DISTRIBUTION_ID" \
./scripts/deploy/analytics-rollback.sh

echo "✅ Coordinated root shell + analytics rollback complete"
