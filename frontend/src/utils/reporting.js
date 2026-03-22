const LEGACY_BASE_OBJECT_TO_MODULE = {
  Opportunity: 'jobs',
  Account: 'accounts',
  Lead: 'leads',
  Contact: 'contacts',
  WorkOrder: 'workOrders',
  User: 'users',
  Invoice: 'invoices',
  Commission: 'commissions',
};

const MODULE_TO_LEGACY_OBJECT = {
  jobs: 'Opportunity',
  accounts: 'Account',
  leads: 'Lead',
  contacts: 'Contact',
  workOrders: 'WorkOrder',
  users: 'User',
  invoices: 'Invoice',
  commissions: 'Commission',
};

const MODULE_METADATA = {
  leads: { label: 'Leads', table: 'leads', database: 'CRM' },
  accounts: { label: 'Accounts', table: 'accounts', database: 'CRM' },
  contacts: { label: 'Contacts', table: 'contacts', database: 'CRM' },
  jobs: { label: 'Jobs', table: 'opportunities', database: 'CRM' },
  users: { label: 'Users', table: 'users', database: 'CRM' },
  invoices: { label: 'Invoices', table: 'invoices', database: 'CRM' },
  commissions: { label: 'Commissions', table: 'commissions', database: 'CRM' },
  workOrders: { label: 'Work Orders', table: 'work_orders', database: 'CRM' },
};

const MODULE_RELATIONS = {
  leads: {
    owner: 'users',
    convertedOpportunity: 'jobs',
    convertedAccount: 'accounts',
    convertedContact: 'contacts',
  },
  accounts: {
    owner: 'users',
    contacts: 'contacts',
    opportunities: 'jobs',
    invoices: 'invoices',
  },
  contacts: {
    account: 'accounts',
    opportunities: 'jobs',
  },
  jobs: {
    owner: 'users',
    account: 'accounts',
    contacts: 'contacts',
    workOrders: 'workOrders',
    invoices: 'invoices',
    commissions: 'commissions',
  },
  users: {
    leads: 'leads',
    accounts: 'accounts',
    opportunities: 'jobs',
  },
  invoices: {
    account: 'accounts',
    opportunity: 'jobs',
  },
  commissions: {
    owner: 'users',
    opportunity: 'jobs',
  },
  workOrders: {
    opportunity: 'jobs',
  },
};

const MODULE_ALIASES = {
  lead: 'leads',
  leads: 'leads',
  account: 'accounts',
  accounts: 'accounts',
  contact: 'contacts',
  contacts: 'contacts',
  job: 'jobs',
  jobs: 'jobs',
  opportunity: 'jobs',
  opportunities: 'jobs',
  user: 'users',
  users: 'users',
  invoice: 'invoices',
  invoices: 'invoices',
  commission: 'commissions',
  commissions: 'commissions',
  workorder: 'workOrders',
  workorders: 'workOrders',
  work_order: 'workOrders',
  work_orders: 'workOrders',
};

const FILTER_OPERATORS = [
  { id: 'equals', label: 'Equals' },
  { id: 'not', label: 'Not equals' },
  { id: 'contains', label: 'Contains' },
  { id: 'gt', label: 'Greater than' },
  { id: 'lt', label: 'Less than' },
  { id: 'lastXDays', label: 'Last X days' },
  { id: 'in', label: 'In list' },
];

const DEFAULT_PRESENTATION = {
  widgets: [],
};

