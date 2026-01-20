#!/bin/bash
set -e

FUNCTION_NAME="panda-crm-daily-sync"
REGION="us-east-2"
ACCOUNT_ID="679128292059"
ROLE_NAME="panda-crm-daily-sync-role"
S3_BUCKET="panda-crm-sync-state"

echo "=== Panda CRM Daily Sync Lambda Deployment ==="
echo ""

# Create S3 bucket for sync state (if not exists)
echo "Creating S3 bucket for sync state..."
aws s3api create-bucket --bucket $S3_BUCKET --region $REGION \
  --create-bucket-configuration LocationConstraint=$REGION 2>/dev/null || echo "Bucket exists"

# Create IAM role for Lambda (if not exists)
echo "Creating IAM role..."
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

aws iam create-role --role-name $ROLE_NAME \
  --assume-role-policy-document file:///tmp/trust-policy.json 2>/dev/null || echo "Role exists"

# Attach policies
echo "Attaching IAM policies..."
aws iam attach-role-policy --role-name $ROLE_NAME \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole 2>/dev/null || true

# Create custom policy for Secrets Manager and S3
cat > /tmp/lambda-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": [
        "arn:aws:secretsmanager:$REGION:$ACCOUNT_ID:secret:panda-crm/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": [
        "arn:aws:s3:::$S3_BUCKET/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "ec2:CreateNetworkInterface",
        "ec2:DescribeNetworkInterfaces",
        "ec2:DeleteNetworkInterface"
      ],
      "Resource": "*"
    }
  ]
}
EOF

aws iam put-role-policy --role-name $ROLE_NAME \
  --policy-name panda-crm-sync-policy \
  --policy-document file:///tmp/lambda-policy.json

# Wait for role to propagate
echo "Waiting for IAM role to propagate..."
sleep 10

# Install dependencies and create deployment package
echo "Installing dependencies..."
cd "$(dirname "$0")"
npm install --omit=dev

# Copy Prisma schema and generate client
echo "Copying Prisma schema..."
mkdir -p prisma
cp ../../../shared/prisma/schema.prisma prisma/
npx prisma generate

# Create deployment package
echo "Creating deployment package..."
zip -r function.zip . -x "*.sh" -x "deploy.sh" -x ".git/*" -x "node_modules/.cache/*"

# Check if function exists
if aws lambda get-function --function-name $FUNCTION_NAME --region $REGION 2>/dev/null; then
  echo "Updating existing Lambda function..."
  aws lambda update-function-code \
    --function-name $FUNCTION_NAME \
    --zip-file fileb://function.zip \
    --region $REGION
else
  echo "Creating new Lambda function..."
  aws lambda create-function \
    --function-name $FUNCTION_NAME \
    --runtime nodejs20.x \
    --role arn:aws:iam::$ACCOUNT_ID:iam::role/$ROLE_NAME \
    --handler index.handler \
    --timeout 900 \
    --memory-size 1024 \
    --environment "Variables={DATABASE_URL=postgresql://pandacrm:PandaCRM2025Secure!@panda-crm-db.c1o4i6ekayqo.us-east-2.rds.amazonaws.com:5432/panda_crm,SYNC_STATE_BUCKET=$S3_BUCKET}" \
    --zip-file fileb://function.zip \
    --region $REGION \
    --vpc-config SubnetIds=subnet-00df3fe1966f1ab91,subnet-0c3e6e6b189dc5e00,subnet-04b808141fe2fe94c,SecurityGroupIds=sg-05fb6e061b1922983
fi

# Update function configuration
echo "Updating function configuration..."
aws lambda update-function-configuration \
  --function-name $FUNCTION_NAME \
  --timeout 900 \
  --memory-size 1024 \
  --environment "Variables={DATABASE_URL=postgresql://pandacrm:PandaCRM2025Secure!@panda-crm-db.c1o4i6ekayqo.us-east-2.rds.amazonaws.com:5432/panda_crm?sslmode=require,SYNC_STATE_BUCKET=$S3_BUCKET}" \
  --region $REGION 2>/dev/null || true

# Create EventBridge rule for scheduled execution (2 AM EST = 7 AM UTC)
echo "Creating EventBridge schedule..."
RULE_NAME="panda-crm-daily-sync-schedule"

aws events put-rule \
  --name $RULE_NAME \
  --schedule-expression "cron(0 7 * * ? *)" \
  --state ENABLED \
  --region $REGION

# Add Lambda permission for EventBridge
aws lambda add-permission \
  --function-name $FUNCTION_NAME \
  --statement-id EventBridgeInvoke \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn arn:aws:events:$REGION:$ACCOUNT_ID:rule/$RULE_NAME \
  --region $REGION 2>/dev/null || true

# Add target to EventBridge rule
aws events put-targets \
  --rule $RULE_NAME \
  --targets "Id"="1","Arn"="arn:aws:lambda:$REGION:$ACCOUNT_ID:function:$FUNCTION_NAME" \
  --region $REGION

# Clean up
rm -f function.zip /tmp/trust-policy.json /tmp/lambda-policy.json

echo ""
echo "=== Deployment Complete ==="
echo "Function: $FUNCTION_NAME"
echo "Schedule: Daily at 2 AM EST (7 AM UTC)"
echo ""
echo "To test manually:"
echo "  aws lambda invoke --function-name $FUNCTION_NAME --region $REGION /tmp/sync-output.json && cat /tmp/sync-output.json"
