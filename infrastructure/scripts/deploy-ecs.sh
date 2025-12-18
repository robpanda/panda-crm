#!/bin/bash
set -e

# Configuration
AWS_REGION="us-east-2"
AWS_ACCOUNT_ID="679128292059"
CLUSTER_NAME="panda-crm-cluster"
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# Services to deploy
SERVICES=(
  "accounts:3001"
  "contacts:3002"
  "leads:3003"
  "opportunities:3004"
  "workorders:3005"
  "quotes:3006"
  "invoices:3007"
)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Panda CRM - ECS Deployment Script    ${NC}"
echo -e "${GREEN}========================================${NC}"

# Function to check if ECR repo exists
check_ecr_repo() {
  local repo_name=$1
  aws ecr describe-repositories --repository-names "panda-crm/${repo_name}" --region ${AWS_REGION} >/dev/null 2>&1
}

# Function to create ECR repo
create_ecr_repo() {
  local repo_name=$1
  echo -e "${YELLOW}Creating ECR repository: panda-crm/${repo_name}${NC}"
  aws ecr create-repository \
    --repository-name "panda-crm/${repo_name}" \
    --region ${AWS_REGION} \
    --image-scanning-configuration scanOnPush=true \
    --image-tag-mutability MUTABLE
}

# Function to build and push Docker image
build_and_push() {
  local service_name=$1
  local service_port=$2
  local image_uri="${ECR_REGISTRY}/panda-crm/${service_name}:latest"

  echo -e "${YELLOW}Building Docker image for ${service_name}...${NC}"

  # Build from the project root
  docker build \
    -t ${image_uri} \
    -f services/${service_name}/Dockerfile \
    .

  echo -e "${YELLOW}Pushing image to ECR...${NC}"
  docker push ${image_uri}

  echo -e "${GREEN}Successfully pushed ${image_uri}${NC}"
}

# Function to create CloudWatch log group
create_log_group() {
  local service_name=$1
  local log_group="/ecs/panda-crm/${service_name}"

  if ! aws logs describe-log-groups --log-group-name-prefix ${log_group} --region ${AWS_REGION} | grep -q ${log_group}; then
    echo -e "${YELLOW}Creating CloudWatch log group: ${log_group}${NC}"
    aws logs create-log-group --log-group-name ${log_group} --region ${AWS_REGION}
    aws logs put-retention-policy --log-group-name ${log_group} --retention-in-days 30 --region ${AWS_REGION}
  fi
}

# Function to register task definition
register_task_definition() {
  local service_name=$1
  local task_def_file="infrastructure/ecs/task-definitions/${service_name}-service.json"

  if [ -f ${task_def_file} ]; then
    echo -e "${YELLOW}Registering task definition for ${service_name}...${NC}"
    aws ecs register-task-definition \
      --cli-input-json file://${task_def_file} \
      --region ${AWS_REGION}
    echo -e "${GREEN}Task definition registered${NC}"
  else
    echo -e "${RED}Task definition file not found: ${task_def_file}${NC}"
    return 1
  fi
}

# Function to create or update ECS service
deploy_service() {
  local service_name=$1
  local service_file="infrastructure/ecs/services/${service_name}-service.json"

  # Check if service exists
  if aws ecs describe-services --cluster ${CLUSTER_NAME} --services ${service_name}-service --region ${AWS_REGION} | grep -q "ACTIVE"; then
    echo -e "${YELLOW}Updating existing service: ${service_name}${NC}"
    aws ecs update-service \
      --cluster ${CLUSTER_NAME} \
      --service ${service_name}-service \
      --task-definition panda-crm-${service_name} \
      --force-new-deployment \
      --region ${AWS_REGION}
  else
    echo -e "${YELLOW}Creating new service: ${service_name}${NC}"
    if [ -f ${service_file} ]; then
      aws ecs create-service \
        --cluster ${CLUSTER_NAME} \
        --cli-input-json file://${service_file} \
        --region ${AWS_REGION}
    else
      echo -e "${RED}Service definition file not found: ${service_file}${NC}"
    fi
  fi
}

# Main deployment flow
main() {
  # Login to ECR
  echo -e "${YELLOW}Logging into ECR...${NC}"
  aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REGISTRY}

  # Check/Create ECS Cluster
  if ! aws ecs describe-clusters --clusters ${CLUSTER_NAME} --region ${AWS_REGION} | grep -q "ACTIVE"; then
    echo -e "${YELLOW}Creating ECS cluster: ${CLUSTER_NAME}${NC}"
    aws ecs create-cluster \
      --cluster-name ${CLUSTER_NAME} \
      --capacity-providers FARGATE FARGATE_SPOT \
      --default-capacity-provider-strategy capacityProvider=FARGATE,weight=1,base=1 capacityProvider=FARGATE_SPOT,weight=2,base=0 \
      --settings name=containerInsights,value=enabled \
      --region ${AWS_REGION}
  fi

  # Process each service
  for service_entry in "${SERVICES[@]}"; do
    IFS=':' read -r service_name service_port <<< "$service_entry"

    echo ""
    echo -e "${GREEN}Processing service: ${service_name} (port ${service_port})${NC}"
    echo -e "${GREEN}----------------------------------------${NC}"

    # Create ECR repo if needed
    if ! check_ecr_repo ${service_name}; then
      create_ecr_repo ${service_name}
    fi

    # Create CloudWatch log group
    create_log_group ${service_name}

    # Build and push Docker image
    build_and_push ${service_name} ${service_port}

    # Register task definition
    register_task_definition ${service_name}

    # Deploy/update service
    deploy_service ${service_name}

    echo -e "${GREEN}${service_name} deployment complete!${NC}"
  done

  echo ""
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}  All services deployed successfully!  ${NC}"
  echo -e "${GREEN}========================================${NC}"
}

# Run main function
main "$@"