export const REPORT_TEMPLATES = [
  {
    id: 'pipeline-summary',
    name: 'Pipeline Summary',
    description: 'Track pipeline volume by stage for the jobs module.',
    report: {
      category: 'SALES',
      reportType: 'summary',
      chartType: 'BAR',
      baseModule: 'jobs',
      selectedFields: ['name', 'stage', 'amount', 'ownerId', 'createdAt'],
      groupByFields: ['stage'],
      filters: [],
      dateRangeField: 'createdAt',
      defaultDateRange: 'thisMonth',
      isPublic: false,
      sharedWithRoles: [],
    },
  },
  {
    id: 'lead-conversion',
    name: 'Lead Conversion',
    description: 'Monitor lead source and conversion metrics over time.',
    report: {
      category: 'MARKETING',
      reportType: 'summary',
      chartType: 'PIE',
      baseModule: 'leads',
      selectedFields: ['source', 'status', 'isConverted', 'createdAt'],
      groupByFields: ['source'],
      filters: [],
      dateRangeField: 'createdAt',
      defaultDateRange: 'thisMonth',
      isPublic: false,
      sharedWithRoles: [],
    },
  },
  {
    id: 'revenue-trend',
    name: 'Revenue Trend',
    description: 'Follow revenue movement across won jobs month over month.',
    report: {
      category: 'FINANCIAL',
      reportType: 'summary',
      chartType: 'LINE',
      baseModule: 'jobs',
      selectedFields: ['name', 'contractTotal', 'soldDate', 'stage'],
      groupByFields: [],
      filters: [{ field: 'stage', operator: 'equals', value: 'CLOSED_WON' }],
      dateRangeField: 'soldDate',
      defaultDateRange: 'thisMonth',
      isPublic: false,
      sharedWithRoles: [],
    },
  },
  {
    id: 'invoice-aging',
    name: 'Invoice Aging',
    description: 'Review invoice balances and overdue status.',
    report: {
      category: 'FINANCIAL',
      reportType: 'summary',
      chartType: 'TABLE',
      baseModule: 'invoices',
      selectedFields: ['invoiceNumber', 'status', 'total', 'amountPaid', 'balanceDue', 'invoiceDate', 'dueDate'],
      groupByFields: [],
      filters: [],
      dateRangeField: 'invoiceDate',
      defaultDateRange: 'thisMonth',
      isPublic: false,
      sharedWithRoles: [],
    },
  },
];

export function getReportBaseModule(report) {
  const rawModule =
    report?.baseModule ||
    report?.base_module ||
    report?.baseObject ||
    report?.base_object ||
    '';

  if (!rawModule) return '';

  if (LEGACY_BASE_OBJECT_TO_MODULE[rawModule]) {
    return LEGACY_BASE_OBJECT_TO_MODULE[rawModule];
  }

  const normalized = MODULE_ALIASES[String(rawModule).toLowerCase()];
  return normalized || rawModule;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
}

export function normalizeReportFilters(filters) {
  if (!filters) {
    return [];
  }

  if (Array.isArray(filters)) {
    return filters
      .filter((filter) => filter && typeof filter === 'object' && filter.field)
      .map((filter, index) => ({
        id: filter.id || `filter_${index + 1}`,
        field: filter.field,
        operator: filter.operator || 'equals',
        value: filter.value ?? '',
      }));
  }

  if (typeof filters === 'object') {
    return Object.entries(filters).flatMap(([field, rawValue], index) => {
      if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
        if (Object.prototype.hasOwnProperty.call(rawValue, 'gte') || Object.prototype.hasOwnProperty.call(rawValue, 'lte')) {
          return [{
            id: `filter_${index + 1}`,
            field,
            operator: 'between',
            value: [rawValue.gte ?? '', rawValue.lte ?? ''],
          }];
        }

        if (Object.prototype.hasOwnProperty.call(rawValue, 'contains')) {
          return [{
            id: `filter_${index + 1}`,
            field,
            operator: 'contains',
            value: rawValue.contains ?? '',
          }];
        }
      }

      return [{
        id: `filter_${index + 1}`,
        field,
        operator: 'equals',
        value: rawValue ?? '',
      }];
    });
  }

  return [];
}

