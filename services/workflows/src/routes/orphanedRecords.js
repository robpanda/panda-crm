// Orphaned Records Management Routes
// Allows admins to view and resolve records that couldn't be migrated due to missing relationships
import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// ============================================================================
// ORPHANED RECORDS LIST
// ============================================================================

/**
 * GET /api/workflows/orphaned-records
 * Get orphaned records with filters
 */
router.get('/', async (req, res, next) => {
  try {
    const {
      salesforceType,
      orphanReason,
      status,
      search,
      page = 1,
      limit = 50,
    } = req.query;

    const where = {};

    if (salesforceType) {
      where.salesforceType = salesforceType;
    }
    if (orphanReason) {
      where.orphanReason = orphanReason;
    }
    if (status) {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { recordNumber: { contains: search, mode: 'insensitive' } },
        { recordName: { contains: search, mode: 'insensitive' } },
        { salesforceId: { contains: search, mode: 'insensitive' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [records, total] = await Promise.all([
      prisma.orphanedRecord.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          resolvedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
      prisma.orphanedRecord.count({ where }),
    ]);

    res.json({
      success: true,
      data: records,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/workflows/orphaned-records/stats
 * Get statistics about orphaned records
 */
router.get('/stats', async (req, res, next) => {
  try {
    const [
      byType,
      byReason,
      byStatus,
      total,
    ] = await Promise.all([
      // Group by Salesforce type
      prisma.orphanedRecord.groupBy({
        by: ['salesforceType'],
        _count: { id: true },
      }),
      // Group by orphan reason
      prisma.orphanedRecord.groupBy({
        by: ['orphanReason'],
        _count: { id: true },
      }),
      // Group by status
      prisma.orphanedRecord.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      // Total count
      prisma.orphanedRecord.count(),
    ]);

    res.json({
      success: true,
      data: {
        total,
        byType: byType.map(t => ({ type: t.salesforceType, count: t._count.id })),
        byReason: byReason.map(r => ({ reason: r.orphanReason, count: r._count.id })),
        byStatus: byStatus.map(s => ({ status: s.status, count: s._count.id })),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/workflows/orphaned-records/:id
 * Get a single orphaned record with full details
 */
router.get('/:id', async (req, res, next) => {
  try {
    const record = await prisma.orphanedRecord.findUnique({
      where: { id: req.params.id },
      include: {
        resolvedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        migrationRun: {
          select: {
            runId: true,
            startedAt: true,
            objectsToSync: true,
          },
        },
      },
    });

    if (!record) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Orphaned record not found' },
      });
    }

    res.json({
      success: true,
      data: record,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// RESOLVE ORPHANED RECORDS
// ============================================================================

/**
 * POST /api/workflows/orphaned-records/:id/link
 * Link an orphaned record to an existing CRM record
 */
router.post('/:id/link', async (req, res, next) => {
  try {
    const { linkedRecordId, linkedRecordType } = req.body;
    const userId = req.headers['x-user-id'] || req.body.userId;

    if (!linkedRecordId || !linkedRecordType) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'linkedRecordId and linkedRecordType are required' },
      });
    }

    const record = await prisma.orphanedRecord.findUnique({
      where: { id: req.params.id },
    });

    if (!record) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Orphaned record not found' },
      });
    }

    // Update the orphaned record as linked
    const updated = await prisma.orphanedRecord.update({
      where: { id: req.params.id },
      data: {
        status: 'LINKED',
        resolvedAt: new Date(),
        resolvedById: userId || null,
        resolvedAction: 'LINKED',
        linkedRecordId,
        linkedRecordType,
      },
    });

    // TODO: Actually create the record using the linked parent
    // This would require calling the appropriate migration logic

    res.json({
      success: true,
      data: updated,
      message: `Orphaned record linked to ${linkedRecordType} ${linkedRecordId}`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/workflows/orphaned-records/:id/skip
 * Mark an orphaned record as skipped (won't be migrated)
 */
router.post('/:id/skip', async (req, res, next) => {
  try {
    const { reason } = req.body;
    const userId = req.headers['x-user-id'] || req.body.userId;

    const record = await prisma.orphanedRecord.findUnique({
      where: { id: req.params.id },
    });

    if (!record) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Orphaned record not found' },
      });
    }

    const updated = await prisma.orphanedRecord.update({
      where: { id: req.params.id },
      data: {
        status: 'SKIPPED',
        resolvedAt: new Date(),
        resolvedById: userId || null,
        resolvedAction: reason || 'SKIPPED',
      },
    });

    res.json({
      success: true,
      data: updated,
      message: 'Orphaned record marked as skipped',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/workflows/orphaned-records/:id/delete
 * Mark an orphaned record as deleted (data not needed)
 */
router.post('/:id/delete', async (req, res, next) => {
  try {
    const { reason } = req.body;
    const userId = req.headers['x-user-id'] || req.body.userId;

    const record = await prisma.orphanedRecord.findUnique({
      where: { id: req.params.id },
    });

    if (!record) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Orphaned record not found' },
      });
    }

    const updated = await prisma.orphanedRecord.update({
      where: { id: req.params.id },
      data: {
        status: 'DELETED',
        resolvedAt: new Date(),
        resolvedById: userId || null,
        resolvedAction: reason || 'DELETED',
      },
    });

    res.json({
      success: true,
      data: updated,
      message: 'Orphaned record marked as deleted',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/workflows/orphaned-records/:id/review
 * Mark an orphaned record as under review
 */
router.post('/:id/review', async (req, res, next) => {
  try {
    const { note } = req.body;
    const userId = req.headers['x-user-id'] || req.body.userId;

    const record = await prisma.orphanedRecord.findUnique({
      where: { id: req.params.id },
    });

    if (!record) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Orphaned record not found' },
      });
    }

    const updated = await prisma.orphanedRecord.update({
      where: { id: req.params.id },
      data: {
        status: 'REVIEWING',
        resolvedById: userId || null,
        resolvedAction: note || null,
      },
    });

    res.json({
      success: true,
      data: updated,
      message: 'Orphaned record marked for review',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/workflows/orphaned-records/bulk-skip
 * Bulk skip orphaned records
 */
router.post('/bulk-skip', async (req, res, next) => {
  try {
    const { recordIds, reason } = req.body;
    const userId = req.headers['x-user-id'] || req.body.userId;

    if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'recordIds array is required' },
      });
    }

    const result = await prisma.orphanedRecord.updateMany({
      where: { id: { in: recordIds } },
      data: {
        status: 'SKIPPED',
        resolvedAt: new Date(),
        resolvedById: userId || null,
        resolvedAction: reason || 'BULK_SKIPPED',
      },
    });

    res.json({
      success: true,
      data: { updated: result.count },
      message: `${result.count} orphaned records marked as skipped`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/workflows/orphaned-records/bulk-delete
 * Bulk delete orphaned records (mark as deleted)
 */
router.post('/bulk-delete', async (req, res, next) => {
  try {
    const { recordIds, reason } = req.body;
    const userId = req.headers['x-user-id'] || req.body.userId;

    if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'recordIds array is required' },
      });
    }

    const result = await prisma.orphanedRecord.updateMany({
      where: { id: { in: recordIds } },
      data: {
        status: 'DELETED',
        resolvedAt: new Date(),
        resolvedById: userId || null,
        resolvedAction: reason || 'BULK_DELETED',
      },
    });

    res.json({
      success: true,
      data: { updated: result.count },
      message: `${result.count} orphaned records marked as deleted`,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// SEARCH POTENTIAL MATCHES
// ============================================================================

/**
 * GET /api/workflows/orphaned-records/:id/potential-matches
 * Search for potential CRM records that could match this orphaned record
 */
router.get('/:id/potential-matches', async (req, res, next) => {
  try {
    const record = await prisma.orphanedRecord.findUnique({
      where: { id: req.params.id },
    });

    if (!record) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Orphaned record not found' },
      });
    }

    const sfData = record.salesforceData || {};
    let potentialMatches = [];

    // Based on the missing field type, search for potential parent records
    if (record.missingFieldName === 'AccountId' || record.orphanReason === 'NULL_ACCOUNT_ID' || record.orphanReason === 'INVALID_ACCOUNT_ID') {
      // Search accounts by address, name, or phone from the orphaned record's data
      const searchCriteria = [];

      if (sfData.Street && sfData.City) {
        searchCriteria.push({
          billingStreet: { contains: sfData.Street.split(' ')[0], mode: 'insensitive' },
          billingCity: { contains: sfData.City, mode: 'insensitive' },
        });
      }
      if (sfData.Subject) {
        // Try to extract account name from work order subject (often contains job number)
        const jobMatch = sfData.Subject.match(/Panda Ext-(\d+)/i);
        if (jobMatch) {
          searchCriteria.push({
            name: { contains: `Panda Ext-${jobMatch[1]}`, mode: 'insensitive' },
          });
        }
      }

      if (searchCriteria.length > 0) {
        potentialMatches = await prisma.account.findMany({
          where: { OR: searchCriteria, deletedAt: null },
          take: 10,
          select: {
            id: true,
            salesforceId: true,
            name: true,
            billingStreet: true,
            billingCity: true,
            billingState: true,
            phone: true,
          },
        });
      }
    }

    res.json({
      success: true,
      data: {
        orphanedRecord: record,
        potentialMatches,
        matchCount: potentialMatches.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
