import express from 'express';
import { PrismaClient } from '@prisma/client';
import { SecretsManagerClient, GetSecretValueCommand, UpdateSecretCommand } from '@aws-sdk/client-secrets-manager';
import { quickbooksService, clearCredentialsCache } from '../services/quickbooksService.js';
import { logger } from '../middleware/logger.js';

const router = express.Router();
const prisma = new PrismaClient();
const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-2' });

// QuickBooks OAuth constants
const QB_OAUTH_BASE = 'https://appcenter.intuit.com/connect/oauth2';
const QB_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const QB_SCOPES = 'com.intuit.quickbooks.accounting com.intuit.quickbooks.payment';

// ============ OAUTH ============

// Initiate OAuth flow
router.get('/oauth/authorize', async (req, res, next) => {
  try {
    const secretResponse = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: 'panda-crm/quickbooks' })
    );
    const creds = JSON.parse(secretResponse.SecretString);

    const state = Buffer.from(JSON.stringify({ timestamp: Date.now() })).toString('base64');

    const authUrl = new URL(QB_OAUTH_BASE);
    authUrl.searchParams.set('client_id', creds.client_id);
    authUrl.searchParams.set('redirect_uri', creds.redirect_uri || 'https://bamboo.pandaadmin.com/api/quickbooks/callback');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', QB_SCOPES);
    authUrl.searchParams.set('state', state);

    logger.info('Initiating QuickBooks OAuth', { authUrl: authUrl.toString() });
    res.redirect(authUrl.toString());
  } catch (error) {
    next(error);
  }
});

// OAuth callback
router.get('/callback', async (req, res, next) => {
  try {
    const { code, realmId, state, error: oauthError } = req.query;

    if (oauthError) {
      logger.error('QuickBooks OAuth error', { error: oauthError });
      return res.status(400).json({
        success: false,
        error: { code: 'OAUTH_ERROR', message: oauthError },
      });
    }

    if (!code || !realmId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'Missing authorization code or realmId' },
      });
    }

    // Get credentials
    const secretResponse = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: 'panda-crm/quickbooks' })
    );
    const creds = JSON.parse(secretResponse.SecretString);

    // Exchange code for tokens
    const basicAuth = Buffer.from(`${creds.client_id}:${creds.client_secret}`).toString('base64');

    const tokenResponse = await fetch(QB_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: creds.redirect_uri || 'https://bamboo.pandaadmin.com/api/quickbooks/callback',
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      logger.error('QuickBooks token exchange failed', { error });
      return res.status(400).json({
        success: false,
        error: { code: 'TOKEN_ERROR', message: 'Failed to exchange authorization code' },
      });
    }

    const tokens = await tokenResponse.json();

    // Update secret with new tokens and realmId
    const updatedCreds = {
      ...creds,
      realm_id: realmId,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      token_expiry: Date.now() + (tokens.expires_in * 1000),
    };

    await secretsClient.send(
      new UpdateSecretCommand({
        SecretId: 'panda-crm/quickbooks',
        SecretString: JSON.stringify(updatedCreds),
      })
    );

    logger.info('QuickBooks OAuth successful', { realmId });

    // Clear the credentials cache so the service reloads from Secrets Manager
    clearCredentialsCache();

    // Return success page
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>QuickBooks Connected</title>
          <style>
            body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
            .card { background: white; padding: 40px; border-radius: 12px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.2); }
            .success { color: #22c55e; font-size: 48px; margin-bottom: 20px; }
            h1 { color: #1f2937; margin: 0 0 10px 0; }
            p { color: #6b7280; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="success">✓</div>
            <h1>QuickBooks Connected!</h1>
            <p>Company ID: ${realmId}</p>
            <p>You can close this window.</p>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    next(error);
  }
});

// Get connection status
router.get('/status', async (req, res, next) => {
  try {
    const secretResponse = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: 'panda-crm/quickbooks' })
    );
    const creds = JSON.parse(secretResponse.SecretString);

    const isConnected = !!creds.refresh_token;

    res.json({
      success: true,
      data: {
        connected: isConnected,
        realmId: creds.realm_id || null,
        hasRefreshToken: !!creds.refresh_token,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============ CUSTOMER SYNC ============

// Sync account to QuickBooks
router.post('/sync/customer/:accountId', async (req, res, next) => {
  try {
    const { accountId } = req.params;

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: { contacts: { take: 1 } },
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Account not found' },
      });
    }

    const primaryContact = account.contacts[0];
    const qbCustomer = await quickbooksService.syncCustomerFromCRM(account, primaryContact);

    // Update account with QB customer ID
    await prisma.account.update({
      where: { id: accountId },
      data: { qbCustomerId: qbCustomer.Id },
    });

    logger.info('Account synced to QuickBooks', { accountId, qbCustomerId: qbCustomer.Id });

    res.json({
      success: true,
      data: {
        qbCustomerId: qbCustomer.Id,
        displayName: qbCustomer.DisplayName,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============ INVOICE SYNC ============

// Sync invoice to QuickBooks
router.post('/sync/invoice/:invoiceId', async (req, res, next) => {
  try {
    const { invoiceId } = req.params;

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        account: true,
        lineItems: true,
      },
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Invoice not found' },
      });
    }

    // Ensure account has QB customer
    if (!invoice.account.qbCustomerId) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_QB_CUSTOMER', message: 'Account must be synced to QuickBooks first' },
      });
    }

    const qbInvoice = await quickbooksService.syncInvoiceFromCRM(
      invoice,
      invoice.account,
      invoice.lineItems
    );

    // Update invoice with QB invoice ID
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        qbInvoiceId: qbInvoice.Id,
        qbDocNumber: qbInvoice.DocNumber,
      },
    });

    logger.info('Invoice synced to QuickBooks', {
      invoiceId,
      qbInvoiceId: qbInvoice.Id,
      docNumber: qbInvoice.DocNumber
    });

    res.json({
      success: true,
      data: {
        qbInvoiceId: qbInvoice.Id,
        docNumber: qbInvoice.DocNumber,
        totalAmt: qbInvoice.TotalAmt,
        balance: qbInvoice.Balance,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Send invoice email via QuickBooks
router.post('/invoice/:qbInvoiceId/send', async (req, res, next) => {
  try {
    const { qbInvoiceId } = req.params;
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_EMAIL', message: 'Email address is required' },
      });
    }

    const qbInvoice = await quickbooksService.sendInvoiceEmail(qbInvoiceId, email);

    res.json({
      success: true,
      data: { sent: true, email },
    });
  } catch (error) {
    next(error);
  }
});

