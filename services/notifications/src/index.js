import express from 'express';
import cors from 'cors';
import { CronJob } from 'cron';
import notificationRoutes from './routes/notifications.js';
import preferenceRoutes from './routes/preferences.js';
import templateRoutes from './routes/templates.js';
import attentionRoutes from './routes/attention.js';
import { attentionService } from './services/attentionService.js';
import { notificationService } from './services/notificationService.js';

const app = express();
const PORT = process.env.PORT || 3011;

// Middleware - CORS with explicit origins
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://crm.pandaadmin.com',
    'https://bamboo.pandaadmin.com',
  ],
  credentials: true,
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'notifications',
    features: ['notifications', 'preferences', 'templates', 'attention-queue'],
  });
});

// Routes
app.use('/api/notifications', notificationRoutes);
app.use('/api/notification-preferences', preferenceRoutes);
app.use('/api/notification-templates', templateRoutes);
app.use('/api/attention', attentionRoutes);

// Also mount inspector route at root level for opportunities service calls
// This allows calls to /api/inspectors/for-notification
app.post('/api/inspectors/for-notification', async (req, res, next) => {
  try {
    const inspectorIds = await notificationService.getInspectorsForNotification(req.body);
    res.json({ success: true, inspectorIds });
  } catch (error) {
    next(error);
  }
});

// Cron job to refresh attention queue (every 15 minutes)
const refreshAttentionJob = new CronJob('*/15 * * * *', async () => {
  try {
    const result = await attentionService.refreshQueue();
    if (result.created > 0) {
      console.log(`[Attention Queue] Created ${result.created} new items`);
    }
  } catch (error) {
    console.error('[Attention Queue] Refresh error:', error);
  }
});

// Cron job to update overdue status (every hour)
const updateOverdueJob = new CronJob('0 * * * *', async () => {
  try {
    const count = await attentionService.updateOverdueStatus();
    if (count > 0) {
      console.log(`[Attention Queue] Updated ${count} overdue items`);
    }
  } catch (error) {
    console.error('[Attention Queue] Overdue update error:', error);
  }
});

// Cron job to cleanup old items (daily at 3am)
const cleanupJob = new CronJob('0 3 * * *', async () => {
  try {
    const count = await attentionService.cleanupOldItems(30);
    console.log(`[Attention Queue] Cleaned up ${count} old items`);
  } catch (error) {
    console.error('[Attention Queue] Cleanup error:', error);
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

app.listen(PORT, () => {
  console.log(`Notifications service running on port ${PORT}`);

  // Start cron jobs
  refreshAttentionJob.start();
  updateOverdueJob.start();
  cleanupJob.start();
  console.log('[Attention Queue] Cron jobs started');
});

export default app;
