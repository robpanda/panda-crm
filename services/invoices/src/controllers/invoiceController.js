import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { addDays, differenceInDays, format, parseISO } from 'date-fns';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import Stripe from 'stripe';
import sgMail from '@sendgrid/mail';
import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses';

const prisma = new PrismaClient();

// QuickBooks sync URL (payments service handles QB integration)
const PAYMENTS_SERVICE_URL = process.env.PAYMENTS_SERVICE_URL || 'http://localhost:3007';

// Initialize S3 client
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });

// Initialize Stripe
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

// Initialize email provider
const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || 'sendgrid';
if (EMAIL_PROVIDER === 'sendgrid' && process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// SES client (lazy init)
let sesClient = null;
function getSesClient() {
  if (!sesClient) {
    sesClient = new SESClient({ region: process.env.AWS_REGION || 'us-east-2' });
  }
  return sesClient;
}

// Validation schemas
const lineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive().default(1),
  unitPrice: z.number().nonnegative(),
});

const createInvoiceSchema = z.object({
  accountId: z.string(),
  opportunityId: z.string().optional(),
  invoiceDate: z.string().datetime().optional(),
  terms: z.number().int().positive().default(30),
  tax: z.number().nonnegative().default(0),
  lineItems: z.array(lineItemSchema),
  // Insurance invoice fields
  isInsuranceInvoice: z.boolean().optional(),
  insuranceCarrier: z.string().optional(),
  claimNumber: z.string().optional(),
  notes: z.string().optional(),
});

const updateInvoiceSchema = z.object({
  invoiceDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  terms: z.number().int().positive().optional(),
  tax: z.number().nonnegative().optional(),
  status: z.enum(['DRAFT', 'PENDING', 'SENT', 'PARTIAL', 'PAID', 'OVERDUE', 'VOID']).optional(),
});

// Generate invoice number
async function generateInvoiceNumber() {
  const count = await prisma.invoice.count();
  const num = count + 1;
  return `INV-${String(num).padStart(7, '0')}`;
}

// Calculate invoice totals
function calculateTotals(lineItems, taxAmount = 0) {
  let subtotal = new Decimal(0);

  const processedItems = lineItems.map((item) => {
    const itemTotal = new Decimal(item.quantity).times(item.unitPrice);
    subtotal = subtotal.plus(itemTotal);

    return {
      ...item,
      totalPrice: itemTotal.toNumber(),
    };
  });

  const tax = new Decimal(taxAmount);
  const total = subtotal.plus(tax);

  return {
    lineItems: processedItems,
    subtotal: subtotal.toNumber(),
    tax: tax.toNumber(),
    total: total.toNumber(),
  };
}

// List invoices
export async function listInvoices(req, res, next) {
  try {
    const {
      accountId,
      status,
      isOverdue,
      dateFrom,
      dateTo,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const where = {};

    if (accountId) where.accountId = accountId;
    if (status) where.status = status;

    if (isOverdue === 'true') {
      where.status = { in: ['PENDING', 'SENT', 'PARTIAL'] };
      where.dueDate = { lt: new Date() };
    }

    if (dateFrom || dateTo) {
      where.invoiceDate = {};
      if (dateFrom) where.invoiceDate.gte = new Date(dateFrom);
      if (dateTo) where.invoiceDate.lte = new Date(dateTo);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          account: { select: { id: true, name: true } },
          payments: { select: { id: true, amount: true, paymentDate: true, status: true } },
          lineItems: true,
        },
        skip,
        take,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.invoice.count({ where }),
    ]);

    // Add calculated fields
    const invoicesWithCalc = invoices.map((inv) => ({
      ...inv,
      daysOverdue: inv.dueDate && inv.status !== 'PAID' && inv.status !== 'VOID'
        ? Math.max(0, differenceInDays(new Date(), inv.dueDate))
        : 0,
      paymentCount: inv.payments.length,
    }));

    res.json({
      data: invoicesWithCalc,
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

// Get single invoice
export async function getInvoice(req, res, next) {
  try {
    const { id } = req.params;

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        account: true,
        payments: {
          orderBy: { paymentDate: 'desc' },
        },
        lineItems: true,
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Calculate overdue info
    const daysOverdue = invoice.dueDate && invoice.status !== 'PAID' && invoice.status !== 'VOID'
      ? Math.max(0, differenceInDays(new Date(), invoice.dueDate))
      : 0;

    res.json({
      ...invoice,
      daysOverdue,
      isOverdue: daysOverdue > 0,
    });
  } catch (error) {
    next(error);
  }
}

// Create invoice
export async function createInvoice(req, res, next) {
  try {
    const data = createInvoiceSchema.parse(req.body);
    const invoiceNumber = await generateInvoiceNumber();

    // Verify account exists
    const account = await prisma.account.findUnique({
      where: { id: data.accountId },
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Calculate totals
    const { lineItems, subtotal, tax, total } = calculateTotals(data.lineItems, data.tax);

    const invoiceDate = data.invoiceDate ? new Date(data.invoiceDate) : new Date();
    const dueDate = addDays(invoiceDate, data.terms);

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        accountId: data.accountId,
        opportunityId: data.opportunityId || null,
        status: 'DRAFT',
        invoiceDate,
        dueDate,
        terms: data.terms,
        subtotal,
        tax,
        total,
        amountPaid: 0,
        balanceDue: total,
        // Insurance-specific fields
        isInsuranceInvoice: data.isInsuranceInvoice || false,
        insuranceCarrier: data.insuranceCarrier || null,
        claimNumber: data.claimNumber || null,
        notes: data.notes || null,
        lineItems: {
          create: lineItems.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
          })),
        },
      },
      include: {
        account: { select: { id: true, name: true } },
        lineItems: true,
      },
    });

    res.status(201).json(invoice);
  } catch (error) {
    next(error);
  }
}

