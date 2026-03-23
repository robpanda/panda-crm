import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.js';
import prisma from '../prisma.js';
import { callCenterImportService } from '../services/callCenterImportService.js';

const router = Router();
const REVIEW_ITEM_STATUSES = new Set(['OPEN', 'RESOLVED', 'IGNORED']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

function parseBoolean(value) {
  return value === true || value === 'true';
}

function parseJsonValue(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getPayload(req) {
  const rows = parseJsonValue(req.body?.rows) ?? req.body?.rows ?? null;
  const userAliasMap = parseJsonValue(req.body?.userAliasMap) ?? req.body?.userAliasMap ?? null;

  return {
    fileBuffer: req.file?.buffer || null,
    fileName: req.file?.originalname || req.body.fileName || 'call-center-import.xlsx',
    rows: Array.isArray(rows) ? rows : null,
    confirm: parseBoolean(req.body?.confirm),
    previewToken: typeof req.body?.previewToken === 'string' ? req.body.previewToken.trim() : null,
    allowRiskOverride: parseBoolean(req.body?.allowRiskOverride),
    userAliasMap: userAliasMap && typeof userAliasMap === 'object' && !Array.isArray(userAliasMap) ? userAliasMap : null,
  };
}

router.post('/preview', authMiddleware, upload.single('file'), async (req, res, next) => {
  try {
    const payload = getPayload(req);
    const result = await callCenterImportService.previewImport(payload);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.post('/execute', authMiddleware, upload.single('file'), async (req, res, next) => {
  try {
    const payload = getPayload(req);
    const result = await callCenterImportService.executeImport(payload, req.user || {});
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.get('/review/runs', authMiddleware, async (req, res, next) => {
  try {
    const limit = parsePositiveInt(req.query?.limit, 50);
    const runs = await prisma.callCenterImportRun.findMany({
      orderBy: { executedAt: 'desc' },
      take: limit,
      include: {
        executedBy: {
          select: { id: true, fullName: true, email: true },
        },
        reviewItems: {
          select: { status: true },
        },
      },
    });

    res.json({
      success: true,
      data: runs.map((run) => ({
        id: run.id,
        previewToken: run.previewToken,
        workbookFileName: run.workbookFileName,
        workbookSha256: run.workbookSha256,
        executedAt: run.executedAt,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
        executedBy: run.executedBy,
        summaryJson: run.summaryJson,
        aliasMapJson: run.aliasMapJson,
        totalReviewItems: run.reviewItems.length,
        openReviewItems: run.reviewItems.filter((item) => item.status === 'OPEN').length,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/review/items', authMiddleware, async (req, res, next) => {
  try {
    const search = typeof req.query?.search === 'string' ? req.query.search.trim() : '';
    const runId = typeof req.query?.runId === 'string' ? req.query.runId.trim() : '';
    const status = typeof req.query?.status === 'string' ? req.query.status.trim().toUpperCase() : '';
    const warningCode = typeof req.query?.warningCode === 'string' ? req.query.warningCode.trim() : '';
    const limit = parsePositiveInt(req.query?.limit, 100);

    const where = {};
    if (runId) where.runId = runId;
    if (status && REVIEW_ITEM_STATUSES.has(status)) where.status = status;
    if (warningCode) where.warningCodes = { has: warningCode };
    if (search) {
      where.OR = [
        { customerName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    const items = await prisma.callCenterImportReviewItem.findMany({
      where,
      orderBy: [
        { createdAt: 'desc' },
        { sourceSheet: 'asc' },
        { sourceRowNumber: 'asc' },
      ],
      take: limit,
      include: {
        run: {
          select: {
            id: true,
            workbookFileName: true,
            executedAt: true,
          },
        },
        resolvedBy: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    res.json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
});

router.get('/review/items/:id', authMiddleware, async (req, res, next) => {
  try {
    const item = await prisma.callCenterImportReviewItem.findUnique({
      where: { id: req.params.id },
      include: {
        run: {
          include: {
            executedBy: {
              select: { id: true, fullName: true, email: true },
            },
          },
        },
        resolvedBy: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Review item not found' },
      });
    }

    res.json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
});

router.patch('/review/items/:id', authMiddleware, async (req, res, next) => {
  try {
    const status = typeof req.body?.status === 'string' ? req.body.status.trim().toUpperCase() : '';
    const resolutionNote = typeof req.body?.resolutionNote === 'string' ? req.body.resolutionNote.trim() : null;

    if (!REVIEW_ITEM_STATUSES.has(status)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_STATUS', message: 'Status must be OPEN, RESOLVED, or IGNORED' },
      });
    }

    const updateData = {
      status,
      resolutionNote,
      resolvedAt: status === 'OPEN' ? null : new Date(),
      resolvedByUserId: status === 'OPEN' ? null : (req.user?.id || null),
    };

    const item = await prisma.callCenterImportReviewItem.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        run: {
          select: {
            id: true,
            workbookFileName: true,
            executedAt: true,
          },
        },
        resolvedBy: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    res.json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
});

export default router;
