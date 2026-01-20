import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Default categories
const defaultCategories = [
  { id: 'getting-started', name: 'Getting Started', icon: 'Book', color: 'bg-blue-500', count: 0 },
  { id: 'contact-center', name: 'Contact Center', icon: 'Phone', color: 'bg-green-500', count: 0 },
  { id: 'scheduling', name: 'Scheduling & Dispatch', icon: 'Calendar', color: 'bg-purple-500', count: 0 },
  { id: 'sales', name: 'Sales & Opportunities', icon: 'Briefcase', color: 'bg-orange-500', count: 0 },
  { id: 'commissions', name: 'Commissions', icon: 'DollarSign', color: 'bg-yellow-500', count: 0 },
  { id: 'field-service', name: 'Field Service', icon: 'Users', color: 'bg-indigo-500', count: 0 },
  { id: 'admin', name: 'Administration', icon: 'Settings', color: 'bg-red-500', count: 0 },
  { id: 'integrations', name: 'Integrations', icon: 'Shield', color: 'bg-teal-500', count: 0 },
];

// Feature-to-category mapping for AI generation
const featureCategoryMap = {
  'scheduling': 'scheduling',
  'schedule': 'scheduling',
  'appointment': 'scheduling',
  'dispatch': 'scheduling',
  'calendar': 'scheduling',
  'lead': 'sales',
  'opportunity': 'sales',
  'quote': 'sales',
  'account': 'sales',
  'contact': 'contact-center',
  'call': 'contact-center',
  'phone': 'contact-center',
  'commission': 'commissions',
  'payment': 'commissions',
  'workorder': 'field-service',
  'service': 'field-service',
  'technician': 'field-service',
  'crew': 'field-service',
  'integration': 'integrations',
  'quickbooks': 'integrations',
  'twilio': 'integrations',
  'user': 'admin',
  'role': 'admin',
  'permission': 'admin',
  'workflow': 'admin',
};

// Optional auth middleware - allows unauthenticated access but provides user if authenticated
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authMiddleware(req, res, next);
  }
  next();
};

// Get all help articles (public - no auth required for published articles)
router.get('/articles', optionalAuth, async (req, res) => {
  try {
    const includeUnpublished = req.query.includeUnpublished === 'true' && req.user;
    const category = req.query.category;

    let articles = await prisma.help_articles.findMany({
      where: {
        ...(includeUnpublished ? {} : { published: true }),
        ...(category && category !== 'all' ? { category } : {}),
      },
      orderBy: [
        { featured: 'desc' },
        { views: 'desc' },
        { updated_at: 'desc' },
      ],
    });

    res.json({
      articles: articles || [],
      total: articles?.length || 0,
    });
  } catch (error) {
    console.error('Failed to get help articles:', error);
    res.json({ articles: [], total: 0 });
  }
});

// Get single article
router.get('/articles/:id', optionalAuth, async (req, res) => {
  try {
    const article = await prisma.help_articles.findUnique({
      where: { id: req.params.id },
    });

    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    // Only return unpublished articles to authenticated users
    if (!article.published && !req.user) {
      return res.status(404).json({ error: 'Article not found' });
    }

    // Increment view count
    await prisma.help_articles.update({
      where: { id: req.params.id },
      data: { views: { increment: 1 } },
    });

    res.json({ article });
  } catch (error) {
    console.error('Failed to get article:', error);
    res.status(500).json({ error: 'Failed to get article' });
  }
});

// Get categories with article counts
router.get('/categories', async (req, res) => {
  try {
    // Get article counts per category
    const counts = await prisma.help_articles.groupBy({
      by: ['category'],
      where: { published: true },
      _count: true,
    });

    const countMap = counts.reduce((acc, c) => {
      acc[c.category] = c._count;
      return acc;
    }, {});

    const categories = defaultCategories.map(cat => ({
      ...cat,
      count: countMap[cat.id] || 0,
    }));

    res.json({ categories });
  } catch (error) {
    console.error('Failed to get categories:', error);
    res.json({ categories: defaultCategories });
  }
});

