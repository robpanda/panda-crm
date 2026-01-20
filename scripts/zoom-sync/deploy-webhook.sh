#!/bin/bash

# Deploy Zoom Webhook Handler to AWS Lambda with API Gateway
#
# Prerequisites:
# - AWS CLI configured with appropriate credentials
# - Node.js installed
# - zip command available

set -e

FUNCTION_NAME="zoom-recording-webhook"
REGION="us-east-2"
S3_BUCKET="panda-zoom-recordings"
WEBHOOK_SECRET_NAME="zoom-webhook-secret"
ROLE_NAME="zoom-webhook-lambda-role"
API_NAME="zoom-webhook-api"

echo "═══════════════════════════════════════════════════════════════"
echo "          ZOOM WEBHOOK LAMBDA DEPLOYMENT"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Get AWS Account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "AWS Account: $ACCOUNT_ID"
echo "Region: $REGION"
echo ""

# Step 1: Create IAM Role (if not exists)
echo "Step 1: Creating IAM Role..."
ROLE_ARN="arn:aws:iam::$ACCOUNT_ID:role/$ROLE_NAME"

if aws iam get-role --role-name $ROLE_NAME 2>/dev/null; then
    echo "  Role already exists: $ROLE_NAME"
else
    echo "  Creating role: $ROLE_NAME"

    # Create trust policy
    cat > /tmp/trust-policy.json << 'EOF'
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
EOF

    aws iam create-role \
        --role-name $ROLE_NAME \
        --assume-role-policy-document file:///tmp/trust-policy.json \
        --description "Role for Zoom webhook Lambda function"

    # Attach basic Lambda execution policy
    aws iam attach-role-policy \
        --role-name $ROLE_NAME \
        --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

    # Create and attach custom policy for S3 and Secrets Manager
    cat > /tmp/lambda-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:HeadObject"
            ],
            "Resource": "arn:aws:s3:::$S3_BUCKET/*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "secretsmanager:GetSecretValue"
            ],
            "Resource": [
                "arn:aws:secretsmanager:$REGION:$ACCOUNT_ID:secret:$WEBHOOK_SECRET_NAME*",
                "arn:aws:secretsmanager:$REGION:$ACCOUNT_ID:secret:zoom-app-credentials*"
            ]
        }
    ]
}
EOF

    aws iam put-role-policy \
        --role-name $ROLE_NAME \
        --policy-name ZoomWebhookPolicy \
        --policy-document file:///tmp/lambda-policy.json

    echo "  Waiting for role to propagate..."
    sleep 10
fi

# Step 2: Package Lambda function
echo ""
echo "Step 2: Packaging Lambda function..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PACKAGE_DIR="/tmp/zoom-webhook-package"

rm -rf $PACKAGE_DIR
mkdir -p $PACKAGE_DIR

# Copy handler
cp "$SCRIPT_DIR/zoom-webhook-handler.js" "$PACKAGE_DIR/index.js"

# Install dependencies
cd $PACKAGE_DIR
cat > package.json << 'EOF'
{
    "name": "zoom-webhook-handler",
    "version": "1.0.0",
    "dependencies": {
        "@aws-sdk/client-s3": "^3.700.0",
        "@aws-sdk/client-secrets-manager": "^3.700.0"
    }
}
EOF

npm install --production --silent

# Create zip
zip -r /tmp/zoom-webhook.zip . -x "*.git*"
echo "  Package created: /tmp/zoom-webhook.zip"

# Step 3: Create or update Lambda function
echo ""
echo "Step 3: Deploying Lambda function..."

if aws lambda get-function --function-name $FUNCTION_NAME --region $REGION 2>/dev/null; then
    echo "  Updating existing function..."
    aws lambda update-function-code \
        --function-name $FUNCTION_NAME \
        --zip-file fileb:///tmp/zoom-webhook.zip \
        --region $REGION

    # Wait for update to complete
    aws lambda wait function-updated --function-name $FUNCTION_NAME --region $REGION
