const MODULE_METADATA = {
  leads: { id: 'leads', label: 'Leads', table: 'leads', database: 'CRM', fieldCount: 22 },
  accounts: { id: 'accounts', label: 'Accounts', table: 'accounts', database: 'CRM', fieldCount: 18 },
  contacts: { id: 'contacts', label: 'Contacts', table: 'contacts', database: 'CRM', fieldCount: 18 },
  jobs: { id: 'jobs', label: 'Jobs', table: 'opportunities', database: 'CRM', fieldCount: 24 },
  users: { id: 'users', label: 'Users', table: 'users', database: 'CRM', fieldCount: 8 },
  invoices: { id: 'invoices', label: 'Invoices', table: 'invoices', database: 'CRM', fieldCount: 11 },
  commissions: { id: 'commissions', label: 'Commissions', table: 'commissions', database: 'CRM', fieldCount: 12 },
  workOrders: { id: 'workOrders', label: 'Work Orders', table: 'work_orders', database: 'CRM', fieldCount: 14 },
};

const LEGACY_BASE_OBJECT_BY_MODULE = {
  leads: 'Lead',
  accounts: 'Account',
  contacts: 'Contact',
  jobs: 'Opportunity',
  users: 'User',
  invoices: 'Invoice',
  commissions: 'Commission',
  workOrders: 'WorkOrder',
};

const MODULE_BY_LEGACY_OBJECT = Object.fromEntries(
  Object.entries(LEGACY_BASE_OBJECT_BY_MODULE).map(([moduleId, legacy]) => [legacy, moduleId])
);

const FIELD_LABEL_OVERRIDES = {
  ownerName: 'Owner Name',
  owner_name: 'Owner Name',
  totalBalanceAmount: 'Balance Due',
  balanceDue: 'Balance Due',
  workType: 'Work Type',
  work_type: 'Work Type',
  office: 'Office',
  createdAt: 'Created At',
  updatedAt: 'Updated At',
  lastRunAt: 'Last Run',
};

export const REPORT_TEMPLATES = [
  {
    id: 'jobs-pipeline-overview',
    name: 'Jobs Pipeline Overview',
    description: 'Track pipeline volume, stage distribution, and owner performance for jobs.',
    report: {
      category: 'SALES',
      reportType: 'summary',
      chartType: 'BAR',
      baseModule: 'jobs',
      selectedFields: ['name', 'stage', 'ownerName', 'amount', 'createdAt'],
      filters: [],
      groupByFields: ['stage'],
      defaultDateRange: 'thisMonth',
    },
  },
  {
    id: 'lead-conversion-health',
    name: 'Lead Conversion Health',
    description: 'Review lead status, score, source, and conversion activity.',
    report: {
      category: 'MARKETING',
      reportType: 'summary',
      chartType: 'TABLE',
      baseModule: 'leads',
      selectedFields: ['firstName', 'lastName', 'status', 'score', 'source', 'createdAt'],
      filters: [],
      groupByFields: [],
      defaultDateRange: 'thisMonth',
    },
  },
  {
    id: 'invoice-balance-watch',
    name: 'Invoice Balance Watch',
    description: 'Surface invoices, balances, due dates, and owners in one view.',
    report: {
      category: 'FINANCIAL',
      reportType: 'summary',
      chartType: 'TABLE',
      baseModule: 'invoices',
      selectedFields: ['invoiceNumber', 'status', 'balanceDue', 'dueDate', 'accountId'],
      filters: [],
      groupByFields: [],
      defaultDateRange: 'thisMonth',
    },
  },
  {
    id: 'work-order-operations',
    name: 'Work Order Operations',
    description: 'Monitor work order status, office, and work type for operations reviews.',
    report: {
      category: 'OPERATIONS',
      reportType: 'summary',
      chartType: 'TABLE',
      baseModule: 'workOrders',
      selectedFields: ['workOrderNumber', 'status', 'office', 'workType', 'scheduledDate'],
      filters: [],
      groupByFields: [],
      defaultDateRange: 'thisMonth',
    },
  },
];

