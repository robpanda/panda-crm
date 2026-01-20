import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Database,
  Users,
  Briefcase,
  Building2,
  UserPlus,
  Package,
  FileText,
  DollarSign,
  Calendar,
  ClipboardList,
  Mail,
  MessageSquare,
  Plus,
  Edit,
  Trash2,
  Save,
  X,
  AlertCircle,
  Shield,
  Workflow,
  Layers,
  Hash,
  Type,
  ToggleLeft,
  CalendarDays,
  ListOrdered,
  Link2,
  ChevronDown,
} from 'lucide-react';
import { setupApi } from '../../services/api';
import AdminLayout from '../../components/AdminLayout';

// Module definitions with their standard fields (alphabetically ordered)
const MODULES = [
  {
    id: 'accounts',
    name: 'Accounts',
    apiName: 'Account',
    icon: Building2,
    description: 'Customer and prospect organizations',
    color: 'bg-purple-100 text-purple-600',
  },
  {
    id: 'campaigns',
    name: 'Campaigns',
    apiName: 'Campaign',
    icon: Mail,
    description: 'Marketing campaigns',
    color: 'bg-pink-100 text-pink-600',
  },
  {
    id: 'cases',
    name: 'Cases',
    apiName: 'Case',
    icon: AlertCircle,
    description: 'Customer service cases',
    color: 'bg-red-100 text-red-600',
  },
  {
    id: 'contacts',
    name: 'Contacts',
    apiName: 'Contact',
    icon: Users,
    description: 'People associated with accounts',
    color: 'bg-blue-100 text-blue-600',
  },
  {
    id: 'invoices',
    name: 'Invoices',
    apiName: 'Invoice',
    icon: DollarSign,
    description: 'Customer invoices and billing',
    color: 'bg-green-100 text-green-600',
  },
  {
    id: 'leads',
    name: 'Leads',
    apiName: 'Lead',
    icon: UserPlus,
    description: 'Potential customers before qualification',
    color: 'bg-emerald-100 text-emerald-600',
  },
  {
    id: 'opportunities',
    name: 'Jobs',
    apiName: 'Opportunity',
    icon: Briefcase,
    description: 'Sales deals and projects',
    color: 'bg-amber-100 text-amber-600',
  },
  {
    id: 'products',
    name: 'Products',
    apiName: 'Product',
    icon: Package,
    description: 'Products and services catalog',
    color: 'bg-indigo-100 text-indigo-600',
  },
  {
    id: 'quotes',
    name: 'Quotes',
    apiName: 'Quote',
    icon: FileText,
    description: 'Price quotes and proposals',
    color: 'bg-cyan-100 text-cyan-600',
  },
  {
    id: 'workorders',
    name: 'Work Orders',
    apiName: 'WorkOrder',
    icon: ClipboardList,
    description: 'Field service work orders',
    color: 'bg-orange-100 text-orange-600',
  },
];

// Field types available for custom fields
const FIELD_TYPES = [
  { id: 'text', name: 'Text', icon: Type, description: 'Single-line text field' },
  { id: 'textarea', name: 'Long Text', icon: FileText, description: 'Multi-line text area' },
  { id: 'number', name: 'Number', icon: Hash, description: 'Numeric values' },
  { id: 'currency', name: 'Currency', icon: DollarSign, description: 'Money values' },
  { id: 'date', name: 'Date', icon: CalendarDays, description: 'Date picker' },
  { id: 'datetime', name: 'Date/Time', icon: Calendar, description: 'Date and time' },
  { id: 'checkbox', name: 'Checkbox', icon: ToggleLeft, description: 'True/false value' },
  { id: 'picklist', name: 'Picklist', icon: ListOrdered, description: 'Dropdown selection' },
  { id: 'multipicklist', name: 'Multi-Select Picklist', icon: Layers, description: 'Multiple selections' },
  { id: 'lookup', name: 'Lookup Relationship', icon: Link2, description: 'Reference to another object' },
  { id: 'email', name: 'Email', icon: Mail, description: 'Email address' },
  { id: 'phone', name: 'Phone', icon: MessageSquare, description: 'Phone number' },
  { id: 'url', name: 'URL', icon: Link2, description: 'Web address' },
  { id: 'percent', name: 'Percent', icon: Hash, description: 'Percentage value' },
];

