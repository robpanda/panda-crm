import express from 'express';
import cors from 'cors';
import conversationRoutes from './routes/conversations.js';
import messageRoutes from './routes/messages.js';
import templateRoutes from './routes/templates.js';
import webhookRoutes from './routes/webhooks.js';
import activityRoutes from './routes/activities.js';
import settingsRoutes from './routes/settings.js';
import automationRoutes from './routes/automations.js';
import campaignRoutes from './routes/campaigns.js';

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

app.listen(PORT, () => {
  console.log(`Bamboogli messaging service running on port ${PORT}`);
});

export default app;
