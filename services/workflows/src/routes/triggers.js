// Workflow Triggers Routes
// Exposes automation triggers as API endpoints for cross-service communication
import { Router } from 'express';
import { evaluateInsuranceTriggers, onAdjusterMeetingComplete, onInsuranceApproved, onSupplementApproved, onClaimFiled } from '../triggers/insuranceTriggers.js';
import { evaluateSpecsTriggers, onSpecsPrepped } from '../triggers/specsTriggers.js';
import { evaluateInspectionTriggers, onInspectionCompleted } from '../triggers/inspectionTriggers.js';
import { triggerContractGeneration, evaluateContractTriggers } from '../triggers/contractTriggers.js';
import { onAccountOnboarding, onInvoiceCreated, onPaymentReceived, evaluateAccountStatusChange } from '../triggers/quickbooksTriggers.js';
import {
  evaluateOpportunitySMSTriggers,
  evaluateWorkOrderSMSTriggers,
  evaluateServiceAppointmentSMSTriggers,
  onLeadAssigned,
  onAppointmentCanceled,
  onWorkOrderInProgress,
  onWorkCompleted,
  onDeckingInspectionPass,
  onDeckingInspectionFail,
  onCrewLeadAssigned,
} from '../triggers/smsTriggers.js';
import { logger } from '../middleware/logger.js';
import {
  addSkillRequirementsFromOpportunity,
  onWorkOrderCreated,
  onOpportunityTradesUpdated,
  removeSkillRequirement,
  getWorkOrderSkillRequirements,
  TRADE_TO_SKILL_MAP,
} from '../triggers/skillTriggers.js';
import {
  evaluateExpeditingTriggers,
  onFlatRoofDetected,
  onLineDropRequired,
  onSupplementHoldsJob,
} from '../triggers/expeditingTriggers.js';

const router = Router();

// ============================================================================
// INSURANCE TRIGGERS
// These endpoints are called by the opportunities service when status changes
// ============================================================================

/**
 * POST /triggers/insurance/evaluate
 * Evaluate all insurance triggers based on opportunity changes
 * Called by opportunityService.updateOpportunity when insurance opportunity is updated
 */
router.post('/insurance/evaluate', async (req, res, next) => {
  try {
    const { opportunityId, changes, userId } = req.body;

    if (!opportunityId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'opportunityId is required' },
      });
    }

    logger.info(`Evaluating insurance triggers for opportunity ${opportunityId}`, { changes });

    const results = await evaluateInsuranceTriggers(opportunityId, changes || {}, userId);

    res.json({
      success: true,
      data: {
        opportunityId,
        triggersEvaluated: true,
        triggersCount: results.length,
        results,
      },
    });
  } catch (error) {
    logger.error('Error evaluating insurance triggers:', error);
    next(error);
  }
});

/**
 * POST /triggers/insurance/adjuster-meeting-complete
 * Manually trigger the adjuster meeting complete workflow
 * Creates: Task, Note, Service Appointment for Contract Signing
 */
router.post('/insurance/adjuster-meeting-complete', async (req, res, next) => {
  try {
    const { opportunityId, userId } = req.body;

    if (!opportunityId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'opportunityId is required' },
      });
    }

    logger.info(`Manual trigger: Adjuster Meeting Complete for ${opportunityId}`);

    const result = await onAdjusterMeetingComplete(opportunityId, userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error in adjuster meeting complete trigger:', error);
    next(error);
  }
});

/**
 * POST /triggers/insurance/approved
 * Manually trigger the insurance approval workflow
 */
router.post('/insurance/approved', async (req, res, next) => {
  try {
    const { opportunityId, approvalData, userId } = req.body;

    if (!opportunityId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'opportunityId is required' },
      });
    }

    logger.info(`Manual trigger: Insurance Approved for ${opportunityId}`);

    const result = await onInsuranceApproved(opportunityId, approvalData || {}, userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error in insurance approved trigger:', error);
    next(error);
  }
});

/**
 * POST /triggers/insurance/claim-filed
 * Manually trigger the claim filed workflow
 */
