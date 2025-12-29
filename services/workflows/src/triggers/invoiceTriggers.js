// Invoice Workflow Triggers
// Automated invoice creation based on business events
// Replaces Salesforce: Kulturra_Invoice_Creation_From_Service_Contract flow
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();

/**
 * Invoice Triggers - Replaces Salesforce Invoice Flows
 *
 * Key Flows Replaced:
 * 1. Kulturra_Invoice_Creation_From_Service_Contract - Auto-create invoice from contract
 * 2. Trigger_Invoice_Roll_Up - Update account totals (handled in webhooks.js)
 */

export const invoiceTriggers = {
  /**
   * Generate invoice number
   * Format: INV-XXXXXXXX (8-digit padded)
   */
  async generateInvoiceNumber() {
    const lastInvoice = await prisma.invoice.findFirst({
      orderBy: { invoiceNumber: 'desc' },
      select: { invoiceNumber: true },
    });

    let nextNumber = 1;
    if (lastInvoice?.invoiceNumber) {
      const numPart = lastInvoice.invoiceNumber.replace('INV-', '');
      nextNumber = parseInt(numPart, 10) + 1;
    }

    return `INV-${String(nextNumber).padStart(8, '0')}`;
  },

  /**
   * Trigger: Service Contract Created/Approved
   * Creates invoice from service contract
   *
   * Equivalent to: Salesforce "Kulturra_Invoice_Creation_From_Service_Contract" flow
   *
   * Entry Criteria (from Salesforce):
   * - ContractStatus = 'Active' OR 'Activated'
   * - RecordType = 'Insurance Contract' OR 'Retail Contract' OR 'Interior Contract'
   *
   * Invoice Fields Mapped:
   * - Account: ServiceContract.AccountId
   * - Opportunity: ServiceContract.Opportunity__c
   * - Total: ServiceContract.Contract_Grand_Total__c
   * - Invoice Date: ServiceContract.Install_Date__c (or today)
   * - Due Date: Invoice Date + Terms (30 days default)
   * - Service Contract: link back to contract
   */
  async onContractActivated(serviceContractId, userId) {
    logger.info(`Invoice trigger: Contract activated ${serviceContractId}`);

    try {
      const serviceContract = await prisma.serviceContract.findUnique({
        where: { id: serviceContractId },
        include: {
          account: {
            select: {
              id: true,
              name: true,
              billingStreet: true,
              billingCity: true,
              billingState: true,
              billingPostalCode: true,
              stripeCustomerId: true,
            },
          },
          opportunity: {
            select: {
              id: true,
              name: true,
              workType: true,
            },
          },
        },
      });

      if (!serviceContract) {
        logger.warn(`Service contract not found: ${serviceContractId}`);
        return null;
      }

      // Check if invoice already exists for this contract
      const existingInvoice = await prisma.invoice.findFirst({
        where: {
          serviceContractId,
          isPmInvoice: false, // Not a PM invoice
        },
      });

      if (existingInvoice) {
        logger.info(`Invoice already exists for contract: ${existingInvoice.id}`);
        return existingInvoice;
      }

      // Check entry criteria: contract must be Active or Activated
      const validStatuses = ['Active', 'Activated', 'ACTIVE', 'ACTIVATED'];
      if (!validStatuses.includes(serviceContract.status)) {
        logger.info(`Contract status ${serviceContract.status} not eligible for invoice creation`);
        return null;
      }

      // Generate invoice number
      const invoiceNumber = await this.generateInvoiceNumber();

      // Calculate dates
      const invoiceDate = serviceContract.installDate || new Date();
      const terms = 30; // Default 30 days
      const dueDate = new Date(invoiceDate);
      dueDate.setDate(dueDate.getDate() + terms);

      // Calculate amounts
      const total = parseFloat(serviceContract.contractTotal || 0);
      const amountPaid = 0;
      const balanceDue = total;

      // Create invoice
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber,
          invoiceDate,
          dueDate,
          terms,
          status: 'DRAFT',
          total,
          subtotal: total,
          amountPaid,
          balanceDue,
          // Relationships
          accountId: serviceContract.accountId,
          opportunityId: serviceContract.opportunityId,
          serviceContractId: serviceContract.id,
          // Billing Address (from Account)
          billingStreet: serviceContract.account?.billingStreet,
          billingCity: serviceContract.account?.billingCity,
          billingState: serviceContract.account?.billingState,
          billingPostalCode: serviceContract.account?.billingPostalCode,
          // Stripe Customer (if exists)
          stripeCustomerId: serviceContract.account?.stripeCustomerId,
          // Metadata
          isPmInvoice: false,
          notes: `Auto-generated from contract: ${serviceContract.contractNumber || serviceContract.name}`,
        },
      });

      logger.info(`Invoice created: ${invoice.id} (${invoiceNumber}) for $${total}`);

      // Create invoice line items from contract products
      await this.createInvoiceLineItems(invoice.id, serviceContract);

      // Update service contract with invoice link
      await prisma.serviceContract.update({
        where: { id: serviceContractId },
        data: {
          invoiceCreated: true,
          invoiceCreatedDate: new Date(),
        },
      });

      return invoice;

    } catch (error) {
      logger.error('Error creating invoice from contract:', error);
      throw error;
    }
  },

  /**
   * Create invoice line items from contract products
   *
   * Mirrors Salesforce OpportunityLineItem → InvoiceLineItem mapping
   */
  async createInvoiceLineItems(invoiceId, serviceContract) {
    try {
      // If contract has opportunityId, get line items from opportunity
      if (serviceContract.opportunityId) {
        const opportunityProducts = await prisma.opportunityProduct.findMany({
          where: { opportunityId: serviceContract.opportunityId },
          include: {
            product: {
              select: {
                id: true,
                name: true,
                productCode: true,
                description: true,
                qbItemId: true,
              },
            },
          },
        });

        for (const oppProduct of opportunityProducts) {
          await prisma.invoiceLineItem.create({
            data: {
              invoiceId,
              productId: oppProduct.productId,
              description: oppProduct.product?.description || oppProduct.product?.name,
              quantity: oppProduct.quantity || 1,
              unitPrice: oppProduct.unitPrice || 0,
              totalPrice: oppProduct.totalPrice || 0,
              qbItemId: oppProduct.product?.qbItemId,
            },
          });
        }

        logger.info(`Created ${opportunityProducts.length} line items for invoice ${invoiceId}`);
      } else {
        // Create a single line item for the contract total
        await prisma.invoiceLineItem.create({
          data: {
            invoiceId,
            description: `Contract: ${serviceContract.name || serviceContract.contractNumber}`,
            quantity: 1,
            unitPrice: parseFloat(serviceContract.contractTotal || 0),
            totalPrice: parseFloat(serviceContract.contractTotal || 0),
          },
        });

        logger.info(`Created single line item for invoice ${invoiceId}`);
      }

    } catch (error) {
      logger.error('Error creating invoice line items:', error);
      // Don't throw - line item failure shouldn't prevent invoice creation
    }
  },

  /**
   * Trigger: PM Add-On Contract Created
   * Creates PM Invoice (separate from main contract invoice)
   *
   * Equivalent to: Salesforce PM Invoice creation logic
   */
  async onPMContractCreated(serviceContractId, userId) {
    logger.info(`Invoice trigger: PM contract created ${serviceContractId}`);

    try {
      const serviceContract = await prisma.serviceContract.findUnique({
        where: { id: serviceContractId },
        include: {
          account: {
            select: {
              id: true,
              billingStreet: true,
              billingCity: true,
              billingState: true,
              billingPostalCode: true,
              stripeCustomerId: true,
            },
          },
        },
      });

      if (!serviceContract) {
        logger.warn(`Service contract not found: ${serviceContractId}`);
        return null;
      }

      // Check for existing PM invoice
      const existingInvoice = await prisma.invoice.findFirst({
        where: {
          serviceContractId,
          isPmInvoice: true,
        },
      });

      if (existingInvoice) {
        logger.info(`PM Invoice already exists for contract: ${existingInvoice.id}`);
        return existingInvoice;
      }

      // Generate invoice number
      const invoiceNumber = await this.generateInvoiceNumber();

      // Calculate dates
      const invoiceDate = new Date();
      const terms = 30;
      const dueDate = new Date(invoiceDate);
      dueDate.setDate(dueDate.getDate() + terms);

      // Calculate amounts
      const total = parseFloat(serviceContract.contractTotal || 0);

      // Create PM invoice
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber,
          invoiceDate,
          dueDate,
          terms,
          status: 'DRAFT',
          total,
          subtotal: total,
          amountPaid: 0,
          balanceDue: total,
          // Relationships
          accountId: serviceContract.accountId,
          opportunityId: serviceContract.opportunityId,
          serviceContractId: serviceContract.id,
          // Billing Address
          billingStreet: serviceContract.account?.billingStreet,
          billingCity: serviceContract.account?.billingCity,
          billingState: serviceContract.account?.billingState,
          billingPostalCode: serviceContract.account?.billingPostalCode,
          stripeCustomerId: serviceContract.account?.stripeCustomerId,
          // PM Invoice flag
          isPmInvoice: true,
          notes: `PM Add-On Invoice: ${serviceContract.contractNumber || serviceContract.name}`,
        },
      });

      logger.info(`PM Invoice created: ${invoice.id} (${invoiceNumber}) for $${total}`);

      return invoice;

    } catch (error) {
      logger.error('Error creating PM invoice:', error);
      throw error;
    }
  },

  /**
   * Trigger: Invoice Ready (Account-level trigger)
   * Updates all open invoices for an account with invoice date and terms
   *
   * Equivalent to: Salesforce flow triggered by Account.Invoice_Date__c change
   */
  async onAccountInvoiceReady(accountId, invoiceDate, userId) {
    logger.info(`Invoice trigger: Account invoice ready ${accountId}`);

    try {
      // Find all unpaid invoices for this account
      const invoices = await prisma.invoice.findMany({
        where: {
          accountId,
          status: { notIn: ['PAID', 'CANCELLED', 'VOID'] },
        },
      });

      if (invoices.length === 0) {
        logger.info('No open invoices to update');
        return [];
      }

      const terms = 30; // Default terms
      const dueDate = new Date(invoiceDate);
      dueDate.setDate(dueDate.getDate() + terms);

      const updatedInvoices = [];

      for (const invoice of invoices) {
        const updated = await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            invoiceDate: new Date(invoiceDate),
            dueDate,
            terms,
            status: invoice.status === 'DRAFT' ? 'SENT' : invoice.status,
          },
        });
        updatedInvoices.push(updated);
      }

      logger.info(`Updated ${updatedInvoices.length} invoices with invoice date`);

      return updatedInvoices;

    } catch (error) {
      logger.error('Error updating invoices with invoice date:', error);
      throw error;
    }
  },

  /**
   * Trigger: Supplement Approved
   * Creates or updates invoice with supplement amount
   *
   * Equivalent to: Salesforce supplement → invoice flow
   */
  async onSupplementApproved(serviceContractId, supplementAmount, userId) {
    logger.info(`Invoice trigger: Supplement approved for ${serviceContractId}, amount: ${supplementAmount}`);

    try {
      // Find existing invoice for this contract
      const invoice = await prisma.invoice.findFirst({
        where: {
          serviceContractId,
          isPmInvoice: false,
        },
      });

      if (!invoice) {
        // Create new invoice if none exists
        return await this.onContractActivated(serviceContractId, userId);
      }

      // Update invoice total with supplement
      const newTotal = parseFloat(invoice.total || 0) + parseFloat(supplementAmount);
      const newBalanceDue = newTotal - parseFloat(invoice.amountPaid || 0);

      const updatedInvoice = await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          total: newTotal,
          subtotal: newTotal,
          balanceDue: newBalanceDue,
        },
      });

      // Add supplement line item
      await prisma.invoiceLineItem.create({
        data: {
          invoiceId: invoice.id,
          description: 'Approved Supplement',
          quantity: 1,
          unitPrice: parseFloat(supplementAmount),
          totalPrice: parseFloat(supplementAmount),
        },
      });

      logger.info(`Invoice ${invoice.id} updated with supplement: $${supplementAmount}`);

      return updatedInvoice;

    } catch (error) {
      logger.error('Error updating invoice with supplement:', error);
      throw error;
    }
  },
};

export default invoiceTriggers;
