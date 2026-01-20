import { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  FileText,
  Mail,
  MessageSquare,
  File,
  Edit,
  Trash2,
  Copy,
  Eye,
  ChevronDown,
  Tag,
  Clock,
} from 'lucide-react';
import api from '../../services/api';
import AdminLayout from '../../components/AdminLayout';

const templateTypes = {
  email: { icon: Mail, label: 'Email', color: 'bg-blue-100 text-blue-600' },
  sms: { icon: MessageSquare, label: 'SMS', color: 'bg-green-100 text-green-600' },
  document: { icon: File, label: 'Document', color: 'bg-purple-100 text-purple-600' },
  contract: { icon: FileText, label: 'Contract', color: 'bg-orange-100 text-orange-600' },
};

const categories = [
  'All',
  'Sales',
  'Onboarding',
  'Project Updates',
  'Scheduling',
  'Billing',
  'Follow-up',
  'Contracts',
];

export default function Templates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, [typeFilter, categoryFilter]);

  const loadTemplates = async () => {
    try {
      // const response = await api.get('/templates', { params: { type: typeFilter, category: categoryFilter } });
      // setTemplates(response.data);
      // Mock data
      setTemplates([
        {
          id: '1',
          name: 'Welcome Email',
          type: 'email',
          category: 'Onboarding',
          subject: 'Welcome to Panda Exteriors!',
          content: 'Hi {{contact.firstName}},\n\nWelcome to Panda Exteriors! We\'re excited to work with you on your home improvement project.\n\nYour dedicated representative {{rep.name}} will be reaching out shortly.\n\nBest regards,\nThe Panda Team',
          variables: ['contact.firstName', 'rep.name'],
          usageCount: 245,
          lastUsed: '2025-12-17',
          createdBy: 'System',
          isActive: true,
        },
        {
          id: '2',
          name: 'Appointment Reminder',
          type: 'sms',
          category: 'Scheduling',
          content: 'Hi {{contact.firstName}}, this is a reminder of your appointment with Panda Exteriors tomorrow at {{appointment.time}}. Reply CONFIRM to confirm or call us to reschedule.',
          variables: ['contact.firstName', 'appointment.time'],
          usageCount: 1823,
          lastUsed: '2025-12-18',
          createdBy: 'Admin',
          isActive: true,
        },
        {
          id: '3',
          name: 'Invoice Due Reminder',
          type: 'email',
          category: 'Billing',
          subject: 'Payment Reminder - Invoice #{{invoice.number}}',
          content: 'Dear {{contact.firstName}},\n\nThis is a friendly reminder that invoice #{{invoice.number}} for {{invoice.amount}} is due on {{invoice.dueDate}}.\n\nPlease click here to make a payment: {{payment.link}}\n\nThank you for your business!',
          variables: ['contact.firstName', 'invoice.number', 'invoice.amount', 'invoice.dueDate', 'payment.link'],
          usageCount: 567,
          lastUsed: '2025-12-16',
          createdBy: 'System',
          isActive: true,
        },
        {
          id: '4',
          name: 'Project Complete - Review Request',
          type: 'sms',
          category: 'Follow-up',
          content: 'Hi {{contact.firstName}}! Your project is complete. We\'d love your feedback! Please leave us a review: {{review.link}} - Panda Exteriors',
          variables: ['contact.firstName', 'review.link'],
          usageCount: 892,
          lastUsed: '2025-12-15',
          createdBy: 'Marketing',
          isActive: true,
        },
        {
          id: '5',
          name: 'Standard Service Agreement',
          type: 'contract',
          category: 'Contracts',
          content: 'SERVICE AGREEMENT\n\nThis agreement is entered into between Panda Exteriors ("Company") and {{customer.name}} ("Customer")...',
          variables: ['customer.name', 'project.address', 'project.scope', 'project.amount'],
          usageCount: 156,
          lastUsed: '2025-12-14',
          createdBy: 'Legal',
          isActive: true,
        },
        {
          id: '6',
          name: 'Change Order Template',
          type: 'document',
          category: 'Contracts',
          content: 'CHANGE ORDER\n\nProject: {{project.name}}\nOriginal Amount: {{project.originalAmount}}\nChange Amount: {{change.amount}}\nNew Total: {{project.newTotal}}',
          variables: ['project.name', 'project.originalAmount', 'change.amount', 'project.newTotal'],
          usageCount: 89,
          lastUsed: '2025-12-10',
          createdBy: 'Operations',
          isActive: false,
        },
      ]);
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this template?')) return;
    // await api.delete(`/templates/${id}`);
    setTemplates(prev => prev.filter(t => t.id !== id));
  };

  const handleDuplicate = async (template) => {
    // const response = await api.post('/templates', { ...template, name: `${template.name} (Copy)` });
    const newTemplate = {
      ...template,
      id: String(templates.length + 1),
      name: `${template.name} (Copy)`,
      usageCount: 0,
      lastUsed: null,
    };
    setTemplates(prev => [...prev, newTemplate]);
  };

  const handleToggleActive = async (id) => {
    setTemplates(prev =>
      prev.map(t => t.id === id ? { ...t, isActive: !t.isActive } : t)
    );
  };

  const filteredTemplates = templates.filter(t => {
    const matchesSearch =
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || t.type === typeFilter;
    const matchesCategory = categoryFilter === 'All' || t.category === categoryFilter;
    return matchesSearch && matchesType && matchesCategory;
  });

  const PreviewModal = ({ template, onClose }) => {
    if (!template) return null;
    const TypeIcon = templateTypes[template.type]?.icon || FileText;

    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`p-2 rounded-lg ${templateTypes[template.type]?.color}`}>
                <TypeIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{template.name}</h3>
                <p className="text-sm text-gray-500">{template.category}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <span className="sr-only">Close</span>
              ×
            </button>
          </div>
          <div className="p-4 overflow-y-auto max-h-[60vh]">
            {template.subject && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-500 mb-1">Subject</label>
                <p className="text-gray-900">{template.subject}</p>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Content</label>
              <div className="bg-gray-50 rounded-lg p-4 whitespace-pre-wrap font-mono text-sm">
                {template.content}
              </div>
            </div>
            {template.variables?.length > 0 && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-500 mb-2">Variables</label>
                <div className="flex flex-wrap gap-2">
                  {template.variables.map((v, i) => (
                    <span key={i} className="px-2 py-1 bg-blue-50 text-blue-700 text-xs font-mono rounded">
                      {`{{${v}}}`}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="p-4 border-t border-gray-100 flex justify-end space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
            <button className="px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90">
              Edit Template
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Template Library</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage email, SMS, and document templates
          </p>
        </div>
        <button className="inline-flex items-center justify-center px-4 py-2.5 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg font-medium hover:opacity-90 transition-opacity">
          <Plus className="w-5 h-5 mr-2" />
          <span>New Template</span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(templateTypes).map(([key, { icon: Icon, label, color }]) => {
          const count = templates.filter(t => t.type === key).length;
          return (
            <button
              key={key}
              onClick={() => setTypeFilter(typeFilter === key ? 'all' : key)}
              className={`p-4 rounded-xl border transition-all ${
                typeFilter === key
                  ? 'border-panda-primary bg-panda-primary/5'
                  : 'border-gray-100 bg-white hover:border-gray-200'
              }`}
            >
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <p className="text-2xl font-bold text-gray-900">{count}</p>
                  <p className="text-sm text-gray-500">{label}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search templates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
          />
        </div>

        {/* Category Pills - Scrollable on mobile */}
        <div className="flex overflow-x-auto pb-2 sm:pb-0 gap-2 no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                categoryFilter === cat
                  ? 'bg-panda-primary text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Template Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full flex justify-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-panda-primary border-t-transparent rounded-full" />
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No templates found</p>
          </div>
        ) : (
          filteredTemplates.map((template) => {
            const TypeIcon = templateTypes[template.type]?.icon || FileText;
            return (
              <div
                key={template.id}
                className={`bg-white rounded-xl shadow-sm border transition-all hover:shadow-md ${
                  template.isActive ? 'border-gray-100' : 'border-gray-100 opacity-60'
                }`}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded-lg ${templateTypes[template.type]?.color}`}>
                        <TypeIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900">{template.name}</h3>
                        <div className="flex items-center space-x-2 mt-1">
                          <span className="text-xs text-gray-500">{template.category}</span>
                          {!template.isActive && (
                            <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-xs rounded">
                              Inactive
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 text-sm text-gray-600 line-clamp-2">
                    {template.subject || template.content.substring(0, 100)}...
                  </div>

                  {template.variables?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {template.variables.slice(0, 3).map((v, i) => (
                        <span key={i} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs font-mono rounded">
                          {v}
                        </span>
                      ))}
                      {template.variables.length > 3 && (
                        <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-xs rounded">
                          +{template.variables.length - 3} more
                        </span>
                      )}
                    </div>
                  )}

                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                    <div className="flex items-center text-sm text-gray-500">
                      <Clock className="w-4 h-4 mr-1" />
                      <span>{template.usageCount} uses</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => {
                          setSelectedTemplate(template);
                          setShowPreview(true);
                        }}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                        title="Preview"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDuplicate(template)}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                        title="Duplicate"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(template.id)}
                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Preview Modal */}
      {showPreview && selectedTemplate && (
        <PreviewModal
          template={selectedTemplate}
          onClose={() => {
            setShowPreview(false);
            setSelectedTemplate(null);
          }}
        />
      )}
      </div>
    </AdminLayout>
  );
}
