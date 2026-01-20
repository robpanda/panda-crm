#!/bin/bash
#
# Deploy Document Sync Lambda Function
#
# This script packages and deploys the sync-signed-documents.js as a Lambda function
# with a CloudWatch Events rule to run daily at 6 AM EST.
#

set -e

FUNCTION_NAME="panda-crm-document-sync"
REGION="us-east-2"
ROLE_ARN="arn:aws:iam::679128292059:role/panda-crm-lambda-role"
SCHEDULE_EXPRESSION="cron(0 11 * * ? *)"  # 6 AM EST = 11 AM UTC

echo "=== Deploying $FUNCTION_NAME Lambda ==="

# Create temp directory for packaging
PACKAGE_DIR=$(mktemp -d)
echo "Packaging in: $PACKAGE_DIR"

# Copy source files
cp sync-signed-documents.js "$PACKAGE_DIR/index.mjs"

# Create package.json for Lambda
cat > "$PACKAGE_DIR/package.json" << 'EOF'
{
  "name": "panda-crm-document-sync",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@aws-sdk/client-s3": "^3.0.0",
    "pg": "^8.11.0",
    "jsforce": "^1.11.0",
    "dotenv": "^16.0.0"
  }
}
EOF

# Install dependencies
cd "$PACKAGE_DIR"
npm install --production

# Create zip
zip -r function.zip .

# Check if function exists
if aws lambda get-function --function-name $FUNCTION_NAME --region $REGION 2>/dev/null; then
    echo "Updating existing Lambda function..."
    aws lambda update-function-code \
        --function-name $FUNCTION_NAME \
        --zip-file fileb://function.zip \
        --region $REGION

    # Update configuration
    aws lambda update-function-configuration \
        --function-name $FUNCTION_NAME \
        --timeout 900 \
        --memory-size 512 \
        --environment "Variables={
            DATABASE_URL=postgresql://pandacrm:PandaCRM2025Secure!@panda-crm-db.c1o4i6ekayqo.us-east-2.rds.amazonaws.com:5432/panda_crm,
            SF_LOGIN_URL=https://login.salesforce.com,
            SF_USERNAME=robwinters@pandaexteriors.com,
            SF_PASSWORD=1040310Bk!19,
            SF_SECURITY_TOKEN=2uEsrMAhq0SIXcZCzrM6UQsub,
            S3_BUCKET=pandasign-documents,
            NODE_TLS_REJECT_UNAUTHORIZED=0
        }" \
        --region $REGION
else
    echo "Creating new Lambda function..."
    aws lambda create-function \
        --function-name $FUNCTION_NAME \
        --runtime nodejs18.x \
        --handler index.handler \
        --role $ROLE_ARN \
        --zip-file fileb://function.zip \
        --timeout 900 \
        --memory-size 512 \
        --environment "Variables={
            DATABASE_URL=postgresql://pandacrm:PandaCRM2025Secure!@panda-crm-db.c1o4i6ekayqo.us-east-2.rds.amazonaws.com:5432/panda_crm,
            SF_LOGIN_URL=https://login.salesforce.com,
            SF_USERNAME=robwinters@pandaexteriors.com,
            SF_PASSWORD=1040310Bk!19,
            SF_SECURITY_TOKEN=2uEsrMAhq0SIXcZCzrM6UQsub,
            S3_BUCKET=pandasign-documents,
            NODE_TLS_REJECT_UNAUTHORIZED=0
        }" \
        --region $REGION
fi

# Create or update CloudWatch Events rule for daily schedule
RULE_NAME="panda-crm-document-sync-daily"

echo ""
echo "Setting up CloudWatch Events rule..."

aws events put-rule \
    --name $RULE_NAME \
    --schedule-expression "$SCHEDULE_EXPRESSION" \
    --state ENABLED \
    --description "Daily sync of signed documents from Salesforce to Panda CRM" \
    --region $REGION

# Get Lambda ARN
LAMBDA_ARN=$(aws lambda get-function --function-name $FUNCTION_NAME --region $REGION --query 'Configuration.FunctionArn' --output text)

# Add permission for CloudWatch Events to invoke Lambda
aws lambda add-permission \
    --function-name $FUNCTION_NAME \
    --statement-id "cloudwatch-events-$RULE_NAME" \
    --action "lambda:InvokeFunction" \
    --principal "events.amazonaws.com" \
    --source-arn "arn:aws:events:$REGION:679128292059:rule/$RULE_NAME" \
    --region $REGION 2>/dev/null || true

# Add Lambda as target for the rule
aws events put-targets \
    --rule $RULE_NAME \
    --targets "Id=1,Arn=$LAMBDA_ARN" \
    --region $REGION

# Cleanup
rm -rf "$PACKAGE_DIR"

echo ""
echo "=== Deployment Complete ==="
echo "Function: $FUNCTION_NAME"
echo "Schedule: Daily at 6 AM EST (11 AM UTC)"
echo ""
echo "To test manually:"
echo "  aws lambda invoke --function-name $FUNCTION_NAME --region $REGION /tmp/output.json && cat /tmp/output.json"
