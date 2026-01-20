// Module Metadata Service
// Defines all modules (formerly "objects") and their fields, relationships, and capabilities
// This enables cross-module reporting with intelligent joins

export const MODULES = {
  leads: {
    name: 'Leads',
    singularName: 'Lead',
    tableName: 'leads',
    primaryKey: 'id',
    icon: 'users',
    description: 'Prospective customers before conversion',
    fields: {
      id: { type: 'string', label: 'Lead ID', filterable: true, sortable: true },
      firstName: { type: 'string', label: 'First Name', filterable: true, sortable: true, searchable: true },
      lastName: { type: 'string', label: 'Last Name', filterable: true, sortable: true, searchable: true },
      company: { type: 'string', label: 'Company', filterable: true, sortable: true, searchable: true },
      email: { type: 'string', label: 'Email', filterable: true, sortable: true, searchable: true },
      phone: { type: 'string', label: 'Phone', filterable: true, searchable: true },
      mobilePhone: { type: 'string', label: 'Mobile Phone', filterable: true },
      street: { type: 'string', label: 'Street', filterable: true },
      city: { type: 'string', label: 'City', filterable: true, sortable: true, groupable: true },
      state: { type: 'string', label: 'State', filterable: true, sortable: true, groupable: true },
      postalCode: { type: 'string', label: 'Postal Code', filterable: true },
      status: { type: 'enum', label: 'Status', filterable: true, sortable: true, groupable: true, enumValues: ['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'NURTURING'] },
      source: { type: 'string', label: 'Lead Source', filterable: true, sortable: true, groupable: true },
      rating: { type: 'enum', label: 'Rating', filterable: true, sortable: true, groupable: true, enumValues: ['HOT', 'WARM', 'COLD'] },
      score: { type: 'number', label: 'Lead Score', filterable: true, sortable: true, aggregatable: true },
      isConverted: { type: 'boolean', label: 'Converted', filterable: true, groupable: true },
      convertedDate: { type: 'date', label: 'Converted Date', filterable: true, sortable: true },
      ownerId: { type: 'relation', label: 'Owner', relation: 'users', filterable: true, groupable: true },
      createdAt: { type: 'datetime', label: 'Created Date', filterable: true, sortable: true, defaultDateField: true },
      updatedAt: { type: 'datetime', label: 'Last Modified', filterable: true, sortable: true },
      workType: { type: 'string', label: 'Work Type', filterable: true, sortable: true, groupable: true },
      propertyType: { type: 'string', label: 'Property Type', filterable: true, sortable: true, groupable: true },
    },
    relationships: {
      owner: { module: 'users', type: 'belongsTo', foreignKey: 'ownerId', label: 'Lead Owner' },
      convertedOpportunity: { module: 'jobs', type: 'hasOne', foreignKey: 'convertedOpportunityId', label: 'Converted Job' },
      convertedAccount: { module: 'accounts', type: 'hasOne', foreignKey: 'convertedAccountId', label: 'Converted Account' },
      convertedContact: { module: 'contacts', type: 'hasOne', foreignKey: 'convertedContactId', label: 'Converted Contact' },
    },
    metrics: {
      count: { label: 'Total Leads', aggregation: 'count' },
      converted: { label: 'Converted Leads', aggregation: 'count', filter: { isConverted: true } },
      conversionRate: { label: 'Conversion Rate', aggregation: 'percentage', numerator: 'converted', denominator: 'count' },
      avgScore: { label: 'Average Score', aggregation: 'avg', field: 'score' },
    },
  },

  accounts: {
    name: 'Accounts',
    singularName: 'Account',
    tableName: 'accounts',
    primaryKey: 'id',
    icon: 'building',
    description: 'Customer accounts and properties',
    fields: {
      id: { type: 'string', label: 'Account ID', filterable: true, sortable: true },
      name: { type: 'string', label: 'Account Name', filterable: true, sortable: true, searchable: true },
      accountNumber: { type: 'string', label: 'Account Number', filterable: true, sortable: true },
      phone: { type: 'string', label: 'Phone', filterable: true, searchable: true },
      email: { type: 'string', label: 'Email', filterable: true, searchable: true },
      website: { type: 'string', label: 'Website', filterable: true },
      type: { type: 'enum', label: 'Account Type', filterable: true, sortable: true, groupable: true, enumValues: ['RESIDENTIAL', 'COMMERCIAL', 'PROPERTY_MANAGEMENT'] },
      status: { type: 'enum', label: 'Status', filterable: true, sortable: true, groupable: true, enumValues: ['PROSPECT', 'ACTIVE', 'INACTIVE', 'CLOSED'] },
      billingStreet: { type: 'string', label: 'Billing Street', filterable: true },
      billingCity: { type: 'string', label: 'Billing City', filterable: true, sortable: true, groupable: true },
      billingState: { type: 'string', label: 'Billing State', filterable: true, sortable: true, groupable: true },
      billingPostalCode: { type: 'string', label: 'Billing Postal Code', filterable: true },
      totalSalesVolume: { type: 'currency', label: 'Total Sales Volume', filterable: true, sortable: true, aggregatable: true },
      totalPaidAmount: { type: 'currency', label: 'Total Paid', filterable: true, sortable: true, aggregatable: true },
      totalBalanceAmount: { type: 'currency', label: 'Balance Due', filterable: true, sortable: true, aggregatable: true },
      ownerId: { type: 'relation', label: 'Owner', relation: 'users', filterable: true, groupable: true },
      createdAt: { type: 'datetime', label: 'Created Date', filterable: true, sortable: true, defaultDateField: true },
      updatedAt: { type: 'datetime', label: 'Last Modified', filterable: true, sortable: true },
    },
    relationships: {
      owner: { module: 'users', type: 'belongsTo', foreignKey: 'ownerId', label: 'Account Owner' },
      contacts: { module: 'contacts', type: 'hasMany', foreignKey: 'accountId', label: 'Contacts' },
      opportunities: { module: 'jobs', type: 'hasMany', foreignKey: 'accountId', label: 'Jobs' },
      invoices: { module: 'invoices', type: 'hasMany', foreignKey: 'accountId', label: 'Invoices' },
    },
    metrics: {
      count: { label: 'Total Accounts', aggregation: 'count' },
      totalRevenue: { label: 'Total Revenue', aggregation: 'sum', field: 'totalSalesVolume' },
      avgRevenue: { label: 'Avg Revenue per Account', aggregation: 'avg', field: 'totalSalesVolume' },
      totalBalance: { label: 'Total Outstanding', aggregation: 'sum', field: 'totalBalanceAmount' },
    },
  },

  contacts: {
    name: 'Contacts',
    singularName: 'Contact',
    tableName: 'contacts',
    primaryKey: 'id',
    icon: 'user',
    description: 'Individual people associated with accounts',
    fields: {
      id: { type: 'string', label: 'Contact ID', filterable: true, sortable: true },
      firstName: { type: 'string', label: 'First Name', filterable: true, sortable: true, searchable: true },
      lastName: { type: 'string', label: 'Last Name', filterable: true, sortable: true, searchable: true },
      fullName: { type: 'string', label: 'Full Name', filterable: true, sortable: true, searchable: true },
      email: { type: 'string', label: 'Email', filterable: true, sortable: true, searchable: true },
      phone: { type: 'string', label: 'Phone', filterable: true, searchable: true },
      mobilePhone: { type: 'string', label: 'Mobile Phone', filterable: true },
      title: { type: 'string', label: 'Title', filterable: true, sortable: true },
      department: { type: 'string', label: 'Department', filterable: true, sortable: true, groupable: true },
      mailingCity: { type: 'string', label: 'City', filterable: true, sortable: true, groupable: true },
      mailingState: { type: 'string', label: 'State', filterable: true, sortable: true, groupable: true },
      smsOptOut: { type: 'boolean', label: 'SMS Opt-Out', filterable: true, groupable: true },
      emailOptOut: { type: 'boolean', label: 'Email Opt-Out', filterable: true, groupable: true },
      doNotCall: { type: 'boolean', label: 'Do Not Call', filterable: true, groupable: true },
      isPrimary: { type: 'boolean', label: 'Primary Contact', filterable: true, groupable: true },
      accountId: { type: 'relation', label: 'Account', relation: 'accounts', filterable: true },
      createdAt: { type: 'datetime', label: 'Created Date', filterable: true, sortable: true, defaultDateField: true },
      updatedAt: { type: 'datetime', label: 'Last Modified', filterable: true, sortable: true },
    },
    relationships: {
      account: { module: 'accounts', type: 'belongsTo', foreignKey: 'accountId', label: 'Account' },
      opportunities: { module: 'jobs', type: 'hasMany', through: 'account', label: 'Jobs' },
    },
    metrics: {
      count: { label: 'Total Contacts', aggregation: 'count' },
      withEmail: { label: 'With Email', aggregation: 'count', filter: { email: { not: null } } },
      withPhone: { label: 'With Phone', aggregation: 'count', filter: { phone: { not: null } } },
      optedOut: { label: 'Opted Out (Any)', aggregation: 'count', filter: { OR: [{ smsOptOut: true }, { emailOptOut: true }] } },
    },
  },

  jobs: {
    name: 'Jobs',
    singularName: 'Job',
    tableName: 'opportunities',
    primaryKey: 'id',
    icon: 'briefcase',
    description: 'Sales opportunities and projects',
    fields: {
      id: { type: 'string', label: 'Job ID', filterable: true, sortable: true },
      jobId: { type: 'string', label: 'Job Number', filterable: true, sortable: true, searchable: true },
      name: { type: 'string', label: 'Job Name', filterable: true, sortable: true, searchable: true },
      description: { type: 'string', label: 'Description', searchable: true },
      stage: { type: 'enum', label: 'Stage', filterable: true, sortable: true, groupable: true, enumValues: ['LEAD_UNASSIGNED', 'LEAD_ASSIGNED', 'SCHEDULED', 'INSPECTED', 'CLAIM_FILED', 'ADJUSTER_MEETING_COMPLETE', 'APPROVED', 'CONTRACT_SIGNED', 'IN_PRODUCTION', 'COMPLETED', 'CLOSED_WON', 'CLOSED_LOST'] },
      status: { type: 'string', label: 'Status', filterable: true, sortable: true, groupable: true },
      priority: { type: 'enum', label: 'Priority', filterable: true, sortable: true, groupable: true, enumValues: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] },
      probability: { type: 'number', label: 'Probability %', filterable: true, sortable: true, aggregatable: true },
      amount: { type: 'currency', label: 'Amount', filterable: true, sortable: true, aggregatable: true },
      contractTotal: { type: 'currency', label: 'Contract Total', filterable: true, sortable: true, aggregatable: true },
      type: { type: 'string', label: 'Work Type', filterable: true, sortable: true, groupable: true },
      state: { type: 'string', label: 'State', filterable: true, sortable: true, groupable: true },
      office: { type: 'string', label: 'Office', filterable: true, sortable: true, groupable: true },
      closeDate: { type: 'date', label: 'Close Date', filterable: true, sortable: true },
      appointmentDate: { type: 'datetime', label: 'Appointment Date', filterable: true, sortable: true },
      soldDate: { type: 'date', label: 'Sold Date', filterable: true, sortable: true },
      isSelfGen: { type: 'boolean', label: 'Self-Gen', filterable: true, groupable: true },
      isPandaClaims: { type: 'boolean', label: 'Panda Claims', filterable: true, groupable: true },
      accountId: { type: 'relation', label: 'Account', relation: 'accounts', filterable: true },
      ownerId: { type: 'relation', label: 'Owner', relation: 'users', filterable: true, groupable: true },
      createdAt: { type: 'datetime', label: 'Created Date', filterable: true, sortable: true, defaultDateField: true },
      updatedAt: { type: 'datetime', label: 'Last Modified', filterable: true, sortable: true },
    },
    relationships: {
      owner: { module: 'users', type: 'belongsTo', foreignKey: 'ownerId', label: 'Job Owner' },
      account: { module: 'accounts', type: 'belongsTo', foreignKey: 'accountId', label: 'Account' },
      contacts: { module: 'contacts', type: 'hasMany', through: 'account', label: 'Contacts' },
      workOrders: { module: 'workOrders', type: 'hasMany', foreignKey: 'opportunityId', label: 'Work Orders' },
      quotes: { module: 'quotes', type: 'hasMany', foreignKey: 'opportunityId', label: 'Quotes' },
      invoices: { module: 'invoices', type: 'hasMany', foreignKey: 'opportunityId', label: 'Invoices' },
      commissions: { module: 'commissions', type: 'hasMany', foreignKey: 'opportunityId', label: 'Commissions' },
    },
    metrics: {
      count: { label: 'Total Jobs', aggregation: 'count' },
      totalAmount: { label: 'Total Pipeline', aggregation: 'sum', field: 'amount' },
      avgAmount: { label: 'Avg Deal Size', aggregation: 'avg', field: 'amount' },
      closedWon: { label: 'Closed Won', aggregation: 'count', filter: { stage: 'CLOSED_WON' } },
      closedWonAmount: { label: 'Won Revenue', aggregation: 'sum', field: 'contractTotal', filter: { stage: 'CLOSED_WON' } },
      winRate: { label: 'Win Rate', aggregation: 'percentage', numerator: 'closedWon', denominator: 'count' },
    },
  },

  users: {
    name: 'Users',
    singularName: 'User',
    tableName: 'users',
    primaryKey: 'id',
    icon: 'user-circle',
    description: 'System users and team members',
    fields: {
      id: { type: 'string', label: 'User ID', filterable: true, sortable: true },
      email: { type: 'string', label: 'Email', filterable: true, sortable: true, searchable: true },
      fullName: { type: 'string', label: 'Full Name', filterable: true, sortable: true, searchable: true },
      firstName: { type: 'string', label: 'First Name', filterable: true, sortable: true },
      lastName: { type: 'string', label: 'Last Name', filterable: true, sortable: true },
      department: { type: 'string', label: 'Department', filterable: true, sortable: true, groupable: true },
      title: { type: 'string', label: 'Title', filterable: true, sortable: true },
      isActive: { type: 'boolean', label: 'Active', filterable: true, groupable: true },
      createdAt: { type: 'datetime', label: 'Created Date', filterable: true, sortable: true, defaultDateField: true },
    },
    relationships: {
      leads: { module: 'leads', type: 'hasMany', foreignKey: 'ownerId', label: 'Owned Leads' },
      accounts: { module: 'accounts', type: 'hasMany', foreignKey: 'ownerId', label: 'Owned Accounts' },
      opportunities: { module: 'jobs', type: 'hasMany', foreignKey: 'ownerId', label: 'Owned Jobs' },
    },
    metrics: {
      count: { label: 'Total Users', aggregation: 'count' },
      active: { label: 'Active Users', aggregation: 'count', filter: { isActive: true } },
    },
  },

  invoices: {
    name: 'Invoices',
    singularName: 'Invoice',
    tableName: 'invoices',
    primaryKey: 'id',
    icon: 'receipt',
    description: 'Customer invoices and billing',
    fields: {
      id: { type: 'string', label: 'Invoice ID', filterable: true, sortable: true },
      invoiceNumber: { type: 'string', label: 'Invoice Number', filterable: true, sortable: true, searchable: true },
      status: { type: 'enum', label: 'Status', filterable: true, sortable: true, groupable: true, enumValues: ['DRAFT', 'SENT', 'VIEWED', 'PARTIAL', 'PAID', 'OVERDUE', 'VOID'] },
      invoiceDate: { type: 'date', label: 'Invoice Date', filterable: true, sortable: true, defaultDateField: true },
      dueDate: { type: 'date', label: 'Due Date', filterable: true, sortable: true },
      total: { type: 'currency', label: 'Total Amount', filterable: true, sortable: true, aggregatable: true },
      amountPaid: { type: 'currency', label: 'Amount Paid', filterable: true, sortable: true, aggregatable: true },
      balanceDue: { type: 'currency', label: 'Balance Due', filterable: true, sortable: true, aggregatable: true },
      accountId: { type: 'relation', label: 'Account', relation: 'accounts', filterable: true },
      opportunityId: { type: 'relation', label: 'Job', relation: 'jobs', filterable: true },
      createdAt: { type: 'datetime', label: 'Created Date', filterable: true, sortable: true },
    },
    relationships: {
      account: { module: 'accounts', type: 'belongsTo', foreignKey: 'accountId', label: 'Account' },
      opportunity: { module: 'jobs', type: 'belongsTo', foreignKey: 'opportunityId', label: 'Job' },
      payments: { module: 'payments', type: 'hasMany', foreignKey: 'invoiceId', label: 'Payments' },
    },
    metrics: {
      count: { label: 'Total Invoices', aggregation: 'count' },
      totalInvoiced: { label: 'Total Invoiced', aggregation: 'sum', field: 'total' },
      totalCollected: { label: 'Total Collected', aggregation: 'sum', field: 'amountPaid' },
      totalOutstanding: { label: 'Outstanding Balance', aggregation: 'sum', field: 'balanceDue' },
      overdueCount: { label: 'Overdue Invoices', aggregation: 'count', filter: { status: 'OVERDUE' } },
    },
  },

  commissions: {
    name: 'Commissions',
    singularName: 'Commission',
    tableName: 'commissions',
    primaryKey: 'id',
    icon: 'percent',
    description: 'Sales commissions and payouts',
    fields: {
      id: { type: 'string', label: 'Commission ID', filterable: true, sortable: true },
      type: { type: 'enum', label: 'Type', filterable: true, sortable: true, groupable: true, enumValues: ['PRE_COMMISSION', 'BACK_END', 'BONUS', 'SALES_OP', 'SUPPLEMENT_OVERRIDE', 'PM_COMMISSION', 'MANAGER_OVERRIDE'] },
      status: { type: 'enum', label: 'Status', filterable: true, sortable: true, groupable: true, enumValues: ['NEW', 'REQUESTED', 'APPROVED', 'HOLD', 'PAID', 'DENIED'] },
      commissionValue: { type: 'currency', label: 'Commission Value', filterable: true, sortable: true, aggregatable: true },
      commissionRate: { type: 'number', label: 'Rate %', filterable: true, sortable: true },
      commissionAmount: { type: 'currency', label: 'Commission Amount', filterable: true, sortable: true, aggregatable: true },
      requestedAmount: { type: 'currency', label: 'Requested Amount', filterable: true, sortable: true, aggregatable: true },
      paidAmount: { type: 'currency', label: 'Paid Amount', filterable: true, sortable: true, aggregatable: true },
      paidDate: { type: 'date', label: 'Paid Date', filterable: true, sortable: true },
      ownerId: { type: 'relation', label: 'Commission Owner', relation: 'users', filterable: true, groupable: true },
      opportunityId: { type: 'relation', label: 'Job', relation: 'jobs', filterable: true },
      createdAt: { type: 'datetime', label: 'Created Date', filterable: true, sortable: true, defaultDateField: true },
    },
    relationships: {
      owner: { module: 'users', type: 'belongsTo', foreignKey: 'ownerId', label: 'Commission Owner' },
      opportunity: { module: 'jobs', type: 'belongsTo', foreignKey: 'opportunityId', label: 'Job' },
    },
    metrics: {
      count: { label: 'Total Commissions', aggregation: 'count' },
      totalRequested: { label: 'Total Requested', aggregation: 'sum', field: 'requestedAmount' },
      totalApproved: { label: 'Total Approved', aggregation: 'sum', field: 'commissionAmount', filter: { status: 'APPROVED' } },
      totalPaid: { label: 'Total Paid', aggregation: 'sum', field: 'paidAmount' },
      pendingCount: { label: 'Pending Approval', aggregation: 'count', filter: { status: 'REQUESTED' } },
    },
  },

  workOrders: {
    name: 'Work Orders',
    singularName: 'Work Order',
    tableName: 'work_orders',
    primaryKey: 'id',
    icon: 'clipboard-list',
    description: 'Field service work orders',
    fields: {
      id: { type: 'string', label: 'Work Order ID', filterable: true, sortable: true },
      workOrderNumber: { type: 'string', label: 'WO Number', filterable: true, sortable: true, searchable: true },
      subject: { type: 'string', label: 'Subject', filterable: true, sortable: true, searchable: true },
      status: { type: 'enum', label: 'Status', filterable: true, sortable: true, groupable: true, enumValues: ['NEW', 'IN_PROGRESS', 'COMPLETED', 'CANCELED'] },
      priority: { type: 'enum', label: 'Priority', filterable: true, sortable: true, groupable: true, enumValues: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] },
      workType: { type: 'string', label: 'Work Type', filterable: true, sortable: true, groupable: true },
      opportunityId: { type: 'relation', label: 'Job', relation: 'jobs', filterable: true },
      createdAt: { type: 'datetime', label: 'Created Date', filterable: true, sortable: true, defaultDateField: true },
    },
    relationships: {
      opportunity: { module: 'jobs', type: 'belongsTo', foreignKey: 'opportunityId', label: 'Job' },
      appointments: { module: 'appointments', type: 'hasMany', foreignKey: 'workOrderId', label: 'Appointments' },
    },
    metrics: {
      count: { label: 'Total Work Orders', aggregation: 'count' },
      completed: { label: 'Completed', aggregation: 'count', filter: { status: 'COMPLETED' } },
      inProgress: { label: 'In Progress', aggregation: 'count', filter: { status: 'IN_PROGRESS' } },
    },
  },
};

