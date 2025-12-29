import express from 'express';
import cors from 'cors';
import emailRoutes from './routes/emails.js';

const app = express();
const PORT = process.env.PORT || 3010;

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
app.use(express.json({ limit: '10mb' })); // Allow larger payloads for HTML emails

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'emails' });
});

// Routes
app.use('/api/emails', emailRoutes);

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

app.listen(PORT, () => {
  console.log(`Emails service running on port ${PORT}`);
});

export default app;
