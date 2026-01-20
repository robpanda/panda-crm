// Setup Routes - Object Manager & Custom Fields
import { Router } from 'express';
import { setupService } from '../services/setupService.js';

const router = Router();

// Object Definitions (static metadata)
const OBJECT_DEFINITIONS = {
  leads: {
    id: 'leads',
    name: 'Leads',
    apiName: 'Lead',
    tableName: 'leads',
    description: 'Potential customers before qualification',
    standardFields: [
      { name: 'ID', apiName: 'id', type: 'TEXT', required: true, system: true },
      { name: 'First Name', apiName: 'firstName', type: 'TEXT', required: true },
      { name: 'Last Name', apiName: 'lastName', type: 'TEXT', required: true },
      { name: 'Email', apiName: 'email', type: 'EMAIL' },
      { name: 'Phone', apiName: 'phone', type: 'PHONE' },
      { name: 'Mobile Phone', apiName: 'mobilePhone', type: 'PHONE' },
      { name: 'Company', apiName: 'company', type: 'TEXT' },
      { name: 'Status', apiName: 'status', type: 'PICKLIST' },
      { name: 'Source', apiName: 'source', type: 'PICKLIST' },
      { name: 'Lead Score', apiName: 'leadScore', type: 'NUMBER' },
      { name: 'Street', apiName: 'street', type: 'TEXTAREA' },
      { name: 'City', apiName: 'city', type: 'TEXT' },
      { name: 'State', apiName: 'state', type: 'TEXT' },
      { name: 'Postal Code', apiName: 'postalCode', type: 'TEXT' },
      { name: 'Owner', apiName: 'ownerId', type: 'LOOKUP' },
      { name: 'Created At', apiName: 'createdAt', type: 'DATETIME', system: true },
      { name: 'Updated At', apiName: 'updatedAt', type: 'DATETIME', system: true },
    ],
  },
  contacts: {
    id: 'contacts',
    name: 'Contacts',
    apiName: 'Contact',
    tableName: 'contacts',
    description: 'People associated with accounts',
    standardFields: [
      { name: 'ID', apiName: 'id', type: 'TEXT', required: true, system: true },
      { name: 'First Name', apiName: 'firstName', type: 'TEXT', required: true },
      { name: 'Last Name', apiName: 'lastName', type: 'TEXT', required: true },
      { name: 'Email', apiName: 'email', type: 'EMAIL' },
      { name: 'Phone', apiName: 'phone', type: 'PHONE' },
      { name: 'Mobile Phone', apiName: 'mobilePhone', type: 'PHONE' },
      { name: 'Account', apiName: 'accountId', type: 'LOOKUP' },
      { name: 'Title', apiName: 'title', type: 'TEXT' },
      { name: 'Department', apiName: 'department', type: 'TEXT' },
      { name: 'Mailing Street', apiName: 'mailingStreet', type: 'TEXTAREA' },
      { name: 'Mailing City', apiName: 'mailingCity', type: 'TEXT' },
      { name: 'Mailing State', apiName: 'mailingState', type: 'TEXT' },
      { name: 'Mailing Postal Code', apiName: 'mailingPostalCode', type: 'TEXT' },
      { name: 'Is Primary', apiName: 'isPrimary', type: 'CHECKBOX' },
      { name: 'Created At', apiName: 'createdAt', type: 'DATETIME', system: true },
      { name: 'Updated At', apiName: 'updatedAt', type: 'DATETIME', system: true },
    ],
  },
  accounts: {
    id: 'accounts',
    name: 'Accounts',
    apiName: 'Account',
    tableName: 'accounts',
    description: 'Customer and prospect organizations',
    standardFields: [
      { name: 'ID', apiName: 'id', type: 'TEXT', required: true, system: true },
      { name: 'Name', apiName: 'name', type: 'TEXT', required: true },
      { name: 'Account Number', apiName: 'accountNumber', type: 'TEXT', unique: true },
      { name: 'Type', apiName: 'type', type: 'PICKLIST' },
      { name: 'Status', apiName: 'status', type: 'PICKLIST' },
      { name: 'Phone', apiName: 'phone', type: 'PHONE' },
      { name: 'Email', apiName: 'email', type: 'EMAIL' },
      { name: 'Website', apiName: 'website', type: 'URL' },
      { name: 'Billing Street', apiName: 'billingStreet', type: 'TEXTAREA' },
      { name: 'Billing City', apiName: 'billingCity', type: 'TEXT' },
      { name: 'Billing State', apiName: 'billingState', type: 'TEXT' },
      { name: 'Billing Postal Code', apiName: 'billingPostalCode', type: 'TEXT' },
      { name: 'Owner', apiName: 'ownerId', type: 'LOOKUP' },
      { name: 'Total Sales Volume', apiName: 'totalSalesVolume', type: 'CURRENCY' },
      { name: 'Total Contract Value', apiName: 'totalContractValue', type: 'CURRENCY' },
      { name: 'Created At', apiName: 'createdAt', type: 'DATETIME', system: true },
      { name: 'Updated At', apiName: 'updatedAt', type: 'DATETIME', system: true },
    ],
  },
  opportunities: {
    id: 'opportunities',
    name: 'Opportunities (Jobs)',
    apiName: 'Opportunity',
    tableName: 'opportunities',
    description: 'Sales deals and projects',
    standardFields: [
      { name: 'ID', apiName: 'id', type: 'TEXT', required: true, system: true },
      { name: 'Name', apiName: 'name', type: 'TEXT', required: true },
      { name: 'Job ID', apiName: 'jobId', type: 'TEXT', unique: true },
      { name: 'Stage', apiName: 'stage', type: 'PICKLIST', required: true },
      { name: 'Amount', apiName: 'amount', type: 'CURRENCY' },
      { name: 'Close Date', apiName: 'closeDate', type: 'DATE' },
      { name: 'Account', apiName: 'accountId', type: 'LOOKUP' },
      { name: 'Contact', apiName: 'contactId', type: 'LOOKUP' },
      { name: 'Owner', apiName: 'ownerId', type: 'LOOKUP' },
      { name: 'Work Type', apiName: 'workType', type: 'PICKLIST' },
      { name: 'Probability', apiName: 'probability', type: 'PERCENT' },
      { name: 'Description', apiName: 'description', type: 'TEXTAREA' },
      { name: 'Created At', apiName: 'createdAt', type: 'DATETIME', system: true },
      { name: 'Updated At', apiName: 'updatedAt', type: 'DATETIME', system: true },
    ],
  },
  workorders: {
    id: 'workorders',
    name: 'Work Orders',
    apiName: 'WorkOrder',
    tableName: 'work_orders',
    description: 'Field service work orders',
    standardFields: [
      { name: 'ID', apiName: 'id', type: 'TEXT', required: true, system: true },
      { name: 'Work Order Number', apiName: 'workOrderNumber', type: 'TEXT', unique: true },
      { name: 'Subject', apiName: 'subject', type: 'TEXT', required: true },
      { name: 'Status', apiName: 'status', type: 'PICKLIST' },
      { name: 'Priority', apiName: 'priority', type: 'PICKLIST' },
      { name: 'Description', apiName: 'description', type: 'TEXTAREA' },
      { name: 'Opportunity', apiName: 'opportunityId', type: 'LOOKUP' },
      { name: 'Account', apiName: 'accountId', type: 'LOOKUP' },
      { name: 'Work Type', apiName: 'workTypeId', type: 'LOOKUP' },
      { name: 'Created At', apiName: 'createdAt', type: 'DATETIME', system: true },
      { name: 'Updated At', apiName: 'updatedAt', type: 'DATETIME', system: true },
    ],
  },
  quotes: {
    id: 'quotes',
    name: 'Quotes',
    apiName: 'Quote',
    tableName: 'quotes',
    description: 'Price quotes and proposals',
    standardFields: [
      { name: 'ID', apiName: 'id', type: 'TEXT', required: true, system: true },
      { name: 'Quote Number', apiName: 'quoteNumber', type: 'TEXT', unique: true },
      { name: 'Name', apiName: 'name', type: 'TEXT', required: true },
      { name: 'Status', apiName: 'status', type: 'PICKLIST' },
      { name: 'Total Amount', apiName: 'totalAmount', type: 'CURRENCY' },
      { name: 'Discount', apiName: 'discount', type: 'CURRENCY' },
      { name: 'Grand Total', apiName: 'grandTotal', type: 'CURRENCY' },
      { name: 'Opportunity', apiName: 'opportunityId', type: 'LOOKUP' },
      { name: 'Expiration Date', apiName: 'expirationDate', type: 'DATE' },
      { name: 'Created At', apiName: 'createdAt', type: 'DATETIME', system: true },
      { name: 'Updated At', apiName: 'updatedAt', type: 'DATETIME', system: true },
    ],
  },
  invoices: {
    id: 'invoices',
    name: 'Invoices',
    apiName: 'Invoice',
    tableName: 'invoices',
    description: 'Customer invoices and billing',
    standardFields: [
      { name: 'ID', apiName: 'id', type: 'TEXT', required: true, system: true },
      { name: 'Invoice Number', apiName: 'invoiceNumber', type: 'TEXT', unique: true },
      { name: 'Status', apiName: 'status', type: 'PICKLIST' },
      { name: 'Total Amount', apiName: 'totalAmount', type: 'CURRENCY' },
      { name: 'Balance Due', apiName: 'balanceDue', type: 'CURRENCY' },
      { name: 'Due Date', apiName: 'dueDate', type: 'DATE' },
      { name: 'Account', apiName: 'accountId', type: 'LOOKUP' },
      { name: 'Opportunity', apiName: 'opportunityId', type: 'LOOKUP' },
      { name: 'Created At', apiName: 'createdAt', type: 'DATETIME', system: true },
      { name: 'Updated At', apiName: 'updatedAt', type: 'DATETIME', system: true },
    ],
  },
  cases: {
    id: 'cases',
    name: 'Cases',
    apiName: 'Case',
    tableName: 'cases',
    description: 'Customer service cases',
    standardFields: [
      { name: 'ID', apiName: 'id', type: 'TEXT', required: true, system: true },
      { name: 'Case Number', apiName: 'caseNumber', type: 'TEXT', unique: true },
      { name: 'Subject', apiName: 'subject', type: 'TEXT', required: true },
      { name: 'Status', apiName: 'status', type: 'PICKLIST' },
      { name: 'Priority', apiName: 'priority', type: 'PICKLIST' },
      { name: 'Type', apiName: 'type', type: 'PICKLIST' },
      { name: 'Description', apiName: 'description', type: 'TEXTAREA' },
      { name: 'Account', apiName: 'accountId', type: 'LOOKUP' },
      { name: 'Contact', apiName: 'contactId', type: 'LOOKUP' },
      { name: 'Owner', apiName: 'ownerId', type: 'LOOKUP' },
      { name: 'Created At', apiName: 'createdAt', type: 'DATETIME', system: true },
      { name: 'Updated At', apiName: 'updatedAt', type: 'DATETIME', system: true },
    ],
  },
  products: {
    id: 'products',
    name: 'Products',
    apiName: 'Product',
    tableName: 'products',
    description: 'Products and services catalog',
    standardFields: [
      { name: 'ID', apiName: 'id', type: 'TEXT', required: true, system: true },
      { name: 'Name', apiName: 'name', type: 'TEXT', required: true },
      { name: 'Product Code', apiName: 'productCode', type: 'TEXT', unique: true },
      { name: 'Description', apiName: 'description', type: 'TEXTAREA' },
      { name: 'Unit Price', apiName: 'unitPrice', type: 'CURRENCY' },
      { name: 'Is Active', apiName: 'isActive', type: 'CHECKBOX' },
      { name: 'Product Family', apiName: 'family', type: 'PICKLIST' },
      { name: 'Created At', apiName: 'createdAt', type: 'DATETIME', system: true },
      { name: 'Updated At', apiName: 'updatedAt', type: 'DATETIME', system: true },
    ],
  },
  campaigns: {
    id: 'campaigns',
    name: 'Campaigns',
    apiName: 'Campaign',
    tableName: 'campaigns',
    description: 'Marketing campaigns',
    standardFields: [
      { name: 'ID', apiName: 'id', type: 'TEXT', required: true, system: true },
      { name: 'Name', apiName: 'name', type: 'TEXT', required: true },
      { name: 'Type', apiName: 'type', type: 'PICKLIST' },
      { name: 'Status', apiName: 'status', type: 'PICKLIST' },
      { name: 'Channel', apiName: 'channel', type: 'PICKLIST' },
      { name: 'Start Date', apiName: 'startDate', type: 'DATE' },
      { name: 'End Date', apiName: 'endDate', type: 'DATE' },
      { name: 'Budget', apiName: 'budgetedCost', type: 'CURRENCY' },
      { name: 'Created At', apiName: 'createdAt', type: 'DATETIME', system: true },
      { name: 'Updated At', apiName: 'updatedAt', type: 'DATETIME', system: true },
    ],
  },
};

