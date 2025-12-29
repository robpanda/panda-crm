import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MessageSquare,
  Phone,
  Mail,
  Settings,
  Plus,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Trash2,
  Eye,
  Copy,
  CheckCircle,
  XCircle,
  Clock,
  Send,
  Users,
  BarChart3,
  Save,
  AlertCircle,
  Zap,
  Shield,
} from 'lucide-react';
import { bamboogliApi } from '../../services/api';

const CHANNEL_CONFIG = {
  SMS: { color: 'bg-green-100 text-green-700', icon: Phone, label: 'SMS' },
  EMAIL: { color: 'bg-blue-100 text-blue-700', icon: Mail, label: 'Email' },
};

const STATUS_CONFIG = {
  DELIVERED: { color: 'bg-green-100 text-green-700', icon: CheckCircle, label: 'Delivered' },
  SENT: { color: 'bg-blue-100 text-blue-700', icon: Send, label: 'Sent' },
  PENDING: { color: 'bg-yellow-100 text-yellow-700', icon: Clock, label: 'Pending' },
  FAILED: { color: 'bg-red-100 text-red-700', icon: XCircle, label: 'Failed' },
};

export default function Bamboogli() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const limit = 20;

  // Fetch conversation stats
  const { data: statsData, isLoading: loadingStats } = useQuery({
    queryKey: ['bamboogli-stats'],
    queryFn: () => bamboogliApi.getConversationStats(),
  });

  // Fetch templates
  const { data: templatesData, isLoading: loadingTemplates, refetch: refetchTemplates } = useQuery({
    queryKey: ['bamboogli-templates', channelFilter, searchTerm],
    queryFn: () => bamboogliApi.getMessageTemplates({
      ...(channelFilter && { channel: channelFilter }),
      ...(searchTerm && { search: searchTerm }),
    }),
    enabled: activeTab === 'templates',
  });

  // Fetch attention queue for monitoring
  const { data: attentionData, isLoading: loadingAttention } = useQuery({
    queryKey: ['bamboogli-attention'],
    queryFn: () => bamboogliApi.getAttentionQueue({ limit: 10 }),
    enabled: activeTab === 'overview',
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Template mutations
  const createTemplateMutation = useMutation({
    mutationFn: bamboogliApi.createMessageTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries(['bamboogli-templates']);
      setShowTemplateModal(false);
      setEditingTemplate(null);
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, data }) => bamboogliApi.updateMessageTemplate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['bamboogli-templates']);
      setShowTemplateModal(false);
      setEditingTemplate(null);
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: bamboogliApi.deleteMessageTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries(['bamboogli-templates']);
    },
  });

  const stats = statsData || {
    total: 0,
    open: 0,
    closed: 0,
    needsAttention: 0,
    todayMessages: 0,
  };
  const templates = templatesData || [];
  const attentionQueue = attentionData?.conversations || [];

  const StatCard = ({ icon: Icon, label, value, color, trend }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {trend && (
            <p className={`text-xs mt-1 ${trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {trend > 0 ? '+' : ''}{trend}% vs last week
            </p>
          )}
        </div>
        <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );

  const ChannelBadge = ({ channel }) => {
    const config = CHANNEL_CONFIG[channel] || CHANNEL_CONFIG.SMS;
    const Icon = config.icon;
    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${config.color}`}>
        <Icon className="w-3 h-3 mr-1" />
        {config.label}
      </span>
    );
  };

  const TemplateModal = () => {
    const [formData, setFormData] = useState(
      editingTemplate || {
        name: '',
        channel: 'SMS',
        category: 'GENERAL',
        subject: '',
        body: '',
        isActive: true,
      }
    );

    const handleSubmit = (e) => {
      e.preventDefault();
      if (editingTemplate?.id) {
        updateTemplateMutation.mutate({ id: editingTemplate.id, data: formData });
      } else {
        createTemplateMutation.mutate(formData);
      }
    };

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-xl font-semibold text-gray-900">
              {editingTemplate?.id ? 'Edit Template' : 'New Template'}
            </h2>
          </div>
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Template Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Channel
                </label>
                <select
                  value={formData.channel}
                  onChange={(e) => setFormData({ ...formData, channel: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                >
                  <option value="SMS">SMS</option>
                  <option value="EMAIL">Email</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                >
                  <option value="GENERAL">General</option>
                  <option value="APPOINTMENT">Appointment</option>
                  <option value="FOLLOW_UP">Follow Up</option>
                  <option value="PAYMENT">Payment</option>
                  <option value="PROJECT_UPDATE">Project Update</option>
                  <option value="MARKETING">Marketing</option>
                </select>
              </div>
            </div>

            {formData.channel === 'EMAIL' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Subject
                </label>
                <input
                  type="text"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                  required={formData.channel === 'EMAIL'}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Message Body
              </label>
              <textarea
                value={formData.body}
                onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                rows={formData.channel === 'EMAIL' ? 8 : 4}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none resize-none"
                placeholder="Use {{variableName}} for dynamic content"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Available variables: {'{{firstName}}'}, {'{{lastName}}'}, {'{{companyName}}'}, {'{{appointmentDate}}'}, {'{{projectAddress}}'}
              </p>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="w-4 h-4 text-panda-primary border-gray-300 rounded focus:ring-panda-primary"
              />
              <label htmlFor="isActive" className="ml-2 text-sm text-gray-700">
                Active template
              </label>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowTemplateModal(false);
                  setEditingTemplate(null);
                }}
                className="px-4 py-2 text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createTemplateMutation.isPending || updateTemplateMutation.isPending}
                className="px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                <Save className="w-4 h-4 inline mr-2" />
                {editingTemplate?.id ? 'Update' : 'Create'} Template
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <MessageSquare className="w-7 h-7 mr-3 text-panda-primary" />
            Bamboogli
          </h1>
          <p className="text-gray-500 mt-1">Unified messaging platform for SMS and Email communications</p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => queryClient.invalidateQueries(['bamboogli'])}
            className="inline-flex items-center px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </button>
          {activeTab === 'templates' && (
            <button
              onClick={() => {
                setEditingTemplate(null);
                setShowTemplateModal(true);
              }}
              className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white text-sm font-medium rounded-lg hover:opacity-90"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Template
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <StatCard
          icon={MessageSquare}
          label="Total Conversations"
          value={stats.total}
          color="bg-gray-100 text-gray-600"
        />
        <StatCard
          icon={Users}
          label="Open Conversations"
          value={stats.open}
          color="bg-blue-100 text-blue-600"
        />
        <StatCard
          icon={CheckCircle}
          label="Resolved"
          value={stats.closed}
          color="bg-green-100 text-green-600"
        />
        <StatCard
          icon={AlertCircle}
          label="Needs Attention"
          value={stats.needsAttention}
          color="bg-red-100 text-red-600"
        />
        <StatCard
          icon={Zap}
          label="Messages Today"
          value={stats.todayMessages}
          color="bg-yellow-100 text-yellow-600"
        />
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="border-b border-gray-100">
          <div className="flex space-x-1 p-1">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'overview'
                  ? 'bg-gradient-to-r from-panda-primary to-panda-secondary text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <BarChart3 className="w-4 h-4 inline mr-2" />
              Overview
            </button>
            <button
              onClick={() => setActiveTab('templates')}
              className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'templates'
                  ? 'bg-gradient-to-r from-panda-primary to-panda-secondary text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Copy className="w-4 h-4 inline mr-2" />
              Templates ({templates.length})
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'settings'
                  ? 'bg-gradient-to-r from-panda-primary to-panda-secondary text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Settings className="w-4 h-4 inline mr-2" />
              Settings
            </button>
          </div>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="p-6">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <AlertCircle className="w-5 h-5 mr-2 text-red-500" />
                Attention Queue
              </h3>
              {loadingAttention ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin w-8 h-8 border-2 border-panda-primary border-t-transparent rounded-full" />
                </div>
              ) : attentionQueue.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                  <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                  <p className="text-gray-600 font-medium">All caught up!</p>
                  <p className="text-gray-500 text-sm">No conversations need attention right now.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {attentionQueue.map((conversation) => (
                    <div
                      key={conversation.id}
                      className="flex items-center justify-between p-4 bg-red-50 border border-red-100 rounded-lg hover:bg-red-100 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-panda-primary to-panda-secondary flex items-center justify-center text-white font-medium">
                          {conversation.contactName?.charAt(0) || '?'}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{conversation.contactName || 'Unknown'}</p>
                          <p className="text-sm text-gray-500">
                            {conversation.attentionReason || 'Needs review'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <ChannelBadge channel={conversation.lastChannel || 'SMS'} />
                        <span className="text-sm text-gray-500">
                          {conversation.unreadCount || 0} unread
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-50 rounded-xl p-5">
                <h4 className="font-semibold text-gray-900 mb-4 flex items-center">
                  <Phone className="w-5 h-5 mr-2 text-green-600" />
                  SMS Channel
                </h4>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Provider</span>
                    <span className="font-medium text-gray-900">Twilio</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Status</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Connected
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Messages This Month</span>
                    <span className="font-medium text-gray-900">1,248</span>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-5">
                <h4 className="font-semibold text-gray-900 mb-4 flex items-center">
                  <Mail className="w-5 h-5 mr-2 text-blue-600" />
                  Email Channel
                </h4>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Provider</span>
                    <span className="font-medium text-gray-900">SendGrid</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Status</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Connected
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Emails This Month</span>
                    <span className="font-medium text-gray-900">3,421</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Templates Tab */}
        {activeTab === 'templates' && (
          <>
            {/* Filters */}
            <div className="p-4 border-b border-gray-100">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search templates..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                  />
                </div>
                <select
                  value={channelFilter}
                  onChange={(e) => setChannelFilter(e.target.value)}
                  className="px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                >
                  <option value="">All Channels</option>
                  <option value="SMS">SMS</option>
                  <option value="EMAIL">Email</option>
                </select>
              </div>
            </div>

            <div className="p-6">
              {loadingTemplates ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin w-8 h-8 border-2 border-panda-primary border-t-transparent rounded-full" />
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-8">
                  <Copy className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 mb-4">No templates found</p>
                  <button
                    onClick={() => {
                      setEditingTemplate(null);
                      setShowTemplateModal(true);
                    }}
                    className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200"
                  >
                    Create Your First Template
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      className="border border-gray-200 rounded-xl p-4 hover:border-panda-primary hover:shadow-md transition-all"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <ChannelBadge channel={template.channel} />
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          template.isActive
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {template.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <h3 className="font-semibold text-gray-900 mb-1">{template.name}</h3>
                      <p className="text-sm text-gray-500 mb-3 line-clamp-2">
                        {template.body?.substring(0, 100)}...
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">{template.category}</span>
                        <div className="flex space-x-1">
                          <button
                            onClick={() => {
                              setEditingTemplate(template);
                              setShowTemplateModal(true);
                            }}
                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('Delete this template?')) {
                                deleteTemplateMutation.mutate(template.id);
                              }
                            }}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="p-6">
            <div className="max-w-2xl space-y-8">
              {/* SMS Settings */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <Phone className="w-5 h-5 mr-2 text-green-600" />
                  SMS Settings (Twilio)
                </h3>
                <div className="space-y-4 bg-gray-50 rounded-xl p-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Account SID
                    </label>
                    <input
                      type="text"
                      placeholder="AC..."
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Auth Token
                    </label>
                    <input
                      type="password"
                      placeholder="********"
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Default From Number
                    </label>
                    <input
                      type="text"
                      placeholder="+1 (555) 123-4567"
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Email Settings */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <Mail className="w-5 h-5 mr-2 text-blue-600" />
                  Email Settings (SendGrid)
                </h3>
                <div className="space-y-4 bg-gray-50 rounded-xl p-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      API Key
                    </label>
                    <input
                      type="password"
                      placeholder="SG...."
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Default From Email
                    </label>
                    <input
                      type="email"
                      placeholder="info@pandaexteriors.com"
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Default From Name
                    </label>
                    <input
                      type="text"
                      placeholder="Panda Exteriors"
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Auto-Response Settings */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <Zap className="w-5 h-5 mr-2 text-yellow-600" />
                  Auto-Response Settings
                </h3>
                <div className="space-y-4 bg-gray-50 rounded-xl p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">Enable Auto-Responses</p>
                      <p className="text-sm text-gray-500">Automatically respond to incoming messages</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" defaultChecked className="sr-only peer" />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-panda-primary/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-panda-primary"></div>
                    </label>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Auto-Response Cooldown (minutes)
                    </label>
                    <input
                      type="number"
                      defaultValue={5}
                      min={1}
                      max={60}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Don't send another auto-response for this many minutes
                    </p>
                  </div>
                </div>
              </div>

              {/* Security Settings */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <Shield className="w-5 h-5 mr-2 text-purple-600" />
                  Security & Compliance
                </h3>
                <div className="space-y-4 bg-gray-50 rounded-xl p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">Honor Opt-Outs</p>
                      <p className="text-sm text-gray-500">Automatically stop messaging on STOP keyword</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" defaultChecked className="sr-only peer" />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-panda-primary/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-panda-primary"></div>
                    </label>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">Log All Messages</p>
                      <p className="text-sm text-gray-500">Keep a complete audit trail of communications</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" defaultChecked className="sr-only peer" />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-panda-primary/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-panda-primary"></div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex justify-end pt-4">
                <button className="px-6 py-2.5 bg-gradient-to-r from-panda-primary to-panda-secondary text-white text-sm font-medium rounded-lg hover:opacity-90">
                  <Save className="w-4 h-4 inline mr-2" />
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Template Modal */}
      {showTemplateModal && <TemplateModal />}
    </div>
  );
}
