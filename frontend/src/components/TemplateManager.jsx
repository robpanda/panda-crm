import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  Plus,
  Mail,
  MessageSquare,
  Search,
  Edit,
  Trash2,
  Copy,
  FileText,
  Tag,
  Save,
  Eye,
  RefreshCw,
  AlertCircle,
  Check,
} from 'lucide-react';
import { templatesApi } from '../services/api';

const MERGE_FIELDS = [
  { key: '{{firstName}}', label: 'First Name', description: 'Contact first name' },
  { key: '{{lastName}}', label: 'Last Name', description: 'Contact last name' },
  { key: '{{fullName}}', label: 'Full Name', description: 'Contact full name' },
  { key: '{{email}}', label: 'Email', description: 'Contact email address' },
  { key: '{{phone}}', label: 'Phone', description: 'Contact phone number' },
  { key: '{{companyName}}', label: 'Company', description: 'Account/company name' },
  { key: '{{address}}', label: 'Address', description: 'Street address' },
  { key: '{{city}}', label: 'City', description: 'City' },
  { key: '{{state}}', label: 'State', description: 'State' },
  { key: '{{zipCode}}', label: 'Zip Code', description: 'Postal code' },
  { key: '{{jobNumber}}', label: 'Job Number', description: 'Job/Project ID' },
  { key: '{{opportunityName}}', label: 'Opportunity', description: 'Opportunity name' },
  { key: '{{appointmentDate}}', label: 'Appointment Date', description: 'Scheduled appointment date' },
  { key: '{{appointmentTime}}', label: 'Appointment Time', description: 'Scheduled appointment time' },
];

const TEMPLATE_CATEGORIES = [
  'General',
  'Appointment',
  'Follow-up',
  'Marketing',
  'Confirmation',
  'Reminder',
  'Thank You',
  'Insurance',
  'Retail',
];