router.post('/insurance/claim-filed', async (req, res, next) => {
  try {
    const { opportunityId, claimData, userId } = req.body;

    if (!opportunityId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'opportunityId is required' },
      });
    }

    logger.info(`Manual trigger: Claim Filed for ${opportunityId}`);

    const result = await onClaimFiled(opportunityId, claimData || {}, userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error in claim filed trigger:', error);
    next(error);
  }
});

/**
 * POST /triggers/insurance/supplement-approved
 * Manually trigger the supplement approved workflow
 */
router.post('/insurance/supplement-approved', async (req, res, next) => {
  try {
    const { serviceContractId, supplementData, userId } = req.body;

    if (!serviceContractId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'serviceContractId is required' },
      });
    }

    logger.info(`Manual trigger: Supplement Approved for contract ${serviceContractId}`);

    const result = await onSupplementApproved(serviceContractId, supplementData || {}, userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error in supplement approved trigger:', error);
    next(error);
  }
});

// ============================================================================
// SPECS PREPARATION TRIGGERS
// These endpoints are called when specs are prepared for an opportunity
// ============================================================================

/**
 * POST /triggers/specs/evaluate
 * Evaluate specs triggers based on opportunity changes
 * Called by opportunityService when specsPrepped changes to true
 */
router.post('/specs/evaluate', async (req, res, next) => {
  try {
    const { opportunityId, changes, userId } = req.body;

    if (!opportunityId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'opportunityId is required' },
      });
    }

    logger.info(`Evaluating specs triggers for opportunity ${opportunityId}`, { changes });

    const results = await evaluateSpecsTriggers(opportunityId, changes || {}, userId);

    res.json({
      success: true,
      data: {
        opportunityId,
        triggersEvaluated: true,
        triggersCount: results.length,
        results,
      },
    });
  } catch (error) {
    logger.error('Error evaluating specs triggers:', error);
    next(error);
  }
});

/**
 * POST /triggers/specs/prepped
 * Manually trigger the specs preparation workflow
 * Creates: WorkOrderLineItem, Service Appointment for Contract Signing
 */
router.post('/specs/prepped', async (req, res, next) => {
  try {
    const { opportunityId, specsData, userId } = req.body;

    if (!opportunityId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'opportunityId is required' },
      });
    }

    logger.info(`Manual trigger: Specs Prepped for ${opportunityId}`);

    const result = await onSpecsPrepped(opportunityId, specsData, userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error in specs prepped trigger:', error);
    next(error);
  }
});

// ============================================================================
// INSPECTION TRIGGERS
// These endpoints are called when inspection appointments are completed
// ============================================================================

/**
 * POST /triggers/inspection-completed
 * Trigger inspection completion workflow when a service appointment is marked COMPLETED
 * Called by serviceAppointmentController when status changes to COMPLETED
 */
router.post('/inspection-completed', async (req, res, next) => {
  try {
    const { serviceAppointmentId, oldStatus, newStatus, userId } = req.body;

    if (!serviceAppointmentId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'serviceAppointmentId is required' },
      });
    }

    logger.info(`Evaluating inspection completion trigger for appointment ${serviceAppointmentId}`);

    const results = await evaluateInspectionTriggers(serviceAppointmentId, oldStatus, newStatus, userId);

    res.json({
      success: true,
      data: {
        serviceAppointmentId,
        triggersEvaluated: true,
        triggersCount: results.length,
        results,
      },
    });
  } catch (error) {
    logger.error('Error evaluating inspection triggers:', error);
    next(error);
  }
});

/**
 * POST /triggers/inspection/manual-complete
 * Manually trigger the inspection completion workflow
 * Creates: Task for specs, Activity log, Updates opportunity to "Inspected"
 */
router.post('/inspection/manual-complete', async (req, res, next) => {
  try {
    const { serviceAppointmentId, userId } = req.body;

    if (!serviceAppointmentId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'serviceAppointmentId is required' },
      });
    }

    logger.info(`Manual trigger: Inspection Completed for appointment ${serviceAppointmentId}`);

    const result = await onInspectionCompleted(serviceAppointmentId, userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error in inspection completed trigger:', error);
    next(error);
  }
});

