#!/bin/bash
# Setup OpenAI API Key in AWS Secrets Manager
# Run this script to configure the OpenAI API key for the integrations service

set -e

REGION="us-east-2"
SECRET_NAME="panda-crm/openai"
API_KEY="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"
PROJECT_ID="proj_rmR3DUh00G2TZJG0qhJNWXJe"

echo "Setting up OpenAI API secret in AWS Secrets Manager..."
echo "Region: $REGION"
echo "Secret Name: $SECRET_NAME"

# Create secret JSON
SECRET_VALUE=$(cat <<EOF
{
  "apiKey": "$API_KEY",
  "projectId": "$PROJECT_ID"
}
EOF
)

# Check if secret exists
if aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region "$REGION" >/dev/null 2>&1; then
    echo "Secret already exists. Updating..."
    aws secretsmanager put-secret-value \
        --secret-id "$SECRET_NAME" \
        --secret-string "$SECRET_VALUE" \
        --region "$REGION"
    echo "✓ Secret updated successfully"
else
    echo "Creating new secret..."
    aws secretsmanager create-secret \
        --name "$SECRET_NAME" \
        --description "OpenAI API credentials for Panda CRM AI features (ChatGPT project)" \
        --secret-string "$SECRET_VALUE" \
        --region "$REGION"
    echo "✓ Secret created successfully"
fi

echo ""
echo "Next steps:"
echo "1. Update the integrations ECS task definition to include environment variables:"
echo "   OPENAI_API_KEY=<fetch from secret>"
echo "   OPENAI_PROJECT_ID=$PROJECT_ID"
echo ""
echo "2. Or use AWS Secrets Manager in the task definition with valueFrom:"
echo "   {\"name\": \"OPENAI_API_KEY\", \"valueFrom\": \"arn:aws:secretsmanager:$REGION:679128292059:secret:$SECRET_NAME:apiKey::\"}"
