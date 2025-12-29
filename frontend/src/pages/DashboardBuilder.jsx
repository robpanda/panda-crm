import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { reportsApi } from '../services/api';
import { GlobalDateRangePicker, KPICard, BarChartWidget, LineChartWidget } from '../components/reports';

const WIDGET_TYPES = [
  { value: 'KPI_CARD', label: 'KPI Card', icon: '🔢', width: 1, height: 1 },
  { value: 'BAR_CHART', label: 'Bar Chart', icon: '📊', width: 2, height: 2 },
  { value: 'LINE_CHART', label: 'Line Chart', icon: '📈', width: 2, height: 2 },
  { value: 'PIE_CHART', label: 'Pie Chart', icon: '🥧', width: 1, height: 2 },
  { value: 'TABLE', label: 'Data Table', icon: '📋', width: 2, height: 2 },
  { value: 'REPORT', label: 'Saved Report', icon: '📑', width: 2, height: 2 },
];

const DATA_SOURCES = [
  { value: 'pipeline', label: 'Pipeline Metrics' },
  { value: 'revenue', label: 'Revenue Metrics' },
  { value: 'leads', label: 'Lead Metrics' },
  { value: 'performance', label: 'Sales Performance' },
];

export default function DashboardBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showWidgetModal, setShowWidgetModal] = useState(false);
  const [editingWidget, setEditingWidget] = useState(null);
  const [savedReports, setSavedReports] = useState([]);

  const [dashboard, setDashboard] = useState({
    name: '',
    description: '',
    layout: 'GRID',
    columns: 4,
    defaultDateRange: 'thisMonth',
    isPublic: false,
    widgets: [],
  });

  const [newWidget, setNewWidget] = useState({
    widgetType: 'KPI_CARD',
    title: '',
    subtitle: '',
    positionX: 0,
    positionY: 0,
    width: 1,
    height: 1,
    dataSource: 'pipeline',
    metricField: 'count',
    savedReportId: null,
  });

  useEffect(() => {
    loadSavedReports();
    if (isEditing) {
      loadDashboard();
    }
  }, [id]);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const response = await reportsApi.getDashboard(id);
      if (response.success) {
        setDashboard(response.data);
      }
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSavedReports = async () => {
    try {
      const response = await reportsApi.getReports();
      if (response.success) {
        setSavedReports(response.data);
      }
    } catch (error) {
      console.error('Failed to load saved reports:', error);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      let response;
      if (isEditing) {
        response = await reportsApi.updateDashboard(id, dashboard);
      } else {
        response = await reportsApi.createDashboard(dashboard);
      }

      if (response.success) {
        navigate('/reports');
      }
    } catch (error) {
      console.error('Failed to save dashboard:', error);
    } finally {
      setSaving(false);
    }
  };

  const openAddWidget = () => {
    setEditingWidget(null);
    setNewWidget({
      widgetType: 'KPI_CARD',
      title: '',
      subtitle: '',
      positionX: 0,
      positionY: Math.max(0, ...dashboard.widgets.map(w => w.positionY + w.height)),
      width: 1,
      height: 1,
      dataSource: 'pipeline',
      metricField: 'count',
      savedReportId: null,
    });
    setShowWidgetModal(true);
  };

  const openEditWidget = (widget, index) => {
    setEditingWidget(index);
    setNewWidget({ ...widget });
    setShowWidgetModal(true);
  };

  const handleWidgetTypeChange = (type) => {
    const widgetConfig = WIDGET_TYPES.find(w => w.value === type);
    setNewWidget(prev => ({
      ...prev,
      widgetType: type,
      width: widgetConfig?.width || 1,
      height: widgetConfig?.height || 1,
    }));
  };

  const saveWidget = () => {
    if (!newWidget.title) return;

    if (editingWidget !== null) {
      // Update existing widget
      const updatedWidgets = [...dashboard.widgets];
      updatedWidgets[editingWidget] = newWidget;
      setDashboard(prev => ({ ...prev, widgets: updatedWidgets }));
    } else {
      // Add new widget
      setDashboard(prev => ({
        ...prev,
        widgets: [...prev.widgets, newWidget],
      }));
    }

    setShowWidgetModal(false);
  };

  const removeWidget = (index) => {
    setDashboard(prev => ({
      ...prev,
      widgets: prev.widgets.filter((_, i) => i !== index),
    }));
  };

  const renderWidgetPreview = (widget) => {
    const widgetType = WIDGET_TYPES.find(w => w.value === widget.widgetType);

    return (
      <div className="h-full flex flex-col">
        <div className="text-xs text-gray-400 mb-1">{widgetType?.icon} {widgetType?.label}</div>
        <div className="font-medium text-gray-900 text-sm truncate">{widget.title}</div>
        {widget.subtitle && (
          <div className="text-xs text-gray-500 truncate">{widget.subtitle}</div>
        )}
        <div className="mt-auto pt-2">
          <div className="text-xs text-gray-400">
            {widget.dataSource && DATA_SOURCES.find(d => d.value === widget.dataSource)?.label}
            {widget.savedReportId && `Report: ${savedReports.find(r => r.id === widget.savedReportId)?.name || 'Unknown'}`}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-panda-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEditing ? 'Edit Dashboard' : 'Create Dashboard'}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/reports')}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !dashboard.name}
            className="px-6 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Dashboard'}
          </button>
        </div>
      </div>

      {/* Dashboard Settings */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Dashboard Settings</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Dashboard Name *
            </label>
            <input
              type="text"
              value={dashboard.name}
              onChange={(e) => setDashboard({ ...dashboard, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
              placeholder="e.g., Sales Overview"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default Date Range
            </label>
            <select
              value={dashboard.defaultDateRange || 'thisMonth'}
              onChange={(e) => setDashboard({ ...dashboard, defaultDateRange: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
            >
              <option value="today">Today</option>
              <option value="thisWeek">This Week</option>
              <option value="thisMonth">This Month</option>
              <option value="thisQuarter">This Quarter</option>
              <option value="thisYear">This Year</option>
            </select>
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <input
              type="text"
              value={dashboard.description || ''}
              onChange={(e) => setDashboard({ ...dashboard, description: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
              placeholder="Brief description..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Grid Columns
            </label>
            <select
              value={dashboard.columns}
              onChange={(e) => setDashboard({ ...dashboard, columns: Number(e.target.value) })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
            >
              <option value={2}>2 columns</option>
              <option value={3}>3 columns</option>
              <option value={4}>4 columns</option>
            </select>
          </div>

          <div className="flex items-center">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={dashboard.isPublic}
                onChange={(e) => setDashboard({ ...dashboard, isPublic: e.target.checked })}
                className="rounded text-panda-primary focus:ring-panda-primary"
              />
              <span className="text-sm text-gray-700">Make this dashboard public</span>
            </label>
          </div>
        </div>
      </div>

      {/* Widgets Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Widgets</h2>
          <button
            onClick={openAddWidget}
            className="px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 text-sm"
          >
            + Add Widget
          </button>
        </div>

        {dashboard.widgets.length === 0 ? (
          <div className="border-2 border-dashed border-gray-200 rounded-lg p-12 text-center">
            <div className="text-gray-400 mb-2">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              </svg>
            </div>
            <p className="text-gray-500">No widgets yet. Click "Add Widget" to get started.</p>
          </div>
        ) : (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: `repeat(${dashboard.columns}, 1fr)` }}
          >
            {dashboard.widgets.map((widget, index) => (
              <div
                key={index}
                className="bg-gray-50 rounded-lg p-4 border border-gray-200 relative group"
                style={{
                  gridColumn: `span ${Math.min(widget.width, dashboard.columns)}`,
                  minHeight: `${widget.height * 100}px`,
                }}
              >
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  <button
                    onClick={() => openEditWidget(widget, index)}
                    className="p-1 bg-white rounded shadow hover:bg-gray-50"
                    title="Edit"
                  >
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => removeWidget(index)}
                    className="p-1 bg-white rounded shadow hover:bg-red-50"
                    title="Remove"
                  >
                    <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                {renderWidgetPreview(widget)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Widget Modal */}
      {showWidgetModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg m-4">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold">
                {editingWidget !== null ? 'Edit Widget' : 'Add Widget'}
              </h3>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Widget Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {WIDGET_TYPES.map(type => (
                    <button
                      key={type.value}
                      onClick={() => handleWidgetTypeChange(type.value)}
                      className={`p-3 border-2 rounded-lg text-center text-sm ${
                        newWidget.widgetType === type.value
                          ? 'border-panda-primary bg-panda-primary/5'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="text-xl mb-1">{type.icon}</div>
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={newWidget.title}
                  onChange={(e) => setNewWidget({ ...newWidget, title: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
                  placeholder="Widget title"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle</label>
                <input
                  type="text"
                  value={newWidget.subtitle || ''}
                  onChange={(e) => setNewWidget({ ...newWidget, subtitle: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
                  placeholder="Optional subtitle"
                />
              </div>

              {newWidget.widgetType === 'REPORT' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Saved Report</label>
                  <select
                    value={newWidget.savedReportId || ''}
                    onChange={(e) => setNewWidget({ ...newWidget, savedReportId: e.target.value || null })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
                  >
                    <option value="">Select a report...</option>
                    {savedReports.map(report => (
                      <option key={report.id} value={report.id}>{report.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data Source</label>
                  <select
                    value={newWidget.dataSource}
                    onChange={(e) => setNewWidget({ ...newWidget, dataSource: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
                  >
                    {DATA_SOURCES.map(source => (
                      <option key={source.value} value={source.value}>{source.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Width (columns)</label>
                  <select
                    value={newWidget.width}
                    onChange={(e) => setNewWidget({ ...newWidget, width: Number(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
                  >
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                    <option value={4}>4</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Height (rows)</label>
                  <select
                    value={newWidget.height}
                    onChange={(e) => setNewWidget({ ...newWidget, height: Number(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
                  >
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowWidgetModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={saveWidget}
                disabled={!newWidget.title}
                className="px-6 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 disabled:opacity-50"
              >
                {editingWidget !== null ? 'Update' : 'Add'} Widget
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
