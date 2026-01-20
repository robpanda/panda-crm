#!/bin/bash
# Fix and deploy frontend with all necessary files

set -e

echo "Step 1: Creating tarball with ALL frontend files..."
cd "/Users/Brian 1/Desktop/panda-crm/frontend"

# Create tarball with all source files
tar -czf /tmp/frontend-complete.tar.gz \
  src/ \
  public/ \
  package.json \
  package-lock.json \
  vite.config.js \
  index.html

echo "✅ Tarball created: /tmp/frontend-complete.tar.gz"
ls -lh /tmp/frontend-complete.tar.gz

echo ""
echo "Step 2: Uploading to S3..."
aws s3 cp /tmp/frontend-complete.tar.gz s3://panda-crm-support/temp/frontend-complete.tar.gz --region us-east-2

echo ""
echo "✅ Upload complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Now run these commands in AWS CloudShell:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "# 1. Download the complete tarball"
echo "aws s3 cp s3://panda-crm-support/temp/frontend-complete.tar.gz frontend-complete.tar.gz --region us-east-2"
echo ""
echo "# 2. Remove old directory if exists"
echo "rm -rf frontend-source"
echo ""
echo "# 3. Create fresh directory and extract"
echo "mkdir frontend-source"
echo "tar -xzf frontend-complete.tar.gz -C frontend-source"
echo ""
echo "# 4. Install dependencies and build"
echo "cd frontend-source"
echo "npm install"
echo "npm run build"
echo ""
echo "# 5. Deploy to S3"
echo "aws s3 sync dist/ s3://panda-crm-frontend-prod/ --delete --region us-east-2"
echo ""
echo "# 6. Invalidate CloudFront cache"
echo "aws cloudfront create-invalidation --distribution-id EDKIMD3LRK2M8 --paths \"/*\" --region us-east-2"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
