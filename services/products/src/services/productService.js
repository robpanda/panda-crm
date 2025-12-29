// Product Service - Business Logic Layer
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();

class ProductService {
  // Get all products with filtering and pagination
  async getProducts(options = {}) {
    const {
      page = 1,
      limit = 50,
      sortBy = 'name',
      sortOrder = 'asc',
      isActive,
      family,
      search,
    } = options;

    const skip = (page - 1) * limit;

    // Build where clause
    const where = {};

    if (isActive !== undefined) where.isActive = isActive;
    if (family) where.family = family;

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { productCode: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Execute query with count
    const [products, total, families] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.product.count({ where }),
      prisma.product.findMany({
        where: { isActive: true },
        select: { family: true },
        distinct: ['family'],
      }),
    ]);

    return {
      data: products,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      families: families.map(f => f.family).filter(Boolean).sort(),
    };
  }

  // Get single product by ID
  async getProductById(id) {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        pricebookEntries: {
          include: {
            pricebook: true,
          },
        },
      },
    });

    if (!product) {
      const error = new Error('Product not found');
      error.statusCode = 404;
      throw error;
    }

    return product;
  }

  // Get product families
  async getProductFamilies() {
    const families = await prisma.product.findMany({
      where: { isActive: true },
      select: { family: true },
      distinct: ['family'],
    });

    return families.map(f => f.family).filter(Boolean).sort();
  }

  // Search products
  async searchProducts(query, limit = 10) {
    return prisma.product.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { productCode: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
      orderBy: { name: 'asc' },
    });
  }

  // Create product
  async createProduct(data) {
    return prisma.product.create({
      data: {
        name: data.name,
        productCode: data.productCode,
        description: data.description,
        family: data.family,
        category: data.category,
        unitPrice: data.unitPrice,
        isActive: data.isActive ?? true,
        qbProductId: data.qbProductId,
        abcProductId: data.abcProductId,
      },
    });
  }

  // Update product
  async updateProduct(id, data) {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      const error = new Error('Product not found');
      error.statusCode = 404;
      throw error;
    }

    return prisma.product.update({
      where: { id },
      data: {
        name: data.name ?? product.name,
        productCode: data.productCode ?? product.productCode,
        description: data.description ?? product.description,
        family: data.family ?? product.family,
        category: data.category ?? product.category,
        unitPrice: data.unitPrice ?? product.unitPrice,
        isActive: data.isActive ?? product.isActive,
        qbProductId: data.qbProductId ?? product.qbProductId,
        abcProductId: data.abcProductId ?? product.abcProductId,
      },
    });
  }

  // Delete product (soft delete by marking inactive)
  async deleteProduct(id) {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      const error = new Error('Product not found');
      error.statusCode = 404;
      throw error;
    }

    return prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
  }
}

export const productService = new ProductService();
export default productService;
