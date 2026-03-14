#!/usr/bin/env bash
set -euo pipefail

export AWS_PAGER=""

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

for cmd in aws curl python3 git; do
  require_cmd "$cmd"
done

REGION="${AWS_REGION:-us-east-2}"
CLUSTER="${PANDA_ECS_CLUSTER:-panda-crm-cluster}"
FRONTEND_URL="${PANDA_FRONTEND_URL:-https://crm.pandaadmin.com}"
FRONTEND_BUCKET="${PANDA_FRONTEND_BUCKET:-panda-crm-frontend-prod}"
CLOUDFRONT_DISTRIBUTION_ID="${PANDA_CLOUDFRONT_DISTRIBUTION_ID:-EDKIMD3LRK2M8}"
OUTFILE="${1:-/tmp/panda-crm-baseline-$(date +%Y%m%d-%H%M%S).env}"
SERVICE_FILTER="${PANDA_BASELINE_SERVICES:-}"

HTML="$(curl -fsSL "$FRONTEND_URL")"
FRONTEND_JS="$(printf '%s' "$HTML" | grep -o 'assets/index-[^"]*\.js' | head -n 1 || true)"
FRONTEND_CSS="$(printf '%s' "$HTML" | grep -o 'assets/index-[^"]*\.css' | head -n 1 || true)"

SERVICE_NAMES=()

if [[ -n "$SERVICE_FILTER" ]]; then
  OLD_IFS="$IFS"
  IFS=','
  read -r -a FILTERED_SERVICE_NAMES <<< "$SERVICE_FILTER"
  IFS="$OLD_IFS"
  for service_name in "${FILTERED_SERVICE_NAMES[@]}"; do
    service_name="${service_name#"${service_name%%[![:space:]]*}"}"
    service_name="${service_name%"${service_name##*[![:space:]]}"}"
    [[ -z "$service_name" ]] && continue
    SERVICE_NAMES+=("$service_name")
  done
else
  while IFS= read -r service_name; do
    [[ -z "$service_name" ]] && continue
    SERVICE_NAMES+=("$service_name")
  done < <(
    aws ecs list-services \
      --cluster "$CLUSTER" \
      --region "$REGION" \
      --query 'serviceArns[]' \
      --output text |
    tr '\t' '\n' |
    awk -F/ '/panda-crm-/ {print $NF}' |
    sort
  )
fi

if [[ "${#SERVICE_NAMES[@]}" -eq 0 ]]; then
  echo "No panda-crm ECS services found in cluster $CLUSTER" >&2
  exit 1
fi

SERVICE_TASK_DEFINITIONS=()
SERVICE_IMAGES=()

for service_name in "${SERVICE_NAMES[@]}"; do
  task_arn="$(
    aws ecs describe-services \
      --cluster "$CLUSTER" \
      --services "$service_name" \
      --region "$REGION" \
      --query 'services[0].taskDefinition' \
      --output text
  )"

  if [[ "$task_arn" == "None" || -z "$task_arn" ]]; then
    SERVICE_TASK_DEFINITIONS+=("MISSING")
    SERVICE_IMAGES+=("MISSING")
    continue
  fi

  task_definition="${task_arn##*/}"
  image="$(
    aws ecs describe-task-definition \
      --task-definition "$task_definition" \
      --region "$REGION" \
      --query 'taskDefinition.containerDefinitions[0].image' \
      --output text
  )"

  SERVICE_TASK_DEFINITIONS+=("$task_definition")
  SERVICE_IMAGES+=("$image")
done

{
  printf '#!/usr/bin/env bash\n'
  printf "captured_at='%s'\n" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf "captured_by_branch='%s'\n" "$(git branch --show-current 2>/dev/null || true)"
  printf "captured_by_commit='%s'\n" "$(git rev-parse --short HEAD 2>/dev/null || true)"
  printf "region='%s'\n" "$REGION"
  printf "cluster='%s'\n" "$CLUSTER"
  printf "frontend_url='%s'\n" "$FRONTEND_URL"
  printf "frontend_bucket='%s'\n" "$FRONTEND_BUCKET"
  printf "cloudfront_distribution_id='%s'\n" "$CLOUDFRONT_DISTRIBUTION_ID"
  printf "frontend_js='%s'\n" "$FRONTEND_JS"
  printf "frontend_css='%s'\n" "$FRONTEND_CSS"
  printf 'service_names=(\n'
  for service_name in "${SERVICE_NAMES[@]}"; do
    printf "  '%s'\n" "$service_name"
  done
  printf ')\n'
  printf 'service_task_definitions=(\n'
  for task_definition in "${SERVICE_TASK_DEFINITIONS[@]}"; do
    printf "  '%s'\n" "$task_definition"
  done
  printf ')\n'
  printf 'service_images=(\n'
  for image in "${SERVICE_IMAGES[@]}"; do
    printf "  '%s'\n" "$image"
  done
  printf ')\n'
} > "$OUTFILE"

chmod 600 "$OUTFILE"
printf '%s\n' "$OUTFILE"
