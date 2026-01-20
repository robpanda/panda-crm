/**
 * Contract Generation Workflow Triggers
 *
 * Handles automations for contract document generation:
 * - After specs are prepped, generate contract document
 * - Create agreement record in PandaSign
 * - Update opportunity status
 *
 * Integrates with PandaSign service for e-signature
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Documents service URL for PandaSign API calls
const DOCUMENTS_SERVICE_URL =
  process.env.DOCUMENTS_SERVICE_URL || 'http://documents-service:3009';

// Default contract template for insurance workflow
const INSURANCE_CONTRACT_TEMPLATE = 'Insurance Service Agreement';
const RETAIL_CONTRACT_TEMPLATE = 'Retail Service Agreement';

/**
 * Generate a contract document after specs are prepared
 *
 * @param {string} opportunityId - Opportunity ID
 * @param {object} specsData - Specs data from the preparation workflow
 * @param {string} userId - User who triggered the generation
 */
export async function generateContractFromSpecs(opportunityId, specsData, userId) {
  console.log(
    `[Contract Trigger] Generating contract for Opportunity: ${opportunityId}`
  );

  const results = {
    agreementCreated: null,
    opportunityUpdated: false,
    activityCreated: null,
    errors: [],
  };

  try {
    // Get opportunity with related data
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: {
        account: true,
        contact: true,
        owner: true,
      },
    });

    if (!opportunity) {
      throw new Error(`Opportunity not found: ${opportunityId}`);
    }

    if (!opportunity.specsPrepped) {
      console.log('[Contract Trigger] Specs not prepped - skipping contract generation');
      return results;
    }

    // Determine contract template based on opportunity type
    const templateName =
      opportunity.type === 'INSURANCE'
        ? INSURANCE_CONTRACT_TEMPLATE
        : RETAIL_CONTRACT_TEMPLATE;

    // Find the template
    const template = await prisma.agreementTemplate.findFirst({
      where: {
        OR: [
          { name: templateName },
          { name: { contains: 'Service Agreement', mode: 'insensitive' } },
        ],
        isActive: true,
      },
    });

    if (!template) {
      console.log(`[Contract Trigger] No active template found for "${templateName}"`);
      // Create a placeholder task instead
      await prisma.task.create({
        data: {
          subject: 'Generate Contract Manually',
          description: `No contract template found for ${templateName}. Please generate the contract manually.\n\nOpportunity: ${opportunity.name}`,
          status: 'NOT_STARTED',
          priority: 'HIGH',
          dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // 1 day
          opportunityId: opportunityId,
          assignedToId: opportunity.ownerId || userId,
        },
      });
      results.errors.push({
        type: 'template_not_found',
        error: `Template "${templateName}" not found`,
      });
      return results;
    }

    // Prepare merge data from opportunity and specs
    const mergeData = {
      // Customer info
      customerName:
        opportunity.contact?.fullName ||
        opportunity.account?.name ||
        'Customer',
      customerEmail: opportunity.contact?.email || '',
      customerPhone: opportunity.contact?.phone || '',
      customerAddress: formatAddress(opportunity.account),

      // Opportunity info
      opportunityName: opportunity.name,
      jobNumber: opportunity.jobId || opportunity.id,
      amount: opportunity.amount ? `$${opportunity.amount.toFixed(2)}` : 'TBD',

      // Insurance specific
      claimNumber: opportunity.claimNumber || 'N/A',
      insuranceCarrier: opportunity.insuranceCarrier || 'N/A',
      deductible: opportunity.deductible
        ? `$${opportunity.deductible.toFixed(2)}`
        : 'N/A',
      rcvAmount: opportunity.rcvAmount
        ? `$${opportunity.rcvAmount.toFixed(2)}`
        : 'N/A',

      // Specs data
      trades: specsData?.selectedTrades?.join(', ') || 'Roofing',
      complexity: specsData?.complexity || 'Standard',

      // Dates
      currentDate: new Date().toLocaleDateString(),
      effectiveDate: new Date().toLocaleDateString(),
    };

    // Call documents service to create agreement
    try {
      const response = await fetch(
        `${DOCUMENTS_SERVICE_URL}/api/agreements`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateId: template.id,
            opportunityId: opportunityId,
            accountId: opportunity.accountId,
            contactId: opportunity.contactId,
            recipientEmail: opportunity.contact?.email || '',
            recipientName:
              opportunity.contact?.fullName || opportunity.account?.name,
            mergeData,
            userId,
          }),
        }
      );

      if (response.ok) {
        const agreement = await response.json();
        results.agreementCreated = agreement;
        console.log(`[Contract Trigger] Agreement created: ${agreement.id}`);
      } else {
        const errorText = await response.text();
        console.error('[Contract Trigger] Documents service error:', errorText);
        results.errors.push({
          type: 'documents_service',
          error: errorText,
        });
      }
    } catch (fetchError) {
      console.error('[Contract Trigger] Failed to call documents service:', fetchError);
      results.errors.push({
        type: 'documents_service_unreachable',
        error: fetchError.message,
      });
    }

    // Update opportunity status
    try {
      await prisma.opportunity.update({
        where: { id: opportunityId },
        data: {
          status: 'Contract Generated',
          updatedAt: new Date(),
        },
      });
      results.opportunityUpdated = true;
      console.log('[Contract Trigger] Updated opportunity status to "Contract Generated"');
    } catch (updateError) {
      console.error('[Contract Trigger] Failed to update opportunity:', updateError);
      results.errors.push({
        type: 'opportunity_update',
        error: updateError.message,
      });
    }

    // Create activity log
    try {
      const activity = await prisma.activity.create({
        data: {
          type: 'WORKFLOW_TRIGGERED',
          subject: 'Contract Generated',
          body: `A contract document has been generated for ${opportunity.name}.\n\nThe contract is ready for review and signing.`,
          status: 'COMPLETED',
          opportunityId: opportunityId,
          accountId: opportunity.accountId,
          contactId: opportunity.contactId,
          userId: opportunity.ownerId || userId,
          occurredAt: new Date(),
          metadata: {
            triggeredBy: 'contract_generated',
            autoGenerated: true,
            agreementId: results.agreementCreated?.id,
            templateName: template.name,
          },
        },
      });
      results.activityCreated = activity;
      console.log(`[Contract Trigger] Created activity: ${activity.id}`);
    } catch (activityError) {
      console.error('[Contract Trigger] Failed to create activity:', activityError);
      results.errors.push({ type: 'activity', error: activityError.message });
    }

    return results;
  } catch (error) {
    console.error('[Contract Trigger] generateContractFromSpecs failed:', error);
    throw error;
  }
}