function startCase(value) {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getFieldId(field) {
  if (typeof field === 'string') return field;
  if (field && typeof field === 'object') {
    return field.id || field.field || field.key || field.name || '';
  }
  return '';
}

export function humanizeFieldLabel(fieldId) {
  if (!fieldId) return 'Field';
  return FIELD_LABEL_OVERRIDES[fieldId] || startCase(fieldId);
}

export function getLegacyBaseObject(moduleId) {
  return LEGACY_BASE_OBJECT_BY_MODULE[moduleId] || 'Opportunity';
}

export function getReportBaseModule(report) {
  return (
    report?.baseModule
    || report?.base_module
    || report?.module
    || MODULE_BY_LEGACY_OBJECT[report?.baseObject]
    || MODULE_BY_LEGACY_OBJECT[report?.base_object]
    || 'jobs'
  );
}

export function getModuleMetadata(moduleId) {
  return MODULE_METADATA[moduleId] || {
    id: moduleId || 'jobs',
    label: startCase(moduleId || 'jobs'),
    table: moduleId || 'jobs',
    database: 'CRM',
    fieldCount: 0,
  };
}

export function formatReportTimestamp(value) {
  if (!value) return 'Never run';

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function getReportCreatedByLabel(report) {
  return (
    report?.createdBy?.fullName
    || report?.createdBy?.name
    || report?.createdBy?.email
    || report?.createdByName
    || report?.createdByEmail
    || 'Unknown user'
  );
}

export function getReportTablesUsed(report) {
  const moduleId = getReportBaseModule(report);
  const moduleMetadata = getModuleMetadata(moduleId);
  const tableSet = new Set([moduleMetadata.table]);

  const selectedFields = Array.isArray(report?.selectedFields) ? report.selectedFields : [];
  selectedFields.forEach((field) => {
    const fieldId = getFieldId(field);
    if (!fieldId || !fieldId.includes('.')) return;
    const relationId = fieldId.split('.')[0];
    const relationMetadata = getModuleMetadata(relationId);
    if (relationMetadata?.table) {
      tableSet.add(relationMetadata.table);
    }
  });

  const relations = Array.isArray(report?.includeRelations) ? report.includeRelations : [];
  relations.forEach((relationId) => {
    const relationMetadata = getModuleMetadata(relationId);
    if (relationMetadata?.table) {
      tableSet.add(relationMetadata.table);
    }
  });

  return Array.from(tableSet);
}

export function buildDuplicateReportPayload(report) {
  const duplicateName = report?.name ? `${report.name} Copy` : 'Untitled Report Copy';

  return {
    ...report,
    id: undefined,
    name: duplicateName,
    isFavorite: false,
    isPublic: false,
    createdAt: undefined,
    updatedAt: undefined,
    lastRunAt: undefined,
    favorites: undefined,
    favoriteCount: undefined,
  };
}

export function getTemplateById(templateId) {
  return REPORT_TEMPLATES.find((template) => template.id === templateId) || null;
}

export function buildSqlPreview(report) {
  const moduleId = getReportBaseModule(report);
  const moduleMetadata = getModuleMetadata(moduleId);
  const selectedFields = Array.isArray(report?.selectedFields) && report.selectedFields.length > 0
    ? report.selectedFields.map((field) => getFieldId(field) || '*')
    : ['*'];
  const groupByFields = Array.isArray(report?.groupByFields) ? report.groupByFields : [];

  const selectClause = selectedFields.join(', ');
  const fromClause = moduleMetadata.table;
  const groupByClause = groupByFields.length > 0 ? `\nGROUP BY ${groupByFields.join(', ')}` : '';

  return `SELECT ${selectClause}\nFROM ${fromClause}${groupByClause}`;
}

function normalizeWidget(widget, index) {
  return {
    ...widget,
    id: widget?.id || widget?.widgetId || widget?.savedReportId || `widget-${index}`,
  };
}

function normalizeDashboard(dashboard, widgets = []) {
  if (!dashboard) return null;

  const normalizedWidgets = Array.isArray(widgets)
    ? widgets.map(normalizeWidget)
    : Array.isArray(dashboard.widgets)
    ? dashboard.widgets.map(normalizeWidget)
    : Array.isArray(dashboard.widget_ids)
    ? dashboard.widget_ids.map((widgetId, index) => normalizeWidget({ id: widgetId, widgetType: 'LEGACY_WIDGET' }, index))
    : [];

  return {
    ...dashboard,
    id: dashboard.id,
    widgets: normalizedWidgets,
    widgetCount: dashboard.widgetCount || normalizedWidgets.length || dashboard._count?.widgets || 0,
    visibility: dashboard.visibility || (dashboard.isPublic ? 'PUBLIC' : 'PRIVATE'),
    capabilities: {
      canEdit: dashboard?.capabilities?.canEdit ?? true,
      canDuplicate: dashboard?.capabilities?.canDuplicate ?? true,
      canDelete: dashboard?.capabilities?.canDelete ?? true,
    },
  };
}

export function normalizeDashboardCollectionResponse(payload) {
  const rawData = payload?.data?.dashboards || payload?.data || payload?.dashboards || [];
  const dashboards = Array.isArray(rawData)
    ? rawData
    : Array.isArray(rawData?.dashboards)
    ? rawData.dashboards
    : [];

  return {
    success: payload?.success !== false,
    data: dashboards.map((dashboard) => normalizeDashboard(dashboard)).filter(Boolean),
    meta: payload?.meta || payload?.data?.meta || {},
  };
}

export function normalizeDashboardDetailResponse(payload, widgetsPayload) {
  const rawDashboard = payload?.data?.dashboard || payload?.data || payload?.dashboard || payload;
  const widgets = widgetsPayload?.data?.widgets || widgetsPayload?.data || widgetsPayload?.widgets || rawDashboard?.widgets || [];
  return normalizeDashboard(rawDashboard, widgets);
}
