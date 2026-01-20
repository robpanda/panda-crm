import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Generate material order number
const generateMaterialOrderNumber = async () => {
  const count = await prisma.materialOrder.count();
  return `MO-${String(count + 1).padStart(6, '0')}`;
};

// Get all material orders with filtering
export const getMaterialOrders = async (req, res) => {
  try {
    const {
      status,
      supplierId,
      workOrderId,
      opportunityId,
      deliveryDateStart,
      deliveryDateEnd,
      search,
      page = 1,
      limit = 50,
      sortBy = 'deliveryDate',
      sortOrder = 'asc',
    } = req.query;

    const where = {};

    // Status filter (W/O/D tabs)
    if (status) {
      where.materialStatus = status;
    }

    // Supplier filter
    if (supplierId) {
      where.supplierId = supplierId;
    }

    // Work order filter
    if (workOrderId) {
      where.workOrderId = workOrderId;
    }

    // Opportunity filter
    if (opportunityId) {
      where.opportunityId = opportunityId;
    }

    // Date range filter
    if (deliveryDateStart || deliveryDateEnd) {
      where.deliveryDate = {};
      if (deliveryDateStart) {
        where.deliveryDate.gte = new Date(deliveryDateStart);
      }
      if (deliveryDateEnd) {
        where.deliveryDate.lte = new Date(deliveryDateEnd);
      }
    }

    // Search filter
    if (search) {
      where.OR = [
        { materialOrderNumber: { contains: search, mode: 'insensitive' } },
        { supplierOrderNumber: { contains: search, mode: 'insensitive' } },
        { workOrder: { workOrderNumber: { contains: search, mode: 'insensitive' } } },
        { workOrder: { account: { name: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [materialOrders, total] = await Promise.all([
      prisma.materialOrder.findMany({
        where,
        include: {
          supplier: true,
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
          order: true,
          orderedBy: {
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
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: parseInt(limit),
      }),
      prisma.materialOrder.count({ where }),
    ]);

    res.json({
      data: materialOrders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Error fetching material orders:', error);
    res.status(500).json({ error: 'Failed to fetch material orders' });
  }
};

// Get material order counts by status (for tabs)
export const getMaterialOrderCounts = async (req, res) => {
  try {
    const counts = await prisma.materialOrder.groupBy({
      by: ['materialStatus'],
      _count: true,
    });

    const statusCounts = {
      WAITING: 0,
      ORDERED: 0,
      DELIVERED: 0,
      CANCELLED: 0,
    };

    counts.forEach(({ materialStatus, _count }) => {
      statusCounts[materialStatus] = _count;
    });

    res.json({
      counts: statusCounts,
      total: Object.values(statusCounts).reduce((a, b) => a + b, 0),
    });
  } catch (error) {
    console.error('Error fetching material order counts:', error);
    res.status(500).json({ error: 'Failed to fetch counts' });
  }
};

// Get a single material order
export const getMaterialOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const materialOrder = await prisma.materialOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        workOrder: {
          include: {
            account: true,
            opportunity: true,
            workType: true,
            serviceAppointments: {
              include: {
                assignedResources: {
                  include: {
                    serviceResource: true,
                  },
                },
              },
            },
          },
        },
        opportunity: {
          include: {
            account: true,
            owner: true,
          },
        },
        order: {
          include: {
            lineItems: true,
          },
        },
        orderedBy: true,
        lineItems: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!materialOrder) {
      return res.status(404).json({ error: 'Material order not found' });
    }

    res.json(materialOrder);
  } catch (error) {
    console.error('Error fetching material order:', error);
    res.status(500).json({ error: 'Failed to fetch material order' });
  }
};

// Create a new material order
export const createMaterialOrder = async (req, res) => {
  try {
    const {
      workOrderId,
      opportunityId,
      accountId,
      supplierId,
      orderId,
      deliveryType,
      deliveryDate,
      deliveryTimeWindow,
      deliveryNotes,
      deliveryStreet,
      deliveryCity,
      deliveryState,
      deliveryPostalCode,
      estimatedCost,
      lineItems,
    } = req.body;

    // Validate work order exists
    const workOrder = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      include: { account: true },
    });

    if (!workOrder) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    const materialOrderNumber = await generateMaterialOrderNumber();

    // Use work order's account address if delivery address not provided
    const deliveryAddress = {
      deliveryStreet: deliveryStreet || workOrder.account?.billingStreet,
      deliveryCity: deliveryCity || workOrder.account?.billingCity,
      deliveryState: deliveryState || workOrder.account?.billingState,
      deliveryPostalCode: deliveryPostalCode || workOrder.account?.billingPostalCode,
    };

    const materialOrder = await prisma.materialOrder.create({
      data: {
        materialOrderNumber,
        workOrderId,
        opportunityId: opportunityId || workOrder.opportunityId,
        accountId: accountId || workOrder.accountId,
        supplierId,
        orderId,
        deliveryType: deliveryType || 'DELIVERY',
        deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
        deliveryTimeWindow,
        deliveryNotes,
        ...deliveryAddress,
        estimatedCost: estimatedCost ? parseFloat(estimatedCost) : null,
        orderedById: req.user?.id,
        lineItems: lineItems?.length ? {
          create: lineItems.map(item => ({
            productId: item.productId,
            description: item.description,
            sku: item.sku,
            quantity: parseFloat(item.quantity) || 1,
            unit: item.unit,
            unitPrice: item.unitPrice ? parseFloat(item.unitPrice) : null,
            totalPrice: item.totalPrice ? parseFloat(item.totalPrice) : null,
          })),
        } : undefined,
      },
      include: {
        supplier: true,
        workOrder: {
          include: {
            account: true,
          },
        },
        lineItems: {
          include: {
            product: true,
          },
        },
      },
    });

    res.status(201).json(materialOrder);
  } catch (error) {
    console.error('Error creating material order:', error);
    res.status(500).json({ error: 'Failed to create material order' });
  }
};

// Update a material order
export const updateMaterialOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Handle date fields
    if (updates.deliveryDate) {
      updates.deliveryDate = new Date(updates.deliveryDate);
    }
    if (updates.actualDeliveryDate) {
      updates.actualDeliveryDate = new Date(updates.actualDeliveryDate);
    }
    if (updates.orderedAt) {
      updates.orderedAt = new Date(updates.orderedAt);
    }

    // Handle decimal fields
    if (updates.estimatedCost !== undefined) {
      updates.estimatedCost = updates.estimatedCost ? parseFloat(updates.estimatedCost) : null;
    }
    if (updates.actualCost !== undefined) {
      updates.actualCost = updates.actualCost ? parseFloat(updates.actualCost) : null;
    }

    // Don't include lineItems in direct update
    const { lineItems, ...orderUpdates } = updates;

    const materialOrder = await prisma.materialOrder.update({
      where: { id },
      data: orderUpdates,
      include: {
        supplier: true,
        workOrder: {
          include: {
            account: true,
          },
        },
        lineItems: {
          include: {
            product: true,
          },
        },
      },
    });

    res.json(materialOrder);
  } catch (error) {
    console.error('Error updating material order:', error);
    res.status(500).json({ error: 'Failed to update material order' });
  }
};

// Update material order status (W -> O -> D)
export const updateMaterialOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, supplierOrderNumber, orderedAt, actualDeliveryDate } = req.body;

    const updateData = {
      materialStatus: status,
    };

    // When marking as ORDERED
    if (status === 'ORDERED') {
      updateData.orderedAt = orderedAt ? new Date(orderedAt) : new Date();
      if (supplierOrderNumber) {
        updateData.supplierOrderNumber = supplierOrderNumber;
      }
      updateData.orderedById = req.user?.id;
    }

    // When marking as DELIVERED
    if (status === 'DELIVERED') {
      updateData.actualDeliveryDate = actualDeliveryDate ? new Date(actualDeliveryDate) : new Date();
    }

    const materialOrder = await prisma.materialOrder.update({
      where: { id },
      data: updateData,
      include: {
        supplier: true,
        workOrder: {
          include: {
            account: true,
          },
        },
      },
    });

    res.json(materialOrder);
  } catch (error) {
    console.error('Error updating material order status:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
};

// Bulk update material order statuses
export const bulkUpdateStatus = async (req, res) => {
  try {
    const { ids, status, supplierOrderNumber, orderedAt, actualDeliveryDate } = req.body;

    const updateData = {
      materialStatus: status,
    };

    if (status === 'ORDERED') {
      updateData.orderedAt = orderedAt ? new Date(orderedAt) : new Date();
      if (supplierOrderNumber) {
        updateData.supplierOrderNumber = supplierOrderNumber;
      }
      updateData.orderedById = req.user?.id;
    }

    if (status === 'DELIVERED') {
      updateData.actualDeliveryDate = actualDeliveryDate ? new Date(actualDeliveryDate) : new Date();
    }

    const result = await prisma.materialOrder.updateMany({
      where: { id: { in: ids } },
      data: updateData,
    });

    res.json({ updated: result.count });
  } catch (error) {
    console.error('Error bulk updating material orders:', error);
    res.status(500).json({ error: 'Failed to bulk update' });
  }
};

// Delete a material order
export const deleteMaterialOrder = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.materialOrder.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting material order:', error);
    res.status(500).json({ error: 'Failed to delete material order' });
  }
};