// ============================================================================
// CONTRACT GENERATION TRIGGERS
// These endpoints are called to generate contract documents
// ============================================================================

/**
 * POST /triggers/contract/generate
 * Generate contract document from opportunity specs
 * Creates: Agreement record in PandaSign, Activity log
 */
router.post('/contract/generate', async (req, res, next) => {
  try {
    const { opportunityId, userId } = req.body;

    if (!opportunityId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'opportunityId is required' },
      });
    }

    logger.info(`Manual trigger: Generate Contract for Opportunity ${opportunityId}`);

    const result = await triggerContractGeneration(opportunityId, userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error in contract generation trigger:', error);
    next(error);
  }
});

/**
 * POST /triggers/contract/evaluate
 * Evaluate contract triggers based on opportunity changes
 * (optional auto-generation when specs are prepped)
 */
router.post('/contract/evaluate', async (req, res, next) => {
  try {
    const { opportunityId, changes, userId } = req.body;

    if (!opportunityId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'opportunityId is required' },
      });
    }

    logger.info(`Evaluating contract triggers for opportunity ${opportunityId}`);

    const results = await evaluateContractTriggers(opportunityId, changes || {}, userId);

    res.json({
      success: true,
      data: {
        opportunityId,
        triggersEvaluated: true,
        triggersCount: results.length,
        results,
      },
    });
  } catch (error) {
    logger.error('Error evaluating contract triggers:', error);
    next(error);
  }
});

// ============================================================================
// QUICKBOOKS/STRIPE SYNC TRIGGERS
// These endpoints are called when accounts/invoices/payments need QB/Stripe sync
// ============================================================================

/**
 * POST /triggers/quickbooks/account-onboarding
 * Trigger QB/Stripe customer creation when account status changes to Onboarding
 * Called by accountService when status changes
 */
router.post('/quickbooks/account-onboarding', async (req, res, next) => {
  try {
    const { accountId, userId } = req.body;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'accountId is required' },
      });
    }

    logger.info(`Manual trigger: Account Onboarding QB/Stripe sync for ${accountId}`);

    const result = await onAccountOnboarding(accountId, userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error in account onboarding QB trigger:', error);
    next(error);
  }
});

/**
 * POST /triggers/quickbooks/invoice-created
 * Trigger QB invoice sync and Stripe payment link generation
 * Called after invoice is created
 */
router.post('/quickbooks/invoice-created', async (req, res, next) => {
  try {
    const { invoiceId, userId } = req.body;

    if (!invoiceId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'invoiceId is required' },
      });
    }

    logger.info(`Manual trigger: Invoice Created QB/Stripe sync for ${invoiceId}`);

    const result = await onInvoiceCreated(invoiceId, userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error in invoice created QB trigger:', error);
    next(error);
  }
});

/**
 * POST /triggers/quickbooks/payment-received
 * Trigger QB payment sync when payment is received
 * Called by Stripe webhook handler
 */
router.post('/quickbooks/payment-received', async (req, res, next) => {
  try {
    const { paymentId, userId } = req.body;

    if (!paymentId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'paymentId is required' },
      });
    }

    logger.info(`Manual trigger: Payment Received QB sync for ${paymentId}`);

    const result = await onPaymentReceived(paymentId, userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error in payment received QB trigger:', error);
    next(error);
  }
});

/**
 * POST /triggers/quickbooks/evaluate-status
 * Evaluate account status changes for QB triggers
 */
router.post('/quickbooks/evaluate-status', async (req, res, next) => {
  try {
    const { accountId, oldStatus, newStatus, userId } = req.body;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'accountId is required' },
      });
    }

    logger.info(`Evaluating QB triggers for account ${accountId}`, { oldStatus, newStatus });

    const results = await evaluateAccountStatusChange(accountId, oldStatus, newStatus, userId);

    res.json({
      success: true,
      data: {
        accountId,
        triggersEvaluated: true,
        triggersCount: results.length,
        results,
      },
    });
  } catch (error) {
    logger.error('Error evaluating QB triggers:', error);
    next(error);
  }
});

