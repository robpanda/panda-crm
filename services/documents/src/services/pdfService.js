// PDF Generation Service
// Generates PDF documents for invoices, statements, work orders, and quotes
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });

const S3_BUCKET = process.env.DOCUMENTS_BUCKET || 'panda-crm-documents';

// Company branding
const COMPANY_INFO = {
  name: 'Panda Exteriors',
  address: '8825 Stanford Blvd Suite 201',
  cityStateZip: 'Columbia, MD 21045',
  phone: '(240) 801-6665',
  email: 'info@pandaexteriors.com',
  website: 'www.pandaexteriors.com',
  logo: null, // Will be loaded from S3 if available
};

// Brand colors
const COLORS = {
  primary: rgb(0.4, 0.49, 0.92), // #667eea - Panda purple
  secondary: rgb(0.46, 0.29, 0.64), // #764ba2
  dark: rgb(0.1, 0.1, 0.1),
  gray: rgb(0.5, 0.5, 0.5),
  lightGray: rgb(0.9, 0.9, 0.9),
  success: rgb(0.13, 0.55, 0.13),
  danger: rgb(0.8, 0.2, 0.2),
};

/**
 * PDF Service for generating various document types
 */
export const pdfService = {
  /**
   * Generate an invoice PDF
   */
  async generateInvoicePdf(invoiceId) {
    logger.info(`Generating PDF for invoice: ${invoiceId}`);

    // Fetch invoice with related data
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
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
      throw new Error('Invoice not found');
    }

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Letter size
    const { width, height } = page.getSize();

    // Load fonts
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let y = height - 50;

    // Header - Company Info
    page.drawText(COMPANY_INFO.name, {
      x: 50,
      y,
      size: 24,
      font: fontBold,
      color: COLORS.primary,
    });

    y -= 18;
    page.drawText(COMPANY_INFO.address, {
      x: 50,
      y,
      size: 10,
      font: fontRegular,
      color: COLORS.gray,
    });

    y -= 14;
    page.drawText(COMPANY_INFO.cityStateZip, {
      x: 50,
      y,
      size: 10,
      font: fontRegular,
      color: COLORS.gray,
    });

    y -= 14;
    page.drawText(`${COMPANY_INFO.phone} | ${COMPANY_INFO.email}`, {
      x: 50,
      y,
      size: 10,
      font: fontRegular,
      color: COLORS.gray,
    });

    // Invoice Title - Right Side
    const invoiceTitle = 'INVOICE';
    const invoiceTitleWidth = fontBold.widthOfTextAtSize(invoiceTitle, 28);
    page.drawText(invoiceTitle, {
      x: width - 50 - invoiceTitleWidth,
      y: height - 50,
      size: 28,
      font: fontBold,
      color: COLORS.dark,
    });

    // Invoice Number and Date - Right Side
    const invoiceNumber = `#${invoice.invoiceNumber}`;
    const invoiceNumWidth = fontRegular.widthOfTextAtSize(invoiceNumber, 12);
    page.drawText(invoiceNumber, {
      x: width - 50 - invoiceNumWidth,
      y: height - 78,
      size: 12,
      font: fontRegular,
      color: COLORS.gray,
    });

    const invoiceDate = invoice.invoiceDate
      ? new Date(invoice.invoiceDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : 'Not set';
    const dateLabel = `Date: ${invoiceDate}`;
    const dateLabelWidth = fontRegular.widthOfTextAtSize(dateLabel, 10);
    page.drawText(dateLabel, {
      x: width - 50 - dateLabelWidth,
      y: height - 94,
      size: 10,
      font: fontRegular,
      color: COLORS.gray,
    });

    const dueDate = invoice.dueDate
      ? new Date(invoice.dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : 'Not set';
    const dueLabel = `Due: ${dueDate}`;
    const dueLabelWidth = fontRegular.widthOfTextAtSize(dueLabel, 10);
    page.drawText(dueLabel, {
      x: width - 50 - dueLabelWidth,
      y: height - 108,
      size: 10,
      font: fontRegular,
      color: COLORS.gray,
    });

    // Horizontal line
    y = height - 140;
    page.drawLine({
      start: { x: 50, y },
      end: { x: width - 50, y },
      thickness: 1,
      color: COLORS.lightGray,
    });

    // Bill To Section
    y -= 30;
    page.drawText('BILL TO:', {
      x: 50,
      y,
      size: 10,
      font: fontBold,
      color: COLORS.gray,
    });

    y -= 18;
    page.drawText(invoice.account.name || 'N/A', {
      x: 50,
      y,
      size: 12,
      font: fontBold,
      color: COLORS.dark,
    });

    if (invoice.account.billingAddress) {
      y -= 14;
      page.drawText(invoice.account.billingAddress, {
        x: 50,
        y,
        size: 10,
        font: fontRegular,
        color: COLORS.dark,
      });
    }

    if (invoice.account.billingCity || invoice.account.billingState) {
      y -= 14;
      const cityStateZip = [
        invoice.account.billingCity,
        invoice.account.billingState,
        invoice.account.billingZip,
      ].filter(Boolean).join(', ');
      page.drawText(cityStateZip, {
        x: 50,
        y,
        size: 10,
        font: fontRegular,
        color: COLORS.dark,
      });
    }

    if (invoice.account.email) {
      y -= 14;
      page.drawText(invoice.account.email, {
        x: 50,
        y,
        size: 10,
        font: fontRegular,
        color: COLORS.gray,
      });
    }

    // Status badge
    const statusColors = {
      DRAFT: COLORS.gray,
      SENT: COLORS.primary,
      VIEWED: COLORS.primary,
      PARTIAL: rgb(0.9, 0.6, 0.1),
      PAID: COLORS.success,
      OVERDUE: COLORS.danger,
      CANCELLED: COLORS.gray,
      VOID: COLORS.gray,
    };
    const statusColor = statusColors[invoice.status] || COLORS.gray;
    const statusText = invoice.status;
    const statusX = width - 50 - fontBold.widthOfTextAtSize(statusText, 12);

    page.drawText(statusText, {
      x: statusX,
      y: height - 160,
      size: 12,
      font: fontBold,
      color: statusColor,
    });

    // Line Items Table
    y -= 50;
    const tableTop = y;
    const colWidths = {
      description: 300,
      qty: 60,
      unitPrice: 80,
      total: 80,
    };
    const tableLeft = 50;

    // Table Header Background
    page.drawRectangle({
      x: tableLeft,
      y: y - 5,
      width: width - 100,
      height: 25,
      color: COLORS.lightGray,
    });

    // Table Headers
    page.drawText('Description', {
      x: tableLeft + 10,
      y: y + 5,
      size: 10,
      font: fontBold,
      color: COLORS.dark,
    });

    page.drawText('Qty', {
      x: tableLeft + colWidths.description + 10,
      y: y + 5,
      size: 10,
      font: fontBold,
      color: COLORS.dark,
    });

    page.drawText('Unit Price', {
      x: tableLeft + colWidths.description + colWidths.qty + 10,
      y: y + 5,
      size: 10,
      font: fontBold,
      color: COLORS.dark,
    });

    page.drawText('Total', {
      x: tableLeft + colWidths.description + colWidths.qty + colWidths.unitPrice + 10,
      y: y + 5,
      size: 10,
      font: fontBold,
      color: COLORS.dark,
    });

    // Line Items
    y -= 25;
    for (const item of invoice.lineItems) {
      y -= 20;

      // Wrap long descriptions
      const maxDescWidth = colWidths.description - 10;
      let description = item.description || 'Service';
      if (fontRegular.widthOfTextAtSize(description, 10) > maxDescWidth) {
        description = description.substring(0, 50) + '...';
      }

      page.drawText(description, {
        x: tableLeft + 10,
        y,
        size: 10,
        font: fontRegular,
        color: COLORS.dark,
      });

      page.drawText(String(Number(item.quantity)), {
        x: tableLeft + colWidths.description + 10,
        y,
        size: 10,
        font: fontRegular,
        color: COLORS.dark,
      });

      page.drawText(this.formatCurrency(Number(item.unitPrice)), {
        x: tableLeft + colWidths.description + colWidths.qty + 10,
        y,
        size: 10,
        font: fontRegular,
        color: COLORS.dark,
      });

      page.drawText(this.formatCurrency(Number(item.totalPrice)), {
        x: tableLeft + colWidths.description + colWidths.qty + colWidths.unitPrice + 10,
        y,
        size: 10,
        font: fontBold,
        color: COLORS.dark,
      });

      // Row separator line
      page.drawLine({
        start: { x: tableLeft, y: y - 8 },
        end: { x: width - 50, y: y - 8 },
        thickness: 0.5,
        color: COLORS.lightGray,
      });
    }

    // Totals Section
    y -= 40;
    const totalsX = width - 200;

    // Subtotal
    page.drawText('Subtotal:', {
      x: totalsX,
      y,
      size: 10,
      font: fontRegular,
      color: COLORS.gray,
    });
    page.drawText(this.formatCurrency(Number(invoice.subtotal)), {
      x: width - 80,
      y,
      size: 10,
      font: fontRegular,
      color: COLORS.dark,
    });

    // Tax (if any)
    if (Number(invoice.tax) > 0) {
      y -= 18;
      page.drawText('Tax:', {
        x: totalsX,
        y,
        size: 10,
        font: fontRegular,
        color: COLORS.gray,
      });
      page.drawText(this.formatCurrency(Number(invoice.tax)), {
        x: width - 80,
        y,
        size: 10,
        font: fontRegular,
        color: COLORS.dark,
      });
    }

    // Total line
    y -= 5;
    page.drawLine({
      start: { x: totalsX - 10, y },
      end: { x: width - 50, y },
      thickness: 1,
      color: COLORS.dark,
    });

    // Total
    y -= 18;
    page.drawText('Total:', {
      x: totalsX,
      y,
      size: 12,
      font: fontBold,
      color: COLORS.dark,
    });
    page.drawText(this.formatCurrency(Number(invoice.total)), {
      x: width - 80,
      y,
      size: 12,
      font: fontBold,
      color: COLORS.dark,
    });

    // Amount Paid
    if (Number(invoice.amountPaid) > 0) {
      y -= 18;
      page.drawText('Amount Paid:', {
        x: totalsX,
        y,
        size: 10,
        font: fontRegular,
        color: COLORS.success,
      });
      page.drawText(`-${this.formatCurrency(Number(invoice.amountPaid))}`, {
        x: width - 80,
        y,
        size: 10,
        font: fontRegular,
        color: COLORS.success,
      });
    }

    // Balance Due
    y -= 25;
    page.drawRectangle({
      x: totalsX - 20,
      y: y - 8,
      width: width - totalsX + 20 - 30,
      height: 30,
      color: Number(invoice.balanceDue) > 0 ? rgb(1, 0.95, 0.95) : rgb(0.95, 1, 0.95),
    });

    page.drawText('Balance Due:', {
      x: totalsX,
      y,
      size: 14,
      font: fontBold,
      color: Number(invoice.balanceDue) > 0 ? COLORS.danger : COLORS.success,
    });
    page.drawText(this.formatCurrency(Number(invoice.balanceDue)), {
      x: width - 80,
      y,
      size: 14,
      font: fontBold,
      color: Number(invoice.balanceDue) > 0 ? COLORS.danger : COLORS.success,
    });

    // Payment History (if any payments)
    if (invoice.payments.length > 0) {
      y -= 60;
      page.drawText('Payment History:', {
        x: 50,
        y,
        size: 12,
        font: fontBold,
        color: COLORS.dark,
      });

      for (const payment of invoice.payments) {
        y -= 18;
        const paymentDate = payment.paymentDate
          ? new Date(payment.paymentDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
          : 'N/A';
        const paymentText = `${paymentDate} - ${payment.paymentMethod || 'Payment'} - ${this.formatCurrency(Number(payment.amount))}`;
        page.drawText(paymentText, {
          x: 50,
          y,
          size: 10,
          font: fontRegular,
          color: COLORS.gray,
        });
      }
    }

    // Footer
    const footerY = 50;
    page.drawLine({
      start: { x: 50, y: footerY + 20 },
      end: { x: width - 50, y: footerY + 20 },
      thickness: 0.5,
      color: COLORS.lightGray,
    });

    page.drawText('Thank you for your business!', {
      x: 50,
      y: footerY,
      size: 10,
      font: fontBold,
      color: COLORS.primary,
    });

    page.drawText(`Questions? Contact us at ${COMPANY_INFO.phone} or ${COMPANY_INFO.email}`, {
      x: 50,
      y: footerY - 14,
      size: 9,
      font: fontRegular,
      color: COLORS.gray,
    });

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();

    // Upload to S3
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
      { expiresIn: 3600 * 24 * 7 } // 7 days
    );

    logger.info(`Invoice PDF generated: ${key}`);

    return {
      key,
      url: `https://${S3_BUCKET}.s3.amazonaws.com/${key}`,
      downloadUrl,
      invoiceNumber: invoice.invoiceNumber,
    };
  },

  /**
   * Generate a statement PDF for an account
   */
  async generateStatementPdf(accountId, options = {}) {
    logger.info(`Generating statement for account: ${accountId}`);

    const { startDate, endDate } = options;

    // Fetch account with invoices
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: {
        invoices: {
          where: startDate && endDate ? {
            invoiceDate: {
              gte: new Date(startDate),
              lte: new Date(endDate),
            },
          } : undefined,
          orderBy: { invoiceDate: 'desc' },
          include: {
            payments: {
              where: { status: 'COMPLETED' },
            },
          },
        },
      },
    });

    if (!account) {
      throw new Error('Account not found');
    }

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const { width, height } = page.getSize();

    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let y = height - 50;

    // Header
    page.drawText(COMPANY_INFO.name, {
      x: 50,
      y,
      size: 24,
      font: fontBold,
      color: COLORS.primary,
    });

    page.drawText('ACCOUNT STATEMENT', {
      x: width - 200,
      y,
      size: 20,
      font: fontBold,
      color: COLORS.dark,
    });

    y -= 40;
    page.drawText(`Statement Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, {
      x: width - 250,
      y,
      size: 10,
      font: fontRegular,
      color: COLORS.gray,
    });

    // Account Info
    y -= 30;
    page.drawText(account.name, {
      x: 50,
      y,
      size: 14,
      font: fontBold,
      color: COLORS.dark,
    });

    // Invoice Summary Table
    y -= 50;
    page.drawRectangle({
      x: 50,
      y: y - 5,
      width: width - 100,
      height: 25,
      color: COLORS.lightGray,
    });

    const cols = [
      { label: 'Invoice #', x: 60 },
      { label: 'Date', x: 160 },
      { label: 'Due Date', x: 260 },
      { label: 'Total', x: 360 },
      { label: 'Paid', x: 440 },
      { label: 'Balance', x: 520 },
    ];

    for (const col of cols) {
      page.drawText(col.label, {
        x: col.x,
        y: y + 5,
        size: 9,
        font: fontBold,
        color: COLORS.dark,
      });
    }

    let totalBalance = 0;
    y -= 25;

    for (const invoice of account.invoices) {
      y -= 20;
      if (y < 100) {
        // Add new page if running out of space
        break;
      }

      const paidAmount = invoice.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const balance = Number(invoice.total) - paidAmount;
      totalBalance += balance;

      page.drawText(invoice.invoiceNumber, { x: 60, y, size: 9, font: fontRegular, color: COLORS.dark });
      page.drawText(invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString() : 'N/A', { x: 160, y, size: 9, font: fontRegular, color: COLORS.dark });
      page.drawText(invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'N/A', { x: 260, y, size: 9, font: fontRegular, color: COLORS.dark });
      page.drawText(this.formatCurrency(Number(invoice.total)), { x: 360, y, size: 9, font: fontRegular, color: COLORS.dark });
      page.drawText(this.formatCurrency(paidAmount), { x: 440, y, size: 9, font: fontRegular, color: COLORS.success });
      page.drawText(this.formatCurrency(balance), { x: 520, y, size: 9, font: fontBold, color: balance > 0 ? COLORS.danger : COLORS.success });

      page.drawLine({
        start: { x: 50, y: y - 8 },
        end: { x: width - 50, y: y - 8 },
        thickness: 0.5,
        color: COLORS.lightGray,
      });
    }

    // Total Balance Due
    y -= 40;
    page.drawRectangle({
      x: width - 200,
      y: y - 8,
      width: 150,
      height: 30,
      color: totalBalance > 0 ? rgb(1, 0.95, 0.95) : rgb(0.95, 1, 0.95),
    });

    page.drawText('Total Balance Due:', {
      x: width - 190,
      y,
      size: 12,
      font: fontBold,
      color: COLORS.dark,
    });
    page.drawText(this.formatCurrency(totalBalance), {
      x: width - 80,
      y,
      size: 12,
      font: fontBold,
      color: totalBalance > 0 ? COLORS.danger : COLORS.success,
    });

    // Generate and upload
    const pdfBytes = await pdfDoc.save();
    const key = `statements/${account.id}-${new Date().toISOString().slice(0, 10)}-${uuidv4().slice(0, 8)}.pdf`;

    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: pdfBytes,
      ContentType: 'application/pdf',
      Metadata: {
        accountId: account.id,
        generatedAt: new Date().toISOString(),
      },
    }));

    const downloadUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }),
      { expiresIn: 3600 * 24 * 7 }
    );

    logger.info(`Statement PDF generated: ${key}`);

    return {
      key,
      url: `https://${S3_BUCKET}.s3.amazonaws.com/${key}`,
      downloadUrl,
      accountName: account.name,
      totalBalance,
    };
  },

  /**
   * Generate a work order PDF
   */
  async generateWorkOrderPdf(workOrderId) {
    logger.info(`Generating PDF for work order: ${workOrderId}`);

    const workOrder = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      include: {
        opportunity: {
          include: {
            account: true,
            contacts: true,
          },
        },
        serviceAppointments: {
          orderBy: { scheduledStart: 'asc' },
        },
        lineItems: true,
      },
    });

    if (!workOrder) {
      throw new Error('Work order not found');
    }

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const { width, height } = page.getSize();

    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let y = height - 50;

    // Header
    page.drawText(COMPANY_INFO.name, {
      x: 50,
      y,
      size: 24,
      font: fontBold,
      color: COLORS.primary,
    });

    page.drawText('WORK ORDER', {
      x: width - 180,
      y,
      size: 24,
      font: fontBold,
      color: COLORS.dark,
    });

    // Work Order Number
    y -= 30;
    page.drawText(`#${workOrder.workOrderNumber}`, {
      x: width - 180,
      y,
      size: 14,
      font: fontRegular,
      color: COLORS.gray,
    });

    // Status
    y -= 20;
    page.drawText(`Status: ${workOrder.status}`, {
      x: width - 180,
      y,
      size: 12,
      font: fontBold,
      color: COLORS.primary,
    });

    // Customer Info
    y = height - 120;
    page.drawText('CUSTOMER:', {
      x: 50,
      y,
      size: 10,
      font: fontBold,
      color: COLORS.gray,
    });

    y -= 18;
    page.drawText(workOrder.opportunity?.account?.name || 'N/A', {
      x: 50,
      y,
      size: 12,
      font: fontBold,
      color: COLORS.dark,
    });

    // Service Address
    if (workOrder.serviceAddress || workOrder.opportunity?.account?.billingAddress) {
      y -= 18;
      page.drawText(workOrder.serviceAddress || workOrder.opportunity?.account?.billingAddress || '', {
        x: 50,
        y,
        size: 10,
        font: fontRegular,
        color: COLORS.dark,
      });
    }

    // Work Type
    y -= 30;
    page.drawText(`Work Type: ${workOrder.workType || 'General'}`, {
      x: 50,
      y,
      size: 11,
      font: fontBold,
      color: COLORS.dark,
    });

    // Description
    if (workOrder.description) {
      y -= 25;
      page.drawText('Description:', {
        x: 50,
        y,
        size: 10,
        font: fontBold,
        color: COLORS.gray,
      });

      y -= 15;
      const descLines = this.wrapText(workOrder.description, 80);
      for (const line of descLines.slice(0, 5)) {
        page.drawText(line, {
          x: 50,
          y,
          size: 10,
          font: fontRegular,
          color: COLORS.dark,
        });
        y -= 14;
      }
    }

    // Appointments
    if (workOrder.serviceAppointments.length > 0) {
      y -= 20;
      page.drawText('Scheduled Appointments:', {
        x: 50,
        y,
        size: 12,
        font: fontBold,
        color: COLORS.dark,
      });

      for (const apt of workOrder.serviceAppointments) {
        y -= 20;
        const aptDate = apt.scheduledStart
          ? new Date(apt.scheduledStart).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
          : 'TBD';
        const aptTime = apt.scheduledStart && apt.scheduledEnd
          ? `${new Date(apt.scheduledStart).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} - ${new Date(apt.scheduledEnd).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
          : '';

        page.drawText(`• ${aptDate} ${aptTime} - ${apt.status}`, {
          x: 60,
          y,
          size: 10,
          font: fontRegular,
          color: COLORS.dark,
        });
      }
    }

    // Generate and upload
    const pdfBytes = await pdfDoc.save();
    const key = `workorders/${workOrder.workOrderNumber}-${uuidv4().slice(0, 8)}.pdf`;

    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: pdfBytes,
      ContentType: 'application/pdf',
      Metadata: {
        workOrderId: workOrder.id,
        workOrderNumber: workOrder.workOrderNumber,
        generatedAt: new Date().toISOString(),
      },
    }));

    const downloadUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }),
      { expiresIn: 3600 * 24 * 7 }
    );

    logger.info(`Work order PDF generated: ${key}`);

    return {
      key,
      url: `https://${S3_BUCKET}.s3.amazonaws.com/${key}`,
      downloadUrl,
      workOrderNumber: workOrder.workOrderNumber,
    };
  },

  /**
   * Generate a quote PDF
   */
  async generateQuotePdf(quoteId) {
    logger.info(`Generating PDF for quote: ${quoteId}`);

    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      include: {
        opportunity: {
          include: {
            account: true,
          },
        },
        lineItems: true,
      },
    });

    if (!quote) {
      throw new Error('Quote not found');
    }

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const { width, height } = page.getSize();

    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let y = height - 50;

    // Header
    page.drawText(COMPANY_INFO.name, {
      x: 50,
      y,
      size: 24,
      font: fontBold,
      color: COLORS.primary,
    });

    page.drawText('QUOTE', {
      x: width - 120,
      y,
      size: 28,
      font: fontBold,
      color: COLORS.dark,
    });

    // Quote Number
    y -= 30;
    const quoteNum = `#${quote.quoteNumber}`;
    page.drawText(quoteNum, {
      x: width - 120,
      y,
      size: 12,
      font: fontRegular,
      color: COLORS.gray,
    });

    // Valid Until
    if (quote.expirationDate) {
      y -= 18;
      const validUntil = `Valid Until: ${new Date(quote.expirationDate).toLocaleDateString()}`;
      page.drawText(validUntil, {
        x: width - 150,
        y: height - 98,
        size: 10,
        font: fontRegular,
        color: COLORS.gray,
      });
    }

    // Customer
    y = height - 130;
    page.drawText('PREPARED FOR:', {
      x: 50,
      y,
      size: 10,
      font: fontBold,
      color: COLORS.gray,
    });

    y -= 18;
    page.drawText(quote.opportunity?.account?.name || 'N/A', {
      x: 50,
      y,
      size: 14,
      font: fontBold,
      color: COLORS.dark,
    });

    // Quote Name/Description
    y -= 40;
    page.drawText(quote.name || 'Project Quote', {
      x: 50,
      y,
      size: 14,
      font: fontBold,
      color: COLORS.dark,
    });

    // Line Items Table
    y -= 40;
    page.drawRectangle({
      x: 50,
      y: y - 5,
      width: width - 100,
      height: 25,
      color: COLORS.lightGray,
    });

    page.drawText('Description', { x: 60, y: y + 5, size: 10, font: fontBold, color: COLORS.dark });
    page.drawText('Qty', { x: 350, y: y + 5, size: 10, font: fontBold, color: COLORS.dark });
    page.drawText('Unit Price', { x: 400, y: y + 5, size: 10, font: fontBold, color: COLORS.dark });
    page.drawText('Total', { x: 490, y: y + 5, size: 10, font: fontBold, color: COLORS.dark });

    y -= 25;
    for (const item of quote.lineItems) {
      y -= 20;

      page.drawText((item.description || item.productName || 'Item').substring(0, 45), {
        x: 60, y, size: 10, font: fontRegular, color: COLORS.dark,
      });
      page.drawText(String(Number(item.quantity)), {
        x: 350, y, size: 10, font: fontRegular, color: COLORS.dark,
      });
      page.drawText(this.formatCurrency(Number(item.unitPrice)), {
        x: 400, y, size: 10, font: fontRegular, color: COLORS.dark,
      });
      page.drawText(this.formatCurrency(Number(item.totalPrice)), {
        x: 490, y, size: 10, font: fontBold, color: COLORS.dark,
      });

      page.drawLine({
        start: { x: 50, y: y - 8 },
        end: { x: width - 50, y: y - 8 },
        thickness: 0.5,
        color: COLORS.lightGray,
      });
    }

    // Total
    y -= 40;
    page.drawLine({
      start: { x: width - 200, y: y + 15 },
      end: { x: width - 50, y: y + 15 },
      thickness: 1,
      color: COLORS.dark,
    });

    page.drawText('TOTAL:', {
      x: width - 180,
      y,
      size: 14,
      font: fontBold,
      color: COLORS.dark,
    });
    page.drawText(this.formatCurrency(Number(quote.grandTotal || quote.total)), {
      x: width - 100,
      y,
      size: 14,
      font: fontBold,
      color: COLORS.primary,
    });

    // Terms
    y -= 60;
    page.drawText('Terms & Conditions:', {
      x: 50,
      y,
      size: 10,
      font: fontBold,
      color: COLORS.gray,
    });

    y -= 14;
    page.drawText('• This quote is valid for 30 days from the date above.', {
      x: 50, y, size: 9, font: fontRegular, color: COLORS.dark,
    });
    y -= 12;
    page.drawText('• A deposit of 50% is required to begin work.', {
      x: 50, y, size: 9, font: fontRegular, color: COLORS.dark,
    });
    y -= 12;
    page.drawText('• Final payment is due upon completion.', {
      x: 50, y, size: 9, font: fontRegular, color: COLORS.dark,
    });

    // Generate and upload
    const pdfBytes = await pdfDoc.save();
    const key = `quotes/${quote.quoteNumber}-${uuidv4().slice(0, 8)}.pdf`;

    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: pdfBytes,
      ContentType: 'application/pdf',
      Metadata: {
        quoteId: quote.id,
        quoteNumber: quote.quoteNumber,
        generatedAt: new Date().toISOString(),
      },
    }));

    const downloadUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }),
      { expiresIn: 3600 * 24 * 7 }
    );

    logger.info(`Quote PDF generated: ${key}`);

    return {
      key,
      url: `https://${S3_BUCKET}.s3.amazonaws.com/${key}`,
      downloadUrl,
      quoteNumber: quote.quoteNumber,
    };
  },

  /**
   * Generate a roof measurement report PDF
   * @param {Object} measurementData - The measurement data from the roof analysis pipeline
   * @param {Object} options - Additional options (address, opportunityId, imagery, etc.)
   */
  async generateRoofReportPdf(measurementData, options = {}) {
    logger.info('Generating roof measurement report PDF');

    const {
      address = {},
      opportunityId,
      imagery = {},
      location = {},
      aerialImage = null,        // Buffer or base64 string of aerial image (PNG/JPG)
      segmentationImage = null,  // Buffer or base64 string of segmentation overlay (PNG)
      includeImageryPage = true, // Whether to add a second page with aerial imagery
    } = options;

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Letter size
    const { width, height } = page.getSize();

    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let y = height - 50;

    // ===== HEADER =====
    page.drawText(COMPANY_INFO.name, {
      x: 50,
      y,
      size: 24,
      font: fontBold,
      color: COLORS.primary,
    });

    page.drawText('ROOF MEASUREMENT REPORT', {
      x: width - 250,
      y,
      size: 16,
      font: fontBold,
      color: COLORS.dark,
    });

    // Date
    y -= 25;
    const reportDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const dateWidth = fontRegular.widthOfTextAtSize(`Date: ${reportDate}`, 10);
    page.drawText(`Date: ${reportDate}`, {
      x: width - 50 - dateWidth,
      y,
      size: 10,
      font: fontRegular,
      color: COLORS.gray,
    });

    // Company address
    y -= 15;
    page.drawText(COMPANY_INFO.address, {
      x: 50,
      y,
      size: 9,
      font: fontRegular,
      color: COLORS.gray,
    });

    y -= 12;
    page.drawText(COMPANY_INFO.cityStateZip, {
      x: 50,
      y,
      size: 9,
      font: fontRegular,
      color: COLORS.gray,
    });

    y -= 12;
    page.drawText(`${COMPANY_INFO.phone} | ${COMPANY_INFO.website}`, {
      x: 50,
      y,
      size: 9,
      font: fontRegular,
      color: COLORS.gray,
    });

    // Horizontal line
    y -= 15;
    page.drawLine({
      start: { x: 50, y },
      end: { x: width - 50, y },
      thickness: 2,
      color: COLORS.primary,
    });

    // ===== PROPERTY ADDRESS =====
    y -= 30;
    page.drawText('PROPERTY ADDRESS', {
      x: 50,
      y,
      size: 10,
      font: fontBold,
      color: COLORS.gray,
    });

    y -= 18;
    const fullAddress = [
      address.street,
      [address.city, address.state, address.zip].filter(Boolean).join(', '),
    ].filter(Boolean).join('\n') || 'Address not provided';

    for (const line of fullAddress.split('\n')) {
      page.drawText(line, {
        x: 50,
        y,
        size: 12,
        font: fontBold,
        color: COLORS.dark,
      });
      y -= 15;
    }

    // Coordinates
    if (location.latitude && location.longitude) {
      page.drawText(`Coordinates: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`, {
        x: 50,
        y,
        size: 9,
        font: fontRegular,
        color: COLORS.gray,
      });
      y -= 20;
    }

    // ===== SUMMARY BOX =====
    y -= 10;
    const summaryBoxHeight = 80;
    page.drawRectangle({
      x: 50,
      y: y - summaryBoxHeight,
      width: width - 100,
      height: summaryBoxHeight,
      color: rgb(0.95, 0.97, 1), // Light blue background
      borderColor: COLORS.primary,
      borderWidth: 1,
    });

    // Summary title
    page.drawText('ROOF SUMMARY', {
      x: 60,
      y: y - 18,
      size: 12,
      font: fontBold,
      color: COLORS.primary,
    });

    // Summary metrics
    const summaryY = y - 40;
    const measurements = measurementData.measurements || measurementData;

    const totalArea = measurements.total_area_sqft || measurements.totalRoofArea || 0;
    const roofSquares = measurements.roof_squares || measurements.totalRoofSquares || (totalArea / 100);
    const pitch = measurements.predominant_pitch || measurements.roofPitch || 'N/A';
    const facetCount = measurementData.segmentation?.facets?.length || measurements.facetCount || 'N/A';

    // Column 1: Total Area
    page.drawText('Total Roof Area', { x: 70, y: summaryY, size: 9, font: fontRegular, color: COLORS.gray });
    page.drawText(`${totalArea.toLocaleString()} sq ft`, { x: 70, y: summaryY - 14, size: 14, font: fontBold, color: COLORS.dark });

    // Column 2: Roof Squares
    page.drawText('Roof Squares', { x: 200, y: summaryY, size: 9, font: fontRegular, color: COLORS.gray });
    page.drawText(`${roofSquares.toFixed(1)}`, { x: 200, y: summaryY - 14, size: 14, font: fontBold, color: COLORS.dark });

    // Column 3: Pitch
    page.drawText('Predominant Pitch', { x: 320, y: summaryY, size: 9, font: fontRegular, color: COLORS.gray });
    page.drawText(String(pitch), { x: 320, y: summaryY - 14, size: 14, font: fontBold, color: COLORS.dark });

    // Column 4: Facets
    page.drawText('Roof Facets', { x: 450, y: summaryY, size: 9, font: fontRegular, color: COLORS.gray });
    page.drawText(String(facetCount), { x: 450, y: summaryY - 14, size: 14, font: fontBold, color: COLORS.dark });

    y = y - summaryBoxHeight - 25;

    // ===== LINEAR MEASUREMENTS TABLE =====
    page.drawText('LINEAR MEASUREMENTS', {
      x: 50,
      y,
      size: 12,
      font: fontBold,
      color: COLORS.dark,
    });

    y -= 20;

    // Table header background
    page.drawRectangle({
      x: 50,
      y: y - 5,
      width: width - 100,
      height: 22,
      color: COLORS.lightGray,
    });

    // Table headers
    page.drawText('Measurement Type', { x: 60, y: y + 3, size: 10, font: fontBold, color: COLORS.dark });
    page.drawText('Length (ft)', { x: 280, y: y + 3, size: 10, font: fontBold, color: COLORS.dark });
    page.drawText('Confidence', { x: 400, y: y + 3, size: 10, font: fontBold, color: COLORS.dark });

    y -= 22;

    // Linear measurement rows
    const linearMeasurements = [
      { key: 'ridge', label: 'Ridge' },
      { key: 'hip', label: 'Hip' },
      { key: 'valley', label: 'Valley' },
      { key: 'eave', label: 'Eave' },
      { key: 'rake', label: 'Rake' },
      { key: 'drip_edge', label: 'Drip Edge' },
      { key: 'starter', label: 'Starter' },
      { key: 'step_flashing', label: 'Step Flashing' },
    ];

    for (const item of linearMeasurements) {
      const data = measurements[item.key];
      if (!data) continue;

      y -= 18;

      const lengthFt = data.length_ft || data.lengthFt || data.length || 0;
      const confidence = data.confidence || 'N/A';

      page.drawText(item.label, { x: 60, y, size: 10, font: fontRegular, color: COLORS.dark });
      page.drawText(`${lengthFt.toFixed(1)}`, { x: 280, y, size: 10, font: fontBold, color: COLORS.dark });

      // Confidence with color
      const confColor = confidence === 'HIGH' ? COLORS.success :
                        confidence === 'ESTIMATED' ? rgb(0.9, 0.6, 0.1) :
                        COLORS.gray;
      page.drawText(String(confidence), { x: 400, y, size: 10, font: fontBold, color: confColor });

      // Row separator
      page.drawLine({
        start: { x: 50, y: y - 6 },
        end: { x: width - 50, y: y - 6 },
        thickness: 0.5,
        color: COLORS.lightGray,
      });
    }

    // ===== MATERIAL RECOMMENDATIONS =====
    y -= 35;
    page.drawText('MATERIAL RECOMMENDATIONS', {
      x: 50,
      y,
      size: 12,
      font: fontBold,
      color: COLORS.dark,
    });

    y -= 20;

    const materials = [
      { key: 'recommended_shingles_squares', label: 'Shingles', unit: 'squares' },
      { key: 'recommended_underlayment_sqft', label: 'Underlayment', unit: 'sq ft' },
      { key: 'recommended_ridge_cap_lf', label: 'Ridge Cap', unit: 'linear ft' },
      { key: 'recommended_drip_edge_lf', label: 'Drip Edge', unit: 'linear ft' },
      { key: 'recommended_starter_lf', label: 'Starter Strip', unit: 'linear ft' },
      { key: 'recommended_ice_water_sqft', label: 'Ice & Water Shield', unit: 'sq ft' },
    ];

    // Two-column layout for materials
    const colWidth = (width - 120) / 2;
    let col = 0;
    let materialY = y;

    for (const mat of materials) {
      const value = measurements[mat.key];
      if (value === undefined || value === 0) continue;

      const x = 60 + (col * colWidth);

      page.drawText(`${mat.label}:`, { x, y: materialY, size: 10, font: fontRegular, color: COLORS.gray });
      page.drawText(`${Math.ceil(value).toLocaleString()} ${mat.unit}`, { x: x + 120, y: materialY, size: 10, font: fontBold, color: COLORS.dark });

      col++;
      if (col >= 2) {
        col = 0;
        materialY -= 18;
      }
    }

    // ===== WARNINGS (if any) =====
    if (measurements.warnings && measurements.warnings.length > 0) {
      y = materialY - 30;
      page.drawText('NOTES & WARNINGS', {
        x: 50,
        y,
        size: 10,
        font: fontBold,
        color: COLORS.danger,
      });

      for (const warning of measurements.warnings) {
        y -= 14;
        page.drawText(`⚠ ${warning}`, { x: 60, y, size: 9, font: fontRegular, color: COLORS.danger });
      }
    }

    // ===== IMAGERY INFO =====
    y = Math.min(y - 30, 120);
    if (imagery.year || imagery.resolution || imagery.source) {
      page.drawText('IMAGERY SOURCE', {
        x: 50,
        y,
        size: 10,
        font: fontBold,
        color: COLORS.gray,
      });

      y -= 14;
      const imageryInfo = [
        imagery.source && `Source: ${imagery.source}`,
        imagery.year && `Year: ${imagery.year}`,
        imagery.resolution && `Resolution: ${imagery.resolution}m/pixel`,
      ].filter(Boolean).join(' | ');

      page.drawText(imageryInfo, { x: 50, y, size: 9, font: fontRegular, color: COLORS.gray });
    }

    // ===== FOOTER =====
    const footerY = 50;
    page.drawLine({
      start: { x: 50, y: footerY + 20 },
      end: { x: width - 50, y: footerY + 20 },
      thickness: 0.5,
      color: COLORS.lightGray,
    });

    page.drawText('This report is generated using satellite/aerial imagery analysis.', {
      x: 50,
      y: footerY,
      size: 9,
      font: fontRegular,
      color: COLORS.gray,
    });

    page.drawText('For questions, contact us at ' + COMPANY_INFO.phone, {
      x: 50,
      y: footerY - 12,
      size: 9,
      font: fontRegular,
      color: COLORS.gray,
    });

    // Confidence score
    const confidence = measurementData.segmentation?.confidence || measurements.confidence || 0;
    const confidenceText = `Analysis Confidence: ${(confidence * 100).toFixed(0)}%`;
    const confWidth = fontBold.widthOfTextAtSize(confidenceText, 10);
    page.drawText(confidenceText, {
      x: width - 50 - confWidth,
      y: footerY,
      size: 10,
      font: fontBold,
      color: confidence >= 0.8 ? COLORS.success : confidence >= 0.6 ? rgb(0.9, 0.6, 0.1) : COLORS.danger,
    });

    // ===== PAGE 2: AERIAL IMAGERY (Optional) =====
    if (includeImageryPage && aerialImage) {
      const imageryPage = pdfDoc.addPage([612, 792]); // Letter size
      let imgY = height - 50;

      // Header
      imageryPage.drawText(COMPANY_INFO.name, {
        x: 50,
        y: imgY,
        size: 18,
        font: fontBold,
        color: COLORS.primary,
      });
      imgY -= 25;

      imageryPage.drawText('AERIAL IMAGERY', {
        x: 50,
        y: imgY,
        size: 14,
        font: fontBold,
        color: COLORS.dark,
      });
      imgY -= 15;

      // Property address
      if (address.street) {
        imageryPage.drawText(`${address.street}, ${address.city || ''}, ${address.state || ''} ${address.zip || ''}`, {
          x: 50,
          y: imgY,
          size: 10,
          font: fontRegular,
          color: COLORS.gray,
        });
        imgY -= 30;
      }

      try {
        // Convert base64 to Buffer if needed
        let imageBuffer = aerialImage;
        if (typeof aerialImage === 'string') {
          // Remove data URL prefix if present
          const base64Data = aerialImage.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
          imageBuffer = Buffer.from(base64Data, 'base64');
        }

        // Detect image type and embed
        let embeddedImage;
        const isPng = imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50; // PNG magic bytes
        if (isPng) {
          embeddedImage = await pdfDoc.embedPng(imageBuffer);
        } else {
          embeddedImage = await pdfDoc.embedJpg(imageBuffer);
        }

        // Calculate dimensions to fit on page (max width 512, max height 500)
        const imgDims = embeddedImage.scale(1);
        const maxWidth = 512;
        const maxHeight = 500;
        let drawWidth = imgDims.width;
        let drawHeight = imgDims.height;

        if (drawWidth > maxWidth) {
          const scale = maxWidth / drawWidth;
          drawWidth = maxWidth;
          drawHeight *= scale;
        }
        if (drawHeight > maxHeight) {
          const scale = maxHeight / drawHeight;
          drawHeight = maxHeight;
          drawWidth *= scale;
        }

        // Center the image horizontally
        const imgX = (width - drawWidth) / 2;

        // Draw border around image area
        imageryPage.drawRectangle({
          x: imgX - 5,
          y: imgY - drawHeight - 10,
          width: drawWidth + 10,
          height: drawHeight + 10,
          borderColor: COLORS.lightGray,
          borderWidth: 1,
        });

        // Draw the aerial image
        imageryPage.drawImage(embeddedImage, {
          x: imgX,
          y: imgY - drawHeight - 5,
          width: drawWidth,
          height: drawHeight,
        });

        imgY -= drawHeight + 30;

        // Image caption
        imageryPage.drawText('Aerial view of property', {
          x: 50,
          y: imgY,
          size: 9,
          font: fontRegular,
          color: COLORS.gray,
        });
        imgY -= 20;

        // Add segmentation overlay as second image if provided
        if (segmentationImage) {
          try {
            let segBuffer = segmentationImage;
            if (typeof segmentationImage === 'string') {
              const base64Data = segmentationImage.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
              segBuffer = Buffer.from(base64Data, 'base64');
            }

            // Segmentation is typically PNG with transparency
            const segEmbedded = await pdfDoc.embedPng(segBuffer);

            // Use same dimensions as aerial image for consistency
            imageryPage.drawText('Roof Segmentation Analysis', {
              x: 50,
              y: imgY,
              size: 10,
              font: fontBold,
              color: COLORS.dark,
            });
            imgY -= 15;

            // If there's room, show segmentation side by side or below
            const segDims = segEmbedded.scale(1);
            let segWidth = Math.min(segDims.width, 250);
            let segHeight = segDims.height * (segWidth / segDims.width);
            if (segHeight > 200) {
              segHeight = 200;
              segWidth = segDims.width * (segHeight / segDims.height);
            }

            imageryPage.drawImage(segEmbedded, {
              x: 50,
              y: imgY - segHeight,
              width: segWidth,
              height: segHeight,
            });

            imgY -= segHeight + 15;
          } catch (segError) {
            logger.warn('Failed to embed segmentation image:', segError.message);
          }
        }

      } catch (imgError) {
        logger.warn('Failed to embed aerial image:', imgError.message);
        // Add placeholder text if image embedding fails
        imageryPage.drawText('Aerial imagery could not be embedded.', {
          x: 50,
          y: imgY - 50,
          size: 12,
          font: fontRegular,
          color: COLORS.gray,
        });
      }

      // Imagery source info
      if (imagery.source || imagery.year) {
        const sourceText = `Imagery: ${imagery.source || 'Unknown'} | Year: ${imagery.year || 'N/A'}`;
        imageryPage.drawText(sourceText, {
          x: 50,
          y: 50,
          size: 8,
          font: fontRegular,
          color: COLORS.gray,
        });
      }

      // Footer
      imageryPage.drawLine({
        start: { x: 50, y: 70 },
        end: { x: width - 50, y: 70 },
        thickness: 0.5,
        color: COLORS.lightGray,
      });
      imageryPage.drawText(`© ${new Date().getFullYear()} ${COMPANY_INFO.name}`, {
        x: width - 180,
        y: 55,
        size: 8,
        font: fontRegular,
        color: COLORS.gray,
      });
    }

    // ===== GENERATE AND UPLOAD =====
    const pdfBytes = await pdfDoc.save();
    const reportId = uuidv4().slice(0, 12);
    const dateStr = new Date().toISOString().slice(0, 10);
    const addressSlug = (address.street || 'unknown').replace(/[^a-zA-Z0-9]/g, '-').substring(0, 30);
    const key = `roof-reports/${dateStr}/${addressSlug}-${reportId}.pdf`;

    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: pdfBytes,
      ContentType: 'application/pdf',
      Metadata: {
        reportType: 'roof-measurement',
        opportunityId: opportunityId || '',
        address: address.street || '',
        generatedAt: new Date().toISOString(),
        confidence: String(confidence),
      },
    }));

    const downloadUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }),
      { expiresIn: 3600 * 24 * 7 } // 7 days
    );

    logger.info(`Roof measurement report PDF generated: ${key}`);

    return {
      success: true,
      key,
      url: `https://${S3_BUCKET}.s3.amazonaws.com/${key}`,
      downloadUrl,
      reportId,
      pdfSizeBytes: pdfBytes.length,
      summary: {
        totalAreaSqft: totalArea,
        roofSquares,
        pitch,
        facetCount,
        confidence,
      },
    };
  },

  /**
   * Helper: Format currency
   */
  formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount || 0);
  },

  /**
   * Helper: Wrap text to lines
   */
  wrapText(text, maxChars) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    for (const word of words) {
      if ((currentLine + ' ' + word).trim().length <= maxChars) {
        currentLine = (currentLine + ' ' + word).trim();
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);

    return lines;
  },
};

export default pdfService;