// Get suppliers list
export const getSuppliers = async (req, res) => {
  try {
    const suppliers = await prisma.supplier.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    res.json({ data: suppliers });
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json({ error: 'Failed to fetch suppliers' });
  }
};

// Create or update supplier
export const upsertSupplier = async (req, res) => {
  try {
    const { id, name, code, phone, email, website, street, city, state, postalCode, accountNumber, shipToAccount, isAbcSupply, isSrsDistribution } = req.body;

    const supplier = await prisma.supplier.upsert({
      where: { id: id || 'new' },
      update: {
        name,
        code,
        phone,
        email,
        website,
        street,
        city,
        state,
        postalCode,
        accountNumber,
        shipToAccount,
        isAbcSupply,
        isSrsDistribution,
      },
      create: {
        name,
        code,
        phone,
        email,
        website,
        street,
        city,
        state,
        postalCode,
        accountNumber,
        shipToAccount,
        isAbcSupply,
        isSrsDistribution,
      },
    });

    res.json(supplier);
  } catch (error) {
    console.error('Error upserting supplier:', error);
    res.status(500).json({ error: 'Failed to save supplier' });
  }
};

// Submit to ABC Supply via integrations service
export const submitToAbcSupply = async (req, res) => {
  try {
    const { id } = req.params;
    const { deliveryType = 'DR', shippingType = 'GroundDrop', deliveryDate, deliveryTime = 'Anytime', comment } = req.body;

    const materialOrder = await prisma.materialOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        workOrder: {
          include: {
            account: true,
            opportunity: {
              include: {
                contact: true,
              },
            },
          },
        },
        opportunity: {
          include: {
            account: true,
            contact: true,
          },
        },
        lineItems: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!materialOrder) {
      return res.status(404).json({ error: 'Material order not found' });
    }

    if (!materialOrder.supplier?.isAbcSupply) {
      return res.status(400).json({ error: 'Supplier is not ABC Supply' });
    }

    // Get account and contact info
    const account = materialOrder.workOrder?.account || materialOrder.opportunity?.account;
    const contact = materialOrder.workOrder?.opportunity?.contact || materialOrder.opportunity?.contact;

    if (!account) {
      return res.status(400).json({ error: 'No account found for this order' });
    }

    if (!materialOrder.lineItems?.length) {
      return res.status(400).json({ error: 'No line items on this order' });
    }

    // Format line items for ABC Supply API
    const lineItems = materialOrder.lineItems.map(item => ({
      itemNumber: item.sku || item.product?.sku || item.description,
      quantity: item.quantity,
      uom: item.unit || 'EA',
      name: item.product?.name || item.description,
      unitPrice: item.unitPrice,
    }));

    // Call integrations service ABC Supply API
    const integrationsUrl = process.env.INTEGRATIONS_SERVICE_URL || 'http://localhost:3010';

    const abcResponse = await fetch(`${integrationsUrl}/api/integrations/abc-supply/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers.authorization || '',
      },
      body: JSON.stringify({
        orderId: materialOrder.orderId,
        opportunityId: materialOrder.opportunityId,
        deliveryType,
        shippingType,
        deliveryDate: deliveryDate || materialOrder.deliveryDate?.toISOString().split('T')[0],
        deliveryTime,
        lineItems,
        comment: comment || materialOrder.deliveryNotes,
        account: {
          name: account.name,
          billingStreet: account.billingStreet || materialOrder.deliveryStreet,
          billingCity: account.billingCity || materialOrder.deliveryCity,
          billingState: account.billingState || materialOrder.deliveryState,
          billingPostalCode: account.billingPostalCode || materialOrder.deliveryPostalCode,
        },
        contact: contact ? {
          name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Panda Exteriors',
          email: contact.email || '',
          phone: contact.phone || contact.mobilePhone || '',
        } : {
          name: req.user?.name || 'Panda Exteriors',
          email: req.user?.email || '',
          phone: '',
        },
      }),
    });

    const abcResult = await abcResponse.json();

    if (!abcResponse.ok || !abcResult.success) {
      console.error('ABC Supply API error:', abcResult);
      return res.status(abcResponse.status || 500).json({
        error: abcResult.error?.message || 'Failed to submit to ABC Supply',
        details: abcResult,
      });
    }

    // Update material order with ABC confirmation
    const updated = await prisma.materialOrder.update({
      where: { id },
      data: {
        materialStatus: 'ORDERED',
        orderedAt: new Date(),
        orderedById: req.user?.id,
        supplierOrderNumber: abcResult.data.confirmationNumber,
        abcConfirmationNumber: abcResult.data.confirmationNumber,
        abcOrderNumber: abcResult.data.orderNumber,
        abcStatus: 'Submitted',
      },
      include: {
        supplier: true,
        workOrder: {
          include: {
            account: true,
          },
        },
        lineItems: true,
      },
    });

    res.json({
      success: true,
      message: 'Order submitted to ABC Supply',
      confirmationNumber: abcResult.data.confirmationNumber,
      orderNumber: abcResult.data.orderNumber,
      materialOrder: updated,
    });
  } catch (error) {
    console.error('Error submitting to ABC Supply:', error);
    res.status(500).json({ error: 'Failed to submit to ABC Supply', details: error.message });
  }
};

// Get orders for calendar display (with delivery dates)
export const getOrdersForCalendar = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const where = {
      deliveryDate: {
        gte: new Date(startDate),
        lte: new Date(endDate),
      },
      materialStatus: { not: 'CANCELLED' },
    };

    const materialOrders = await prisma.materialOrder.findMany({
      where,
      include: {
        supplier: true,
        workOrder: {
          include: {
            account: true,
            serviceAppointments: {
              where: {
                scheduledStart: {
                  gte: new Date(startDate),
                  lte: new Date(endDate),
                },
              },
              include: {
                assignedResources: {
                  include: {
                    serviceResource: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { deliveryDate: 'asc' },
    });

    res.json({ data: materialOrders });
  } catch (error) {
    console.error('Error fetching calendar orders:', error);
    res.status(500).json({ error: 'Failed to fetch calendar orders' });
  }
};

export default {
  getMaterialOrders,
  getMaterialOrderCounts,
  getMaterialOrder,
  createMaterialOrder,
  updateMaterialOrder,
  updateMaterialOrderStatus,
  bulkUpdateStatus,
  deleteMaterialOrder,
  getSuppliers,
  upsertSupplier,
  submitToAbcSupply,
  getOrdersForCalendar,
};
