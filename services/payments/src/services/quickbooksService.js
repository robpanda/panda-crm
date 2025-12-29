// QuickBooks Online Integration Service
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { logger } from '../middleware/logger.js';

const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-2' });

let qbCredentials = null;
let qbTokens = null;

// QuickBooks API base URLs
const QB_API_BASE = 'https://quickbooks.api.intuit.com/v3/company';
const QB_SANDBOX_API_BASE = 'https://sandbox-quickbooks.api.intuit.com/v3/company';

async function getQBCredentials() {
  if (qbCredentials) return qbCredentials;

  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: 'panda-crm/quickbooks' })
    );
    qbCredentials = JSON.parse(response.SecretString);
    return qbCredentials;
  } catch (error) {
    logger.error('Failed to get QuickBooks credentials:', error);
    throw new Error('QuickBooks credentials not configured');
  }
}

function getApiBase() {
  return process.env.QB_SANDBOX === 'true' ? QB_SANDBOX_API_BASE : QB_API_BASE;
}

async function refreshAccessToken() {
  const creds = await getQBCredentials();

  // Check if we have a valid stored access token
  if (creds.access_token && creds.token_expiry && creds.token_expiry > Date.now() + 60000) {
    qbTokens = {
      access_token: creds.access_token,
      refresh_token: creds.refresh_token,
      expires_at: creds.token_expiry,
    };
    return qbTokens;
  }

  if (!creds.refresh_token) {
    throw new Error('QuickBooks not connected. Please authorize via /api/quickbooks/oauth/authorize');
  }

  const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
  const basicAuth = Buffer.from(`${creds.client_id}:${creds.client_secret}`).toString('base64');

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: creds.refresh_token,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error('QuickBooks token refresh failed:', error);
    throw new Error('Failed to refresh QuickBooks token. You may need to re-authorize.');
  }

  const tokens = await response.json();
  qbTokens = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + (tokens.expires_in * 1000),
  };

  // Update stored tokens in Secrets Manager
  try {
    const { UpdateSecretCommand } = await import('@aws-sdk/client-secrets-manager');
    const updatedCreds = {
      ...creds,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      token_expiry: qbTokens.expires_at,
    };
    await secretsClient.send(
      new UpdateSecretCommand({
        SecretId: 'panda-crm/quickbooks',
        SecretString: JSON.stringify(updatedCreds),
      })
    );
    logger.info('QuickBooks tokens refreshed and stored');
    // Clear cached credentials so next call gets fresh ones
    qbCredentials = null;
  } catch (updateError) {
    logger.warn('Failed to store refreshed tokens:', updateError.message);
  }

  return qbTokens;
}

async function getAccessToken() {
  if (qbTokens && qbTokens.expires_at > Date.now() + 60000) {
    return qbTokens.access_token;
  }
  const tokens = await refreshAccessToken();
  return tokens.access_token;
}

