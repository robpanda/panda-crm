// Pricebook Service - Business Logic Layer
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();

class PricebookService {
  // Get all pricebooks with filtering and pagination
  async getPricebooks(options = {}) {
    const {
      page = 1,
      limit = 25,
      sortBy = 'name',
      sortOrder = 'asc',
      isActive,
      isStandard,
      search,
    } = options;

    const skip = (page - 1) * limit;

    // Build where clause
    const where = {};

    if (isActive !== undefined) where.isActive = isActive;
    if (isStandard !== undefined) where.isStandard = isStandard;

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Execute query with count
    const [pricebooks, total] = await Promise.all([
      prisma.pricebook.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          _count: {
            select: { entries: true },
          },
        },
      }),
      prisma.pricebook.count({ where }),
    ]);

    return {
      data: pricebooks,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Get single pricebook by ID
  async getPricebookById(id) {
    const pricebook = await prisma.pricebook.findUnique({
      where: { id },
      include: {
        _count: {
          select: { entries: true },
        },
      },
    });

    if (!pricebook) {
      const error = new Error('Pricebook not found');
      error.statusCode = 404;
      throw error;
    }

    return pricebook;
  }

  // Get pricebook entries with filtering and pagination
  async getPricebookEntries(pricebookId, options = {}) {
    const {
      page = 1,
      limit = 50,
      sortBy = 'product',
      sortOrder = 'asc',
      isActive,
      family,
      search,
    } = options;

    const skip = (page - 1) * limit;

    // Build where clause
    const where = {
      pricebookId,
    };

    if (isActive !== undefined) where.isActive = isActive;

    // Build product filter for family and search
    const productWhere = {};
    if (family) productWhere.family = family;
    if (search) {
      productWhere.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { productCode: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Add product filter to main where if any filters present
    if (Object.keys(productWhere).length > 0) {
      where.product = productWhere;
    }

    // Determine sort order
    let orderBy;
    if (sortBy === 'product') {
      orderBy = { product: { name: sortOrder } };
    } else if (sortBy === 'productCode') {
      orderBy = { product: { productCode: sortOrder } };
    } else if (sortBy === 'family') {
      orderBy = { product: { family: sortOrder } };
    } else {
      orderBy = { [sortBy]: sortOrder };
    }

    // Execute query with count
    const [entries, total] = await Promise.all([
      prisma.pricebookEntry.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          product: true,
        },
      }),
      prisma.pricebookEntry.count({ where }),
    ]);

    return {
      data: entries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Create pricebook
  async createPricebook(data) {
    return prisma.pricebook.create({
      data: {
        name: data.name,
        description: data.description,
        isActive: data.isActive ?? true,
        isStandard: data.isStandard ?? false,
      },
    });
  }

  // Update pricebook
  async updatePricebook(id, data) {
    const pricebook = await prisma.pricebook.findUnique({ where: { id } });
    if (!pricebook) {
      const error = new Error('Pricebook not found');
      error.statusCode = 404;
      throw error;
    }

    return prisma.pricebook.update({
      where: { id },
      data: {
        name: data.name ?? pricebook.name,
        description: data.description ?? pricebook.description,
        isActive: data.isActive ?? pricebook.isActive,
        isStandard: data.isStandard ?? pricebook.isStandard,
      },
    });
  }

  // Delete pricebook (soft delete by marking inactive)
  async deletePricebook(id) {
    const pricebook = await prisma.pricebook.findUnique({ where: { id } });
    if (!pricebook) {
      const error = new Error('Pricebook not found');
      error.statusCode = 404;
      throw error;
    }

    // Don't allow deleting standard pricebook
    if (pricebook.isStandard) {
      const error = new Error('Cannot delete the standard pricebook');
      error.statusCode = 400;
      throw error;
    }

    return prisma.pricebook.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // Add product to pricebook
  async addPricebookEntry(pricebookId, data) {
    const pricebook = await prisma.pricebook.findUnique({ where: { id: pricebookId } });
    if (!pricebook) {
      const error = new Error('Pricebook not found');
      error.statusCode = 404;
      throw error;
    }

    const product = await prisma.product.findUnique({ where: { id: data.productId } });
    if (!product) {
      const error = new Error('Product not found');
      error.statusCode = 404;
      throw error;
    }

    // Check if entry already exists
    const existing = await prisma.pricebookEntry.findFirst({
      where: { pricebookId, productId: data.productId },
    });
    if (existing) {
      const error = new Error('Product already exists in this pricebook');
      error.statusCode = 400;
      throw error;
    }

    return prisma.pricebookEntry.create({
      data: {
        pricebookId,
        productId: data.productId,
        unitPrice: data.unitPrice,
        useStandardPrice: data.useStandardPrice ?? false,
        isActive: data.isActive ?? true,
      },
      include: {
        product: true,
      },
    });
  }

  // Update pricebook entry
  async updatePricebookEntry(entryId, data) {
    const entry = await prisma.pricebookEntry.findUnique({ where: { id: entryId } });
    if (!entry) {
      const error = new Error('Pricebook entry not found');
      error.statusCode = 404;
      throw error;
    }

    return prisma.pricebookEntry.update({
      where: { id: entryId },
      data: {
        unitPrice: data.unitPrice ?? entry.unitPrice,
        useStandardPrice: data.useStandardPrice ?? entry.useStandardPrice,
        isActive: data.isActive ?? entry.isActive,
      },
      include: {
        product: true,
      },
    });
  }

  // Remove product from pricebook
  async removePricebookEntry(entryId) {
    const entry = await prisma.pricebookEntry.findUnique({ where: { id: entryId } });
    if (!entry) {
      const error = new Error('Pricebook entry not found');
      error.statusCode = 404;
      throw error;
    }

    return prisma.pricebookEntry.delete({
      where: { id: entryId },
    });
  }
}

export const pricebookService = new PricebookService();
export default pricebookService;