// ============================================================================
// OBJECT ROUTES
// ============================================================================

/**
 * GET /setup/objects
 * List all available objects
 */
router.get('/objects', async (req, res, next) => {
  try {
    const objects = Object.values(OBJECT_DEFINITIONS).map(obj => ({
      id: obj.id,
      name: obj.name,
      apiName: obj.apiName,
      description: obj.description,
    }));
    res.json({ success: true, data: objects });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /setup/objects/:objectId
 * Get object details
 */
router.get('/objects/:objectId', async (req, res, next) => {
  try {
    const { objectId } = req.params;
    const objectDef = OBJECT_DEFINITIONS[objectId];

    if (!objectDef) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Object ${objectId} not found` },
      });
    }

    res.json({ success: true, data: objectDef });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /setup/objects/:objectId/fields
 * Get all fields for an object (standard + custom)
 */
router.get('/objects/:objectId/fields', async (req, res, next) => {
  try {
    const { objectId } = req.params;
    const objectDef = OBJECT_DEFINITIONS[objectId];

    if (!objectDef) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Object ${objectId} not found` },
      });
    }

    // Get custom fields from database
    const customFields = await setupService.getCustomFields(objectId);

    res.json({
      success: true,
      standardFields: objectDef.standardFields,
      customFields: customFields,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// CUSTOM FIELD ROUTES
// ============================================================================

/**
 * POST /setup/objects/:objectId/fields
 * Create a new custom field
 */
router.post('/objects/:objectId/fields', async (req, res, next) => {
  try {
    const { objectId } = req.params;
    const objectDef = OBJECT_DEFINITIONS[objectId];

    if (!objectDef) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Object ${objectId} not found` },
      });
    }

    const field = await setupService.createCustomField(objectId, req.body, req.user?.id);
    res.status(201).json({ success: true, data: field });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({
        success: false,
        error: { code: 'DUPLICATE', message: 'A field with this API name already exists' },
      });
    }
    next(error);
  }
});

/**
 * PUT /setup/objects/:objectId/fields/:fieldId
 * Update a custom field
 */
router.put('/objects/:objectId/fields/:fieldId', async (req, res, next) => {
  try {
    const { objectId, fieldId } = req.params;

    const field = await setupService.updateCustomField(objectId, fieldId, req.body);
    res.json({ success: true, data: field });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /setup/objects/:objectId/fields/:fieldId
 * Delete a custom field
 */
router.delete('/objects/:objectId/fields/:fieldId', async (req, res, next) => {
  try {
    const { objectId, fieldId } = req.params;

    await setupService.deleteCustomField(objectId, fieldId);
    res.json({ success: true, message: 'Field deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// PICKLIST VALUES ROUTES
// ============================================================================

/**
 * GET /setup/objects/:objectId/fields/:fieldApiName/picklist
 * Get picklist values for a field
 */
router.get('/objects/:objectId/fields/:fieldApiName/picklist', async (req, res, next) => {
  try {
    const { objectId, fieldApiName } = req.params;

    const values = await setupService.getPicklistValues(objectId, fieldApiName);
    res.json({ success: true, data: values });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /setup/objects/:objectId/fields/:fieldApiName/picklist
 * Update picklist values
 */
router.put('/objects/:objectId/fields/:fieldApiName/picklist', async (req, res, next) => {
  try {
    const { objectId, fieldApiName } = req.params;
    const { values } = req.body;

    const field = await setupService.updatePicklistValues(objectId, fieldApiName, values);
    res.json({ success: true, data: field });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// VALIDATION RULE ROUTES
// ============================================================================

/**
 * GET /setup/objects/:objectId/validation-rules
 * Get all validation rules for an object
 */
router.get('/objects/:objectId/validation-rules', async (req, res, next) => {
  try {
    const { objectId } = req.params;

    const rules = await setupService.getValidationRules(objectId);
    res.json({ success: true, data: rules });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /setup/objects/:objectId/validation-rules
 * Create a new validation rule
 */
router.post('/objects/:objectId/validation-rules', async (req, res, next) => {
  try {
    const { objectId } = req.params;

    const rule = await setupService.createValidationRule(objectId, req.body, req.user?.id);
    res.status(201).json({ success: true, data: rule });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /setup/objects/:objectId/validation-rules/:ruleId
 * Update a validation rule
 */
router.put('/objects/:objectId/validation-rules/:ruleId', async (req, res, next) => {
  try {
    const { objectId, ruleId } = req.params;

    const rule = await setupService.updateValidationRule(objectId, ruleId, req.body);
    res.json({ success: true, data: rule });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /setup/objects/:objectId/validation-rules/:ruleId
 * Delete a validation rule
 */
router.delete('/objects/:objectId/validation-rules/:ruleId', async (req, res, next) => {
  try {
    const { objectId, ruleId } = req.params;

    await setupService.deleteValidationRule(objectId, ruleId);
    res.json({ success: true, message: 'Validation rule deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// PAGE LAYOUT ROUTES
// ============================================================================

/**
 * GET /setup/objects/:objectId/layouts
 * Get all page layouts for an object
 */
router.get('/objects/:objectId/layouts', async (req, res, next) => {
  try {
    const { objectId } = req.params;

    const layouts = await setupService.getPageLayouts(objectId);
    res.json({ success: true, data: layouts });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /setup/objects/:objectId/layouts/:layoutId
 * Update a page layout
 */
router.put('/objects/:objectId/layouts/:layoutId', async (req, res, next) => {
  try {
    const { objectId, layoutId } = req.params;

    const layout = await setupService.updatePageLayout(objectId, layoutId, req.body);
    res.json({ success: true, data: layout });
  } catch (error) {
    next(error);
  }
});

export default router;
