import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { reportsApi, modulesApi } from '../services/api';
import {
  Users,
  Building2,
  Contact,
  Briefcase,
  ClipboardList,
  Receipt,
  Percent,
  UserCircle,
  Table,
  BarChart3,
  LineChart,
  PieChart,
  Activity,
  Hash,
  ChevronRight,
  ChevronLeft,
  Check,
  Plus,
  X,
  Filter,
  ArrowUpDown,
  Layers,
  Search,
  FileText,
  Calendar,
  DollarSign,
  Mail,
  Phone,
  MapPin,
  Tag,
  User,
  Clock,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  GripVertical,
  Sparkles,
} from 'lucide-react';

const REPORT_CATEGORIES = [
  { value: 'SALES', label: 'Sales' },
  { value: 'FINANCIAL', label: 'Financial' },
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'ACTIVITY', label: 'Activity' },
  { value: 'OPERATIONS', label: 'Operations' },
  { value: 'CUSTOM', label: 'Custom' },
];

const CHART_TYPES = [
  { value: 'TABLE', label: 'Table', icon: Table },
  { value: 'BAR', label: 'Bar Chart', icon: BarChart3 },
  { value: 'LINE', label: 'Line Chart', icon: LineChart },
  { value: 'AREA', label: 'Area Chart', icon: Activity },
  { value: 'PIE', label: 'Pie Chart', icon: PieChart },
  { value: 'KPI', label: 'KPI Card', icon: Hash },
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

// Step labels for progress bar
const STEP_LABELS = [
  { step: 1, label: 'Basics', description: 'Name & Module' },
  { step: 2, label: 'Fields', description: 'Select Data' },
  { step: 3, label: 'Filters', description: 'Refine Results' },
  { step: 4, label: 'Save', description: 'Review & Finish' },
];

// Field type icons
const FIELD_TYPE_ICONS = {
  string: FileText,
  text: FileText,
  number: Hash,
  currency: DollarSign,
  decimal: DollarSign,
  date: Calendar,
  datetime: Clock,
  boolean: CheckCircle2,
  email: Mail,
  phone: Phone,
  url: FileText,
  enum: Tag,
  relation: Layers,
  user: User,
  address: MapPin,
};

// Field category groupings
const FIELD_CATEGORIES = {
  core: { label: 'Core Fields', priority: 1 },
  dates: { label: 'Dates & Times', priority: 2 },
  financial: { label: 'Financial', priority: 3 },
  contact: { label: 'Contact Info', priority: 4 },
  status: { label: 'Status & Stage', priority: 5 },
  relations: { label: 'Related Data', priority: 6 },
  system: { label: 'System Fields', priority: 7 },
  other: { label: 'Other', priority: 8 },
};

// Categorize a field based on its properties
const categorizeField = (field) => {
  const name = field.id?.toLowerCase() || '';
  const type = field.type?.toLowerCase() || '';

  if (type === 'date' || type === 'datetime' || name.includes('date') || name.includes('time')) {
    return 'dates';
  }
  if (type === 'currency' || type === 'decimal' || name.includes('amount') || name.includes('price') || name.includes('total') || name.includes('value')) {
    return 'financial';
  }
  if (name.includes('email') || name.includes('phone') || name.includes('address')) {
    return 'contact';
  }
  if (name.includes('status') || name.includes('stage') || name.includes('state')) {
    return 'status';
  }
  if (type === 'relation' || name.includes('id') && name !== 'id') {
    return 'relations';
  }
  if (name === 'id' || name.includes('created') || name.includes('updated') || name.includes('deleted')) {
    return 'system';
  }
  if (['name', 'title', 'description', 'type'].some(k => name.includes(k))) {
    return 'core';
  }
  return 'other';
};

// Map module icons
const MODULE_ICONS = {
  leads: Users,
  accounts: Building2,
  contacts: Contact,
  jobs: Briefcase,
  workOrders: ClipboardList,
  invoices: Receipt,
  commissions: Percent,
  users: UserCircle,
};

export default function ReportBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(id);

  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);
  const [filterOperators, setFilterOperators] = useState([]);
  const [fieldSearch, setFieldSearch] = useState('');
  const [showSystemFields, setShowSystemFields] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState(['core', 'dates', 'financial', 'status']);
  const [validationErrors, setValidationErrors] = useState({});

  const [report, setReport] = useState({
    name: '',
    description: '',
    category: 'CUSTOM',
    reportType: 'summary',
    chartType: 'TABLE',
    baseModule: 'jobs', // Changed from baseObject to baseModule
    selectedFields: [],
    groupByFields: [],
    filters: [],
    dateRangeField: 'createdAt',
    defaultDateRange: 'thisMonth',
    isPublic: false,
    sharedWithRoles: [],
    includeRelations: [],
  });

  // Fetch available modules
  const { data: modulesData, isLoading: modulesLoading } = useQuery({
    queryKey: ['modules'],
    queryFn: () => modulesApi.getModules(),
  });

  // Fetch fields for selected module
  const { data: fieldsData, isLoading: fieldsLoading } = useQuery({
    queryKey: ['moduleFields', report.baseModule],
    queryFn: () => modulesApi.getModuleFields(report.baseModule),
    enabled: !!report.baseModule,
  });

  // Fetch relationships for selected module
  const { data: relationsData } = useQuery({
    queryKey: ['moduleRelationships', report.baseModule],
    queryFn: () => modulesApi.getModuleRelationships(report.baseModule),
    enabled: !!report.baseModule,
  });

  // Fetch filter operators on mount
  useEffect(() => {
    const fetchOperators = async () => {
      try {
        const response = await modulesApi.getFilterOperators();
        if (response.success) {
          setFilterOperators(response.data.operators);
        }
      } catch (error) {
        console.error('Failed to fetch operators:', error);
      }
    };
    fetchOperators();
  }, []);

  // Load existing report if editing
  useEffect(() => {
    if (isEditing) {
      loadReport();
    }
  }, [id]);

  const loadReport = async () => {
    try {
      const response = await reportsApi.getSavedReport(id);
      if (response) {
        // Map old baseObject to new baseModule
        const moduleMapping = {
          Opportunity: 'jobs',
          Account: 'accounts',
          Lead: 'leads',
          Contact: 'contacts',
          WorkOrder: 'workOrders',
        };
        setReport({
          ...response,
          baseModule: moduleMapping[response.baseObject] || response.baseModule || 'jobs',
        });
      }
    } catch (error) {
      console.error('Failed to load report:', error);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      // Map baseModule back to baseObject for compatibility
      const moduleToObject = {
        jobs: 'Opportunity',
        accounts: 'Account',
        leads: 'Lead',
        contacts: 'Contact',
        workOrders: 'WorkOrder',
      };

      const saveData = {
        ...report,
        baseObject: moduleToObject[report.baseModule] || report.baseModule,
      };

      let response;
      if (isEditing) {
        response = await reportsApi.updateReport(id, saveData);
      } else {
        response = await reportsApi.createReport(saveData);
      }

      if (response) {
        navigate(`/reports/${response.id || id}`);
      }
    } catch (error) {
      console.error('Failed to save report:', error);
    } finally {
      setSaving(false);
    }
  };

  const modules = modulesData?.data?.modules || [];
  const fields = fieldsData?.data?.fields || [];
  const relationships = relationsData?.data?.relationships || [];

  const selectedModule = modules.find(m => m.id === report.baseModule);

  const toggleField = (fieldId) => {
    setReport(prev => ({
      ...prev,
      selectedFields: prev.selectedFields.includes(fieldId)
        ? prev.selectedFields.filter(f => f !== fieldId)
        : [...prev.selectedFields, fieldId],
    }));
  };

  const toggleGroupByField = (fieldId) => {
    setReport(prev => ({
      ...prev,
      groupByFields: prev.groupByFields.includes(fieldId)
        ? prev.groupByFields.filter(f => f !== fieldId)
        : [...prev.groupByFields, fieldId],
    }));
  };

  const toggleRelation = (relationId) => {
    setReport(prev => ({
      ...prev,
      includeRelations: prev.includeRelations.includes(relationId)
        ? prev.includeRelations.filter(r => r !== relationId)
        : [...prev.includeRelations, relationId],
    }));
  };

  const addFilter = () => {
    setReport(prev => ({
      ...prev,
      filters: [
        ...prev.filters,
        { field: fields[0]?.id || '', operator: 'equals', value: '' },
      ],
    }));
  };

  const updateFilter = (index, key, value) => {
    setReport(prev => ({
      ...prev,
      filters: prev.filters.map((f, i) => (i === index ? { ...f, [key]: value } : f)),
    }));
  };

  const removeFilter = (index) => {
    setReport(prev => ({
      ...prev,
      filters: prev.filters.filter((_, i) => i !== index),
    }));
  };

  // Get groupable fields
  const groupableFields = fields.filter(f => f.groupable);

  // Get date fields for date range
  const dateFields = fields.filter(f => f.type === 'date' || f.type === 'datetime');

  // Get operators for a field type
  const getOperatorsForField = (fieldId) => {
    const field = fields.find(f => f.id === fieldId);
    if (!field) return filterOperators;
    return filterOperators.filter(op => op.types.includes(field.type));
  };

  // Group and filter fields with search
  const groupedFields = useMemo(() => {
    // Filter by search
    let filteredFields = fields;
    if (fieldSearch) {
      const search = fieldSearch.toLowerCase();
      filteredFields = fields.filter(f =>
        f.label?.toLowerCase().includes(search) ||
        f.id?.toLowerCase().includes(search) ||
        f.type?.toLowerCase().includes(search)
      );
    }

    // Filter system fields
    if (!showSystemFields) {
      filteredFields = filteredFields.filter(f => categorizeField(f) !== 'system');
    }

    // Group by category
    const groups = {};
    filteredFields.forEach(field => {
      const category = categorizeField(field);
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(field);
    });

    // Sort categories by priority
    return Object.entries(groups)
      .sort(([a], [b]) => (FIELD_CATEGORIES[a]?.priority || 99) - (FIELD_CATEGORIES[b]?.priority || 99))
      .map(([category, categoryFields]) => ({
        category,
        label: FIELD_CATEGORIES[category]?.label || category,
        fields: categoryFields,
      }));
  }, [fields, fieldSearch, showSystemFields]);

  // Validate current step
  const validateStep = (currentStep) => {
    const errors = {};

    if (currentStep === 1) {
      if (!report.name.trim()) {
        errors.name = 'Report name is required';
      }
      if (!report.baseModule) {
        errors.baseModule = 'Please select a module';
      }
    }

    if (currentStep === 2) {
      if (report.selectedFields.length === 0) {
        errors.fields = 'Please select at least one field';
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle next step with validation
  const handleNextStep = () => {
    if (validateStep(step)) {
      setStep(step + 1);
    }
  };

  // Toggle category expansion
  const toggleCategory = (category) => {
    setExpandedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  // Quick select all fields in a category
  const selectAllInCategory = (categoryFields) => {
    const fieldIds = categoryFields.map(f => f.id);
    const allSelected = fieldIds.every(id => report.selectedFields.includes(id));

    if (allSelected) {
      // Deselect all in category
      setReport(prev => ({
        ...prev,
        selectedFields: prev.selectedFields.filter(id => !fieldIds.includes(id)),
      }));
    } else {
      // Select all in category
      setReport(prev => ({
        ...prev,
        selectedFields: [...new Set([...prev.selectedFields, ...fieldIds])],
      }));
    }
  };

  // Get field icon
  const getFieldIcon = (field) => {
    return FIELD_TYPE_ICONS[field.type] || FileText;
  };

  if (modulesLoading) {
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
          <p className="text-gray-500 mt-1">Step {step} of 4</p>
        </div>
        <button
          onClick={() => navigate('/reports')}
          className="text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
      </div>

      {/* Progress Bar - Enhanced */}
      <div className="flex items-center justify-between mb-8 bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        {STEP_LABELS.map((stepInfo, index) => (
          <div key={stepInfo.step} className="flex items-center flex-1">
            <button
              onClick={() => stepInfo.step < step && setStep(stepInfo.step)}
              disabled={stepInfo.step > step}
              className={`flex items-center gap-3 ${stepInfo.step < step ? 'cursor-pointer' : stepInfo.step === step ? 'cursor-default' : 'cursor-not-allowed'}`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                  stepInfo.step < step
                    ? 'bg-green-500 text-white'
                    : stepInfo.step === step
                    ? 'bg-panda-primary text-white ring-4 ring-panda-primary/20'
                    : 'bg-gray-100 text-gray-400'
                }`}
              >
                {stepInfo.step < step ? <Check className="w-5 h-5" /> : stepInfo.step}
              </div>
              <div className="hidden sm:block">
                <div className={`text-sm font-medium ${stepInfo.step === step ? 'text-panda-primary' : stepInfo.step < step ? 'text-gray-700' : 'text-gray-400'}`}>
                  {stepInfo.label}
                </div>
                <div className="text-xs text-gray-500">{stepInfo.description}</div>
              </div>
            </button>
            {index < STEP_LABELS.length - 1 && (
              <div className="flex-1 mx-4">
                <div className={`h-1 rounded transition-all ${stepInfo.step < step ? 'bg-green-500' : 'bg-gray-200'}`} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Basic Info & Module Selection */}
      {step === 1 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-panda-primary/10 rounded-lg">
              <FileText className="w-6 h-6 text-panda-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Report Details</h2>
              <p className="text-sm text-gray-500">Give your report a name and choose which data to analyze</p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Report Name *
              </label>
              <input
                type="text"
                value={report.name}
                onChange={(e) => {
                  setReport({ ...report, name: e.target.value });
                  if (validationErrors.name) setValidationErrors(prev => ({ ...prev, name: null }));
                }}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-panda-primary ${
                  validationErrors.name ? 'border-red-300 bg-red-50' : 'border-gray-300'
                }`}
                placeholder="e.g., Monthly Sales Summary"
              />
              {validationErrors.name && (
                <p className="text-red-500 text-sm mt-1 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {validationErrors.name}
                </p>
              )}
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

            {/* Visual Chart Type Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Visualization Type
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {CHART_TYPES.map(chart => {
                  const ChartIcon = chart.icon;
                  const isSelected = report.chartType === chart.value;
                  return (
                    <button
                      key={chart.value}
                      onClick={() => setReport({ ...report, chartType: chart.value })}
                      className={`p-3 border-2 rounded-xl text-center transition-all ${
                        isSelected
                          ? 'border-panda-primary bg-panda-primary/5 ring-2 ring-panda-primary/20'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <ChartIcon className={`w-6 h-6 mx-auto mb-1 ${isSelected ? 'text-panda-primary' : 'text-gray-400'}`} />
                      <div className={`text-xs font-medium ${isSelected ? 'text-panda-primary' : 'text-gray-600'}`}>
                        {chart.label}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Module Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Select Module *
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {modules.map(module => {
                  const Icon = MODULE_ICONS[module.id] || Layers;
                  const isSelected = report.baseModule === module.id;
                  return (
                    <button
                      key={module.id}
                      onClick={() =>
                        setReport({
                          ...report,
                          baseModule: module.id,
                          selectedFields: [],
                          groupByFields: [],
                          filters: [],
                          includeRelations: [],
                        })
                      }
                      className={`p-4 border-2 rounded-xl text-left transition-all ${
                        isSelected
                          ? 'border-panda-primary bg-panda-primary/5 ring-2 ring-panda-primary/20'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <Icon className={`w-6 h-6 mb-2 ${isSelected ? 'text-panda-primary' : 'text-gray-400'}`} />
                      <div className={`font-medium text-sm ${isSelected ? 'text-panda-primary' : 'text-gray-700'}`}>
                        {module.name}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {module.fieldCount} fields
                      </div>
                    </button>
                  );
                })}
              </div>
              {selectedModule && (
                <p className="text-sm text-gray-500 mt-2">{selectedModule.description}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Fields Selection - Enhanced */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            {/* Header with search and controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-panda-primary/10 rounded-lg">
                  <Layers className="w-6 h-6 text-panda-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Select Fields</h2>
                  <p className="text-sm text-gray-500">Choose which data columns to include in your report</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  report.selectedFields.length > 0
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {report.selectedFields.length} selected
                </span>
              </div>
            </div>

            {/* Search and filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={fieldSearch}
                  onChange={(e) => setFieldSearch(e.target.value)}
                  placeholder="Search fields by name or type..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
                />
                {fieldSearch && (
                  <button
                    onClick={() => setFieldSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                onClick={() => setShowSystemFields(!showSystemFields)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                  showSystemFields
                    ? 'border-panda-primary bg-panda-primary/5 text-panda-primary'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {showSystemFields ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                <span className="text-sm">System Fields</span>
              </button>
            </div>

            {/* Validation error */}
            {validationErrors.fields && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
                <AlertCircle className="w-5 h-5" />
                <span className="text-sm">{validationErrors.fields}</span>
              </div>
            )}

            {fieldsLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary"></div>
              </div>
            ) : groupedFields.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Search className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>No fields match your search.</p>
                <button
                  onClick={() => setFieldSearch('')}
                  className="mt-2 text-panda-primary hover:underline text-sm"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                {groupedFields.map(group => {
                  const isExpanded = expandedCategories.includes(group.category);
                  const selectedInCategory = group.fields.filter(f => report.selectedFields.includes(f.id)).length;
                  const allSelected = selectedInCategory === group.fields.length;

                  return (
                    <div key={group.category} className="border border-gray-200 rounded-lg overflow-hidden">
                      {/* Category header */}
                      <button
                        onClick={() => toggleCategory(group.category)}
                        className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                          <span className="font-medium text-gray-700">{group.label}</span>
                          <span className="text-xs text-gray-500">({group.fields.length})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {selectedInCategory > 0 && (
                            <span className="px-2 py-0.5 bg-panda-primary/10 text-panda-primary text-xs rounded-full">
                              {selectedInCategory} selected
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              selectAllInCategory(group.fields);
                            }}
                            className={`text-xs px-2 py-1 rounded transition-colors ${
                              allSelected
                                ? 'text-red-600 hover:bg-red-50'
                                : 'text-panda-primary hover:bg-panda-primary/10'
                            }`}
                          >
                            {allSelected ? 'Deselect All' : 'Select All'}
                          </button>
                        </div>
                      </button>

                      {/* Fields in category */}
                      {isExpanded && (
                        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {group.fields.map(field => {
                            const FieldIcon = getFieldIcon(field);
                            const isSelected = report.selectedFields.includes(field.id);
                            return (
                              <label
                                key={field.id}
                                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all border ${
                                  isSelected
                                    ? 'border-panda-primary bg-panda-primary/5'
                                    : 'border-gray-100 hover:bg-gray-50 hover:border-gray-200'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleField(field.id)}
                                  className="rounded text-panda-primary focus:ring-panda-primary"
                                />
                                <FieldIcon className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-panda-primary' : 'text-gray-400'}`} />
                                <div className="flex-1 min-w-0">
                                  <div className={`text-sm font-medium truncate ${isSelected ? 'text-panda-primary' : 'text-gray-700'}`}>
                                    {field.label}
                                  </div>
                                  <div className="text-xs text-gray-500">{field.type}</div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Quick actions footer */}
            {report.selectedFields.length > 0 && (
              <div className="mt-4 pt-4 border-t flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Sparkles className="w-4 h-4" />
                  <span>Selected fields will appear as columns in your report</span>
                </div>
                <button
                  onClick={() => setReport(prev => ({ ...prev, selectedFields: [] }))}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Clear Selection
                </button>
              </div>
            )}
          </div>

          {/* Cross-Module Relationships */}
          {relationships.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Layers className="w-5 h-5 text-panda-primary" />
                <h2 className="text-lg font-semibold">Include Related Modules</h2>
              </div>
              <p className="text-sm text-gray-500 mb-4">
                Pull in fields from related modules for cross-module reporting.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {relationships.map(rel => {
                  const Icon = MODULE_ICONS[rel.module] || Layers;
                  return (
                    <label
                      key={rel.id}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all border ${
                        report.includeRelations.includes(rel.id)
                          ? 'border-panda-primary bg-panda-primary/5'
                          : 'border-gray-100 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={report.includeRelations.includes(rel.id)}
                        onChange={() => toggleRelation(rel.id)}
                        className="rounded text-panda-primary focus:ring-panda-primary"
                      />
                      <Icon className="w-5 h-5 text-gray-400" />
                      <div>
                        <div className="text-sm font-medium">{rel.label}</div>
                        <div className="text-xs text-gray-500">{rel.type}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Group By */}
          {groupableFields.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <ArrowUpDown className="w-5 h-5 text-panda-primary" />
                <h2 className="text-lg font-semibold">Group By (Optional)</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {groupableFields.map(field => (
                  <label
                    key={field.id}
                    className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all border ${
                      report.groupByFields.includes(field.id)
                        ? 'border-panda-primary bg-panda-primary/5'
                        : 'border-gray-100 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={report.groupByFields.includes(field.id)}
                      onChange={() => toggleGroupByField(field.id)}
                      className="rounded text-panda-primary focus:ring-panda-primary"
                    />
                    <span className="text-sm">{field.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Filters & Date Range */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-panda-primary" />
                <h2 className="text-lg font-semibold">Filters</h2>
              </div>
              <button
                onClick={addFilter}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90"
              >
                <Plus className="w-4 h-4" />
                Add Filter
              </button>
            </div>

            {report.filters.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                No filters added. Click "Add Filter" to narrow your results.
              </p>
            ) : (
              <div className="space-y-3">
                {report.filters.map((filter, index) => (
                  <div key={index} className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                    <select
                      value={filter.field}
                      onChange={(e) => updateFilter(index, 'field', e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      {fields.filter(f => f.filterable).map(field => (
                        <option key={field.id} value={field.id}>{field.label}</option>
                      ))}
                    </select>
                    <select
                      value={filter.operator}
                      onChange={(e) => updateFilter(index, 'operator', e.target.value)}
                      className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      {getOperatorsForField(filter.field).map(op => (
                        <option key={op.id} value={op.id}>{op.label}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={filter.value}
                      onChange={(e) => updateFilter(index, 'value', e.target.value)}
                      placeholder="Value"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <button
                      onClick={() => removeFilter(index)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold mb-4">Date Range Settings</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date Field
                </label>
                <select
                  value={report.dateRangeField}
                  onChange={(e) => setReport({ ...report, dateRangeField: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
                >
                  {dateFields.map(field => (
                    <option key={field.id} value={field.id}>{field.label}</option>
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
        </div>
      )}

      {/* Step 4: Review & Save - Enhanced */}
      {step === 4 && (
        <div className="space-y-6">
          {/* Report Preview Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-r from-panda-primary to-panda-secondary p-6 text-white">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold">{report.name || 'Untitled Report'}</h2>
                  {report.description && (
                    <p className="text-white/80 mt-1">{report.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {(() => {
                    const ChartIcon = CHART_TYPES.find(c => c.value === report.chartType)?.icon || Table;
                    return <ChartIcon className="w-8 h-8 text-white/80" />;
                  })()}
                </div>
              </div>
              <div className="flex items-center gap-4 mt-4">
                <span className="px-3 py-1 bg-white/20 rounded-full text-sm">
                  {REPORT_CATEGORIES.find(c => c.value === report.category)?.label}
                </span>
                <span className="px-3 py-1 bg-white/20 rounded-full text-sm">
                  {selectedModule?.name || report.baseModule}
                </span>
                <span className="px-3 py-1 bg-white/20 rounded-full text-sm">
                  {CHART_TYPES.find(c => c.value === report.chartType)?.label}
                </span>
              </div>
            </div>

            <div className="p-6">
              {/* Summary Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-3xl font-bold text-panda-primary">{report.selectedFields.length}</div>
                  <div className="text-sm text-gray-500">Fields Selected</div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-3xl font-bold text-panda-primary">{report.filters.length}</div>
                  <div className="text-sm text-gray-500">Filters Applied</div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-3xl font-bold text-panda-primary">{report.groupByFields.length}</div>
                  <div className="text-sm text-gray-500">Group By Fields</div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-3xl font-bold text-panda-primary">{report.includeRelations.length}</div>
                  <div className="text-sm text-gray-500">Related Modules</div>
                </div>
              </div>

              {/* Selected Fields Preview */}
              {report.selectedFields.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Selected Fields</h3>
                  <div className="flex flex-wrap gap-2">
                    {report.selectedFields.slice(0, 10).map(fieldId => {
                      const field = fields.find(f => f.id === fieldId);
                      return (
                        <span key={fieldId} className="px-3 py-1 bg-panda-primary/10 text-panda-primary text-sm rounded-full">
                          {field?.label || fieldId}
                        </span>
                      );
                    })}
                    {report.selectedFields.length > 10 && (
                      <span className="px-3 py-1 bg-gray-100 text-gray-600 text-sm rounded-full">
                        +{report.selectedFields.length - 10} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Date Range */}
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                <Calendar className="w-4 h-4" />
                <span>Default date range: <strong>{DATE_RANGE_OPTIONS.find(d => d.value === report.defaultDateRange)?.label}</strong></span>
                {report.dateRangeField && (
                  <span className="text-gray-400">
                    (based on {fields.find(f => f.id === report.dateRangeField)?.label || report.dateRangeField})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Sharing Settings */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold mb-4">Sharing Settings</h3>
            <label className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
              <input
                type="checkbox"
                checked={report.isPublic}
                onChange={(e) => setReport({ ...report, isPublic: e.target.checked })}
                className="rounded text-panda-primary focus:ring-panda-primary h-5 w-5"
              />
              <div className="flex-1">
                <div className="font-medium flex items-center gap-2">
                  {report.isPublic ? <Eye className="w-4 h-4 text-green-500" /> : <EyeOff className="w-4 h-4 text-gray-400" />}
                  {report.isPublic ? 'Public Report' : 'Private Report'}
                </div>
                <div className="text-sm text-gray-500">
                  {report.isPublic
                    ? 'All users in your organization can view this report'
                    : 'Only you can view this report'}
                </div>
              </div>
            </label>
          </div>
        </div>
      )}

      {/* Navigation Buttons - Enhanced */}
      <div className="flex items-center justify-between mt-6 bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <button
          onClick={() => {
            setValidationErrors({});
            setStep(Math.max(1, step - 1));
          }}
          disabled={step === 1}
          className="flex items-center gap-2 px-6 py-2.5 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>

        <div className="flex items-center gap-3">
          {/* Skip to step buttons */}
          {step < 4 && step > 1 && (
            <button
              onClick={() => {
                if (validateStep(step)) {
                  setStep(4);
                }
              }}
              className="text-sm text-gray-500 hover:text-panda-primary"
            >
              Skip to Review
            </button>
          )}

          {step < 4 ? (
            <button
              onClick={handleNextStep}
              className="flex items-center gap-2 px-6 py-2.5 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 transition-colors shadow-sm"
            >
              {step === 3 ? 'Review Report' : 'Continue'}
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving || !report.name || report.selectedFields.length === 0}
              className="flex items-center gap-2 px-8 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  {isEditing ? 'Update Report' : 'Create Report'}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
