import { v4 as uuidv4 } from 'uuid';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import prisma from '../prisma.js';
import { s3Service } from './s3Service.js';
import { checklistService } from './checklistService.js';
import { logger } from '../middleware/logger.js';

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildKeyScope(report) {
  return report.opportunityId || report.projectId || 'unscoped';
}

function detectImageFormat(buffer) {
  if (!buffer || buffer.length < 4) return 'unknown';
  const sig = buffer.subarray(0, 8);
  if (sig[0] === 0x89 && sig[1] === 0x50 && sig[2] === 0x4e && sig[3] === 0x47) return 'png';
  if (sig[0] === 0xff && sig[1] === 0xd8 && sig[2] === 0xff) return 'jpg';
  return 'unknown';
}

function resolvePandaPhotoConfig(reportConfig = {}) {
  const cfg = reportConfig?.pandaPhoto || reportConfig?.panda_mode || {};
  const enforced = Boolean(
    cfg.enabled
    || cfg.enforceChecklistCompletion
    || reportConfig?.enforceChecklistCompletion
  );

  const checklistIds = Array.from(
    new Set(
      [
        ...(Array.isArray(cfg.checklistIds) ? cfg.checklistIds : []),
        cfg.checklistId,
        reportConfig?.checklistId,
      ].filter(Boolean)
    )
  );

  const blockReportGeneration = cfg.blockReportGeneration !== false;

  return {
    enforced,
    blockReportGeneration,
    checklistIds,
  };
}

function normalizeReportConfig(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  return {};
}

function extractSelectedPhotoIds(reportConfig = {}) {
  const config = normalizeReportConfig(reportConfig);
  const selected = Array.isArray(config.selectedPhotoIds) ? config.selectedPhotoIds : [];
  return selected.filter(Boolean);
}

async function hydrateReportItemsFromConfig(report) {
  const selectedPhotoIds = extractSelectedPhotoIds(report?.reportConfig);
  if (!selectedPhotoIds.length) return [];

  const photos = await prisma.photo.findMany({
    where: { id: { in: selectedPhotoIds }, deletedAt: null },
    select: {
      id: true,
      fileName: true,
      fileKey: true,
      originalUrl: true,
      displayUrl: true,
      thumbnailUrl: true,
      photoType: true,
      caption: true,
    },
  });
  const byId = new Map(photos.map((photo) => [photo.id, photo]));

  return selectedPhotoIds
    .map((photoId, index) => ({
      id: `fallback-${photoId}`,
      reportId: report.id,
      photoId,
      sortOrder: index,
      photo: byId.get(photoId) || null,
    }))
    .filter((item) => item.photo);
}

function isPrismaMissingColumnError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  if (code === 'P2022' || code === 'P2021') return true;
  if (/P2022|P2021/.test(message)) return true;
  if (/does not exist|Unknown (?:field|argument)|column .* does not exist/i.test(message)) return true;
  return false;
}

async function validatePandaPhotoForReport(report) {
  const cfg = resolvePandaPhotoConfig(report?.reportConfig || {});

  if (!cfg.enforced) {
    return {
      enforced: false,
      blockReportGeneration: false,
      canGenerate: true,
      checklistIds: [],
      failures: [],
      warnings: [],
    };
  }

  let checklistIds = [...cfg.checklistIds];
  const warnings = [];

  if (!checklistIds.length && report?.projectId) {
    const scopedChecklists = await prisma.photoChecklist.findMany({
      where: {
        projectId: report.projectId,
        template: {
          pandaPhotoOnly: true,
        },
      },
      select: { id: true },
      take: 25,
    });
    checklistIds = scopedChecklists.map((item) => item.id);
  }

  if (!checklistIds.length) {
    warnings.push('PandaPhoto enforcement is enabled but no checklist was found for validation.');
    return {
      enforced: true,
      blockReportGeneration: cfg.blockReportGeneration,
      canGenerate: true,
      checklistIds,
      failures: [],
      warnings,
    };
  }

  const results = [];
  for (const checklistId of checklistIds) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await checklistService.validateChecklistForCompletion(checklistId, { forcePandaMode: true });
      results.push(result);
    } catch (error) {
      warnings.push(`Checklist ${checklistId} validation failed: ${error.message}`);
    }
  }

  const failures = results.filter((result) => !result.canComplete);
  const canGenerate = failures.length === 0 || !cfg.blockReportGeneration;

  return {
    enforced: true,
    blockReportGeneration: cfg.blockReportGeneration,
    canGenerate,
    checklistIds,
    failures,
    warnings,
  };
}

