#!/bin/bash
# Safe Frontend Deploy Script
# Run this from any Claude chat before deploying frontend changes

set -e
cd "/Users/Brian 1/Desktop/panda-crm"

echo "=== Step 1: Commit any pending changes ==="
git add -A
git commit -m "Auto-commit before deploy $(date +%Y%m%d-%H%M%S)" --allow-empty

echo "=== Step 2: Build frontend ==="
cd frontend
npm run build

echo "=== Step 3: Deploy to S3 ==="
aws s3 sync dist/ s3://panda-crm-frontend-prod/ --delete --region us-east-2

echo "=== Step 4: Invalidate CloudFront ==="
aws cloudfront create-invalidation --distribution-id EDKIMD3LRK2M8 --paths "/*" --region us-east-2

echo "=== Step 5: Commit and push ==="
cd ..
git add -A
git commit -m "Frontend deployed $(date +%Y%m%d-%H%M%S)" --allow-empty
git push origin main

echo "=== DONE! Frontend deployed successfully ==="