// Get module by name (case-insensitive, handles pluralization)
export function getModule(name) {
  const normalizedName = name.toLowerCase();

  // Direct match
  if (MODULES[normalizedName]) {
    return MODULES[normalizedName];
  }

  // Try singular -> plural
  const pluralMappings = {
    lead: 'leads',
    account: 'accounts',
    contact: 'contacts',
    job: 'jobs',
    opportunity: 'jobs',
    opportunities: 'jobs',
    user: 'users',
    invoice: 'invoices',
    commission: 'commissions',
    workorder: 'workOrders',
    work_order: 'workOrders',
  };

  const mapped = pluralMappings[normalizedName];
  if (mapped && MODULES[mapped]) {
    return MODULES[mapped];
  }

  return null;
}

// Get all available modules for report builder
export function getAvailableModules() {
  return Object.entries(MODULES).map(([key, module]) => ({
    id: key,
    name: module.name,
    singularName: module.singularName,
    icon: module.icon,
    description: module.description,
    fieldCount: Object.keys(module.fields).length,
  }));
}

// Get fields for a module with optional filtering
export function getModuleFields(moduleName, options = {}) {
  const module = getModule(moduleName);
  if (!module) return [];

  const { filterable, sortable, groupable, aggregatable, searchable } = options;

  return Object.entries(module.fields)
    .filter(([_, field]) => {
      if (filterable && !field.filterable) return false;
      if (sortable && !field.sortable) return false;
      if (groupable && !field.groupable) return false;
      if (aggregatable && !field.aggregatable) return false;
      if (searchable && !field.searchable) return false;
      return true;
    })
    .map(([key, field]) => ({
      id: key,
      ...field,
    }));
}

