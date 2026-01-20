#!/bin/bash
# Deploy Panda Roof ML Analyzer Lambda
# =====================================

set -e

REGION="us-east-2"
ACCOUNT_ID="679128292059"
FUNCTION_NAME="panda-roof-ml-analyzer"
ECR_REPO="panda-crm/roof-ml-analyzer"
IMAGE_TAG="latest"

echo "======================================"
echo "Deploying Panda Roof ML Analyzer Lambda"
echo "======================================"

# 1. Login to ECR
echo "Logging in to ECR..."
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

# 2. Create ECR repository if it doesn't exist
echo "Creating ECR repository if needed..."
aws ecr describe-repositories --repository-names $ECR_REPO --region $REGION 2>/dev/null || \
  aws ecr create-repository --repository-name $ECR_REPO --region $REGION

# 3. Build Docker image
echo "Building Docker image..."
docker build -t $ECR_REPO:$IMAGE_TAG .

# 4. Tag and push to ECR
echo "Pushing to ECR..."
docker tag $ECR_REPO:$IMAGE_TAG $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$ECR_REPO:$IMAGE_TAG
docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$ECR_REPO:$IMAGE_TAG

# 5. Check if Lambda exists
LAMBDA_EXISTS=$(aws lambda get-function --function-name $FUNCTION_NAME --region $REGION 2>&1 || echo "NOT_FOUND")

if [[ "$LAMBDA_EXISTS" == *"NOT_FOUND"* ]]; then
  echo "Creating Lambda function..."
  aws lambda create-function \
    --function-name $FUNCTION_NAME \
    --package-type Image \
    --code ImageUri=$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$ECR_REPO:$IMAGE_TAG \
    --role arn:aws:iam::$ACCOUNT_ID:role/panda-crm-lambda-role \
    --timeout 120 \
    --memory-size 1024 \
    --environment "Variables={S3_BUCKET=panda-crm-ml-models,CONFIDENCE_THRESHOLD=0.75}" \
    --region $REGION

  echo "Lambda function created successfully!"
else
  echo "Updating Lambda function..."
  aws lambda update-function-code \
    --function-name $FUNCTION_NAME \
    --image-uri $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$ECR_REPO:$IMAGE_TAG \
    --region $REGION

  echo "Waiting for update to complete..."
  aws lambda wait function-updated --function-name $FUNCTION_NAME --region $REGION

  echo "Lambda function updated successfully!"
fi

echo ""
echo "======================================"
echo "Deployment complete!"
echo "Lambda ARN: arn:aws:lambda:$REGION:$ACCOUNT_ID:function:$FUNCTION_NAME"
echo "======================================"