async function buildReportPdfBuffer(report, items) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const cover = pdfDoc.addPage([612, 792]);
  cover.drawText(report.name, { x: 42, y: 740, size: 20, font: fontBold, color: rgb(0.11, 0.11, 0.11) });
  cover.drawText(`Generated ${new Date().toLocaleString()}`, {
    x: 42,
    y: 712,
    size: 11,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });
  cover.drawText(`Photos included: ${items.length}`, {
    x: 42,
    y: 695,
    size: 11,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });

  if (!items.length) {
    cover.drawText('No photos selected for this report.', { x: 42, y: 660, size: 12, font });
    return Buffer.from(await pdfDoc.save());
  }

  for (const [index, item] of items.entries()) {
    const page = pdfDoc.addPage([612, 792]);
    page.drawText(`${report.name} — Photo ${index + 1}`, {
      x: 40,
      y: 760,
      size: 14,
      font: fontBold,
      color: rgb(0.12, 0.12, 0.12),
    });
    page.drawText(item.photo?.fileName || item.photo?.caption || item.photo?.id || 'Photo', {
      x: 40,
      y: 740,
      size: 10,
      font,
      color: rgb(0.32, 0.32, 0.32),
    });

    if (!item.photo?.fileKey) {
      page.drawText('Image not available for embedding.', { x: 40, y: 700, size: 11, font });
      // eslint-disable-next-line no-continue
      continue;
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      const bytes = await s3Service.getObjectBuffer(item.photo.fileKey);
      const format = detectImageFormat(bytes);
      let embeddedImage = null;
      if (format === 'png') {
        // eslint-disable-next-line no-await-in-loop
        embeddedImage = await pdfDoc.embedPng(bytes);
      } else if (format === 'jpg') {
        // eslint-disable-next-line no-await-in-loop
        embeddedImage = await pdfDoc.embedJpg(bytes);
      }

      if (!embeddedImage) {
        page.drawText('Image format unsupported for PDF embedding.', { x: 40, y: 700, size: 11, font });
        // eslint-disable-next-line no-continue
        continue;
      }

      const maxWidth = 532;
      const maxHeight = 620;
      const scale = Math.min(maxWidth / embeddedImage.width, maxHeight / embeddedImage.height, 1);
      const width = embeddedImage.width * scale;
      const height = embeddedImage.height * scale;
      const x = 40 + (maxWidth - width) / 2;
      const y = 80 + (maxHeight - height) / 2;

      page.drawImage(embeddedImage, { x, y, width, height });
    } catch (error) {
      page.drawText(`Unable to load image: ${error.message}`, { x: 40, y: 700, size: 11, font });
    }
  }

  return Buffer.from(await pdfDoc.save());
}