/**
 * Format account address into a single string
 */
function formatAddress(account) {
  if (!account) return '';
  const parts = [
    account.billingStreet,
    account.billingCity,
    account.billingState,
    account.billingPostalCode,
  ].filter(Boolean);
  return parts.join(', ');
}

/**
 * Trigger contract generation manually from UI
 */
export async function triggerContractGeneration(opportunityId, userId) {
  console.log(
    `[Contract Trigger] Manual contract generation for Opportunity: ${opportunityId}`
  );

  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    select: { specsData: true, specsPrepped: true },
  });

  if (!opportunity) {
    throw new Error('Opportunity not found');
  }

  let specsData = {};
  if (opportunity.specsData) {
    try {
      specsData = JSON.parse(opportunity.specsData);
    } catch (e) {
      console.warn('[Contract Trigger] Failed to parse specsData:', e);
    }
  }

  return generateContractFromSpecs(opportunityId, specsData, userId);
}

/**
 * Evaluate contract triggers based on opportunity changes
 * Called when opportunity.specsPrepped becomes true or manually triggered
 */
export async function evaluateContractTriggers(opportunityId, changes, userId) {
  const results = [];

  // Auto-generate contract when specs are prepped (optional - can be disabled)
  const AUTO_GENERATE_CONTRACT = process.env.AUTO_GENERATE_CONTRACT === 'true';

  if (
    AUTO_GENERATE_CONTRACT &&
    changes.specsPrepped === true &&
    changes._previousSpecsPrepped !== true
  ) {
    const specsData = changes.specsData || {};
    const result = await generateContractFromSpecs(
      opportunityId,
      specsData,
      userId
    );
    results.push({ trigger: 'contractGenerated', result });
  }

  return results;
}

export default {
  generateContractFromSpecs,
  triggerContractGeneration,
  evaluateContractTriggers,
  INSURANCE_CONTRACT_TEMPLATE,
  RETAIL_CONTRACT_TEMPLATE,
};
