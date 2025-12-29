import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { reportsApi } from '../services/api';

const REPORT_CATEGORIES = [
  { value: 'SALES', label: 'Sales' },
  { value: 'FINANCIAL', label: 'Financial' },
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'ACTIVITY', label: 'Activity' },
  { value: 'OPERATIONS', label: 'Operations' },
  { value: 'CUSTOM', label: 'Custom' },
];

const CHART_TYPES = [
  { value: 'TABLE', label: 'Table', icon: 'table' },
  { value: 'BAR', label: 'Bar Chart', icon: 'chart-bar' },
  { value: 'LINE', label: 'Line Chart', icon: 'chart-line' },
  { value: 'AREA', label: 'Area Chart', icon: 'chart-area' },
  { value: 'PIE', label: 'Pie Chart', icon: 'chart-pie' },
  { value: 'KPI', label: 'KPI Card', icon: 'hash' },
];

const BASE_OBJECTS = [
  { value: 'Opportunity', label: 'Jobs', fields: ['name', 'stage', 'amount', 'closeDate', 'probability', 'type', 'ownerId', 'createdAt'] },
  { value: 'Account', label: 'Accounts', fields: ['name', 'status', 'type', 'industry', 'revenue', 'createdAt'] },
  { value: 'Lead', label: 'Leads', fields: ['firstName', 'lastName', 'status', 'source', 'createdAt'] },
  { value: 'Contact', label: 'Contacts', fields: ['firstName', 'lastName', 'email', 'phone', 'createdAt'] },
  { value: 'WorkOrder', label: 'Work Orders', fields: ['workOrderNumber', 'status', 'priority', 'createdAt'] },
];

const DATE_RANGE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'thisWeek', label: 'This Week' },
  { value: 'lastWeek', label: 'Last Week' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'lastMonth', label: 'Last Month' },
  { value: 'thisQuarter', label: 'This Quarter' },
  { value: 'thisYear', label: 'This Year' },
  { value: 'rolling30', label: 'Rolling 30 Days' },
  { value: 'rolling90', label: 'Rolling 90 Days' },
];

