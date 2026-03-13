import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { GridLayout, useContainerWidth } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import {
  AlertCircle,
  BarChart3,
  Database,
  ExternalLink,
  Eye,
  GripVertical,
  LayoutGrid,
  LineChart,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Table2,
  Trash2,
} from 'lucide-react';
import { metabaseApi, reportsApi } from '../services/api';
import DashboardReportWidget from '../components/reports/DashboardReportWidget';
import VisualQueryBuilder from '../components/reports/VisualQueryBuilder';
import {
  buildPreviewReportSpec,
  formatReportFieldLabel,
  normalizeDashboardWidget,
  normalizeReportConfig,
} from '../utils/reporting';

const DASHBOARD_WIDGET_LIBRARY = [
  {
    id: 'kpi',
    label: 'KPI',
    description: 'Single metric card',
    widgetKind: 'KPI',
    width: 1,
    height: 2,
    icon: Sparkles,
  },
  {
    id: 'chart',
    label: 'Chart',
    description: 'Bar, line, area, or pie chart',
    widgetKind: 'CHART',
    width: 2,
    height: 3,
    icon: BarChart3,
  },
  {
    id: 'table',
    label: 'Table',
    description: 'Report rows in a resizable table',
    widgetKind: 'TABLE',
    width: 2,
    height: 3,
    icon: Table2,
  },
  {
    id: 'saved-report',
    label: 'Saved Report',
    description: 'Render an existing saved report as-is',
    widgetKind: 'SAVED_REPORT',
    width: 2,
    height: 3,
    icon: Database,
  },
  {
    id: 'metabase',
    label: 'Metabase Widget',
    description: 'Embed an external dashboard or question',
    widgetKind: 'METABASE',
    width: 2,
    height: 3,
    icon: ExternalLink,
  },
  {
    id: 'ai-summary',
    label: 'AI Summary',
    description: 'Narrative summary powered by the widget report',
    widgetKind: 'AI_SUMMARY',
    width: 2,
    height: 2,
    icon: Sparkles,
  },
];

const WIDGET_KIND_OPTIONS = [
  { value: 'KPI', label: 'KPI' },
  { value: 'CHART', label: 'Chart' },
  { value: 'TABLE', label: 'Table' },
  { value: 'SAVED_REPORT', label: 'Saved Report' },
  { value: 'METABASE', label: 'Metabase Widget' },
  { value: 'AI_SUMMARY', label: 'AI Summary' },
];

function buildDefaultWidgetReport(widgetKind) {
  const normalizedKind = String(widgetKind || 'TABLE').toUpperCase();
  const defaultChartType =
    normalizedKind === 'KPI'
      ? 'KPI'
      : normalizedKind === 'CHART'
      ? 'BAR'
      : 'TABLE';

  return normalizeReportConfig({
    name: '',
    description: '',
    category: 'CUSTOM',
    reportType: 'summary',
    chartType: defaultChartType,
    baseModule: 'jobs',
    baseObject: 'Opportunity',
    selectedFields: normalizedKind === 'KPI' ? ['amount'] : ['name', 'stage', 'amount', 'createdAt'],
    groupByFields: normalizedKind === 'CHART' ? ['stage'] : [],
    filters: [],
    includeRelations: [],
    sort: [],
    sortBy: null,
    sortDirection: null,
    aggregations: normalizedKind === 'KPI'
      ? [{ id: 'aggregation_default', field: 'amount', function: 'sum' }]
      : [],
    presentation: { widgets: [] },
    visualization: normalizedKind === 'CHART' ? { chartType: 'BAR' } : {},
    dateRangeField: 'createdAt',
    defaultDateRange: 'thisMonth',
  });
}

function getNextWidgetPosition(widgets = [], columns = 4) {
  if (widgets.length === 0) {
    return { x: 0, y: 0 };
  }

  const nextRowStart = widgets.reduce(
    (maxY, widget) => Math.max(maxY, (widget.positionY || 0) + (widget.height || 1)),
    0
  );

  return { x: 0, y: nextRowStart };
}

