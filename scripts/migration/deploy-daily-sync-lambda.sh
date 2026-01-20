#!/bin/bash
#
# Deploy Comprehensive Daily Sync Lambda Function
#
# This script packages and deploys the comprehensive-daily-sync-lambda.mjs as a Lambda function
# with a CloudWatch Events rule to run daily at 1 AM EST.
#

set -e

FUNCTION_NAME="panda-crm-daily-sync"
REGION="us-east-2"
ROLE_ARN="arn:aws:iam::679128292059:role/panda-crm-lambda-role"
SCHEDULE_EXPRESSION="cron(0 6 * * ? *)"  # 1 AM EST = 6 AM UTC

echo "=== Deploying $FUNCTION_NAME Lambda ==="

# Create temp directory for packaging
PACKAGE_DIR=$(mktemp -d)
echo "Packaging in: $PACKAGE_DIR"

# Copy source files
cp comprehensive-daily-sync-lambda.mjs "$PACKAGE_DIR/index.mjs"

# Create package.json for Lambda (pin Prisma to 5.x to avoid schema compatibility issues)
cat > "$PACKAGE_DIR/package.json" << 'EOF'
{
  "name": "panda-crm-daily-sync",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@prisma/client": "5.22.0",
    "prisma": "5.22.0",
    "jsforce": "^1.11.0",
    "@aws-sdk/client-secrets-manager": "^3.0.0"
  }
}
EOF

# Install dependencies
cd "$PACKAGE_DIR"
npm install --omit=dev

# Copy Prisma schema and generate client
mkdir -p prisma
cp /Users/robwinters/panda-crm/shared/prisma/schema.prisma prisma/
./node_modules/.bin/prisma generate

# Create zip
zip -r function.zip .

# Check if function exists
if aws lambda get-function --function-name $FUNCTION_NAME --region $REGION 2>/dev/null; then
    echo "Updating existing Lambda function..."
    aws lambda update-function-code \
        --function-name $FUNCTION_NAME \
        --zip-file fileb://function.zip \
        --region $REGION

    # Wait for update to complete
    aws lambda wait function-updated --function-name $FUNCTION_NAME --region $REGION

    # Update configuration
    aws lambda update-function-configuration \
        --function-name $FUNCTION_NAME \
        --timeout 900 \
        --memory-size 1024 \
        --environment "Variables={
            DATABASE_URL=postgresql://pandacrm:PandaCRM2025Secure!@panda-crm-db.c1o4i6ekayqo.us-east-2.rds.amazonaws.com:5432/panda_crm
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
        --memory-size 1024 \
        --environment "Variables={
            DATABASE_URL=postgresql://pandacrm:PandaCRM2025Secure!@panda-crm-db.c1o4i6ekayqo.us-east-2.rds.amazonaws.com:5432/panda_crm
        }" \
        --region $REGION
fi

# Create or update CloudWatch Events rule for daily schedule
RULE_NAME="panda-crm-daily-sync-schedule"

echo ""
echo "Setting up CloudWatch Events rule..."

aws events put-rule \
    --name $RULE_NAME \
    --schedule-expression "$SCHEDULE_EXPRESSION" \
    --state ENABLED \
    --description "Daily sync of Salesforce data to Panda CRM at 1 AM EST" \
    --region $REGION

# Get Lambda ARN
LAMBDA_ARN=$(aws lambda get-function --function-name $FUNCTION_NAME --region $REGION --query 'Configuration.FunctionArn' --output text)

# Add permission for CloudWatch Events to invoke Lambda (ignore if already exists)
aws lambda add-permission \
    --function-name $FUNCTION_NAME \
    --statement-id "cloudwatch-events-$RULE_NAME" \
    --action "lambda:InvokeFunction" \
    --principal "events.amazonaws.com" \
    --source-arn "arn:aws:events:$REGION:679128292059:rule/$RULE_NAME" \
    --region $REGION 2>/dev/null || echo "Permission already exists"

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
echo "Schedule: Daily at 1 AM EST (6 AM UTC)"
echo ""
echo "To test manually:"
echo "  aws lambda invoke --function-name $FUNCTION_NAME --region $REGION /tmp/sync-output.json && cat /tmp/sync-output.json"
echo ""
echo "To view logs:"
echo "  aws logs tail /aws/lambda/$FUNCTION_NAME --follow --region $REGION"
