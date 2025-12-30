// ABC Supply Integration Service
// Handles authentication, product search, pricing, and order submission
import { logger } from '../middleware/logger.js';

// ABC Supply API Configuration
const ABC_AUTH_URL = process.env.ABC_AUTH_URL || 'https://login.abcsupply.com/oauth2/ausa9u1n0mLh29HLU1t7';
const ABC_API_URL = process.env.ABC_API_URL || 'https://api.abcsupply.com';
const ABC_CLIENT_ID = process.env.ABC_CLIENT_ID;
const ABC_CLIENT_SECRET = process.env.ABC_CLIENT_SECRET;
const ABC_BRANCH_CODE = process.env.ABC_BRANCH_CODE || '1315';
const ABC_SHIP_TO = process.env.ABC_SHIP_TO || '2097770-2';

// Token cache
let cachedToken = null;
let tokenExpiry = null;

/**
 * Get OAuth2 access token for ABC Supply API
 */
export async function getAuthToken() {
  // Check if we have a valid cached token
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  if (!ABC_CLIENT_ID || !ABC_CLIENT_SECRET) {
    throw new Error('ABC Supply credentials not configured');
  }

  const credentials = Buffer.from(`${ABC_CLIENT_ID}:${ABC_CLIENT_SECRET}`).toString('base64');
  const scope = 'pricing.read order.read order.write product.read account.read location.read offline_access';

  try {
    const response = await fetch(`${ABC_AUTH_URL}/v1/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: `grant_type=client_credentials&scope=${encodeURIComponent(scope)}`,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('ABC Supply auth failed', { status: response.status, error: errorText });
      throw new Error(`ABC Supply authentication failed: ${response.status}`);
    }

    const data = await response.json();
    cachedToken = data.access_token;
    // Expire token 5 minutes before actual expiry
    tokenExpiry = Date.now() + ((data.expires_in - 300) * 1000);

    logger.info('ABC Supply token obtained', { expiresIn: data.expires_in });
    return cachedToken;
  } catch (error) {
    logger.error('ABC Supply auth error', { error: error.message });
    throw error;
  }
}

/**
 * Make authenticated request to ABC Supply API
 */
async function abcRequest(endpoint, options = {}) {
  const token = await getAuthToken();

  const response = await fetch(`${ABC_API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    logger.error('ABC Supply API error', {
      endpoint,
      status: response.status,
      error: data,
    });
    throw new Error(data?.message || `ABC Supply API error: ${response.status}`);
  }

  return data;
}

/**
 * Search for products in ABC Supply catalog
 */
export async function searchProducts({ searchTerm, category, pageNumber = 1, itemsPerPage = 20 }) {
  const filters = [];

  if (searchTerm) {
    filters.push({
      condition: 'contains',
      key: 'longDescription',
      values: [searchTerm],
      joinCondition: null,
    });
  }

  if (category) {
    filters.push({
      condition: 'equals',
      key: 'category',
      values: [category],
      joinCondition: 'and',
    });
  }

  const body = {
    filters,
    pagination: {
      pageNumber,
      itemsPerPage,
    },
  };

  const result = await abcRequest('/api/product/v1/search/items?familyItems=true', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  logger.info('ABC Supply product search', {
    searchTerm,
    category,
    resultCount: result?.items?.length || 0,
  });

  return result;
}

/**
 * Get pricing for a list of products
 */
export async function getPricing(products) {
  const lines = products.map((product, index) => ({
    id: product.id || String(index + 1),
    itemNumber: product.productId || product.itemNumber,
    quantity: product.quantity || 1,
    uom: product.uom || product.unit || 'EA',
    length: {
      value: 1,
      uom: 'in',
    },
  }));

  const body = {
    requestId: crypto.randomUUID(),
    shipToNumber: ABC_SHIP_TO,
    branchNumber: ABC_BRANCH_CODE,
    purpose: 'ordering',
    lines,
  };

  const result = await abcRequest('/api/pricing/v2/prices', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  // Build price map
  const prices = {};
  if (result?.lines) {
    for (const line of result.lines) {
      prices[line.itemNumber] = {
        unitPrice: line.unitPrice,
        uom: line.uom,
        lineId: line.id,
      };
    }
  }

  logger.info('ABC Supply pricing retrieved', {
    itemCount: products.length,
    priceCount: Object.keys(prices).length,
  });

  return { prices, raw: result };
}

/**
 * Submit an order to ABC Supply
 */
export async function submitOrder({
  orderId,
  purchaseOrder,
  deliveryType, // 'DR' (Delivery) or 'SA' (Pickup)
  shippingType, // 'GroundDrop' or 'RoofLoad'
  deliveryDate,
  deliveryTime, // 'Anytime', 'AM', 'PM'
  account,
  contact,
  lineItems,
  comment,
}) {
  // Determine delivery appointment times based on deliveryTime
  let instruction, fromTime, toTime;
  switch (deliveryTime) {
    case 'AM':
      instruction = 'AM';
      fromTime = '01:00';
      toTime = '11:00';
      break;
    case 'PM':
      instruction = 'PM';
      fromTime = '13:00';
      toTime = '23:00';
      break;
    default:
      instruction = 'AT'; // Anytime
      fromTime = '01:00';
      toTime = '23:00';
  }

  const orderRequest = {
    requestId: crypto.randomUUID(),
    purchaseOrder: purchaseOrder || `Panda Ext-${orderId}`,
    branchNumber: ABC_BRANCH_CODE,
    deliveryService: shippingType === 'RoofLoad' ? 'OTR' : 'OTG',
    typeCode: deliveryType || 'DR',
    dates: {
      deliveryRequestedFor: deliveryDate,
    },
    deliveryAppointment: {
      instructionsTypeCode: instruction,
      instructions: '',
      fromTime,
      toTime,
      timeZoneCode: 'ET',
    },
    currency: 'USD',
    shipTo: {
      name: account.name || '',
      number: ABC_SHIP_TO,
      address: {
        line1: account.billingStreet || account.street || '',
        line2: '',
        line3: '',
        city: account.billingCity || account.city || '',
        state: account.billingState || account.state || '',
        postal: account.billingPostalCode || account.postalCode || '',
        country: 'USA',
      },
      contacts: [
        {
          name: contact.name || '',
          functionCode: 'DC',
          email: contact.email || '',
          phones: contact.phone ? [
            {
              number: contact.phone.replace(/\D/g, ''),
              type: 'MOBILE',
              ext: '',
            },
          ] : [],
        },
      ],
    },
    orderComments: comment ? [
      {
        code: 'D',
        description: comment,
      },
    ] : [],
    lines: lineItems.map((item, index) => ({
      id: String(index + 1),
      itemNumber: item.productId || item.itemNumber,
      itemDescription: item.name || item.description || '',
      orderedQty: {
        value: item.quantity,
        uom: item.uom || 'EA',
      },
      unitPrice: {
        instructions: '',
        value: item.unitPrice,
        uom: item.uom || 'EA',
      },
      comments: {
        code: 'D',
        description: '',
      },
    })),
  };

  const result = await abcRequest('/api/order/v2/orders', {
    method: 'POST',
    body: JSON.stringify([orderRequest]),
  });

  logger.info('ABC Supply order submitted', {
    orderId,
    purchaseOrder: orderRequest.purchaseOrder,
    lineCount: lineItems.length,
    confirmationNumber: result?.[0]?.confirmationNumber,
  });

  return {
    success: true,
    confirmationNumber: result?.[0]?.confirmationNumber,
    orderNumber: result?.[0]?.orderNumber,
    raw: result,
  };
}

/**
 * Get order status from ABC Supply
 */
export async function getOrderStatus(confirmationNumber) {
  const result = await abcRequest(`/api/order/v2/orders/${confirmationNumber}`, {
    method: 'GET',
  });

  logger.info('ABC Supply order status', {
    confirmationNumber,
    status: result?.status,
  });

  return result;
}

/**
 * Search for ship-to accounts
 */
export async function searchAccounts({ searchTerm, accountType = 'Ship-to' }) {
  const body = {
    filters: [
      {
        condition: 'equals',
        key: 'accountType',
        values: [accountType],
        joinCondition: 'and',
      },
    ],
    pagination: {
      pageNumber: 1,
      itemsPerPage: 10,
    },
  };

  if (searchTerm) {
    body.filters.push({
      condition: 'contains',
      key: 'name',
      values: [searchTerm],
      joinCondition: 'and',
    });
  }

  const result = await abcRequest('/api/account/v1/search/accounts', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return result;
}

/**
 * Get branch locations
 */
export async function getBranches() {
  // This is typically a static list or configured per region
  // Using the branch code from configuration
  return {
    branchCode: ABC_BRANCH_CODE,
    shipTo: ABC_SHIP_TO,
  };
}

export default {
  getAuthToken,
  searchProducts,
  getPricing,
  submitOrder,
  getOrderStatus,
  searchAccounts,
  getBranches,
};
