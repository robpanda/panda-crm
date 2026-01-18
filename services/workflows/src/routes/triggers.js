// Trigger Routes
import { Router } from 'express';
import { evaluateOnboardingTriggers } from '../triggers/onboardingTriggers.js';

const router = Router();

/**
 * POST /onboarding/evaluate
 * Evaluate onboarding triggers for an opportunity
 */
router.post('/onboarding/evaluate', async (req, res, next) => {
  try {
    const { opportunityId, previousState, currentState } = req.body;

    if (!opportunityId || !currentState) {
      return res.status(400).json({
        success: false,
        error: { message: 'opportunityId and currentState are required' }
      });
    }

    const result = await evaluateOnboardingTriggers({
      opportunityId,
      previousState: previousState || {},
      currentState,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
