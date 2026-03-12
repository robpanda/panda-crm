import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LayoutGrid, Link2, Pencil, Plus, Trash2, AlertCircle } from 'lucide-react';
import { reportsApi } from '../services/api';

function buildDefaultWidget(savedReports, widgets) {
  const firstReport = savedReports[0];

  return {
    widgetType: 'REPORT',
    title: firstReport?.name || '',
    subtitle: '',
    positionX: 0,
    positionY: Math.max(0, ...widgets.map((widget) => (widget.positionY || 0) + (widget.height || 1))),
    width: 2,
    height: 2,
    savedReportId: firstReport?.id || '',
  };
}

export default function DashboardBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(id);

  const [saving, setSaving] = useState(false);
  const [showWidgetModal, setShowWidgetModal] = useState(false);
  const [editingWidgetIndex, setEditingWidgetIndex] = useState(null);
  const [legacyWidgetWarning, setLegacyWidgetWarning] = useState(false);

  const [dashboard, setDashboard] = useState({
    name: '',
    description: '',
    layout: 'GRID',
    columns: 4,
    defaultDateRange: 'thisMonth',
    isPublic: false,
    widgets: [],
  });

  const [widgetDraft, setWidgetDraft] = useState({
    widgetType: 'REPORT',
    title: '',
    subtitle: '',
    positionX: 0,
    positionY: 0,
    width: 2,
    height: 2,
    savedReportId: '',
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

  const savedReports = Array.isArray(savedReportsResponse)
    ? savedReportsResponse
    : savedReportsResponse?.data?.reports || savedReportsResponse?.data || [];
  const canManageDashboards = dashboardLibraryResponse?.meta?.canWrite !== false;

  useEffect(() => {
    if (!dashboardResponse?.data) return;

    setDashboard((prev) => ({
      ...prev,
      ...dashboardResponse.data,
      widgets: Array.isArray(dashboardResponse.data.widgets) ? dashboardResponse.data.widgets : [],
    }));
  }, [dashboardResponse]);

  useEffect(() => {
    setLegacyWidgetWarning(dashboard.widgets.some((widget) => !widget.savedReportId));
  }, [dashboard.widgets]);

  const widgetsNeedingReports = useMemo(
    () => dashboard.widgets.filter((widget) => !widget.savedReportId),
    [dashboard.widgets]
  );

  const openAddWidget = () => {
    setEditingWidgetIndex(null);
    setWidgetDraft(buildDefaultWidget(savedReports, dashboard.widgets));
    setShowWidgetModal(true);
  };

  const openEditWidget = (widget, index) => {
    setEditingWidgetIndex(index);
    setWidgetDraft({
      ...widget,
      widgetType: 'REPORT',
      savedReportId: widget.savedReportId || '',
    });
    setShowWidgetModal(true);
  };

  const saveWidget = () => {
    if (!widgetDraft.savedReportId) return;

    const selectedReport = savedReports.find((report) => report.id === widgetDraft.savedReportId);
    const normalizedWidget = {
      ...widgetDraft,
      widgetType: 'REPORT',
      title: widgetDraft.title || selectedReport?.name || 'Report Widget',
    };

    if (editingWidgetIndex !== null) {
      const nextWidgets = [...dashboard.widgets];
      nextWidgets[editingWidgetIndex] = {
        ...nextWidgets[editingWidgetIndex],
        ...normalizedWidget,
      };
      setDashboard((prev) => ({ ...prev, widgets: nextWidgets }));
    } else {
      setDashboard((prev) => ({
        ...prev,
        widgets: [...prev.widgets, normalizedWidget],
      }));
    }

    setShowWidgetModal(false);
  };

  const removeWidget = (index) => {
    setDashboard((prev) => ({
      ...prev,
      widgets: prev.widgets.filter((_, widgetIndex) => widgetIndex !== index),
    }));
  };

  const handleSave = async () => {
    if (!dashboard.name.trim()) return;

    try {
      setSaving(true);
      const payload = {
        ...dashboard,
        widgets: dashboard.widgets.map((widget, index) => ({
          ...widget,
          positionX: widget.positionX ?? (index % (dashboard.columns || 4)),
          positionY: widget.positionY ?? Math.floor(index / (dashboard.columns || 4)),
          width: widget.width ?? 2,
          height: widget.height ?? 2,
          widgetType: widget.savedReportId ? 'REPORT' : widget.widgetType || 'REPORT',
        })),
      };

      if (isEditing) {
        await reportsApi.updateDashboard(id, payload);
      } else {
        await reportsApi.createDashboard(payload);
      }

      navigate('/analytics/dashboards');
    } catch (error) {
      console.error('Failed to save dashboard:', error);
    } finally {
      setSaving(false);
    }
  };

  if (dashboardLoading || reportsLoading || dashboardLibraryLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-panda-primary"></div>
      </div>
    );
  }

  if (
    !canManageDashboards
    || (isEditing && dashboardResponse?.data?.capabilities?.canEdit === false)
  ) {
    return (
      <div className="space-y-6 p-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Dashboard editing is not available here yet</h1>
              <p className="mt-2 text-sm text-gray-600">
                Production is still serving dashboards from the existing dashboards backend. Viewing is supported in the unified library, but create and edit flows stay disabled until that backend is unified with saved-report widgets.
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
            Dashboards render saved reports. Add report-backed widgets and control their layout here.
          </p>
        </div>
        <div className="flex items-center gap-3">
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
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
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

      {legacyWidgetWarning && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
            <div>
              <h3 className="font-semibold text-gray-900">Legacy widgets detected</h3>
              <p className="mt-1 text-sm text-gray-700">
                {widgetsNeedingReports.length} widget{widgetsNeedingReports.length === 1 ? '' : 's'} on this dashboard do not reference a saved report yet.
                They are preserved here, but new widgets should be report-backed.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Dashboard Widgets</h2>
            <p className="text-sm text-gray-500">
              Each widget should reference a saved report so dashboards render real report output instead of placeholder layouts.
            </p>
          </div>
          <button
            type="button"
            onClick={openAddWidget}
            disabled={savedReports.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add Report Widget
          </button>
        </div>

        {dashboard.widgets.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-300 px-6 py-14 text-center">
            <LayoutGrid className="mx-auto h-12 w-12 text-gray-300" />
            <h3 className="mt-4 text-lg font-semibold text-gray-900">This dashboard requires configuration.</h3>
            <p className="mt-2 text-sm text-gray-500">
              Add one or more saved reports to build the dashboard layout.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4" style={{ gridTemplateColumns: `repeat(${dashboard.columns}, minmax(0, 1fr))` }}>
            {dashboard.widgets.map((widget, index) => {
              const linkedReport = savedReports.find((report) => report.id === widget.savedReportId);
              const isLegacy = !widget.savedReportId;

              return (
                <div
                  key={`${widget.id || 'widget'}-${index}`}
                  className={`rounded-2xl border p-4 ${isLegacy ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}
                  style={{ gridColumn: `span ${Math.min(widget.width || 2, dashboard.columns)}` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Link2 className="h-4 w-4 text-panda-primary" />
                        <h3 className="font-semibold text-gray-900">{widget.title || linkedReport?.name || 'Report Widget'}</h3>
                      </div>
                      <p className="mt-2 text-sm text-gray-500">
                        {isLegacy
                          ? 'Legacy widget without a saved report reference.'
                          : linkedReport?.name || 'Linked saved report'}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
                        <span className="rounded-full bg-white px-2.5 py-1">Width: {widget.width || 2}</span>
                        <span className="rounded-full bg-white px-2.5 py-1">Height: {widget.height || 2}</span>
                        {linkedReport?.chartType && (
                          <span className="rounded-full bg-white px-2.5 py-1">Chart: {linkedReport.chartType}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditWidget(widget, index)}
                        className="rounded-lg bg-white p-2 text-gray-500 hover:bg-gray-100"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeWidget(index)}
                        className="rounded-lg bg-white p-2 text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showWidgetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl">
            <div className="border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingWidgetIndex !== null ? 'Edit Report Widget' : 'Add Report Widget'}
              </h3>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Saved Report *</label>
                <select
                  value={widgetDraft.savedReportId}
                  onChange={(event) => {
                    const selectedReport = savedReports.find((report) => report.id === event.target.value);
                    setWidgetDraft((prev) => ({
                      ...prev,
                      savedReportId: event.target.value,
                      title: prev.title || selectedReport?.name || '',
                    }));
                  }}
                  className="w-full rounded-xl border border-gray-300 px-4 py-2.5 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">Select a report...</option>
                  {savedReports.map((report) => (
                    <option key={report.id} value={report.id}>
                      {report.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Widget Title</label>
                <input
                  type="text"
                  value={widgetDraft.title}
                  onChange={(event) => setWidgetDraft((prev) => ({ ...prev, title: event.target.value }))}
                  className="w-full rounded-xl border border-gray-300 px-4 py-2.5 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  placeholder="Optional override title"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Subtitle</label>
                <input
                  type="text"
                  value={widgetDraft.subtitle || ''}
                  onChange={(event) => setWidgetDraft((prev) => ({ ...prev, subtitle: event.target.value }))}
                  className="w-full rounded-xl border border-gray-300 px-4 py-2.5 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  placeholder="Optional supporting context"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Width</label>
                  <select
                    value={widgetDraft.width}
                    onChange={(event) => setWidgetDraft((prev) => ({ ...prev, width: Number(event.target.value) }))}
                    className="w-full rounded-xl border border-gray-300 px-4 py-2.5 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value={1}>1 column</option>
                    <option value={2}>2 columns</option>
                    <option value={3}>3 columns</option>
                    <option value={4}>4 columns</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Height</label>
                  <select
                    value={widgetDraft.height}
                    onChange={(event) => setWidgetDraft((prev) => ({ ...prev, height: Number(event.target.value) }))}
                    className="w-full rounded-xl border border-gray-300 px-4 py-2.5 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value={1}>1 row</option>
                    <option value={2}>2 rows</option>
                    <option value={3}>3 rows</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setShowWidgetModal(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveWidget}
                disabled={!widgetDraft.savedReportId}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {editingWidgetIndex !== null ? 'Update Widget' : 'Add Widget'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
