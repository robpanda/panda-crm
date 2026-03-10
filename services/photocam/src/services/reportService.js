import { v4 as uuidv4 } from 'uuid';
import prisma from '../prisma.js';
import { s3Service } from './s3Service.js';
import { logger } from '../middleware/logger.js';

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildKeyScope(report) {
  return report.opportunityId || report.projectId || 'unscoped';
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
}

export async function listReports(params = {}) {
  const page = toInt(params.page, 1);
  const limit = Math.min(toInt(params.limit, 25), 100);
  const skip = (page - 1) * limit;

  const where = {};
  if (params.projectId) where.projectId = params.projectId;
  if (params.opportunityId) where.opportunityId = params.opportunityId;
  if (params.status) where.status = params.status;

  const [data, total] = await Promise.all([
    prisma.photoReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.photoReport.count({ where }),
  ]);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getReportById(id) {
  return prisma.photoReport.findUnique({
    where: { id },
    include: {
      items: {
        orderBy: { sortOrder: 'asc' },
        include: {
          photo: {
            select: {
              id: true,
              fileName: true,
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
}

export async function generateReport(reportId, userId) {
  const report = await prisma.photoReport.findUnique({ where: { id: reportId } });
  if (!report) {
    const err = new Error('Report not found');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  await prisma.photoReport.update({
    where: { id: reportId },
    data: {
      status: 'PROCESSING',
      errorMessage: null,
    },
  });

  const exportJob = await prisma.photoExportJob.create({
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

  try {
    // Sprint 1 scaffold payload; Sprint 2 replaces with branded PDF renderer.
    const exportPayload = {
      reportId: report.id,
      name: report.name,
      generatedAt: new Date().toISOString(),
      scope: {
        projectId: report.projectId,
        opportunityId: report.opportunityId,
      },
      reportConfig: report.reportConfig || {},
      message: 'Report scaffold generated. PDF renderer is delivered in Sprint 2.',
    };

    const key = `reports/${buildKeyScope(report)}/${report.id}.json`;
    const upload = await s3Service.uploadFile(
      Buffer.from(JSON.stringify(exportPayload, null, 2), 'utf8'),
      key,
      'application/json',
      { reportId: report.id, type: 'photocam-report-scaffold' }
    );

    const [updatedReport] = await prisma.$transaction([
      prisma.photoReport.update({
        where: { id: reportId },
        data: {
          status: 'GENERATED',
          fileKey: key,
          fileUrl: upload.url,
          generatedAt: new Date(),
        },
      }),
      prisma.photoExportJob.update({
        where: { id: exportJob.id },
        data: {
          status: 'READY',
          fileKey: key,
          fileUrl: upload.url,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      }),
    ]);

    return updatedReport;
  } catch (error) {
    logger.error('Failed to generate report scaffold', { reportId, error: error.message });

    await prisma.$transaction([
      prisma.photoReport.update({
        where: { id: reportId },
        data: {
          status: 'FAILED',
          errorMessage: error.message,
        },
      }),
      prisma.photoExportJob.update({
        where: { id: exportJob.id },
        data: {
          status: 'FAILED',
          errorMessage: error.message,
        },
      }),
    ]);

    throw error;
  }
}

export async function getReportDownload(reportId) {
  const report = await prisma.photoReport.findUnique({ where: { id: reportId } });
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
}

export const reportService = {
  createReport,
  listReports,
  getReportById,
  generateReport,
  getReportDownload,
  upsertReportItems,
};

export default reportService;