export function normalizeSortRules(sort, sortBy, sortDirection) {
  if (Array.isArray(sort)) {
    return sort
      .filter((entry) => entry && typeof entry === 'object' && entry.field)
      .map((entry) => ({
        field: entry.field,
        direction: String(entry.direction || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc',
      }));
  }

  if (typeof sortBy === 'string' && sortBy.trim()) {
    return [{
      field: sortBy.trim(),
      direction: String(sortDirection || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc',
    }];
  }

  return [];
}

export function normalizePresentationWidgets(widgets) {
  if (!Array.isArray(widgets)) {
    return [];
  }

  return widgets
    .filter((widget) => widget && typeof widget === 'object')
    .map((widget, index) => ({
      id: widget.id || `presentation_widget_${index + 1}`,
      type: String(widget.type || widget.widgetType || 'TABLE').toUpperCase(),
      title: widget.title || '',
      subtitle: widget.subtitle || '',
      metricField: widget.metricField || null,
      metricFunction: widget.metricFunction || null,
      visualization: widget.visualization && typeof widget.visualization === 'object'
        ? widget.visualization
        : {},
      order: typeof widget.order === 'number' ? widget.order : index,
    }))
    .sort((left, right) => left.order - right.order);
}

export function normalizeReportAggregations(aggregations, report = {}) {
  if (Array.isArray(aggregations)) {
    return {
      items: aggregations,
      includeRelations: normalizeStringArray(report.includeRelations),
      presentation: {
        widgets: normalizePresentationWidgets(report.presentation?.widgets),
      },
      sort: normalizeSortRules(report.sort, report.sortBy, report.sortDirection),
      visualization: report.visualization && typeof report.visualization === 'object'
        ? report.visualization
        : {},
    };
  }

  if (aggregations && typeof aggregations === 'object') {
    return {
      items: Array.isArray(aggregations.items)
        ? aggregations.items
        : Array.isArray(aggregations.aggregations)
        ? aggregations.aggregations
        : [],
      includeRelations: normalizeStringArray(aggregations.includeRelations ?? report.includeRelations),
      presentation: {
        widgets: normalizePresentationWidgets(aggregations.presentation?.widgets ?? report.presentation?.widgets),
      },
      sort: normalizeSortRules(aggregations.sort, report.sortBy, report.sortDirection),
      visualization: aggregations.visualization && typeof aggregations.visualization === 'object'
        ? aggregations.visualization
        : report.visualization && typeof report.visualization === 'object'
        ? report.visualization
        : {},
    };
  }

  return {
    items: [],
    includeRelations: normalizeStringArray(report.includeRelations),
    presentation: DEFAULT_PRESENTATION,
    sort: normalizeSortRules(report.sort, report.sortBy, report.sortDirection),
    visualization: report.visualization && typeof report.visualization === 'object'
      ? report.visualization
      : {},
  };
}

export function buildPersistedAggregationConfig(report = {}) {
  const normalized = normalizeReportAggregations(report.aggregations, report);

  return {
    items: normalized.items,
    includeRelations: normalized.includeRelations,
    presentation: normalized.presentation,
    sort: normalized.sort,
    visualization: normalized.visualization,
  };
}

export function normalizeReportConfig(report = {}) {
  const sourceReport = report && typeof report === 'object' ? report : {};
  const baseModule = getReportBaseModule(sourceReport) || 'jobs';
  const aggregationConfig = normalizeReportAggregations(sourceReport.aggregations, sourceReport);
  const sort = aggregationConfig.sort;

  return {
    ...sourceReport,
    baseModule,
    baseObject: sourceReport.baseObject || getLegacyBaseObject(baseModule),
    selectedFields: normalizeStringArray(sourceReport.selectedFields),
    groupByFields: normalizeStringArray(sourceReport.groupByFields),
    filters: normalizeReportFilters(sourceReport.filters),
    includeRelations: aggregationConfig.includeRelations,
    sort,
    sortBy: sourceReport.sortBy || sort[0]?.field || null,
    sortDirection: sourceReport.sortDirection || sort[0]?.direction || null,
    aggregations: aggregationConfig.items,
    aggregationItems: aggregationConfig.items,
    presentation: aggregationConfig.presentation,
    visualization: aggregationConfig.visualization,
  };
}

export function getReportPresentationWidgets(report = {}) {
  return normalizeReportConfig(report).presentation?.widgets || [];
}

export function getEffectiveReportPresentationWidgets(report = {}) {
  const normalized = normalizeReportConfig(report);
  const widgets = getReportPresentationWidgets(normalized);

  if (widgets.length > 0) {
    return widgets;
  }

  const chartType = String(normalized.chartType || 'TABLE').toUpperCase();

  if (chartType === 'TABLE') {
    return [];
  }

  if (chartType === 'KPI') {
    return [{
      id: 'default_kpi_widget',
      type: 'KPI',
      title: normalized.name || 'Summary',
      subtitle: '',
      visualization: {},
    }];
  }

  return [{
    id: 'default_chart_widget',
    type: 'CHART',
    title: normalized.name || 'Visualization',
    subtitle: '',
    visualization: {
      chartType: chartType === 'DONUT' ? 'PIE' : chartType,
    },
  }];
}

export function getReportAggregationItems(report = {}) {
  return normalizeReportConfig(report).aggregationItems || [];
}

export function getReportFilterOperators() {
  return FILTER_OPERATORS;
}

export function buildPreviewReportSpec(report = {}) {
  const normalized = normalizeReportConfig(report);

  return {
    name: normalized.name || 'Preview Report',
    description: normalized.description || '',
    category: normalized.category || 'CUSTOM',
    reportType: normalized.reportType || 'summary',
    chartType: normalized.chartType || 'TABLE',
    baseModule: normalized.baseModule,
    baseObject: normalized.baseObject,
    selectedFields: normalized.selectedFields,
    groupByFields: normalized.groupByFields,
    filters: normalized.filters,
    includeRelations: normalized.includeRelations,
    sort: normalized.sort,
    sortBy: normalized.sortBy,
    sortDirection: normalized.sortDirection,
    aggregations: buildPersistedAggregationConfig(normalized),
    presentation: normalized.presentation,
    visualization: normalized.visualization,
    dateRangeField: normalized.dateRangeField || 'createdAt',
    defaultDateRange: normalized.defaultDateRange || 'thisMonth',
    isPublic: Boolean(normalized.isPublic),
    sharedWithRoles: Array.isArray(normalized.sharedWithRoles) ? normalized.sharedWithRoles : [],
  };
}

export function getLegacyBaseObject(moduleId) {
  return MODULE_TO_LEGACY_OBJECT[getReportBaseModule({ baseModule: moduleId })] || moduleId;
}

export function getModuleMetadata(moduleId) {
  const normalizedModule = getReportBaseModule({ baseModule: moduleId });
  const metadata = MODULE_METADATA[normalizedModule];

  if (metadata) {
    return {
      id: normalizedModule,
      ...metadata,
    };
  }

  const label = normalizedModule
    ? normalizedModule.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase())
    : 'Unknown Module';

  return {
    id: normalizedModule,
    label,
    table: normalizedModule || 'unknown',
    database: 'CRM',
  };
}

export function getReportModuleLabel(report) {
  return getModuleMetadata(getReportBaseModule(report)).label;
}

export function getReportTablesUsed(report) {
  const normalizedReport = normalizeReportConfig(report);
  const baseModule = normalizedReport.baseModule;
  const tables = new Set();

  if (baseModule) {
    tables.add(getModuleMetadata(baseModule).table);
  }

  const relationIds = new Set();
  const collectRelation = (value) => {
    if (typeof value !== 'string' || !value.includes('.')) return;
    relationIds.add(value.split('.')[0]);
  };

  for (const field of normalizedReport.selectedFields || []) {
    collectRelation(field);
  }

  for (const field of normalizedReport.groupByFields || []) {
    collectRelation(field);
  }

  for (const relation of normalizedReport.includeRelations || []) {
    if (typeof relation === 'string' && relation.trim()) {
      relationIds.add(relation);
    }
  }

  if (Array.isArray(normalizedReport.filters)) {
    for (const filter of normalizedReport.filters) {
      collectRelation(filter?.field);
    }
  }

  for (const relationId of relationIds) {
    const relatedModule = MODULE_RELATIONS[baseModule]?.[relationId];
    if (relatedModule) {
      tables.add(getModuleMetadata(relatedModule).table);
    }
  }

  return Array.from(tables);
}

export function getReportCreatedByLabel(report) {
  return report?.createdBy?.fullName || report?.createdBy?.email || 'Unknown';
}

export function formatReportTimestamp(value) {
  if (!value) return 'Never';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const LEGACY_DASHBOARD_DATE_RANGES = {
  today: 'today',
  yesterday: 'yesterday',
  this_week: 'thisWeek',
  last_week: 'lastWeek',
  this_month: 'thisMonth',
  last_month: 'lastMonth',
  this_year: 'thisYear',
  last_30_days: 'thisMonth',
};

function normalizeDashboardDateRange(value) {
  if (!value) return 'thisMonth';

  const normalized = String(value).trim();
  if (LEGACY_DASHBOARD_DATE_RANGES[normalized.toLowerCase()]) {
    return LEGACY_DASHBOARD_DATE_RANGES[normalized.toLowerCase()];
  }

  return normalized;
}

function normalizeDashboardVisibility(dashboard) {
  const rawVisibility = String(dashboard?.visibility || '').trim().toUpperCase();
  if (rawVisibility) {
    return rawVisibility;
  }

  return dashboard?.isPublic || dashboard?.is_public ? 'PUBLIC' : 'PRIVATE';
}

function getDashboardVisibilityLabel(visibility) {
  if (visibility === 'TEAM') return 'Team';
  if (visibility === 'PUBLIC') return 'Shared';
  return 'Private';
}

function isLegacyDashboardShape(dashboard) {
  return Boolean(
    dashboard
    && (
      dashboard.visibility
      || dashboard.widget_count !== undefined
      || dashboard.widget_ids
      || dashboard.row_height !== undefined
      || dashboard.created_at
      || dashboard.updated_at
    )
  );
}

function normalizeWidgetCompatibility(legacyWidgetType, chartType) {
  if (legacyWidgetType === 'METRIC' || legacyWidgetType === 'GAUGE') {
    return 'metric';
  }

  if (legacyWidgetType === 'CHART' && chartType === 'LINE') {
    return 'line';
  }

  if (legacyWidgetType === 'CHART' || legacyWidgetType === 'FUNNEL') {
    return 'bar';
  }

  if (legacyWidgetType === 'TABLE') {
    return 'table';
  }

  if (legacyWidgetType === 'LIST') {
    return 'list';
  }

  return 'unsupported';
}

export function normalizeDashboardWidget(widget) {
  if (!widget) return null;

  const legacyWidgetType = String(widget.widget_type || '').trim().toUpperCase();
  const chartType = String(widget?.config?.chart_type || '').trim().toUpperCase();
  const isLegacy = Boolean(legacyWidgetType || widget.position);

  if (!isLegacy) {
    const chartConfig = widget.chartConfig && typeof widget.chartConfig === 'object' ? widget.chartConfig : {};
    return {
      ...widget,
      title: widget.title || widget?.savedReport?.name || 'Untitled Widget',
      widgetType: widget.widgetType || widget.widget_type || (widget.savedReportId || widget.saved_report_id ? 'REPORT' : 'WIDGET'),
      savedReportId: widget.savedReportId ?? widget.saved_report_id ?? widget?.savedReport?.id ?? '',
      positionX: widget.positionX ?? widget?.position?.x ?? 0,
      positionY: widget.positionY ?? widget?.position?.y ?? 0,
      width: widget.width ?? widget?.position?.width ?? 1,
      height: widget.height ?? widget?.position?.height ?? 1,
      source: widget.source || undefined,
      chartConfig,
      reportSpec: chartConfig.reportSpec ? normalizeReportConfig(chartConfig.reportSpec) : null,
      visualization: chartConfig.visualization || {},
      widgetKind: chartConfig.widgetKind || null,
      isLegacy: false,
    };
  }

  return {
    ...widget,
    title: widget.title || 'Untitled Widget',
    subtitle: widget.subtitle || null,
    widgetType: 'LEGACY_WIDGET',
    legacyWidgetType,
    compatibilityType: normalizeWidgetCompatibility(legacyWidgetType, chartType),
    dataSource: widget.dataSource ?? widget.data_source ?? null,
    positionX: widget.positionX ?? widget?.position?.x ?? 0,
    positionY: widget.positionY ?? widget?.position?.y ?? 0,
    width: widget.width ?? widget?.position?.width ?? 3,
    height: widget.height ?? widget?.position?.height ?? 2,
    minWidth: widget.minWidth ?? widget?.position?.min_width ?? null,
    minHeight: widget.minHeight ?? widget?.position?.min_height ?? null,
    formatType: widget.formatType ?? widget?.config?.format ?? null,
    config: widget.config || {},
    savedReportId: '',
    source: 'legacy',
    isLegacy: true,
  };
}

export function normalizeDashboardSummary(dashboard) {
  if (!dashboard) return null;

  const isLegacy = isLegacyDashboardShape(dashboard);
  const visibility = normalizeDashboardVisibility(dashboard);
  const createdByRaw = dashboard.createdBy ?? dashboard.created_by;
  const createdBy = typeof createdByRaw === 'object'
    ? createdByRaw
    : dashboard.owner_name
    ? { fullName: dashboard.owner_name }
    : createdByRaw
    ? { fullName: String(createdByRaw) }
    : null;

  const sharedWithRoles = Array.isArray(dashboard.sharedWithRoles)
    ? dashboard.sharedWithRoles
    : Array.isArray(dashboard.shared_with)
    ? dashboard.shared_with
    : [];

  return {
    ...dashboard,
    id: dashboard.id,
    name: dashboard.name || 'Untitled Dashboard',
    description: dashboard.description || '',
    visibility,
    visibilityLabel: getDashboardVisibilityLabel(visibility),
    isPublic: dashboard.isPublic ?? dashboard.is_public ?? visibility !== 'PRIVATE',
    isFavorite: dashboard.isFavorite ?? dashboard.is_favorite ?? false,
    isDefault: dashboard.isDefault ?? dashboard.is_default ?? false,
    widgetCount:
      dashboard.widgetCount
      ?? dashboard.widget_count
      ?? dashboard.widgets?.length
      ?? dashboard._count?.widgets
      ?? dashboard.widget_ids?.length
      ?? 0,
    createdAt: dashboard.createdAt ?? dashboard.created_at ?? null,
    updatedAt: dashboard.updatedAt ?? dashboard.updated_at ?? dashboard.createdAt ?? dashboard.created_at ?? null,
    lastViewedAt: dashboard.lastViewedAt ?? dashboard.last_viewed_at ?? null,
    createdBy,
    sharedWithRoles,
    columns: dashboard.columns ?? dashboard.columnCount ?? undefined,
    rowHeight: dashboard.rowHeight ?? dashboard.row_height ?? undefined,
    defaultDateRange: dashboard.defaultDateRange ?? normalizeDashboardDateRange(dashboard.default_date_range),
    tags: Array.isArray(dashboard.tags) ? dashboard.tags : [],
    source: dashboard.source || (isLegacy ? 'legacy' : undefined),
    isLegacy,
    capabilities: {
      canCreate: dashboard?.capabilities?.canCreate ?? !isLegacy,
      canEdit: dashboard?.capabilities?.canEdit ?? !isLegacy,
      canDuplicate: dashboard?.capabilities?.canDuplicate ?? !isLegacy,
      canDelete: dashboard?.capabilities?.canDelete ?? !isLegacy,
    },
    widgets: Array.isArray(dashboard.widgets)
      ? dashboard.widgets.map(normalizeDashboardWidget).filter(Boolean)
      : undefined,
  };
}

function extractDashboardList(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.data?.dashboards)) {
    return payload.data.dashboards;
  }

  return [];
}

