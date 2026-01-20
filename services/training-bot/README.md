# Panda CRM Training Bot

AI-powered training assistant that guides users through the Panda CRM system.

## Features

### Training Bot Widget
- Floating "Need Help?" button on all pages
- Natural language chat interface
- Context-aware suggestions based on current page
- Step-by-step guides for common tasks
- Troubleshooting assistance
- Feedback collection

### First-Visit Onboarding Tour
- Automatic tour for new users
- Highlights key navigation elements
- Explains core concepts (Jobs as the hub, Attention Queue, etc.)
- Progress tracking (skips tour for returning users)
- Can be restarted from Settings > Preferences > Help & Training

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend Components                       │
├─────────────────────────────────────────────────────────────┤
│  TrainingBot.jsx    │  OnboardingTour.jsx  │  Settings.jsx  │
│  - Chat widget      │  - Guided tour       │  - Restart tour│
│  - API calls        │  - Highlight targets │               │
│  - Suggestions      │  - Step navigation   │               │
└─────────────────────┼──────────────────────┼───────────────┘
                      │                      │
                      ▼                      │
┌─────────────────────────────────────────────────────────────┐
│                    Training Bot Lambda                       │
├─────────────────────────────────────────────────────────────┤
│  POST /training-bot/chat        - Conversation with AI      │
│  GET  /training-bot/suggestions - Context-based suggestions │
│  GET  /training-bot/onboarding  - Tour configuration        │
│  POST /training-bot/feedback    - User feedback             │
└─────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    Knowledge Base                            │
├─────────────────────────────────────────────────────────────┤
│  - CRM feature documentation                                 │
│  - Navigation structure                                      │
│  - Common tasks step-by-step                                │
│  - Troubleshooting guides                                   │
│  - Role-based help                                          │
│  - Glossary of terms                                        │
└─────────────────────────────────────────────────────────────┘
```

## Deployment

### Lambda Function

```bash
# Deploy the Lambda
cd services/training-bot
./deploy.sh
```

### API Gateway

Add these routes to the existing API Gateway:

| Method | Path | Integration |
|--------|------|-------------|
| GET | /training-bot/health | Lambda: panda-crm-training-bot |
| POST | /training-bot/chat | Lambda: panda-crm-training-bot |
| GET | /training-bot/suggestions | Lambda: panda-crm-training-bot |
| GET | /training-bot/onboarding | Lambda: panda-crm-training-bot |
| POST | /training-bot/feedback | Lambda: panda-crm-training-bot |

Enable CORS for all endpoints.

### Frontend

The components are already integrated into the frontend:
- `TrainingBot.jsx` - Chat widget
- `OnboardingTour.jsx` - First-visit tour
- `Layout.jsx` - Renders both components

Build and deploy the frontend:
```bash
cd frontend
npm run build
# Deploy to S3/CloudFront or ECS
```

## API Endpoints

### POST /training-bot/chat

Send a message to the training bot.

**Request:**
```json
{
  "message": "How do I create a new lead?",
  "conversationHistory": [],
  "currentPath": "/leads",
  "userRole": "sales_rep"
}
```

**Response:**
```json
{
  "response": "**How to Create a New Lead**\n\n1. Click 'Leads' in the sidebar...",
  "suggestions": [
    "How do I convert a lead to a job?",
    "What happens after I save?"
  ],
  "relatedTopics": ["leads", "getting-started"],
  "actions": []
}
```

### GET /training-bot/suggestions?path=/jobs

Get context-aware suggestions for the current page.

**Response:**
```json
{
  "suggestions": [
    "What do the job stages mean?",
    "How do I move a job to the next stage?",
    "How do I filter by my jobs only?"
  ]
}
```

### GET /training-bot/onboarding

Get the onboarding tour configuration.

**Response:**
```json
{
  "tour": [
    {
      "id": "welcome",
      "title": "Welcome to Panda CRM!",
      "content": "...",
      "position": "center"
    }
  ],
  "version": "1.0"
}
```

### POST /training-bot/feedback

Submit feedback on a response.

**Request:**
```json
{
  "responseId": "123456789",
  "helpful": true,
  "feedback": "Optional text feedback"
}
```

## Knowledge Base

The knowledge base (`src/knowledge-base.js`) contains:

### Features Documentation
- Leads Management
- Contacts Management
- Accounts (Properties)
- Jobs (Opportunities) - The Hub
- Schedule & Calendar
- Documents & PandaSign
- Quote Builder
- Work Orders
- Attention Queue
- Commissions
- Reports & Dashboards
- Campaigns (Bamboogli)
- Integrations

### Common Tasks
- How to Create a New Lead
- How to Convert a Lead to a Job
- How to Create and Send a Quote
- How to Schedule an Appointment
- How to Send an SMS

### Troubleshooting
- Can't find a record
- Quote not saving
- Calendar not loading
- Integration issues

### Role-Based Help
- Sales Rep focus areas and daily tasks
- Project Manager focus areas and daily tasks
- Call Center focus areas and daily tasks
- Admin focus areas and daily tasks

## Future Enhancements

1. **Claude API Integration** - Use Claude for more natural, contextual responses
2. **Video Tutorials** - Embed short video clips for complex features
3. **Interactive Walkthroughs** - Guide users through actual actions
4. **Analytics** - Track common questions to improve documentation
5. **Multi-language Support** - Translate responses for Spanish users
