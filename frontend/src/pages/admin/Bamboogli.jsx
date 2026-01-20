import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AdminLayout from '../../components/AdminLayout';
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
  Loader2,
  TestTube,
  BellRing,
  Calendar,
  UserCheck,
  Truck,
  Star,
  RotateCcw,
  History,
  ToggleLeft,
  ToggleRight,
  PlayCircle,
  Sparkles,
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

const AUTOMATION_CONFIG = {
  appointment_confirmation: {
    icon: Calendar,
    color: 'bg-green-100 text-green-600',
    label: 'Appointment Confirmation',
    description: 'Sent immediately when an appointment is booked',
  },
  appointment_reminder_24h: {
    icon: BellRing,
    color: 'bg-blue-100 text-blue-600',
    label: '24-Hour Reminder',
    description: 'Sent 24 hours before the scheduled appointment',
  },
  appointment_reminder_2h: {
    icon: Clock,
    color: 'bg-yellow-100 text-yellow-600',
    label: '2-Hour Reminder',
    description: 'SMS-only reminder sent 2 hours before arrival',
  },
  crew_dispatch_notification: {
    icon: Truck,
    color: 'bg-purple-100 text-purple-600',
    label: 'Crew Dispatch',
    description: 'Sent to crew when assigned to a job',
  },
  appointment_complete: {
    icon: Star,
    color: 'bg-orange-100 text-orange-600',
    label: 'Job Completion',
    description: 'Sent when a job is marked complete with review request',
  },
  reschedule_confirmation: {
    icon: RotateCcw,
    color: 'bg-teal-100 text-teal-600',
    label: 'Reschedule Confirmation',
    description: 'Sent when an appointment is rescheduled',
  },
};