export default function TemplateManager({ isOpen, onClose }) {
  const queryClient = useQueryClient();
  const [selectedType, setSelectedType] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState(null);

  // Fetch templates
  const { data: templatesData, isLoading, error, refetch } = useQuery({
    queryKey: ['templates', { type: selectedType, category: selectedCategory }],
    queryFn: () => templatesApi.getTemplates({
      type: selectedType !== 'all' ? selectedType.toUpperCase() : undefined,
      category: selectedCategory !== 'all' ? selectedCategory : undefined,
    }),
    enabled: isOpen,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data) => templatesApi.createTemplate(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['templates']);
      setShowEditor(false);
      setEditingTemplate(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => templatesApi.updateTemplate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['templates']);
      setShowEditor(false);
      setEditingTemplate(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => templatesApi.deleteTemplate(id),
    onSuccess: () => queryClient.invalidateQueries(['templates']),
  });

  const templates = templatesData?.data || [];

  const filteredTemplates = templates.filter((template) =>
    template.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    template.subject?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleNewTemplate = (type = null) => {
    setEditingTemplate({
      name: '',
      type: type || 'SMS',
      category: 'General',
      subject: '',
      body: '',
      variables: [],
      isActive: true,
    });
    setShowEditor(true);
  };

  const handleEditTemplate = (template) => {
    setEditingTemplate({ ...template });
    setShowEditor(true);
  };

  const handleDuplicateTemplate = (template) => {
    setEditingTemplate({
      ...template,
      id: undefined,
      name: `${template.name} (Copy)`,
    });
    setShowEditor(true);
  };

  const handleDeleteTemplate = async (template) => {
    if (confirm(`Delete template "${template.name}"? This action cannot be undone.`)) {
      deleteMutation.mutate(template.id);
    }
  };

  const handleSaveTemplate = () => {
    if (!editingTemplate.name || !editingTemplate.body) {
      alert('Please enter a name and message body.');
      return;
    }

    // Extract variables from body
    const variableMatches = editingTemplate.body.match(/\{\{[^}]+\}\}/g) || [];
    const variables = [...new Set(variableMatches.map(v => v.replace(/[{}]/g, '')))];

    const templateData = {
      ...editingTemplate,
      variables,
    };

    if (editingTemplate.id) {
      updateMutation.mutate({ id: editingTemplate.id, data: templateData });
    } else {
      createMutation.mutate(templateData);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Message Templates</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Create and manage reusable templates for your campaigns
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {showEditor ? (
          /* Template Editor */
          <TemplateEditor
            template={editingTemplate}
            onChange={setEditingTemplate}
            onSave={handleSaveTemplate}
            onCancel={() => {
              setShowEditor(false);
              setEditingTemplate(null);
            }}
            isSaving={createMutation.isPending || updateMutation.isPending}
          />
        ) : (
          <>
            {/* Filters */}
            <div className="px-6 py-4 border-b border-gray-200 flex flex-col md:flex-row md:items-center gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search templates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                />
              </div>

              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="all">All Types</option>
                <option value="email">Email</option>
                <option value="sms">SMS</option>
              </select>

              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="all">All Categories</option>
                {TEMPLATE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>

              <button
                onClick={() => handleNewTemplate()}
                className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg font-medium hover:opacity-90"
              >
                <Plus className="w-5 h-5 mr-2" />
                New Template
              </button>
            </div>

            {/* Templates List */}
            <div className="flex-1 overflow-y-auto p-6">
              {isLoading ? (
                <div className="text-center py-8">
                  <RefreshCw className="w-8 h-8 mx-auto text-gray-400 animate-spin mb-3" />
                  <p className="text-gray-500">Loading templates...</p>
                </div>
              ) : error ? (
                <div className="text-center py-8">
                  <AlertCircle className="w-8 h-8 mx-auto text-red-400 mb-3" />
                  <p className="text-red-600">Failed to load templates</p>
                  <button onClick={() => refetch()} className="mt-2 text-sm text-panda-primary hover:underline">
                    Retry
                  </button>
                </div>
              ) : filteredTemplates.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500">No templates found</p>
                  <div className="mt-4 flex justify-center gap-2">
                    <button
                      onClick={() => handleNewTemplate('SMS')}
                      className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200"
                    >
                      <MessageSquare className="w-4 h-4 inline mr-1" />
                      Create SMS Template
                    </button>
                    <button
                      onClick={() => handleNewTemplate('EMAIL')}
                      className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
                    >
                      <Mail className="w-4 h-4 inline mr-1" />
                      Create Email Template
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredTemplates.map((template) => (
                    <div
                      key={template.id}
                      className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            template.type === 'EMAIL' ? 'bg-blue-100' : 'bg-green-100'
                          }`}>
                            {template.type === 'EMAIL' ? (
                              <Mail className="w-4 h-4 text-blue-600" />
                            ) : (
                              <MessageSquare className="w-4 h-4 text-green-600" />
                            )}
                          </div>
                          <div>
                            <h3 className="font-medium text-gray-900">{template.name}</h3>
                            <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                              <span className="px-2 py-0.5 bg-gray-100 rounded-full">{template.category || 'General'}</span>
                              {template.isActive === false && (
                                <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full">Inactive</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setPreviewTemplate(template)}
                            className="p-1.5 hover:bg-gray-100 rounded-lg"
                            title="Preview"
                          >
                            <Eye className="w-4 h-4 text-gray-500" />
                          </button>
                          <button
                            onClick={() => handleEditTemplate(template)}
                            className="p-1.5 hover:bg-gray-100 rounded-lg"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4 text-blue-500" />
                          </button>
                          <button
                            onClick={() => handleDuplicateTemplate(template)}
                            className="p-1.5 hover:bg-gray-100 rounded-lg"
                            title="Duplicate"
                          >
                            <Copy className="w-4 h-4 text-gray-500" />
                          </button>
                          <button
                            onClick={() => handleDeleteTemplate(template)}
                            className="p-1.5 hover:bg-gray-100 rounded-lg"
                            title="Delete"
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </button>
                        </div>
                      </div>

                      {template.subject && (
                        <p className="text-sm text-gray-700 font-medium mb-1 truncate">
                          {template.subject}
                        </p>
                      )}
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {template.body?.replace(/<[^>]*>/g, '') || 'No content'}
                      </p>

                      {template.variables?.length > 0 && (
                        <div className="mt-3 flex items-center gap-1 flex-wrap">
                          <Tag className="w-3 h-3 text-gray-400" />
                          {template.variables.slice(0, 3).map((v) => (
                            <span key={v} className="text-xs px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded">
                              {v}
                            </span>
                          ))}
                          {template.variables.length > 3 && (
                            <span className="text-xs text-gray-400">+{template.variables.length - 3} more</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Preview Modal */}
        {previewTemplate && (
          <TemplatePreviewModal
            template={previewTemplate}
            onClose={() => setPreviewTemplate(null)}
          />
        )}
      </div>
    </div>
  );
}

// Template Editor Component
function TemplateEditor({ template, onChange, onSave, onCancel, isSaving }) {
  const [activeTab, setActiveTab] = useState('content');

  const handleInsertMergeField = (field) => {
    const textarea = document.getElementById('template-body');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newBody = template.body.substring(0, start) + field + template.body.substring(end);
    onChange({ ...template, body: newBody });

    // Reset cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + field.length, start + field.length);
    }, 0);
  };

  const charCount = template.body?.length || 0;
  const smsSegments = Math.ceil(charCount / 160) || 1;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Editor Header */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">
          {template.id ? 'Edit Template' : 'New Template'}
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={isSaving || !template.name || !template.body}
            className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
          >
            {isSaving ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {template.id ? 'Update' : 'Save'} Template
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Template Name *
              </label>
              <input
                type="text"
                value={template.name}
                onChange={(e) => onChange({ ...template, name: e.target.value })}
                placeholder="e.g., Appointment Reminder"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={template.type}
                  onChange={(e) => onChange({ ...template, type: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="SMS">SMS</option>
                  <option value="EMAIL">Email</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={template.category || 'General'}
                  onChange={(e) => onChange({ ...template, category: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  {TEMPLATE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Subject (Email only) */}
          {template.type === 'EMAIL' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Subject
              </label>
              <input
                type="text"
                value={template.subject || ''}
                onChange={(e) => onChange({ ...template, subject: e.target.value })}
                placeholder="e.g., Your Appointment is Confirmed"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
              />
            </div>
          )}

          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="flex gap-4">
              <button
                onClick={() => setActiveTab('content')}
                className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'content'
                    ? 'border-panda-primary text-panda-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Content
              </button>
              <button
                onClick={() => setActiveTab('mergeFields')}
                className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'mergeFields'
                    ? 'border-panda-primary text-panda-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Merge Fields
              </button>
            </nav>
          </div>

          {activeTab === 'content' ? (
            /* Message Body */
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Message Body *
              </label>
              <textarea
                id="template-body"
                value={template.body}
                onChange={(e) => onChange({ ...template, body: e.target.value })}
                placeholder={template.type === 'EMAIL'
                  ? "Enter your email content here. You can use {{firstName}}, {{lastName}}, etc."
                  : "Enter your SMS message here. You can use {{firstName}}, {{lastName}}, etc."
                }
                rows={template.type === 'EMAIL' ? 12 : 6}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary font-mono text-sm"
              />

              {/* Character Count (SMS) */}
              {template.type === 'SMS' && (
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className={charCount > 160 ? 'text-orange-600' : 'text-gray-500'}>
                    {charCount} characters
                  </span>
                  <span className={smsSegments > 1 ? 'text-orange-600' : 'text-gray-500'}>
                    {smsSegments} SMS segment{smsSegments > 1 ? 's' : ''}
                    {smsSegments > 1 && ' (~$0.015 each)'}
                  </span>
                </div>
              )}
            </div>
          ) : (
            /* Merge Fields */
            <div>
              <p className="text-sm text-gray-600 mb-4">
                Click a merge field to insert it at the cursor position in your message.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {MERGE_FIELDS.map((field) => (
                  <button
                    key={field.key}
                    onClick={() => handleInsertMergeField(field.key)}
                    className="flex flex-col items-start p-3 bg-gray-50 hover:bg-purple-50 border border-gray-200 hover:border-purple-300 rounded-lg text-left transition-colors"
                  >
                    <span className="font-mono text-sm text-purple-600">{field.key}</span>
                    <span className="text-xs text-gray-500 mt-0.5">{field.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Active Toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => onChange({ ...template, isActive: !template.isActive })}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                template.isActive !== false ? 'bg-green-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  template.isActive !== false ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <span className="text-sm text-gray-700">
              {template.isActive !== false ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Template Preview Modal
function TemplatePreviewModal({ template, onClose }) {
  const sampleData = {
    firstName: 'John',
    lastName: 'Smith',
    fullName: 'John Smith',
    email: 'john.smith@example.com',
    phone: '(555) 123-4567',
    companyName: 'ABC Company',
    address: '123 Main St',
    city: 'Baltimore',
    state: 'MD',
    zipCode: '21201',
    jobNumber: 'JOB-2024-1234',
    opportunityName: 'New Roof Installation',
    appointmentDate: 'January 15, 2026',
    appointmentTime: '10:00 AM',
  };

  const previewContent = (template.body || '').replace(
    /\{\{(\w+)\}\}/g,
    (match, key) => sampleData[key] || match
  );

  const previewSubject = (template.subject || '').replace(
    /\{\{(\w+)\}\}/g,
    (match, key) => sampleData[key] || match
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-gray-500" />
            <h3 className="font-semibold text-gray-900">Template Preview</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className={`rounded-xl border-2 overflow-hidden ${
            template.type === 'EMAIL' ? 'border-blue-200' : 'border-green-200'
          }`}>
            <div className={`px-4 py-2 flex items-center gap-2 ${
              template.type === 'EMAIL' ? 'bg-blue-50' : 'bg-green-50'
            }`}>
              {template.type === 'EMAIL' ? (
                <Mail className="w-4 h-4 text-blue-600" />
              ) : (
                <MessageSquare className="w-4 h-4 text-green-600" />
              )}
              <span className="text-sm font-medium text-gray-700">
                {template.type === 'EMAIL' ? 'Email Preview' : 'SMS Preview'}
              </span>
            </div>

            <div className="p-4 bg-white">
              {template.type === 'EMAIL' && previewSubject && (
                <div className="mb-3 pb-3 border-b border-gray-200">
                  <span className="text-sm text-gray-500">Subject: </span>
                  <span className="text-sm font-medium text-gray-900">{previewSubject}</span>
                </div>
              )}

              {template.type === 'EMAIL' ? (
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: previewContent }}
                />
              ) : (
                <div className="bg-green-100 text-green-900 rounded-2xl rounded-bl-sm px-4 py-3 max-w-[280px] text-sm">
                  {previewContent}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-800">
              <strong>Note:</strong> This preview uses sample data. Actual merge fields will be replaced
              with real contact data when the message is sent.
            </p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