export default function Setup() {
  const [searchParams, setSearchParams] = useSearchParams();

  // State management
  const [selectedModule, setSelectedModule] = useState(null);
  const [selectedTab, setSelectedTab] = useState('fields');
  const [customFields, setCustomFields] = useState([]);
  const [standardFields, setStandardFields] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Modal states
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [fieldForm, setFieldForm] = useState({
    name: '',
    apiName: '',
    type: 'text',
    description: '',
    required: false,
    unique: false,
    defaultValue: '',
    picklistValues: [],
    lookupObject: '',
    length: 255,
    precision: 18,
    scale: 2,
  });

  // Load selected module from URL params
  useEffect(() => {
    const moduleId = searchParams.get('module') || searchParams.get('object'); // Support legacy 'object' param
    const tab = searchParams.get('tab');
    if (moduleId) {
      const mod = MODULES.find(m => m.id === moduleId);
      if (mod) {
        setSelectedModule(mod);
      }
    }
    if (tab) {
      setSelectedTab(tab);
    }
  }, [searchParams]);

  // Load fields when module is selected
  useEffect(() => {
    if (selectedModule) {
      loadFields(selectedModule.id);
    }
  }, [selectedModule]);

  const loadFields = async (moduleId) => {
    setLoading(true);
    setError(null);
    try {
      // TODO: Backend API endpoints need to be created
      // For now, use the standard fields only
      // const response = await setupApi.getModuleFields(moduleId);
      // setCustomFields(response.customFields || []);
      // setStandardFields(response.standardFields || []);

      // Use fallback standard fields
      setCustomFields([]);
      setStandardFields(getStandardFieldsForModule(moduleId));
    } catch (err) {
      console.error('Failed to load fields:', err);
      setError('Failed to load fields');
      setCustomFields([]);
      setStandardFields(getStandardFieldsForModule(moduleId));
    } finally {
      setLoading(false);
    }
  };

  // Get standard fields for a module (demo data)
  const getStandardFieldsForModule = (moduleId) => {
    const commonFields = [
      { name: 'ID', apiName: 'id', type: 'text', required: true, system: true },
      { name: 'Created At', apiName: 'createdAt', type: 'datetime', system: true },
      { name: 'Updated At', apiName: 'updatedAt', type: 'datetime', system: true },
    ];

    const moduleSpecificFields = {
      leads: [
        { name: 'First Name', apiName: 'firstName', type: 'text', required: true },
        { name: 'Last Name', apiName: 'lastName', type: 'text', required: true },
        { name: 'Email', apiName: 'email', type: 'email' },
        { name: 'Phone', apiName: 'phone', type: 'phone' },
        { name: 'Company', apiName: 'company', type: 'text' },
        { name: 'Status', apiName: 'status', type: 'picklist' },
        { name: 'Source', apiName: 'source', type: 'picklist' },
        { name: 'Lead Score', apiName: 'leadScore', type: 'number' },
      ],
      contacts: [
        { name: 'First Name', apiName: 'firstName', type: 'text', required: true },
        { name: 'Last Name', apiName: 'lastName', type: 'text', required: true },
        { name: 'Email', apiName: 'email', type: 'email' },
        { name: 'Phone', apiName: 'phone', type: 'phone' },
        { name: 'Mobile Phone', apiName: 'mobilePhone', type: 'phone' },
        { name: 'Account', apiName: 'accountId', type: 'lookup' },
        { name: 'Title', apiName: 'title', type: 'text' },
      ],
      accounts: [
        { name: 'Name', apiName: 'name', type: 'text', required: true },
        { name: 'Account Number', apiName: 'accountNumber', type: 'text', unique: true },
        { name: 'Type', apiName: 'type', type: 'picklist' },
        { name: 'Status', apiName: 'status', type: 'picklist' },
        { name: 'Phone', apiName: 'phone', type: 'phone' },
        { name: 'Email', apiName: 'email', type: 'email' },
        { name: 'Billing Address', apiName: 'billingStreet', type: 'textarea' },
      ],
      opportunities: [
        { name: 'Name', apiName: 'name', type: 'text', required: true },
        { name: 'Job ID', apiName: 'jobId', type: 'text', unique: true },
        { name: 'Stage', apiName: 'stage', type: 'picklist', required: true },
        { name: 'Amount', apiName: 'amount', type: 'currency' },
        { name: 'Close Date', apiName: 'closeDate', type: 'date' },
        { name: 'Account', apiName: 'accountId', type: 'lookup' },
        { name: 'Work Type', apiName: 'workType', type: 'picklist' },
        { name: 'Probability', apiName: 'probability', type: 'percent' },
      ],
      workorders: [
        { name: 'Work Order Number', apiName: 'workOrderNumber', type: 'text', unique: true },
        { name: 'Subject', apiName: 'subject', type: 'text', required: true },
        { name: 'Status', apiName: 'status', type: 'picklist' },
        { name: 'Priority', apiName: 'priority', type: 'picklist' },
        { name: 'Opportunity', apiName: 'opportunityId', type: 'lookup' },
        { name: 'Account', apiName: 'accountId', type: 'lookup' },
      ],
      quotes: [
        { name: 'Quote Number', apiName: 'quoteNumber', type: 'text', unique: true },
        { name: 'Name', apiName: 'name', type: 'text', required: true },
        { name: 'Status', apiName: 'status', type: 'picklist' },
        { name: 'Total Amount', apiName: 'totalAmount', type: 'currency' },
        { name: 'Opportunity', apiName: 'opportunityId', type: 'lookup' },
        { name: 'Expiration Date', apiName: 'expirationDate', type: 'date' },
      ],
      invoices: [
        { name: 'Invoice Number', apiName: 'invoiceNumber', type: 'text', unique: true },
        { name: 'Status', apiName: 'status', type: 'picklist' },
        { name: 'Total Amount', apiName: 'totalAmount', type: 'currency' },
        { name: 'Balance Due', apiName: 'balanceDue', type: 'currency' },
        { name: 'Due Date', apiName: 'dueDate', type: 'date' },
        { name: 'Account', apiName: 'accountId', type: 'lookup' },
      ],
      cases: [
        { name: 'Case Number', apiName: 'caseNumber', type: 'text', unique: true },
        { name: 'Subject', apiName: 'subject', type: 'text', required: true },
        { name: 'Status', apiName: 'status', type: 'picklist' },
        { name: 'Priority', apiName: 'priority', type: 'picklist' },
        { name: 'Type', apiName: 'type', type: 'picklist' },
        { name: 'Account', apiName: 'accountId', type: 'lookup' },
        { name: 'Contact', apiName: 'contactId', type: 'lookup' },
      ],
      products: [
        { name: 'Name', apiName: 'name', type: 'text', required: true },
        { name: 'Product Code', apiName: 'productCode', type: 'text', unique: true },
        { name: 'Description', apiName: 'description', type: 'textarea' },
        { name: 'Unit Price', apiName: 'unitPrice', type: 'currency' },
        { name: 'Active', apiName: 'isActive', type: 'checkbox' },
        { name: 'Product Family', apiName: 'family', type: 'picklist' },
      ],
      campaigns: [
        { name: 'Name', apiName: 'name', type: 'text', required: true },
        { name: 'Type', apiName: 'type', type: 'picklist' },
        { name: 'Status', apiName: 'status', type: 'picklist' },
        { name: 'Start Date', apiName: 'startDate', type: 'date' },
        { name: 'End Date', apiName: 'endDate', type: 'date' },
        { name: 'Budget', apiName: 'budgetedCost', type: 'currency' },
      ],
    };

    return [...commonFields, ...(moduleSpecificFields[moduleId] || [])];
  };

  const handleModuleSelect = (mod) => {
    setSelectedModule(mod);
    setSearchParams({ module: mod.id, tab: selectedTab });
  };

  const handleCreateField = () => {
    setEditingField(null);
    setFieldForm({
      name: '',
      apiName: '',
      type: 'text',
      description: '',
      required: false,
      unique: false,
      defaultValue: '',
      picklistValues: [],
      lookupObject: '',
      length: 255,
      precision: 18,
      scale: 2,
    });
    setShowFieldModal(true);
  };

  const handleEditField = (field) => {
    setEditingField(field);
    setFieldForm({
      name: field.name,
      apiName: field.apiName,
      type: field.type,
      description: field.description || '',
      required: field.required || false,
      unique: field.unique || false,
      defaultValue: field.defaultValue || '',
      picklistValues: field.picklistValues || [],
      lookupObject: field.lookupObject || '',
      length: field.length || 255,
      precision: field.precision || 18,
      scale: field.scale || 2,
    });
    setShowFieldModal(true);
  };

  const handleSaveField = async () => {
    try {
      if (editingField) {
        await setupApi.updateCustomField(selectedModule.id, editingField.id, fieldForm);
      } else {
        await setupApi.createCustomField(selectedModule.id, fieldForm);
      }
      loadFields(selectedModule.id);
      setShowFieldModal(false);
    } catch (err) {
      console.error('Failed to save field:', err);
      alert('Failed to save field: ' + err.message);
    }
  };

  const handleDeleteField = async (field) => {
    if (!confirm(`Are you sure you want to delete the field "${field.name}"?`)) return;

    try {
      await setupApi.deleteCustomField(selectedModule.id, field.id);
      loadFields(selectedModule.id);
    } catch (err) {
      console.error('Failed to delete field:', err);
      alert('Failed to delete field: ' + err.message);
    }
  };

  const generateApiName = (name) => {
    return name
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(' ')
      .map((word, index) =>
        index === 0
          ? word.toLowerCase()
          : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      )
      .join('') + '__c';
  };

  // Render module detail tabs
  const ModuleTabs = () => (
    <div className="border-b border-gray-200">
      <nav className="flex space-x-4 px-6">
        {[
          { id: 'fields', label: 'Fields & Relationships' },
          { id: 'layouts', label: 'Page Layouts' },
          { id: 'validation', label: 'Validation Rules' },
          { id: 'triggers', label: 'Triggers' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setSelectedTab(tab.id);
              setSearchParams({ module: selectedModule.id, tab: tab.id });
            }}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              selectedTab === tab.id
                ? 'border-panda-primary text-panda-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );

  // Render fields table
  const FieldsTable = ({ fields, isCustom = false }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Field Label
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                API Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Data Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Required
              </th>
              {isCustom && (
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {fields.map((field, index) => {
              const fieldType = FIELD_TYPES.find(t => t.id === field.type);
              const FieldIcon = fieldType?.icon || Type;

              return (
                <tr key={field.apiName || index} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <FieldIcon className="w-4 h-4 text-gray-400 mr-2" />
                      <span className="text-sm font-medium text-gray-900">{field.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-500 font-mono">{field.apiName}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-500 capitalize">{field.type}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {field.required ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                        Required
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  {isCustom && (
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleEditField(field)}
                          className="p-1.5 text-gray-400 hover:text-panda-primary hover:bg-panda-primary/10 rounded"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteField(field)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {fields.length === 0 && (
              <tr>
                <td colSpan={isCustom ? 5 : 4} className="px-6 py-8 text-center text-gray-500">
                  {isCustom ? 'No custom fields defined yet' : 'No fields found'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  // Render module detail content
  const ModuleDetail = () => {
    return (
      <div className="flex-1 flex flex-col bg-gray-50 h-full">
        {/* Module Selector Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4 flex-1">
              <label className="text-sm font-medium text-gray-700">Module:</label>
              <div className="relative min-w-[300px]">
                <select
                  value={selectedModule?.id || ''}
                  onChange={(e) => {
                    const mod = MODULES.find(m => m.id === e.target.value);
                    if (mod) handleModuleSelect(mod);
                  }}
                  className="w-full pl-4 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none appearance-none bg-white"
                >
                  <option value="">Select a module...</option>
                  {MODULES.map((mod) => (
                    <option key={mod.id} value={mod.id}>
                      {mod.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
              </div>
            </div>
            {selectedModule && (
              <div className="flex items-center space-x-3">
                <span className="text-sm text-gray-500">
                  API Name: <span className="font-mono text-gray-700">{selectedModule.apiName}</span>
                </span>
              </div>
            )}
          </div>
        </div>

        {!selectedModule ? (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <Database className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Select a Module</h3>
              <p className="text-gray-500">Choose a module from the dropdown above to view and manage its fields</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            {/* Module Info Banner */}
            <div className="bg-gradient-to-r from-gray-50 to-white border-b border-gray-200 px-6 py-3">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${selectedModule.color}`}>
                  <selectedModule.icon className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{selectedModule.name}</h2>
                  <p className="text-sm text-gray-500">{selectedModule.description}</p>
                </div>
              </div>
            </div>

        {/* Tabs */}
        <ModuleTabs />

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {selectedTab === 'fields' && (
            <div className="space-y-6">
              {/* Custom Fields Section */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Custom Fields</h3>
                  <button
                    onClick={handleCreateField}
                    className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    New Field
                  </button>
                </div>
                {loading ? (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
                    <div className="animate-spin w-8 h-8 border-2 border-panda-primary border-t-transparent rounded-full mx-auto" />
                  </div>
                ) : (
                  <FieldsTable fields={customFields} isCustom={true} />
                )}
              </div>

              {/* Standard Fields Section */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Standard Fields</h3>
                <FieldsTable fields={standardFields} isCustom={false} />
              </div>
            </div>
          )}

          {selectedTab === 'layouts' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
              <Layers className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Page Layouts</h3>
              <p className="text-gray-500 mb-4">Customize how fields appear on record pages</p>
              <p className="text-sm text-gray-400">Coming soon</p>
            </div>
          )}

          {selectedTab === 'validation' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
              <Shield className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Validation Rules</h3>
              <p className="text-gray-500 mb-4">Create rules to ensure data quality</p>
              <p className="text-sm text-gray-400">Coming soon</p>
            </div>
          )}

          {selectedTab === 'triggers' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
              <Workflow className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Triggers</h3>
              <p className="text-gray-500 mb-4">Automate actions when records change</p>
              <p className="text-sm text-gray-400">Coming soon</p>
            </div>
          )}
        </div>
          </div>
        )}
      </div>
    );
  };

  // Field Creation/Edit Modal
  const FieldModal = () => {
    if (!showFieldModal) return null;

    const selectedFieldType = FIELD_TYPES.find(t => t.id === fieldForm.type);

    return (
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex items-center justify-center min-h-screen px-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowFieldModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingField ? 'Edit Field' : 'New Custom Field'}
              </h3>
              <button
                onClick={() => setShowFieldModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 max-h-[calc(100vh-200px)] overflow-y-auto">
              <div className="space-y-6">
                {/* Field Type Selection */}
                {!editingField && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Field Type
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {FIELD_TYPES.map((type) => (
                        <button
                          key={type.id}
                          onClick={() => setFieldForm({ ...fieldForm, type: type.id })}
                          className={`flex items-center space-x-2 p-3 rounded-lg border transition-colors text-left ${
                            fieldForm.type === type.id
                              ? 'border-panda-primary bg-panda-primary/5'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <type.icon className={`w-5 h-5 ${
                            fieldForm.type === type.id ? 'text-panda-primary' : 'text-gray-400'
                          }`} />
                          <div>
                            <span className={`text-sm font-medium ${
                              fieldForm.type === type.id ? 'text-panda-primary' : 'text-gray-700'
                            }`}>
                              {type.name}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Field Label */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Field Label <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={fieldForm.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      setFieldForm({
                        ...fieldForm,
                        name,
                        apiName: editingField ? fieldForm.apiName : generateApiName(name),
                      });
                    }}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                    placeholder="Enter field label"
                  />
                </div>

                {/* API Name (readonly for existing fields) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    API Name
                  </label>
                  <input
                    type="text"
                    value={fieldForm.apiName}
                    onChange={(e) => setFieldForm({ ...fieldForm, apiName: e.target.value })}
                    disabled={editingField}
                    className={`w-full px-4 py-2.5 border border-gray-200 rounded-lg font-mono text-sm ${
                      editingField ? 'bg-gray-50 text-gray-500' : 'focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none'
                    }`}
                    placeholder="fieldName__c"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={fieldForm.description}
                    onChange={(e) => setFieldForm({ ...fieldForm, description: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none resize-none"
                    placeholder="Describe the purpose of this field"
                  />
                </div>

                {/* Type-specific options */}
                {(fieldForm.type === 'text' || fieldForm.type === 'textarea') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Length
                    </label>
                    <input
                      type="number"
                      value={fieldForm.length}
                      onChange={(e) => setFieldForm({ ...fieldForm, length: parseInt(e.target.value) })}
                      min={1}
                      max={fieldForm.type === 'textarea' ? 131072 : 255}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                    />
                  </div>
                )}

                {(fieldForm.type === 'number' || fieldForm.type === 'currency' || fieldForm.type === 'percent') && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Precision (total digits)
                      </label>
                      <input
                        type="number"
                        value={fieldForm.precision}
                        onChange={(e) => setFieldForm({ ...fieldForm, precision: parseInt(e.target.value) })}
                        min={1}
                        max={18}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Scale (decimal places)
                      </label>
                      <input
                        type="number"
                        value={fieldForm.scale}
                        onChange={(e) => setFieldForm({ ...fieldForm, scale: parseInt(e.target.value) })}
                        min={0}
                        max={fieldForm.precision - 1}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                      />
                    </div>
                  </div>
                )}

                {(fieldForm.type === 'picklist' || fieldForm.type === 'multipicklist') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Picklist Values (one per line)
                    </label>
                    <textarea
                      value={fieldForm.picklistValues.join('\n')}
                      onChange={(e) => setFieldForm({
                        ...fieldForm,
                        picklistValues: e.target.value.split('\n').filter(v => v.trim()),
                      })}
                      rows={5}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none resize-none font-mono text-sm"
                      placeholder="Option 1&#10;Option 2&#10;Option 3"
                    />
                  </div>
                )}

                {fieldForm.type === 'lookup' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Related Object
                    </label>
                    <select
                      value={fieldForm.lookupObject}
                      onChange={(e) => setFieldForm({ ...fieldForm, lookupObject: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                    >
                      <option value="">Select a module...</option>
                      {MODULES.map((mod) => (
                        <option key={mod.id} value={mod.apiName}>
                          {mod.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Field Options */}
                <div className="flex items-center space-x-6">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={fieldForm.required}
                      onChange={(e) => setFieldForm({ ...fieldForm, required: e.target.checked })}
                      className="rounded border-gray-300 text-panda-primary focus:ring-panda-primary"
                    />
                    <span className="text-sm text-gray-700">Required</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={fieldForm.unique}
                      onChange={(e) => setFieldForm({ ...fieldForm, unique: e.target.checked })}
                      className="rounded border-gray-300 text-panda-primary focus:ring-panda-primary"
                    />
                    <span className="text-sm text-gray-700">Unique</span>
                  </label>
                </div>

                {/* Default Value */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Default Value
                  </label>
                  <input
                    type="text"
                    value={fieldForm.defaultValue}
                    onChange={(e) => setFieldForm({ ...fieldForm, defaultValue: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                    placeholder="Optional default value"
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
              <button
                onClick={() => setShowFieldModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveField}
                disabled={!fieldForm.name || !fieldForm.apiName}
                className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4 mr-2" />
                {editingField ? 'Update Field' : 'Create Field'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <AdminLayout>
      <ModuleDetail />
      <FieldModal />
    </AdminLayout>
  );
}