export default function Bamboogli() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [saveMessage, setSaveMessage] = useState(null);
  const [testPhone, setTestPhone] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [editingAutomation, setEditingAutomation] = useState(null);
  const [showAutomationModal, setShowAutomationModal] = useState(false);
  const [automationTestChannel, setAutomationTestChannel] = useState('sms');
  const [automationTestTo, setAutomationTestTo] = useState('');
  const [editingPhoneNumber, setEditingPhoneNumber] = useState(null);
  const limit = 20;

  // Settings form state
  const [settingsForm, setSettingsForm] = useState({
    twilio: {
      enabled: false,
      accountSid: '',
      authToken: '',
      phoneNumber: '',
      messagingServiceSid: '',
    },
    sendgrid: {
      enabled: false,
      apiKey: '',
      fromEmail: '',
      fromName: '',
    },
    autoResponse: {
      enabled: false,
      message: '',
      delayMinutes: 5,
      referralReceivedReply: true,
      referralReceivedMessage: 'Received!',
    },
    businessHours: {
      enabled: false,
      start: '09:00',
      end: '17:00',
      timezone: 'America/New_York',
      afterHoursMessage: '',
    },
  });

  // Fetch conversation stats
  const { data: statsData, isLoading: loadingStats } = useQuery({
    queryKey: ['bamboogli-stats'],
    queryFn: () => bamboogliApi.getConversationStats(),
  });

  // Fetch message stats (real data from database)
  const { data: messageStatsData, isLoading: loadingMessageStats } = useQuery({
    queryKey: ['bamboogli-message-stats'],
    queryFn: () => bamboogliApi.getMessageStats({ period: '30d' }),
    enabled: activeTab === 'overview',
  });

  // Fetch channel connection status
  const { data: channelStatusData, isLoading: loadingChannelStatus, refetch: refetchChannelStatus } = useQuery({
    queryKey: ['bamboogli-channel-status'],
    queryFn: () => bamboogliApi.getChannelStatus(),
    enabled: activeTab === 'overview' || activeTab === 'settings',
    refetchInterval: 60000, // Refresh every minute
  });

  // Fetch settings
  const { data: settingsData, isLoading: loadingSettings } = useQuery({
    queryKey: ['bamboogli-settings'],
    queryFn: () => bamboogliApi.getSettings(),
    enabled: activeTab === 'settings',
  });

  // Fetch phone numbers
  const { data: phoneNumbersData, isLoading: loadingPhoneNumbers, refetch: refetchPhoneNumbers } = useQuery({
    queryKey: ['bamboogli-phone-numbers'],
    queryFn: () => bamboogliApi.getPhoneNumbers(),
    enabled: activeTab === 'settings',
  });

  // Update phone number mutation
  const updatePhoneNumberMutation = useMutation({
    mutationFn: ({ id, data }) => bamboogliApi.updatePhoneNumber(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bamboogli-phone-numbers'] });
      setSaveMessage({ type: 'success', text: 'Phone number settings updated!' });
      setEditingPhoneNumber(null);
      setTimeout(() => setSaveMessage(null), 3000);
    },
    onError: (error) => {
      setSaveMessage({ type: 'error', text: error.message || 'Failed to update phone number' });
      setTimeout(() => setSaveMessage(null), 5000);
    },
  });

  // Update settings form when data is loaded
  useEffect(() => {
    if (settingsData) {
      setSettingsForm({
        twilio: {
          enabled: settingsData.twilio?.enabled ?? false,
          accountSid: settingsData.twilio?.accountSid ?? '',
          authToken: settingsData.twilio?.authToken ?? '',
          phoneNumber: settingsData.twilio?.phoneNumber ?? '',
          messagingServiceSid: settingsData.twilio?.messagingServiceSid ?? '',
        },
        sendgrid: {
          enabled: settingsData.sendgrid?.enabled ?? false,
          apiKey: settingsData.sendgrid?.apiKey ?? '',
          fromEmail: settingsData.sendgrid?.fromEmail ?? '',
          fromName: settingsData.sendgrid?.fromName ?? '',
        },
        autoResponse: {
          enabled: settingsData.autoResponse?.enabled ?? false,
          message: settingsData.autoResponse?.message ?? '',
          delayMinutes: settingsData.autoResponse?.delayMinutes ?? 5,
          referralReceivedReply: settingsData.autoResponse?.referralReceivedReply ?? true,
          referralReceivedMessage: settingsData.autoResponse?.referralReceivedMessage ?? 'Received!',
        },
        businessHours: {
          enabled: settingsData.businessHours?.enabled ?? false,
          start: settingsData.businessHours?.start ?? '09:00',
          end: settingsData.businessHours?.end ?? '17:00',
          timezone: settingsData.businessHours?.timezone ?? 'America/New_York',
          afterHoursMessage: settingsData.businessHours?.afterHoursMessage ?? '',
        },
      });
    }
  }, [settingsData]);

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

  // Fetch automations
  const { data: automationsData, isLoading: loadingAutomations, refetch: refetchAutomations } = useQuery({
    queryKey: ['bamboogli-automations'],
    queryFn: () => bamboogliApi.getAutomations(),
    enabled: activeTab === 'automations',
  });

  // Fetch automation history
  const { data: automationHistoryData, isLoading: loadingAutomationHistory } = useQuery({
    queryKey: ['bamboogli-automation-history'],
    queryFn: () => bamboogliApi.getAutomationHistory({ limit: 20 }),
    enabled: activeTab === 'automations',
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

  // Settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: bamboogliApi.updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries(['bamboogli-settings']);
      queryClient.invalidateQueries(['bamboogli-channel-status']);
      setSaveMessage({ type: 'success', text: 'Settings saved successfully!' });
      setTimeout(() => setSaveMessage(null), 3000);
    },
    onError: (error) => {
      setSaveMessage({ type: 'error', text: error.message || 'Failed to save settings' });
      setTimeout(() => setSaveMessage(null), 5000);
    },
  });

  // Test SMS mutation
  const testSmsMutation = useMutation({
    mutationFn: (phoneNumber) => bamboogliApi.testSmsConnection(phoneNumber),
    onSuccess: (data) => {
      setSaveMessage({ type: 'success', text: data.message || 'Test SMS sent successfully!' });
      setTimeout(() => setSaveMessage(null), 3000);
    },
    onError: (error) => {
      setSaveMessage({ type: 'error', text: error.response?.data?.error || 'Failed to send test SMS' });
      setTimeout(() => setSaveMessage(null), 5000);
    },
  });

  // Test Email mutation
  const testEmailMutation = useMutation({
    mutationFn: (email) => bamboogliApi.testEmailConnection(email),
    onSuccess: (data) => {
      setSaveMessage({ type: 'success', text: data.message || 'Test email sent successfully!' });
      setTimeout(() => setSaveMessage(null), 3000);
    },
    onError: (error) => {
      setSaveMessage({ type: 'error', text: error.response?.data?.error || 'Failed to send test email' });
      setTimeout(() => setSaveMessage(null), 5000);
    },
  });

  // Automation mutations
  const updateAutomationMutation = useMutation({
    mutationFn: ({ type, data }) => bamboogliApi.updateAutomation(type, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['bamboogli-automations']);
      setShowAutomationModal(false);
      setEditingAutomation(null);
      setSaveMessage({ type: 'success', text: 'Automation saved successfully!' });
      setTimeout(() => setSaveMessage(null), 3000);
    },
    onError: (error) => {
      setSaveMessage({ type: 'error', text: error.response?.data?.error || 'Failed to save automation' });
      setTimeout(() => setSaveMessage(null), 5000);
    },
  });

  const testAutomationMutation = useMutation({
    mutationFn: ({ type, channel, to }) => bamboogliApi.testAutomation(type, { channel, to }),
    onSuccess: (data) => {
      setSaveMessage({ type: 'success', text: `Test ${data.channel} sent successfully!` });
      setTimeout(() => setSaveMessage(null), 3000);
    },
    onError: (error) => {
      setSaveMessage({ type: 'error', text: error.response?.data?.error || 'Failed to send test message' });
      setTimeout(() => setSaveMessage(null), 5000);
    },
  });

  const handleSaveSettings = () => {
    updateSettingsMutation.mutate(settingsForm);
  };

  const stats = statsData || {
    total: 0,
    open: 0,
    closed: 0,
    needsAttention: 0,
    todayMessages: 0,
  };
  const templates = templatesData || [];
  const attentionQueue = attentionData?.conversations || attentionData || [];
  const messageStats = messageStatsData?.summary || {};
  const channelStatus = channelStatusData || { twilio: {}, sendgrid: {} };
  const automations = automationsData?.automations || [];
  const automationHistory = automationHistoryData?.activities || [];

  const StatCard = ({ icon: Icon, label, value, color, trend, isLoading }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          {isLoading ? (
            <div className="h-8 flex items-center">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : (
            <>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              {trend !== undefined && (
                <p className={`text-xs mt-1 ${trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                  {trend > 0 ? '+' : ''}{trend}% vs last period
                </p>
              )}
            </>
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

  const ConnectionStatus = ({ connected, error }) => {
    if (connected) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
          <CheckCircle className="w-3 h-3 mr-1" />
          Connected
        </span>
      );
    }
    if (error) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700" title={error}>
          <XCircle className="w-3 h-3 mr-1" />
          Error
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
        <Clock className="w-3 h-3 mr-1" />
        Not Configured
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
    <AdminLayout>
      <div className="p-4 sm:p-6 space-y-6">
        {/* Save Message Toast */}
        {saveMessage && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg ${
          saveMessage.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`}>
          <div className="flex items-center">
            {saveMessage.type === 'success' ? (
              <CheckCircle className="w-5 h-5 mr-2" />
            ) : (
              <XCircle className="w-5 h-5 mr-2" />
            )}
            {saveMessage.text}
          </div>
        </div>
      )}

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
            onClick={() => {
              queryClient.invalidateQueries(['bamboogli']);
              queryClient.invalidateQueries(['bamboogli-stats']);
              queryClient.invalidateQueries(['bamboogli-message-stats']);
              queryClient.invalidateQueries(['bamboogli-channel-status']);
            }}
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
          label="Total Messages"
          value={messageStats.totalMessages ?? stats.total}
          color="bg-gray-100 text-gray-600"
          isLoading={loadingMessageStats}
        />
        <StatCard
          icon={Phone}
          label="SMS Sent"
          value={messageStats.sms?.sent ?? 0}
          color="bg-green-100 text-green-600"
          isLoading={loadingMessageStats}
        />
        <StatCard
          icon={Mail}
          label="Emails Sent"
          value={messageStats.email?.sent ?? 0}
          color="bg-blue-100 text-blue-600"
          isLoading={loadingMessageStats}
        />
        <StatCard
          icon={AlertCircle}
          label="Failed"
          value={messageStats.failedMessages ?? 0}
          color="bg-red-100 text-red-600"
          isLoading={loadingMessageStats}
        />
        <StatCard
          icon={Users}
          label="Active Conversations"
          value={messageStats.activeConversations ?? stats.open}
          color="bg-yellow-100 text-yellow-600"
          isLoading={loadingMessageStats}
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
              onClick={() => setActiveTab('automations')}
              className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'automations'
                  ? 'bg-gradient-to-r from-panda-primary to-panda-secondary text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Zap className="w-4 h-4 inline mr-2" />
              Automations
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

            {/* Channel Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-50 rounded-xl p-5">
                <h4 className="font-semibold text-gray-900 mb-4 flex items-center">
                  <Phone className="w-5 h-5 mr-2 text-green-600" />
                  SMS Channel
                </h4>
                {loadingChannelStatus ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Provider</span>
                      <span className="font-medium text-gray-900">Twilio</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Status</span>
                      <ConnectionStatus
                        connected={channelStatus.twilio?.connected}
                        error={channelStatus.twilio?.error}
                      />
                    </div>
                    {channelStatus.twilio?.accountName && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Account</span>
                        <span className="font-medium text-gray-900">{channelStatus.twilio.accountName}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-600">SMS This Period</span>
                      <span className="font-medium text-gray-900">
                        {loadingMessageStats ? '...' : (messageStats.sms?.total ?? 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-gray-50 rounded-xl p-5">
                <h4 className="font-semibold text-gray-900 mb-4 flex items-center">
                  <Mail className="w-5 h-5 mr-2 text-blue-600" />
                  Email Channel
                </h4>
                {loadingChannelStatus ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Provider</span>
                      <span className="font-medium text-gray-900">SendGrid</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Status</span>
                      <ConnectionStatus
                        connected={channelStatus.sendgrid?.connected}
                        error={channelStatus.sendgrid?.error}
                      />
                    </div>
                    {channelStatus.sendgrid?.email && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">From</span>
                        <span className="font-medium text-gray-900">{channelStatus.sendgrid.email}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-600">Emails This Period</span>
                      <span className="font-medium text-gray-900">
                        {loadingMessageStats ? '...' : (messageStats.email?.total ?? 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
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
            {loadingSettings ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-panda-primary" />
              </div>
            ) : (
              <div className="max-w-2xl space-y-8">
                {/* SMS Settings */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <Phone className="w-5 h-5 mr-2 text-green-600" />
                    SMS Settings (Twilio)
                  </h3>
                  <div className="space-y-4 bg-gray-50 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="font-medium text-gray-900">Enable SMS</p>
                        <p className="text-sm text-gray-500">Allow sending SMS messages via Twilio</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settingsForm.twilio.enabled}
                          onChange={(e) => setSettingsForm({
                            ...settingsForm,
                            twilio: { ...settingsForm.twilio, enabled: e.target.checked }
                          })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-panda-primary/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-panda-primary"></div>
                      </label>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Account SID
                      </label>
                      <input
                        type="text"
                        placeholder="AC..."
                        value={settingsForm.twilio.accountSid}
                        onChange={(e) => setSettingsForm({
                          ...settingsForm,
                          twilio: { ...settingsForm.twilio, accountSid: e.target.value }
                        })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Auth Token
                      </label>
                      <input
                        type="password"
                        placeholder="Enter new token to update..."
                        value={settingsForm.twilio.authToken}
                        onChange={(e) => setSettingsForm({
                          ...settingsForm,
                          twilio: { ...settingsForm.twilio, authToken: e.target.value }
                        })}
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
                        value={settingsForm.twilio.phoneNumber}
                        onChange={(e) => setSettingsForm({
                          ...settingsForm,
                          twilio: { ...settingsForm.twilio, phoneNumber: e.target.value }
                        })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Messaging Service SID (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="MG..."
                        value={settingsForm.twilio.messagingServiceSid}
                        onChange={(e) => setSettingsForm({
                          ...settingsForm,
                          twilio: { ...settingsForm.twilio, messagingServiceSid: e.target.value }
                        })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                      />
                    </div>
                    {/* Test SMS */}
                    <div className="pt-3 border-t border-gray-200">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Test SMS Connection
                      </label>
                      <div className="flex space-x-2">
                        <input
                          type="text"
                          placeholder="+1 (555) 123-4567"
                          value={testPhone}
                          onChange={(e) => setTestPhone(e.target.value)}
                          className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                        />
                        <button
                          onClick={() => testSmsMutation.mutate(testPhone)}
                          disabled={!testPhone || testSmsMutation.isPending}
                          className="px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                        >
                          {testSmsMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <TestTube className="w-4 h-4 mr-2" />
                              Test
                            </>
                          )}
                        </button>
                      </div>
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
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="font-medium text-gray-900">Enable Email</p>
                        <p className="text-sm text-gray-500">Allow sending emails via SendGrid</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settingsForm.sendgrid.enabled}
                          onChange={(e) => setSettingsForm({
                            ...settingsForm,
                            sendgrid: { ...settingsForm.sendgrid, enabled: e.target.checked }
                          })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-panda-primary/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-panda-primary"></div>
                      </label>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        API Key
                      </label>
                      <input
                        type="password"
                        placeholder="Enter new key to update..."
                        value={settingsForm.sendgrid.apiKey}
                        onChange={(e) => setSettingsForm({
                          ...settingsForm,
                          sendgrid: { ...settingsForm.sendgrid, apiKey: e.target.value }
                        })}
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
                        value={settingsForm.sendgrid.fromEmail}
                        onChange={(e) => setSettingsForm({
                          ...settingsForm,
                          sendgrid: { ...settingsForm.sendgrid, fromEmail: e.target.value }
                        })}
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
                        value={settingsForm.sendgrid.fromName}
                        onChange={(e) => setSettingsForm({
                          ...settingsForm,
                          sendgrid: { ...settingsForm.sendgrid, fromName: e.target.value }
                        })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                      />
                    </div>
                    {/* Test Email */}
                    <div className="pt-3 border-t border-gray-200">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Test Email Connection
                      </label>
                      <div className="flex space-x-2">
                        <input
                          type="email"
                          placeholder="test@example.com"
                          value={testEmail}
                          onChange={(e) => setTestEmail(e.target.value)}
                          className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                        />
                        <button
                          onClick={() => testEmailMutation.mutate(testEmail)}
                          disabled={!testEmail || testEmailMutation.isPending}
                          className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                        >
                          {testEmailMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <TestTube className="w-4 h-4 mr-2" />
                              Test
                            </>
                          )}
                        </button>
                      </div>
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
                        <input
                          type="checkbox"
                          checked={settingsForm.autoResponse.enabled}
                          onChange={(e) => setSettingsForm({
                            ...settingsForm,
                            autoResponse: { ...settingsForm.autoResponse, enabled: e.target.checked }
                          })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-panda-primary/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-panda-primary"></div>
                      </label>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Auto-Response Message
                      </label>
                      <textarea
                        placeholder="Thanks for contacting Panda Exteriors! We'll get back to you shortly."
                        value={settingsForm.autoResponse.message}
                        onChange={(e) => setSettingsForm({
                          ...settingsForm,
                          autoResponse: { ...settingsForm.autoResponse, message: e.target.value }
                        })}
                        rows={3}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Cooldown (minutes)
                      </label>
                      <input
                        type="number"
                        value={settingsForm.autoResponse.delayMinutes}
                        onChange={(e) => setSettingsForm({
                          ...settingsForm,
                          autoResponse: { ...settingsForm.autoResponse, delayMinutes: parseInt(e.target.value) || 5 }
                        })}
                        min={1}
                        max={60}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Don't send another auto-response for this many minutes
                      </p>
                    </div>

                    {/* Referral Auto-Reply Toggle */}
                    <div className="border-t border-gray-200 pt-4 mt-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="font-medium text-gray-900">Referral Received Auto-Reply</p>
                          <p className="text-sm text-gray-500">Send confirmation when a referral is submitted via SMS</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settingsForm.autoResponse.referralReceivedReply}
                            onChange={(e) => setSettingsForm({
                              ...settingsForm,
                              autoResponse: { ...settingsForm.autoResponse, referralReceivedReply: e.target.checked }
                            })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-panda-primary/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-panda-primary"></div>
                        </label>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Referral Confirmation Message
                        </label>
                        <input
                          type="text"
                          placeholder="Received!"
                          value={settingsForm.autoResponse.referralReceivedMessage}
                          onChange={(e) => setSettingsForm({
                            ...settingsForm,
                            autoResponse: { ...settingsForm.autoResponse, referralReceivedMessage: e.target.value }
                          })}
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Message sent when someone submits a referral via SMS
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Business Hours Settings */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <Clock className="w-5 h-5 mr-2 text-purple-600" />
                    Business Hours
                  </h3>
                  <div className="space-y-4 bg-gray-50 rounded-xl p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">Enable Business Hours</p>
                        <p className="text-sm text-gray-500">Send different auto-response outside hours</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settingsForm.businessHours.enabled}
                          onChange={(e) => setSettingsForm({
                            ...settingsForm,
                            businessHours: { ...settingsForm.businessHours, enabled: e.target.checked }
                          })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-panda-primary/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-panda-primary"></div>
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Start Time
                        </label>
                        <input
                          type="time"
                          value={settingsForm.businessHours.start}
                          onChange={(e) => setSettingsForm({
                            ...settingsForm,
                            businessHours: { ...settingsForm.businessHours, start: e.target.value }
                          })}
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          End Time
                        </label>
                        <input
                          type="time"
                          value={settingsForm.businessHours.end}
                          onChange={(e) => setSettingsForm({
                            ...settingsForm,
                            businessHours: { ...settingsForm.businessHours, end: e.target.value }
                          })}
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Timezone
                      </label>
                      <select
                        value={settingsForm.businessHours.timezone}
                        onChange={(e) => setSettingsForm({
                          ...settingsForm,
                          businessHours: { ...settingsForm.businessHours, timezone: e.target.value }
                        })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                      >
                        <option value="America/New_York">Eastern Time</option>
                        <option value="America/Chicago">Central Time</option>
                        <option value="America/Denver">Mountain Time</option>
                        <option value="America/Los_Angeles">Pacific Time</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        After-Hours Message
                      </label>
                      <textarea
                        placeholder="Thanks for reaching out! Our office is currently closed. We'll respond during business hours."
                        value={settingsForm.businessHours.afterHoursMessage}
                        onChange={(e) => setSettingsForm({
                          ...settingsForm,
                          businessHours: { ...settingsForm.businessHours, afterHoursMessage: e.target.value }
                        })}
                        rows={3}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white resize-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Connected Phone Numbers */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <Phone className="w-5 h-5 mr-2 text-green-600" />
                    Connected Phone Numbers
                  </h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Configure auto-reply settings for each phone number individually. These settings override the global auto-response settings above.
                  </p>
                  <div className="space-y-4">
                    {loadingPhoneNumbers ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-panda-primary" />
                      </div>
                    ) : (phoneNumbersData?.data || []).length === 0 ? (
                      <div className="bg-gray-50 rounded-xl p-5 text-center">
                        <Phone className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-500">No phone numbers configured yet.</p>
                        <p className="text-sm text-gray-400 mt-1">Phone numbers will appear here when added to the system.</p>
                      </div>
                    ) : (
                      (phoneNumbersData?.data || []).map((phone) => (
                        <div key={phone.id} className="bg-gray-50 rounded-xl p-5 border border-gray-200">
                          {editingPhoneNumber?.id === phone.id ? (
                            /* Edit Mode */
                            <div className="space-y-4">
                              <div className="flex items-center justify-between mb-3">
                                <div>
                                  <p className="font-medium text-gray-900">{phone.phoneNumber}</p>
                                  <p className="text-xs text-gray-500">Editing settings</p>
                                </div>
                                <div className="flex space-x-2">
                                  <button
                                    onClick={() => setEditingPhoneNumber(null)}
                                    className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => updatePhoneNumberMutation.mutate({
                                      id: phone.id,
                                      data: {
                                        friendlyName: editingPhoneNumber.friendlyName,
                                        purpose: editingPhoneNumber.purpose,
                                        referralAutoReply: editingPhoneNumber.referralAutoReply,
                                        referralReplyMessage: editingPhoneNumber.referralReplyMessage,
                                        autoReplyEnabled: editingPhoneNumber.autoReplyEnabled,
                                        autoReplyMessage: editingPhoneNumber.autoReplyMessage,
                                      }
                                    })}
                                    disabled={updatePhoneNumberMutation.isPending}
                                    className="px-3 py-1.5 text-sm bg-panda-primary text-white rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center"
                                  >
                                    {updatePhoneNumberMutation.isPending ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <>
                                        <Save className="w-3 h-3 mr-1" />
                                        Save
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>

                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Friendly Name
                                </label>
                                <input
                                  type="text"
                                  placeholder="e.g., Main Referral Line"
                                  value={editingPhoneNumber.friendlyName || ''}
                                  onChange={(e) => setEditingPhoneNumber({
                                    ...editingPhoneNumber,
                                    friendlyName: e.target.value
                                  })}
                                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                                />
                              </div>

                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Purpose
                                </label>
                                <select
                                  value={editingPhoneNumber.purpose || 'general'}
                                  onChange={(e) => setEditingPhoneNumber({
                                    ...editingPhoneNumber,
                                    purpose: e.target.value
                                  })}
                                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                                >
                                  <option value="general">General</option>
                                  <option value="referral">Referral Line</option>
                                  <option value="campaign">Campaign</option>
                                  <option value="support">Support</option>
                                </select>
                              </div>

                              <div className="border-t border-gray-200 pt-4">
                                <div className="flex items-center justify-between mb-3">
                                  <div>
                                    <p className="font-medium text-gray-900">Referral Auto-Reply</p>
                                    <p className="text-sm text-gray-500">Send confirmation when a referral is received on this number</p>
                                  </div>
                                  <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={editingPhoneNumber.referralAutoReply ?? true}
                                      onChange={(e) => setEditingPhoneNumber({
                                        ...editingPhoneNumber,
                                        referralAutoReply: e.target.checked
                                      })}
                                      className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-panda-primary/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-panda-primary"></div>
                                  </label>
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Referral Reply Message
                                  </label>
                                  <input
                                    type="text"
                                    placeholder="Received!"
                                    value={editingPhoneNumber.referralReplyMessage || ''}
                                    onChange={(e) => setEditingPhoneNumber({
                                      ...editingPhoneNumber,
                                      referralReplyMessage: e.target.value
                                    })}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                                  />
                                </div>
                              </div>

                              <div className="border-t border-gray-200 pt-4">
                                <div className="flex items-center justify-between mb-3">
                                  <div>
                                    <p className="font-medium text-gray-900">General Auto-Reply</p>
                                    <p className="text-sm text-gray-500">Send auto-response to all incoming messages</p>
                                  </div>
                                  <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={editingPhoneNumber.autoReplyEnabled ?? false}
                                      onChange={(e) => setEditingPhoneNumber({
                                        ...editingPhoneNumber,
                                        autoReplyEnabled: e.target.checked
                                      })}
                                      className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-panda-primary/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-panda-primary"></div>
                                  </label>
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Auto-Reply Message
                                  </label>
                                  <textarea
                                    placeholder="Thanks for contacting us! We'll get back to you shortly."
                                    value={editingPhoneNumber.autoReplyMessage || ''}
                                    onChange={(e) => setEditingPhoneNumber({
                                      ...editingPhoneNumber,
                                      autoReplyMessage: e.target.value
                                    })}
                                    rows={2}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white resize-none"
                                  />
                                </div>
                              </div>
                            </div>
                          ) : (
                            /* View Mode */
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-3">
                                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${phone.isActive ? 'bg-green-100' : 'bg-gray-100'}`}>
                                    <Phone className={`w-5 h-5 ${phone.isActive ? 'text-green-600' : 'text-gray-400'}`} />
                                  </div>
                                  <div>
                                    <p className="font-medium text-gray-900">{phone.friendlyName || phone.phoneNumber}</p>
                                    <p className="text-sm text-gray-500">{phone.phoneNumber}</p>
                                  </div>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {phone.purpose && (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 capitalize">
                                      {phone.purpose}
                                    </span>
                                  )}
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    phone.referralAutoReply !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                                  }`}>
                                    {phone.referralAutoReply !== false ? '✓ Referral Reply On' : '○ Referral Reply Off'}
                                  </span>
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    phone.autoReplyEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                                  }`}>
                                    {phone.autoReplyEnabled ? '✓ Auto-Reply On' : '○ Auto-Reply Off'}
                                  </span>
                                </div>
                              </div>
                              <button
                                onClick={() => setEditingPhoneNumber({ ...phone })}
                                className="px-4 py-2 text-sm text-panda-primary hover:bg-panda-primary/10 rounded-lg flex items-center"
                              >
                                <Edit2 className="w-4 h-4 mr-1" />
                                Edit
                              </button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end pt-4">
                  <button
                    onClick={handleSaveSettings}
                    disabled={updateSettingsMutation.isPending}
                    className="px-6 py-2.5 bg-gradient-to-r from-panda-primary to-panda-secondary text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center"
                  >
                    {updateSettingsMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Save Settings
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Automations Tab */}
        {activeTab === 'automations' && (
          <div className="p-6">
            {loadingAutomations ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-panda-primary" />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Quick Setup Guide */}
                <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-4 mb-6">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <Sparkles className="w-6 h-6 text-purple-600" />
                    </div>
                    <div className="ml-3">
                      <h4 className="text-sm font-semibold text-purple-800">How to Set Up Automations</h4>
                      <ol className="mt-2 text-sm text-purple-700 list-decimal list-inside space-y-1">
                        <li>Click the <strong>toggle switch</strong> on any automation to enable it</li>
                        <li>Click <strong>Edit Templates</strong> to customize SMS and email messages</li>
                        <li>Use the <strong>test button</strong> (play icon) to send a test message</li>
                        <li>Merge fields like <code className="bg-purple-100 px-1 rounded">{'{firstName}'}</code> will be replaced with actual data</li>
                      </ol>
                    </div>
                  </div>
                </div>

                {/* Automations List */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Appointment Automations
                  </h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Configure automatic SMS and email messages that are sent based on appointment events.
                    Enable or disable each automation, customize templates, and test before going live.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {automations.map((automation) => {
                      const config = AUTOMATION_CONFIG[automation.type] || {
                        icon: BellRing,
                        color: 'bg-gray-100 text-gray-600',
                        label: automation.name,
                        description: '',
                      };
                      const Icon = config.icon;

                      return (
                        <div
                          key={automation.type}
                          className={`bg-white border rounded-xl p-5 hover:shadow-md transition-shadow ${
                            automation.enabled ? 'border-green-200' : 'border-gray-200'
                          }`}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center">
                              <div className={`w-10 h-10 rounded-lg ${config.color} flex items-center justify-center`}>
                                <Icon className="w-5 h-5" />
                              </div>
                              <div className="ml-3">
                                <h4 className="font-medium text-gray-900">{config.label}</h4>
                                <p className="text-xs text-gray-500">{config.description}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                updateAutomationMutation.mutate({
                                  type: automation.type,
                                  data: { enabled: !automation.enabled }
                                });
                              }}
                              className={`p-1 rounded ${automation.enabled ? 'text-green-600' : 'text-gray-400'}`}
                              title={automation.enabled ? 'Click to disable' : 'Click to enable'}
                            >
                              {automation.enabled ? (
                                <ToggleRight className="w-8 h-8" />
                              ) : (
                                <ToggleLeft className="w-8 h-8" />
                              )}
                            </button>
                          </div>

                          <div className="flex items-center space-x-2 mb-3">
                            {automation.smsEnabled && (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                <Phone className="w-3 h-3 mr-1" />
                                SMS
                              </span>
                            )}
                            {automation.emailEnabled && automation.type !== 'appointment_reminder_2h' && (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                <Mail className="w-3 h-3 mr-1" />
                                Email
                              </span>
                            )}
                            {automation.enabled ? (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                <XCircle className="w-3 h-3 mr-1" />
                                Inactive
                              </span>
                            )}
                          </div>

                          <div className="flex space-x-2">
                            <button
                              onClick={() => {
                                setEditingAutomation(automation);
                                setShowAutomationModal(true);
                              }}
                              className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 flex items-center justify-center"
                            >
                              <Edit2 className="w-4 h-4 mr-1" />
                              Edit Templates
                            </button>
                            <button
                              onClick={() => {
                                setEditingAutomation(automation);
                                setAutomationTestChannel('sms');
                                setAutomationTestTo('');
                              }}
                              className="px-3 py-2 text-sm font-medium text-purple-700 bg-purple-100 rounded-lg hover:bg-purple-200 flex items-center"
                              title="Send test message"
                            >
                              <PlayCircle className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Recent Automation History */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <History className="w-5 h-5 mr-2" />
                    Recent Automation Activity
                  </h3>
                  {loadingAutomationHistory ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                    </div>
                  ) : automationHistory.length === 0 ? (
                    <div className="text-center py-8 bg-gray-50 rounded-lg">
                      <History className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500">No automation activity yet</p>
                      <p className="text-sm text-gray-400">Messages will appear here as automations run</p>
                    </div>
                  ) : (
                    <div className="bg-gray-50 rounded-xl overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recipient</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Channel</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {automationHistory.map((activity) => (
                            <tr key={activity.id} className="hover:bg-gray-100">
                              <td className="px-4 py-3 text-sm text-gray-900">
                                {activity.subject?.replace('Automation: ', '')}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {activity.contact?.firstName} {activity.contact?.lastName}
                              </td>
                              <td className="px-4 py-3">
                                {activity.type === 'SMS_SENT' ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                    <Phone className="w-3 h-3 mr-1" />
                                    SMS
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                    <Mail className="w-3 h-3 mr-1" />
                                    Email
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                  activity.status === 'SENT' ? 'bg-green-100 text-green-700' :
                                  activity.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                                  'bg-gray-100 text-gray-600'
                                }`}>
                                  {activity.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-500">
                                {new Date(activity.occurredAt).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Template Modal */}
      {showTemplateModal && <TemplateModal />}

      {/* Automation Edit Modal */}
      {showAutomationModal && editingAutomation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-xl font-semibold text-gray-900">
                Edit {AUTOMATION_CONFIG[editingAutomation.type]?.label || editingAutomation.name}
              </h2>
            </div>
            <AutomationEditForm
              automation={editingAutomation}
              onSave={(data) => {
                updateAutomationMutation.mutate({
                  type: editingAutomation.type,
                  data
                });
              }}
              onCancel={() => {
                setShowAutomationModal(false);
                setEditingAutomation(null);
              }}
              onTest={(channel, to) => {
                testAutomationMutation.mutate({
                  type: editingAutomation.type,
                  channel,
                  to
                });
              }}
              isSaving={updateAutomationMutation.isPending}
              isTesting={testAutomationMutation.isPending}
            />
          </div>
        </div>
        )}
      </div>
    </AdminLayout>
  );
}

// Automation Edit Form Component
function AutomationEditForm({ automation, onSave, onCancel, onTest, isSaving, isTesting }) {
  const [formData, setFormData] = useState({
    enabled: automation.enabled,
    smsEnabled: automation.smsEnabled,
    emailEnabled: automation.emailEnabled,
    smsTemplate: automation.smsTemplate || '',
    emailSubject: automation.emailSubject || '',
    emailTemplate: automation.emailTemplate || '',
    triggerDelay: automation.triggerDelay || 0,
  });
  const [testChannel, setTestChannel] = useState('sms');
  const [testTo, setTestTo] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-6">
      {/* Enable/Disable Toggles */}
      <div className="grid grid-cols-3 gap-4">
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <span className="text-sm font-medium text-gray-700">Enabled</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={formData.enabled}
              onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-500"></div>
          </label>
        </div>
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <span className="text-sm font-medium text-gray-700">SMS</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={formData.smsEnabled}
              onChange={(e) => setFormData({ ...formData, smsEnabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-500"></div>
          </label>
        </div>
        {automation.type !== 'appointment_reminder_2h' && (
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <span className="text-sm font-medium text-gray-700">Email</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formData.emailEnabled}
                onChange={(e) => setFormData({ ...formData, emailEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
            </label>
          </div>
        )}
      </div>

      {/* SMS Template */}
      {formData.smsEnabled && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Phone className="w-4 h-4 inline mr-1" />
            SMS Template
          </label>
          <textarea
            value={formData.smsTemplate}
            onChange={(e) => setFormData({ ...formData, smsTemplate: e.target.value })}
            rows={4}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none resize-none font-mono text-sm"
            placeholder="Hi {firstName}! Your appointment is confirmed..."
          />
          <p className="text-xs text-gray-500 mt-1">
            Variables: {'{firstName}'}, {'{lastName}'}, {'{appointmentDate}'}, {'{appointmentTime}'}, {'{crewName}'}, {'{address}'}, {'{workType}'}, {'{reviewLink}'}
          </p>
        </div>
      )}

      {/* Email Templates */}
      {formData.emailEnabled && automation.type !== 'appointment_reminder_2h' && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Mail className="w-4 h-4 inline mr-1" />
              Email Subject
            </label>
            <input
              type="text"
              value={formData.emailSubject}
              onChange={(e) => setFormData({ ...formData, emailSubject: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
              placeholder="Your appointment is confirmed!"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Body
            </label>
            <textarea
              value={formData.emailTemplate}
              onChange={(e) => setFormData({ ...formData, emailTemplate: e.target.value })}
              rows={8}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none resize-none font-mono text-sm"
              placeholder="Hi {firstName},\n\nYour appointment has been confirmed..."
            />
          </div>
        </>
      )}

      {/* Test Section */}
      <div className="border-t border-gray-200 pt-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Send Test Message
        </label>
        <div className="flex space-x-2">
          <select
            value={testChannel}
            onChange={(e) => setTestChannel(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
          >
            <option value="sms">SMS</option>
            {automation.type !== 'appointment_reminder_2h' && <option value="email">Email</option>}
          </select>
          <input
            type={testChannel === 'email' ? 'email' : 'tel'}
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder={testChannel === 'email' ? 'test@example.com' : '+1 (555) 123-4567'}
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
          />
          <button
            type="button"
            onClick={() => onTest(testChannel, testTo)}
            disabled={!testTo || isTesting}
            className="px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {isTesting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <PlayCircle className="w-4 h-4 mr-2" />
                Test
              </>
            )}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Test messages use sample data to show how the template will look.
        </p>
      </div>

      {/* Form Buttons */}
      <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center"
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save Automation
        </button>
      </div>
    </form>
  );
}
