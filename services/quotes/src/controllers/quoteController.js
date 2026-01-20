import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { addDays } from 'date-fns';
// Import workflow triggers for commission and invoice automation
import { commissionTriggers } from '../../../workflows/src/triggers/commissionTriggers.js';
import { invoiceTriggers } from '../../../workflows/src/triggers/invoiceTriggers.js';

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
  // Estimate Request fields (matches Salesforce Estimate_Request_Flow)
  isEstimateRequest: z.boolean().default(false),
  estimateType: z.enum(['Full Replacement', 'Repair']).optional(),
  tradeType: z.enum(['Roof', 'Siding', 'Gutters', 'Trim', 'Capping', 'Painter', 'Drywall', 'Electrical']).optional(),
  affectedStructures: z.string().optional(),
  priorityLevel: z.enum(['High', 'Medium', 'Low']).optional(),
  // Task/Assignment fields
  assignedToId: z.string().optional(), // User assigned to this estimate request
  dueDate: z.string().optional(), // Due date for the estimate
  taskStatus: z.enum(['Open', 'Completed', 'Interested', 'Accepted', 'Declined']).optional(),
  otherInformation: z.string().optional(), // Additional notes
  // Reminder fields
  reminderEnabled: z.boolean().optional(),
  reminderDateTime: z.string().datetime().optional().nullable(),
  // Recurring task fields
  isRecurring: z.boolean().optional(),
  recurringFrequency: z.enum(['daily', 'weekly', 'monthly']).optional().nullable(),
  recurringEndDate: z.string().optional().nullable(),
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