// Update invoice
export async function updateInvoice(req, res, next) {
  try {
    const { id } = req.params;
    const data = updateInvoiceSchema.parse(req.body);

    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Don't allow updates to paid or void invoices
    if (existing.status === 'PAID' || existing.status === 'VOID') {
      return res.status(400).json({ error: `Cannot update ${existing.status.toLowerCase()} invoice` });
    }

    const updateData = { ...data };

    // Recalculate due date if terms or invoice date changed
    if (data.invoiceDate || data.terms) {
      const invoiceDate = data.invoiceDate
        ? new Date(data.invoiceDate)
        : existing.invoiceDate;
      const terms = data.terms || existing.terms;
      updateData.dueDate = addDays(invoiceDate, terms);
    }

    const invoice = await prisma.invoice.update({
      where: { id },
      data: {
        ...updateData,
        invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : undefined,
        dueDate: updateData.dueDate,
      },
      include: {
        account: { select: { id: true, name: true } },
        lineItems: true,
        payments: true,
      },
    });

    res.json(invoice);
  } catch (error) {
    next(error);
  }
}

// Delete invoice
export async function deleteInvoice(req, res, next) {
  try {
    const { id } = req.params;

    const existing = await prisma.invoice.findUnique({
      where: { id },
      include: { payments: true },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (existing.payments.length > 0) {
      return res.status(400).json({ error: 'Cannot delete invoice with payments' });
    }

    // Delete line items first (cascade should handle this, but being explicit)
    await prisma.invoiceLineItem.deleteMany({ where: { invoiceId: id } });
    await prisma.invoice.delete({ where: { id } });

    res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    next(error);
  }
}

// Send invoice (generate PDF, create payment link, send email)
export async function sendInvoice(req, res, next) {
  try {
    const { id } = req.params;
    const {
      recipientEmail,    // Override email address
      ccEmails = [],     // CC recipients
      subject,           // Custom subject
      message,           // Custom message body
      includePaymentLink = true,
    } = req.body || {};

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        account: true,
        lineItems: true,
        payments: {
          where: { status: 'COMPLETED' },
          orderBy: { paymentDate: 'desc' },
        },
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (invoice.status !== 'DRAFT' && invoice.status !== 'PENDING') {
      return res.status(400).json({ error: 'Invoice already sent or processed' });
    }

    // Determine recipient email
    const toEmail = recipientEmail || invoice.account?.email;
    if (!toEmail) {
      return res.status(400).json({ error: 'No recipient email address. Please provide recipientEmail or ensure account has email.' });
    }

    // Step 1: Generate Invoice PDF
    let pdfResult = null;
    try {
      pdfResult = await generateInvoicePdfInternal(invoice);
    } catch (pdfError) {
      console.error('PDF generation error:', pdfError);
      // Continue without PDF if generation fails
    }

    // Step 2: Create Stripe Payment Link (if balance due and enabled)
    let paymentLink = null;
    if (includePaymentLink && stripe && Number(invoice.balanceDue) > 0) {
      try {
        // Create a price for this invoice
        const price = await stripe.prices.create({
          unit_amount: Math.round(Number(invoice.balanceDue) * 100),
          currency: 'usd',
          product_data: {
            name: `Invoice ${invoice.invoiceNumber}`,
            metadata: {
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
            },
          },
        });

        const paymentLinkData = await stripe.paymentLinks.create({
          line_items: [{ price: price.id, quantity: 1 }],
          metadata: {
            source: 'panda-crm',
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            accountId: invoice.accountId,
          },
          after_completion: {
            type: 'redirect',
            redirect: {
              url: `${process.env.FRONTEND_URL || 'https://crm.pandaadmin.com'}/invoices/${invoice.id}?payment=success`,
            },
          },
        });

        paymentLink = paymentLinkData.url;
      } catch (stripeError) {
        console.error('Stripe payment link error:', stripeError);
        // Continue without payment link
      }
    }

    // Step 3: Send Email
    const emailSubject = subject || `Invoice ${invoice.invoiceNumber} from Panda Exteriors`;
    const balanceDueFormatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(Number(invoice.balanceDue));

    const dueDateFormatted = invoice.dueDate
      ? format(new Date(invoice.dueDate), 'MMMM d, yyyy')
      : 'Upon Receipt';

    const defaultMessage = `Dear ${invoice.account?.name || 'Customer'},

Please find attached Invoice ${invoice.invoiceNumber} for ${balanceDueFormatted}.

Invoice Details:
- Invoice Number: ${invoice.invoiceNumber}
- Amount Due: ${balanceDueFormatted}
- Due Date: ${dueDateFormatted}

${paymentLink ? `Pay Online: ${paymentLink}` : ''}

Thank you for your business!

Panda Exteriors
(240) 801-6665
info@pandaexteriors.com`;

    const emailBody = message || defaultMessage;

    // Build HTML version
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .header { background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 20px; }
    .content { padding: 20px; }
    .invoice-box { background: #f5f5f5; border-radius: 8px; padding: 15px; margin: 15px 0; }
    .amount { font-size: 24px; color: #667eea; font-weight: bold; }
    .pay-button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 15px 0; }
    .footer { border-top: 1px solid #eee; padding-top: 15px; margin-top: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="margin:0;">Panda Exteriors</h1>
    <p style="margin:5px 0 0 0;">Invoice ${invoice.invoiceNumber}</p>
  </div>
  <div class="content">
    <p>Dear ${invoice.account?.name || 'Customer'},</p>
    <p>Please find your invoice details below:</p>
    <div class="invoice-box">
      <p><strong>Invoice Number:</strong> ${invoice.invoiceNumber}</p>
      <p><strong>Due Date:</strong> ${dueDateFormatted}</p>
      <p><strong>Amount Due:</strong></p>
      <p class="amount">${balanceDueFormatted}</p>
    </div>
    ${paymentLink ? `
    <p>Click the button below to pay securely online:</p>
    <a href="${paymentLink}" class="pay-button">Pay Now</a>
    ` : ''}
    ${pdfResult ? `<p><em>Invoice PDF is attached to this email.</em></p>` : ''}
    <p>Thank you for your business!</p>
    <div class="footer">
      <p><strong>Panda Exteriors</strong><br>
      8825 Stanford Blvd Suite 201, Columbia, MD 21045<br>
      (240) 801-6665 | info@pandaexteriors.com</p>
    </div>
  </div>
</body>
</html>`;

    let emailSent = false;
    let emailError = null;

    try {
      if (EMAIL_PROVIDER === 'sendgrid' && process.env.SENDGRID_API_KEY) {
        const msg = {
          to: toEmail,
          cc: ccEmails.filter(Boolean),
          from: {
            email: process.env.EMAIL_FROM_ADDRESS || 'invoices@pandaexteriors.com',
            name: 'Panda Exteriors',
          },
          subject: emailSubject,
          text: emailBody,
          html: emailHtml,
          trackingSettings: {
            clickTracking: { enable: true },
            openTracking: { enable: true },
          },
        };

        // Add PDF attachment if available
        if (pdfResult?.pdfBytes) {
          msg.attachments = [{
            content: Buffer.from(pdfResult.pdfBytes).toString('base64'),
            filename: `Invoice-${invoice.invoiceNumber}.pdf`,
            type: 'application/pdf',
            disposition: 'attachment',
          }];
        }

        await sgMail.send(msg);
        emailSent = true;
      } else if (process.env.AWS_REGION) {
        // Fallback to AWS SES
        const client = getSesClient();

        // For SES with attachment, we need to use raw email
        const boundary = `----=_Part_${Date.now()}`;
        let rawEmail = `From: "Panda Exteriors" <${process.env.EMAIL_FROM_ADDRESS || 'invoices@pandaexteriors.com'}>
To: ${toEmail}
${ccEmails.length > 0 ? `Cc: ${ccEmails.join(', ')}\n` : ''}Subject: ${emailSubject}
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="${boundary}"

--${boundary}
Content-Type: multipart/alternative; boundary="${boundary}_alt"

--${boundary}_alt
Content-Type: text/plain; charset=UTF-8
Content-Transfer-Encoding: 7bit

${emailBody}

--${boundary}_alt
Content-Type: text/html; charset=UTF-8
Content-Transfer-Encoding: 7bit

${emailHtml}

--${boundary}_alt--`;

        if (pdfResult?.pdfBytes) {
          rawEmail += `
--${boundary}
Content-Type: application/pdf; name="Invoice-${invoice.invoiceNumber}.pdf"
Content-Transfer-Encoding: base64
Content-Disposition: attachment; filename="Invoice-${invoice.invoiceNumber}.pdf"

${Buffer.from(pdfResult.pdfBytes).toString('base64')}`;
        }

        rawEmail += `
--${boundary}--`;

        await client.send(new SendRawEmailCommand({
          RawMessage: { Data: Buffer.from(rawEmail) },
        }));
        emailSent = true;
      }
    } catch (err) {
      console.error('Email send error:', err);
      emailError = err.message;
    }

    // Step 4: Update invoice status
    const updatedInvoice = await prisma.invoice.update({
      where: { id },
      data: {
        status: 'SENT',
        // Store payment link for reference
        ...(paymentLink && { stripePaymentLinkUrl: paymentLink }),
        ...(pdfResult && {
          pdfUrl: pdfResult.downloadUrl,
          pdfKey: pdfResult.key,
        }),
      },
      include: {
        account: { select: { id: true, name: true, email: true } },
        lineItems: true,
        opportunity: { select: { id: true, name: true } },
      },
    });

    // Step 5: Update opportunity invoice status to INVOICED (if linked)
    if (updatedInvoice.opportunityId) {
      try {
        await prisma.opportunity.update({
          where: { id: updatedInvoice.opportunityId },
          data: {
            invoiceStatus: 'INVOICED',
            invoicedDate: new Date(),
          },
        });
        console.log(`Updated opportunity ${updatedInvoice.opportunityId} invoice status to INVOICED`);
      } catch (oppError) {
        console.error('Failed to update opportunity invoice status:', oppError);
        // Don't fail the invoice send if opportunity update fails
      }
    }

    // Step 6: Sync to QuickBooks (async, non-blocking)
    let qbSyncResult = null;
    let qbSyncError = null;
    if (process.env.ENABLE_QUICKBOOKS_SYNC === 'true') {
      try {
        // Call payments service to sync invoice to QuickBooks
        // Uses the existing /sync/invoice/:invoiceId endpoint which fetches invoice from DB
        const qbResponse = await fetch(`${PAYMENTS_SERVICE_URL}/api/quickbooks/sync/invoice/${updatedInvoice.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (qbResponse.ok) {
          qbSyncResult = await qbResponse.json();
          console.log('Invoice synced to QuickBooks:', qbSyncResult);
        } else {
          qbSyncError = await qbResponse.text();
          console.error('QuickBooks sync failed:', qbSyncError);
        }
      } catch (qbError) {
        console.error('QuickBooks sync error:', qbError);
        qbSyncError = qbError.message;
        // Don't fail the invoice send if QB sync fails
      }
    }

    res.json({
      invoice: updatedInvoice,
      message: emailSent ? 'Invoice sent successfully' : 'Invoice marked as sent (email delivery failed)',
      emailSent,
      emailError,
      paymentLinkUrl: paymentLink,
      pdfUrl: pdfResult?.downloadUrl,
      sentTo: toEmail,
      ccEmails: ccEmails.filter(Boolean),
      quickbooks: qbSyncResult ? { synced: true, ...qbSyncResult } : (qbSyncError ? { synced: false, error: qbSyncError } : null),
    });
  } catch (error) {
    next(error);
  }
}

// Internal PDF generation (replicates pdfService.generateInvoicePdf logic)
async function generateInvoicePdfInternal(invoice) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const { v4: uuidv4 } = await import('uuid');
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');

  const COMPANY_INFO = {
    name: 'Panda Exteriors',
    address: '8825 Stanford Blvd Suite 201',
    cityStateZip: 'Columbia, MD 21045',
    phone: '(240) 801-6665',
    email: 'info@pandaexteriors.com',
  };

  const COLORS = {
    primary: rgb(0.4, 0.49, 0.92),
    dark: rgb(0.1, 0.1, 0.1),
    gray: rgb(0.5, 0.5, 0.5),
    lightGray: rgb(0.9, 0.9, 0.9),
    success: rgb(0.13, 0.55, 0.13),
    danger: rgb(0.8, 0.2, 0.2),
  };

  const formatCurrency = (amount) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount || 0);

  // Create PDF document
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // Letter size
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = height - 50;

  // Header - Company Info
  page.drawText(COMPANY_INFO.name, { x: 50, y, size: 24, font: fontBold, color: COLORS.primary });
  y -= 18;
  page.drawText(COMPANY_INFO.address, { x: 50, y, size: 10, font: fontRegular, color: COLORS.gray });
  y -= 14;
  page.drawText(COMPANY_INFO.cityStateZip, { x: 50, y, size: 10, font: fontRegular, color: COLORS.gray });
  y -= 14;
  page.drawText(`${COMPANY_INFO.phone} | ${COMPANY_INFO.email}`, { x: 50, y, size: 10, font: fontRegular, color: COLORS.gray });

  // Invoice Title - Right Side
  const invoiceTitle = 'INVOICE';
  const invoiceTitleWidth = fontBold.widthOfTextAtSize(invoiceTitle, 28);
  page.drawText(invoiceTitle, { x: width - 50 - invoiceTitleWidth, y: height - 50, size: 28, font: fontBold, color: COLORS.dark });

  // Invoice Number and Date - Right Side
  const invoiceNumber = `#${invoice.invoiceNumber}`;
  const invoiceNumWidth = fontRegular.widthOfTextAtSize(invoiceNumber, 12);
  page.drawText(invoiceNumber, { x: width - 50 - invoiceNumWidth, y: height - 78, size: 12, font: fontRegular, color: COLORS.gray });

  const invoiceDate = invoice.invoiceDate
    ? format(new Date(invoice.invoiceDate), 'MMMM d, yyyy')
    : 'Not set';
  const dateLabel = `Date: ${invoiceDate}`;
  const dateLabelWidth = fontRegular.widthOfTextAtSize(dateLabel, 10);
  page.drawText(dateLabel, { x: width - 50 - dateLabelWidth, y: height - 94, size: 10, font: fontRegular, color: COLORS.gray });

  const dueDate = invoice.dueDate
    ? format(new Date(invoice.dueDate), 'MMMM d, yyyy')
    : 'Not set';
  const dueLabel = `Due: ${dueDate}`;
  const dueLabelWidth = fontRegular.widthOfTextAtSize(dueLabel, 10);
  page.drawText(dueLabel, { x: width - 50 - dueLabelWidth, y: height - 108, size: 10, font: fontRegular, color: COLORS.gray });

  // Horizontal line
  y = height - 140;
  page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 1, color: COLORS.lightGray });

  // Bill To Section
  y -= 30;
  page.drawText('BILL TO:', { x: 50, y, size: 10, font: fontBold, color: COLORS.gray });
  y -= 18;
  page.drawText(invoice.account?.name || 'N/A', { x: 50, y, size: 12, font: fontBold, color: COLORS.dark });

  if (invoice.account?.billingAddress) {
    y -= 14;
    page.drawText(invoice.account.billingAddress, { x: 50, y, size: 10, font: fontRegular, color: COLORS.dark });
  }

  if (invoice.account?.billingCity || invoice.account?.billingState) {
    y -= 14;
    const cityStateZip = [invoice.account.billingCity, invoice.account.billingState, invoice.account.billingZip].filter(Boolean).join(', ');
    page.drawText(cityStateZip, { x: 50, y, size: 10, font: fontRegular, color: COLORS.dark });
  }

  if (invoice.account?.email) {
    y -= 14;
    page.drawText(invoice.account.email, { x: 50, y, size: 10, font: fontRegular, color: COLORS.gray });
  }

  // Line Items Table
  y -= 50;
  const colWidths = { description: 300, qty: 60, unitPrice: 80, total: 80 };
  const tableLeft = 50;

  // Table Header Background
  page.drawRectangle({ x: tableLeft, y: y - 5, width: width - 100, height: 25, color: COLORS.lightGray });

  // Table Headers
  page.drawText('Description', { x: tableLeft + 10, y: y + 5, size: 10, font: fontBold, color: COLORS.dark });
  page.drawText('Qty', { x: tableLeft + colWidths.description + 10, y: y + 5, size: 10, font: fontBold, color: COLORS.dark });
  page.drawText('Unit Price', { x: tableLeft + colWidths.description + colWidths.qty + 10, y: y + 5, size: 10, font: fontBold, color: COLORS.dark });
  page.drawText('Total', { x: tableLeft + colWidths.description + colWidths.qty + colWidths.unitPrice + 10, y: y + 5, size: 10, font: fontBold, color: COLORS.dark });

  // Line Items
  y -= 25;
  for (const item of invoice.lineItems) {
    y -= 20;
    let description = item.description || 'Service';
    if (fontRegular.widthOfTextAtSize(description, 10) > colWidths.description - 10) {
      description = description.substring(0, 50) + '...';
    }

    page.drawText(description, { x: tableLeft + 10, y, size: 10, font: fontRegular, color: COLORS.dark });
    page.drawText(String(Number(item.quantity)), { x: tableLeft + colWidths.description + 10, y, size: 10, font: fontRegular, color: COLORS.dark });
    page.drawText(formatCurrency(Number(item.unitPrice)), { x: tableLeft + colWidths.description + colWidths.qty + 10, y, size: 10, font: fontRegular, color: COLORS.dark });
    page.drawText(formatCurrency(Number(item.totalPrice)), { x: tableLeft + colWidths.description + colWidths.qty + colWidths.unitPrice + 10, y, size: 10, font: fontBold, color: COLORS.dark });

    page.drawLine({ start: { x: tableLeft, y: y - 8 }, end: { x: width - 50, y: y - 8 }, thickness: 0.5, color: COLORS.lightGray });
  }

  // Totals Section
  y -= 40;
  const totalsX = width - 200;

  page.drawText('Subtotal:', { x: totalsX, y, size: 10, font: fontRegular, color: COLORS.gray });
  page.drawText(formatCurrency(Number(invoice.subtotal)), { x: width - 80, y, size: 10, font: fontRegular, color: COLORS.dark });

  if (Number(invoice.tax) > 0) {
    y -= 18;
    page.drawText('Tax:', { x: totalsX, y, size: 10, font: fontRegular, color: COLORS.gray });
    page.drawText(formatCurrency(Number(invoice.tax)), { x: width - 80, y, size: 10, font: fontRegular, color: COLORS.dark });
  }

  y -= 5;
  page.drawLine({ start: { x: totalsX - 10, y }, end: { x: width - 50, y }, thickness: 1, color: COLORS.dark });

  y -= 18;
  page.drawText('Total:', { x: totalsX, y, size: 12, font: fontBold, color: COLORS.dark });
  page.drawText(formatCurrency(Number(invoice.total)), { x: width - 80, y, size: 12, font: fontBold, color: COLORS.dark });

  if (Number(invoice.amountPaid) > 0) {
    y -= 18;
    page.drawText('Amount Paid:', { x: totalsX, y, size: 10, font: fontRegular, color: COLORS.success });
    page.drawText(`-${formatCurrency(Number(invoice.amountPaid))}`, { x: width - 80, y, size: 10, font: fontRegular, color: COLORS.success });
  }

  // Balance Due
  y -= 25;
  const balanceColor = Number(invoice.balanceDue) > 0 ? COLORS.danger : COLORS.success;
  page.drawRectangle({
    x: totalsX - 20,
    y: y - 8,
    width: width - totalsX + 20 - 30,
    height: 30,
    color: Number(invoice.balanceDue) > 0 ? rgb(1, 0.95, 0.95) : rgb(0.95, 1, 0.95),
  });

  page.drawText('Balance Due:', { x: totalsX, y, size: 14, font: fontBold, color: balanceColor });
  page.drawText(formatCurrency(Number(invoice.balanceDue)), { x: width - 80, y, size: 14, font: fontBold, color: balanceColor });

  // Footer
  const footerY = 50;
  page.drawLine({ start: { x: 50, y: footerY + 20 }, end: { x: width - 50, y: footerY + 20 }, thickness: 0.5, color: COLORS.lightGray });
  page.drawText('Thank you for your business!', { x: 50, y: footerY, size: 10, font: fontBold, color: COLORS.primary });
  page.drawText(`Questions? Contact us at ${COMPANY_INFO.phone} or ${COMPANY_INFO.email}`, { x: 50, y: footerY - 14, size: 9, font: fontRegular, color: COLORS.gray });

  // Generate PDF bytes
  const pdfBytes = await pdfDoc.save();

  // Upload to S3
  const S3_BUCKET = process.env.DOCUMENTS_BUCKET || 'panda-crm-documents';
  const key = `invoices/${invoice.invoiceNumber}-${uuidv4().slice(0, 8)}.pdf`;

  await s3Client.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: pdfBytes,
    ContentType: 'application/pdf',
    Metadata: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      generatedAt: new Date().toISOString(),
    },
  }));

  // Get download URL
  const downloadUrl = await getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }),
    { expiresIn: 3600 * 24 * 7 }
  );

  return {
    key,
    downloadUrl,
    pdfBytes,
    invoiceNumber: invoice.invoiceNumber,
  };
}