// Create new article (admin only)
router.post('/articles', authMiddleware, async (req, res) => {
  try {
    const { title, category, summary, content, published, featured, aiGenerated, sourceFeature } = req.body;

    const article = await prisma.help_articles.create({
      data: {
        title,
        category: category || 'getting-started',
        summary,
        content,
        published: published ?? false,
        featured: featured ?? false,
        ai_generated: aiGenerated ?? false,
        source_feature: sourceFeature || null,
        views: 0,
        helpful: 50,
        created_by_id: req.user?.id,
        updated_by_id: req.user?.id,
      },
    });

    res.status(201).json({ article });
  } catch (error) {
    console.error('Failed to create article:', error);
    res.status(500).json({ error: 'Failed to create article' });
  }
});

// Update article (admin only)
router.put('/articles/:id', authMiddleware, async (req, res) => {
  try {
    const { title, category, summary, content, published, featured, aiGenerated, sourceFeature } = req.body;

    const article = await prisma.help_articles.update({
      where: { id: req.params.id },
      data: {
        title,
        category,
        summary,
        content,
        published,
        featured,
        ai_generated: aiGenerated,
        source_feature: sourceFeature,
        updated_by_id: req.user?.id,
        updated_at: new Date(),
      },
    });

    res.json({ article });
  } catch (error) {
    console.error('Failed to update article:', error);
    res.status(500).json({ error: 'Failed to update article' });
  }
});