// ============================================================================
// SMS NOTIFICATION TRIGGERS
// These endpoints send SMS notifications based on record changes
// Replaces Salesforce Riley SMS flows
// ============================================================================

/**
 * POST /triggers/sms/evaluate-opportunity
 * Evaluate SMS triggers when an opportunity is updated
 * Called by opportunityService.updateOpportunity
 */
router.post('/sms/evaluate-opportunity', async (req, res, next) => {
  try {
    const { opportunityId, oldValues, newValues, userId } = req.body;

    if (!opportunityId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'opportunityId is required' },
      });
    }

    logger.info(`Evaluating SMS triggers for opportunity ${opportunityId}`);

    const results = await evaluateOpportunitySMSTriggers(opportunityId, oldValues || {}, newValues || {}, userId);

    res.json({
      success: true,
      data: {
        opportunityId,
        triggersEvaluated: true,
        triggersCount: results.length,
        results,
      },
    });
  } catch (error) {
    logger.error('Error evaluating opportunity SMS triggers:', error);
    next(error);
  }
});

/**
 * POST /triggers/sms/evaluate-workorder
 * Evaluate SMS triggers when a work order is updated
 * Called by workOrderController.updateWorkOrder
 */
router.post('/sms/evaluate-workorder', async (req, res, next) => {
  try {
    const { workOrderId, oldValues, newValues, userId } = req.body;

    if (!workOrderId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'workOrderId is required' },
      });
    }

    logger.info(`Evaluating SMS triggers for work order ${workOrderId}`);

    const results = await evaluateWorkOrderSMSTriggers(workOrderId, oldValues || {}, newValues || {}, userId);

    res.json({
      success: true,
      data: {
        workOrderId,
        triggersEvaluated: true,
        triggersCount: results.length,
        results,
      },
    });
  } catch (error) {
    logger.error('Error evaluating work order SMS triggers:', error);
    next(error);
  }
});

/**
 * POST /triggers/sms/evaluate-service-appointment
 * Evaluate SMS triggers when a service appointment is created/updated
 * Called by serviceAppointmentController
 *
 * This replicates Salesforce flows including SMS_Appt_Canceled
 */
router.post('/sms/evaluate-service-appointment', async (req, res, next) => {
  try {
    const { serviceAppointmentId, oldValues, newValues, eventType, userId } = req.body;

    if (!serviceAppointmentId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'serviceAppointmentId is required' },
      });
    }

    logger.info(`Evaluating SMS triggers for service appointment ${serviceAppointmentId}`, { eventType, oldValues, newValues });

    // evaluateServiceAppointmentSMSTriggers expects:
    // (appointmentId, appointmentData, previousValues)
    // appointmentData = newValues (current state)
    // previousValues = oldValues (previous state)
    const results = await evaluateServiceAppointmentSMSTriggers(
      serviceAppointmentId,
      newValues || {},  // appointmentData - current values
      oldValues || {}   // previousValues - previous state
    );

    res.json({
      success: true,
      data: {
        serviceAppointmentId,
        triggersEvaluated: true,
        triggersCount: results.length,
        results,
      },
    });
  } catch (error) {
    logger.error('Error evaluating service appointment SMS triggers:', error);
    next(error);
  }
});

/**
 * POST /triggers/sms/lead-assigned
 * Send SMS to sales rep when a new inspection or retail demo is scheduled
 * Manual trigger for testing
 */
router.post('/sms/lead-assigned', async (req, res, next) => {
  try {
    const { serviceAppointmentId, userId } = req.body;

    if (!serviceAppointmentId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'serviceAppointmentId is required' },
      });
    }

    logger.info(`Manual trigger: Lead Assigned SMS for appointment ${serviceAppointmentId}`);

    const result = await onLeadAssigned(serviceAppointmentId, userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error in lead assigned SMS trigger:', error);
    next(error);
  }
});