function extractDashboardWidgets(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  return [];
}

export function normalizeDashboardCollectionResponse(payload) {
  const data = extractDashboardList(payload)
    .map(normalizeDashboardSummary)
    .filter(Boolean);

  const hasLegacyDashboards = data.some((dashboard) => dashboard.isLegacy);

  return {
    success: payload?.success ?? true,
    data,
    meta: {
      backend: hasLegacyDashboards ? 'legacy' : 'reports',
      canWrite: payload?.meta?.canWrite ?? !hasLegacyDashboards,
    },
  };
}

export function normalizeDashboardDetailResponse(payload, widgetsPayload = null) {
  const rawDashboard = payload?.data || payload;
  if (!rawDashboard) {
    return {
      success: payload?.success ?? false,
      data: null,
      meta: {
        backend: 'unknown',
        canWrite: false,
      },
    };
  }

  const normalizedDashboard = normalizeDashboardSummary(rawDashboard);
  const widgets = (
    Array.isArray(rawDashboard?.widgets)
      ? rawDashboard.widgets
      : extractDashboardWidgets(widgetsPayload)
  )
    .map(normalizeDashboardWidget)
    .filter(Boolean);

  const hasLegacyWidgets = widgets.some((widget) => widget.isLegacy);
  const hasLegacyDashboard = normalizedDashboard?.isLegacy || hasLegacyWidgets;

  return {
    success: payload?.success ?? true,
    data: {
      ...normalizedDashboard,
      columns: rawDashboard.columns ?? normalizedDashboard.columns ?? 4,
      rowHeight: rawDashboard.rowHeight ?? rawDashboard.row_height ?? normalizedDashboard.rowHeight ?? 100,
      defaultDateRange: normalizedDashboard.defaultDateRange || 'thisMonth',
      widgetCount: widgets.length || normalizedDashboard.widgetCount || 0,
      widgets,
    },
    meta: {
      backend: hasLegacyDashboard ? 'legacy' : 'reports',
      canWrite: payload?.meta?.canWrite ?? !hasLegacyDashboard,
    },
  };
}

