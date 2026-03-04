import { Router } from 'express';

const router = Router();

const DEFAULT_FLAGS = {
  ai_scope_generation: {
    title: 'AI Scope Generation',
    description: 'Auto-generate quotes from measurement data',
  },
  ai_tier_generation: {
    title: 'AI Tier Generation',
    description: 'Generate Good/Better/Best tier proposals',
  },
  ai_public_proposals: {
    title: 'AI Public Proposals',
    description: 'Enable public proposal pages with tier selection',
  },
  ai_photo_analysis: {
    title: 'AI Photo Analysis',
    description: 'GPT-4o powered photo damage analysis',
  },
  ai_pdf_extraction: {
    title: 'AI PDF Extraction',
    description: 'Extract insurance data from PDF documents',
  },
  ai_predictions: {
    title: 'AI Predictions',
    description: 'Show complexity, close likelihood, and risk predictions',
  },
};

function parseEnabledFlags() {
  const envValue = process.env.FEATURE_FLAGS_ENABLED || '';
  const enabled = new Set(
    envValue
      .split(',')
      .map(flag => flag.trim())
      .filter(Boolean)
  );

  const flags = {};
  Object.keys(DEFAULT_FLAGS).forEach((name) => {
    flags[name] = enabled.has(name);
  });
  return flags;
}

/**
 * GET /api/feature-flags
 * Returns admin-oriented feature flag list payload.
 */
router.get('/', async (req, res) => {
  const enabledMap = parseEnabledFlags();
  const records = Object.entries(DEFAULT_FLAGS).map(([name, meta]) => ({
    id: name,
    name,
    title: meta.title,
    description: meta.description,
    enabledGlobally: Boolean(enabledMap[name]),
    enabledForUsers: [],
    enabledForRoles: [],
  }));

  // Keep shape compatible with existing frontend expectations:
  // response.data.data -> { data: [...] }
  return res.json({
    success: true,
    data: {
      data: records,
    },
  });
});

/**
 * GET /api/feature-flags/me
 * Returns user-facing map of flagName -> boolean.
 */
router.get('/me', async (req, res) => {
  const enabledMap = parseEnabledFlags();
  return res.json({
    success: true,
    data: enabledMap,
  });
});

export default router;
