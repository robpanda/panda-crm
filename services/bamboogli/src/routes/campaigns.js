/**
 * Campaign API Routes
 * RESTful endpoints for campaign management
 */

import express from 'express';
import campaignService from '../services/campaignService.js';

const router = express.Router();

/**
 * GET /campaigns/unsubscribe/:token
 * Public endpoint - no auth required
 * Handles email unsubscribe requests from links in campaign emails
 */
router.get('/unsubscribe/:token', async (req, res, next) => {
  try {
    const { token } = req.params;

    const result = await campaignService.unsubscribeByToken(token);

    // Return an HTML page confirming unsubscribe
    res.setHeader('Content-Type', 'text/html');
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Unsubscribed - Panda Exteriors</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          }
          .card {
            background: white;
            padding: 40px;
            border-radius: 12px;
            text-align: center;
            box-shadow: 0 4px 20px rgba(0,0,0,0.2);
            max-width: 400px;
          }
          .success { color: #22c55e; font-size: 48px; margin-bottom: 20px; }
          h1 { color: #1f2937; margin: 0 0 10px 0; font-size: 24px; }
          p { color: #6b7280; line-height: 1.6; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="success">✓</div>
          <h1>You've Been Unsubscribed</h1>
          <p>${result.message}</p>
          <p style="margin-top: 20px; font-size: 14px;">You can close this window.</p>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    // Return error page but don't expose details
    res.setHeader('Content-Type', 'text/html');
    res.status(400).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Error - Panda Exteriors</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          }
          .card {
            background: white;
            padding: 40px;
            border-radius: 12px;
            text-align: center;
            box-shadow: 0 4px 20px rgba(0,0,0,0.2);
            max-width: 400px;
          }
          .error { color: #ef4444; font-size: 48px; margin-bottom: 20px; }
          h1 { color: #1f2937; margin: 0 0 10px 0; font-size: 24px; }
          p { color: #6b7280; line-height: 1.6; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="error">!</div>
          <h1>Unable to Process Request</h1>
          <p>This unsubscribe link may be invalid or expired. Please contact us directly if you need assistance.</p>
        </div>
      </body>
      </html>
    `);
  }
});

/**
 * GET /campaigns
 * List all campaigns with pagination and filters
 */
router.get('/', async (req, res, next) => {
  try {
    const { page, limit, type, status, search } = req.query;

    const result = await campaignService.getCampaigns({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 25,
      type: type?.toUpperCase(),
      status: status?.toUpperCase(),
      search,
    });

    res.json({
      success: true,
      data: result.campaigns,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /campaigns/stats
 * Get aggregate campaign statistics
 */
router.get('/stats', async (req, res, next) => {
  try {
    const result = await campaignService.getCampaigns({ limit: 1000 });

    const campaigns = result.campaigns;
    const stats = {
      total: campaigns.length,
      draft: campaigns.filter(c => c.status === 'DRAFT').length,
      active: campaigns.filter(c => c.status === 'SCHEDULED' || c.status === 'SENDING').length,
      completed: campaigns.filter(c => c.status === 'SENT').length,
      paused: campaigns.filter(c => c.status === 'PAUSED').length,
      totalSent: campaigns.reduce((sum, c) => sum + (c.totalSent || 0), 0),
      totalDelivered: campaigns.reduce((sum, c) => sum + (c.delivered || 0), 0),
      totalOpened: campaigns.reduce((sum, c) => sum + (c.opened || 0), 0),
      totalClicked: campaigns.reduce((sum, c) => sum + (c.clicked || 0), 0),
    };

    // Calculate rates
    stats.avgOpenRate = stats.totalDelivered > 0
      ? Math.round((stats.totalOpened / stats.totalDelivered) * 100)
      : 0;
    stats.avgClickRate = stats.totalOpened > 0
      ? Math.round((stats.totalClicked / stats.totalOpened) * 100)
      : 0;

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /campaigns
 * Create a new campaign
 */
router.post('/', async (req, res, next) => {
  try {
    // Get user ID from auth token (simplified for now)
    const userId = req.user?.id || req.body.createdById || 'system';

    const campaign = await campaignService.createCampaign(req.body, userId);

    res.status(201).json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /campaigns/estimate-recipients
 * Estimate recipient count for audience rules
 */
router.post('/estimate-recipients', async (req, res, next) => {
  try {
    const { audienceRules } = req.body;

    const count = await campaignService.estimateRecipients(audienceRules || {});

    res.json({
      success: true,
      data: { count },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /campaigns/audience-preview
 * Get a preview of contacts matching audience rules
 */
router.post('/audience-preview', async (req, res, next) => {
  try {
    const { audienceRules, limit } = req.body;

    const result = await campaignService.getAudiencePreview(
      audienceRules || {},
      parseInt(limit) || 10
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /campaigns/test-recipients
 * Get list of employees available for test sends
 * NOTE: Must be defined BEFORE /:id route to avoid conflict
 */
router.get('/test-recipients', async (req, res, next) => {
  try {
    const { search } = req.query;
    const users = await campaignService.getTestRecipients(search);

    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /campaigns/opportunity-stage-counts
 * Get counts of opportunities by stage for campaign targeting
 * Returns only stages that have contacts with phone/email
 */
router.get('/opportunity-stage-counts', async (req, res, next) => {
  try {
    const counts = await campaignService.getOpportunityStageCounts();

    res.json({
      success: true,
      data: counts,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /campaigns/:id
 * Get a single campaign by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const campaign = await campaignService.getCampaignById(req.params.id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Campaign not found' },
      });
    }

    res.json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /campaigns/:id
 * Update a campaign
 */
router.put('/:id', async (req, res, next) => {
  try {
    const campaign = await campaignService.updateCampaign(req.params.id, req.body);

    res.json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /campaigns/:id
 * Delete a campaign
 */
router.delete('/:id', async (req, res, next) => {
  try {
    await campaignService.deleteCampaign(req.params.id);

    res.json({
      success: true,
      message: 'Campaign deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /campaigns/:id/send
 * Send a campaign
 */
router.post('/:id/send', async (req, res, next) => {
  try {
    const userId = req.user?.id || 'system';

    const result = await campaignService.sendCampaign(req.params.id, userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /campaigns/:id/test-send
 * Send a test campaign to selected employees
 */
router.post('/:id/test-send', async (req, res, next) => {
  try {
    const { userIds } = req.body;
    const userId = req.user?.id || 'system';

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Please provide at least one user ID to send test to' },
      });
    }

    if (userIds.length > 10) {
      return res.status(400).json({
        success: false,
        error: { code: 'TOO_MANY_RECIPIENTS', message: 'Maximum 10 test recipients allowed' },
      });
    }

    const result = await campaignService.sendTestCampaign(req.params.id, userIds, userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /campaigns/:id/pause
 * Pause an active campaign
 */
router.post('/:id/pause', async (req, res, next) => {
  try {
    const campaign = await campaignService.pauseCampaign(req.params.id);

    res.json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /campaigns/:id/resume
 * Resume a paused campaign
 */
router.post('/:id/resume', async (req, res, next) => {
  try {
    const campaign = await campaignService.resumeCampaign(req.params.id);

    res.json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /campaigns/:id/duplicate
 * Duplicate a campaign
 */
router.post('/:id/duplicate', async (req, res, next) => {
  try {
    const userId = req.user?.id || 'system';

    const campaign = await campaignService.duplicateCampaign(req.params.id, userId);

    res.json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /campaigns/:id/sends
 * Get campaign sends with pagination
 */
router.get('/:id/sends', async (req, res, next) => {
  try {
    const { page, limit, status } = req.query;

    const result = await campaignService.getCampaignSends(req.params.id, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      status: status?.toUpperCase(),
    });

    res.json({
      success: true,
      data: result.sends,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /campaigns/:id/fix-stuck
 * Fix a campaign stuck in SENDING status
 * Updates all QUEUED sends to SENT and updates campaign metrics
 */
router.post('/:id/fix-stuck', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { dryRun } = req.body;

    const result = await campaignService.fixStuckCampaign(id, { dryRun: dryRun === true });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /campaigns/opt-out
 * Opt out contacts from SMS and Email campaigns by phone number
 * Sets smsOptOut and emailOptOut flags on matching contacts
 */
router.post('/opt-out', async (req, res, next) => {
  try {
    const { phoneNumbers, sms = true, email = true, dryRun = false } = req.body;

    if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Please provide an array of phone numbers' },
      });
    }

    const result = await campaignService.optOutByPhoneNumbers(phoneNumbers, { sms, email, dryRun });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
