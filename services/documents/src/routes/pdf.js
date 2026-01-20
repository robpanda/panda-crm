// PDF Generation Routes
import { Router } from 'express';
import { pdfService } from '../services/pdfService.js';
import { logger } from '../middleware/logger.js';

const router = Router();

/**
 * Generate Invoice PDF
 * POST /api/documents/pdf/invoice/:id
 */
router.post('/invoice/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    logger.info(`PDF generation request for invoice: ${id}`);

    const result = await pdfService.generateInvoicePdf(id);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Invoice PDF generation failed:', error);
    next(error);
  }
});

/**
 * Generate Statement PDF
 * POST /api/documents/pdf/statement/:accountId
 * Body: { startDate?, endDate? }
 */
router.post('/statement/:accountId', async (req, res, next) => {
  try {
    const { accountId } = req.params;
    const { startDate, endDate } = req.body;
    logger.info(`PDF generation request for statement: ${accountId}`);

    const result = await pdfService.generateStatementPdf(accountId, { startDate, endDate });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Statement PDF generation failed:', error);
    next(error);
  }
});

/**
 * Generate Work Order PDF
 * POST /api/documents/pdf/workorder/:id
 */
router.post('/workorder/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    logger.info(`PDF generation request for work order: ${id}`);

    const result = await pdfService.generateWorkOrderPdf(id);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Work order PDF generation failed:', error);
    next(error);
  }
});

/**
 * Generate Quote PDF
 * POST /api/documents/pdf/quote/:id
 */
router.post('/quote/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    logger.info(`PDF generation request for quote: ${id}`);

    const result = await pdfService.generateQuotePdf(id);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Quote PDF generation failed:', error);
    next(error);
  }
});

/**
 * Generate Roof Measurement Report PDF
 * POST /api/documents/pdf/roof-report
 * Body: {
 *   measurements: { total_area_sqft, roof_squares, predominant_pitch, facet_count, ridge, hip, valley, etc. },
 *   address?: { street, city, state, zip },
 *   opportunityId?: string,
 *   imagery?: { year, resolution, source },
 *   location?: { latitude, longitude },
 *   aerialImage?: string | Buffer,       // Base64 or Buffer of aerial image (PNG/JPG)
 *   segmentationImage?: string | Buffer, // Base64 or Buffer of segmentation overlay image
 *   includeImageryPage?: boolean         // Whether to include aerial imagery page (default: true if aerialImage provided)
 * }
 */
router.post('/roof-report', async (req, res, next) => {
  try {
    const {
      measurements,
      address,
      opportunityId,
      imagery,
      location,
      aerialImage,
      segmentationImage,
      includeImageryPage,
    } = req.body;

    if (!measurements) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'measurements object is required' },
      });
    }

    logger.info(`Roof measurement report PDF generation request`, {
      opportunityId,
      hasAddress: !!address,
      totalArea: measurements.total_area_sqft,
      hasAerialImage: !!aerialImage,
    });

    const result = await pdfService.generateRoofReportPdf(measurements, {
      address,
      opportunityId,
      imagery,
      location,
      aerialImage,
      segmentationImage,
      includeImageryPage,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Roof report PDF generation failed:', error);
    next(error);
  }
});

/**
 * Batch generate PDFs
 * POST /api/documents/pdf/batch
 * Body: { type: 'invoice'|'statement'|'workorder'|'quote', ids: string[] }
 */
router.post('/batch', async (req, res, next) => {
  try {
    const { type, ids } = req.body;

    if (!type || !ids || !Array.isArray(ids)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'type and ids[] are required' },
      });
    }

    logger.info(`Batch PDF generation: ${type} x ${ids.length}`);

    const results = [];
    const errors = [];

    for (const id of ids) {
      try {
        let result;
        switch (type) {
          case 'invoice':
            result = await pdfService.generateInvoicePdf(id);
            break;
          case 'statement':
            result = await pdfService.generateStatementPdf(id);
            break;
          case 'workorder':
            result = await pdfService.generateWorkOrderPdf(id);
            break;
          case 'quote':
            result = await pdfService.generateQuotePdf(id);
            break;
          default:
            throw new Error(`Unknown PDF type: ${type}`);
        }
        results.push({ id, ...result });
      } catch (err) {
        errors.push({ id, error: err.message });
      }
    }

    res.json({
      success: true,
      data: {
        generated: results.length,
        failed: errors.length,
        results,
        errors,
      },
    });
  } catch (error) {
    logger.error('Batch PDF generation failed:', error);
    next(error);
  }
});

export default router;
