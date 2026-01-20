#!/bin/bash
# Deploy bamboogli service to ECS

set -e

echo "=== Deploying Bamboogli Service ==="

# ECR Login
echo "Logging into ECR..."
aws ecr get-login-password --region us-east-2 | docker login --username AWS --password-stdin 679128292059.dkr.ecr.us-east-2.amazonaws.com

# Tag the image
echo "Tagging image..."
docker tag panda-crm/bamboogli:v4 679128292059.dkr.ecr.us-east-2.amazonaws.com/panda-crm/bamboogli:v19
docker tag panda-crm/bamboogli:v4 679128292059.dkr.ecr.us-east-2.amazonaws.com/panda-crm/bamboogli:latest

# Push to ECR
echo "Pushing to ECR..."
docker push 679128292059.dkr.ecr.us-east-2.amazonaws.com/panda-crm/bamboogli:v19
docker push 679128292059.dkr.ecr.us-east-2.amazonaws.com/panda-crm/bamboogli:latest

# Force new deployment
echo "Updating ECS service..."
aws ecs update-service --cluster panda-crm-cluster --service bamboogli-service --force-new-deployment --region us-east-2

echo "=== Deployment initiated ==="
echo "Monitor at: https://us-east-2.console.aws.amazon.com/ecs/v2/clusters/panda-crm-cluster/services/bamboogli-service"