function formatMetricLabel(key) {
  return String(key)
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (value) => value.toUpperCase())
    .trim();
}

export function formatReportFieldLabel(key) {
  const normalizedKey = String(key || '').trim();

  if (!normalizedKey) {
    return '';
  }

  if (normalizedKey === 'ownerName' || normalizedKey === 'owner.fullName') {
    return 'Owner Name';
  }

  if (normalizedKey === 'leadSetByName' || normalizedKey === 'leadSetBy.fullName') {
    return 'Lead Setter Name';
  }

  if (normalizedKey.includes('.')) {
    return normalizedKey
      .split('.')
      .map((segment) => formatMetricLabel(segment))
      .join(' > ');
  }

  return formatMetricLabel(normalizedKey);
}

function guessMetricFormat(key, value) {
  const normalizedKey = String(key || '').toLowerCase();

  if (normalizedKey.includes('rate') || normalizedKey.includes('percent')) {
    return 'percent';
  }

  if (
    normalizedKey.includes('amount') ||
    normalizedKey.includes('revenue') ||
    normalizedKey.includes('total') ||
    normalizedKey.includes('value') ||
    normalizedKey.includes('balance')
  ) {
    return 'currency';
  }

  return typeof value === 'number' ? 'number' : 'number';
}

function normalizeChartRows(result) {
  const groupedRows =
    result?.byStage ||
    result?.byType ||
    result?.byStatus ||
    result?.bySource ||
    [];

  if (Array.isArray(groupedRows) && groupedRows.length > 0) {
    return groupedRows.map((row) => ({
      ...row,
      name:
        row.name ||
        row.stage ||
        row.type ||
        row.status ||
        row.source ||
        row.label ||
        'Unknown',
      value:
        row.value ??
        row.amount ??
        row.total ??
        row.count ??
        0,
      count: row.count ?? row.value ?? 0,
    }));
  }

  if (Array.isArray(result?.data) && result.data.length > 0) {
    return result.data.map((row) => ({
      ...row,
      name: row.name || row.label || row.date || 'Unknown',
      value: row.value ?? row.count ?? 0,
      count: row.count ?? row.value ?? 0,
    }));
  }

  if (Array.isArray(result?.rows)) {
    return result.rows;
  }

  return [];
}

