import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

// Validation schemas
const createProductSchema = z.object({
  name: z.string().min(1),
  productCode: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  unitPrice: z.number().nonnegative().optional(),
  qbProductId: z.string().optional(),
  abcProductId: z.string().optional(),
  isActive: z.boolean().default(true),
});

const updateProductSchema = createProductSchema.partial();

// List products
export async function listProducts(req, res, next) {
  try {
    const {
      category,
      isActive,
      search,
      page = 1,
      limit = 50,
      sortBy = 'name',
      sortOrder = 'asc',
    } = req.query;

    const where = {};

    if (category) where.category = category;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { productCode: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.product.count({ where }),
    ]);

    res.json({
      data: products,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    next(error);
  }
}

// Get single product
export async function getProduct(req, res, next) {
  try {
    const { id } = req.params;

    const product = await prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    next(error);
  }
}

// Create product
export async function createProduct(req, res, next) {
  try {
    const data = createProductSchema.parse(req.body);

    // Check for duplicate product code
    if (data.productCode) {
      const existing = await prisma.product.findUnique({
        where: { productCode: data.productCode },
      });
      if (existing) {
        return res.status(400).json({ error: 'Product code already exists' });
      }
    }

    const product = await prisma.product.create({
      data,
    });

    res.status(201).json(product);
  } catch (error) {
    next(error);
  }
}

// Update product
export async function updateProduct(req, res, next) {
  try {
    const { id } = req.params;
    const data = updateProductSchema.parse(req.body);

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check for duplicate product code
    if (data.productCode && data.productCode !== existing.productCode) {
      const duplicate = await prisma.product.findUnique({
        where: { productCode: data.productCode },
      });
      if (duplicate) {
        return res.status(400).json({ error: 'Product code already exists' });
      }
    }

    const product = await prisma.product.update({
      where: { id },
      data,
    });

    res.json(product);
  } catch (error) {
    next(error);
  }
}

// Delete product
export async function deleteProduct(req, res, next) {
  try {
    const { id } = req.params;

    // Check for usage in quotes or orders
    const quoteUsage = await prisma.quoteLineItem.count({
      where: { productId: id },
    });

    const orderUsage = await prisma.orderLineItem.count({
      where: { productId: id },
    });

    if (quoteUsage > 0 || orderUsage > 0) {
      return res.status(400).json({
        error: 'Cannot delete product in use',
        quoteUsage,
        orderUsage,
      });
    }

    await prisma.product.delete({ where: { id } });

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    next(error);
  }
}

// Get product categories
export async function getCategories(req, res, next) {
  try {
    const categories = await prisma.product.groupBy({
      by: ['category'],
      where: { category: { not: null } },
      _count: { category: true },
    });

    res.json(
      categories.map((c) => ({
        name: c.category,
        count: c._count.category,
      }))
    );
  } catch (error) {
    next(error);
  }
}

// Search products (for autocomplete)
export async function searchProducts(req, res, next) {
  try {
    const { q, category, limit = 10 } = req.query;

    if (!q || q.length < 2) {
      return res.json([]);
    }

    const where = {
      isActive: true,
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { productCode: { contains: q, mode: 'insensitive' } },
      ],
    };

    if (category) where.category = category;

    const products = await prisma.product.findMany({
      where,
      take: parseInt(limit),
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        productCode: true,
        category: true,
        unitPrice: true,
      },
    });

    res.json(products);
  } catch (error) {
    next(error);
  }
}

// Bulk import products (for migration)
export async function bulkImportProducts(req, res, next) {
  try {
    const { products } = req.body;

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: 'Products array required' });
    }

    const results = {
      created: 0,
      updated: 0,
      errors: [],
    };

    for (const product of products) {
      try {
        const validated = createProductSchema.parse(product);

        if (validated.productCode) {
          await prisma.product.upsert({
            where: { productCode: validated.productCode },
            create: validated,
            update: validated,
          });
          results.updated++;
        } else {
          await prisma.product.create({ data: validated });
          results.created++;
        }
      } catch (err) {
        results.errors.push({
          product: product.name || 'Unknown',
          error: err.message,
        });
      }
    }

    res.json(results);
  } catch (error) {
    next(error);
  }
}
