#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  create-rollback-file.sh <baseline-file> [frontend-backup-dir] [output-file]

Examples:
  create-rollback-file.sh /tmp/panda-crm-baseline-20260314.env
  create-rollback-file.sh /tmp/panda-crm-baseline-20260314.env /tmp/frontend-backup-20260314
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

BASELINE_FILE="${1:-}"
FRONTEND_BACKUP_DIR="${2:-}"
OUTFILE="${3:-/tmp/panda-crm-rollback-$(date +%Y%m%d-%H%M%S).sh}"

if [[ -z "$BASELINE_FILE" || ! -f "$BASELINE_FILE" ]]; then
  echo "Baseline file is required and must exist." >&2
  usage >&2
  exit 1
fi

# shellcheck source=/dev/null
source "$BASELINE_FILE"

{
  printf '#!/usr/bin/env bash\n'
  printf 'set -euo pipefail\n\n'
  printf "# Generated from baseline: %s\n" "$BASELINE_FILE"
  printf "# Captured at: %s\n\n" "${captured_at:-unknown}"
  printf "REGION='%s'\n" "${region:-us-east-2}"
  printf "CLUSTER='%s'\n" "${cluster:-panda-crm-cluster}"
  printf "FRONTEND_BUCKET='%s'\n" "${frontend_bucket:-panda-crm-frontend-prod}"
  printf "CLOUDFRONT_DISTRIBUTION_ID='%s'\n\n" "${cloudfront_distribution_id:-EDKIMD3LRK2M8}"

  if [[ -n "$FRONTEND_BACKUP_DIR" ]]; then
    printf "FRONTEND_BACKUP_DIR='%s'\n\n" "$FRONTEND_BACKUP_DIR"
    cat <<'EOF'
aws s3 sync "${FRONTEND_BACKUP_DIR}/" "s3://${FRONTEND_BUCKET}/" --delete --region "${REGION}"
aws s3 cp "${FRONTEND_BACKUP_DIR}/index.html" "s3://${FRONTEND_BUCKET}/index.html" --region "${REGION}"
aws cloudfront create-invalidation --distribution-id "${CLOUDFRONT_DISTRIBUTION_ID}" --paths '/*'

EOF
  else
    cat <<'EOF'
# Frontend backup directory not supplied.
# If this release changes the frontend, restore the bucket backup first and
# explicitly copy index.html before invalidating CloudFront.

EOF
  fi

  for i in "${!service_names[@]}"; do
    service_name="${service_names[$i]}"
    task_definition="${service_task_definitions[$i]}"
    if [[ -z "$task_definition" || "$task_definition" == "MISSING" ]]; then
      continue
    fi
    printf "aws ecs update-service --cluster \"%s\" --service \"%s\" --task-definition \"%s\" --force-new-deployment --region \"%s\"\n" \
      "${cluster:-panda-crm-cluster}" \
      "$service_name" \
      "$task_definition" \
      "${region:-us-east-2}"
  done
} > "$OUTFILE"

chmod 700 "$OUTFILE"
printf '%s\n' "$OUTFILE"