else
    echo "  Creating new function..."
    aws lambda create-function \
        --function-name $FUNCTION_NAME \
        --runtime nodejs18.x \
        --role $ROLE_ARN \
        --handler index.handler \
        --zip-file fileb:///tmp/zoom-webhook.zip \
        --timeout 300 \
        --memory-size 512 \
        --environment "Variables={S3_BUCKET=$S3_BUCKET,WEBHOOK_SECRET_NAME=$WEBHOOK_SECRET_NAME}" \
        --region $REGION

    # Wait for function to be active
    aws lambda wait function-active --function-name $FUNCTION_NAME --region $REGION
fi

LAMBDA_ARN=$(aws lambda get-function --function-name $FUNCTION_NAME --region $REGION --query 'Configuration.FunctionArn' --output text)
echo "  Lambda ARN: $LAMBDA_ARN"

# Step 4: Create API Gateway
echo ""
echo "Step 4: Setting up API Gateway..."

# Check if API exists
API_ID=$(aws apigatewayv2 get-apis --region $REGION --query "Items[?Name=='$API_NAME'].ApiId" --output text)

if [ -z "$API_ID" ]; then
    echo "  Creating new HTTP API..."
    API_ID=$(aws apigatewayv2 create-api \
        --name $API_NAME \
        --protocol-type HTTP \
        --region $REGION \
        --query 'ApiId' \
        --output text)

    # Create Lambda integration
    INTEGRATION_ID=$(aws apigatewayv2 create-integration \
        --api-id $API_ID \
        --integration-type AWS_PROXY \
        --integration-uri $LAMBDA_ARN \
        --payload-format-version 2.0 \
        --region $REGION \
        --query 'IntegrationId' \
        --output text)

    # Create route
    aws apigatewayv2 create-route \
        --api-id $API_ID \
        --route-key "POST /webhook" \
        --target "integrations/$INTEGRATION_ID" \
        --region $REGION

    # Create default stage with auto-deploy
    aws apigatewayv2 create-stage \
        --api-id $API_ID \
        --stage-name '$default' \
        --auto-deploy \
        --region $REGION

    # Add Lambda permission for API Gateway
    aws lambda add-permission \
        --function-name $FUNCTION_NAME \
        --statement-id apigateway-invoke \
        --action lambda:InvokeFunction \
        --principal apigateway.amazonaws.com \
        --source-arn "arn:aws:execute-api:$REGION:$ACCOUNT_ID:$API_ID/*" \
        --region $REGION 2>/dev/null || true
else
    echo "  API already exists: $API_ID"
fi

# Get API endpoint
API_ENDPOINT=$(aws apigatewayv2 get-api --api-id $API_ID --region $REGION --query 'ApiEndpoint' --output text)
WEBHOOK_URL="$API_ENDPOINT/webhook"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "          DEPLOYMENT COMPLETE"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Lambda Function: $FUNCTION_NAME"
echo "API Gateway ID:  $API_ID"
echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║  WEBHOOK URL (use this in Zoom):                              ║"
echo "║                                                               ║"
echo "║  $WEBHOOK_URL"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "NEXT STEPS:"
echo ""
echo "1. Create the webhook secret in AWS Secrets Manager:"
echo "   (You'll get the secret token from Zoom in step 3)"
echo ""
echo "2. Go to Zoom App Marketplace: https://marketplace.zoom.us/"
echo "   - Click 'Develop' → 'Build App'"
echo "   - Choose 'Webhook Only' app type"
echo "   - Name it 'Panda Recording Sync Webhook'"
echo ""
echo "3. In your Zoom Webhook App:"
echo "   - Go to 'Feature' tab"
echo "   - Add 'Event Notification Endpoint URL': $WEBHOOK_URL"
echo "   - Copy the 'Secret Token' shown"
echo "   - Add event subscription: 'recording.completed'"
echo ""
echo "4. Create the secret in AWS Secrets Manager:"
echo "   aws secretsmanager create-secret \\"
echo "     --name $WEBHOOK_SECRET_NAME \\"
echo "     --region $REGION \\"
echo "     --secret-string '{\"secretToken\":\"YOUR_SECRET_TOKEN_FROM_ZOOM\"}'"
echo ""
echo "5. Click 'Validate' in Zoom to verify the endpoint"
echo ""
echo "6. Activate your Webhook app"
echo ""