function getBackendWidgetType(widget) {
  const widgetKind = String(widget.widgetKind || 'SAVED_REPORT').toUpperCase();
  const visualizationChartType = String(widget.visualization?.chartType || 'BAR').toUpperCase();

  if (widgetKind === 'KPI') return 'KPI_CARD';
  if (widgetKind === 'TABLE') return 'TABLE';
  if (widgetKind === 'AI_SUMMARY') return 'STAT_LIST';
  if (widgetKind === 'METABASE') return 'TABLE';
  if (widgetKind === 'SAVED_REPORT' && widget.savedReportId) return 'REPORT';

  if (widgetKind === 'CHART') {
    if (visualizationChartType === 'LINE') return 'LINE_CHART';
    if (visualizationChartType === 'AREA') return 'AREA_CHART';
    if (visualizationChartType === 'PIE' || visualizationChartType === 'DONUT') return 'PIE_CHART';
    return 'BAR_CHART';
  }

  return 'TABLE';
}

function buildWidgetTitle(widget, savedReports = []) {
  if (widget.title?.trim()) {
    return widget.title.trim();
  }

  if (widget.sourceMode === 'saved-report') {
    return savedReports.find((report) => report.id === widget.savedReportId)?.name || 'Saved Report Widget';
  }

  if (widget.widgetKind === 'METABASE') {
    return 'Metabase Widget';
  }

  return formatReportFieldLabel(widget.widgetKind || 'Widget');
}

function createWidgetDraft(template, widgets = [], columns = 4) {
  const position = getNextWidgetPosition(widgets, columns);
  const widgetKind = String(template.widgetKind).toUpperCase();
  const sourceMode =
    widgetKind === 'METABASE'
      ? 'metabase'
      : widgetKind === 'SAVED_REPORT'
      ? 'saved-report'
      : 'widget-report';

  return {
    localId: `widget_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    widgetKind,
    title: template.label,
    subtitle: '',
    sourceMode,
    savedReportId: '',
    reportSpec: sourceMode === 'widget-report' ? buildDefaultWidgetReport(widgetKind) : null,
    visualization: widgetKind === 'CHART' ? { chartType: 'BAR' } : widgetKind === 'KPI' ? { chartType: 'KPI' } : { chartType: 'TABLE' },
    metabaseType: 'dashboard',
    metabaseId: '',
    positionX: position.x,
    positionY: position.y,
    width: template.width,
    height: template.height,
  };
}

function normalizeEditableWidget(widget) {
  const normalizedWidget = normalizeDashboardWidget(widget) || widget;
  const widgetKind = String(
    normalizedWidget.widgetKind
      || (normalizedWidget.savedReportId ? 'SAVED_REPORT' : normalizedWidget.widgetType === 'STAT_LIST' ? 'AI_SUMMARY' : '')
      || 'SAVED_REPORT'
  ).toUpperCase();
  const sourceMode =
    widgetKind === 'METABASE'
      ? 'metabase'
      : normalizedWidget.savedReportId && !normalizedWidget.reportSpec
      ? 'saved-report'
      : normalizedWidget.reportSpec
      ? 'widget-report'
      : 'saved-report';

  return {
    ...normalizedWidget,
    localId: normalizedWidget.id || `widget_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    widgetKind,
    sourceMode,
    reportSpec: normalizedWidget.reportSpec || (sourceMode === 'widget-report' ? buildDefaultWidgetReport(widgetKind) : null),
    visualization: normalizedWidget.visualization || normalizedWidget.chartConfig?.visualization || {},
    metabaseType: normalizedWidget.chartConfig?.metabaseType || 'dashboard',
    metabaseId:
      normalizedWidget.chartConfig?.metabaseId
      || normalizedWidget.chartConfig?.metabaseDashboardId
      || normalizedWidget.chartConfig?.metabaseQuestionId
      || '',
  };
}