// Generate PDF for invoice (without sending email)
export async function generateInvoicePdf(req, res, next) {
  try {
    const { id } = req.params;

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        account: true,
        lineItems: true,
        payments: {
          where: { status: 'COMPLETED' },
          orderBy: { paymentDate: 'desc' },
        },
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Generate PDF
    const pdfResult = await generateInvoicePdfInternal(invoice);

    // Update invoice with PDF URL
    await prisma.invoice.update({
      where: { id },
      data: {
        pdfUrl: pdfResult.downloadUrl,
        pdfKey: pdfResult.key,
      },
    });

    res.json({
      invoiceNumber: invoice.invoiceNumber,
      pdfUrl: pdfResult.downloadUrl,
      pdfKey: pdfResult.key,
      message: 'Invoice PDF generated successfully',
    });
  } catch (error) {
    next(error);
  }
}

// Get existing PDF or generate new one
export async function getInvoicePdf(req, res, next) {
  try {
    const { id } = req.params;
    const { regenerate } = req.query;

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        account: true,
        lineItems: true,
        payments: {
          where: { status: 'COMPLETED' },
          orderBy: { paymentDate: 'desc' },
        },
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Return existing PDF URL if available and not regenerating
    if (invoice.pdfUrl && regenerate !== 'true') {
      return res.json({
        invoiceNumber: invoice.invoiceNumber,
        pdfUrl: invoice.pdfUrl,
        pdfKey: invoice.pdfKey,
        cached: true,
      });
    }

    // Generate new PDF
    const pdfResult = await generateInvoicePdfInternal(invoice);

    // Update invoice with new PDF URL
    await prisma.invoice.update({
      where: { id },
      data: {
        pdfUrl: pdfResult.downloadUrl,
        pdfKey: pdfResult.key,
      },
    });

    res.json({
      invoiceNumber: invoice.invoiceNumber,
      pdfUrl: pdfResult.downloadUrl,
      pdfKey: pdfResult.key,
      cached: false,
    });
  } catch (error) {
    next(error);
  }
}

