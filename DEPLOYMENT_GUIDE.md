# Support System Deployment Guide

## Quick Reference

All changes have been implemented and are ready for deployment. Follow these steps in order to deploy the complete support system.

---

## 🗂️ Files Created/Modified

### Frontend Files Created
- ✅ `/frontend/src/pages/Support.jsx` - User ticket list page
- ✅ `/frontend/src/pages/SupportTicketDetail.jsx` - Ticket detail/conversation page
- ✅ `/frontend/src/components/CreateTicketModal.jsx` - Create ticket modal with screenshot
- ✅ `/frontend/src/pages/admin/AdminSupportTickets.jsx` - Admin ticket management
- ✅ `/frontend/src/pages/admin/Support.jsx` - Support analytics (already existed)

### Frontend Files Modified
- ✅ `/frontend/src/App.jsx` - Added routes for Support pages
- ✅ `/frontend/src/components/Navbar.jsx` - Added Support to More menu
- ✅ `/frontend/src/components/Sidebar.jsx` - Added Support to secondary nav
- ✅ `/frontend/src/components/TrainingBot.jsx` - Changed to circular icon
- ✅ `/frontend/src/components/AdminLayout.jsx` - Added Support Analytics link

### Backend Files Created
- ✅ `/services/auth/src/routes/support.js` - Complete API for tickets
- ✅ `/services/training-bot/src/learning-engine.js` - ML pattern analysis
- ✅ `/services/training-bot/src/analyze-handler.js` - Automated analysis Lambda

### Backend Files Modified
- ✅ `/services/auth/src/index.js` - Registered support routes
- ✅ `/services/training-bot/src/index.js` - Added insights/analyze endpoints

### Database Files Modified
- ✅ `/shared/prisma/schema.prisma` - Added support ticket tables and relations

### Documentation Files Created
- ✅ `/SUPPORT_SYSTEM_ENHANCEMENTS.md` - Complete system documentation
- ✅ `/SUPPORT_TICKETING_SYSTEM.md` - Ticketing system guide
- ✅ `/DEPLOYMENT_GUIDE.md` - This file

---

## 📋 Pre-Deployment Checklist

### 1. Install Dependencies

**Frontend:**
```bash
cd /Users/Brian\ 1/Desktop/panda-crm/frontend
npm install html2canvas
```

**Backend (if not already installed):**
```bash
cd /Users/Brian\ 1/Desktop/panda-crm/services/auth
npm install multer @aws-sdk/client-s3
```

### 2. Database Migration

```bash
cd /Users/Brian\ 1/Desktop/panda-crm/shared

# Generate migration
npx prisma migrate dev --name add_support_tickets

# Generate Prisma client
npx prisma generate
```

This will create:
- `support_tickets` table
- `support_ticket_messages` table
- `support_ticket_attachments` table
- `SupportTicketStatus` enum
- `SupportTicketPriority` enum

### 3. Create S3 Bucket (AWS)

```bash
# Create bucket
aws s3 mb s3://panda-crm-support --region us-east-2

# Create CORS configuration file
cat > /tmp/cors.json << 'EOF'
{
  "CORSRules": [{
    "AllowedOrigins": [
      "https://crm.pandaadmin.com",
      "https://crm.pandaexteriors.com",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["GET", "PUT", "POST"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3000
  }]
}
EOF

# Apply CORS policy
aws s3api put-bucket-cors \
  --bucket panda-crm-support \
  --cors-configuration file:///tmp/cors.json

# Make bucket publicly readable for uploaded files
aws s3api put-bucket-policy \
  --bucket panda-crm-support \
  --policy '{
    "Version": "2012-10-17",
    "Statement": [{
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::panda-crm-support/*"
    }]
  }'
```

### 4. Environment Variables

Add to auth service `.env`:
```env
S3_BUCKET_NAME=panda-crm-support
AWS_REGION=us-east-2
```

Make sure AWS credentials are available (IAM role or credentials):
```env
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
```

### 5. Update IAM Permissions

