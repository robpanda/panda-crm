#!/bin/bash
# Deploy Opportunities Service with @Mention Support
# This script builds and deploys the opportunities service with @mention notifications

set -e

REGION="us-east-2"
ECR_REGISTRY="679128292059.dkr.ecr.us-east-2.amazonaws.com"
SERVICE_NAME="opportunities"
IMAGE_NAME="$ECR_REGISTRY/panda-crm/$SERVICE_NAME"
CLUSTER_NAME="panda-crm-cluster"
ECS_SERVICE="$SERVICE_NAME-service"

echo "=========================================="
echo "Deploying Opportunities Service with @Mentions"
echo "=========================================="
echo ""

# Step 1: Build Docker image
echo "Step 1: Building Docker image..."
cd "$(dirname "$0")/.."
docker build \
  -t $IMAGE_NAME:latest \
  -f services/$SERVICE_NAME/Dockerfile \
  .
echo "✓ Docker image built successfully"
echo ""

# Step 2: Authenticate with ECR
echo "Step 2: Authenticating with Amazon ECR..."
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ECR_REGISTRY
echo "✓ Authenticated with ECR"
echo ""

# Step 3: Push to ECR
echo "Step 3: Pushing image to ECR..."
docker push $IMAGE_NAME:latest
echo "✓ Image pushed to ECR"
echo ""

# Step 4: Get current task definition
echo "Step 4: Creating new task definition..."
TASK_DEF=$(aws ecs describe-task-definition \
  --task-definition $SERVICE_NAME \
  --region $REGION \
  --query 'taskDefinition' \
  --output json)

# Remove fields that aren't allowed in register-task-definition
TASK_DEF=$(echo $TASK_DEF | jq 'del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy)')

# Update image to latest
TASK_DEF=$(echo $TASK_DEF | jq --arg IMAGE "$IMAGE_NAME:latest" \
  '.containerDefinitions[0].image = $IMAGE')

# Register new task definition
echo "$TASK_DEF" > /tmp/task-def.json
NEW_TASK_DEF=$(aws ecs register-task-definition \
  --cli-input-json file:///tmp/task-def.json \
  --region $REGION \
  --query 'taskDefinition.taskDefinitionArn' \
  --output text)

echo "✓ New task definition created: $NEW_TASK_DEF"
echo ""

# Step 5: Update ECS service
echo "Step 5: Updating ECS service..."
aws ecs update-service \
  --cluster $CLUSTER_NAME \
  --service $ECS_SERVICE \
  --task-definition $NEW_TASK_DEF \
  --force-new-deployment \
  --region $REGION \
  --output json > /dev/null

echo "✓ ECS service updated"
echo ""

# Step 6: Wait for deployment
echo "Step 6: Waiting for deployment to complete..."
echo "This may take a few minutes..."
aws ecs wait services-stable \
  --cluster $CLUSTER_NAME \
  --services $ECS_SERVICE \
  --region $REGION

echo "✓ Deployment completed successfully!"
echo ""
echo "=========================================="
echo "Opportunities service deployed with @mention support!"
echo "=========================================="
echo ""
echo "Features Added:"
echo "  - @mention support in job messages (POST /api/opportunities/:id/messages)"
echo "  - Automatic MENTION notifications for tagged users"
echo "  - Fire-and-forget notification creation for performance"
echo ""
echo "Next: Deploy frontend with ActivityFeed component"
echo "  The frontend deployment will happen via GitHub Actions"
