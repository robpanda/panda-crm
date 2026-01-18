# AI-Powered Communications Feature

This document describes the AI-powered activity feed with @mentions feature implemented for Panda CRM.

## Overview

The AI Communications feature enhances the job activity feed with:
- **AI-powered summaries** of job activity using ChatGPT (GPT-4 mini)
- **@mention support** for notifying team members
- **AI-driven suggestions** for next steps and who to notify
- **Smart message drafting** to help users communicate updates

## Architecture

### Backend Services

#### 1. Integrations Service (`services/integrations`)

**New Files:**
- `src/services/openaiService.js` - OpenAI API integration
- `src/routes/ai.js` - AI API endpoints

**API Endpoints:**
- `POST /api/integrations/ai/activity-summary` - Generate AI summary
- `POST /api/integrations/ai/next-steps` - Get AI suggestions
- `POST /api/integrations/ai/draft-message` - Generate draft messages

**Environment Variables:**
```bash
OPENAI_API_KEY=sk-proj-rkuosr4Symz_...
OPENAI_PROJECT_ID=proj_rmR3DUh00G2TZJG0qhJNWXJe
```

#### 2. Opportunities Service (`services/opportunities`)

**Modified Files:**
- `src/services/opportunityService.js` - Enhanced `addJobMessage()` with @mention support
- `src/routes/opportunities.js` - Updated `POST /:id/messages` endpoint

**Features:**
- Accepts `mentionedUsers` array in message creation
- Creates `MENTION` type notifications automatically
- Fire-and-forget notification creation for performance

### Frontend

#### 1. ActivityFeed Component (`frontend/src/components/ActivityFeed.jsx`)

**Features:**
- AI Summary Card (auto-generated at top of feed)
- Share an Update Composer with:
  - @mention autocomplete (type @ to see team members)
  - AI Assist button for suggestions
  - Selected mentions shown as chips
- AI Suggestions Panel showing:
  - Next steps based on workflow stage
  - Suggested @mentions with reasoning
  - Draft message you can apply
- Activity Timeline (notes, tasks, events)

#### 2. API Integration (`frontend/src/services/api.js`)

**New Export:**
```javascript
export const integrationsApi = {
  generateActivitySummary(data),
  generateNextSteps(data),
  generateDraftMessage(data),
}
```

#### 3. OpportunityDetail Page (`frontend/src/pages/OpportunityDetail.jsx`)

**Changes:**
- Imports `ActivityFeed` component
- Replaced simple activity tab with full `<ActivityFeed />` component
- Passes opportunity data and refresh callback

## Database Schema

Uses existing Prisma schema:

### Notification Model
```prisma
model Notification {
  type     NotificationType  // includes MENTION
  title    String
  message  String
  userId   String            // recipient
  opportunityId String?
  sourceType String?          // "mention"
  sourceId   String?          // note.id
  status   NotificationStatus // UNREAD, READ, ARCHIVED
  // ... delivery channels (email, SMS, push)
}
```

### Note Model
```prisma
model Note {
  title String?
  body  String
  opportunityId String?
  createdById   String
  // ... relations
}
```

## Deployment

### Prerequisites
1. Fresh AWS credentials configured
2. Docker installed and running
3. Access to AWS Secrets Manager

### Deployment Steps

#### Option 1: Full Automated Deployment
```bash
cd /Users/Brian\ 1/Documents/panda-crm
./scripts/deploy-ai-communications.sh
```

This script runs:
1. `setup-openai-secret.sh` - Stores API key in AWS Secrets Manager
2. `deploy-integrations-with-ai.sh` - Builds and deploys integrations service
3. `deploy-opportunities-with-mentions.sh` - Builds and deploys opportunities service

#### Option 2: Step-by-Step Deployment

**Step 1: Setup OpenAI Secret**
```bash
./scripts/setup-openai-secret.sh
```

**Step 2: Deploy Integrations Service**
```bash
./scripts/deploy-integrations-with-ai.sh
```

**Step 3: Deploy Opportunities Service**
```bash
./scripts/deploy-opportunities-with-mentions.sh
```

**Step 4: Deploy Frontend**
Frontend deploys automatically via GitHub Actions when changes are pushed to `main` branch.

Modified files:
- `frontend/src/components/ActivityFeed.jsx`
- `frontend/src/pages/OpportunityDetail.jsx`
- `frontend/src/services/api.js`

Commit and push these changes to trigger deployment.

## Usage

### For End Users

1. Navigate to any job: `https://crm.pandaadmin.com/jobs/[job-id]`
2. Click the **Activity** tab
3. See AI summary at the top (auto-generated)
4. Use **Share an Update** to post messages:
   - Type `@` to mention team members
   - Click **AI Assist** for suggestions
   - Post update to notify mentioned users

### For Developers

#### Generate AI Summary
```javascript
const response = await integrationsApi.generateActivitySummary({
  activities: [...],  // recent notes, tasks, events
  opportunity: { name, stage, type, status },
  context: { ... }
});
// Returns: { summary: "AI-generated summary text" }
```

#### Get AI Suggestions
```javascript
const response = await integrationsApi.generateNextSteps({
  opportunity: { name, stage, type },
  activities: [...],
  teamMembers: [...]
});
// Returns: {
//   nextSteps: ["Action 1", "Action 2"],
//   suggestedMentions: [{userId, reason}, ...],
//   draftMessage: "Suggested message text"
// }
```