// Void invoice
export async function voidInvoice(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (existing.status === 'PAID') {
      return res.status(400).json({ error: 'Cannot void paid invoice' });
    }

    if (existing.status === 'VOID') {
      return res.status(400).json({ error: 'Invoice already voided' });
    }

    const invoice = await prisma.invoice.update({
      where: { id },
      data: {
        status: 'VOID',
        // Store void reason in a note or custom field if needed
      },
    });

    res.json({
      invoice,
      message: 'Invoice voided',
      reason,
    });
  } catch (error) {
    next(error);
  }
}

// Apply late fee (uses InvoiceAdditionalCharge model)
export async function applyLateFee(req, res, next) {
  try {
    const { id } = req.params;
    const { rate, notes } = req.body; // rate is optional, defaults to account's lateFeePercent or 1.5%

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        lineItems: true,
        account: { select: { id: true, name: true, lateFeePercent: true } },
        additionalCharges: { where: { chargeType: 'LATE_FEE' } },
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (invoice.status === 'PAID' || invoice.status === 'VOID') {
      return res.status(400).json({ error: 'Cannot apply late fee to this invoice' });
    }

    if (!invoice.dueDate || invoice.dueDate > new Date()) {
      return res.status(400).json({ error: 'Invoice is not overdue' });
    }

    // Calculate days overdue
    const daysOverdue = differenceInDays(new Date(), invoice.dueDate);

    // Calculate which 30-day period we're in (1 = 30 days, 2 = 60 days, etc.)
    const lateFeePeriod = Math.floor(daysOverdue / 30);

    if (lateFeePeriod < 1) {
      return res.status(400).json({ error: 'Invoice is not yet 30 days overdue' });
    }

    // Check existing late fees
    const existingLateFees = invoice.additionalCharges.length;

    if (existingLateFees >= lateFeePeriod) {
      return res.status(400).json({
        error: 'Late fee already applied for this period',
        existingLateFees,
        lateFeePeriod,
        daysOverdue,
      });
    }

    // Determine late fee rate: provided rate > account's rate > default 1.5%
    const lateFeePercent = rate || (invoice.account?.lateFeePercent ? Number(invoice.account.lateFeePercent) : 1.5);

    // Calculate late fee based on current balance due
    const balanceDue = new Decimal(invoice.balanceDue);
    const lateFeeAmount = balanceDue.times(lateFeePercent / 100).toDecimalPlaces(2).toNumber();

    // Create late fee as additional charge
    const additionalCharge = await prisma.invoiceAdditionalCharge.create({
      data: {
        invoiceId: id,
        name: `Late Fee (${daysOverdue} days overdue)`,
        chargeType: 'LATE_FEE',
        percentageOfTotal: lateFeePercent,
        amount: lateFeeAmount,
        balanceAtTime: balanceDue.toNumber(),
        daysOverdue,
        notes: notes || `Auto-generated late fee: ${lateFeePercent}% of $${balanceDue.toFixed(2)} balance`,
      },
    });

    // Update invoice totals
    const newTotal = new Decimal(invoice.total).plus(lateFeeAmount).toNumber();
    const newBalanceDue = balanceDue.plus(lateFeeAmount).toNumber();

    const updatedInvoice = await prisma.invoice.update({
      where: { id },
      data: {
        total: newTotal,
        balanceDue: newBalanceDue,
        status: 'OVERDUE',
      },
      include: {
        account: { select: { id: true, name: true } },
        lineItems: true,
        additionalCharges: true,
      },
    });

    res.json({
      invoice: updatedInvoice,
      additionalCharge,
      lateFeeApplied: lateFeeAmount,
      rate: lateFeePercent,
      daysOverdue,
      lateFeePeriod,
    });
  } catch (error) {
    next(error);
  }
}