// Get relationships for a module
export function getModuleRelationships(moduleName) {
  const module = getModule(moduleName);
  if (!module) return [];

  return Object.entries(module.relationships || {}).map(([key, rel]) => ({
    id: key,
    ...rel,
    targetModule: MODULES[rel.module],
  }));
}

// Get related module fields (for cross-module reporting)
export function getRelatedModuleFields(baseModule, relationshipPath) {
  const parts = relationshipPath.split('.');
  let currentModule = getModule(baseModule);

  for (const part of parts) {
    if (!currentModule?.relationships?.[part]) {
      return [];
    }
    const rel = currentModule.relationships[part];
    currentModule = MODULES[rel.module];
  }

  if (!currentModule) return [];

  return Object.entries(currentModule.fields).map(([key, field]) => ({
    id: `${relationshipPath}.${key}`,
    ...field,
    label: `${currentModule.singularName}: ${field.label}`,
  }));
}

// Get default date field for a module
export function getDefaultDateField(moduleName) {
  const module = getModule(moduleName);
  if (!module) return 'createdAt';

  const dateField = Object.entries(module.fields).find(([_, field]) => field.defaultDateField);
  return dateField ? dateField[0] : 'createdAt';
}

// Get metrics for a module
export function getModuleMetrics(moduleName) {
  const module = getModule(moduleName);
  if (!module) return [];

  return Object.entries(module.metrics || {}).map(([key, metric]) => ({
    id: key,
    ...metric,
  }));
}

export default {
  MODULES,
  getModule,
  getAvailableModules,
  getModuleFields,
  getModuleRelationships,
  getRelatedModuleFields,
  getDefaultDateField,
  getModuleMetrics,
};