export async function createReport(payload, userId) {
  if (!payload?.name) {
    const err = new Error('name is required');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  if (!payload.projectId && !payload.opportunityId) {
    const err = new Error('projectId or opportunityId is required');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  try {
    const created = await prisma.photoReport.create({
      data: {
        name: payload.name,
        templateId: payload.templateId || null,
        projectId: payload.projectId || null,
        opportunityId: payload.opportunityId || null,
        reportConfig: payload.reportConfig || {},
        createdById: userId || null,
      },
    });

    return created;
  } catch (error) {
    if (!isPrismaMissingColumnError(error)) throw error;
    logger.warn(`Photo report create fallback due to schema mismatch: ${error.message}`);
    const err = new Error('Photo reports are temporarily unavailable until schema sync completes');
    err.statusCode = 409;
    err.code = 'FEATURE_UNAVAILABLE';
    throw err;
  }
}

export async function listReports(params = {}) {
  const page = toInt(params.page, 1);
  const limit = Math.min(toInt(params.limit, 25), 100);
  const skip = (page - 1) * limit;

  const where = {};
  if (params.projectId) where.projectId = params.projectId;
  if (params.opportunityId) where.opportunityId = params.opportunityId;
  if (params.status) where.status = params.status;

  let data = [];
  let total = 0;
  try {
    [data, total] = await Promise.all([
      prisma.photoReport.findMany({
        where,
        select: {
          id: true,
          templateId: true,
          projectId: true,
          opportunityId: true,
          status: true,
          reportConfig: true,
          fileKey: true,
          fileUrl: true,
          generatedAt: true,
          errorMessage: true,
          createdById: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.photoReport.count({ where }),
    ]);
  } catch (error) {
    if (!isPrismaMissingColumnError(error)) throw error;
    logger.warn(`Photo reports list fallback due to schema mismatch: ${error.message}`);
    data = [];
    total = 0;
  }

  const normalized = data.map((item) => ({
    ...item,
    name: item.name || `Report ${String(item.id || '').slice(0, 8)}`,
  }));

  return {
    data: normalized,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getReportById(id) {
  try {
    return await prisma.photoReport.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            photo: {
              select: {
                id: true,
                fileName: true,
                fileKey: true,
                originalUrl: true,
                displayUrl: true,
                thumbnailUrl: true,
                photoType: true,
                caption: true,
              },
            },
          },
        },
      },
    });
  } catch (error) {
    if (!isPrismaMissingColumnError(error)) throw error;
    logger.warn(`Photo report read fallback due to schema mismatch: ${error.message}`);
    const baseReport = await prisma.photoReport.findUnique({
      where: { id },
    });
    if (!baseReport) return null;
    const items = await hydrateReportItemsFromConfig(baseReport);
    return {
      ...baseReport,
      items,
    };
  }
}

export async function generateReport(reportId, userId) {
  let report;
  try {
    report = await prisma.photoReport.findUnique({
      where: { id: reportId },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            photo: {
              select: {
                id: true,
                fileName: true,
                fileKey: true,
                caption: true,
              },
            },
          },
        },
      },
    });
  } catch (error) {
    if (!isPrismaMissingColumnError(error)) throw error;
    logger.warn(`Photo report generate fallback due to schema mismatch: ${error.message}`);
    const baseReport = await prisma.photoReport.findUnique({
      where: { id: reportId },
    });
    if (baseReport) {
      const fallbackItems = await hydrateReportItemsFromConfig(baseReport);
      report = {
        ...baseReport,
        items: fallbackItems,
      };
    }
  }
  if (!report) {
    const err = new Error('Report not found');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  const pandaValidation = await validatePandaPhotoForReport(report);
  if (pandaValidation.enforced && pandaValidation.blockReportGeneration && !pandaValidation.canGenerate) {
    const err = new Error('PandaPhoto checklist requirements are not complete for this report');
    err.statusCode = 409;
    err.code = 'PANDAPHOTO_INCOMPLETE';
    err.details = {
      checklistIds: pandaValidation.checklistIds,
      failures: pandaValidation.failures,
      warnings: pandaValidation.warnings,
    };
    throw err;
  }

  await prisma.photoReport.update({
    where: { id: reportId },
    data: {
      status: 'PROCESSING',
      errorMessage: null,
    },
  });

  let exportJob = null;
  try {
    exportJob = await prisma.photoExportJob.create({
      data: {
        projectId: report.projectId,
        opportunityId: report.opportunityId,
        outputFormat: 'pdf',
        requestJson: {
          reportId,
          templateId: report.templateId,
          reportConfig: report.reportConfig || {},
          requestedBy: userId || null,
        },
        status: 'PROCESSING',
        createdById: userId || null,
      },
    });
  } catch (error) {
    if (!isPrismaMissingColumnError(error)) throw error;
    logger.warn(`Photo report generate: export job table unavailable, continuing without async job tracking: ${error.message}`);
  }

  try {
    const pdfBuffer = await buildReportPdfBuffer(report, report.items || []);
    const key = `reports/${buildKeyScope(report)}/${report.id}.pdf`;
    const upload = await s3Service.uploadFile(
      pdfBuffer,
      key,
      'application/pdf',
      { reportId: report.id, type: 'photocam-report-pdf' }
    );

    const transactionOps = [
      prisma.photoReport.update({
        where: { id: reportId },
        data: {
          status: 'GENERATED',
          fileKey: key,
          fileUrl: upload.url,
          generatedAt: new Date(),
        },
      }),
    ];
    if (exportJob?.id) {
      transactionOps.push(
        prisma.photoExportJob.update({
          where: { id: exportJob.id },
          data: {
            status: 'READY',
            fileKey: key,
            fileUrl: upload.url,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        })
      );
    }
    const [updatedReport] = await prisma.$transaction(transactionOps);

    return {
      ...updatedReport,
      pandaValidation,
    };
  } catch (error) {
    logger.error('Failed to generate report pdf', { reportId, error: error.message });

    const failedOps = [
      prisma.photoReport.update({
        where: { id: reportId },
        data: {
          status: 'FAILED',
          errorMessage: error.message,
        },
      }),
    ];
    if (exportJob?.id) {
      failedOps.push(
        prisma.photoExportJob.update({
          where: { id: exportJob.id },
          data: {
            status: 'FAILED',
            errorMessage: error.message,
          },
        })
      );
    }
    await prisma.$transaction(failedOps);

    throw error;
  }
}

export async function getReportDownload(reportId) {
  let report;
  try {
    report = await prisma.photoReport.findUnique({
      where: { id: reportId },
      select: { id: true, fileKey: true, status: true, generatedAt: true },
    });
  } catch (error) {
    if (!isPrismaMissingColumnError(error)) throw error;
    logger.warn(`Photo report download fallback due to schema mismatch: ${error.message}`);
    const err = new Error('Report download is unavailable until report schema is synced');
    err.statusCode = 409;
    err.code = 'REPORT_NOT_READY';
    throw err;
  }
  if (!report) {
    const err = new Error('Report not found');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (!report.fileKey) {
    const err = new Error('Report file is not available yet');
    err.statusCode = 409;
    err.code = 'REPORT_NOT_READY';
    throw err;
  }

  const url = await s3Service.getPresignedDownloadUrl(report.fileKey, 60 * 15);
  return { url, status: report.status, generatedAt: report.generatedAt };
}

export async function upsertReportItems(reportId, items = []) {
  const normalized = Array.isArray(items) ? items : [];
  try {
    await prisma.photoReportItem.deleteMany({ where: { reportId } });

    if (!normalized.length) {
      return [];
    }

    await prisma.photoReportItem.createMany({
      data: normalized.map((item, index) => ({
        id: uuidv4(),
        reportId,
        photoId: item.photoId || null,
        checklistItemId: item.checklistItemId || null,
        sectionKey: item.sectionKey || null,
        sortOrder: item.sortOrder ?? index,
      })),
    });

    return prisma.photoReportItem.findMany({
      where: { reportId },
      orderBy: { sortOrder: 'asc' },
    });
  } catch (error) {
    if (!isPrismaMissingColumnError(error)) throw error;
    logger.warn(`Photo report items fallback due to schema mismatch: ${error.message}`);
    const report = await prisma.photoReport.findUnique({
      where: { id: reportId },
      select: { id: true, reportConfig: true },
    });
    if (!report) {
      const err = new Error('Report not found');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    const config = normalizeReportConfig(report.reportConfig);
    const selectedPhotoIds = normalized
      .map((item) => item.photoId)
      .filter(Boolean);
    await prisma.photoReport.update({
      where: { id: reportId },
      data: {
        reportConfig: {
          ...config,
          selectedPhotoIds: Array.from(new Set(selectedPhotoIds)),
          selectedPhotoIdsUpdatedAt: new Date().toISOString(),
        },
      },
    });
    return hydrateReportItemsFromConfig({ ...report, reportConfig: { ...config, selectedPhotoIds } });
  }
}

export const reportService = {
  createReport,
  listReports,
  getReportById,
  generateReport,
  getReportDownload,
  upsertReportItems,
};

export const reportServiceTestables = {
  detectImageFormat,
  buildReportPdfBuffer,
  resolvePandaPhotoConfig,
};

export default reportService;