// Get invoice PDF from QuickBooks
router.get('/invoice/:qbInvoiceId/pdf', async (req, res, next) => {
  try {
    const { qbInvoiceId } = req.params;

    const pdfBuffer = await quickbooksService.getInvoicePdf(qbInvoiceId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="invoice-${qbInvoiceId}.pdf"`);
    res.send(Buffer.from(pdfBuffer));
  } catch (error) {
    next(error);
  }
});

// ============ PAYMENT SYNC ============

// Record Stripe payment in QuickBooks
router.post('/sync/payment', async (req, res, next) => {
  try {
    const { paymentId, invoiceId } = req.body;

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        invoice: {
          include: { account: true },
        },
      },
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Payment not found' },
      });
    }

    if (!payment.invoice?.account?.qbCustomerId) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_QB_CUSTOMER', message: 'Account must be synced to QuickBooks first' },
      });
    }

    const qbPayment = await quickbooksService.createPayment({
      qbCustomerId: payment.invoice.account.qbCustomerId,
      amount: payment.amount,
      invoiceId: payment.invoice.qbInvoiceId,
      referenceNumber: payment.stripePaymentIntentId || payment.id,
      notes: `Stripe: ${payment.stripePaymentIntentId}`,
    });

    // Update payment with QB payment ID
    await prisma.payment.update({
      where: { id: paymentId },
      data: { qbPaymentId: qbPayment.Id },
    });

    logger.info('Payment synced to QuickBooks', { paymentId, qbPaymentId: qbPayment.Id });

    res.json({
      success: true,
      data: { qbPaymentId: qbPayment.Id },
    });
  } catch (error) {
    next(error);
  }
});

// ============ ITEMS ============

// List QB items (products/services)
router.get('/items', async (req, res, next) => {
  try {
    const items = await quickbooksService.listItems();

    res.json({
      success: true,
      data: items.map(item => ({
        id: item.Id,
        name: item.Name,
        description: item.Description,
        type: item.Type,
        unitPrice: item.UnitPrice,
        active: item.Active,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// ============ REPORTS ============

// Get customer balances
router.get('/reports/customer-balance', async (req, res, next) => {
  try {
    const report = await quickbooksService.getCustomerBalance();
    res.json({ success: true, data: report });
  } catch (error) {
    next(error);
  }
});

// Get P&L report
router.get('/reports/profit-loss', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_DATES', message: 'Start and end dates are required' },
      });
    }

    const report = await quickbooksService.getProfitAndLoss(startDate, endDate);
    res.json({ success: true, data: report });
  } catch (error) {
    next(error);
  }
});

// ============ WEBHOOKS ============

// QuickBooks webhook handler
router.post('/webhook', async (req, res, next) => {
  try {
    const { eventNotifications } = req.body;

    if (!eventNotifications) {
      return res.status(200).send('OK');
    }

    for (const notification of eventNotifications) {
      const { realmId, dataChangeEvent } = notification;

      if (!dataChangeEvent?.entities) continue;

      for (const entity of dataChangeEvent.entities) {
        const { name, id, operation } = entity;

        logger.info('QuickBooks webhook event', { entityType: name, entityId: id, operation });

        // Handle different entity types
        switch (name) {
          case 'Payment':
            if (operation === 'Create' || operation === 'Update') {
              // Payment was created/updated in QB - could update CRM
              // This handles payments made directly in QuickBooks
            }
            break;

          case 'Invoice':
            if (operation === 'Update') {
              // Invoice updated in QB - sync status back to CRM
            }
            break;

          case 'Customer':
            if (operation === 'Update') {
              // Customer updated in QB - could sync back to CRM
            }
            break;
        }
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    logger.error('QuickBooks webhook error:', error);
    res.status(200).send('OK'); // Always return 200 to QB
  }
});

export default router;
