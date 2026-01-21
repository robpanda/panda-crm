import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Generate labor order number
const generateLaborOrderNumber = async () => {
  const count = await prisma.laborOrder.count();
  return `LO-${String(count + 1).padStart(6, '0')}`;
};

// Get all labor orders with filtering
export const getLaborOrders = async (req, res) => {
  try {
    const {
      status,
      workOrderId,
      opportunityId,
      workTypeId,
      search,
      page = 1,
      limit = 50,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const where = {};

    if (status) {
      where.status = status;
    }

    if (workOrderId) {
      where.workOrderId = workOrderId;
    }

    if (opportunityId) {
      where.opportunityId = opportunityId;
    }

    if (workTypeId) {
      where.workTypeId = workTypeId;
    }

    if (search) {
      where.OR = [
        { laborOrderNumber: { contains: search, mode: 'insensitive' } },
        { workTypeName: { contains: search, mode: 'insensitive' } },
        { workOrder: { workOrderNumber: { contains: search, mode: 'insensitive' } } },
        { workOrder: { account: { name: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [laborOrders, total] = await Promise.all([
      prisma.laborOrder.findMany({
        where,
        include: {
          workOrder: {
            include: {
              account: true,
              opportunity: true,
              workType: true,
            },
          },
          opportunity: {
            include: {
              owner: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  fullName: true,
                },
              },
            },
          },
          orderTemplate: true,
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              fullName: true,
            },
          },
          lineItems: {
            include: {
              product: true,
            },
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: parseInt(limit),
      }),
      prisma.laborOrder.count({ where }),
    ]);

    res.json({
      success: true,
      data: laborOrders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Error fetching labor orders:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch labor orders'
    });
  }
};

// Get labor order counts by status
export const getLaborOrderCounts = async (req, res) => {
  try {
    const counts = await prisma.laborOrder.groupBy({
      by: ['status'],
      _count: true,
    });

    const statusCounts = {
      DRAFT: 0,
      SUBMITTED: 0,
      APPROVED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      CANCELLED: 0,
    };

    counts.forEach(({ status, _count }) => {
      statusCounts[status] = _count;
    });

    res.json({
      success: true,
      data: statusCounts,
    });
  } catch (error) {
    console.error('Error fetching labor order counts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch labor order counts'
    });
  }
};

// Get a single labor order by ID
export const getLaborOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const laborOrder = await prisma.laborOrder.findUnique({
      where: { id },
      include: {
        workOrder: {
          include: {
            account: true,
            opportunity: true,
            workType: true,
            serviceAppointments: true,
          },
        },
        opportunity: {
          include: {
            owner: true,
            contact: true,
            measurementReports: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
        orderTemplate: true,
        createdBy: true,
        lineItems: {
          include: {
            product: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!laborOrder) {
      return res.status(404).json({
        success: false,
        error: 'Labor order not found'
      });
    }

    res.json({
      success: true,
      data: laborOrder,
    });
  } catch (error) {
    console.error('Error fetching labor order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch labor order'
    });
  }
};

// Create a new labor order
export const createLaborOrder = async (req, res) => {
  try {
    const {
      workOrderId,
      opportunityId,
      accountId,
      orderTemplateId,
      workTypeId,
      workTypeName,
      includeSiding = false,
      includeSolarDnr = false,
      includeGutter = false,
      includeTrimWork = false,
      includeInteriorWork = false,
      includeAtticInsulation = false,
      notes,
      lineItems = [],
    } = req.body;

    // Validate required fields
    if (!workOrderId) {
      return res.status(400).json({
        success: false,
        error: 'Work order ID is required'
      });
    }

    // Verify work order exists
    const workOrder = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      include: { workType: true },
    });

    if (!workOrder) {
      return res.status(404).json({
        success: false,
        error: 'Work order not found'
      });
    }

    const laborOrderNumber = await generateLaborOrderNumber();

    // Calculate totals from line items
    let subtotal = 0;
    const processedLineItems = lineItems.map((item, index) => {
      const totalPrice = parseFloat(item.unitPrice || item.listPrice || 0) * parseFloat(item.quantity || 1);
      subtotal += totalPrice;

      return {
        productId: item.productId || null,
        productName: item.productName,
        description: item.description || null,
        listPrice: parseFloat(item.listPrice || item.unitPrice || 0),
        unitPrice: parseFloat(item.unitPrice || item.listPrice || 0),
        quantity: parseFloat(item.quantity || 1),
        totalPrice,
        uom: item.uom || null,
        workType: item.workType || workTypeName,
        sortOrder: item.sortOrder || index,
      };
    });

    const tax = 0; // Calculate tax if needed
    const total = subtotal + tax;

    const laborOrder = await prisma.laborOrder.create({
      data: {
        laborOrderNumber,
        workOrderId,
        opportunityId: opportunityId || workOrder.opportunityId,
        accountId: accountId || workOrder.accountId,
        orderTemplateId,
        workTypeId: workTypeId || workOrder.workTypeId,
        workTypeName: workTypeName || workOrder.workType?.name,
        includeSiding,
        includeSolarDnr,
        includeGutter,
        includeTrimWork,
        includeInteriorWork,
        includeAtticInsulation,
        notes,
        subtotal,
        tax,
        total,
        createdById: req.user?.id,
        lineItems: {
          create: processedLineItems,
        },
      },
      include: {
        workOrder: {
          include: {
            account: true,
            workType: true,
          },
        },
        orderTemplate: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            fullName: true,
          },
        },
        lineItems: {
          include: {
            product: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    res.status(201).json({
      success: true,
      data: laborOrder,
    });
  } catch (error) {
    console.error('Error creating labor order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create labor order'
    });
  }
};

// Update a labor order
export const updateLaborOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      status,
      workTypeId,
      workTypeName,
      orderTemplateId,
      includeSiding,
      includeSolarDnr,
      includeGutter,
      includeTrimWork,
      includeInteriorWork,
      includeAtticInsulation,
      notes,
      lineItems,
    } = req.body;

    // Check if labor order exists
    const existing = await prisma.laborOrder.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Labor order not found'
      });
    }

    // Build update data
    const updateData = {};

    if (status !== undefined) updateData.status = status;
    if (workTypeId !== undefined) updateData.workTypeId = workTypeId;
    if (workTypeName !== undefined) updateData.workTypeName = workTypeName;
    if (orderTemplateId !== undefined) updateData.orderTemplateId = orderTemplateId;
    if (includeSiding !== undefined) updateData.includeSiding = includeSiding;
    if (includeSolarDnr !== undefined) updateData.includeSolarDnr = includeSolarDnr;
    if (includeGutter !== undefined) updateData.includeGutter = includeGutter;
    if (includeTrimWork !== undefined) updateData.includeTrimWork = includeTrimWork;
    if (includeInteriorWork !== undefined) updateData.includeInteriorWork = includeInteriorWork;
    if (includeAtticInsulation !== undefined) updateData.includeAtticInsulation = includeAtticInsulation;
    if (notes !== undefined) updateData.notes = notes;

    // If line items are provided, replace them
    if (lineItems !== undefined) {
      // Delete existing line items
      await prisma.laborOrderLineItem.deleteMany({
        where: { laborOrderId: id },
      });

      // Calculate new totals
      let subtotal = 0;
      const processedLineItems = lineItems.map((item, index) => {
        const totalPrice = parseFloat(item.unitPrice || item.listPrice || 0) * parseFloat(item.quantity || 1);
        subtotal += totalPrice;

        return {
          laborOrderId: id,
          productId: item.productId || null,
          productName: item.productName,
          description: item.description || null,
          listPrice: parseFloat(item.listPrice || item.unitPrice || 0),
          unitPrice: parseFloat(item.unitPrice || item.listPrice || 0),
          quantity: parseFloat(item.quantity || 1),
          totalPrice,
          uom: item.uom || null,
          workType: item.workType,
          sortOrder: item.sortOrder || index,
        };
      });

      // Create new line items
      await prisma.laborOrderLineItem.createMany({
        data: processedLineItems,
      });

      updateData.subtotal = subtotal;
      updateData.tax = 0;
      updateData.total = subtotal;
    }

    const laborOrder = await prisma.laborOrder.update({
      where: { id },
      data: updateData,
      include: {
        workOrder: {
          include: {
            account: true,
            workType: true,
          },
        },
        orderTemplate: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            fullName: true,
          },
        },
        lineItems: {
          include: {
            product: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    res.json({
      success: true,
      data: laborOrder,
    });
  } catch (error) {
    console.error('Error updating labor order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update labor order'
    });
  }
};

// Update labor order status
export const updateLaborOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['DRAFT', 'SUBMITTED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const laborOrder = await prisma.laborOrder.update({
      where: { id },
      data: { status },
      include: {
        workOrder: {
          include: {
            account: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: laborOrder,
    });
  } catch (error) {
    console.error('Error updating labor order status:', error);

    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: 'Labor order not found'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update labor order status'
    });
  }
};

