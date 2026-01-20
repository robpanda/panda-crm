// EagleView, GAF QuickMeasure & Hover Integration Routes
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { measurementService } from '../services/measurementService.js';
import { logger } from '../middleware/logger.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

// Helper to handle Hover authorization errors
function handleHoverAuthError(error, res) {
  if (error.message.includes('re-authorize') || error.message.includes('refresh token')) {
    const authUrl = measurementService.getHoverAuthorizationUrl();
    return res.status(401).json({
      success: false,
      error: {
        code: 'HOVER_NOT_AUTHORIZED',
        message: 'Hover integration requires authorization. Please authorize the app first.',
        authUrl,
      },
    });
  }
  return null; // Not a Hover auth error
}

// ==========================================
// EagleView Routes
// ==========================================

/**
 * POST /measurements/eagleview/order - Order EagleView report
 */
router.post('/eagleview/order', authMiddleware, async (req, res, next) => {
  try {
    const report = await measurementService.orderEagleViewReport({
      ...req.body,
      userId: req.user.id,
    });

    logger.info(`EagleView order placed: ${report.id} by ${req.user.email}`);

    res.status(201).json({ success: true, data: report });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /measurements/eagleview/webhook - Handle EagleView webhooks
 */
router.post('/eagleview/webhook', async (req, res, next) => {
  try {
    // Verify webhook signature
    const signature = req.headers['x-eagleview-signature'];
    // TODO: Implement signature verification

    await measurementService.handleEagleViewWebhook(req.body);

    res.sendStatus(200);
  } catch (error) {
    logger.error('EagleView webhook error:', error);
    res.sendStatus(500);
  }
});

/**
 * GET /measurements/eagleview/report/:reportId - Fetch EagleView report by ID
 * Manual trigger to fetch a specific report
 */
router.get('/eagleview/report/:reportId', authMiddleware, async (req, res, next) => {
  try {
    const reportData = await measurementService.fetchEagleViewReport(req.params.reportId);
    res.json({ success: true, data: reportData });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /measurements/eagleview/waste/:reportId - Fetch EagleView waste data
 */
router.get('/eagleview/waste/:reportId', authMiddleware, async (req, res, next) => {
  try {
    const wasteData = await measurementService.fetchEagleViewWasteData(req.params.reportId);
    res.json({ success: true, data: wasteData });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /measurements/eagleview/pdf/:reportId - Download EagleView PDF
 */
router.get('/eagleview/pdf/:reportId', authMiddleware, async (req, res, next) => {
  try {
    const { response, contentType, contentDisposition } = await measurementService.downloadEagleViewPdf(req.params.reportId);

    if (contentType) res.setHeader('Content-Type', contentType);
    if (contentDisposition) res.setHeader('Content-Disposition', contentDisposition);
    else res.setHeader('Content-Disposition', `attachment; filename="eagleview-report-${req.params.reportId}.pdf"`);

    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (error) {
    next(error);
  }
});

/**
 * POST /measurements/eagleview/store-pdf/:id - Download and store PDF to S3 for a measurement report
 */
router.post('/eagleview/store-pdf/:id', authMiddleware, async (req, res, next) => {
  try {
    // Get measurement report to find EagleView report ID
    const report = await prisma.measurementReport.findUnique({
      where: { id: req.params.id },
    });

    if (!report || !report.externalId) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Report not found or no external ID' },
      });
    }

    const result = await measurementService.downloadAndStorePdf(report.externalId, req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /measurements/pdf-url/:id - Get a fresh presigned URL for a stored PDF
 */
router.get('/pdf-url/:id', authMiddleware, async (req, res, next) => {
  try {
    const report = await prisma.measurementReport.findUnique({
      where: { id: req.params.id },
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Report not found' },
      });
    }

    // Check if we have an S3 key stored
    const s3Key = report.rawData?.pdfS3Key;
    if (!s3Key) {
      return res.status(404).json({
        success: false,
        error: { code: 'NO_PDF', message: 'No PDF stored for this report' },
      });
    }

    const presignedUrl = await measurementService.getPdfPresignedUrl(s3Key);
    res.json({ success: true, data: { url: presignedUrl, s3Key } });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /measurements/eagleview/poll/:id - Manually poll for a specific report
 */
router.post('/eagleview/poll/:id', authMiddleware, async (req, res, next) => {
  try {
    const result = await measurementService.pollEagleViewReport(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /measurements/eagleview/process-pending - Process all pending EagleView reports
 * Batch job endpoint - can be called by scheduler or manually
 */
router.post('/eagleview/process-pending', authMiddleware, async (req, res, next) => {
  try {
    const results = await measurementService.processPendingEagleViewReports();
    logger.info('EagleView batch processing triggered', results);
    res.json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// GAF QuickMeasure Routes
// ==========================================

/**
 * POST /measurements/gaf/order - Order GAF QuickMeasure report
 */
router.post('/gaf/order', authMiddleware, async (req, res, next) => {
  try {
    const report = await measurementService.orderGAFReport({
      ...req.body,
      userId: req.user.id,
    });

    logger.info(`GAF QuickMeasure order placed: ${report.id} by ${req.user.email}`);

    res.status(201).json({ success: true, data: report });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /measurements/gaf/webhook - Handle GAF webhooks
 */
router.post('/gaf/webhook', async (req, res, next) => {
  try {
    // Verify webhook signature
    const signature = req.headers['x-gaf-signature'];
    // TODO: Implement signature verification

    await measurementService.handleGAFWebhook(req.body);

    res.sendStatus(200);
  } catch (error) {
    logger.error('GAF webhook error:', error);
    res.sendStatus(500);
  }
});

/**
 * POST /measurements/gaf/poll/:id - Manually poll for a specific GAF report
 */
router.post('/gaf/poll/:id', authMiddleware, async (req, res, next) => {
  try {
    const result = await measurementService.pollGAFReport(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /measurements/gaf/process-pending - Process all pending GAF reports
 * Batch job endpoint - can be called by scheduler or manually
 */
router.post('/gaf/process-pending', authMiddleware, async (req, res, next) => {
  try {
    const results = await measurementService.processPendingGAFReports();
    logger.info('GAF batch processing triggered', results);
    res.json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /measurements/process-all-pending - Process all pending reports (all providers)
 * Combined batch job endpoint
 */
router.post('/process-all-pending', authMiddleware, async (req, res, next) => {
  try {
    const [eagleViewResults, gafResults] = await Promise.all([
      measurementService.processPendingEagleViewReports(),
      measurementService.processPendingGAFReports(),
    ]);

    const combinedResults = {
      eagleView: eagleViewResults,
      gaf: gafResults,
      summary: {
        total: eagleViewResults.total + gafResults.total,
        delivered: eagleViewResults.delivered + gafResults.delivered,
        stillPending: eagleViewResults.stillPending + gafResults.stillPending,
        failed: eagleViewResults.failed + gafResults.failed,
      },
    };

    logger.info('All providers batch processing complete', combinedResults.summary);
    res.json({ success: true, data: combinedResults });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Hover Integration Routes
// ==========================================
// Hover provides photo-based 3D modeling, measurements, and design visualization
// Key differentiator: Uses smartphone photos instead of satellite imagery

/**
 * GET /measurements/hover/status - Check Hover integration status
 */
router.get('/hover/status', authMiddleware, async (req, res, next) => {
  try {
    const status = await measurementService.checkHoverStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /measurements/hover/auth - Get Hover OAuth authorization URL
 * Initiates OAuth flow for Hover (Authorization Code Grant)
 */
router.get('/hover/auth', authMiddleware, async (req, res, next) => {
  try {
    const { state } = req.query;
    const authUrl = measurementService.getHoverAuthorizationUrl(state || req.user.id);
    res.json({ success: true, data: { authUrl } });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /measurements/hover/callback - OAuth callback from Hover
 * Exchanges authorization code for access token
 */
router.get('/hover/callback', async (req, res, next) => {
  try {
    const { code, state, error: oauthError, error_description } = req.query;

    if (oauthError) {
      logger.error('Hover OAuth error:', oauthError, error_description);
      return res.redirect('/integrations?error=hover_auth_failed&message=' + encodeURIComponent(error_description || oauthError));
    }

    if (!code) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_CODE', message: 'Authorization code is required' },
      });
    }

    const tokens = await measurementService.exchangeHoverCode(code);

    logger.info(`Hover OAuth successful for state: ${state}`);

    // Redirect to integrations page with success message
    res.redirect('/integrations?success=hover_connected');
  } catch (error) {
    logger.error('Hover OAuth callback error:', error);
    res.redirect('/integrations?error=hover_auth_failed&message=' + encodeURIComponent(error.message));
  }
});

/**
 * POST /measurements/hover/capture - Create Hover capture request
 * Initiates a job for a property to be captured via smartphone photos
 */
router.post('/hover/capture', authMiddleware, async (req, res, next) => {
  try {
    const result = await measurementService.createHoverCaptureRequest({
      ...req.body,
      userId: req.user.id,
    });

    logger.info(`Hover capture request created: ${result.captureRequestId} by ${req.user.email}`);

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    if (handleHoverAuthError(error, res)) return;
    next(error);
  }
});

/**
 * GET /measurements/hover/job/:jobId - Get Hover job details
 */
router.get('/hover/job/:jobId', authMiddleware, async (req, res, next) => {
  try {
    const job = await measurementService.getHoverJob(req.params.jobId);
    res.json({ success: true, data: job });
  } catch (error) {
    if (handleHoverAuthError(error, res)) return;
    next(error);
  }
});

/**
 * GET /measurements/hover/capture/:captureRequestId/jobs - Get jobs for a capture request
 */
router.get('/hover/capture/:captureRequestId/jobs', authMiddleware, async (req, res, next) => {
  try {
    const jobs = await measurementService.getHoverJobsForCaptureRequest(req.params.captureRequestId);
    res.json({ success: true, data: jobs });
  } catch (error) {
    if (handleHoverAuthError(error, res)) return;
    next(error);
  }
});

/**
 * GET /measurements/hover/job/:jobId/deliverables - Get Hover deliverables
 */
router.get('/hover/job/:jobId/deliverables', authMiddleware, async (req, res, next) => {
  try {
    const { type } = req.query;
    const deliverables = await measurementService.getHoverDeliverables(req.params.jobId, type);
    res.json({ success: true, data: deliverables });
  } catch (error) {
    if (handleHoverAuthError(error, res)) return;
    next(error);
  }
});

/**
 * GET /measurements/hover/deliverable/:deliverableId/download - Download a specific deliverable
 */
router.get('/hover/deliverable/:deliverableId/download', authMiddleware, async (req, res, next) => {
  try {
    const response = await measurementService.downloadHoverDeliverable(req.params.deliverableId);

    // Forward the response headers and body
    const contentType = response.headers.get('content-type');
    const contentDisposition = response.headers.get('content-disposition');

    if (contentType) res.setHeader('Content-Type', contentType);
    if (contentDisposition) res.setHeader('Content-Disposition', contentDisposition);

    // Pipe the response body
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (error) {
    if (handleHoverAuthError(error, res)) return;
    next(error);
  }
});

/**
 * GET /measurements/hover/job/:jobId/3d-model - Get 3D model viewer URL
 */
router.get('/hover/job/:jobId/3d-model', authMiddleware, async (req, res, next) => {
  try {
    const viewerUrl = await measurementService.getHover3DModelUrl(req.params.jobId);
    res.json({ success: true, data: { viewerUrl } });
  } catch (error) {
    if (handleHoverAuthError(error, res)) return;
    next(error);
  }
});

/**
 * GET /measurements/hover/job/:jobId/design-options - Get design visualization options
 */
router.get('/hover/job/:jobId/design-options', authMiddleware, async (req, res, next) => {
  try {
    const options = await measurementService.getHoverDesignOptions(req.params.jobId);
    res.json({ success: true, data: options });
  } catch (error) {
    if (handleHoverAuthError(error, res)) return;
    next(error);
  }
});

/**
 * POST /measurements/hover/job/:jobId/design - Apply design to 3D model
 * Visualize different roofing, siding, window materials
 */
router.post('/hover/job/:jobId/design', authMiddleware, async (req, res, next) => {
  try {
    const result = await measurementService.applyHoverDesign(req.params.jobId, req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    if (handleHoverAuthError(error, res)) return;
    next(error);
  }
});

/**
 * POST /measurements/hover/webhook - Handle Hover webhooks
 * Events: job-state-changed, model-created, capture-request-state-changed, deliverable-created
 */
router.post('/hover/webhook', async (req, res, next) => {
  try {
    // Verify webhook signature if provided
    const signature = req.headers['x-hover-signature'];
    // TODO: Implement signature verification using Hover's webhook secret

    await measurementService.handleHoverWebhook(req.body);

    res.sendStatus(200);
  } catch (error) {
    logger.error('Hover webhook error:', error);
    res.sendStatus(500);
  }
});

// ==========================================
// Manual Reports
// ==========================================

/**
 * POST /measurements/manual - Create manual measurement report
 */
router.post('/manual', authMiddleware, async (req, res, next) => {
  try {
    const report = await measurementService.createManualReport({
      ...req.body,
      userId: req.user.id,
    });

    logger.info(`Manual measurement report created: ${report.id} by ${req.user.email}`);

    res.status(201).json({ success: true, data: report });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Query Routes
// ==========================================

/**
 * GET /measurements/opportunity/:opportunityId - Get reports for opportunity
 */
router.get('/opportunity/:opportunityId', authMiddleware, async (req, res, next) => {
  try {
    const { all } = req.query;

    const reports = all === 'true'
      ? await measurementService.getReportsForOpportunity(req.params.opportunityId)
      : await measurementService.getReportForOpportunity(req.params.opportunityId);

    res.json({ success: true, data: reports });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /measurements/pending - Get pending orders
 */
router.get('/pending', authMiddleware, async (req, res, next) => {
  try {
    const { provider } = req.query;

    const orders = await measurementService.getPendingOrders(provider);

    res.json({ success: true, data: orders });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /measurements/stats - Get measurement statistics
 */
router.get('/stats', authMiddleware, async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const stats = await measurementService.getStats({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /measurements/:id - Get single measurement report
 */
router.get('/:id', authMiddleware, async (req, res, next) => {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    const report = await prisma.measurementReport.findUnique({
      where: { id: req.params.id },
      include: {
        opportunity: { select: { id: true, name: true } },
        account: { select: { id: true, name: true } },
        orderedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Measurement report not found' },
      });
    }

    res.json({ success: true, data: report });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// ==========================================
// OpenTopography Integration (USGS 3DEP LiDAR)
// ==========================================

/**
 * GET /measurements/opentopography/status - Check OpenTopography API status
 */
router.get('/opentopography/status', authMiddleware, async (req, res, next) => {
  try {
    const status = await measurementService.checkOpenTopographyStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /measurements/opentopography/coverage - Check coverage for a location
 */
router.get('/opentopography/coverage', authMiddleware, async (req, res, next) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'lat and lng are required' },
      });
    }

    const coverage = await measurementService.checkOpenTopographyCoverage(
      parseFloat(lat),
      parseFloat(lng)
    );

    res.json({ success: true, data: coverage });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /measurements/opentopography/dem - Get DEM data for a location
 */
router.post('/opentopography/dem', authMiddleware, async (req, res, next) => {
  try {
    const { lat, lng, radius = 50, dataset = 'USGS1m' } = req.body;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'lat and lng are required' },
      });
    }

    const demData = await measurementService.getOpenTopographyDEM(
      parseFloat(lat),
      parseFloat(lng),
      parseFloat(radius),
      dataset
    );

    // Return metadata, not the binary data
    res.json({
      success: true,
      data: {
        dataset: demData.dataset,
        bounds: demData.bounds,
        center: demData.center,
        radius: demData.radius,
        contentType: demData.contentType,
        contentLength: demData.contentLength,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Google Solar API Integration
// ==========================================

/**
 * GET /measurements/google-solar/status - Check Google Solar API status
 */
router.get('/google-solar/status', authMiddleware, async (req, res, next) => {
  try {
    const status = await measurementService.checkGoogleSolarStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /measurements/google-solar/building-insights - Get building insights for a location
 */
router.post('/google-solar/building-insights', authMiddleware, async (req, res, next) => {
  try {
    const { lat, lng, quality = 'HIGH' } = req.body;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'lat and lng are required' },
      });
    }

    const data = await measurementService.getGoogleSolarBuildingInsights(
      parseFloat(lat),
      parseFloat(lng),
      quality
    );

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /measurements/google-solar/data-layers - Get data layers (DSM, RGB, mask)
 */
router.post('/google-solar/data-layers', authMiddleware, async (req, res, next) => {
  try {
    const { lat, lng, radiusMeters = 50, quality = 'HIGH' } = req.body;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'lat and lng are required' },
      });
    }

    const data = await measurementService.getGoogleSolarDataLayers(
      parseFloat(lat),
      parseFloat(lng),
      parseFloat(radiusMeters),
      quality
    );

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Instant Measurement (Combined Google Solar + OpenTopography)
// ==========================================

/**
 * POST /measurements/instant - Generate instant measurement for an address
 * Uses Google Solar API for building detection and roof geometry
 * Optionally enhanced with OpenTopography LiDAR data
 */
router.post('/instant', authMiddleware, async (req, res, next) => {
  try {
    const { address, coordinates, opportunityId } = req.body;

    if (!address || !address.street || !address.city || !address.state) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'address with street, city, and state is required' },
      });
    }

    const measurement = await measurementService.generateInstantMeasurement(
      address,
      coordinates,
      opportunityId,
      req.user?.id
    );

    res.json({ success: true, data: measurement });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /measurements/instant/geocode - Geocode an address
 */
router.post('/instant/geocode', authMiddleware, async (req, res, next) => {
  try {
    const { address } = req.body;

    if (!address || !address.street || !address.city || !address.state) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'address with street, city, and state is required' },
      });
    }

    const result = await measurementService.geocodeAddress(address);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// ML-Powered Measurements (gSquare + Custom ML)
// ==========================================

/**
 * GET /measurements/ml/status - Check ML measurement system status
 * Returns status of gSquare API and ML Lambda
 */
router.get('/ml/status', authMiddleware, async (req, res, next) => {
  try {
    const status = await measurementService.checkMLStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /measurements/ml/coverage - Check gSquare coverage for a location
 */
router.get('/ml/coverage', authMiddleware, async (req, res, next) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'lat and lng are required' },
      });
    }

    const coverage = await measurementService.checkGSquareCoverage(
      parseFloat(lat),
      parseFloat(lng)
    );

    res.json({ success: true, data: coverage });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /measurements/ml/generate - Generate ML-powered measurement
 * Uses gSquare oblique imagery + custom ML for roof edge detection
 * Falls back to instant measurement if ML unavailable
 */
router.post('/ml/generate', authMiddleware, async (req, res, next) => {
  try {
    const { address, coordinates, opportunityId } = req.body;

    if (!address || !address.street || !address.city || !address.state) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'address with street, city, and state is required' },
      });
    }

    const measurement = await measurementService.generateMLMeasurement(
      address,
      coordinates,
      opportunityId,
      req.user?.id
    );

    logger.info(`ML measurement generated for ${address.street}, provider: ${measurement.provider}`);

    res.json({ success: true, data: measurement });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /measurements/ml/imagery - Fetch gSquare imagery for a location
 * Returns oblique imagery URLs for ML processing
 */
router.post('/ml/imagery', authMiddleware, async (req, res, next) => {
  try {
    const { lat, lng, resolution = 'high' } = req.body;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'lat and lng are required' },
      });
    }

    const imagery = await measurementService.fetchGSquareImagery(
      parseFloat(lat),
      parseFloat(lng),
      resolution
    );

    res.json({ success: true, data: imagery });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /measurements/ml/analyze - Run ML analysis on imagery
 * Invokes Lambda function for roof edge detection
 */
router.post('/ml/analyze', authMiddleware, async (req, res, next) => {
  try {
    const { imagery, solarData } = req.body;

    if (!imagery) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'imagery is required' },
      });
    }

    const analysis = await measurementService.invokeRoofMLAnalysis(imagery, solarData);

    res.json({ success: true, data: analysis });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// NAIP Free Measurement Pipeline Routes
// ==========================================
// Free roof measurements using NAIP (National Agriculture Imagery Program) aerial imagery
// NAIP is public domain imagery from USGS - no per-report costs
// Uses AWS Lambda pipeline: naip_fetcher → roof_segmenter → measurement_calculator → report_generator

/**
 * GET /measurements/naip/status - Check NAIP pipeline configuration status
 */
router.get('/naip/status', authMiddleware, async (req, res, next) => {
  try {
    const isEnabled = measurementService.isNAIPPipelineEnabled();
    res.json({
      success: true,
      data: {
        enabled: isEnabled,
        provider: 'NAIP',
        description: 'Free roof measurements using public NAIP aerial imagery',
        coverage: 'Continental United States',
        resolution: '~1m/pixel (some areas 0.6m)',
        updateFrequency: 'Every 2-3 years',
        cost: '$0 (free)',
        features: [
          'Free NAIP aerial imagery from USGS',
          'CV-based roof segmentation',
          'Edge detection (ridge, hip, valley, eave, rake)',
          'Area and pitch estimation',
          'PDF report generation',
        ],
        pipeline: [
          'naip_fetcher - Fetch aerial imagery from NAIP',
          'roof_segmenter - Segment roof boundaries and edges',
          'measurement_calculator - Calculate linear measurements',
          'report_generator - Generate PDF report',
        ],
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /measurements/naip/coverage - Check if NAIP has coverage for a location
 */
router.get('/naip/coverage', authMiddleware, async (req, res, next) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'lat and lng are required' },
      });
    }

    const coverage = await measurementService.checkNAIPCoverage(
      parseFloat(lat),
      parseFloat(lng)
    );

    res.json({ success: true, data: coverage });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /measurements/naip/generate - Generate a FREE measurement using NAIP pipeline
 * This is the main endpoint for free roof measurements
 */
router.post('/naip/generate', authMiddleware, async (req, res, next) => {
  try {
    const { address, coordinates, opportunityId } = req.body;
    const userId = req.user?.id;

    // Validate inputs
    if (!coordinates && !address) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'Either address or coordinates required' },
      });
    }

    // Geocode address if needed
    let lat, lng;
    if (coordinates) {
      lat = coordinates.latitude;
      lng = coordinates.longitude;
    } else if (address) {
      // Use geocoding service - returns { lat, lng, formattedAddress }
      const geocoded = await measurementService.geocodeAddress(address);
      if (!geocoded) {
        return res.status(400).json({
          success: false,
          error: { code: 'GEOCODE_FAILED', message: 'Unable to geocode address' },
        });
      }
      lat = geocoded.lat;
      lng = geocoded.lng;
    }

    // Check NAIP coverage first
    logger.info(`NAIP Generate: Checking coverage for lat=${lat}, lng=${lng}`);
    const coverage = await measurementService.checkNAIPCoverage(lat, lng);
    logger.info(`NAIP Generate: Coverage result = ${JSON.stringify(coverage)}`);

    if (!coverage.covered) {
      logger.warn(`NAIP Generate: No coverage - error: ${coverage.error}`);
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_COVERAGE',
          message: coverage.error || 'No NAIP imagery available for this location',
          details: coverage,
        },
      });
    }

    logger.info(`NAIP free measurement requested by ${req.user.email} for (${lat}, ${lng})`);

    // Generate free measurement using NAIP pipeline
    // Method signature: generateFreeMeasurement(opportunityId, options = {})
    const result = await measurementService.generateFreeMeasurement(opportunityId, {
      address: address || { street: '', city: '', state: '', zip: '' },
      userId,
      latitude: parseFloat(lat),
      longitude: parseFloat(lng),
    });

    res.json({
      success: true,
      data: result,
      message: 'Free measurement generated using NAIP imagery',
    });
  } catch (error) {
    logger.error('NAIP measurement generation failed:', error);
    next(error);
  }
});

/**
 * POST /measurements/naip/fetch-imagery - Fetch NAIP imagery for a location (debugging/preview)
 */
router.post('/naip/fetch-imagery', authMiddleware, async (req, res, next) => {
  try {
    const { lat, lng, widthMeters = 100, heightMeters = 100, zoom = 19 } = req.body;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'lat and lng are required' },
      });
    }

    // Invoke NAIP fetcher Lambda directly
    const imagery = await measurementService.invokeNAIPFetcher(
      parseFloat(lat),
      parseFloat(lng),
      { widthMeters, heightMeters }
    );

    res.json({
      success: true,
      data: imagery,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /measurements/naip/segment - Run roof segmentation on imagery (debugging)
 */
router.post('/naip/segment', authMiddleware, async (req, res, next) => {
  try {
    const { imageBase64, gsdMeters = 0.3, buildingFootprint } = req.body;

    if (!imageBase64) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'imageBase64 is required' },
      });
    }

    // Invoke roof segmenter Lambda directly
    const segmentation = await measurementService.invokeRoofSegmenter(
      imageBase64,
      gsdMeters,
      buildingFootprint
    );

    res.json({
      success: true,
      data: segmentation,
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Geospan gSquare API Routes
// ==========================================
// High-resolution oblique aerial imagery with instant roof estimates
// API Documentation: https://docs.geospan.com/gsquare/

/**
 * GET /measurements/geospan/status - Check Geospan API configuration status
 */
router.get('/geospan/status', authMiddleware, async (req, res, next) => {
  try {
    const isConfigured = measurementService.isGeospanConfigured();
    res.json({
      success: true,
      data: {
        configured: isConfigured,
        provider: 'geospan',
        apiUrl: 'https://api.geospan.com/remote4d/v1/api',
        features: [
          'Instant roof area estimates',
          'High-resolution oblique imagery (N/E/S/W views)',
          'Roof pitch calculation',
          'Confidence scoring',
          'Weather data at capture time',
        ],
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /measurements/geospan/coverage - Check if Geospan has coverage for a location
 */
router.get('/geospan/coverage', authMiddleware, async (req, res, next) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'lat and lng are required' },
      });
    }

    const coverage = await measurementService.checkGeospanCoverage(
      parseFloat(lat),
      parseFloat(lng)
    );

    res.json({ success: true, data: coverage });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /measurements/geospan/estimate - Submit a Geospan roof estimate request
 * Initiates async estimate - returns queryKey for polling
 */
router.post('/geospan/estimate', authMiddleware, async (req, res, next) => {
  try {
    const { lat, lng, options = {} } = req.body;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'lat and lng are required' },
      });
    }

    const result = await measurementService.submitGeospanEstimate(
      parseFloat(lat),
      parseFloat(lng),
      options
    );

    logger.info(`Geospan estimate submitted by ${req.user.email}, queryKey: ${result.queryKey}`);

    res.status(202).json({
      success: true,
      data: result,
      message: 'Estimate request submitted. Use the queryKey to poll for results.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /measurements/geospan/poll/:queryKey - Poll for Geospan estimate results
 * Returns PENDING, SUCCESS with data, or FAILURE with error
 */
router.get('/geospan/poll/:queryKey', authMiddleware, async (req, res, next) => {
  try {
    const { queryKey } = req.params;

    const result = await measurementService.pollGeospanEstimate(queryKey);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /measurements/geospan/estimate-sync - Get Geospan estimate synchronously
 * Submits request and polls until complete (max ~40 seconds)
 * Best for interactive use where user is waiting for results
 */
router.post('/geospan/estimate-sync', authMiddleware, async (req, res, next) => {
  try {
    const { lat, lng, options = {} } = req.body;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'lat and lng are required' },
      });
    }

    const result = await measurementService.getGeospanEstimate(
      parseFloat(lat),
      parseFloat(lng),
      options
    );

    logger.info(`Geospan sync estimate completed for ${lat},${lng} - status: ${result.status}`);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /measurements/geospan/imagery - Fetch Geospan oblique imagery for a location
 * Returns nadir and 4 oblique views (N/E/S/W)
 */
router.post('/geospan/imagery', authMiddleware, async (req, res, next) => {
  try {
    const { lat, lng, options = {} } = req.body;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'lat and lng are required' },
      });
    }

    const imagery = await measurementService.fetchGeospanImagery(
      parseFloat(lat),
      parseFloat(lng),
      options
    );

    res.json({ success: true, data: imagery });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /measurements/geospan/footprints - Get building footprints in a bounding box
 * Uses Geospan Spatial API to fetch footprints for an area
 */
router.post('/geospan/footprints', authMiddleware, async (req, res, next) => {
  try {
    const { minLat, minLng, maxLat, maxLng } = req.body;

    if (!minLat || !minLng || !maxLat || !maxLng) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'minLat, minLng, maxLat, and maxLng are required' },
      });
    }

    const footprints = await measurementService.getGeospanFootprints(
      parseFloat(minLat),
      parseFloat(minLng),
      parseFloat(maxLat),
      parseFloat(maxLng)
    );

    res.json({ success: true, data: footprints });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /measurements/best-imagery - Find best imagery provider for a location
 * Checks both gSquare and Geospan availability, returns recommendation
 */
router.get('/best-imagery', authMiddleware, async (req, res, next) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'lat and lng are required' },
      });
    }

    const result = await measurementService.getBestImageryProvider(
      parseFloat(lat),
      parseFloat(lng)
    );

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Report Types & Pricing
// ==========================================

/**
 * GET /measurements/report-types - Get available report types and pricing
 */
router.get('/report-types', authMiddleware, async (req, res, next) => {
  try {
    const reportTypes = {
      eagleView: [
        { code: 'BASIC', name: 'Residential Basic', price: 25.00 },
        { code: 'PREMIUM', name: 'Residential Premium', price: 45.00 },
        { code: 'ULTRA_PREMIUM', name: 'Residential Ultra Premium', price: 65.00 },
        { code: 'COMMERCIAL', name: 'Commercial', price: 95.00 },
        { code: 'WALLS_ONLY', name: 'Walls Only', price: 35.00 },
        { code: 'ROOF_AND_WALLS', name: 'Roof and Walls', price: 75.00 },
      ],
      gaf: [
        { code: 'BASIC', name: 'QuickMeasure Basic', price: 20.00 },
        { code: 'PREMIUM', name: 'QuickMeasure Premium', price: 40.00 },
      ],
      hover: [
        { code: 'EXTERIOR', name: 'Exterior 3D Model', price: 25.00, description: 'Full exterior measurements with 3D model' },
        { code: 'EXTERIOR_PLUS', name: 'Exterior + Design', price: 45.00, description: 'Includes design visualization with real materials' },
        { code: 'FULL_PROPERTY', name: 'Full Property', price: 75.00, description: 'Exterior + interior measurements and 3D model' },
      ],
      // Comparison guide for choosing provider
      comparison: {
        eagleView: {
          source: 'Satellite/Aerial imagery',
          turnaround: '1-3 business days',
          bestFor: 'Quick roof measurements without site visit',
          limitations: 'No interior, limited siding detail',
        },
        gaf: {
          source: 'Satellite/Aerial imagery',
          turnaround: '1-2 business days',
          bestFor: 'Roof-focused measurements with GAF material integration',
          limitations: 'Roofing only, no siding/windows',
        },
        hover: {
          source: 'Smartphone photos (site visit required)',
          turnaround: '24-48 hours after photo capture',
          bestFor: '3D models, design visualization, siding/windows',
          limitations: 'Requires on-site photo capture',
          features: [
            'Interactive 3D model',
            'Design visualization with real materials (GAF, JamesHardie, Alside)',
            'Detailed window/door measurements',
            'Siding area calculations',
            'SketchUp export for custom designs',
          ],
        },
      },
    };

    res.json({ success: true, data: reportTypes });
  } catch (error) {
    next(error);
  }
});

export default router;