Ensure the ECS task role has S3 permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::panda-crm-support/*"
    }
  ]
}
```

---

## 🚀 Deployment Steps

### Step 1: Build Frontend

```bash
cd /Users/Brian\ 1/Desktop/panda-crm/frontend
npm run build
```

### Step 2: Build and Push Backend Docker Image

```bash
cd /Users/Brian\ 1/Desktop/panda-crm/services/auth

# Build for linux/amd64 platform (AWS Fargate requirement)
docker build --platform=linux/amd64 -t panda-crm/auth:latest .

# Tag for ECR
docker tag panda-crm/auth:latest 679128292059.dkr.ecr.us-east-2.amazonaws.com/panda-crm/auth:latest

# Push to ECR
aws ecr get-login-password --region us-east-2 | docker login --username AWS --password-stdin 679128292059.dkr.ecr.us-east-2.amazonaws.com
docker push 679128292059.dkr.ecr.us-east-2.amazonaws.com/panda-crm/auth:latest
```

### Step 3: Update ECS Task Definition

Update the auth service task definition with new environment variables:

```json
{
  "environment": [
    {
      "name": "S3_BUCKET_NAME",
      "value": "panda-crm-support"
    },
    {
      "name": "AWS_REGION",
      "value": "us-east-2"
    }
  ]
}
```

### Step 4: Deploy Frontend to S3/CloudFront

```bash
cd /Users/Brian\ 1/Desktop/panda-crm/frontend

# Sync to S3
aws s3 sync dist/ s3://your-frontend-bucket/ --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id YOUR_DISTRIBUTION_ID \
  --paths "/*"
```

### Step 5: Update Auth Service

```bash
# Update ECS service to use new task definition
aws ecs update-service \
  --cluster panda-crm \
  --service auth-service \
  --task-definition panda-crm-auth:LATEST_VERSION \
  --force-new-deployment
```

### Step 6: Run Database Migration (if not done locally)

```bash
# Connect to RDS or run from bastion host
cd /path/to/shared
npx prisma migrate deploy
```

---

## ✅ Post-Deployment Verification

### 1. Check Frontend

Visit: `https://crm.pandaadmin.com/support`

**Verify:**
- [ ] Page loads without errors
- [ ] Can see support dashboard
- [ ] "New Ticket" button works
- [ ] Can create a ticket with screenshot
- [ ] File attachments upload successfully
- [ ] Can view ticket details
- [ ] Can send messages

### 2. Check Admin Pages

Visit: `https://crm.pandaadmin.com/admin/support`

**Verify:**
- [ ] Analytics dashboard loads
- [ ] Can see all user interactions
- [ ] Can export data

Visit: `https://crm.pandaadmin.com/admin/support/tickets`

**Verify:**
- [ ] Can see all tickets
- [ ] Filtering works
- [ ] Can export to CSV
- [ ] Stats display correctly

### 3. Check API Endpoints

```bash
# Test ticket creation
curl -X POST https://crm.pandaadmin.com/api/support/tickets \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Test ticket",
    "description": "Testing the API",
    "priority": "MEDIUM"
  }'

# Test getting tickets
curl https://crm.pandaadmin.com/api/support/tickets \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 4. Check Database

```sql
-- Verify tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name LIKE 'support_%';

-- Should return:
-- support_tickets
-- support_ticket_messages
-- support_ticket_attachments

-- Check ticket creation
SELECT COUNT(*) FROM support_tickets;
```

### 5. Check S3 Bucket

```bash
# Verify bucket exists and is accessible
aws s3 ls s3://panda-crm-support/

# Should show folders: screenshots/ and attachments/
```

### 6. Check CloudWatch Logs

```bash
# Auth service logs
aws logs tail /aws/ecs/panda-crm/auth --follow

# Look for:
# - "Support route registered"
# - No errors related to support endpoints
```

---

## 🔧 Troubleshooting

### Issue: Frontend build fails

**Error:** `Module not found: html2canvas`

**Solution:**
```bash
cd frontend
npm install html2canvas
npm run build
```

### Issue: Database migration fails

**Error:** `Relation "support_tickets" already exists`

**Solution:**
```bash
# Reset migration (development only!)
npx prisma migrate reset

# Or manually drop tables
DROP TABLE IF EXISTS support_ticket_attachments CASCADE;
DROP TABLE IF EXISTS support_ticket_messages CASCADE;
DROP TABLE IF EXISTS support_tickets CASCADE;
DROP TYPE IF EXISTS "SupportTicketStatus";
DROP TYPE IF EXISTS "SupportTicketPriority";

# Then run migration again
npx prisma migrate dev --name add_support_tickets
```

### Issue: File uploads fail

**Error:** `Access Denied` or `CORS error`

**Solution:**
1. Check S3 bucket policy is applied
2. Verify CORS configuration
3. Check IAM role has S3 permissions
4. Verify bucket name in environment variables

```bash
# Re-apply CORS
aws s3api put-bucket-cors \
  --bucket panda-crm-support \
  --cors-configuration file://cors.json
```

### Issue: Screenshot capture not working

**Error:** Canvas tainted by cross-origin data

**Solution:**
- Images must have CORS headers
- Use `useCORS: true` and `allowTaint: true` in html2canvas options
- Already configured in CreateTicketModal.jsx

### Issue: Can't see Support in navigation

**Solution:**
1. Clear browser cache
2. Hard refresh (Cmd+Shift+R / Ctrl+Shift+R)
3. Check if route exists in App.jsx
4. Check console for JavaScript errors

### Issue: API returns 403 Forbidden

**Solution:**
- Verify user is authenticated (valid JWT token)
- For admin endpoints, verify user has admin role
- Check authMiddleware is working

---

## 📊 Monitoring

### Key Metrics to Monitor

1. **Ticket Volume**
   - New tickets per day
   - Response time
   - Resolution time

2. **S3 Usage**
   - Storage size
   - Number of objects
   - Request counts

3. **API Performance**
   - Endpoint response times
   - Error rates
   - Request volume

4. **Database**
   - Table sizes
   - Query performance
   - Connection pool usage

### CloudWatch Alarms (Recommended)

```bash
# High error rate alarm
aws cloudwatch put-metric-alarm \
  --alarm-name support-api-errors \
  --alarm-description "Alert on high support API errors" \
  --metric-name 5XXError \
  --namespace AWS/ApplicationELB \
  --statistic Sum \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold

# S3 storage alarm
aws cloudwatch put-metric-alarm \
  --alarm-name support-s3-size \
  --alarm-description "Alert on high S3 storage" \
  --metric-name BucketSizeBytes \
  --namespace AWS/S3 \
  --dimensions Name=BucketName,Value=panda-crm-support \
  --statistic Average \
  --period 86400 \
  --evaluation-periods 1 \
  --threshold 10737418240 \
  --comparison-operator GreaterThanThreshold
```

---

## 🔄 Rollback Plan

If issues arise after deployment:

### 1. Rollback Frontend
```bash
# Revert to previous version
aws s3 sync s3://your-backup-bucket/ s3://your-frontend-bucket/ --delete
aws cloudfront create-invalidation --distribution-id YOUR_ID --paths "/*"
```

### 2. Rollback Backend
```bash
# Revert to previous task definition
aws ecs update-service \
  --cluster panda-crm \
  --service auth-service \
  --task-definition panda-crm-auth:PREVIOUS_VERSION
```

### 3. Rollback Database (CAUTION!)
```bash
# Only if no user data exists yet
npx prisma migrate reset

# To specific migration
npx prisma migrate resolve --rolled-back "MIGRATION_NAME"
```

---

## 📞 Support Contacts

For deployment issues:
- **Database:** Check RDS console, CloudWatch logs
- **API:** Check ECS logs, ALB access logs
- **Frontend:** Check CloudFront logs, browser console
- **S3:** Check S3 server access logs

---

## ✨ Features Now Available

After successful deployment, users will have:

### User Features
- ✅ Create support tickets with screenshots
- ✅ Upload file attachments
- ✅ Track ticket status
- ✅ Conversation threads
- ✅ Related help articles
- ✅ Email notifications (if configured)

### Admin Features
- ✅ View all tickets
- ✅ Assign tickets to staff
- ✅ Change status/priority
- ✅ Internal notes
- ✅ Export to CSV
- ✅ Analytics dashboard
- ✅ Response time tracking

### System Features
- ✅ Auto-screenshot capture
- ✅ Browser info collection
- ✅ Page URL tracking
- ✅ ML-powered insights
- ✅ Knowledge gap detection
- ✅ Automated recommendations

---

## 🎉 Deployment Complete!

Once all checks pass, the support ticketing system is live and ready to use.

**Next steps:**
1. Train support team on new system
2. Create internal documentation
3. Set up email notifications (optional)
4. Configure SLA rules (optional)
5. Create canned responses (optional)

---

## Version

**System Version:** 2.0.0
**Deployment Date:** 2026-01-19
**Deployed By:** Claude Code Assistant
