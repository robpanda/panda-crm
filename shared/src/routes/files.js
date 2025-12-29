// File Upload Routes
import { Router } from 'express';
import multer from 'multer';
import { fileUploadService } from '../services/fileUploadService.js';

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
  fileFilter: (req, file, cb) => {
    // Accept all files by default, validation can be done per-route
    cb(null, true);
  },
});

/**
 * POST /files/upload - Upload a single file
 */
router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_FILE', message: 'No file provided' },
      });
    }

    const { folder = 'uploads', entityType, entityId } = req.body;

    const result = await fileUploadService.uploadFile(
      req.file.buffer,
      req.file.originalname,
      {
        folder,
        contentType: req.file.mimetype,
        metadata: {
          uploadedBy: req.user?.id || 'anonymous',
          entityType,
          entityId,
        },
      }
    );

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /files/upload-multiple - Upload multiple files
 */
router.post('/upload-multiple', upload.array('files', 10), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_FILES', message: 'No files provided' },
      });
    }

    const { folder = 'uploads', entityType, entityId } = req.body;

    const files = req.files.map(file => ({
      content: file.buffer,
      name: file.originalname,
    }));

    const results = await fileUploadService.uploadFiles(files, {
      folder,
      metadata: {
        uploadedBy: req.user?.id || 'anonymous',
        entityType,
        entityId,
      },
    });

    res.status(201).json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /files/presigned-upload - Get presigned URL for direct upload
 */
router.post('/presigned-upload', async (req, res, next) => {
  try {
    const { fileName, contentType, folder = 'uploads' } = req.body;

    if (!fileName) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'fileName is required' },
      });
    }

    const result = await fileUploadService.getPresignedUploadUrl(fileName, {
      folder,
      contentType,
      expiresIn: 3600, // 1 hour
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /files/presigned-download - Get presigned URL for download
 */
router.post('/presigned-download', async (req, res, next) => {
  try {
    const { key, fileName } = req.body;

    if (!key) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'key is required' },
      });
    }

    const result = await fileUploadService.getPresignedDownloadUrl(key, {
      fileName,
      expiresIn: 3600,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /files/:key - Delete a file
 */
router.delete('/:key(*)', async (req, res, next) => {
  try {
    const { key } = req.params;

    // Optional: Check ownership/permissions here
    const result = await fileUploadService.deleteFile(key);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /files/metadata/:key - Get file metadata
 */
router.get('/metadata/:key(*)', async (req, res, next) => {
  try {
    const { key } = req.params;

    const metadata = await fileUploadService.getFileMetadata(key);

    res.json({ success: true, data: metadata });
  } catch (error) {
    if (error.message === 'File not found') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'File not found' },
      });
    }
    next(error);
  }
});

// ==========================================
// Entity-Specific Upload Routes
// ==========================================

/**
 * POST /files/opportunities/:id/documents - Upload document for opportunity
 */
router.post('/opportunities/:id/documents', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_FILE', message: 'No file provided' },
      });
    }

    const { documentType = 'general' } = req.body;

    const result = await fileUploadService.uploadOpportunityDocument(
      req.params.id,
      req.file.buffer,
      req.file.originalname,
      documentType
    );

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /files/accounts/:id/documents - Upload document for account
 */
router.post('/accounts/:id/documents', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_FILE', message: 'No file provided' },
      });
    }

    const { documentType = 'general' } = req.body;

    const result = await fileUploadService.uploadAccountDocument(
      req.params.id,
      req.file.buffer,
      req.file.originalname,
      documentType
    );

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /files/contacts/:id/photo - Upload contact photo
 */
router.post('/contacts/:id/photo', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_FILE', message: 'No file provided' },
      });
    }

    // Validate image type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_TYPE', message: 'Only image files are allowed' },
      });
    }

    const result = await fileUploadService.uploadContactPhoto(
      req.params.id,
      req.file.buffer,
      req.file.originalname
    );

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /files/workorders/:id/photos - Upload work order photo
 */
router.post('/workorders/:id/photos', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_FILE', message: 'No file provided' },
      });
    }

    const { photoType = 'during' } = req.body;

    // Validate image type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_TYPE', message: 'Only image files are allowed' },
      });
    }

    const result = await fileUploadService.uploadWorkOrderPhoto(
      req.params.id,
      req.file.buffer,
      req.file.originalname,
      photoType
    );

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /files/opportunities/:id/contracts - Upload signed contract
 */
router.post('/opportunities/:id/contracts', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_FILE', message: 'No file provided' },
      });
    }

    const result = await fileUploadService.uploadSignedContract(
      req.params.id,
      req.file.buffer,
      req.file.originalname
    );

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