export default function ReportBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);

  const [report, setReport] = useState({
    name: '',
    description: '',
    category: 'CUSTOM',
    reportType: 'summary',
    chartType: 'TABLE',
    baseObject: 'Opportunity',
    selectedFields: [],
    groupByFields: [],
    filters: [],
    dateRangeField: 'createdAt',
    defaultDateRange: 'thisMonth',
    isPublic: false,
    sharedWithRoles: [],
  });

  useEffect(() => {
    if (isEditing) {
      loadReport();
    }
  }, [id]);

  const loadReport = async () => {
    try {
      setLoading(true);
      const response = await reportsApi.getReport(id);
      if (response.success) {
        setReport(response.data);
      }
    } catch (error) {
      console.error('Failed to load report:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      let response;
      if (isEditing) {
        response = await reportsApi.updateReport(id, report);
      } else {
        response = await reportsApi.createReport(report);
      }

      if (response.success) {
        navigate(`/reports/${response.data.id}`);
      }
    } catch (error) {
      console.error('Failed to save report:', error);
    } finally {
      setSaving(false);
    }
  };

  const selectedBaseObject = BASE_OBJECTS.find(obj => obj.value === report.baseObject);

  const toggleField = (field) => {
    setReport(prev => ({
      ...prev,
      selectedFields: prev.selectedFields.includes(field)
        ? prev.selectedFields.filter(f => f !== field)
        : [...prev.selectedFields, field]
    }));
  };

  const toggleGroupByField = (field) => {
    setReport(prev => ({
      ...prev,
      groupByFields: prev.groupByFields.includes(field)
        ? prev.groupByFields.filter(f => f !== field)
        : [...prev.groupByFields, field]
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-panda-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEditing ? 'Edit Report' : 'Create New Report'}
          </h1>
          <p className="text-gray-500 mt-1">
            Step {step} of 4
          </p>
        </div>
        <button
          onClick={() => navigate('/reports')}
          className="text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
      </div>

      {/* Progress Bar */}
      <div className="flex items-center mb-8">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                s <= step ? 'bg-panda-primary text-white' : 'bg-gray-200 text-gray-500'
              }`}
            >
              {s}
            </div>
            {s < 4 && (
              <div
                className={`w-24 h-1 ${s < step ? 'bg-panda-primary' : 'bg-gray-200'}`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Basic Info */}
      {step === 1 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Report Details</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Report Name *
              </label>
              <input
                type="text"
                value={report.name}
                onChange={(e) => setReport({ ...report, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
                placeholder="e.g., Monthly Sales Summary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={report.description}
                onChange={(e) => setReport({ ...report, description: e.target.value })}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
                placeholder="Brief description of what this report shows..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category
                </label>
                <select
                  value={report.category}
                  onChange={(e) => setReport({ ...report, category: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
                >
                  {REPORT_CATEGORIES.map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Base Object
                </label>
                <select
                  value={report.baseObject}
                  onChange={(e) => setReport({ ...report, baseObject: e.target.value, selectedFields: [], groupByFields: [] })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
                >
                  {BASE_OBJECTS.map(obj => (
                    <option key={obj.value} value={obj.value}>{obj.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Fields Selection */}
      {step === 2 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Select Fields</h2>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Available Fields</h3>
              <div className="border border-gray-200 rounded-lg p-3 space-y-2 max-h-64 overflow-y-auto">
                {selectedBaseObject?.fields.map(field => (
                  <label key={field} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={report.selectedFields.includes(field)}
                      onChange={() => toggleField(field)}
                      className="rounded text-panda-primary focus:ring-panda-primary"
                    />
                    <span className="text-sm">{field}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Group By Fields</h3>
              <div className="border border-gray-200 rounded-lg p-3 space-y-2 max-h-64 overflow-y-auto">
                {selectedBaseObject?.fields.map(field => (
                  <label key={field} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={report.groupByFields.includes(field)}
                      onChange={() => toggleGroupByField(field)}
                      className="rounded text-panda-primary focus:ring-panda-primary"
                    />
                    <span className="text-sm">{field}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Visualization */}
      {step === 3 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Choose Visualization</h2>

          <div className="grid grid-cols-3 gap-4 mb-6">
            {CHART_TYPES.map(chart => (
              <button
                key={chart.value}
                onClick={() => setReport({ ...report, chartType: chart.value })}
                className={`p-4 border-2 rounded-xl text-center transition-all ${
                  report.chartType === chart.value
                    ? 'border-panda-primary bg-panda-primary/5'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="text-2xl mb-2">
                  {chart.value === 'TABLE' && '📊'}
                  {chart.value === 'BAR' && '📶'}
                  {chart.value === 'LINE' && '📈'}
                  {chart.value === 'AREA' && '📉'}
                  {chart.value === 'PIE' && '🥧'}
                  {chart.value === 'KPI' && '🔢'}
                </div>
                <div className="font-medium text-sm">{chart.label}</div>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date Range Field
              </label>
              <select
                value={report.dateRangeField}
                onChange={(e) => setReport({ ...report, dateRangeField: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
              >
                {selectedBaseObject?.fields.filter(f => f.includes('Date') || f.includes('At')).map(field => (
                  <option key={field} value={field}>{field}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default Date Range
              </label>
              <select
                value={report.defaultDateRange}
                onChange={(e) => setReport({ ...report, defaultDateRange: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
              >
                {DATE_RANGE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Sharing */}
      {step === 4 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Sharing & Permissions</h2>

          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={report.isPublic}
                onChange={(e) => setReport({ ...report, isPublic: e.target.checked })}
                className="rounded text-panda-primary focus:ring-panda-primary h-5 w-5"
              />
              <div>
                <div className="font-medium">Make this report public</div>
                <div className="text-sm text-gray-500">All users in your organization can view this report</div>
              </div>
            </label>

            <div className="border-t pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Summary</h3>
              <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-2">
                <div><span className="text-gray-500">Name:</span> {report.name || '(untitled)'}</div>
                <div><span className="text-gray-500">Category:</span> {REPORT_CATEGORIES.find(c => c.value === report.category)?.label}</div>
                <div><span className="text-gray-500">Base Object:</span> {BASE_OBJECTS.find(o => o.value === report.baseObject)?.label}</div>
                <div><span className="text-gray-500">Chart Type:</span> {CHART_TYPES.find(c => c.value === report.chartType)?.label}</div>
                <div><span className="text-gray-500">Fields:</span> {report.selectedFields.length} selected</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between mt-6">
        <button
          onClick={() => setStep(Math.max(1, step - 1))}
          disabled={step === 1}
          className="px-6 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Back
        </button>

        {step < 4 ? (
          <button
            onClick={() => setStep(step + 1)}
            className="px-6 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90"
          >
            Next
          </button>
        ) : (
          <button
            onClick={handleSave}
            disabled={saving || !report.name}
            className="px-6 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Report'}
          </button>
        )}
      </div>
    </div>
  );
}
