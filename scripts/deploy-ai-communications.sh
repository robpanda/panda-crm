#!/bin/bash
# Master Deployment Script for AI Communications Feature
# Deploys all components of the AI-powered activity feed with @mentions

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "============================================================"
echo "  AI Communications Feature - Full Deployment"
echo "============================================================"
echo ""
echo "This script will deploy:"
echo "  1. OpenAI API key to AWS Secrets Manager"
echo "  2. Integrations service with AI routes"
echo "  3. Opportunities service with @mention support"
echo ""
echo "Note: Frontend will be deployed via GitHub Actions when changes are pushed"
echo ""
read -p "Continue with deployment? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled"
    exit 1
fi

echo ""
echo "============================================================"
echo "Step 1: Setting up OpenAI API Key in Secrets Manager"
echo "============================================================"
"$SCRIPT_DIR/setup-openai-secret.sh"

echo ""
echo "============================================================"
echo "Step 2: Deploying Integrations Service"
echo "============================================================"
"$SCRIPT_DIR/deploy-integrations-with-ai.sh"

echo ""
echo "============================================================"
echo "Step 3: Deploying Opportunities Service"
echo "============================================================"
"$SCRIPT_DIR/deploy-opportunities-with-mentions.sh"

echo ""
echo "============================================================"
echo "  ✓ AI Communications Feature Deployed Successfully!"
echo "============================================================"
echo ""
echo "Components deployed:"
echo "  ✓ OpenAI API key configured in Secrets Manager"
echo "  ✓ Integrations service with AI endpoints"
echo "  ✓ Opportunities service with @mention notifications"
echo ""
echo "Next steps:"
echo "  1. Commit and push frontend changes to trigger deployment:"
echo "     - frontend/src/components/ActivityFeed.jsx"
echo "     - frontend/src/pages/OpportunityDetail.jsx"
echo "     - frontend/src/services/api.js"
echo ""
echo "  2. Test the feature at: https://crm.pandaadmin.com/jobs/[job-id]?tab=activity"
echo ""
echo "Features available:"
echo "  - AI-powered activity summaries"
echo "  - Share an update with @mentions"
echo "  - AI next step suggestions"
echo "  - AI message drafting"
echo "  - Automatic notifications for mentioned users"
echo ""
echo "Enjoy your new AI-powered communications feature! 🎉"