export function getRenderableReportValue(value) {
  if (value == null) {
    return value;
  }

  if (value instanceof Date) {
    return value;
  }

  if (Array.isArray(value)) {
    const normalizedItems = value
      .map((item) => getRenderableReportValue(item))
      .filter((item) => item != null && item !== '');

    return normalizedItems.length > 0 ? normalizedItems.join(', ') : null;
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (typeof value.fullName === 'string' && value.fullName.trim()) {
    return value.fullName.trim();
  }

  const firstName = typeof value.firstName === 'string' ? value.firstName.trim() : '';
  const lastName = typeof value.lastName === 'string' ? value.lastName.trim() : '';
  const combinedName = [firstName, lastName].filter(Boolean).join(' ').trim();

  if (combinedName) {
    return combinedName;
  }

  for (const key of ['name', 'label', 'title', 'email']) {
    if (typeof value[key] === 'string' && value[key].trim()) {
      return value[key].trim();
    }
  }

  const primitiveValue = Object.values(value).find((entry) =>
    entry != null && ['string', 'number', 'boolean'].includes(typeof entry)
  );

  return primitiveValue ?? null;
}

function sanitizeReportRowsForRender(rows, selectedFields = []) {
  if (!Array.isArray(rows)) {
    return [];
  }

  const selectedFieldSet = new Set(
    Array.isArray(selectedFields)
      ? selectedFields.filter((field) => typeof field === 'string' && field.trim())
      : []
  );

  return rows.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return row;
    }

    return Object.entries(row).reduce((sanitizedRow, [key, value]) => {
      const isPlainObject =
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        !(value instanceof Date);

      if (isPlainObject && !selectedFieldSet.has(key)) {
        return sanitizedRow;
      }

      sanitizedRow[key] = getRenderableReportValue(value);
      return sanitizedRow;
    }, {});
  });
}