/**
 * POST /triggers/sms/appointment-canceled
 * Send SMS when appointment status changes from Confirmed to Canceled
 * Manual trigger for testing
 */
router.post('/sms/appointment-canceled', async (req, res, next) => {
  try {
    const { opportunityId, userId } = req.body;

    if (!opportunityId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'opportunityId is required' },
      });
    }

    logger.info(`Manual trigger: Appointment Canceled SMS for opportunity ${opportunityId}`);

    const result = await onAppointmentCanceled(opportunityId, userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error in appointment canceled SMS trigger:', error);
    next(error);
  }
});

/**
 * POST /triggers/sms/workorder-in-progress
 * Send SMS to customer when work order status changes to In Progress
 * Manual trigger for testing
 */
router.post('/sms/workorder-in-progress', async (req, res, next) => {
  try {
    const { workOrderId, userId } = req.body;

    if (!workOrderId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'workOrderId is required' },
      });
    }

    logger.info(`Manual trigger: WorkOrder In Progress SMS for work order ${workOrderId}`);

    const result = await onWorkOrderInProgress(workOrderId, userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error in workorder in progress SMS trigger:', error);
    next(error);
  }
});

/**
 * POST /triggers/sms/work-completed
 * Send SMS to customer when work is completed
 * Manual trigger for testing
 */
router.post('/sms/work-completed', async (req, res, next) => {
  try {
    const { workOrderId, userId } = req.body;

    if (!workOrderId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'workOrderId is required' },
      });
    }

    logger.info(`Manual trigger: Work Completed SMS for work order ${workOrderId}`);

    const result = await onWorkCompleted(workOrderId, userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error in work completed SMS trigger:', error);
    next(error);
  }
});

/**
 * POST /triggers/sms/decking-inspection-pass
 * Send SMS to customer when decking inspection passes
 * Manual trigger for testing
 */
router.post('/sms/decking-inspection-pass', async (req, res, next) => {
  try {
    const { workOrderId, userId } = req.body;

    if (!workOrderId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'workOrderId is required' },
      });
    }

    logger.info(`Manual trigger: Decking Inspection Pass SMS for work order ${workOrderId}`);

    const result = await onDeckingInspectionPass(workOrderId, userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error in decking pass SMS trigger:', error);
    next(error);
  }
});

/**
 * POST /triggers/sms/decking-inspection-fail
 * Send SMS to customer when decking inspection fails
 * Manual trigger for testing
 */
router.post('/sms/decking-inspection-fail', async (req, res, next) => {
  try {
    const { workOrderId, userId } = req.body;

    if (!workOrderId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'workOrderId is required' },
      });
    }

    logger.info(`Manual trigger: Decking Inspection Fail SMS for work order ${workOrderId}`);

    const result = await onDeckingInspectionFail(workOrderId, userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error in decking fail SMS trigger:', error);
    next(error);
  }
});

/**
 * POST /triggers/sms/crew-lead-assigned
 * Send welcome SMS to crew lead when assigned to scheduled work order
 * Manual trigger for testing
 */
router.post('/sms/crew-lead-assigned', async (req, res, next) => {
  try {
    const { workOrderId, userId } = req.body;

    if (!workOrderId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'workOrderId is required' },
      });
    }

    logger.info(`Manual trigger: Crew Lead Welcome SMS for work order ${workOrderId}`);

    const result = await onCrewLeadAssigned(workOrderId, userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error in crew lead assigned SMS trigger:', error);
    next(error);
  }
});

// ============================================================================
// TRIGGER STATUS & TESTING
// ============================================================================

/**
 * GET /triggers/status
 * Get status of available triggers
 */
