#!/bin/bash
# Deployment script for Panda CRM Training Bot Lambda

set -e

FUNCTION_NAME="panda-crm-training-bot"
REGION="us-east-2"

echo "=== Panda CRM Training Bot Deployment ==="

# Check if function exists
echo "Checking if Lambda function exists..."
if aws lambda get-function --function-name $FUNCTION_NAME --region $REGION 2>/dev/null; then
    echo "Function exists, updating..."
    UPDATE=true
else
    echo "Function does not exist, creating..."
    UPDATE=false
fi

# Create deployment package
echo "Creating deployment package..."
cd "$(dirname "$0")"
rm -f training-bot.zip
zip -r training-bot.zip src package.json

if [ "$UPDATE" = true ]; then
    # Update existing function
    echo "Uploading code..."
    aws lambda update-function-code \
        --function-name $FUNCTION_NAME \
        --zip-file fileb://training-bot.zip \
        --region $REGION

    echo "Waiting for update to complete..."
    aws lambda wait function-updated --function-name $FUNCTION_NAME --region $REGION
else
    # Create new function
    echo "Creating Lambda function..."
    aws lambda create-function \
        --function-name $FUNCTION_NAME \
        --runtime nodejs18.x \
        --role arn:aws:iam::679128292059:role/panda-crm-lambda-role \
        --handler src/index.handler \
        --zip-file fileb://training-bot.zip \
        --timeout 30 \
        --memory-size 256 \
        --region $REGION

    echo "Waiting for function to be active..."
    aws lambda wait function-active --function-name $FUNCTION_NAME --region $REGION

    # Add API Gateway permission
    echo "Adding API Gateway permission..."
    aws lambda add-permission \
        --function-name $FUNCTION_NAME \
        --statement-id apigateway-invoke \
        --action lambda:InvokeFunction \
        --principal apigateway.amazonaws.com \
        --region $REGION
fi

# Clean up
rm -f training-bot.zip

echo ""
echo "=== Deployment Complete ==="
echo "Function: $FUNCTION_NAME"
echo "Region: $REGION"
echo ""
echo "Next steps:"
echo "1. Add routes to API Gateway for /training-bot/* endpoints"
echo "2. Test the endpoint"
echo ""
