import express from 'express';
import cors from 'cors';
import conversationRoutes from './routes/conversations.js';
import messageRoutes from './routes/messages.js';
import templateRoutes from './routes/templates.js';
import webhookRoutes from './routes/webhooks.js';
import activityRoutes from './routes/activities.js';

const app = express();
const PORT = process.env.PORT || 3012;

// Middleware - CORS with explicit origins
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://crm.pandaadmin.com',
    'https://crm.pandaexteriors.com',
    'https://bamboo.pandaadmin.com'
  ],
  credentials: true,
}));
// Handle preflight OPTIONS requests
app.options('*', cors());
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