async function qbRequest(endpoint, options = {}) {
  const creds = await getQBCredentials();
  const accessToken = await getAccessToken();
  const apiBase = getApiBase();

  const url = `${apiBase}/${creds.realm_id}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error('QuickBooks API error:', { endpoint, status: response.status, error });
    throw new Error(`QuickBooks API error: ${response.status}`);
  }

  return response.json();
}

export const quickbooksService = {
  // ============ CUSTOMERS ============

  async createCustomer(data) {
    const customerData = {
      DisplayName: data.name,
      PrimaryEmailAddr: data.email ? { Address: data.email } : undefined,
      PrimaryPhone: data.phone ? { FreeFormNumber: data.phone } : undefined,
      BillAddr: data.billingAddress ? {
        Line1: data.billingAddress.line1,
        City: data.billingAddress.city,
        CountrySubDivisionCode: data.billingAddress.state,
        PostalCode: data.billingAddress.postalCode,
      } : undefined,
      Notes: data.notes,
    };

    // Remove undefined fields
    Object.keys(customerData).forEach(key =>
      customerData[key] === undefined && delete customerData[key]
    );

    const result = await qbRequest('/customer', {
      method: 'POST',
      body: JSON.stringify(customerData),
    });

    logger.info('QuickBooks customer created', { qbId: result.Customer.Id });
    return result.Customer;
  },

  async updateCustomer(qbCustomerId, data) {
    // First get current customer to get SyncToken
    const current = await this.getCustomer(qbCustomerId);

    const customerData = {
      Id: qbCustomerId,
      SyncToken: current.SyncToken,
      DisplayName: data.name || current.DisplayName,
      PrimaryEmailAddr: data.email ? { Address: data.email } : current.PrimaryEmailAddr,
      PrimaryPhone: data.phone ? { FreeFormNumber: data.phone } : current.PrimaryPhone,
    };

    const result = await qbRequest('/customer', {
      method: 'POST',
      body: JSON.stringify(customerData),
    });

    return result.Customer;
  },

  async getCustomer(qbCustomerId) {
    const result = await qbRequest(`/customer/${qbCustomerId}`);
    return result.Customer;
  },

  async findCustomerByEmail(email) {
    const query = `SELECT * FROM Customer WHERE PrimaryEmailAddr = '${email}'`;
    const result = await qbRequest(`/query?query=${encodeURIComponent(query)}`);
    return result.QueryResponse.Customer?.[0] || null;
  },

  // ============ INVOICES ============

  async createInvoice(data) {
    const invoiceData = {
      CustomerRef: { value: data.qbCustomerId },
      BillEmail: data.email ? { Address: data.email } : undefined,
      DueDate: data.dueDate,
      Line: data.lineItems.map(item => ({
        Amount: item.amount,
        DetailType: 'SalesItemLineDetail',
        Description: item.description,
        SalesItemLineDetail: {
          ItemRef: item.itemRef ? { value: item.itemRef } : undefined,
          Qty: item.quantity || 1,
          UnitPrice: item.unitPrice || item.amount,
        },
      })),
      PrivateNote: data.notes,
      CustomField: data.salesforceId ? [{
        DefinitionId: '1',
        Type: 'StringType',
        StringValue: data.salesforceId,
      }] : undefined,
    };

    // Remove undefined
    Object.keys(invoiceData).forEach(key =>
      invoiceData[key] === undefined && delete invoiceData[key]
    );

    const result = await qbRequest('/invoice', {
      method: 'POST',
      body: JSON.stringify(invoiceData),
    });

    logger.info('QuickBooks invoice created', {
      qbId: result.Invoice.Id,
      docNumber: result.Invoice.DocNumber
    });
    return result.Invoice;
  },

  async getInvoice(qbInvoiceId) {
    const result = await qbRequest(`/invoice/${qbInvoiceId}`);
    return result.Invoice;
  },

  async updateInvoice(qbInvoiceId, data) {
    const current = await this.getInvoice(qbInvoiceId);

    const invoiceData = {
      Id: qbInvoiceId,
      SyncToken: current.SyncToken,
      ...current,
      ...data,
    };

    const result = await qbRequest('/invoice', {
      method: 'POST',
      body: JSON.stringify(invoiceData),
    });

    return result.Invoice;
  },

  async voidInvoice(qbInvoiceId) {
    const current = await this.getInvoice(qbInvoiceId);

    const result = await qbRequest(`/invoice?operation=void`, {
      method: 'POST',
      body: JSON.stringify({
        Id: qbInvoiceId,
        SyncToken: current.SyncToken,
      }),
    });

    return result.Invoice;
  },

  async sendInvoiceEmail(qbInvoiceId, email) {
    const result = await qbRequest(`/invoice/${qbInvoiceId}/send?sendTo=${encodeURIComponent(email)}`, {
      method: 'POST',
    });
    return result.Invoice;
  },

  async getInvoicePdf(qbInvoiceId) {
    const creds = await getQBCredentials();
    const accessToken = await getAccessToken();
    const apiBase = getApiBase();

    const url = `${apiBase}/${creds.realm_id}/invoice/${qbInvoiceId}/pdf`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/pdf',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get invoice PDF');
    }

    return response.arrayBuffer();
  },

  // ============ PAYMENTS ============

  async createPayment(data) {
    const paymentData = {
      CustomerRef: { value: data.qbCustomerId },
      TotalAmt: data.amount,
      PaymentMethodRef: data.paymentMethodRef ? { value: data.paymentMethodRef } : undefined,
      DepositToAccountRef: data.depositAccountRef ? { value: data.depositAccountRef } : undefined,
      Line: data.invoiceId ? [{
        Amount: data.amount,
        LinkedTxn: [{
          TxnId: data.invoiceId,
          TxnType: 'Invoice',
        }],
      }] : undefined,
      PrivateNote: data.notes,
      PaymentRefNum: data.referenceNumber,
    };

    Object.keys(paymentData).forEach(key =>
      paymentData[key] === undefined && delete paymentData[key]
    );

    const result = await qbRequest('/payment', {
      method: 'POST',
      body: JSON.stringify(paymentData),
    });

    logger.info('QuickBooks payment created', { qbId: result.Payment.Id });
    return result.Payment;
  },

  async getPayment(qbPaymentId) {
    const result = await qbRequest(`/payment/${qbPaymentId}`);
    return result.Payment;
  },

  async voidPayment(qbPaymentId) {
    const current = await this.getPayment(qbPaymentId);

    const result = await qbRequest(`/payment?operation=void`, {
      method: 'POST',
      body: JSON.stringify({
        Id: qbPaymentId,
        SyncToken: current.SyncToken,
      }),
    });

    return result.Payment;
  },

  // ============ CREDIT MEMOS (Refunds) ============

  async createCreditMemo(data) {
    const creditMemoData = {
      CustomerRef: { value: data.qbCustomerId },
      Line: data.lineItems.map(item => ({
        Amount: item.amount,
        DetailType: 'SalesItemLineDetail',
        Description: item.description,
        SalesItemLineDetail: {
          ItemRef: item.itemRef ? { value: item.itemRef } : undefined,
          Qty: item.quantity || 1,
          UnitPrice: item.unitPrice || item.amount,
        },
      })),
      PrivateNote: data.notes,
    };

    const result = await qbRequest('/creditmemo', {
      method: 'POST',
      body: JSON.stringify(creditMemoData),
    });

    logger.info('QuickBooks credit memo created', { qbId: result.CreditMemo.Id });
    return result.CreditMemo;
  },

  // ============ ITEMS (Products/Services) ============

  async getItem(qbItemId) {
    const result = await qbRequest(`/item/${qbItemId}`);
    return result.Item;
  },

  async findItemByName(name) {
    const query = `SELECT * FROM Item WHERE Name = '${name}'`;
    const result = await qbRequest(`/query?query=${encodeURIComponent(query)}`);
    return result.QueryResponse.Item?.[0] || null;
  },

  async listItems() {
    const query = 'SELECT * FROM Item MAXRESULTS 1000';
    const result = await qbRequest(`/query?query=${encodeURIComponent(query)}`);
    return result.QueryResponse.Item || [];
  },

  // ============ ACCOUNTS ============

  async listAccounts(type) {
    let query = 'SELECT * FROM Account';
    if (type) {
      query += ` WHERE AccountType = '${type}'`;
    }
    query += ' MAXRESULTS 1000';

    const result = await qbRequest(`/query?query=${encodeURIComponent(query)}`);
    return result.QueryResponse.Account || [];
  },

  // ============ REPORTS ============

  async getBalanceSheet(startDate, endDate) {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
    });

    const result = await qbRequest(`/reports/BalanceSheet?${params}`);
    return result;
  },

  async getProfitAndLoss(startDate, endDate) {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
    });

    const result = await qbRequest(`/reports/ProfitAndLoss?${params}`);
    return result;
  },

  async getCustomerBalance() {
    const result = await qbRequest('/reports/CustomerBalance');
    return result;
  },

  // ============ SYNC OPERATIONS ============

  async syncCustomerFromCRM(account, primaryContact) {
    // Check if customer already exists in QB
    let qbCustomer = null;

    if (account.qbCustomerId) {
      try {
        qbCustomer = await this.getCustomer(account.qbCustomerId);
      } catch (e) {
        // Customer not found, will create new
      }
    }

    if (!qbCustomer && primaryContact?.email) {
      qbCustomer = await this.findCustomerByEmail(primaryContact.email);
    }

    const customerData = {
      name: account.name,
      email: primaryContact?.email,
      phone: primaryContact?.phone || account.phone,
      billingAddress: account.billingAddress ? {
        line1: account.billingAddress.street,
        city: account.billingAddress.city,
        state: account.billingAddress.state,
        postalCode: account.billingAddress.postalCode,
      } : undefined,
      notes: `Salesforce ID: ${account.salesforceId || account.id}`,
    };

    if (qbCustomer) {
      return this.updateCustomer(qbCustomer.Id, customerData);
    } else {
      return this.createCustomer(customerData);
    }
  },

  async syncInvoiceFromCRM(invoice, account, lineItems) {
    const invoiceData = {
      qbCustomerId: account.qbCustomerId,
      email: invoice.email,
      dueDate: invoice.dueDate,
      lineItems: lineItems.map(item => ({
        description: item.description,
        amount: item.amount,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        itemRef: item.qbItemId,
      })),
      salesforceId: invoice.salesforceId,
      notes: `CRM Invoice: ${invoice.invoiceNumber}`,
    };

    if (invoice.qbInvoiceId) {
      return this.updateInvoice(invoice.qbInvoiceId, invoiceData);
    } else {
      return this.createInvoice(invoiceData);
    }
  },

  async syncPaymentFromStripe(stripePayment, invoice, account) {
    const paymentData = {
      qbCustomerId: account.qbCustomerId,
      amount: stripePayment.amount / 100, // Convert from cents
      invoiceId: invoice.qbInvoiceId,
      referenceNumber: stripePayment.id,
      notes: `Stripe Payment: ${stripePayment.id}`,
      // Map Stripe payment method to QB payment method
      paymentMethodRef: stripePayment.payment_method_types?.includes('card') ? '1' : undefined,
    };

    return this.createPayment(paymentData);
  },
};

export default quickbooksService;
