#!/usr/bin/env bash
set -euo pipefail

export AWS_PAGER=""

if ! command -v aws >/dev/null 2>&1; then
  echo "Missing required command: aws" >&2
  exit 1
fi

REGION="${AWS_REGION:-us-east-2}"
FRONTEND_BUCKET="${PANDA_FRONTEND_BUCKET:-panda-crm-frontend-prod}"
OUTDIR="${1:-/tmp/frontend-backup-$(date +%Y%m%d-%H%M%S)}"

mkdir -p "$OUTDIR"

aws s3 sync "s3://${FRONTEND_BUCKET}/" "${OUTDIR}/" --region "$REGION" >&2

if [[ ! -f "${OUTDIR}/index.html" ]]; then
  echo "Frontend backup is missing index.html: ${OUTDIR}/index.html" >&2
  exit 1
fi

printf '%s\n' "$OUTDIR"