// Process late fees for all overdue invoices (batch operation)
export async function processLateFees(req, res, next) {
  try {
    const { dryRun = false } = req.body;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find all overdue invoices with balance due > 0
    const overdueInvoices = await prisma.invoice.findMany({
      where: {
        status: { notIn: ['PAID', 'VOID'] },
        dueDate: { lt: today },
        balanceDue: { gt: 0 },
      },
      include: {
        account: { select: { id: true, name: true, lateFeePercent: true } },
        additionalCharges: { where: { chargeType: 'LATE_FEE' } },
      },
      orderBy: { dueDate: 'asc' },
    });

    const results = {
      processed: 0,
      lateFeeAdded: 0,
      skipped: 0,
      errors: [],
      details: [],
    };

    for (const invoice of overdueInvoices) {
      try {
        const daysOverdue = differenceInDays(today, invoice.dueDate);
        const lateFeePeriod = Math.floor(daysOverdue / 30);

        if (lateFeePeriod < 1) {
          results.skipped++;
          continue;
        }

        const existingLateFees = invoice.additionalCharges.length;

        if (existingLateFees >= lateFeePeriod) {
          results.skipped++;
          continue;
        }

        // Calculate late fee
        const lateFeePercent = invoice.account?.lateFeePercent ? Number(invoice.account.lateFeePercent) : 1.5;
        const balanceDue = new Decimal(invoice.balanceDue);
        const lateFeeAmount = balanceDue.times(lateFeePercent / 100).toDecimalPlaces(2).toNumber();

        if (!dryRun) {
          // Create late fee charge
          await prisma.invoiceAdditionalCharge.create({
            data: {
              invoiceId: invoice.id,
              name: `Late Fee (${daysOverdue} days overdue)`,
              chargeType: 'LATE_FEE',
              percentageOfTotal: lateFeePercent,
              amount: lateFeeAmount,
              balanceAtTime: balanceDue.toNumber(),
              daysOverdue,
              notes: `Auto-generated late fee: ${lateFeePercent}% of $${balanceDue.toFixed(2)} balance`,
            },
          });

          // Update invoice totals
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: {
              total: { increment: lateFeeAmount },
              balanceDue: { increment: lateFeeAmount },
              status: 'OVERDUE',
            },
          });
        }

        results.lateFeeAdded++;
        results.processed++;
        results.details.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          accountName: invoice.account?.name,
          daysOverdue,
          lateFeeAmount,
          newBalanceDue: balanceDue.plus(lateFeeAmount).toNumber(),
        });
      } catch (invoiceError) {
        results.errors.push({
          invoiceId: invoice.id,
          error: invoiceError.message,
        });
      }
    }

    res.json({
      success: true,
      dryRun,
      summary: {
        processed: results.processed,
        lateFeeAdded: results.lateFeeAdded,
        skipped: results.skipped,
        errors: results.errors.length,
      },
      details: results.details,
      errors: results.errors,
    });
  } catch (error) {
    next(error);
  }
}

