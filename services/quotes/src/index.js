import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import quoteRoutes from './routes/quotes.js';
import productRoutes from './routes/products.js';

const app = express();
const PORT = process.env.PORT || 3006;

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
  res.json({ status: 'healthy', service: 'quotes', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/quotes', quoteRoutes);
app.use('/api/products', productRoutes);

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
  console.log(`Quotes service running on port ${PORT}`);
});

export default app;