router.get('/status', async (req, res) => {
  res.json({
    success: true,
    data: {
      availableTriggers: [
        // Insurance triggers
        {
          name: 'insurance/evaluate',
          description: 'Evaluate all insurance triggers based on opportunity changes',
          events: ['adjuster_meeting_complete', 'insurance_approved', 'claim_filed'],
        },
        {
          name: 'insurance/adjuster-meeting-complete',
          description: 'Creates task, note, and contract signing appointment after adjuster meeting',
          automatedBy: 'stageName === "Adjuster Meeting Complete"',
        },
        {
          name: 'insurance/approved',
          description: 'Updates opportunity with approval data and creates activity log',
          automatedBy: 'isApproved === true || stageName === "Approved"',
        },
        {
          name: 'insurance/claim-filed',
          description: 'Updates opportunity with claim info and creates activity log',
          automatedBy: 'claimNumber set for first time',
        },
        {
          name: 'insurance/supplement-approved',
          description: 'Updates service contract supplements total and creates activity log',
          automatedBy: 'Manual trigger from supplement approval UI',
        },
        // Specs triggers
        {
          name: 'specs/evaluate',
          description: 'Evaluate specs triggers based on opportunity changes',
          events: ['specs_prepped'],
        },
        {
          name: 'specs/prepped',
          description: 'Creates WorkOrderLineItem and Contract Signing appointment when specs are prepared',
          automatedBy: 'specsPrepped === true',
          creates: ['WorkOrderLineItem', 'ServiceAppointment', 'Activity'],
        },
        // Inspection triggers
        {
          name: 'inspection-completed',
          description: 'Evaluates inspection completion when appointment status changes to COMPLETED',
          automatedBy: 'ServiceAppointment.status changes to COMPLETED (for Inspection work types)',
          creates: ['Task', 'Activity'],
          updates: ['Opportunity.stageName → INSPECTED'],
        },
        {
          name: 'inspection/manual-complete',
          description: 'Manually trigger inspection completion workflow',
          creates: ['Task', 'Activity'],
          updates: ['Opportunity.stageName → INSPECTED'],
        },
        // Contract generation triggers
        {
          name: 'contract/generate',
          description: 'Generate contract document from opportunity specs using PandaSign',
          creates: ['Agreement', 'Activity'],
          updates: ['Opportunity.status → Contract Generated'],
          requires: 'Opportunity.specsPrepped === true',
        },
        {
          name: 'contract/evaluate',
          description: 'Evaluate contract triggers (optional auto-generation when specs prepped)',
          automatedBy: 'AUTO_GENERATE_CONTRACT env var + specsPrepped === true',
        },
        // QuickBooks/Stripe sync triggers
        {
          name: 'quickbooks/account-onboarding',
          description: 'Creates QB Customer and Stripe Customer when account status changes to Onboarding',
          automatedBy: 'Account.status changes to "Onboarding"',
          creates: ['QB Customer', 'Stripe Customer', 'Activity'],
        },
        {
          name: 'quickbooks/invoice-created',
          description: 'Syncs invoice to QuickBooks and generates Stripe payment link',
          automatedBy: 'Invoice created from contract activation',
          creates: ['QB Invoice', 'Stripe Payment Link'],
        },
        {
          name: 'quickbooks/payment-received',
          description: 'Records payment in QuickBooks and updates invoice balance',
          automatedBy: 'Stripe webhook payment_intent.succeeded',
          creates: ['QB Payment'],
          updates: ['Invoice.balanceDue', 'Invoice.status'],
        },
        {
          name: 'quickbooks/evaluate-status',
          description: 'Evaluate account status changes for QB triggers',
          automatedBy: 'Account.status changes',
        },
        // SMS notification triggers (replaces Salesforce Riley SMS flows)
        {
          name: 'sms/evaluate-opportunity',
          description: 'Evaluate SMS triggers when opportunity is updated',
          automatedBy: 'Opportunity.status changes (Confirmed → Canceled)',
          sends: ['SMS to prior opportunity owner'],
        },
        {
          name: 'sms/evaluate-workorder',
          description: 'Evaluate SMS triggers when work order is updated',
          automatedBy: 'WorkOrder.status, deckingInspection, workCompleted changes',
          sends: ['SMS to customer', 'SMS to crew lead'],
        },
        {
          name: 'sms/evaluate-service-appointment',
          description: 'Evaluate SMS triggers when service appointment is created/updated',
          automatedBy: 'ServiceAppointment created with Inspection/Retail Demo subject',
          sends: ['SMS to opportunity owner (sales rep)'],
        },
        {
          name: 'sms/lead-assigned',
          description: 'Send SMS to sales rep when Inspection or Retail Demo is scheduled',
          automatedBy: 'ServiceAppointment created with matching subject',
          message: 'New Lead Assigned: {Opp Name} for {Date} at {Address}',
        },
        {
          name: 'sms/appointment-canceled',
          description: 'Send SMS when appointment is canceled',
          automatedBy: 'Opportunity.status Confirmed → Canceled',
          message: 'CANCELED: {Customer Name} for {Opp Name}. Please reach out ASAP.',
        },
        {
          name: 'sms/workorder-in-progress',
          description: 'Send SMS to customer when crew arrives',
          automatedBy: 'WorkOrder.status → In Progress',
          message: 'Hello this is {PM Name} with Panda Exteriors. The crew has arrived...',
        },
        {
          name: 'sms/work-completed',
          description: 'Send SMS to customer when work is completed',
          automatedBy: 'WorkOrder.workCompleted → Yes',
          message: 'Congratulations! Your roofing project has been completed...',
        },
        {
          name: 'sms/decking-inspection-pass',
          description: 'Send SMS when decking inspection passes',
          automatedBy: 'WorkOrder.deckingInspection → Pass',
          message: 'Update: The decking inspection has passed and crew is moving forward...',
        },
        {
          name: 'sms/decking-inspection-fail',
          description: 'Send SMS when decking inspection fails',
          automatedBy: 'WorkOrder.deckingInspection → Fail',
          message: 'Update: The decking inspection has failed. We will send a photo report...',
        },
        {
          name: 'sms/crew-lead-assigned',
          description: 'Send welcome SMS to crew lead (in Spanish)',
          automatedBy: 'WorkOrder.crewLeadId changes AND status = Scheduled',
          message: 'Buenos Dias Porfavor hay que verificar las instrucciones y el Material...',
        },
      ],
      status: 'active',
    },
  });
});