function serializeWidget(widget, savedReports = []) {
  const sourceMode = widget.widgetKind === 'METABASE' ? 'metabase' : widget.sourceMode || 'saved-report';
  const chartConfig = {
    widgetKind: widget.widgetKind,
    sourceMode,
    visualization: widget.visualization || {},
    ...(sourceMode === 'widget-report' && widget.reportSpec
      ? { reportSpec: buildPreviewReportSpec(widget.reportSpec) }
      : {}),
    ...(sourceMode === 'metabase'
      ? {
          metabaseType: widget.metabaseType || 'dashboard',
          metabaseId: widget.metabaseId || '',
        }
      : {}),
  };

  return {
    widgetType: getBackendWidgetType(widget),
    title: buildWidgetTitle(widget, savedReports),
    subtitle: widget.subtitle || '',
    positionX: widget.positionX || 0,
    positionY: widget.positionY || 0,
    width: widget.width || 2,
    height: widget.height || 2,
    savedReportId: sourceMode === 'saved-report' ? widget.savedReportId || undefined : undefined,
    chartConfig,
  };
}

export default function DashboardBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(id);

  const [saving, setSaving] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [showWidgetModal, setShowWidgetModal] = useState(false);
  const [editingWidgetId, setEditingWidgetId] = useState(null);
  const [draggingTemplate, setDraggingTemplate] = useState(null);
  const [widgetDraft, setWidgetDraft] = useState(null);

  const [dashboard, setDashboard] = useState({
    name: '',
    description: '',
    layout: 'GRID',
    columns: 4,
    defaultDateRange: 'thisMonth',
    isPublic: false,
    widgets: [],
  });

  const { width: gridWidth, containerRef: gridContainerRef } = useContainerWidth({
    initialWidth: 1200,
  });

  const { data: dashboardResponse, isLoading: dashboardLoading } = useQuery({
    queryKey: ['dashboard-builder', id],
    queryFn: () => reportsApi.getDashboard(id),
    enabled: isEditing,
  });

  const { data: dashboardLibraryResponse, isLoading: dashboardLibraryLoading } = useQuery({
    queryKey: ['dashboards', 'builder-capability'],
    queryFn: () => reportsApi.getDashboards({ includeWidgets: false }),
  });

  const { data: savedReportsResponse, isLoading: reportsLoading } = useQuery({
    queryKey: ['saved-reports', 'dashboard-builder'],
    queryFn: () => reportsApi.getSavedReports({ limit: 200 }),
  });

  const { data: metabaseStatus } = useQuery({
    queryKey: ['metabase-status', 'dashboard-builder'],
    queryFn: () => metabaseApi.getStatus(),
    retry: false,
  });

  const { data: metabaseDashboardsResponse } = useQuery({
    queryKey: ['metabase-dashboards', 'dashboard-builder'],
    queryFn: () => metabaseApi.getDashboards(),
    enabled: Boolean(metabaseStatus?.data?.connected),
    retry: false,
  });

  const savedReports = Array.isArray(savedReportsResponse)
    ? savedReportsResponse
    : savedReportsResponse?.data?.reports || savedReportsResponse?.data || [];
  const metabaseDashboards = Array.isArray(metabaseDashboardsResponse?.data) ? metabaseDashboardsResponse.data : [];
  const canManageDashboards = dashboardLibraryResponse?.meta?.canWrite !== false;

  useEffect(() => {
    if (!dashboardResponse) return;

    setDashboard((prev) => ({
      ...prev,
      ...dashboardResponse,
      widgets: Array.isArray(dashboardResponse.widgets)
        ? dashboardResponse.widgets.map((widget) => normalizeEditableWidget(widget))
        : [],
    }));
  }, [dashboardResponse]);

  const widgetLayout = useMemo(
    () =>
      dashboard.widgets.map((widget) => ({
        i: widget.localId,
        x: widget.positionX || 0,
        y: widget.positionY || 0,
        w: Math.max(1, Math.min(widget.width || 2, dashboard.columns || 4)),
        h: Math.max(1, widget.height || 2),
        minW: 1,
        minH: 1,
      })),
    [dashboard.columns, dashboard.widgets]
  );

  const openWidgetEditor = (draft, existingWidgetId = null) => {
    setEditingWidgetId(existingWidgetId);
    setWidgetDraft({
      ...draft,
      title: buildWidgetTitle(draft, savedReports),
    });
    setShowWidgetModal(true);
  };

  const handleAddWidget = (template, dropLayout = null) => {
    const nextDraft = createWidgetDraft(template, dashboard.widgets, dashboard.columns || 4);
    if (dropLayout) {
      nextDraft.positionX = dropLayout.x;
      nextDraft.positionY = dropLayout.y;
      nextDraft.width = dropLayout.w || nextDraft.width;
      nextDraft.height = dropLayout.h || nextDraft.height;
    }
    openWidgetEditor(nextDraft, null);
  };

  const handleEditWidget = (widget) => {
    openWidgetEditor({ ...widget }, widget.localId);
  };

  const handleLayoutChange = (layout) => {
    setDashboard((prev) => ({
      ...prev,
      widgets: prev.widgets.map((widget) => {
        const layoutItem = layout.find((item) => item.i === widget.localId);
        if (!layoutItem) return widget;
        return {
          ...widget,
          positionX: layoutItem.x,
          positionY: layoutItem.y,
          width: layoutItem.w,
          height: layoutItem.h,
        };
      }),
    }));
  };

  const handleDrop = (_layout, layoutItem) => {
    if (!draggingTemplate) return;
    handleAddWidget(draggingTemplate, layoutItem);
    setDraggingTemplate(null);
  };

  const removeWidget = (widgetId) => {
    setDashboard((prev) => ({
      ...prev,
      widgets: prev.widgets.filter((widget) => widget.localId !== widgetId),
    }));
  };

  const canSaveWidgetDraft = useMemo(() => {
    if (!widgetDraft) return false;

    if (widgetDraft.widgetKind === 'METABASE') {
      return Boolean(widgetDraft.metabaseId);
    }

    if (widgetDraft.sourceMode === 'saved-report' || widgetDraft.widgetKind === 'SAVED_REPORT') {
      return Boolean(widgetDraft.savedReportId);
    }

    return Boolean(widgetDraft.reportSpec?.baseModule && widgetDraft.reportSpec?.selectedFields?.length);
  }, [widgetDraft]);

  const saveWidgetDraft = () => {
    if (!widgetDraft || !canSaveWidgetDraft) return;

    const normalizedDraft = {
      ...widgetDraft,
      sourceMode:
        widgetDraft.widgetKind === 'METABASE'
          ? 'metabase'
          : widgetDraft.widgetKind === 'SAVED_REPORT'
          ? 'saved-report'
          : widgetDraft.sourceMode,
      reportSpec:
        widgetDraft.sourceMode === 'widget-report'
          ? normalizeReportConfig(widgetDraft.reportSpec)
          : widgetDraft.reportSpec,
      visualization: widgetDraft.visualization || {},
    };

    setDashboard((prev) => {
      if (editingWidgetId) {
        return {
          ...prev,
          widgets: prev.widgets.map((widget) =>
            widget.localId === editingWidgetId ? normalizedDraft : widget
          ),
        };
      }

      return {
        ...prev,
        widgets: [...prev.widgets, normalizedDraft],
      };
    });

    setShowWidgetModal(false);
    setWidgetDraft(null);
    setEditingWidgetId(null);
  };

  const handleSave = async () => {
    if (!dashboard.name.trim()) return;

    try {
      setSaving(true);
      const payload = {
        ...dashboard,
        widgets: dashboard.widgets.map((widget) => serializeWidget(widget, savedReports)),
      };

      let savedDashboard;
      if (isEditing) {
        savedDashboard = await reportsApi.updateDashboard(id, payload);
      } else {
        savedDashboard = await reportsApi.createDashboard(payload);
      }

      navigate(`/analytics/dashboards/${savedDashboard.id || id}`);
    } catch (error) {
      console.error('Failed to save dashboard:', error);
    } finally {
      setSaving(false);
    }
  };

  if (dashboardLoading || reportsLoading || dashboardLibraryLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-panda-primary"></div>
      </div>
    );
  }

  if (
    !canManageDashboards
    || (isEditing && dashboardResponse?.capabilities?.canEdit === false)
  ) {
    return (
      <div className="space-y-6 p-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Dashboard editing is not available here yet</h1>
              <p className="mt-2 text-sm text-gray-600">
                Your account can view dashboards, but dashboard create/edit is currently restricted for this path.
              </p>
              <button
                type="button"
                onClick={() => navigate('/analytics/dashboards')}
                className="mt-4 inline-flex items-center rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Back to Dashboards
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEditing ? 'Edit Dashboard' : 'Create Dashboard'}
          </h1>
          <p className="text-gray-500">
            Build a drag-and-drop canvas powered by saved reports or widget-specific report specs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-xl bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setIsPreviewMode(false)}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
                !isPreviewMode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
              }`}
            >
              <Pencil className="h-4 w-4" />
              Edit Mode
            </button>
            <button
              type="button"
              onClick={() => setIsPreviewMode(true)}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
                isPreviewMode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
              }`}
            >
              <Eye className="h-4 w-4" />
              Preview Mode
            </button>
          </div>
          <button
            type="button"
            onClick={() => navigate('/analytics/dashboards')}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dashboard.name.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save Dashboard'}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Dashboard Settings</h2>
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Dashboard Name *</label>
            <input
              type="text"
              value={dashboard.name}
              onChange={(event) => setDashboard((prev) => ({ ...prev, name: event.target.value }))}
              className="w-full rounded-xl border border-gray-300 px-4 py-2.5 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              placeholder="e.g., Sales Overview"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Default Date Range</label>
            <select
              value={dashboard.defaultDateRange || 'thisMonth'}
              onChange={(event) => setDashboard((prev) => ({ ...prev, defaultDateRange: event.target.value }))}
              className="w-full rounded-xl border border-gray-300 px-4 py-2.5 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            >
              <option value="today">Today</option>
              <option value="thisWeek">This Week</option>
              <option value="thisMonth">This Month</option>
              <option value="thisQuarter">This Quarter</option>
              <option value="thisYear">This Year</option>
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={dashboard.description || ''}
              onChange={(event) => setDashboard((prev) => ({ ...prev, description: event.target.value }))}
              rows={3}
              className="w-full rounded-xl border border-gray-300 px-4 py-2.5 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              placeholder="What should this dashboard help the team monitor?"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Grid Columns</label>
            <select
              value={dashboard.columns}
              onChange={(event) => setDashboard((prev) => ({ ...prev, columns: Number(event.target.value) }))}
              className="w-full rounded-xl border border-gray-300 px-4 py-2.5 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            >
              <option value={2}>2 columns</option>
              <option value={3}>3 columns</option>
              <option value={4}>4 columns</option>
              <option value={6}>6 columns</option>
            </select>
          </div>
          <label className="flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3">
            <input
              type="checkbox"
              checked={dashboard.isPublic}
              onChange={(event) => setDashboard((prev) => ({ ...prev, isPublic: event.target.checked }))}
              className="rounded text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-700">Share this dashboard with other users</span>
          </label>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-5 w-5 text-panda-primary" />
              <h2 className="text-lg font-semibold text-gray-900">Widget Library</h2>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Drag a widget onto the canvas or click to configure it.
            </p>
            <div className="mt-4 space-y-3">
              {DASHBOARD_WIDGET_LIBRARY.map((template) => {
                const Icon = template.icon;
                return (
                  <button
                    key={template.id}
                    type="button"
                    draggable={!isPreviewMode}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'copy';
                      setDraggingTemplate(template);
                    }}
                    onDragEnd={() => setDraggingTemplate(null)}
                    onClick={() => handleAddWidget(template)}
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 p-4 text-left transition-colors hover:border-gray-300 hover:bg-white"
                  >
                    <div className="flex items-start gap-3">
                      <div className="rounded-xl bg-indigo-50 p-2 text-indigo-600">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">{template.label}</div>
                        <div className="mt-1 text-sm text-gray-500">{template.description}</div>
                        <div className="mt-2 text-xs text-gray-400">
                          Default size: {template.width}w × {template.height}h
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Saved Reports</h2>
            <p className="mt-1 text-sm text-gray-500">
              {savedReports.length} reports available to power widgets.
            </p>
            <div className="mt-4 max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {savedReports.slice(0, 12).map((report) => (
                <button
                  key={report.id}
                  type="button"
                  onClick={() =>
                    handleAddWidget({
                      ...DASHBOARD_WIDGET_LIBRARY.find((item) => item.widgetKind === 'SAVED_REPORT'),
                      label: report.name,
                    })
                  }
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-left hover:bg-gray-50"
                >
                  <div className="font-medium text-gray-900">{report.name}</div>
                  <div className="mt-1 text-xs text-gray-500">{report.baseModule || report.baseObject}</div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Dashboard Canvas</h2>
              <p className="text-sm text-gray-500">
                {isPreviewMode
                  ? 'Preview mode runs each widget live through the reports API.'
                  : 'Drag, resize, and configure widgets on the canvas. Dropping a library item opens its editor.'}
              </p>
            </div>
            <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
              {dashboard.widgets.length} widget{dashboard.widgets.length === 1 ? '' : 's'}
            </div>
          </div>

          {dashboard.widgets.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-gray-300 px-6 py-14 text-center">
              <LayoutGrid className="mx-auto h-12 w-12 text-gray-300" />
              <h3 className="mt-4 text-lg font-semibold text-gray-900">This dashboard requires configuration.</h3>
              <p className="mt-2 text-sm text-gray-500">
                Drag a widget from the library to start building the canvas.
              </p>
            </div>
          ) : (
            <div
              ref={gridContainerRef}
              className="mt-6 overflow-hidden rounded-2xl border border-gray-100 bg-gray-50 p-3"
            >
              <GridLayout
                className="layout"
                width={Math.max(gridWidth || 0, 320)}
                layout={widgetLayout}
                cols={dashboard.columns || 4}
                rowHeight={120}
                margin={[16, 16]}
                containerPadding={[0, 0]}
                onLayoutChange={handleLayoutChange}
                isDraggable={!isPreviewMode}
                isResizable={!isPreviewMode}
                isDroppable={!isPreviewMode}
                droppingItem={
                  draggingTemplate
                    ? {
                        i: '__dropping__',
                        w: draggingTemplate.width,
                        h: draggingTemplate.height,
                      }
                    : undefined
                }
                onDrop={handleDrop}
                onDropDragOver={() =>
                  draggingTemplate
                    ? { w: draggingTemplate.width, h: draggingTemplate.height }
                    : false
                }
                draggableHandle=".dashboard-widget-drag-handle"
                draggableCancel=".dashboard-widget-actions,.dashboard-widget-actions *"
              >
                {dashboard.widgets.map((widget) => (
                  <div key={widget.localId} className="h-full">
                    {isPreviewMode ? (
                      <div className="h-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                        <DashboardReportWidget
                          reportId={widget.savedReportId}
                          reportSpec={widget.sourceMode === 'widget-report' ? widget.reportSpec : null}
                          widgetType={getBackendWidgetType(widget)}
                          widgetKind={widget.widgetKind}
                          chartConfig={{
                            widgetKind: widget.widgetKind,
                            visualization: widget.visualization,
                            ...(widget.sourceMode === 'metabase'
                              ? {
                                  metabaseType: widget.metabaseType,
                                  metabaseId: widget.metabaseId,
                                }
                              : {}),
                          }}
                          visualization={widget.visualization}
                          dateRange={{ dateRange: dashboard.defaultDateRange || 'thisMonth' }}
                          title={buildWidgetTitle(widget, savedReports)}
                          subtitle={widget.subtitle}
                        />
                      </div>
                    ) : (
                      <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <button
                              type="button"
                              className="dashboard-widget-drag-handle mt-1 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                              title="Drag to reposition"
                            >
                              <GripVertical className="h-4 w-4" />
                            </button>
                            <div>
                              <h3 className="font-semibold text-gray-900">{buildWidgetTitle(widget, savedReports)}</h3>
                              <p className="mt-1 text-sm text-gray-500">
                                {widget.widgetKind === 'METABASE'
                                  ? 'External dashboard widget'
                                  : widget.sourceMode === 'saved-report'
                                  ? 'Uses an existing saved report'
                                  : 'Uses a widget-specific report'}
                              </p>
                            </div>
                          </div>
                          <div className="dashboard-widget-actions flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleEditWidget(widget)}
                              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                              title="Edit widget"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeWidget(widget.localId)}
                              className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                              title="Delete widget"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2 text-sm text-gray-600">
                          <div className="flex flex-wrap gap-2">
                            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                              {formatReportFieldLabel(widget.widgetKind)}
                            </span>
                            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                              {widget.width}w × {widget.height}h
                            </span>
                            {widget.sourceMode === 'saved-report' && (
                              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                                {savedReports.find((report) => report.id === widget.savedReportId)?.name || 'Select a report'}
                              </span>
                            )}
                            {widget.sourceMode === 'widget-report' && widget.reportSpec?.baseModule && (
                              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                                Module: {formatReportFieldLabel(widget.reportSpec.baseModule)}
                              </span>
                            )}
                          </div>
                          {widget.widgetKind === 'CHART' && (
                            <div className="text-xs text-gray-500">
                              Visualization: {formatReportFieldLabel(widget.visualization?.chartType || 'BAR')}
                            </div>
                          )}
                          {widget.subtitle && <div className="text-xs text-gray-500">{widget.subtitle}</div>}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </GridLayout>
            </div>
          )}
        </section>
      </div>

      {showWidgetModal && widgetDraft && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-8 w-full max-w-6xl rounded-2xl bg-white shadow-xl">
            <div className="border-b border-gray-200 px-6 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {editingWidgetId ? 'Edit Widget' : 'Configure Widget'}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Choose whether this widget uses an existing report or its own widget-specific report spec.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowWidgetModal(false);
                    setWidgetDraft(null);
                    setEditingWidgetId(null);
                  }}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="space-y-6 px-6 py-5">
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Widget Title</label>
                  <input
                    type="text"
                    value={widgetDraft.title || ''}
                    onChange={(event) => setWidgetDraft((prev) => ({ ...prev, title: event.target.value }))}
                    className="w-full rounded-xl border border-gray-300 px-4 py-2.5 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Subtitle</label>
                  <input
                    type="text"
                    value={widgetDraft.subtitle || ''}
                    onChange={(event) => setWidgetDraft((prev) => ({ ...prev, subtitle: event.target.value }))}
                    className="w-full rounded-xl border border-gray-300 px-4 py-2.5 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Widget Type</label>
                  <select
                    value={widgetDraft.widgetKind}
                    onChange={(event) => {
                      const nextKind = event.target.value;
                      setWidgetDraft((prev) => ({
                        ...prev,
                        widgetKind: nextKind,
                        sourceMode:
                          nextKind === 'METABASE'
                            ? 'metabase'
                            : nextKind === 'SAVED_REPORT'
                            ? 'saved-report'
                            : prev.sourceMode === 'metabase'
                            ? 'widget-report'
                            : prev.sourceMode,
                        reportSpec:
                          nextKind === 'METABASE' || nextKind === 'SAVED_REPORT'
                            ? prev.reportSpec
                            : prev.reportSpec || buildDefaultWidgetReport(nextKind),
                        visualization:
                          nextKind === 'CHART'
                            ? { ...(prev.visualization || {}), chartType: prev.visualization?.chartType || 'BAR' }
                            : nextKind === 'KPI'
                            ? { ...(prev.visualization || {}), chartType: 'KPI' }
                            : { ...(prev.visualization || {}), chartType: 'TABLE' },
                      }));
                    }}
                    className="w-full rounded-xl border border-gray-300 px-4 py-2.5 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  >
                    {WIDGET_KIND_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Width</label>
                  <select
                    value={widgetDraft.width}
                    onChange={(event) => setWidgetDraft((prev) => ({ ...prev, width: Number(event.target.value) }))}
                    className="w-full rounded-xl border border-gray-300 px-4 py-2.5 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  >
                    {Array.from({ length: dashboard.columns || 4 }, (_, index) => index + 1).map((value) => (
                      <option key={value} value={value}>{value} column{value === 1 ? '' : 's'}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Height</label>
                  <select
                    value={widgetDraft.height}
                    onChange={(event) => setWidgetDraft((prev) => ({ ...prev, height: Number(event.target.value) }))}
                    className="w-full rounded-xl border border-gray-300 px-4 py-2.5 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  >
                    {[1, 2, 3, 4, 5].map((value) => (
                      <option key={value} value={value}>{value} row{value === 1 ? '' : 's'}</option>
                    ))}
                  </select>
                </div>
              </div>

              {widgetDraft.widgetKind === 'METABASE' ? (
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Metabase Type</label>
                      <select
                        value={widgetDraft.metabaseType || 'dashboard'}
                        onChange={(event) => setWidgetDraft((prev) => ({ ...prev, metabaseType: event.target.value }))}
                        className="w-full rounded-xl border border-gray-300 px-4 py-2.5 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                      >
                        <option value="dashboard">Dashboard</option>
                        <option value="question">Question</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">External Dashboard</label>
                      <select
                        value={widgetDraft.metabaseId || ''}
                        onChange={(event) => setWidgetDraft((prev) => ({ ...prev, metabaseId: event.target.value }))}
                        className="w-full rounded-xl border border-gray-300 px-4 py-2.5 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                      >
                        <option value="">Select an external dashboard...</option>
                        {metabaseDashboards.map((dashboardOption) => (
                          <option key={dashboardOption.id} value={dashboardOption.id}>
                            {dashboardOption.name || dashboardOption.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="inline-flex rounded-xl bg-gray-100 p-1">
                    <button
                      type="button"
                      onClick={() => setWidgetDraft((prev) => ({
                        ...prev,
                        sourceMode: 'saved-report',
                      }))}
                      className={`rounded-lg px-4 py-2 text-sm font-medium ${
                        widgetDraft.sourceMode === 'saved-report' || widgetDraft.widgetKind === 'SAVED_REPORT'
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600'
                      }`}
                    >
                      Use existing report
                    </button>
                    {widgetDraft.widgetKind !== 'SAVED_REPORT' && (
                      <button
                        type="button"
                        onClick={() => setWidgetDraft((prev) => ({
                          ...prev,
                          sourceMode: 'widget-report',
                          reportSpec: prev.reportSpec || buildDefaultWidgetReport(prev.widgetKind),
                        }))}
                        className={`rounded-lg px-4 py-2 text-sm font-medium ${
                          widgetDraft.sourceMode === 'widget-report'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-600'
                        }`}
                      >
                        Create widget report
                      </button>
                    )}
                  </div>

                  {(widgetDraft.sourceMode === 'saved-report' || widgetDraft.widgetKind === 'SAVED_REPORT') && (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Saved Report</label>
                      <select
                        value={widgetDraft.savedReportId || ''}
                        onChange={(event) => setWidgetDraft((prev) => ({
                          ...prev,
                          savedReportId: event.target.value,
                          title: prev.title || savedReports.find((report) => report.id === event.target.value)?.name || prev.title,
                        }))}
                        className="w-full rounded-xl border border-gray-300 px-4 py-2.5 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                      >
                        <option value="">Select a report...</option>
                        {savedReports.map((report) => (
                          <option key={report.id} value={report.id}>{report.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {widgetDraft.widgetKind === 'CHART' && (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Chart Type</label>
                      <select
                        value={widgetDraft.visualization?.chartType || 'BAR'}
                        onChange={(event) => setWidgetDraft((prev) => ({
                          ...prev,
                          visualization: { ...(prev.visualization || {}), chartType: event.target.value },
                        }))}
                        className="w-full rounded-xl border border-gray-300 px-4 py-2.5 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                      >
                        <option value="BAR">Bar Chart</option>
                        <option value="LINE">Line Chart</option>
                        <option value="AREA">Area Chart</option>
                        <option value="PIE">Pie Chart</option>
                      </select>
                    </div>
                  )}

                  {widgetDraft.sourceMode === 'widget-report' && widgetDraft.reportSpec && (
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <VisualQueryBuilder
                        report={widgetDraft.reportSpec}
                        onChange={(nextReport) =>
                          setWidgetDraft((prev) => ({
                            ...prev,
                            reportSpec: normalizeReportConfig(nextReport),
                          }))
                        }
                        allowPresentationBuilder={false}
                        compact
                        previewLimit={100}
                      />
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
              <button
                type="button"
                onClick={() => {
                  setShowWidgetModal(false);
                  setWidgetDraft(null);
                  setEditingWidgetId(null);
                }}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveWidgetDraft}
                disabled={!canSaveWidgetDraft}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {editingWidgetId ? 'Update Widget' : 'Add Widget'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
