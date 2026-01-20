#!/bin/bash
# Deploy frontend directly via AWS CLI without local build

set -e

echo "Creating deployment package..."
cd "/Users/Brian 1/Desktop/panda-crm/frontend"

# Create a zip file instead of tar for faster processing
zip -r /tmp/frontend-deploy.zip \
  src/ \
  public/ \
  package.json \
  package-lock.json \
  vite.config.js \
  index.html \
  -x "*.git*" "node_modules/*" "dist/*" 2>&1 | head -20

echo ""
echo "✅ Package created"
ls -lh /tmp/frontend-deploy.zip

echo ""
echo "Uploading to S3..."
aws s3 cp /tmp/frontend-deploy.zip s3://panda-crm-support/temp/frontend-deploy.zip --region us-east-2

echo ""
echo "✅ Upload complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "SUCCESS! Now open AWS CloudShell and run:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "aws s3 cp s3://panda-crm-support/temp/frontend-deploy.zip . --region us-east-2 && unzip -o frontend-deploy.zip -d frontend && cd frontend && npm install && npm run build && aws s3 sync dist/ s3://panda-crm-frontend-prod/ --delete --region us-east-2 && aws cloudfront create-invalidation --distribution-id EDKIMD3LRK2M8 --paths \"/*\" --region us-east-2"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