// Get late fee summary for an account
export async function getLateFeesSummary(req, res, next) {
  try {
    const { accountId } = req.params;

    // Get all invoices for account
    const invoices = await prisma.invoice.findMany({
      where: { accountId },
      include: {
        additionalCharges: { where: { chargeType: 'LATE_FEE' } },
      },
    });

    // Calculate totals
    let totalLateFees = new Decimal(0);
    let invoicesWithLateFees = 0;
    const lateFeeDetails = [];

    for (const invoice of invoices) {
      if (invoice.additionalCharges.length > 0) {
        invoicesWithLateFees++;
        for (const charge of invoice.additionalCharges) {
          totalLateFees = totalLateFees.plus(charge.amount);
          lateFeeDetails.push({
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            chargeId: charge.id,
            amount: Number(charge.amount),
            daysOverdue: charge.daysOverdue,
            createdAt: charge.createdAt,
          });
        }
      }
    }

    // Get account late fee percent
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, name: true, lateFeePercent: true },
    });

    res.json({
      account,
      summary: {
        totalLateFees: totalLateFees.toNumber(),
        invoicesWithLateFees,
        totalLateFeeCharges: lateFeeDetails.length,
        lateFeePercent: account?.lateFeePercent ? Number(account.lateFeePercent) : 1.5,
      },
      details: lateFeeDetails.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    });
  } catch (error) {
    next(error);
  }
}

