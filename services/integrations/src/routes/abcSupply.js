// ABC Supply Routes
// Handles material ordering from ABC Supply
import { Router } from 'express';
import abcSupplyService from '../services/abcSupplyService.js';
import { logger } from '../middleware/logger.js';
import prisma from '../prisma.js';

const router = Router();

/**
 * GET /api/integrations/abc-supply/status
 * Check ABC Supply connection status
 */
router.get('/status', async (req, res, next) => {
  try {
    // Try to get auth token to verify connection
    await abcSupplyService.getAuthToken();
    const config = abcSupplyService.getBranches();

    res.json({
      success: true,
      data: {
        connected: true,
        branchCode: config.branchCode,
        shipTo: config.shipTo,
      },
    });
  } catch (error) {
    logger.error('ABC Supply status check failed', { error: error.message });
    res.json({
      success: true,
      data: {
        connected: false,
        error: error.message,
      },
    });
  }
});

/**
 * POST /api/integrations/abc-supply/products/search
 * Search for products in ABC Supply catalog
 */
router.post('/products/search', async (req, res, next) => {
  try {
    const { searchTerm, category, page = 1, limit = 20 } = req.body;

    const result = await abcSupplyService.searchProducts({
      searchTerm,
      category,
      pageNumber: page,
      itemsPerPage: limit,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/integrations/abc-supply/pricing
 * Get pricing for products
 */
router.post('/pricing', async (req, res, next) => {
  try {
    const { products } = req.body;

    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Products array is required' },
      });
    }

    const result = await abcSupplyService.getPricing(products);

    res.json({
      success: true,
      data: result.prices,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/integrations/abc-supply/orders
 * Create and submit an order to ABC Supply
 */
router.post('/orders', async (req, res, next) => {
  try {
    const {
      orderId,
      opportunityId,
      deliveryType,
      shippingType,
      deliveryDate,
      deliveryTime,
      lineItems,
      comment,
    } = req.body;

    if (!orderId && !opportunityId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'orderId or opportunityId is required' },
      });
    }

    if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'lineItems array is required' },
      });
    }

    // Get order details from database if orderId is provided
    let order, account, contact;

    if (orderId) {
      order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          account: true,
          opportunity: {
            include: {
              contact: true,
            },
          },
        },
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Order not found' },
        });
      }

      account = order.account;
      contact = order.opportunity?.contact || { name: req.user?.name, email: req.user?.email };
    } else if (opportunityId) {
      const opportunity = await prisma.opportunity.findUnique({
        where: { id: opportunityId },
        include: {
          account: true,
          contact: true,
        },
      });

      if (!opportunity) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Opportunity not found' },
        });
      }

      account = opportunity.account;
      contact = opportunity.contact || { name: req.user?.name, email: req.user?.email };

      // Create local order record
      order = await prisma.order.create({
        data: {
          accountId: opportunity.accountId,
          opportunityId: opportunity.id,
          type: 'Material',
          status: 'Draft',
          effectiveDate: new Date(),
        },
      });
    }

    // Get current user info for contact
    const userContact = {
      name: contact?.firstName && contact?.lastName
        ? `${contact.firstName} ${contact.lastName}`
        : contact?.name || req.user?.name || 'Panda Exteriors',
      email: contact?.email || req.user?.email || '',
      phone: contact?.phone || contact?.mobilePhone || req.user?.phone || '',
    };

    // Submit to ABC Supply
    const result = await abcSupplyService.submitOrder({
      orderId: order.id,
      purchaseOrder: order.orderNumber || `Panda-${order.id}`,
      deliveryType: deliveryType || 'DR',
      shippingType: shippingType || 'GroundDrop',
      deliveryDate: deliveryDate || new Date().toISOString().split('T')[0],
      deliveryTime: deliveryTime || 'Anytime',
      account: {
        name: account?.name || '',
        billingStreet: account?.billingStreet || account?.street || '',
        billingCity: account?.billingCity || account?.city || '',
        billingState: account?.billingState || account?.state || '',
        billingPostalCode: account?.billingPostalCode || account?.postalCode || '',
      },
      contact: userContact,
      lineItems,
      comment,
    });

    // Update local order with ABC confirmation
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'Activated',
        abcConfirmationNumber: result.confirmationNumber,
        abcOrderNumber: result.orderNumber,
        abcStatus: 'Submitted',
        deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
      },
    });

    // Create order items
    for (const item of lineItems) {
      await prisma.orderItem.create({
        data: {
          orderId: order.id,
          productId: item.productId,
          productName: item.name || item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          uom: item.uom || 'EA',
          abcItemNumber: item.itemNumber || item.productId,
        },
      });
    }

    logger.info('ABC Supply order created', {
      orderId: order.id,
      confirmationNumber: result.confirmationNumber,
    });

    res.json({
      success: true,
      data: {
        orderId: order.id,
        confirmationNumber: result.confirmationNumber,
        orderNumber: result.orderNumber,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/integrations/abc-supply/orders/:id/status
 * Get order status from ABC Supply
 */
router.get('/orders/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get order from database
    const order = await prisma.order.findUnique({
      where: { id },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Order not found' },
      });
    }

    if (!order.abcConfirmationNumber) {
      return res.status(400).json({
        success: false,
        error: { code: 'NOT_SUBMITTED', message: 'Order has not been submitted to ABC Supply' },
      });
    }

    // Get status from ABC Supply
    const result = await abcSupplyService.getOrderStatus(order.abcConfirmationNumber);

    // Update local order with latest status
    await prisma.order.update({
      where: { id },
      data: {
        abcStatus: result.status,
        abcShipmentNumber: result.shipmentNumber,
        abcTrackingId: result.trackingId,
        abcLastUpdate: new Date(),
      },
    });

    res.json({
      success: true,
      data: {
        orderId: order.id,
        confirmationNumber: order.abcConfirmationNumber,
        status: result.status,
        shipmentNumber: result.shipmentNumber,
        trackingId: result.trackingId,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/integrations/abc-supply/webhook
 * Handle webhooks from ABC Supply for order status updates
 */
router.post('/webhook', async (req, res, next) => {
  try {
    const { orderNumber, confirmationNumber, status, shipmentNumber, trackingId, proofOfDeliveryUrl } = req.body;

    logger.info('ABC Supply webhook received', {
      orderNumber,
      confirmationNumber,
      status,
    });

    // Find order by ABC confirmation number
    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { abcConfirmationNumber: confirmationNumber },
          { abcOrderNumber: orderNumber },
        ],
      },
    });

    if (order) {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          abcOrderNumber: orderNumber || order.abcOrderNumber,
          abcStatus: status,
          abcShipmentNumber: shipmentNumber,
          abcTrackingId: trackingId,
          abcProofOfDeliveryUrl: proofOfDeliveryUrl,
          abcLastUpdate: new Date(),
        },
      });

      logger.info('Order updated from ABC webhook', {
        orderId: order.id,
        status,
      });
    } else {
      logger.warn('Order not found for ABC webhook', {
        orderNumber,
        confirmationNumber,
      });
    }

    // Always respond 200 to webhooks
    res.json({ success: true });
  } catch (error) {
    logger.error('ABC Supply webhook error', { error: error.message });
    // Still respond 200 to prevent retries
    res.json({ success: true });
  }
});

/**
 * GET /api/integrations/abc-supply/accounts
 * Search for ABC Supply accounts
 */
router.get('/accounts', async (req, res, next) => {
  try {
    const { search } = req.query;
    const result = await abcSupplyService.searchAccounts({ searchTerm: search });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
