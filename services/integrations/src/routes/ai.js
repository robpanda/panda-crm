// AI Routes - OpenAI integration endpoints
import { Router } from 'express';
import { generateActivitySummary, generateNextStepSuggestions, generateDraftMessage } from '../services/openaiService.js';

const router = Router();

/**
 * POST /activity-summary
 * Generate AI summary of opportunity activity
 */
router.post('/activity-summary', async (req, res, next) => {
  try {
    const { activities, opportunity, context } = req.body;

    if (!activities || !opportunity) {
      return res.status(400).json({
        success: false,
        error: { message: 'activities and opportunity are required' }
      });
    }

    const summary = await generateActivitySummary({ activities, opportunity, context });

    res.json({ success: true, data: { summary } });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /next-steps
 * Generate AI suggestions for next steps and mentions
 */
router.post('/next-steps', async (req, res, next) => {
  try {
    const { opportunity, activities, teamMembers } = req.body;

    if (!opportunity) {
      return res.status(400).json({
        success: false,
        error: { message: 'opportunity is required' }
      });
    }

    const suggestions = await generateNextStepSuggestions({
      opportunity,
      activities: activities || [],
      teamMembers: teamMembers || []
    });

    res.json({ success: true, data: suggestions });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /draft-message
 * Generate AI-drafted message
 */
router.post('/draft-message', async (req, res, next) => {
  try {
    const { intent, opportunity, recentActivity } = req.body;

    if (!intent || !opportunity) {
      return res.status(400).json({
        success: false,
        error: { message: 'intent and opportunity are required' }
      });
    }

    const draftMessage = await generateDraftMessage({
      intent,
      opportunity,
      recentActivity: recentActivity || []
    });

    res.json({ success: true, data: { draftMessage } });
  } catch (error) {
    next(error);
  }
});

export default router;