// Delete a labor order
export const deleteLaborOrder = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if labor order exists
    const existing = await prisma.laborOrder.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Labor order not found'
      });
    }

    // Only allow deletion of draft orders
    if (existing.status !== 'DRAFT') {
      return res.status(400).json({
        success: false,
        error: 'Only draft labor orders can be deleted'
      });
    }

    // Delete line items first (cascade should handle this, but being explicit)
    await prisma.laborOrderLineItem.deleteMany({
      where: { laborOrderId: id },
    });

    await prisma.laborOrder.delete({ where: { id } });

    res.json({
      success: true,
      message: 'Labor order deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting labor order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete labor order'
    });
  }
};

// Get labor price book items (for ordering UI)
export const getLaborPriceBookItems = async (req, res) => {
  try {
    const { workType, pricebookId, search, category } = req.query;

    // Get products that are typically used as labor items
    const where = {
      isActive: true,
      OR: [
        { family: 'Labor' },
        { category: 'Labor' },
        { name: { contains: 'install', mode: 'insensitive' } },
        { name: { contains: 'labor', mode: 'insensitive' } },
      ],
    };

    if (search) {
      where.AND = [
        {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { productCode: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    if (category) {
      where.category = category;
    }

    let products;

    // If pricebook specified, get from pricebook entries
    if (pricebookId) {
      const entries = await prisma.pricebookEntry.findMany({
        where: {
          pricebookId,
          isActive: true,
          product: where,
        },
        include: {
          product: true,
        },
        orderBy: {
          product: { name: 'asc' },
        },
      });

      products = entries.map(entry => ({
        ...entry.product,
        listPrice: entry.unitPrice,
        unitPrice: entry.unitPrice,
        pricebookEntryId: entry.id,
      }));
    } else {
      products = await prisma.product.findMany({
        where,
        orderBy: { name: 'asc' },
      });

      products = products.map(p => ({
        ...p,
        listPrice: p.unitPrice || 0,
      }));
    }

    // Group by work type if specified
    if (workType) {
      // Filter products that match the work type (by category or name pattern)
      products = products.filter(p =>
        p.category?.toLowerCase().includes(workType.toLowerCase()) ||
        p.name?.toLowerCase().includes(workType.toLowerCase())
      );
    }

    res.json({
      success: true,
      data: products,
    });
  } catch (error) {
    console.error('Error fetching labor price book items:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch labor price book items'
    });
  }
};

// Get default labor items by work type (for auto-population)
export const getDefaultLaborItems = async (req, res) => {
  try {
    const { workType } = req.params;

    // This would typically come from a configuration or template
    // For now, return common labor items based on work type
    const defaultItems = {
      'Gold Pledge': [
        { productName: 'Tear off & install laminated shingles', listPrice: 110, uom: 'SQ' },
        { productName: 'Steep Fee 8/12-12/12 pitch', listPrice: 10, uom: 'SQ' },
        { productName: 'Roof load materials', listPrice: 5, uom: 'SQ' },
        { productName: 'Install starter strip', listPrice: 3, uom: 'LF' },
        { productName: 'Install drip edge', listPrice: 2.50, uom: 'LF' },
        { productName: 'Install ice & water shield', listPrice: 4, uom: 'LF' },
        { productName: 'Install ridge cap', listPrice: 8, uom: 'LF' },
        { productName: 'Install pipe boots', listPrice: 15, uom: 'EA' },
      ],
      'Standard Roof Installation': [
        { productName: 'Tear off & install laminated shingles', listPrice: 95, uom: 'SQ' },
        { productName: 'Install starter strip', listPrice: 2.50, uom: 'LF' },
        { productName: 'Install drip edge', listPrice: 2, uom: 'LF' },
        { productName: 'Install ridge cap', listPrice: 6, uom: 'LF' },
      ],
      'Siding Installation': [
        { productName: 'Install vinyl siding', listPrice: 8, uom: 'SF' },
        { productName: 'Install J-channel', listPrice: 3, uom: 'LF' },
        { productName: 'Install corner posts', listPrice: 25, uom: 'EA' },
        { productName: 'Install starter strip', listPrice: 2, uom: 'LF' },
      ],
      'Gutter': [
        { productName: 'Install 5" K-style gutters', listPrice: 8, uom: 'LF' },
        { productName: 'Install downspouts', listPrice: 10, uom: 'LF' },
        { productName: 'Install gutter guards', listPrice: 5, uom: 'LF' },
      ],
    };

    const items = defaultItems[workType] || [];

    res.json({
      success: true,
      data: items.map((item, index) => ({
        ...item,
        unitPrice: item.listPrice,
        quantity: 1,
        totalPrice: item.listPrice,
        workType,
        sortOrder: index,
      })),
    });
  } catch (error) {
    console.error('Error fetching default labor items:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch default labor items'
    });
  }
};
