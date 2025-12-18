import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { addDays } from 'date-fns';

const prisma = new PrismaClient();

// Validation schemas
const lineItemSchema = z.object({
  productId: z.string().optional(),
  description: z.string().optional(),
  quantity: z.number().positive().default(1),
  unitPrice: z.number().nonnegative(),
  discount: z.number().nonnegative().default(0),
});

const createQuoteSchema = z.object({
  opportunityId: z.string(),
  name: z.string().min(1),
  expirationDate: z.string().datetime().optional(),
  discount: z.number().nonnegative().default(0),
  tax: z.number().nonnegative().default(0),
  isPmQuote: z.boolean().default(false),
  lineItems: z.array(lineItemSchema).optional(),
});

const updateQuoteSchema = createQuoteSchema.partial().extend({
  status: z.enum(['DRAFT', 'NEEDS_REVIEW', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'ACCEPTED', 'EXPIRED']).optional(),
});

// Generate quote number
async function generateQuoteNumber() {
  const count = await prisma.quote.count();
  const num = count + 1;
  return `Q-${String(num).padStart(6, '0')}`;
}

// Calculate quote totals
function calculateTotals(lineItems, quoteDiscount = 0, quoteTax = 0) {
  let subtotal = new Decimal(0);

  const processedItems = lineItems.map((item) => {
    const itemTotal = new Decimal(item.quantity)
      .times(item.unitPrice)
      .minus(item.discount || 0);
    subtotal = subtotal.plus(itemTotal);

    return {
      ...item,
      totalPrice: itemTotal.toNumber(),
    };
  });

  const discount = new Decimal(quoteDiscount);
  const afterDiscount = subtotal.minus(discount);
  const tax = new Decimal(quoteTax);
  const total = afterDiscount.plus(tax);

  return {
    lineItems: processedItems,
    subtotal: subtotal.toNumber(),
    discount: discount.toNumber(),
    tax: tax.toNumber(),
    total: total.toNumber(),
  };
}

