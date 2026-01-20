#!/bin/bash
# Deploy Panda Roof Measurement Pipeline Lambdas using Container Images
# =====================================================================
# Uses ECR container images to overcome Lambda's 250MB unzipped limit
# Container images support up to 10GB

set -e

REGION="us-east-2"
ACCOUNT_ID="679128292059"
LAMBDA_ROLE="arn:aws:iam::${ACCOUNT_ID}:role/panda-crm-lambda-role"
ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

echo "======================================"
echo "Deploying Roof Measurement Pipeline"
echo "Using Container-Based Deployment"
echo "======================================"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Login to ECR
echo ""
echo "Logging in to ECR..."
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY"

# Function to deploy a single Lambda using container image
deploy_lambda_container() {
    local FUNCTION_NAME=$1
    local DOCKERFILE=$2
    local HANDLER_MODULE=$3
    local MEMORY_MB=$4
    local TIMEOUT_SEC=$5

    echo ""
    echo "--------------------------------------"
    echo "Deploying: $FUNCTION_NAME"
    echo "Dockerfile: $DOCKERFILE"
    echo "--------------------------------------"

    local REPO_NAME="panda-crm/${FUNCTION_NAME}"
    local IMAGE_TAG="latest"
    local FULL_IMAGE="${ECR_REGISTRY}/${REPO_NAME}:${IMAGE_TAG}"

    # Create ECR repository if it doesn't exist
    echo "Checking ECR repository..."
    if ! aws ecr describe-repositories --repository-names "$REPO_NAME" --region "$REGION" 2>/dev/null; then
        echo "Creating ECR repository: $REPO_NAME"
        aws ecr create-repository --repository-name "$REPO_NAME" --region "$REGION" --no-cli-pager
    fi

    # Build Docker image for linux/amd64 (Lambda platform)
    echo "Building Docker image..."
    docker build --platform linux/amd64 --provenance=false -t "${REPO_NAME}:${IMAGE_TAG}" -f "$SCRIPT_DIR/$DOCKERFILE" "$SCRIPT_DIR"

    # Tag for ECR
    docker tag "${REPO_NAME}:${IMAGE_TAG}" "$FULL_IMAGE"

    # Push to ECR
    echo "Pushing to ECR..."
    docker push "$FULL_IMAGE"

    # Get image digest for Lambda
    local IMAGE_URI="$FULL_IMAGE"

    # Check if Lambda exists
    LAMBDA_EXISTS=$(aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" 2>&1 || echo "NOT_FOUND")

    if [[ "$LAMBDA_EXISTS" == *"NOT_FOUND"* ]] || [[ "$LAMBDA_EXISTS" == *"ResourceNotFoundException"* ]]; then
        echo "Creating Lambda function..."
        aws lambda create-function \
            --function-name "$FUNCTION_NAME" \
            --package-type Image \
            --code "ImageUri=$IMAGE_URI" \
            --role "$LAMBDA_ROLE" \
            --timeout "$TIMEOUT_SEC" \
            --memory-size "$MEMORY_MB" \
            --region "$REGION" \
            --no-cli-pager

        echo "✓ Lambda created: $FUNCTION_NAME"
    else
        echo "Updating Lambda function..."
        aws lambda update-function-code \
            --function-name "$FUNCTION_NAME" \
            --image-uri "$IMAGE_URI" \
            --region "$REGION" \
            --no-cli-pager > /dev/null

        echo "Waiting for update..."
        aws lambda wait function-updated --function-name "$FUNCTION_NAME" --region "$REGION"

        # Update configuration
        aws lambda update-function-configuration \
            --function-name "$FUNCTION_NAME" \
            --timeout "$TIMEOUT_SEC" \
            --memory-size "$MEMORY_MB" \
            --region "$REGION" \
            --no-cli-pager > /dev/null 2>&1 || true

        echo "✓ Lambda updated: $FUNCTION_NAME"
    fi
}

# Deploy each Lambda function
# Arguments: FUNCTION_NAME, DOCKERFILE, HANDLER_MODULE, MEMORY_MB, TIMEOUT_SEC

deploy_lambda_container "panda-naip-fetcher" "Dockerfile.naip_fetcher" "naip_fetcher" 512 60
deploy_lambda_container "panda-roof-segmenter" "Dockerfile.roof_segmenter" "roof_segmenter" 1024 120
deploy_lambda_container "panda-measurement-calculator" "Dockerfile.measurement_calculator" "measurement_calculator" 512 30
deploy_lambda_container "panda-report-generator" "Dockerfile.report_generator" "report_generator" 512 60

echo ""
echo "======================================"
echo "Deployment Complete!"
echo "======================================"
echo ""
echo "Deployed functions:"
echo "  - arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:panda-naip-fetcher"
echo "  - arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:panda-roof-segmenter"
echo "  - arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:panda-measurement-calculator"
echo "  - arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:panda-report-generator"
echo ""
echo "Test with:"
echo '  aws lambda invoke --function-name panda-naip-fetcher \'
echo '    --payload '"'"'{"action":"coverage","latitude":39.2904,"longitude":-76.6122}'"'"' \'
echo '    --cli-binary-format raw-in-base64-out \'
echo '    /tmp/response.json && cat /tmp/response.json'
echo ""