// Delete article (admin only)
router.delete('/articles/:id', authMiddleware, async (req, res) => {
  try {
    await prisma.help_articles.delete({
      where: { id: req.params.id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete article:', error);
    res.status(500).json({ error: 'Failed to delete article' });
  }
});

// Submit article feedback
router.post('/articles/:id/feedback', optionalAuth, async (req, res) => {
  try {
    const { helpful } = req.body;
    const articleId = req.params.id;

    // Get current article
    const article = await prisma.help_articles.findUnique({
      where: { id: articleId },
    });

    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    // Update helpful percentage (simplified calculation)
    const currentHelpful = article.helpful || 50;
    const newHelpful = helpful
      ? Math.min(100, currentHelpful + 1)
      : Math.max(0, currentHelpful - 1);

    await prisma.help_articles.update({
      where: { id: articleId },
      data: { helpful: newHelpful },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to submit feedback:', error);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

// Get recent code changes for AI documentation
router.get('/ai/recent-changes', authMiddleware, async (req, res) => {
  try {
    // In production, this would:
    // 1. Check git commits/PRs for new features
    // 2. Analyze component files for JSDoc comments
    // 3. Check for new routes/endpoints
    // 4. Identify undocumented features

    const changes = [
      {
        feature: 'Contact Center Scheduling',
        files: ['Schedule.jsx', 'schedulingController.js', 'serviceAppointmentController.js'],
        documented: false,
        type: 'scheduling',
        description: 'New scheduling workflows for contact center',
      },
      {
        feature: 'Inspector Reassignment',
        files: ['serviceAppointmentController.js', 'schedulingPolicyService.js'],
        documented: false,
        type: 'scheduling',
        description: 'Reassign appointments to different inspectors',
      },
      {
        feature: 'Dispatch Confirmation',
        files: ['Schedule.jsx', 'serviceAppointmentController.js'],
        documented: false,
        type: 'contact-center',
        description: 'Dispatch appointments and notify inspectors',
      },
    ];

    res.json({ changes });
  } catch (error) {
    console.error('Failed to get recent changes:', error);
    res.json({ changes: [] });
  }
});

// Generate documentation from code (AI)
router.post('/ai/generate', authMiddleware, async (req, res) => {
  try {
    const { analyzeCodeChanges, features } = req.body;

    // In production, this would use Claude API to generate documentation
    // For now, create documentation for Contact Center features

    const contactCenterFeatures = [
      {
        title: 'Scheduling an Initial Inspection',
        category: 'contact-center',
        sourceFeature: 'scheduling',
        summary: 'Learn how to schedule initial inspection appointments for homeowners.',
        content: generateArticleContent('scheduling-initial-inspection'),
      },
      {
        title: 'Dispatching Appointments to Inspectors',
        category: 'contact-center',
        sourceFeature: 'scheduling',
        summary: 'How to dispatch scheduled appointments and notify inspectors.',
        content: generateArticleContent('dispatching-appointments'),
      },
      {
        title: 'Reassigning Appointments to Different Inspectors',
        category: 'contact-center',
        sourceFeature: 'scheduling',
        summary: 'Steps to reassign an appointment to a different inspector.',
        content: generateArticleContent('reassigning-appointments'),
      },
      {
        title: 'Rescheduling Customer Appointments',
        category: 'contact-center',
        sourceFeature: 'scheduling',
        summary: 'How to reschedule an existing appointment to a new date/time.',
        content: generateArticleContent('rescheduling-appointments'),
      },
    ];

    let articlesCreated = 0;
    let articlesUpdated = 0;
    const generatedArticles = [];

    for (const feature of contactCenterFeatures) {
      // Check if article already exists
      const existing = await prisma.help_articles.findFirst({
        where: {
          source_feature: feature.sourceFeature,
          title: { contains: feature.title.split(' ').slice(0, 2).join(' ') },
        },
      });

      if (existing) {
        // Update existing article
        await prisma.help_articles.update({
          where: { id: existing.id },
          data: {
            content: feature.content,
            summary: feature.summary,
            last_ai_update: new Date(),
            updated_by_id: req.user?.id,
          },
        });
        articlesUpdated++;
      } else {
        // Create new article
        await prisma.help_articles.create({
          data: {
            title: feature.title,
            category: feature.category,
            summary: feature.summary,
            content: feature.content,
            published: false, // Draft by default for review
            featured: false,
            ai_generated: true,
            source_feature: feature.sourceFeature,
            views: 0,
            helpful: 50,
            created_by_id: req.user?.id,
            updated_by_id: req.user?.id,
          },
        });
        articlesCreated++;
        generatedArticles.push(feature.title);
      }
    }

    res.json({
      success: true,
      articlesCreated,
      articlesUpdated,
      generatedArticles,
      message: `Generated ${articlesCreated} new articles, updated ${articlesUpdated} existing articles`,
    });
  } catch (error) {
    console.error('AI generation failed:', error);
    res.status(500).json({ error: 'AI generation failed', details: error.message });
  }
});

// Helper function to generate article content
function generateArticleContent(type) {
  const templates = {
    'scheduling-initial-inspection': `# Scheduling an Initial Inspection

## Overview
This guide walks you through scheduling an initial inspection appointment in Panda CRM after converting a lead to a job.

## Before You Begin
Ensure the lead has been converted to an opportunity and has:
- Valid contact information
- Verified property address
- Confirmed homeowner status

## Steps

### Step 1: Find the Opportunity
Navigate to **Jobs** from the main menu. You can:
- Search by homeowner name in the search bar
- Use the "Lead Unassigned" filter to see new opportunities
- Check the Attention Queue for pending items

### Step 2: Open the Service Appointment
On the opportunity page, locate the **Appointments** section in the sidebar. Click on the auto-created service appointment for the initial inspection.

### Step 3: View Available Time Slots
The scheduling panel shows available time slots on the right. The system automatically ranks inspectors based on:
- **Proximity** - Distance from inspector's current location or home base
- **Skills** - Required certifications and experience level
- **Availability** - Open slots in their calendar
- **Workload** - Current number of assignments

### Step 4: Select Inspector and Time
Click on your preferred time slot. The system will highlight the best-matched inspector. You can:
- Accept the recommended inspector
- Click "Candidates" to see other available inspectors with scores
- Override the selection if needed

### Step 5: Confirm the Appointment
Click **Schedule** to confirm. The system will:
- Assign the selected inspector
- Update the opportunity stage to "Lead Assigned"
- Send confirmation to the customer (if auto-notify is enabled)
- Add the appointment to the inspector's calendar

### Step 6: Verify Completion
The opportunity stage should now show "Lead Assigned". Click "View Service Appointment" to confirm all details are correct.

## Tips
- Morning slots (8-10 AM) typically have higher show rates
- Allow 30-minute buffer between appointments for travel
- Check weather conditions before scheduling outdoor inspections
- For priority customers, use the "Expedited" flag to prioritize scheduling

## Troubleshooting

**No available slots showing?**
- Check if the service territory has active inspectors
- Verify the date range - try expanding it
- Ensure operating hours are configured correctly

**Wrong inspector assigned?**
- Use the Reassign function to change inspectors
- Check if the inspector has the required skills`,

    'dispatching-appointments': `# Dispatching Appointments to Inspectors

## Overview
Once an appointment is scheduled, it needs to be dispatched to notify the inspector and confirm they're ready for the job.

## When to Dispatch
Dispatch appointments:
- 24-48 hours before the scheduled time
- After confirming all job details are complete
- When the inspector's schedule is finalized

## Steps

### Step 1: Access Pending Dispatches
Go to **Jobs** and use the "Confirmations Pending" filter. This shows all scheduled appointments waiting to be dispatched.

### Step 2: Review Appointment Details
Click on the appointment to verify:
- Customer contact information is correct
- Property address is accurate
- Appointment date/time is confirmed
- Required equipment or materials are noted

### Step 3: Verify Inspector Assignment
Confirm the appointment shows:
- Status: "Scheduled" or "Lead Assigned"
- Assigned inspector name
- Correct date and time slot

### Step 4: Dispatch the Appointment
Click the **Change Status** button and select **"Dispatched"**.

### Step 5: What Happens Next
When you dispatch, the system will:
1. Send SMS notification to the inspector with job details
2. Send email with full appointment information
3. Update the inspector's mobile app/calendar
4. Optionally notify the customer of the dispatch
5. Log the dispatch action in the activity timeline

### Step 6: Monitor Confirmation
The inspector can:
- **Accept** - Confirms they'll be there
- **Request Reassignment** - If they have a conflict
- Check the appointment status for inspector response

## Bulk Dispatching
To dispatch multiple appointments at once:
1. Go to the Dispatch Board view
2. Select multiple appointments using checkboxes
3. Click **Bulk Actions** → **Dispatch Selected**

## Best Practices
- Dispatch at least 24 hours in advance when possible
- Include special instructions in the notes field
- Verify the inspector has acknowledged before the appointment`,

    'reassigning-appointments': `# Reassigning Appointments to Different Inspectors

## Overview
Sometimes you need to change the assigned inspector due to scheduling conflicts, call-outs, or customer requests.

## When to Reassign
Common scenarios:
- Inspector calls out sick
- Schedule conflict arises
- Customer requests a specific inspector
- Geographic optimization needed
- Skill requirements change

## Steps

### Step 1: Open the Service Appointment
Search for the opportunity and click on the service appointment that needs reassignment.

### Step 2: View Current Assignment
Note the currently assigned inspector and the appointment details.

### Step 3: Click Candidates
Click the **"Candidates"** button to see available inspectors. The list shows:
- Inspector name
- Availability score
- Distance from job site
- Skill match percentage
- Current workload

### Step 4: Review Available Inspectors
Each candidate is scored based on:
- **Territory Match** - Primary (100), Secondary (75), Other (50)
- **Skill Match** - Required skills met
- **Travel Distance** - Closer is better
- **Utilization** - Not overbooked

### Step 5: Select New Inspector
Click on your preferred inspector, then select an available time slot.

### Step 6: Confirm Reassignment
Click **"Schedule to [Inspector Name]"** and save the changes.

## Notifications
When you reassign:
- Original inspector receives cancellation notice
- New inspector receives assignment notification
- Customer is notified only if the time changes
- Activity is logged for audit trail

## Bulk Reassignment
If an inspector calls out for the day:
1. Go to **Schedule** → **Dispatch Board**
2. Filter by the absent inspector
3. Select all their appointments
4. Click **Bulk Actions** → **Reassign**
5. The system will find the best available alternatives

## Tips
- Try to keep the same inspector for follow-up visits
- Consider customer preferences when possible
- Document the reason for reassignment in notes`,

    'rescheduling-appointments': `# Rescheduling Customer Appointments

## Overview
Customers sometimes need to reschedule. Here's how to handle it efficiently while maintaining a good customer experience.

## Common Reasons for Rescheduling
- Customer scheduling conflict
- Weather conditions
- Inspector availability change
- Customer request for different time

## Steps

### Step 1: Find the Appointment
Search for the opportunity using the customer name or phone number. Click on the existing service appointment.

### Step 2: Review Current Details
Note the current:
- Date and time
- Assigned inspector
- Customer contact info
- Any special notes

### Step 3: Initiate Reschedule
Click the **"Book Appointment"** or **"Reschedule"** button.

### Step 4: Select New Time
Choose from available time slots. The system will:
- Show the same inspector's availability first
- Offer alternative inspectors if the original isn't available
- Highlight optimal times based on route efficiency

### Step 5: Confirm New Appointment
Review the changes and click **"Confirm Reschedule"**.

### Step 6: Customer Notification
The system will:
- Send SMS/email confirmation of new time
- Update the calendar invitation
- Log the reschedule in activity history

## Best Practices
- Offer 2-3 time options to customers
- Try to keep the same inspector for continuity
- Document the reason for rescheduling
- Same-day reschedules should be prioritized

## Rescheduling Fees/Policies
Check your company policy for:
- Notice requirements (24-hour notice, etc.)
- Rescheduling fees
- Maximum reschedules allowed

## What Gets Updated
When you reschedule:
- Service Appointment date/time
- Inspector calendar (if changed)
- Customer calendar invite
- Opportunity timeline activity
- Any related work orders`,
  };

  return templates[type] || `# ${type}\n\nDocumentation content will be generated here.`;
}

// Analyze code file for documentation
router.post('/ai/analyze-file', authMiddleware, async (req, res) => {
  try {
    const { filePath, fileContent } = req.body;

    // Extract documentation-relevant information
    const analysis = {
      components: [],
      functions: [],
      routes: [],
      props: [],
    };

    // Simple pattern matching (in production, use proper AST parsing)
    const componentMatches = fileContent.match(/export (?:default )?function (\w+)/g) || [];
    analysis.components = componentMatches.map(m => m.replace(/export (?:default )?function /, ''));

    const routeMatches = fileContent.match(/router\.(get|post|put|delete)\(['"]([^'"]+)['"]/g) || [];
    analysis.routes = routeMatches.map(m => {
      const [, method, path] = m.match(/router\.(\w+)\(['"]([^'"]+)['"]/) || [];
      return { method: method?.toUpperCase(), path };
    }).filter(r => r.method);

    const jsdocMatches = fileContent.match(/\/\*\*[\s\S]*?\*\//g) || [];
    analysis.jsdocs = jsdocMatches.length;

    // Determine category based on file path and content
    let suggestedCategory = 'getting-started';
    for (const [keyword, category] of Object.entries(featureCategoryMap)) {
      if (filePath.toLowerCase().includes(keyword) || fileContent.toLowerCase().includes(keyword)) {
        suggestedCategory = category;
        break;
      }
    }

    res.json({
      analysis,
      suggestedCategory,
      documentationNeeded: analysis.components.length > 0 || analysis.routes.length > 0,
    });
  } catch (error) {
    console.error('File analysis failed:', error);
    res.status(500).json({ error: 'File analysis failed' });
  }
});

export default router;