// List quotes
export async function listQuotes(req, res, next) {
  try {
    const {
      opportunityId,
      status,
      isPmQuote,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const where = {};

    if (opportunityId) where.opportunityId = opportunityId;
    if (status) where.status = status;
    if (isPmQuote !== undefined) where.isPmQuote = isPmQuote === 'true';

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [quotes, total] = await Promise.all([
      prisma.quote.findMany({
        where,
        include: {
          opportunity: {
            select: {
              id: true,
              name: true,
              account: { select: { id: true, name: true } },
            },
          },
          lineItems: {
            include: { product: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
        skip,
        take,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.quote.count({ where }),
    ]);

    res.json({
      data: quotes,
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

// Get single quote
export async function getQuote(req, res, next) {
  try {
    const { id } = req.params;

    const quote = await prisma.quote.findUnique({
      where: { id },
      include: {
        opportunity: {
          include: {
            account: true,
            contact: true,
            owner: { select: { id: true, fullName: true, email: true } },
          },
        },
        lineItems: {
          include: { product: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    res.json(quote);
  } catch (error) {
    next(error);
  }
}

// Create quote
export async function createQuote(req, res, next) {
  try {
    const data = createQuoteSchema.parse(req.body);
    const quoteNumber = await generateQuoteNumber();

    // Verify opportunity exists
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: data.opportunityId },
      select: { id: true, name: true },
    });

    if (!opportunity) {
      return res.status(404).json({ error: 'Opportunity not found' });
    }

    // Calculate totals
    const { lineItems, subtotal, discount, tax, total } = calculateTotals(
      data.lineItems || [],
      data.discount,
      data.tax
    );

    // Create quote with line items
    const quote = await prisma.quote.create({
      data: {
        quoteNumber,
        name: data.name,
        opportunityId: data.opportunityId,
        status: 'DRAFT',
        expirationDate: data.expirationDate
          ? new Date(data.expirationDate)
          : addDays(new Date(), 30),
        subtotal,
        discount,
        tax,
        total,
        isPmQuote: data.isPmQuote,
        lineItems: lineItems.length > 0 ? {
          create: lineItems.map((item, index) => ({
            productId: item.productId,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount || 0,
            totalPrice: item.totalPrice,
            sortOrder: index,
          })),
        } : undefined,
      },
      include: {
        opportunity: { select: { id: true, name: true } },
        lineItems: { include: { product: true } },
      },
    });

    res.status(201).json(quote);
  } catch (error) {
    next(error);
  }
}

// Update quote
export async function updateQuote(req, res, next) {
  try {
    const { id } = req.params;
    const data = updateQuoteSchema.parse(req.body);

    const existing = await prisma.quote.findUnique({
      where: { id },
      include: { lineItems: true },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    // Don't allow updates to accepted quotes
    if (existing.status === 'ACCEPTED') {
      return res.status(400).json({ error: 'Cannot update accepted quote' });
    }

    // If line items provided, recalculate totals
    let updateData = { ...data };
    if (data.lineItems) {
      const { lineItems, subtotal, discount, tax, total } = calculateTotals(
        data.lineItems,
        data.discount ?? existing.discount.toNumber(),
        data.tax ?? existing.tax.toNumber()
      );

      // Delete existing line items and recreate
      await prisma.quoteLineItem.deleteMany({ where: { quoteId: id } });

      updateData = {
        ...data,
        subtotal,
        discount,
        tax,
        total,
        lineItems: {
          create: lineItems.map((item, index) => ({
            productId: item.productId,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount || 0,
            totalPrice: item.totalPrice,
            sortOrder: index,
          })),
        },
      };
    }

    // Remove lineItems from updateData if it's the raw array
    if (Array.isArray(updateData.lineItems)) {
      delete updateData.lineItems;
    }

    const quote = await prisma.quote.update({
      where: { id },
      data: {
        ...updateData,
        expirationDate: data.expirationDate ? new Date(data.expirationDate) : undefined,
      },
      include: {
        opportunity: { select: { id: true, name: true } },
        lineItems: { include: { product: true } },
      },
    });

    res.json(quote);
  } catch (error) {
    next(error);
  }
}

// Delete quote
export async function deleteQuote(req, res, next) {
  try {
    const { id } = req.params;

    const existing = await prisma.quote.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    if (existing.status === 'ACCEPTED') {
      return res.status(400).json({ error: 'Cannot delete accepted quote' });
    }

    // Line items will be cascade deleted
    await prisma.quote.delete({ where: { id } });

    res.json({ message: 'Quote deleted successfully' });
  } catch (error) {
    next(error);
  }
}

// Add line item
export async function addLineItem(req, res, next) {
  try {
    const { id } = req.params;
    const data = lineItemSchema.parse(req.body);

    const quote = await prisma.quote.findUnique({
      where: { id },
      include: { lineItems: true },
    });

    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    if (quote.status === 'ACCEPTED') {
      return res.status(400).json({ error: 'Cannot modify accepted quote' });
    }

    // Calculate item total
    const totalPrice = new Decimal(data.quantity)
      .times(data.unitPrice)
      .minus(data.discount || 0)
      .toNumber();

    // Get max sort order
    const maxSort = Math.max(...quote.lineItems.map((li) => li.sortOrder), -1);

    const lineItem = await prisma.quoteLineItem.create({
      data: {
        quoteId: id,
        productId: data.productId,
        description: data.description,
        quantity: data.quantity,
        unitPrice: data.unitPrice,
        discount: data.discount || 0,
        totalPrice,
        sortOrder: maxSort + 1,
      },
      include: { product: true },
    });

    // Recalculate quote totals
    const allItems = [...quote.lineItems, lineItem];
    const subtotal = allItems.reduce((sum, li) => sum + li.totalPrice.toNumber(), 0);
    const total = subtotal - quote.discount.toNumber() + quote.tax.toNumber();

    await prisma.quote.update({
      where: { id },
      data: { subtotal, total },
    });

    res.status(201).json(lineItem);
  } catch (error) {
    next(error);
  }
}

// Remove line item
export async function removeLineItem(req, res, next) {
  try {
    const { id, lineItemId } = req.params;

    const quote = await prisma.quote.findUnique({
      where: { id },
      include: { lineItems: true },
    });

    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    if (quote.status === 'ACCEPTED') {
      return res.status(400).json({ error: 'Cannot modify accepted quote' });
    }

    const lineItem = quote.lineItems.find((li) => li.id === lineItemId);
    if (!lineItem) {
      return res.status(404).json({ error: 'Line item not found' });
    }

    await prisma.quoteLineItem.delete({ where: { id: lineItemId } });

    // Recalculate quote totals
    const remainingItems = quote.lineItems.filter((li) => li.id !== lineItemId);
    const subtotal = remainingItems.reduce((sum, li) => sum + li.totalPrice.toNumber(), 0);
    const total = subtotal - quote.discount.toNumber() + quote.tax.toNumber();

    await prisma.quote.update({
      where: { id },
      data: { subtotal, total },
    });

    res.json({ message: 'Line item removed' });
  } catch (error) {
    next(error);
  }
}

// Accept quote (creates Service Contract)
export async function acceptQuote(req, res, next) {
  try {
    const { id } = req.params;

    const quote = await prisma.quote.findUnique({
      where: { id },
      include: {
        opportunity: true,
        lineItems: true,
      },
    });

    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    if (quote.status === 'ACCEPTED') {
      return res.status(400).json({ error: 'Quote already accepted' });
    }

    // Generate contract number
    const contractCount = await prisma.serviceContract.count();
    const contractNumber = `SC-${String(contractCount + 1).padStart(6, '0')}`;

    // Create service contract
    const serviceContract = await prisma.serviceContract.create({
      data: {
        contractNumber,
        name: `Service Contract - ${quote.opportunity.name}`,
        status: 'DRAFT',
        opportunityId: quote.opportunityId,
        accountId: quote.opportunity.accountId,
        contractTotal: quote.total,
        isPmContract: quote.isPmQuote,
      },
    });

    // Update quote status
    const updatedQuote = await prisma.quote.update({
      where: { id },
      data: { status: 'ACCEPTED' },
      include: {
        opportunity: { select: { id: true, name: true } },
        lineItems: { include: { product: true } },
      },
    });

    // Update opportunity stage
    await prisma.opportunity.update({
      where: { id: quote.opportunityId },
      data: { stage: 'CONTRACT_SIGNED' },
    });

    res.json({
      quote: updatedQuote,
      serviceContract,
      message: 'Quote accepted and service contract created',
    });
  } catch (error) {
    next(error);
  }
}

// Clone quote
export async function cloneQuote(req, res, next) {
  try {
    const { id } = req.params;
    const { name, opportunityId } = req.body;

    const original = await prisma.quote.findUnique({
      where: { id },
      include: { lineItems: true },
    });

    if (!original) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    const quoteNumber = await generateQuoteNumber();

    const cloned = await prisma.quote.create({
      data: {
        quoteNumber,
        name: name || `${original.name} (Copy)`,
        opportunityId: opportunityId || original.opportunityId,
        status: 'DRAFT',
        expirationDate: addDays(new Date(), 30),
        subtotal: original.subtotal,
        discount: original.discount,
        tax: original.tax,
        total: original.total,
        isPmQuote: original.isPmQuote,
        lineItems: {
          create: original.lineItems.map((li, index) => ({
            productId: li.productId,
            description: li.description,
            quantity: li.quantity.toNumber(),
            unitPrice: li.unitPrice.toNumber(),
            discount: li.discount.toNumber(),
            totalPrice: li.totalPrice.toNumber(),
            sortOrder: index,
          })),
        },
      },
      include: {
        opportunity: { select: { id: true, name: true } },
        lineItems: { include: { product: true } },
      },
    });

    res.status(201).json(cloned);
  } catch (error) {
    next(error);
  }
}

// Get quotes by opportunity
export async function getQuotesByOpportunity(req, res, next) {
  try {
    const { opportunityId } = req.params;

    const quotes = await prisma.quote.findMany({
      where: { opportunityId },
      include: {
        lineItems: {
          include: { product: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Summary stats
    const stats = {
      total: quotes.length,
      byStatus: {},
      totalValue: 0,
      acceptedValue: 0,
    };

    quotes.forEach((q) => {
      stats.byStatus[q.status] = (stats.byStatus[q.status] || 0) + 1;
      stats.totalValue += q.total.toNumber();
      if (q.status === 'ACCEPTED') {
        stats.acceptedValue += q.total.toNumber();
      }
    });

    res.json({
      opportunityId,
      stats,
      quotes,
    });
  } catch (error) {
    next(error);
  }
}