// ============================================================================
// SKILL TRIGGERS
// Add skill requirements to work orders based on opportunity trade fields
// Replicates Salesforce's Trigger_Add_Skill_to_Work_Order flow
// ============================================================================

/**
 * POST /triggers/skills/work-order-created
 * Add skill requirements when a work order is created
 * Called by workOrderService when work order is created
 */
router.post('/skills/work-order-created', async (req, res, next) => {
  try {
    const { workOrderId } = req.body;

    if (!workOrderId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'workOrderId is required' },
      });
    }

    logger.info(`Skill trigger: Work Order Created ${workOrderId}`);

    const result = await onWorkOrderCreated(workOrderId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error in work order created skill trigger:', error);
    next(error);
  }
});

/**
 * POST /triggers/skills/opportunity-trades-updated
 * Update skill requirements on work orders when opportunity trade fields change
 * Called by opportunityService when trade checkboxes are updated
 */
router.post('/skills/opportunity-trades-updated', async (req, res, next) => {
  try {
    const { opportunityId, updatedTradeFields } = req.body;

    if (!opportunityId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'opportunityId is required' },
      });
    }

    logger.info(`Skill trigger: Opportunity Trades Updated ${opportunityId}`, { updatedTradeFields });

    const result = await onOpportunityTradesUpdated(opportunityId, updatedTradeFields);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error in opportunity trades updated skill trigger:', error);
    next(error);
  }
});

/**
 * POST /triggers/skills/add
 * Manually add skill requirements to a work order from its opportunity
 */
router.post('/skills/add', async (req, res, next) => {
  try {
    const { workOrderId, opportunityId } = req.body;

    if (!workOrderId || !opportunityId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'workOrderId and opportunityId are required' },
      });
    }

    logger.info(`Manual skill add: WorkOrder ${workOrderId}, Opportunity ${opportunityId}`);

    const result = await addSkillRequirementsFromOpportunity(workOrderId, opportunityId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error adding skill requirements:', error);
    next(error);
  }
});

