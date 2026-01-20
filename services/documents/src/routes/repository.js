// Document Repository Routes
// Lists all documents from Salesforce migration with their linked records

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/documents/repository
 * List all documents with pagination, filtering, and search
 *
 * Query params:
 * - page (default: 1)
 * - limit (default: 25, max: 100)
 * - search (searches title)
 * - type (filter by document type: contract, invoice, quote, photos, insurance, etc.)
 * - fileType (filter by file extension: pdf, xlsx, jpg, etc.)
 * - accountId (filter by linked account)
 * - opportunityId (filter by linked opportunity)
 * - sortBy (default: createdAt)
 * - sortOrder (default: desc)
 */
router.get('/', async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 25,
      search,
      type,
      fileType,
      accountId,
      opportunityId,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const take = Math.min(parseInt(limit) || 25, 100);
    const skip = (parseInt(page) - 1) * take;

    // Build where clause
    const where = {};

    if (search) {
      where.title = { contains: search, mode: 'insensitive' };
    }

    if (fileType) {
      where.fileType = { equals: fileType.toUpperCase() };
    }

    // If filtering by account or opportunity, we need to check document links
    if (accountId || opportunityId) {
      where.links = {
        some: {
          ...(accountId && { accountId }),
          ...(opportunityId && { opportunityId }),
        },
      };
    }

    // Build orderBy
    const orderBy = {};
    const validSortFields = ['title', 'fileType', 'contentSize', 'createdAt', 'updatedAt'];
    if (validSortFields.includes(sortBy)) {
      orderBy[sortBy] = sortOrder === 'asc' ? 'asc' : 'desc';
    } else {
      orderBy.createdAt = 'desc';
    }

    // Get documents with count
    const [documents, totalCount] = await Promise.all([
      prisma.document.findMany({
        where,
        include: {
          links: {
            include: {
              account: {
                select: {
                  id: true,
                  name: true,
                },
              },
              opportunity: {
                select: {
                  id: true,
                  name: true,
                  jobId: true,
                },
              },
            },
            take: 5, // Limit links returned per document for performance
          },
        },
        orderBy,
        take,
        skip,
      }),
      prisma.document.count({ where }),
    ]);

    // Transform documents for response
    const transformedDocs = documents.map((doc) => {
      // Get unique linked accounts and opportunities
      const linkedAccounts = [];
      const linkedOpportunities = [];
      const seenAccountIds = new Set();
      const seenOppIds = new Set();

      doc.links.forEach((link) => {
        if (link.account && !seenAccountIds.has(link.account.id)) {
          seenAccountIds.add(link.account.id);
          linkedAccounts.push({
            id: link.account.id,
            name: link.account.name,
          });
        }
        if (link.opportunity && !seenOppIds.has(link.opportunity.id)) {
          seenOppIds.add(link.opportunity.id);
          linkedOpportunities.push({
            id: link.opportunity.id,
            name: link.opportunity.name,
            jobId: link.opportunity.jobId,
          });
        }
      });

      // Determine document category based on title/extension patterns
      const category = categorizeDocument(doc.title, doc.fileType);

      return {
        id: doc.id,
        title: doc.title,
        fileType: doc.fileType,
        fileExtension: doc.fileExtension,
        contentSize: doc.contentSize,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        salesforceId: doc.salesforceId,
        latestVersionSalesforceId: doc.latestVersionSalesforceId,
        category,
        linkedAccounts,
        linkedOpportunities,
        linkCount: doc.links.length,
      };
    });

    res.json({
      success: true,
      data: {
        documents: transformedDocs,
        pagination: {
          page: parseInt(page),
          limit: take,
          total: totalCount,
          totalPages: Math.ceil(totalCount / take),
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching documents:', error);
    next(error);
  }
});

/**
 * GET /api/documents/repository/stats
 * Get document repository statistics
 */
router.get('/stats', async (req, res, next) => {
  try {
    const [
      totalDocuments,
      totalLinks,
      fileTypeStats,
      linkTypeStats,
    ] = await Promise.all([
      prisma.document.count(),
      prisma.documentLink.count(),  // documentLink is the table name, keep as is
      prisma.document.groupBy({
        by: ['fileType'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      prisma.documentLink.groupBy({
        by: ['linkedRecordType'],
        _count: { id: true },
      }),
    ]);

    // Calculate storage used (approximate)
    const storageResult = await prisma.document.aggregate({
      _sum: { contentSize: true },
    });

    res.json({
      success: true,
      data: {
        totalDocuments,
        totalLinks,
        storageUsed: storageResult._sum.contentSize || 0,
        storageUsedFormatted: formatBytes(storageResult._sum.contentSize || 0),
        byFileType: fileTypeStats.map((s) => ({
          fileType: s.fileType || 'UNKNOWN',
          count: s._count.id,
        })),
        byLinkType: linkTypeStats.map((s) => ({
          recordType: s.linkedRecordType,
          count: s._count.id,
        })),
      },
    });
  } catch (error) {
    logger.error('Error fetching document stats:', error);
    next(error);
  }
});

/**
 * GET /api/documents/repository/by-job/:opportunityId
 * Get all documents linked to a specific opportunity (job)
 * NOTE: This route MUST be defined BEFORE /:id to avoid Express matching "by-job" as an id
 */
router.get('/by-job/:opportunityId', async (req, res, next) => {
  try {
    const { opportunityId } = req.params;
    const { includeAccountDocs = 'true' } = req.query;

    // Get the opportunity to get its account ID
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      select: { id: true, name: true, accountId: true },
    });

    if (!opportunity) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Opportunity not found' },
      });
    }

    // Build OR conditions for document links
    // For the main query, we need documents linked to this opportunity OR its account
    const whereCondition = includeAccountDocs === 'true' && opportunity.accountId
      ? {
          links: {
            some: {
              OR: [
                { opportunityId: opportunityId },
                { accountId: opportunity.accountId },
              ],
            },
          },
        }
      : {
          links: {
            some: {
              opportunityId: opportunityId,
            },
          },
        };

    // For filtering included links, build the same condition
    const linkFilter = includeAccountDocs === 'true' && opportunity.accountId
      ? {
          OR: [
            { opportunityId: opportunityId },
            { accountId: opportunity.accountId },
          ],
        }
      : { opportunityId: opportunityId };

    const documents = await prisma.document.findMany({
      where: whereCondition,
      include: {
        links: {
          where: linkFilter,
          include: {
            account: {
              select: { id: true, name: true },
            },
            opportunity: {
              select: { id: true, name: true, jobId: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Transform and categorize
    const transformedDocs = documents.map((doc) => ({
      id: doc.id,
      title: doc.title,
      fileType: doc.fileType,
      fileExtension: doc.fileExtension,
      contentSize: doc.contentSize,
      createdAt: doc.createdAt,
      category: categorizeDocument(doc.title, doc.fileType),
      linkedVia: doc.links.map((link) => ({
        type: link.linkedRecordType,
        accountId: link.accountId,
        opportunityId: link.opportunityId,
      })),
    }));

    res.json({
      success: true,
      data: {
        opportunity: {
          id: opportunity.id,
          name: opportunity.name,
        },
        documents: transformedDocs,
        totalCount: transformedDocs.length,
      },
    });
  } catch (error) {
    logger.error('Error fetching documents for job:', error);
    next(error);
  }
});

/**
 * Categorize document based on title and file type
 */
function categorizeDocument(title, fileType) {
  const lowerTitle = (title || '').toLowerCase();

  // Contract-related
  if (lowerTitle.includes('contract') || lowerTitle.includes('agreement')) {
    return 'contract';
  }

  // Invoice-related
  if (lowerTitle.includes('invoice') || lowerTitle.includes('inv-')) {
    return 'invoice';
  }

  // Quote-related
  if (lowerTitle.includes('quote') || lowerTitle.includes('estimate') || lowerTitle.includes('proposal')) {
    return 'quote';
  }

  // Insurance-related
  if (lowerTitle.includes('insurance') || lowerTitle.includes('claim') || lowerTitle.includes('adjuster') || lowerTitle.includes('supplement')) {
    return 'insurance';
  }

  // Photos
  if (fileType === 'JPG' || fileType === 'PNG' || fileType === 'JPEG' || lowerTitle.includes('photo')) {
    return 'photos';
  }

  // Check/payment related
  if (lowerTitle.includes('check') || lowerTitle.includes('payment')) {
    return 'payment';
  }

  // HOA/Permits
  if (lowerTitle.includes('hoa') || lowerTitle.includes('permit')) {
    return 'permit';
  }

  // Measurement/Roof reports
  if (lowerTitle.includes('gaf') || lowerTitle.includes('eagleview') || lowerTitle.includes('roof') || lowerTitle.includes('measurement')) {
    return 'measurement';
  }

  return 'other';
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default router;