// Get next estimator using round-robin assignment (matches Salesforce Estimate_Request_Flow)
async function getNextEstimatorRoundRobin() {
  try {
    // Get the Estimates Department team members
    const estimatorsTeam = await prisma.team.findFirst({
      where: {
        OR: [
          { name: { contains: 'Estimates' } },
          { name: { contains: 'Estimating' } },
        ],
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, fullName: true, email: true } },
          },
          where: {
            user: { isActive: true },
          },
        },
      },
    });

    if (!estimatorsTeam || estimatorsTeam.members.length === 0) {
      // Fallback: Get users with 'estimator' role
      const estimators = await prisma.user.findMany({
        where: {
          isActive: true,
          OR: [
            { role: { contains: 'estimator' } },
            { role: { contains: 'Estimator' } },
          ],
        },
        select: { id: true, fullName: true, email: true },
      });

      if (estimators.length === 0) return null;

      // Simple round-robin: get least recently assigned
      const lastAssigned = await prisma.systemSetting.findUnique({
        where: { key: 'lastEstimatorAssigned' },
      });

      const lastAssignedId = lastAssigned?.value;
      const currentIndex = estimators.findIndex(e => e.id === lastAssignedId);
      const nextIndex = (currentIndex + 1) % estimators.length;
      const nextEstimator = estimators[nextIndex];

      // Update last assigned
      await prisma.systemSetting.upsert({
        where: { key: 'lastEstimatorAssigned' },
        update: { value: nextEstimator.id },
        create: { key: 'lastEstimatorAssigned', value: nextEstimator.id },
      });

      return nextEstimator;
    }

    // Get last assigned from team
    const lastAssigned = await prisma.systemSetting.findUnique({
      where: { key: 'lastEstimatorAssigned' },
    });

    const members = estimatorsTeam.members.map(m => m.user).filter(Boolean);
    const lastAssignedId = lastAssigned?.value;
    const currentIndex = members.findIndex(m => m.id === lastAssignedId);
    const nextIndex = (currentIndex + 1) % members.length;
    const nextEstimator = members[nextIndex];

    // Update last assigned
    await prisma.systemSetting.upsert({
      where: { key: 'lastEstimatorAssigned' },
      update: { value: nextEstimator.id },
      create: { key: 'lastEstimatorAssigned', value: nextEstimator.id },
    });

    return nextEstimator;
  } catch (error) {
    console.error('Round-robin assignment error:', error);
    return null;
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

    // For Estimate Requests, use provided assignedToId OR fall back to round-robin
    let ownerId = data.assignedToId || null;
    let assignedEstimator = null;
    if (data.isEstimateRequest && !ownerId) {
      // Only use round-robin if no assignedToId was provided
      assignedEstimator = await getNextEstimatorRoundRobin();
      if (assignedEstimator) {
        ownerId = assignedEstimator.id;
      }
    }

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
        // Estimate Request fields
        isEstimateRequest: data.isEstimateRequest || false,
        estimateType: data.estimateType,
        tradeType: data.tradeType,
        affectedStructures: data.affectedStructures,
        priorityLevel: data.priorityLevel,
        otherInformation: data.otherInformation,
        // Task/Assignment fields
        ownerId,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        taskStatus: data.taskStatus || 'Open',
        reminderEnabled: data.reminderEnabled || false,
        reminderDateTime: data.reminderDateTime ? new Date(data.reminderDateTime) : null,
        isRecurring: data.isRecurring || false,
        recurringFrequency: data.recurringFrequency,
        recurringEndDate: data.recurringEndDate ? new Date(data.recurringEndDate) : null,
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
        owner: { select: { id: true, fullName: true, email: true } },
      },
    });

    // Return with assignment info for estimate requests
    const response = {
      ...quote,
      assignedTo: quote.owner || assignedEstimator,
    };

    res.status(201).json(response);
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
// Equivalent to: Salesforce "Quote Accepted" trigger + Service Contract creation flows
export async function acceptQuote(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user?.id; // For audit trail

    const quote = await prisma.quote.findUnique({
      where: { id },
      include: {
        opportunity: {
          include: {
            account: {
              select: { isPandaClaims: true, isSureClaims: true },
            },
          },
        },
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

    // Get opportunity owner for commission assignment
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: quote.opportunityId },
      select: { ownerId: true, workType: true },
    });

    // Create service contract
    const serviceContract = await prisma.serviceContract.create({
      data: {
        contractNumber,
        name: `Service Contract - ${quote.opportunity.name}`,
        status: 'Active', // Set to Active to trigger invoice creation
        opportunityId: quote.opportunityId,
        accountId: quote.opportunity.accountId,
        contractTotal: quote.total,
        salesTotalPrice: quote.total, // Sales price for commission calculation
        isPmContract: quote.isPmQuote,
        ownerId: opportunity?.ownerId,
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

    // ========================================================================
    // WORKFLOW AUTOMATIONS (Replaces Salesforce Flows)
    // ========================================================================

    // 1. Trigger Commission Creation (Salesforce: Service Contract - Commissions Updates)
    try {
      await commissionTriggers.onContractCreated(serviceContract, userId);

      // If PandaClaims account, also create Sales Op and Sales Flip commissions
      const isPandaClaims = quote.opportunity.account?.isPandaClaims ||
                            quote.opportunity.account?.isSureClaims;
      if (isPandaClaims && !quote.isPmQuote) {
        await commissionTriggers.onPandaClaimsOnboarded(serviceContract, userId);
      }

      // If PM Quote, create PM-specific commissions
      if (quote.isPmQuote) {
        const pmUserId = opportunity?.ownerId; // PM who sold the add-on
        if (pmUserId) {
          await commissionTriggers.onPMContractCreated(serviceContract, pmUserId, userId);
        }
      }
    } catch (commError) {
      console.error('Commission trigger error:', commError);
      // Don't fail the request - commissions can be created manually
    }

    // 2. Trigger Invoice Creation (Salesforce: Kulturra_Invoice_Creation_From_Service_Contract)
    let invoice = null;
    try {
      if (quote.isPmQuote) {
        invoice = await invoiceTriggers.onPMContractCreated(serviceContract.id, userId);
      } else {
        invoice = await invoiceTriggers.onContractActivated(serviceContract.id, userId);
      }
    } catch (invoiceError) {
      console.error('Invoice trigger error:', invoiceError);
      // Don't fail the request - invoice can be created manually
    }

    res.json({
      quote: updatedQuote,
      serviceContract,
      invoice,
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
