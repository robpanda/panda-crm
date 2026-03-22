import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.js';
import { callCenterImportService } from '../services/callCenterImportService.js';

const router = Router();

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

export default router;
