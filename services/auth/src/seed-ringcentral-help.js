/**
 * Seed RingCentral/RingCX Help Documentation
 *
 * Creates help articles for RingCentral integration features
 * Run with: node seed-ringcentral-help.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ringCentralArticles = [
  {
    title: 'RingCentral Integration Overview',
    category: 'integrations',
    sourceFeature: 'ringcentral',
    summary: 'Introduction to RingCentral phone system and RingCX contact center integration in Panda CRM.',
    content: `# RingCentral Integration Overview

## What is RingCentral?

RingCentral is Panda Exteriors' unified communications platform that powers:

- **RingCentral MVP** - Business phone system (calls, voicemail, fax)
- **RingCX** - Contact center solution for outbound campaigns and inbound queues
- **RingSense AI** - AI-powered call analysis and insights

## Key Features

### Click-to-Call
Make calls directly from any phone number in Panda CRM. Simply click on a phone number and your RingCentral desk phone or softphone will initiate the call.

### Call Logging
All calls are automatically logged to the customer's activity timeline, including:
- Call duration
- Call direction (inbound/outbound)
- Recording link (if enabled)
- AI-generated summary (with RingSense)

### RingCX Outbound Campaigns
Run automated outbound calling campaigns for:
- Lead follow-up
- Appointment reminders
- Customer satisfaction surveys
- Marketing campaigns

### RingCX Inbound Queues
Manage inbound call queues with:
- Skills-based routing
- Queue statistics and monitoring
- Real-time agent status
- SLA tracking

### RingSense AI Analysis
Get AI-powered insights from calls:
- Automatic transcription
- Sentiment analysis
- Call summary generation
- Key topic extraction
- Action item detection

## Getting Started

1. **Connect Your Account** - Go to Settings → Integrations → RingCentral
2. **Authorize Access** - Log in with your RingCentral credentials
3. **Configure Preferences** - Set your default device and call handling options

## Permissions

Access to RingCentral features requires:
- **Basic Users**: Click-to-call, call logging
- **Call Center Agents**: RingCX queues and campaigns
- **Managers**: RingCX admin, reporting, AI analysis

## Support

For RingCentral issues:
- Check connection status at Settings → Integrations
- Contact IT for account access issues
- See related help articles for specific features`,
    published: true,
    featured: true,
  },
  {
    title: 'Setting Up RingCX Outbound Campaigns',
    category: 'contact-center',
    sourceFeature: 'ringcentral-campaigns',
    summary: 'Learn how to create and manage outbound calling campaigns using RingCX.',
    content: `# Setting Up RingCX Outbound Campaigns

## Overview

RingCX outbound campaigns automate the process of contacting leads and customers. Campaigns can be used for:
- New lead follow-up
- Appointment confirmations
- Re-engagement campaigns
- Survey collection

## Prerequisites

Before creating a campaign:
- Must have RingCX Manager role or higher
- At least one dial group must exist
- Lead list prepared with valid phone numbers

## Creating a Campaign

### Step 1: Access Campaign Management
Navigate to **Admin** → **RingCentral** → **Campaigns** tab.

### Step 2: Click "Create Campaign"
Click the **+ Create Campaign** button to open the campaign wizard.

### Step 3: Configure Basic Settings

| Field | Description |
|-------|-------------|
| **Campaign Name** | Descriptive name (e.g., "January Lead Follow-up") |
| **Dial Group** | Select the dial group for this campaign |
| **Campaign Type** | OUTBOUND for calling campaigns |
| **Start Date** | When the campaign should begin |
| **End Date** | When the campaign should end |

### Step 4: Configure Dialing Settings

| Setting | Description |
|---------|-------------|
| **Max Attempts** | Maximum call attempts per lead (recommended: 3-5) |
| **Retry Interval** | Time between retry attempts (minutes) |
| **Answering Machine** | How to handle voicemails (leave message, skip, etc.) |

### Step 5: Save and Activate
Click **Save Campaign** to create it in draft mode. When ready, click **Start Campaign** to activate.

## Adding Leads to a Campaign

### Manual Upload
1. Click **Upload Leads** in the campaign detail view
2. Select a CSV file with columns: firstName, lastName, phone, email
3. Map the columns to campaign fields
4. Click **Import**

### CRM Sync
1. Create a lead filter in Panda CRM
2. Click **Sync to RingCX** in the campaign
3. Select your saved filter
4. Leads matching the filter are added automatically

## Campaign Controls

| Action | Description |
|--------|-------------|
| **Start** | Activate the campaign - agents can receive calls |
| **Pause** | Temporarily stop dialing - agents finish current calls |
| **Stop** | End the campaign - no more calls |
| **Resume** | Restart a paused campaign |

## Monitoring Campaign Progress

The campaign dashboard shows:
- **Total Leads** - Number of leads in the campaign
- **Dialed** - Leads that have been called
- **Connected** - Successful connections
- **Pending** - Leads waiting to be called
- **Completed** - Leads with final disposition

## Best Practices

1. **Test First** - Run a small test before full launch
2. **Optimal Hours** - Schedule during business hours (9 AM - 6 PM)
3. **Compliance** - Follow TCPA and state calling regulations
4. **Scripts** - Provide agents with call scripts
5. **Monitor** - Check statistics regularly and adjust as needed

## Troubleshooting

**Campaign not dialing?**
- Check that campaign status is "Active"
- Verify dial group has available agents
- Ensure leads have valid phone numbers

**Low connect rates?**
- Review calling hours
- Check phone number quality
- Consider time zone adjustments`,
    published: true,
    featured: false,
  },
  {
    title: 'RingCX Inbound Queue Management',
    category: 'contact-center',
    sourceFeature: 'ringcentral-queues',
    summary: 'How to set up and monitor RingCX inbound call queues (gates) for customer service.',
    content: `# RingCX Inbound Queue Management

## Overview

RingCX inbound queues (called "gates") route incoming customer calls to available agents based on skills and availability. This ensures customers reach the right department quickly.

## Key Concepts

### Gates
A gate is an inbound queue that customers call into. Each gate has:
- A dedicated phone number
- Routing rules
- Agent assignments
- Queue settings (hold music, announcements)

### Skills
Skills define agent capabilities (e.g., "Spanish", "Insurance Claims", "Technical Support"). Gates can require specific skills.

### Agent Groups
Agents are organized into groups for easier management. Groups can be assigned to multiple gates.

## Viewing Queue Statistics

### Access Queue Dashboard
Navigate to **Admin** → **RingCentral** → **Inbound Queues** tab.

### Real-Time Metrics

| Metric | Description |
|--------|-------------|
| **Calls in Queue** | Number of callers currently waiting |
| **Avg Wait Time** | Average time callers wait before answer |
| **Agents Available** | Number of agents ready to take calls |
| **Service Level** | Percentage of calls answered within target time |
| **Abandonment Rate** | Percentage of callers who hung up before answer |

### Agent Status

| Status | Meaning |
|--------|---------|
| **Available** | Ready to receive calls |
| **On Call** | Currently handling a call |
| **After Call Work** | Completing post-call tasks |
| **Unavailable** | Temporarily away (break, meeting) |
| **Offline** | Not logged in |

## Managing Agents

### Assigning Agents to Queues
1. Go to **Agent Management** in the RingCentral admin
2. Select an agent
3. Check the queues they should handle
4. Set their skill levels

### Monitoring Agent Performance
View individual agent statistics:
- Calls handled today
- Average handle time
- After call work time
- Availability percentage

## Queue Settings

### Call Routing
- **Round Robin** - Distributes calls evenly
- **Skills-Based** - Routes to agent with matching skills
- **Longest Idle** - Routes to agent waiting longest

### Queue Overflow
Configure what happens when queue is full:
- Transfer to backup queue
- Send to voicemail
- Play busy message

### Hold Experience
- Upload custom hold music
- Configure periodic announcements
- Set estimated wait time messages

## Best Practices

1. **Staff Appropriately** - Monitor queue depth and adjust staffing
2. **Set Realistic SLAs** - Target 80% of calls answered in 20 seconds
3. **Train Agents** - Ensure agents have skills for assigned queues
4. **Monitor Abandonment** - High abandonment indicates staffing issues
5. **Review Reports** - Check weekly/monthly trends

## Troubleshooting

**Long wait times?**
- Check agent availability
- Review call volume trends
- Consider adding agents or adjusting schedules

**Calls not routing?**
- Verify gate is active
- Check agent assignments
- Review skill requirements`,
    published: true,
    featured: false,
  },
  {
    title: 'Using RingSense AI Call Analysis',
    category: 'integrations',
    sourceFeature: 'ringcentral-ai',
    summary: 'How to access and use AI-powered call analysis with RingSense integration.',
    content: `# Using RingSense AI Call Analysis

## Overview

RingSense AI automatically analyzes recorded calls to provide:
- Call transcriptions
- Sentiment analysis
- Key topics and keywords
- Call summaries
- Action items and next steps

## Enabling RingSense

RingSense AI is enabled organization-wide. To use it:
1. Calls must be recorded
2. Your role must have RingSense access
3. Allow 5-15 minutes after call ends for analysis

## Accessing AI Analysis

### From Activity Timeline
1. Open an opportunity or contact record
2. Go to the **Activity** tab
3. Find the call entry
4. Click **View AI Analysis**

### From Call Logs
1. Go to **Admin** → **RingCentral** → **Call Logs**
2. Find the call
3. Click the **AI** icon to view analysis

### From RingCX Dashboard
For campaign calls:
1. Open the campaign
2. Click on a completed call
3. View AI insights in the detail panel

## Understanding AI Insights

### Transcription
Full text transcription of the call with speaker identification:
\`\`\`
Agent: Good afternoon, this is Sarah from Panda Exteriors.
Customer: Hi, I got some storm damage on my roof last week.
Agent: I'm sorry to hear that. Can you tell me more about the damage?
\`\`\`

### Sentiment Analysis
Overall sentiment score and breakdown:
- **Positive** (green) - Customer expressed satisfaction
- **Neutral** (gray) - Standard business conversation
- **Negative** (red) - Customer expressed frustration

### Key Topics
Automatically detected topics discussed:
- Roof damage
- Insurance claim
- Scheduling inspection
- Pricing questions

### Call Summary
AI-generated summary of the call:
> "Customer called about storm damage to roof. Agent gathered details about the damage (missing shingles on north side) and scheduled an inspection for Thursday at 2 PM. Customer mentioned they've already filed an insurance claim with State Farm."

### Action Items
Detected follow-up items:
- [ ] Schedule inspection - Thursday 2 PM
- [ ] Send insurance claim documentation
- [ ] Follow up after adjuster visit

## Using AI Insights

### Sales Coaching
- Review top performers' calls for training
- Identify improvement areas for agents
- Track sentiment trends

### Quality Assurance
- Spot-check calls for compliance
- Verify key disclosures were made
- Review escalation handling

### Customer Intelligence
- Understand common concerns
- Track competitor mentions
- Identify product feedback

## AI Analysis in Reports

### Sentiment Trends Report
View sentiment over time:
- By agent
- By campaign
- By time period

### Topic Analysis
See most common topics:
- What customers ask about
- Common objections
- Frequently mentioned competitors

## Best Practices

1. **Review Daily** - Check AI insights for important calls
2. **Tag Calls** - Mark notable calls for team review
3. **Use for Training** - Share good examples with team
4. **Act on Insights** - Follow up on detected action items
5. **Monitor Trends** - Track sentiment over time

## Privacy & Compliance

- Recordings are stored securely
- AI analysis is internal only
- Customers are notified of recording (where required)
- Transcripts can be deleted if requested`,
    published: true,
    featured: false,
  },
  {
    title: 'Click-to-Call with RingCentral',
    category: 'contact-center',
    sourceFeature: 'ringcentral-click-to-call',
    summary: 'How to use click-to-call functionality to make calls directly from Panda CRM.',
    content: `# Click-to-Call with RingCentral

## Overview

Click-to-call lets you make phone calls directly from Panda CRM by clicking on any phone number. The call is placed through your RingCentral account using your desk phone, mobile app, or softphone.

## Setup

### Connect Your Account
1. Go to **Settings** → **Integrations**
2. Find **RingCentral** section
3. Click **Connect RingCentral**
4. Log in with your RingCentral credentials
5. Grant permission to Panda CRM

### Choose Your Device
After connecting, select your preferred calling device:
- **Desk Phone** - Use your physical office phone
- **Softphone** - Use RingCentral app on computer
- **Mobile App** - Use RingCentral app on your phone

## Making Calls

### From Any Phone Number
1. Hover over any phone number in CRM
2. Click the phone icon that appears
3. Your selected device will ring
4. Pick up to connect to the customer

### From Contact/Lead Records
1. Open the contact or lead
2. Click the phone number in the header
3. Or click the **Call** button

### From Activity Timeline
1. Find a previous call in the timeline
2. Click **Call Again** to redial

## During the Call

### Call Widget
When on a call, a widget appears showing:
- Customer name and number
- Call duration
- Hold/Transfer buttons
- Notes field

### Taking Notes
- Type notes during the call
- Notes are saved to the activity log
- Can add tags for follow-up

### Transfer Options
- **Blind Transfer** - Send directly to another extension
- **Warm Transfer** - Talk to recipient first
- **Send to Voicemail** - Route to someone's voicemail

## After the Call

### Call Logging
Calls are automatically logged with:
- Date and time
- Duration
- Direction (inbound/outbound)
- Recording link (if enabled)
- Notes you entered

### AI Analysis
If RingSense is enabled:
- Transcription generated automatically
- Summary and sentiment added
- Action items detected

### Follow-Up
- Create a task from the call
- Schedule next contact
- Update lead/opportunity status

## Troubleshooting

**Not ringing your phone?**
- Check your device selection in Settings
- Verify RingCentral connection is active
- Ensure your device is online

**Wrong caller ID showing?**
- Contact IT to configure outbound caller ID
- Check RingCentral admin settings

**Call quality issues?**
- Check internet connection
- Close bandwidth-heavy applications
- Try using desk phone instead of softphone

## Tips

1. **Use Headset** - Better audio quality for softphone
2. **Update Notes** - Add notes immediately while fresh
3. **Check Status** - Ensure you're "Available" in RingCentral
4. **Log Out** - Sign out of RingCentral when done for the day`,
    published: true,
    featured: false,
  },
];

async function seedRingCentralHelp() {
  console.log('Seeding RingCentral help articles...\n');

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const article of ringCentralArticles) {
    try {
      // Check if article already exists by sourceFeature and title
      const existing = await prisma.helpArticle.findFirst({
        where: {
          OR: [
            { sourceFeature: article.sourceFeature },
            { title: article.title },
          ],
        },
      });

      if (existing) {
        // Update existing article
        await prisma.helpArticle.update({
          where: { id: existing.id },
          data: {
            title: article.title,
            category: article.category,
            summary: article.summary,
            content: article.content,
            published: article.published,
            featured: article.featured,
            sourceFeature: article.sourceFeature,
            updatedAt: new Date(),
          },
        });
        console.log(`✓ Updated: ${article.title}`);
        updated++;
      } else {
        // Create new article
        await prisma.helpArticle.create({
          data: {
            title: article.title,
            category: article.category,
            summary: article.summary,
            content: article.content,
            published: article.published,
            featured: article.featured,
            aiGenerated: false,
            sourceFeature: article.sourceFeature,
            views: 0,
            helpful: 50,
          },
        });
        console.log(`✓ Created: ${article.title}`);
        created++;
      }
    } catch (error) {
      console.error(`✗ Error with "${article.title}":`, error.message);
      skipped++;
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log('SUMMARY');
  console.log('═'.repeat(50));
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped/Errors: ${skipped}`);
  console.log(`Total articles: ${ringCentralArticles.length}`);
}

seedRingCentralHelp()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
