import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import conversationRoutes from './routes/conversations.js';
import messageRoutes from './routes/messages.js';
import templateRoutes from './routes/templates.js';
import webhookRoutes from './routes/webhooks.js';
import activityRoutes from './routes/activities.js';
import settingsRoutes from './routes/settings.js';
import automationRoutes from './routes/automations.js';
import campaignRoutes from './routes/campaigns.js';

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3012;

// CORS configuration - define once and reuse
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://crm.pandaadmin.com',
    'https://crm.pandaexteriors.com',
    'https://bamboo.pandaadmin.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
};

// Handle preflight OPTIONS requests FIRST
app.options('*', cors(corsOptions));
// Then apply CORS to all routes
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true })); // For Twilio webhooks

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'bamboogli' });
});

// Routes
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/message-templates', templateRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/bamboogli/settings', settingsRoutes);
app.use('/api/automations', automationRoutes);
app.use('/api/campaigns', campaignRoutes);

// Error handling
app.use((err, req, res, next) => {
  console.error('Bamboogli Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// Initialize default SMS templates on startup
const initializeDefaultTemplates = async () => {
  try {
    const defaultSmsTemplates = [
      {
        name: 'Appointment Reminder',
        type: 'SMS',
        category: 'APPOINTMENT',
        body: 'Hi {!Contact.FirstName}, this is a reminder about your upcoming appointment. Reply to confirm or call us to reschedule.',
        variables: ['Contact.FirstName'],
        isActive: true,
        isSystem: true,
      },
      {
        name: 'Project Update',
        type: 'SMS',
        category: 'PROJECT',
        body: 'Hi {!Contact.FirstName}, quick update on {!Opportunity.Name}: Questions? Reply to this message.',
        variables: ['Contact.FirstName', 'Opportunity.Name'],
        isActive: true,
        isSystem: true,
      },
      {
        name: 'Payment Reminder',
        type: 'SMS',
        category: 'BILLING',
        body: 'Hi {!Contact.FirstName}, friendly reminder that your balance of ${!Opportunity.Amount} is due soon. Questions? Reply here.',
        variables: ['Contact.FirstName', 'Opportunity.Amount'],
        isActive: true,
        isSystem: true,
      },
      {
        name: 'Thank You',
        type: 'SMS',
        category: 'GENERAL',
        body: 'Thank you for choosing {!Account.Name}! We appreciate your business. Let us know if you have any questions.',
        variables: ['Account.Name'],
        isActive: true,
        isSystem: true,
      },
      {
        name: 'Follow Up',
        type: 'SMS',
        category: 'SALES',
        body: 'Hi {!Contact.FirstName}, just following up on {!Opportunity.Name}. Let me know if you have any questions!',
        variables: ['Contact.FirstName', 'Opportunity.Name'],
        isActive: true,
        isSystem: true,
      },
      {
        name: 'Appointment Confirmation',
        type: 'SMS',
        category: 'APPOINTMENT',
        body: 'Hi {!Contact.FirstName}, your appointment has been confirmed for {!Appointment.Date} at {!Appointment.Time}. See you then!',
        variables: ['Contact.FirstName', 'Appointment.Date', 'Appointment.Time'],
        isActive: true,
        isSystem: true,
      },
      {
        name: 'On My Way',
        type: 'SMS',
        category: 'FIELD_SERVICE',
        body: 'Hi {!Contact.FirstName}, our team is on the way to your location. Expected arrival in approximately {!ETA} minutes.',
        variables: ['Contact.FirstName', 'ETA'],
        isActive: true,
        isSystem: true,
      },
      {
        name: 'Job Complete',
        type: 'SMS',
        category: 'FIELD_SERVICE',
        body: 'Hi {!Contact.FirstName}, your project is complete! We hope you love the results. Please let us know if you have any questions.',
        variables: ['Contact.FirstName'],
        isActive: true,
        isSystem: true,
      },
      {
        name: 'Quote Ready',
        type: 'SMS',
        category: 'SALES',
        body: 'Hi {!Contact.FirstName}, your quote for {!Opportunity.Name} is ready! Check your email or call us to discuss.',
        variables: ['Contact.FirstName', 'Opportunity.Name'],
        isActive: true,
        isSystem: true,
      },
      {
        name: 'Reschedule Request',
        type: 'SMS',
        category: 'APPOINTMENT',
        body: 'Hi {!Contact.FirstName}, we need to reschedule your appointment. Please reply with your availability or call us.',
        variables: ['Contact.FirstName'],
        isActive: true,
        isSystem: true,
      },
    ];

    // Check which templates already exist
    const existingTemplates = await prisma.messageTemplate.findMany({
      where: { isSystem: true, type: 'SMS' },
      select: { name: true },
    });
    const existingNames = new Set(existingTemplates.map(t => t.name));

    // Insert only new templates
    const newTemplates = defaultSmsTemplates.filter(t => !existingNames.has(t.name));

    if (newTemplates.length > 0) {
      await prisma.messageTemplate.createMany({
        data: newTemplates,
        skipDuplicates: true,
      });
      console.log(`Initialized ${newTemplates.length} default SMS templates`);
    } else {
      console.log('Default SMS templates already exist');
    }
  } catch (error) {
    console.error('Failed to initialize default SMS templates:', error);
  }
};

app.listen(PORT, () => {
  console.log(`Bamboogli messaging service running on port ${PORT}`);
  initializeDefaultTemplates();
});

export default app;