/**
 * DELETE /triggers/skills/:workOrderId/:skillName
 * Remove a specific skill requirement from a work order
 */
router.delete('/skills/:workOrderId/:skillName', async (req, res, next) => {
  try {
    const { workOrderId, skillName } = req.params;

    logger.info(`Remove skill: ${skillName} from WorkOrder ${workOrderId}`);

    const result = await removeSkillRequirement(workOrderId, skillName);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error removing skill requirement:', error);
    next(error);
  }
});

/**
 * GET /triggers/skills/:workOrderId
 * Get skill requirements for a work order
 */
router.get('/skills/:workOrderId', async (req, res, next) => {
  try {
    const { workOrderId } = req.params;

    const requirements = await getWorkOrderSkillRequirements(workOrderId);

    res.json({
      success: true,
      data: {
        workOrderId,
        requirements,
        count: requirements.length,
      },
    });
  } catch (error) {
    logger.error('Error getting skill requirements:', error);
    next(error);
  }
});

/**
 * GET /triggers/skills/mapping
 * Get the trade-to-skill mapping configuration
 */
router.get('/skills/mapping', (req, res) => {
  res.json({
    success: true,
    data: {
      tradeToSkillMap: TRADE_TO_SKILL_MAP,
      description: 'Maps opportunity trade checkbox fields to skill names for work order skill requirements',
    },
  });
});

// ============================================================================
// PROJECT EXPEDITING TRIGGERS
// These endpoints are called when expediting fields change on opportunities
// ============================================================================

/**
 * POST /triggers/expediting/evaluate
 * Evaluate all expediting triggers based on opportunity changes
 * Called by opportunityService when expediting-related fields are updated
 */
router.post('/expediting/evaluate', async (req, res, next) => {
  try {
    const { opportunityId, changes, previousValues, userId } = req.body;

    if (!opportunityId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'opportunityId is required' },
      });
    }

    logger.info(`Evaluating expediting triggers for opportunity ${opportunityId}`, { changes });

    const results = await evaluateExpeditingTriggers(opportunityId, changes || {}, previousValues || {}, userId);

    res.json({
      success: true,
      data: {
        opportunityId,
        triggersEvaluated: true,
        results,
      },
    });
  } catch (error) {
    logger.error('Error evaluating expediting triggers:', error);
    next(error);
  }
});

/**
 * POST /triggers/expediting/flat-roof
 * Manually trigger the flat roof workflow
 * Creates case for Trevor Johnson (flat roof specialist)
 */
router.post('/expediting/flat-roof', async (req, res, next) => {
  try {
    const { opportunityId, userId } = req.body;

    if (!opportunityId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'opportunityId is required' },
      });
    }

    logger.info(`Manual trigger: Flat Roof Detected for ${opportunityId}`);

    const result = await onFlatRoofDetected(opportunityId, userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error in flat roof trigger:', error);
    next(error);
  }
});

/**
 * POST /triggers/expediting/line-drop
 * Manually trigger the line drop workflow
 * Creates case for Kevin Flores + sends SMS to homeowner
 */
router.post('/expediting/line-drop', async (req, res, next) => {
  try {
    const { opportunityId, userId } = req.body;

    if (!opportunityId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'opportunityId is required' },
      });
    }

    logger.info(`Manual trigger: Line Drop Required for ${opportunityId}`);

    const result = await onLineDropRequired(opportunityId, userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error in line drop trigger:', error);
    next(error);
  }
});

/**
 * POST /triggers/expediting/supplement-hold
 * Manually trigger the supplement holds job workflow
 * Sets notInstallReady when supplement holds job
 */
router.post('/expediting/supplement-hold', async (req, res, next) => {
  try {
    const { opportunityId, userId } = req.body;

    if (!opportunityId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'opportunityId is required' },
      });
    }

    logger.info(`Manual trigger: Supplement Holds Job for ${opportunityId}`);

    const result = await onSupplementHoldsJob(opportunityId, userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error in supplement hold trigger:', error);
    next(error);
  }
});

export default router;