#### Post Message with @Mentions
```javascript
await opportunitiesApi.post(`/${opportunityId}/messages`, {
  message: "Update text with @mentions",
  mentionedUsers: ["user-id-1", "user-id-2"]
});
// Automatically creates MENTION notifications for users
```

## AI Prompts

### Activity Summary Prompt
```
Summarize the current status and recent activity for this roofing job:

Job: [name]
Stage: [stage]
Type: [type]
Status: [status]

Recent Activity:
[activity items]

Provide a 2-3 sentence summary highlighting: current progress, any blockers
or issues mentioned, and what appears to be the next step in the workflow.
```

### Next Steps Prompt
```
Analyze this roofing job and suggest next steps:

Job: [name]
Stage: [stage]
Type: [type]

Recent Activity:
[activity items]

Available Team Members:
[team members with roles]

Common workflow stages: LEAD_ASSIGNED → SCHEDULED → INSPECTED → CLAIM_FILED
→ APPROVED → CONTRACT_SIGNED → IN_PRODUCTION → COMPLETED

Return JSON with:
- nextSteps: array of 2-3 specific action items based on current stage
- suggestedMentions: array of {userId, reason} for team members who should be notified
- draftMessage: a brief update message (1-2 sentences) announcing next steps
```

### Draft Message Prompt
```
Draft a professional internal update message for this roofing job:

Job: [name]
Stage: [stage]

User's intent or partial message: "[user input]"

Recent context:
[recent activity]

Write a clear, professional message (1-2 sentences) that communicates the
update or next step. Do not include @mentions in the draft.
```

## Configuration

### OpenAI Settings
- **Model**: `gpt-4o-mini` (fast, cost-effective)
- **Temperature**: 0.3-0.5 (balanced between consistency and creativity)
- **Max Tokens**: 200-500 (concise responses)

### Secret Storage
AWS Secrets Manager secret: `panda-crm/openai`
```json
{
  "apiKey": "sk-proj-...",
  "projectId": "proj_rmR3DUh00G2TZJG0qhJNWXJe"
}
```

## Testing

### Manual Testing
1. Go to https://crm.pandaadmin.com/jobs/[any-job-id]?tab=activity
2. Verify AI summary appears at top
3. Click "Share an Update"
4. Type "@" and verify autocomplete shows team members
5. Click "AI Assist" and verify suggestions appear
6. Post an update with @mention
7. Check that mentioned user receives notification

### API Testing
```bash
# Test AI summary
curl -X POST https://bamboo.pandaadmin.com/api/integrations/ai/activity-summary \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "activities": [...],
    "opportunity": {...}
  }'

# Test message with @mention
curl -X POST https://bamboo.pandaadmin.com/api/opportunities/[id]/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Update text",
    "mentionedUsers": ["user-id"]
  }'
```

## Monitoring

### Logs
- Integrations service: Check ECS logs for OpenAI API calls
- Opportunities service: Check for "mention notifications" in logs

### Metrics to Track
- OpenAI API usage (tokens, requests)
- @mention notification delivery rate
- User engagement with AI suggestions

## Cost Estimation

### OpenAI API Costs (GPT-4o-mini)
- Input: $0.150 per 1M tokens
- Output: $0.600 per 1M tokens

**Estimated usage per activity view:**
- Activity summary: ~500 input tokens, ~100 output tokens
- Next steps: ~300 input tokens, ~200 output tokens
- Cost per view: ~$0.0003 (0.03 cents)

**Monthly estimate (1000 active users, 10 views/day):**
- 300,000 views/month × $0.0003 = **~$90/month**

## Future Enhancements

### Pending Features
1. **@Mention Highlighting** - Parse and style @mentions in activity timeline
2. **Permissions** - Add visibility controls for internal vs external updates
3. **Email Notifications** - Send emails for @mentions (currently in-app only)
4. **Push Notifications** - Mobile push for @mentions
5. **Smart Suggestions** - Use job history to improve AI recommendations
6. **Batch Summaries** - Daily digest of all job activities

### Potential Improvements
- Cache AI summaries to reduce API calls
- Add feedback loop (thumbs up/down on suggestions)
- Support file attachments in updates
- Add @channel or @team mentions for groups
- Integration with external chat platforms (Slack, Teams)

## Troubleshooting

### AI Summary Not Appearing
1. Check OpenAI API key is configured in Secrets Manager
2. Verify integrations service can access the secret
3. Check integrations service logs for API errors
4. Ensure OPENAI_PROJECT_ID is set correctly

### @Mentions Not Creating Notifications
1. Verify opportunities service is updated to latest version
2. Check database for Notification records with type='MENTION'
3. Review opportunities service logs for notification creation

### Frontend Errors
1. Check browser console for API errors
2. Verify integrationsApi is exported from api.js
3. Confirm ActivityFeed component is imported correctly

## Support

For issues or questions:
1. Check service logs in AWS CloudWatch
2. Review database for notification records
3. Test API endpoints directly with curl
4. Contact development team

---

**Version**: 1.0
**Last Updated**: 2026-01-18
**Author**: Claude Code Assistant
**Status**: Ready for Deployment
