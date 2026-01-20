#!/bin/bash
# Deploy Panda Roof Measurement Pipeline Lambdas
# ===============================================
# Deploys individual Lambda functions for:
# - naip_fetcher: Fetches NAIP aerial imagery
# - roof_segmenter: Segments roof from imagery
# - measurement_calculator: Calculates roof measurements
# - report_generator: Generates PDF reports
#
# Uses S3 upload for large packages (>50MB)

set -e

REGION="us-east-2"
ACCOUNT_ID="679128292059"
LAMBDA_ROLE="arn:aws:iam::${ACCOUNT_ID}:role/panda-crm-lambda-role"
S3_BUCKET="panda-crm-lambda-deployments"

echo "======================================"
echo "Deploying Roof Measurement Pipeline"
echo "======================================"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="/tmp/roof-measurement-build"

# Create build directory
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Ensure S3 bucket exists
echo "Checking S3 bucket..."
if ! aws s3 ls "s3://$S3_BUCKET" --region "$REGION" 2>/dev/null; then
    echo "Creating S3 bucket: $S3_BUCKET"
    aws s3 mb "s3://$S3_BUCKET" --region "$REGION"
fi

# Install dependencies to build directory
echo "Installing dependencies..."
pip3 install -r "$SCRIPT_DIR/requirements.txt" -t "$BUILD_DIR" --quiet --platform manylinux2014_x86_64 --only-binary=:all: 2>/dev/null || \
pip3 install -r "$SCRIPT_DIR/requirements.txt" -t "$BUILD_DIR" --quiet

# Function to deploy a single Lambda
deploy_lambda() {
    local FUNCTION_NAME=$1
    local HANDLER_FILE=$2
    local HANDLER_MODULE=$3
    local MEMORY_MB=$4
    local TIMEOUT_SEC=$5

    echo ""
    echo "--------------------------------------"
    echo "Deploying: $FUNCTION_NAME"
    echo "Handler: ${HANDLER_MODULE}.lambda_handler"
    echo "--------------------------------------"

    # Create deployment package
    PACKAGE_DIR="$BUILD_DIR/$FUNCTION_NAME"
    mkdir -p "$PACKAGE_DIR"

    # Copy dependencies
    cp -r "$BUILD_DIR"/* "$PACKAGE_DIR/" 2>/dev/null || true

    # Copy handler
    cp "$SCRIPT_DIR/$HANDLER_FILE" "$PACKAGE_DIR/"

    # Create zip
    ZIP_FILE="$BUILD_DIR/${FUNCTION_NAME}.zip"
    cd "$PACKAGE_DIR"
    zip -r "$ZIP_FILE" . -x "*.pyc" -x "__pycache__/*" -x "*.dist-info/*" -x "tests/*" -x "*.egg-info/*" > /dev/null
    cd - > /dev/null

    ZIP_SIZE=$(ls -lh "$ZIP_FILE" | awk '{print $5}')
    ZIP_BYTES=$(stat -f%z "$ZIP_FILE" 2>/dev/null || stat -c%s "$ZIP_FILE" 2>/dev/null)
    echo "Package size: $ZIP_SIZE"

    # Upload to S3 (required for packages >50MB)
    S3_KEY="roof-measurement-pipeline/${FUNCTION_NAME}.zip"
    echo "Uploading to S3..."
    aws s3 cp "$ZIP_FILE" "s3://$S3_BUCKET/$S3_KEY" --region "$REGION" > /dev/null

    # Check if Lambda exists
    LAMBDA_EXISTS=$(aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" 2>&1 || echo "NOT_FOUND")

    if [[ "$LAMBDA_EXISTS" == *"NOT_FOUND"* ]] || [[ "$LAMBDA_EXISTS" == *"ResourceNotFoundException"* ]]; then
        echo "Creating Lambda function..."
        aws lambda create-function \
            --function-name "$FUNCTION_NAME" \
            --runtime python3.11 \
            --role "$LAMBDA_ROLE" \
            --handler "${HANDLER_MODULE}.lambda_handler" \
            --code "S3Bucket=$S3_BUCKET,S3Key=$S3_KEY" \
            --timeout "$TIMEOUT_SEC" \
            --memory-size "$MEMORY_MB" \
            --region "$REGION" \
            --no-cli-pager

        echo "✓ Lambda created: $FUNCTION_NAME"
    else
        echo "Updating Lambda function..."
        aws lambda update-function-code \
            --function-name "$FUNCTION_NAME" \
            --s3-bucket "$S3_BUCKET" \
            --s3-key "$S3_KEY" \
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
# Arguments: FUNCTION_NAME, HANDLER_FILE, HANDLER_MODULE, MEMORY_MB, TIMEOUT_SEC

deploy_lambda "panda-naip-fetcher" "naip_fetcher.py" "naip_fetcher" 512 60
deploy_lambda "panda-roof-segmenter" "roof_segmenter.py" "roof_segmenter" 1024 120
deploy_lambda "panda-measurement-calculator" "measurement_calculator.py" "measurement_calculator" 512 30
deploy_lambda "panda-report-generator" "report_generator.py" "report_generator" 512 60

# Cleanup
rm -rf "$BUILD_DIR"

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
