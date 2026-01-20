import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import workOrderRoutes from './routes/workOrders.js';
import serviceAppointmentRoutes from './routes/serviceAppointments.js';
import resourceRoutes from './routes/resources.js';
import schedulingRoutes from './routes/scheduling.js';
import schedulingPolicyRoutes from './routes/schedulingPolicies.js';
import googleCalendarRoutes from './routes/googleCalendar.js';
import materialOrderRoutes from './routes/materialOrders.js';

const app = express();
const PORT = process.env.PORT || 3005;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://crm.pandaadmin.com',
    'https://crm.pandaexteriors.com'
  ],
  credentials: true,
}));
app.use(morgan('combined'));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'workorders', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/work-orders', workOrderRoutes);
app.use('/api/service-appointments', serviceAppointmentRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/field-service/resources', resourceRoutes); // Alias for frontend compatibility
app.use('/api/scheduling', schedulingRoutes);
app.use('/api/scheduling-policies', schedulingPolicyRoutes);
app.use('/api/field-service/scheduling-policies', schedulingPolicyRoutes); // Alias for frontend compatibility
app.use('/api/google', googleCalendarRoutes);
app.use('/api/material-orders', materialOrderRoutes);

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);

  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: 'Validation error',
      details: err.errors,
    });
  }

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`Work Orders service running on port ${PORT}`);
});

export default app;
