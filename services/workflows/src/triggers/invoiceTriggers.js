// Invoice Workflow Triggers
// Automated invoice creation based on business events
// Replaces Salesforce: Kulturra_Invoice_Creation_From_Service_Contract flow
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';
import { onInvoiceCreated } from './quickbooksTriggers.js';

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

      // Trigger QuickBooks sync and Stripe payment link generation
      try {
        await onInvoiceCreated(invoice.id, userId);
      } catch (qbError) {
        logger.error('QuickBooks/Stripe sync failed after invoice creation', { invoiceId: invoice.id, error: qbError.message });
        // Don't throw - invoice was created successfully, sync failure is non-blocking
      }

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

      // Trigger QuickBooks sync and Stripe payment link generation
      try {
        await onInvoiceCreated(invoice.id, userId);
      } catch (qbError) {
        logger.error('QuickBooks/Stripe sync failed after PM invoice creation', { invoiceId: invoice.id, error: qbError.message });
        // Don't throw - invoice was created successfully, sync failure is non-blocking
      }

      return invoice;

    } catch (error) {
      logger.error('Error creating PM invoice:', error);
      throw error;
    }
  },

  /**
   * Trigger: Invoice Ready (Account-level trigger)
   * Updates all open invoices for an account with invoice date and terms
   * Terms: 7 days from invoice date
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

      const terms = 7; // 7 days as per requirements
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

      logger.info(`Updated ${updatedInvoices.length} invoices with invoice date (terms: ${terms} days)`);

      return updatedInvoices;

    } catch (error) {
      logger.error('Error updating invoices with invoice date:', error);
      throw error;
    }
  },

  /**
   * Late Fee Automation
   * Adds 1.5% late fee to overdue invoices every 30 days
   *
   * Schedule: Runs daily, checks invoices that are 30, 60, 90+ days overdue
   * Creates InvoiceAdditionalCharge record with:
   * - name: "Late Fee"
   * - percentageOfTotal: 1.5%
   * - amount: balanceDue * 0.015
   * - daysOverdue: days since due date
   */
  async processLateFees() {
    logger.info('Starting late fee processing...');

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Find all overdue invoices with balance due > 0
      const overdueInvoices = await prisma.invoice.findMany({
        where: {
          status: { notIn: ['PAID', 'CANCELLED', 'VOID'] },
          dueDate: { lt: today },
          balanceDue: { gt: 0 },
        },
        include: {
          account: {
            select: {
              id: true,
              name: true,
              lateFeePercent: true,
            },
          },
          additionalCharges: {
            where: {
              chargeType: 'LATE_FEE',
            },
            orderBy: {
              createdAt: 'desc',
            },
          },
        },
      });

      logger.info(`Found ${overdueInvoices.length} overdue invoices to evaluate`);

      const results = {
        processed: 0,
        lateFeeAdded: 0,
        skipped: 0,
        errors: [],
      };

      for (const invoice of overdueInvoices) {
        try {
          const daysOverdue = Math.floor((today - new Date(invoice.dueDate)) / (1000 * 60 * 60 * 24));

          // Calculate which 30-day period we're in (30, 60, 90, etc.)
          const lateFeeperiod = Math.floor(daysOverdue / 30);

          if (lateFeeperiod < 1) {
            // Not yet 30 days overdue
            results.skipped++;
            continue;
          }

          // Count existing late fees
          const existingLateFees = invoice.additionalCharges.length;

          // Check if we need to add a new late fee
          // Late fee is added at 30, 60, 90 days etc.
          if (existingLateFees >= lateFeeperiod) {
            // Already have the appropriate number of late fees
            logger.info(`Invoice ${invoice.invoiceNumber}: Already has ${existingLateFees} late fees for ${daysOverdue} days overdue`);
            results.skipped++;
            continue;
          }

          // Calculate late fee amount (1.5% of current balance due)
          const lateFeePercent = parseFloat(invoice.account?.lateFeePercent || 1.5);
          const lateFeeAmount = parseFloat(invoice.balanceDue) * (lateFeePercent / 100);

          // Create the late fee charge
          const lateFeeCharge = await prisma.invoiceAdditionalCharge.create({
            data: {
              invoiceId: invoice.id,
              name: `Late Fee (${daysOverdue} days overdue)`,
              chargeType: 'LATE_FEE',
              percentageOfTotal: lateFeePercent,
              amount: lateFeeAmount,
              balanceAtTime: parseFloat(invoice.balanceDue),
              daysOverdue: daysOverdue,
              notes: `Auto-generated late fee: ${lateFeePercent}% of $${invoice.balanceDue} balance`,
            },
          });

          // Update invoice total and balance due
          const newTotal = parseFloat(invoice.total) + lateFeeAmount;
          const newBalanceDue = parseFloat(invoice.balanceDue) + lateFeeAmount;

          await prisma.invoice.update({
            where: { id: invoice.id },
            data: {
              total: newTotal,
              balanceDue: newBalanceDue,
              status: 'OVERDUE',
            },
          });

          logger.info(`Added late fee to invoice ${invoice.invoiceNumber}: $${lateFeeAmount.toFixed(2)} (${lateFeePercent}% of $${invoice.balanceDue})`);

          results.lateFeeAdded++;
          results.processed++;

        } catch (invoiceError) {
          logger.error(`Error processing late fee for invoice ${invoice.id}:`, invoiceError);
          results.errors.push({
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            error: invoiceError.message,
          });
        }
      }

      logger.info(`Late fee processing complete: ${results.lateFeeAdded} fees added, ${results.skipped} skipped, ${results.errors.length} errors`);

      return results;

    } catch (error) {
      logger.error('Error processing late fees:', error);
      throw error;
    }
  },

  /**
   * Add a single late fee to a specific invoice
   * Can be called manually or through automation
   */
  async addLateFeeToInvoice(invoiceId, options = {}) {
    logger.info(`Adding late fee to invoice: ${invoiceId}`);

    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          account: {
            select: {
              lateFeePercent: true,
            },
          },
        },
      });

      if (!invoice) {
        throw new Error(`Invoice not found: ${invoiceId}`);
      }

      if (parseFloat(invoice.balanceDue) <= 0) {
        throw new Error('Cannot add late fee to invoice with zero balance');
      }

      const today = new Date();
      const daysOverdue = invoice.dueDate
        ? Math.floor((today - new Date(invoice.dueDate)) / (1000 * 60 * 60 * 24))
        : 0;

      const lateFeePercent = options.percentage || parseFloat(invoice.account?.lateFeePercent || 1.5);
      const lateFeeAmount = options.fixedAmount || (parseFloat(invoice.balanceDue) * (lateFeePercent / 100));

      // Create the late fee charge
      const lateFeeCharge = await prisma.invoiceAdditionalCharge.create({
        data: {
          invoiceId: invoice.id,
          name: options.name || `Late Fee`,
          chargeType: 'LATE_FEE',
          percentageOfTotal: lateFeePercent,
          fixedAmount: options.fixedAmount || null,
          amount: lateFeeAmount,
          balanceAtTime: parseFloat(invoice.balanceDue),
          daysOverdue: daysOverdue,
          notes: options.notes || `Late fee: ${lateFeePercent}% of $${invoice.balanceDue} balance`,
        },
      });

      // Update invoice totals
      const newTotal = parseFloat(invoice.total) + lateFeeAmount;
      const newBalanceDue = parseFloat(invoice.balanceDue) + lateFeeAmount;

      const updatedInvoice = await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          total: newTotal,
          balanceDue: newBalanceDue,
        },
      });

      logger.info(`Late fee added to invoice ${invoice.invoiceNumber}: $${lateFeeAmount.toFixed(2)}`);

      return {
        invoice: updatedInvoice,
        lateFee: lateFeeCharge,
      };

    } catch (error) {
      logger.error('Error adding late fee to invoice:', error);
      throw error;
    }
  },

  /**
   * Get late fee summary for an account
   */
  async getAccountLateFeesSummary(accountId) {
    try {
      const invoices = await prisma.invoice.findMany({
        where: {
          accountId,
          status: { notIn: ['PAID', 'CANCELLED', 'VOID'] },
        },
        include: {
          additionalCharges: {
            where: {
              chargeType: 'LATE_FEE',
            },
          },
        },
      });

      let totalLateFees = 0;
      let invoicesWithLateFees = 0;

      for (const invoice of invoices) {
        if (invoice.additionalCharges.length > 0) {
          invoicesWithLateFees++;
          for (const charge of invoice.additionalCharges) {
            totalLateFees += parseFloat(charge.amount);
          }
        }
      }

      return {
        accountId,
        totalLateFees,
        invoicesWithLateFees,
        totalOpenInvoices: invoices.length,
      };

    } catch (error) {
      logger.error('Error getting account late fees summary:', error);
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