// Get invoices by account
export async function getInvoicesByAccount(req, res, next) {
  try {
    const { accountId } = req.params;

    const invoices = await prisma.invoice.findMany({
      where: { accountId },
      include: {
        payments: { select: { amount: true, status: true } },
        lineItems: true,
      },
      orderBy: { invoiceDate: 'desc' },
    });

    // Summary stats
    const stats = {
      total: invoices.length,
      byStatus: {},
      totalBilled: 0,
      totalPaid: 0,
      totalOutstanding: 0,
      overdueAmount: 0,
    };

    invoices.forEach((inv) => {
      stats.byStatus[inv.status] = (stats.byStatus[inv.status] || 0) + 1;
      stats.totalBilled += inv.total.toNumber();
      stats.totalPaid += inv.amountPaid.toNumber();
      stats.totalOutstanding += inv.balanceDue.toNumber();

      if (inv.status === 'OVERDUE' || (inv.dueDate && inv.dueDate < new Date() && inv.balanceDue.toNumber() > 0)) {
        stats.overdueAmount += inv.balanceDue.toNumber();
      }
    });

    res.json({
      accountId,
      stats,
      invoices,
    });
  } catch (error) {
    next(error);
  }
}

// Get invoice statistics
export async function getInvoiceStats(req, res, next) {
  try {
    const { dateFrom, dateTo } = req.query;

    const where = {};
    if (dateFrom || dateTo) {
      where.invoiceDate = {};
      if (dateFrom) where.invoiceDate.gte = new Date(dateFrom);
      if (dateTo) where.invoiceDate.lte = new Date(dateTo);
    }

    const [total, byStatus, aggregates] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.groupBy({
        by: ['status'],
        where,
        _count: { status: true },
        _sum: { total: true, balanceDue: true },
      }),
      prisma.invoice.aggregate({
        where,
        _sum: { total: true, amountPaid: true, balanceDue: true },
        _avg: { total: true },
      }),
    ]);

    // Count overdue
    const overdue = await prisma.invoice.count({
      where: {
        ...where,
        status: { in: ['PENDING', 'SENT', 'PARTIAL'] },
        dueDate: { lt: new Date() },
      },
    });

    res.json({
      total,
      overdue,
      byStatus: byStatus.reduce((acc, s) => {
        acc[s.status] = {
          count: s._count.status,
          totalAmount: s._sum.total?.toNumber() || 0,
          balanceDue: s._sum.balanceDue?.toNumber() || 0,
        };
        return acc;
      }, {}),
      totals: {
        billed: aggregates._sum.total?.toNumber() || 0,
        paid: aggregates._sum.amountPaid?.toNumber() || 0,
        outstanding: aggregates._sum.balanceDue?.toNumber() || 0,
        average: aggregates._avg.total?.toNumber() || 0,
      },
    });
  } catch (error) {
    next(error);
  }
}

// Check and update overdue status (batch job)
export async function updateOverdueStatus(req, res, next) {
  try {
    const result = await prisma.invoice.updateMany({
      where: {
        status: { in: ['PENDING', 'SENT', 'PARTIAL'] },
        dueDate: { lt: new Date() },
      },
      data: { status: 'OVERDUE' },
    });

    res.json({
      message: 'Overdue status updated',
      updatedCount: result.count,
    });
  } catch (error) {
    next(error);
  }
}
