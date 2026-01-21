// Leads Microservice Entry Point
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { PrismaClient } from '@prisma/client';
import { logger } from './middleware/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authMiddleware } from './middleware/auth.js';
import leadRoutes from './routes/leads.js';
import leadAssignmentRoutes from './routes/leadAssignment.js';
import callCenterRoutes from './routes/callCenter.js';
import callListRoutes from './routes/callLists.js';

const prisma = new PrismaClient();

const app = express();
const PORT = process.env.PORT || 3003;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://crm.pandaadmin.com',
    'https://crm.pandaexteriors.com'
  ],
  credentials: true,
}));
app.use(express.json());
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

// Health check (no auth required)
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'leads', timestamp: new Date().toISOString() });
});

// Apply auth middleware to all routes below
app.use(authMiddleware);

// Routes - /api/leads/* to match ALB path-based routing
// IMPORTANT: More specific routes MUST come before generic /:id routes
app.use('/api/leads/assignment', leadAssignmentRoutes);
app.use('/api/leads/call-center', callCenterRoutes);
app.use('/api/leads/call-lists', callListRoutes);
app.use('/api/leads', leadRoutes);  // Has /:id route - must be LAST

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
  });
});

// Initialize lead scoring tables and default rules on startup
const initializeLeadScoring = async () => {
  try {
    // Create lead_scoring_rules table if it doesn't exist
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS lead_scoring_rules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        field TEXT NOT NULL,
        operator TEXT NOT NULL,
        value JSONB NOT NULL,
        score_impact INTEGER NOT NULL,
        category TEXT,
        priority INTEGER DEFAULT 100,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create lead_score_history table if it doesn't exist
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS lead_score_history (
        id TEXT PRIMARY KEY,
        lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        score INTEGER NOT NULL,
        rank TEXT,
        score_factors JSONB,
        score_version INTEGER DEFAULT 1,
        scored_by TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_lead_scoring_rules_active ON lead_scoring_rules(is_active)');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_lead_scoring_rules_priority ON lead_scoring_rules(priority)');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_lead_score_history_lead_id ON lead_score_history(lead_id)');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_lead_score_history_created_at ON lead_score_history(created_at)');

    logger.info('Lead scoring tables initialized');

    // Check if default rules exist
    const existingRules = await prisma.$queryRawUnsafe('SELECT COUNT(*) as count FROM lead_scoring_rules');
    const ruleCount = parseInt(existingRules[0]?.count || 0);

    if (ruleCount === 0) {
      // Insert default scoring rules
      const defaultRules = [
        // Source-based scoring
        { id: 'rule_src_referral', name: 'Referral Source', field: 'source', operator: 'in', value: JSON.stringify(['Referral', 'Customer Referral', 'Employee Referral']), scoreImpact: 25, category: 'source', priority: 10 },
        { id: 'rule_src_website', name: 'Website Lead', field: 'source', operator: 'in', value: JSON.stringify(['Website', 'Web Form', 'Online']), scoreImpact: 15, category: 'source', priority: 20 },
        { id: 'rule_src_social', name: 'Social Media', field: 'source', operator: 'in', value: JSON.stringify(['Facebook', 'Instagram', 'Social Media']), scoreImpact: 10, category: 'source', priority: 30 },
        { id: 'rule_src_door', name: 'Door Knock', field: 'source', operator: 'in', value: JSON.stringify(['Door Knock', 'Canvassing', 'D2D']), scoreImpact: 20, category: 'source', priority: 25 },

        // Work type scoring (roofing company)
        { id: 'rule_work_roof', name: 'Roof Replacement', field: 'workType', operator: 'in', value: JSON.stringify(['Roof Replacement', 'Full Roof', 'Re-roof']), scoreImpact: 30, category: 'work_type', priority: 10 },
        { id: 'rule_work_siding', name: 'Siding Work', field: 'workType', operator: 'in', value: JSON.stringify(['Siding', 'Siding Replacement', 'Vinyl Siding']), scoreImpact: 25, category: 'work_type', priority: 15 },
        { id: 'rule_work_storm', name: 'Storm Damage', field: 'workType', operator: 'in', value: JSON.stringify(['Storm Damage', 'Insurance', 'Insurance Claim', 'Hail Damage']), scoreImpact: 35, category: 'work_type', priority: 5 },
        { id: 'rule_work_repair', name: 'Repair Work', field: 'workType', operator: 'in', value: JSON.stringify(['Repair', 'Roof Repair', 'Minor Repair']), scoreImpact: 10, category: 'work_type', priority: 30 },

        // Contact quality
        { id: 'rule_has_email', name: 'Has Email', field: 'email', operator: 'exists', value: JSON.stringify(true), scoreImpact: 5, category: 'contact', priority: 50 },
        { id: 'rule_has_mobile', name: 'Has Mobile Phone', field: 'mobilePhone', operator: 'exists', value: JSON.stringify(true), scoreImpact: 5, category: 'contact', priority: 50 },
        { id: 'rule_has_address', name: 'Has Full Address', field: 'postalCode', operator: 'exists', value: JSON.stringify(true), scoreImpact: 10, category: 'contact', priority: 40 },

        // Property type scoring
        { id: 'rule_prop_residential', name: 'Residential Property', field: 'propertyType', operator: 'in', value: JSON.stringify(['Residential', 'Single Family', 'House']), scoreImpact: 15, category: 'property', priority: 20 },
        { id: 'rule_prop_commercial', name: 'Commercial Property', field: 'propertyType', operator: 'in', value: JSON.stringify(['Commercial', 'Business', 'Industrial']), scoreImpact: 25, category: 'property', priority: 15 },
        { id: 'rule_prop_multi', name: 'Multi-Family', field: 'propertyType', operator: 'in', value: JSON.stringify(['Multi-Family', 'Apartment', 'Condo', 'HOA']), scoreImpact: 20, category: 'property', priority: 18 },

        // Status-based adjustments
        { id: 'rule_status_hot', name: 'Hot Rating', field: 'rating', operator: 'equals', value: JSON.stringify('HOT'), scoreImpact: 20, category: 'status', priority: 5 },
        { id: 'rule_status_warm', name: 'Warm Rating', field: 'rating', operator: 'equals', value: JSON.stringify('WARM'), scoreImpact: 10, category: 'status', priority: 10 },
        { id: 'rule_status_cold', name: 'Cold Rating', field: 'rating', operator: 'equals', value: JSON.stringify('COLD'), scoreImpact: -10, category: 'status', priority: 10 },

        // Self-gen bonus
        { id: 'rule_selfgen', name: 'Self-Generated Lead', field: 'isSelfGen', operator: 'equals', value: JSON.stringify(true), scoreImpact: 15, category: 'source', priority: 5 },
      ];

      for (const rule of defaultRules) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO lead_scoring_rules (id, name, field, operator, value, score_impact, category, priority, is_active)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, true)
           ON CONFLICT (id) DO NOTHING`,
          rule.id, rule.name, rule.field, rule.operator, rule.value, rule.scoreImpact, rule.category, rule.priority
        );
      }
      logger.info(`Initialized ${defaultRules.length} default lead scoring rules`);
    } else {
      logger.info(`Lead scoring rules already exist (${ruleCount} rules)`);
    }

    // Score a batch of unscored leads on startup
    await scoreUnscoredLeadsOnStartup();
  } catch (error) {
    logger.error('Failed to initialize lead scoring:', error);
  }
};

// Score existing unscored leads on startup (batched to avoid overload)
const scoreUnscoredLeadsOnStartup = async () => {
  try {
    // Find unscored leads (where score is 0 or null and scored_at is null)
    const unscoredLeads = await prisma.lead.findMany({
      where: {
        OR: [
          { scored_at: null },
          { lead_score: null },
          { score: 0 },
        ],
        isConverted: false,
        deleted_at: null,
      },
      select: { id: true },
      take: 100, // Process in batches of 100
      orderBy: { createdAt: 'desc' },
    });

    if (unscoredLeads.length === 0) {
      logger.info('No unscored leads found');
      return;
    }

    logger.info(`Scoring ${unscoredLeads.length} unscored leads...`);

    // Score each lead using the simple scoring algorithm
    let scored = 0;
    for (const { id } of unscoredLeads) {
      try {
        await scoreLeadSimple(id);
        scored++;
      } catch (err) {
        logger.warn(`Failed to score lead ${id}: ${err.message}`);
      }
    }

    logger.info(`Scored ${scored}/${unscoredLeads.length} leads on startup`);
  } catch (error) {
    logger.error('Failed to score leads on startup:', error);
  }
};

// Simple scoring function for startup batch processing
const scoreLeadSimple = async (leadId) => {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return;

  let score = 50; // Base score
  const factors = [];

  // Source scoring
  if (lead.isSelfGen) {
    score += 25;
    factors.push({ name: 'Self-Gen Lead', impact: 25, category: 'source' });
  } else if (lead.source?.includes('Referral')) {
    score += 20;
    factors.push({ name: 'Referral Lead', impact: 20, category: 'source' });
  } else if (['Web', 'Website', 'Online'].includes(lead.source)) {
    score += 10;
    factors.push({ name: 'Website Lead', impact: 10, category: 'source' });
  }

  // Work type scoring
  if (['Storm Damage', 'Insurance', 'Hail Damage'].some(t => lead.workType?.includes(t))) {
    score += 35;
    factors.push({ name: 'Insurance/Storm Work', impact: 35, category: 'workType' });
  } else if (lead.workType?.includes('Roof')) {
    score += 25;
    factors.push({ name: 'Roof Work', impact: 25, category: 'workType' });
  }

  // Data completeness
  if (lead.email) {
    score += 5;
    factors.push({ name: 'Has Email', impact: 5, category: 'completeness' });
  }
  if (lead.phone || lead.mobilePhone) {
    score += 5;
    factors.push({ name: 'Has Phone', impact: 5, category: 'completeness' });
  }
  if (lead.street && lead.city && lead.state) {
    score += 5;
    factors.push({ name: 'Complete Address', impact: 5, category: 'completeness' });
  }

  // Rating adjustments
  if (lead.rating === 'HOT') {
    score += 20;
    factors.push({ name: 'Hot Rating', impact: 20, category: 'rating' });
  } else if (lead.rating === 'WARM') {
    score += 10;
    factors.push({ name: 'Warm Rating', impact: 10, category: 'rating' });
  }

  // Normalize score to 0-100
  score = Math.min(100, Math.max(0, score));
  const rank = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : score >= 20 ? 'D' : 'F';

  // Update lead with score
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      score: score,
      lead_score: score,
      lead_rank: rank,
      score_factors: factors,
      scored_at: new Date(),
      score_version: 1,
    },
  });
};

// Start server
app.listen(PORT, () => {
  logger.info(`Leads service running on port ${PORT}`);
  initializeLeadScoring();
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

export default app;