export function normalizeReportRunResult(report, payload) {
  const normalizedReport = normalizeReportConfig(report);
  const result = payload?.results || payload?.data?.results || payload || {};
  const metrics = Object.entries(result?.metrics || {}).map(([key, value]) => ({
    id: key,
    label: formatMetricLabel(key),
    value,
    format: guessMetricFormat(key, value),
  }));

  const chartData = normalizeChartRows(result);
  const rawRows = Array.isArray(result?.data)
    ? result.data
    : Array.isArray(result?.rows)
    ? result.rows
    : chartData;
  const rows = sanitizeReportRowsForRender(rawRows, normalizedReport.selectedFields);

  const rowCount =
    result?.metadata?.totalCount ||
    result?.totalCount ||
    result?.rowCount ||
    rawRows.length ||
    chartData.length ||
    0;

  return {
    raw: result,
    report: normalizedReport,
    metrics,
    chartData,
    rows,
    rawRows,
    rowCount,
    dateRangeLabel: result?.period || null,
    comparison: result?.comparison || null,
  };
}

function formatSqlValue(value) {
  if (Array.isArray(value)) {
    return `(${value.map((item) => formatSqlValue(item)).join(', ')})`;
  }

  if (value === null || value === undefined || value === '') {
    return 'NULL';
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildSqlOperator(operator, value) {
  switch (operator) {
    case 'contains':
      return `LIKE '%${String(value || '').replace(/'/g, "''")}%'`;
    case 'startsWith':
      return `LIKE '${String(value || '').replace(/'/g, "''")}%'`;
    case 'endsWith':
      return `LIKE '%${String(value || '').replace(/'/g, "''")}'`;
    case 'gt':
      return `> ${formatSqlValue(value)}`;
    case 'gte':
      return `>= ${formatSqlValue(value)}`;
    case 'lt':
      return `< ${formatSqlValue(value)}`;
    case 'lte':
      return `<= ${formatSqlValue(value)}`;
    case 'not':
      return `<> ${formatSqlValue(value)}`;
    case 'in':
      return `IN ${formatSqlValue(Array.isArray(value) ? value : [value])}`;
    case 'isNull':
      return 'IS NULL';
    case 'isNotNull':
      return 'IS NOT NULL';
    case 'between':
      if (Array.isArray(value) && value.length >= 2) {
        return `BETWEEN ${formatSqlValue(value[0])} AND ${formatSqlValue(value[1])}`;
      }
      return `= ${formatSqlValue(value)}`;
    case 'equals':
    default:
      return `= ${formatSqlValue(value)}`;
  }
}

export function buildSqlPreview(report) {
  const moduleMetadata = getModuleMetadata(getReportBaseModule(report));
  const selectedFields = Array.isArray(report?.selectedFields) && report.selectedFields.length > 0
    ? report.selectedFields
    : ['*'];
  const filters = Array.isArray(report?.filters) ? report.filters : [];
  const groupByFields = Array.isArray(report?.groupByFields) ? report.groupByFields : [];

  const formatSqlFieldReference = (field) => {
    if (field === 'ownerName') {
      return 'owner.fullName AS ownerName';
    }

    if (field === 'leadSetByName') {
      return 'leadSetBy.fullName AS leadSetByName';
    }

    return field;
  };

  const selectClause = selectedFields.map(formatSqlFieldReference).join(',\n  ');
  const whereClause = filters.length > 0
    ? `\nWHERE ${filters
        .filter((filter) => filter?.field)
        .map((filter) => `${formatSqlFieldReference(filter.field)} ${buildSqlOperator(filter.operator, filter.value)}`)
        .join('\n  AND ')}`
    : '';
  const groupByClause = groupByFields.length > 0
    ? `\nGROUP BY ${groupByFields.map(formatSqlFieldReference).join(', ')}`
    : '';
  const orderByClause = report?.sortBy
    ? `\nORDER BY ${formatSqlFieldReference(report.sortBy)} ${(report.sortDirection || 'asc').toUpperCase()}`
    : '';

  return `-- Preview only: generated from the current ReportSpec
-- Database: ${moduleMetadata.database}

SELECT
  ${selectClause}
FROM ${moduleMetadata.table}${whereClause}${groupByClause}${orderByClause};`;
}

export function buildDuplicateReportPayload(report) {
  const baseModule = getReportBaseModule(report);

  return {
    name: `${report?.name || 'Untitled Report'} (Copy)`,
    description: report?.description || '',
    category: report?.category || 'CUSTOM',
    reportType: report?.reportType || 'summary',
    chartType: report?.chartType || 'TABLE',
    baseModule,
    baseObject: getLegacyBaseObject(baseModule),
    selectedFields: Array.isArray(report?.selectedFields) ? [...report.selectedFields] : [],
    groupByFields: Array.isArray(report?.groupByFields) ? [...report.groupByFields] : [],
    sortBy: report?.sortBy || null,
    sortDirection: report?.sortDirection || null,
    filters: Array.isArray(report?.filters) ? [...report.filters] : [],
    dateRangeField: report?.dateRangeField || 'createdAt',
    defaultDateRange: report?.defaultDateRange || 'thisMonth',
    aggregations: report?.aggregations || undefined,
    isPublic: false,
    sharedWithRoles: Array.isArray(report?.sharedWithRoles) ? [...report.sharedWithRoles] : [],
  };
}

export function getTemplateById(templateId) {
  return REPORT_TEMPLATES.find((template) => template.id === templateId) || null;
}
