import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth, ROLE_TYPES } from '../context/AuthContext';
import { useRingCentral } from '../context/RingCentralContext';
import { leadsApi, opportunitiesApi, usersApi, accountsApi, bamboogliApi, callListsApi, ringCentralApi } from '../services/api';
import CrewSelector from '../components/CrewSelector';
import { formatDistanceToNow, format, parseISO, startOfDay, startOfWeek, startOfMonth, endOfDay, endOfWeek, endOfMonth, isToday, isTomorrow, addDays } from 'date-fns';
import { formatNumber } from '../utils/formatters';
import {
  Phone,
  UserPlus,
  Clock,
  TrendingUp,
  Award,
  Target,
  ArrowRight,
  ChevronUp,
  ChevronDown,
  Minus,
  Trophy,
  Medal,
  Star,
  Flame,
  Zap,
  Calendar,
  Users,
  User,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  CheckCircle,
  Crown,
  AlertCircle,
  CalendarCheck,
  CalendarX,
  MessageSquare,
  ClipboardList,
  RefreshCw,
  MapPin,
  X,
  CalendarPlus,
  Check,
  XCircle,
  Edit3,
  Wrench,
  CheckCheck,
  Mail,
  Loader2,
  FileText,
  Send,
  List,
  PlayCircle,
  PauseCircle,
  StopCircle,
  PhoneMissed,
  SkipForward,
  RotateCcw,
  Plus,
  Upload,
  ExternalLink,
} from 'lucide-react';

// Time period options for the leaderboard
const TIME_PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
];

// Dashboard view tabs - all tabs visible to call center roles
// The Queue Manager tab shows different views based on isManager:
// - Managers see all queue items across the team
// - Regular reps see only items assigned to them
const DASHBOARD_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: Target },
  { id: 'managerDashboard', label: 'Queue Manager', icon: Users },
  { id: 'callLists', label: 'Call Lists', icon: List },
  { id: 'unconfirmed', label: 'Unconfirmed Leads', icon: AlertCircle },
  { id: 'unscheduled', label: 'Unscheduled Appts', icon: CalendarX },
  { id: 'serviceRequests', label: 'Service Requests', icon: Wrench },
];

// Appointment date filter options
const APPT_DATE_FILTERS = [
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'thisWeek', label: 'This Week' },
  { id: 'all', label: 'All' },
];

// SMS Modal Component with Canned Responses
function SmsModal({ isOpen, onClose, phone, recipientName, onSent, mergeData = {} }) {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Load SMS templates when modal opens
  useEffect(() => {
    if (isOpen) {
      loadTemplates();
      setMessage('');
      setSelectedTemplate('');
      setError('');
    }
  }, [isOpen]);

  const loadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const data = await bamboogliApi.getMessageTemplates({ channel: 'SMS', isActive: true });
      setTemplates(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load templates:', err);
      setTemplates([]);
    } finally {
      setLoadingTemplates(false);
    }
  };

  // Apply template with merge field interpolation
  const handleTemplateSelect = (templateId) => {
    setSelectedTemplate(templateId);
    if (!templateId) return;

    const template = templates.find((t) => t.id === templateId);
    if (template) {
      // Interpolate merge fields
      let interpolated = template.body || '';
      const data = {
        firstName: mergeData.firstName || '',
        lastName: mergeData.lastName || '',
        fullName: mergeData.fullName || `${mergeData.firstName || ''} ${mergeData.lastName || ''}`.trim(),
        company: mergeData.company || '',
        phone: mergeData.phone || phone,
        ...mergeData,
      };

      // Replace {{variable}} and {variable} patterns
      interpolated = interpolated.replace(/\{\{?(\w+)\}?\}/g, (match, key) => {
        return data[key] !== undefined && data[key] !== '' ? data[key] : match;
      });

      setMessage(interpolated);
    }
  };

  const handleSend = async () => {
    if (!message.trim()) return;

    setIsSending(true);
    setError('');

    try {
      await bamboogliApi.sendSms({
        to: phone,
        body: message.trim(),
        recipientName,
      });
      setMessage('');
      setSelectedTemplate('');
      onSent?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send SMS');
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  // Group templates by category
  const templatesByCategory = templates.reduce((acc, t) => {
    const cat = t.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(t);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />
        <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <MessageSquare className="w-5 h-5 mr-2 text-blue-500" />
              Send SMS
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
            <div className="px-3 py-2 bg-gray-50 rounded-lg text-gray-600">
              {recipientName} • {phone}
            </div>
          </div>

          {/* Canned Response Selector */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <FileText className="w-4 h-4 inline mr-1" />
              Quick Response
            </label>
            <select
              value={selectedTemplate}
              onChange={(e) => handleTemplateSelect(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              disabled={loadingTemplates}
            >
              <option value="">{loadingTemplates ? 'Loading templates...' : 'Select a template...'}</option>
              {Object.entries(templatesByCategory).map(([category, categoryTemplates]) => (
                <optgroup key={category} label={category}>
                  {categoryTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              placeholder="Type your message or select a quick response..."
              autoFocus
            />
            <div className="text-xs text-gray-400 mt-1 text-right">
              {message.length} characters {message.length > 160 && `(${Math.ceil(message.length / 153)} segments)`}
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">
              {error}
            </div>
          )}

          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={!message.trim() || isSending}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span>{isSending ? 'Sending...' : 'Send'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Email Modal Component with Canned Responses
function EmailModal({ isOpen, onClose, email, recipientName, onSent, mergeData = {} }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Load email templates when modal opens
  useEffect(() => {
    if (isOpen) {
      loadTemplates();
      setSubject('');
      setBody('');
      setSelectedTemplate('');
      setError('');
    }
  }, [isOpen]);

  const loadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const data = await bamboogliApi.getMessageTemplates({ channel: 'EMAIL', isActive: true });
      setTemplates(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load templates:', err);
      setTemplates([]);
    } finally {
      setLoadingTemplates(false);
    }
  };

  // Apply template with merge field interpolation
  const handleTemplateSelect = (templateId) => {
    setSelectedTemplate(templateId);
    if (!templateId) return;

    const template = templates.find((t) => t.id === templateId);
    if (template) {
      const data = {
        firstName: mergeData.firstName || '',
        lastName: mergeData.lastName || '',
        fullName: mergeData.fullName || `${mergeData.firstName || ''} ${mergeData.lastName || ''}`.trim(),
        company: mergeData.company || '',
        email: mergeData.email || email,
        ...mergeData,
      };

      // Interpolate subject
      let interpolatedSubject = template.subject || '';
      interpolatedSubject = interpolatedSubject.replace(/\{\{?(\w+)\}?\}/g, (match, key) => {
        return data[key] !== undefined && data[key] !== '' ? data[key] : match;
      });

      // Interpolate body
      let interpolatedBody = template.body || '';
      interpolatedBody = interpolatedBody.replace(/\{\{?(\w+)\}?\}/g, (match, key) => {
        return data[key] !== undefined && data[key] !== '' ? data[key] : match;
      });

      setSubject(interpolatedSubject);
      setBody(interpolatedBody);
    }
  };

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) return;

    setIsSending(true);
    setError('');

    try {
      await bamboogliApi.sendEmail({
        to: email,
        subject: subject.trim(),
        body: body.trim(),
        recipientName,
      });
      setSubject('');
      setBody('');
      setSelectedTemplate('');
      onSent?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send email');
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  // Group templates by category
  const templatesByCategory = templates.reduce((acc, t) => {
    const cat = t.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(t);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />
        <div className="relative bg-white rounded-xl shadow-xl max-w-2xl w-full p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <Mail className="w-5 h-5 mr-2 text-purple-500" />
              Compose Email
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
            <div className="px-3 py-2 bg-gray-50 rounded-lg text-gray-600">
              {recipientName} &lt;{email}&gt;
            </div>
          </div>

          {/* Canned Response Selector */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <FileText className="w-4 h-4 inline mr-1" />
              Email Template
            </label>
            <select
              value={selectedTemplate}
              onChange={(e) => handleTemplateSelect(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
              disabled={loadingTemplates}
            >
              <option value="">{loadingTemplates ? 'Loading templates...' : 'Select a template...'}</option>
              {Object.entries(templatesByCategory).map(([category, categoryTemplates]) => (
                <optgroup key={category} label={category}>
                  {categoryTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Email subject..."
              autoFocus
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              placeholder="Type your message or select a template..."
            />
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">
              {error}
            </div>
          )}

          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={!subject.trim() || !body.trim() || isSending}
              className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span>{isSending ? 'Sending...' : 'Send Email'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// CALL LISTS PANEL - Manage and dial from call lists
// ============================================================================
function CallListsPanel({ clickToCall, openSmsModal, isManager = false }) {
  const queryClient = useQueryClient();
  const [selectedList, setSelectedList] = useState(null);
  const [currentItem, setCurrentItem] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [showDispositionModal, setShowDispositionModal] = useState(false);
  const [dispositionNotes, setDispositionNotes] = useState('');
  const [selectedDisposition, setSelectedDisposition] = useState('');

  // State for Create List modal
  const [showCreateListModal, setShowCreateListModal] = useState(false);
  const [newListForm, setNewListForm] = useState({
    name: '',
    description: '',
    listType: 'STATIC',
    targetObject: 'Lead',
    cadenceHours: 4,
    maxAttempts: 6,
    cooldownDays: 7,
  });

  // State for Push to RingCX modal
  const [showRingCxModal, setShowRingCxModal] = useState(false);
  const [selectedRingCxCampaign, setSelectedRingCxCampaign] = useState(null);
  const [ringCxSyncSuccess, setRingCxSyncSuccess] = useState(null);

  // Fetch all call lists
  const { data: listsData, isLoading: listsLoading, refetch: refetchLists } = useQuery({
    queryKey: ['callLists'],
    queryFn: () => callListsApi.getLists({ isActive: true }),
  });

  // Fetch global dispositions
  const { data: dispositionsData } = useQuery({
    queryKey: ['callDispositions'],
    queryFn: () => callListsApi.getGlobalDispositions(),
  });

  // Fetch items for selected list
  const { data: itemsData, isLoading: itemsLoading, refetch: refetchItems } = useQuery({
    queryKey: ['callListItems', selectedList?.id],
    queryFn: () => callListsApi.getItems(selectedList.id, { status: 'PENDING', limit: 100 }),
    enabled: !!selectedList?.id,
  });

  // Fetch active session
  const { data: sessionData, refetch: refetchSession } = useQuery({
    queryKey: ['activeCallSession'],
    queryFn: () => callListsApi.getActiveSession(),
  });

  useEffect(() => {
    if (sessionData?.data) {
      setActiveSession(sessionData.data);
    }
  }, [sessionData]);

  const lists = listsData?.data || [];
  const items = itemsData?.data || [];
  const dispositions = dispositionsData?.data || [];

  // Fetch RingCX dial groups and campaigns for Push to RingCX feature
  // Note: RingCX is optional - errors are silently handled if not configured
  const { data: ringCxDialGroupsData, isLoading: ringCxDialGroupsLoading } = useQuery({
    queryKey: ['ringCxDialGroups'],
    queryFn: async () => {
      try {
        return await ringCentralApi.getRingCxDialGroups();
      } catch (error) {
        // RingCX may not be configured - fail silently
        console.debug('RingCX dial groups not available:', error?.response?.status || error.message);
        return { data: [] };
      }
    },
    enabled: isManager, // Only fetch for managers
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: false, // Don't retry on failure - RingCX may not be configured
  });

  const ringCxDialGroups = ringCxDialGroupsData?.data || [];

  // Initialize predefined lists
  const initListsMutation = useMutation({
    mutationFn: () => callListsApi.initPredefinedLists(),
    onSuccess: () => {
      refetchLists();
    },
  });

  // Create a new call list
  const createListMutation = useMutation({
    mutationFn: (data) => callListsApi.createList(data),
    onSuccess: () => {
      refetchLists();
      setShowCreateListModal(false);
      setNewListForm({
        name: '',
        description: '',
        listType: 'STATIC',
        targetObject: 'Lead',
        cadenceHours: 4,
        maxAttempts: 6,
        cooldownDays: 7,
      });
    },
  });

  // Handle create list form submission
  const handleCreateList = () => {
    if (!newListForm.name.trim()) return;
    createListMutation.mutate({
      name: newListForm.name.trim(),
      description: newListForm.description.trim() || null,
      listType: newListForm.listType,
      targetObject: newListForm.targetObject,
      cadence_hours: parseInt(newListForm.cadenceHours) || 4,
      max_attempts: parseInt(newListForm.maxAttempts) || 6,
      cooldown_days: parseInt(newListForm.cooldownDays) || 7,
    });
  };

  // Refresh a dynamic list
  const refreshListMutation = useMutation({
    mutationFn: (listId) => callListsApi.refreshList(listId),
    onSuccess: () => {
      refetchLists();
      if (selectedList) refetchItems();
    },
  });

  // Sync call list to RingCX campaign
  const syncToRingCxMutation = useMutation({
    mutationFn: ({ campaignId, callListId }) =>
      ringCentralApi.syncCallListToRingCxCampaign(campaignId, { callListId }),
    onSuccess: (data) => {
      setRingCxSyncSuccess({
        synced: data.data?.synced || 0,
        campaignId: data.data?.campaignId,
      });
      // Close modal after 3 seconds
      setTimeout(() => {
        setShowRingCxModal(false);
        setSelectedRingCxCampaign(null);
        setRingCxSyncSuccess(null);
      }, 3000);
    },
    onError: (error) => {
      console.error('Failed to sync to RingCX:', error);
    },
  });

  // Start calling session
  const startSessionMutation = useMutation({
    mutationFn: ({ listId, dialerMode }) => callListsApi.startSession(listId, dialerMode),
    onSuccess: (data) => {
      setActiveSession(data.data);
      getNextItem();
    },
  });

  // End calling session
  const endSessionMutation = useMutation({
    mutationFn: (sessionId) => callListsApi.endSession(sessionId, 'user_ended'),
    onSuccess: () => {
      setActiveSession(null);
      setCurrentItem(null);
      refetchSession();
    },
  });

  // Toggle pause
  const togglePauseMutation = useMutation({
    mutationFn: (sessionId) => callListsApi.togglePause(sessionId),
    onSuccess: (data) => {
      setActiveSession(data.data);
    },
  });

  // Get next item to call
  const getNextItem = async () => {
    if (!selectedList?.id) return;
    try {
      const result = await callListsApi.getNextItem(selectedList.id);
      setCurrentItem(result.data);
    } catch (err) {
      console.error('Failed to get next item:', err);
      setCurrentItem(null);
    }
  };

  // Apply disposition
  const applyDispositionMutation = useMutation({
    mutationFn: ({ listId, itemId, code, notes }) =>
      callListsApi.applyDisposition(listId, itemId, code, notes),
    onSuccess: () => {
      setShowDispositionModal(false);
      setSelectedDisposition('');
      setDispositionNotes('');
      getNextItem(); // Get next item after disposition
      refetchItems();
    },
  });

  // Handle list selection
  const handleSelectList = (list) => {
    setSelectedList(list);
    setCurrentItem(null);
  };

  // Handle start calling
  const handleStartCalling = () => {
    if (!selectedList) return;
    startSessionMutation.mutate({ listId: selectedList.id, dialerMode: 'PREVIEW' });
  };

  // Handle disposition submission
  const handleSubmitDisposition = () => {
    if (!selectedDisposition || !currentItem) return;
    applyDispositionMutation.mutate({
      listId: selectedList.id,
      itemId: currentItem.id,
      code: selectedDisposition,
      notes: dispositionNotes,
    });
  };

  // Handle call button
  const handleCallCurrent = () => {
    if (!currentItem?.phoneNumber) return;
    clickToCall(currentItem.formattedPhone || currentItem.phoneNumber);
  };

  // Skip current item
  const handleSkip = () => {
    setSelectedDisposition('NO_ANSWER');
    setShowDispositionModal(true);
  };

  // Disposition category colors
  const getCategoryColor = (category) => {
    switch (category) {
      case 'POSITIVE': return 'bg-green-100 text-green-700 border-green-300';
      case 'NEGATIVE': return 'bg-red-100 text-red-700 border-red-300';
      case 'CALLBACK': return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'NO_CONTACT': return 'bg-gray-100 text-gray-700 border-gray-300';
      case 'QUALIFIED': return 'bg-purple-100 text-purple-700 border-purple-300';
      case 'DISQUALIFIED': return 'bg-orange-100 text-orange-700 border-orange-300';
      default: return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Actions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <List className="w-5 h-5 text-panda-primary" />
              Call Lists
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Manage call lists and start dialing sessions
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Initialize and Create List buttons - only for managers */}
            {isManager && lists.length === 0 && (
              <button
                onClick={() => initListsMutation.mutate()}
                disabled={initListsMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 transition-colors"
              >
                {initListsMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <PlayCircle className="w-4 h-4" />
                )}
                Initialize Default Lists
              </button>
            )}
            {isManager && (
              <button
                onClick={() => setShowCreateListModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create New List
              </button>
            )}
            {/* Push to RingCX button - only visible when a list is selected and user is manager */}
            {isManager && selectedList && (
              <button
                onClick={() => setShowRingCxModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                <Upload className="w-4 h-4" />
                Push to RingCX
              </button>
            )}
            <button
              onClick={() => refetchLists()}
              className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Call Lists Column */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Available Lists</h3>
          </div>

          {listsLoading ? (
            <div className="p-8 text-center text-gray-500">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
              Loading lists...
            </div>
          ) : lists.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <List className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="font-medium">No call lists configured</p>
              <p className="text-sm">Click "Initialize Default Lists" to create standard lists</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
              {lists.map((list) => (
                <div
                  key={list.id}
                  onClick={() => handleSelectList(list)}
                  className={`p-4 cursor-pointer transition-colors ${
                    selectedList?.id === list.id
                      ? 'bg-panda-primary/5 border-l-4 border-panda-primary'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-gray-900">{list.name}</div>
                    <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                      {list.pendingItems || 0} pending
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1 line-clamp-1">{list.description}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                    <span>{list.listType}</span>
                    <span>•</span>
                    <span>{list.cadenceHours}hr cadence</span>
                    <span>•</span>
                    <span>{list.maxAttempts} max attempts</span>
                  </div>
                  {list.listType === 'DYNAMIC' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        refreshListMutation.mutate(list.id);
                      }}
                      disabled={refreshListMutation.isPending}
                      className="mt-2 flex items-center gap-1 text-xs text-panda-primary hover:underline"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Refresh List
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active Calling Session */}
        <div className="lg:col-span-2 space-y-4">
          {/* Session Controls */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Calling Session</h3>
              {activeSession ? (
                <div className="flex items-center gap-2">
                  <span className={`text-sm px-3 py-1 rounded-full ${
                    activeSession.pausedAt
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-green-100 text-green-700'
                  }`}>
                    {activeSession.pausedAt ? 'Paused' : 'Active'}
                  </span>
                  <button
                    onClick={() => togglePauseMutation.mutate(activeSession.id)}
                    className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                    title={activeSession.pausedAt ? 'Resume' : 'Pause'}
                  >
                    {activeSession.pausedAt ? (
                      <PlayCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <PauseCircle className="w-5 h-5 text-yellow-600" />
                    )}
                  </button>
                  <button
                    onClick={() => endSessionMutation.mutate(activeSession.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                    title="End Session"
                  >
                    <StopCircle className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleStartCalling}
                  disabled={!selectedList || startSessionMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {startSessionMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <PlayCircle className="w-4 h-4" />
                  )}
                  Start Calling
                </button>
              )}
            </div>

            {!selectedList ? (
              <div className="text-center py-8 text-gray-500">
                <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="font-medium">Select a call list to begin</p>
                <p className="text-sm">Choose a list from the left panel to start calling</p>
              </div>
            ) : !activeSession ? (
              <div className="text-center py-8 text-gray-500">
                <Phone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="font-medium">Ready to call from "{selectedList.name}"</p>
                <p className="text-sm">Click "Start Calling" to begin your session</p>
              </div>
            ) : currentItem ? (
              <div className="space-y-4">
                {/* Current Contact Card */}
                <div className="bg-gradient-to-r from-panda-primary/10 to-panda-secondary/10 rounded-xl p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-xl font-semibold text-gray-900">
                        {currentItem.displayName}
                      </h4>
                      <p className="text-lg text-gray-600 mt-1">
                        {currentItem.formattedPhone || currentItem.phoneNumber}
                      </p>
                      {currentItem.displayAddress && (
                        <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                          <MapPin className="w-4 h-4" />
                          {currentItem.displayAddress}
                        </p>
                      )}
                      {currentItem.displayStatus && (
                        <span className="inline-block mt-2 text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                          {currentItem.displayStatus}
                        </span>
                      )}
                    </div>
                    <div className="text-right text-sm text-gray-500">
                      <p>Attempt {currentItem.attemptCount + 1} of {selectedList?.maxAttempts || 6}</p>
                      {currentItem.lastAttemptAt && (
                        <p className="text-xs">
                          Last: {formatDistanceToNow(parseISO(currentItem.lastAttemptAt), { addSuffix: true })}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-3 mt-6">
                    <button
                      onClick={handleCallCurrent}
                      className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors font-semibold text-lg"
                    >
                      <Phone className="w-5 h-5" />
                      Call Now
                    </button>
                    <button
                      onClick={() => openSmsModal?.(
                        { phone: currentItem.formattedPhone || currentItem.phoneNumber },
                        'lead'
                      )}
                      className="p-3 bg-blue-100 text-blue-700 rounded-xl hover:bg-blue-200 transition-colors"
                      title="Send SMS"
                    >
                      <MessageSquare className="w-5 h-5" />
                    </button>
                    <button
                      onClick={handleSkip}
                      className="p-3 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors"
                      title="Skip (No Answer)"
                    >
                      <SkipForward className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Disposition Buttons */}
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Quick Dispositions</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {dispositions
                      .filter(d => ['APPOINTMENT_SET', 'INTERESTED', 'NOT_INTERESTED', 'CALLBACK_REQUESTED'].includes(d.code))
                      .map((disp) => (
                        <button
                          key={disp.code}
                          onClick={() => {
                            setSelectedDisposition(disp.code);
                            setShowDispositionModal(true);
                          }}
                          className={`px-3 py-2 text-sm rounded-lg border transition-colors ${getCategoryColor(disp.category)}`}
                        >
                          {disp.name}
                        </button>
                      ))}
                  </div>
                  <button
                    onClick={() => setShowDispositionModal(true)}
                    className="mt-3 text-sm text-panda-primary hover:underline"
                  >
                    More dispositions...
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle className="w-12 h-12 text-green-300 mx-auto mb-3" />
                <p className="font-medium text-gray-700">No more items in this list!</p>
                <p className="text-sm">All available contacts have been processed</p>
              </div>
            )}
          </div>

          {/* Session Stats */}
          {activeSession && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Session Stats</h4>
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">{activeSession.totalCalls}</p>
                  <p className="text-xs text-gray-500">Total Calls</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{activeSession.connectedCalls}</p>
                  <p className="text-xs text-gray-500">Connected</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">
                    {activeSession.connectedCalls > 0
                      ? Math.round((activeSession.connectedCalls / activeSession.totalCalls) * 100)
                      : 0}%
                  </p>
                  <p className="text-xs text-gray-500">Connect Rate</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">
                    {Math.round(activeSession.totalTalkTimeMs / 60000)}m
                  </p>
                  <p className="text-xs text-gray-500">Talk Time</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Disposition Modal */}
      {showDispositionModal && currentItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Record Call Outcome
              </h3>
              <button
                onClick={() => {
                  setShowDispositionModal(false);
                  setSelectedDisposition('');
                  setDispositionNotes('');
                }}
                className="p-1 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Contact Info */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="font-medium text-gray-900">{currentItem.displayName}</p>
                <p className="text-sm text-gray-500">{currentItem.formattedPhone}</p>
              </div>

              {/* Disposition Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Disposition
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {dispositions.map((disp) => (
                    <button
                      key={disp.code}
                      onClick={() => setSelectedDisposition(disp.code)}
                      className={`px-3 py-2 text-sm rounded-lg border transition-colors text-left ${
                        selectedDisposition === disp.code
                          ? 'ring-2 ring-panda-primary bg-panda-primary/10'
                          : getCategoryColor(disp.category)
                      }`}
                    >
                      {disp.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (optional)
                </label>
                <textarea
                  value={dispositionNotes}
                  onChange={(e) => setDispositionNotes(e.target.value)}
                  placeholder="Add any notes about this call..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                />
              </div>
            </div>

            <div className="p-5 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDispositionModal(false);
                  setSelectedDisposition('');
                  setDispositionNotes('');
                }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitDisposition}
                disabled={!selectedDisposition || applyDispositionMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 disabled:opacity-50"
              >
                {applyDispositionMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                Save Disposition
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create List Modal */}
      {showCreateListModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-green-600" />
                Create New Call List
              </h3>
              <button
                onClick={() => setShowCreateListModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  List Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newListForm.name}
                  onChange={(e) => setNewListForm({ ...newListForm, name: e.target.value })}
                  placeholder="Enter list name..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={newListForm.description}
                  onChange={(e) => setNewListForm({ ...newListForm, description: e.target.value })}
                  placeholder="Optional description..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    List Type
                  </label>
                  <select
                    value={newListForm.listType}
                    onChange={(e) => setNewListForm({ ...newListForm, listType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  >
                    <option value="STATIC">Static (Manual)</option>
                    <option value="DYNAMIC">Dynamic (Auto-populate)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Target Object
                  </label>
                  <select
                    value={newListForm.targetObject}
                    onChange={(e) => setNewListForm({ ...newListForm, targetObject: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  >
                    <option value="Lead">Leads</option>
                    <option value="Opportunity">Opportunities</option>
                    <option value="Contact">Contacts</option>
                    <option value="Account">Accounts</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cadence (hrs)
                  </label>
                  <input
                    type="number"
                    value={newListForm.cadenceHours}
                    onChange={(e) => setNewListForm({ ...newListForm, cadenceHours: e.target.value })}
                    min="1"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Attempts
                  </label>
                  <input
                    type="number"
                    value={newListForm.maxAttempts}
                    onChange={(e) => setNewListForm({ ...newListForm, maxAttempts: e.target.value })}
                    min="1"
                    max="20"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cooldown (days)
                  </label>
                  <input
                    type="number"
                    value={newListForm.cooldownDays}
                    onChange={(e) => setNewListForm({ ...newListForm, cooldownDays: e.target.value })}
                    min="1"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCreateListModal(false);
                  setNewListForm({
                    name: '',
                    description: '',
                    listType: 'STATIC',
                    targetObject: 'Lead',
                    cadenceHours: 4,
                    maxAttempts: 6,
                    cooldownDays: 7,
                  });
                }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateList}
                disabled={!newListForm.name.trim() || createListMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {createListMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Create List
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Push to RingCX Modal */}
      {showRingCxModal && selectedList && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Upload className="w-5 h-5 text-purple-600" />
                Push to RingCX Campaign
              </h3>
              <button
                onClick={() => {
                  setShowRingCxModal(false);
                  setSelectedRingCxCampaign(null);
                  setRingCxSyncSuccess(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Success Message */}
              {ringCxSyncSuccess && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-medium">Successfully synced!</span>
                  </div>
                  <p className="text-sm text-green-600 mt-1">
                    {ringCxSyncSuccess.synced} leads pushed to RingCX campaign.
                  </p>
                </div>
              )}

              {/* List Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-2">Source List</h4>
                <p className="text-gray-700">{selectedList.name}</p>
                <p className="text-sm text-gray-500 mt-1">
                  {items.length} pending items will be synced
                </p>
              </div>

              {/* Campaign Selector */}
              {!ringCxSyncSuccess && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select RingCX Campaign <span className="text-red-500">*</span>
                  </label>
                  {ringCxDialGroupsLoading ? (
                    <div className="flex items-center gap-2 text-gray-500 py-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading campaigns...
                    </div>
                  ) : ringCxDialGroups.length === 0 ? (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                      <p className="text-sm text-yellow-700">
                        No RingCX dial groups found. Please ensure RingCX is configured in your RingCentral account.
                      </p>
                      <a
                        href="https://app.ringcentral.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-purple-600 hover:text-purple-700 mt-2"
                      >
                        Open RingCentral <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {ringCxDialGroups.map((group) => (
                        <div key={group.dialGroupId} className="border border-gray-200 rounded-lg">
                          <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
                            <p className="font-medium text-gray-900 text-sm">{group.dialGroupName}</p>
                          </div>
                          <div className="p-2 space-y-1">
                            {(group.campaigns || []).map((campaign) => (
                              <button
                                key={campaign.campaignId}
                                onClick={() => setSelectedRingCxCampaign(campaign)}
                                className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                                  selectedRingCxCampaign?.campaignId === campaign.campaignId
                                    ? 'bg-purple-100 border-2 border-purple-500'
                                    : 'hover:bg-gray-100 border-2 border-transparent'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium text-gray-900">
                                    {campaign.campaignName}
                                  </span>
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                                    campaign.isActive
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-gray-100 text-gray-600'
                                  }`}>
                                    {campaign.isActive ? 'Active' : 'Inactive'}
                                  </span>
                                </div>
                                {campaign.description && (
                                  <p className="text-xs text-gray-500 mt-1">{campaign.description}</p>
                                )}
                              </button>
                            ))}
                            {(!group.campaigns || group.campaigns.length === 0) && (
                              <p className="text-xs text-gray-500 px-3 py-2">No campaigns in this dial group</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-5 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowRingCxModal(false);
                  setSelectedRingCxCampaign(null);
                  setRingCxSyncSuccess(null);
                }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                {ringCxSyncSuccess ? 'Close' : 'Cancel'}
              </button>
              {!ringCxSyncSuccess && (
                <button
                  onClick={() => {
                    if (selectedRingCxCampaign && selectedList) {
                      syncToRingCxMutation.mutate({
                        campaignId: selectedRingCxCampaign.campaignId,
                        callListId: selectedList.id,
                      });
                    }
                  }}
                  disabled={!selectedRingCxCampaign || syncToRingCxMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  {syncToRingCxMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  Push {items.length} Leads
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MANAGER QUEUE DASHBOARD - Queue depth, time-in-list metrics, bulk actions
// ============================================================================
function ManagerQueuePanel({ clickToCall, openSmsModal, openEmailModal, users = [], isManager = false, currentUserId = null }) {
  const queryClient = useQueryClient();
  const [expandedList, setExpandedList] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState('');

  // Fetch comprehensive dashboard stats
  const { data: dashboardData, isLoading, refetch } = useQuery({
    queryKey: ['callListDashboard'],
    queryFn: () => callListsApi.getDashboardStats(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch call center team members for assignment
  // Filter by department 'Call Center' to get call center staff
  const { data: teamData } = useQuery({
    queryKey: ['callCenterTeam'],
    queryFn: () => usersApi.getDropdownUsers({ department: 'Call Center' }),
  });

  // State for success message
  const [assignSuccessMessage, setAssignSuccessMessage] = useState(null);

  // Bulk assign mutation
  const bulkAssignMutation = useMutation({
    mutationFn: ({ itemIds, assignToUserId }) => callListsApi.bulkAssign(itemIds, assignToUserId),
    onSuccess: (data, variables) => {
      // Find the assigned team member's name from teamData (since team const isn't available here)
      const teamMembers = teamData?.data || [];
      const assignedMember = teamMembers.find(m => m.id === variables.assignToUserId);
      const assignedName = assignedMember ? `${assignedMember.firstName} ${assignedMember.lastName}` : 'team member';
      const count = variables.itemIds.length;

      setAssignSuccessMessage(`${count} lead${count > 1 ? 's' : ''} assigned to ${assignedName}`);
      setTimeout(() => setAssignSuccessMessage(null), 5000); // Clear after 5 seconds

      setSelectedItems([]);
      setShowAssignModal(false);
      setSelectedUser('');
      refetch();
      queryClient.invalidateQueries({ queryKey: ['callLists'] });
    },
  });

  // Unassign single item mutation
  const unassignItemMutation = useMutation({
    mutationFn: ({ itemId }) => callListsApi.bulkAssign([itemId], null),
    onSuccess: () => {
      setAssignSuccessMessage('Assignment removed');
      setTimeout(() => setAssignSuccessMessage(null), 3000);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['callLists'] });
    },
  });

  const rawStats = dashboardData?.data || { lists: [], activeSessions: [], todayTotals: {} };

  // For non-managers, filter items to only show those assigned to the current user
  // Managers see all items in each list
  const stats = isManager ? rawStats : {
    ...rawStats,
    lists: rawStats.lists.map(list => ({
      ...list,
      // Filter items to only those assigned to current user
      items: (list.items || []).filter(item =>
        item.assignedToId === currentUserId || item.ownerId === currentUserId
      ),
      // Recalculate counts for filtered items
      counts: {
        ...list.counts,
        pending: (list.items || []).filter(item =>
          (item.assignedToId === currentUserId || item.ownerId === currentUserId) &&
          item.status === 'PENDING'
        ).length,
      },
    })).filter(list => list.items.length > 0), // Only show lists that have items for this user
  };

  // Sort team members alphabetically by last name, then first name
  const team = (teamData?.data || users || []).sort((a, b) => {
    const lastNameCompare = (a.lastName || '').localeCompare(b.lastName || '');
    if (lastNameCompare !== 0) return lastNameCompare;
    return (a.firstName || '').localeCompare(b.firstName || '');
  });

  // Format hours into human readable
  const formatHours = (hours) => {
    if (!hours || hours < 1) return '<1 hr';
    if (hours < 24) return `${Math.round(hours)} hrs`;
    const days = Math.floor(hours / 24);
    const remainingHours = Math.round(hours % 24);
    if (remainingHours === 0) return `${days}d`;
    return `${days}d ${remainingHours}h`;
  };

  // Get urgency color based on time in list
  const getUrgencyColor = (hours) => {
    if (!hours) return 'text-gray-500';
    if (hours > 72) return 'text-red-600 font-semibold'; // > 3 days
    if (hours > 24) return 'text-orange-500'; // > 1 day
    if (hours > 4) return 'text-yellow-600'; // > 4 hours
    return 'text-green-600'; // Fresh
  };

  // Toggle item selection
  const toggleItemSelection = (itemId) => {
    setSelectedItems(prev =>
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    );
  };

  // Select all items in a list
  const selectAllInList = (listId) => {
    const list = stats.lists.find(l => l.id === listId);
    if (!list) return;
    const itemIds = list.items.map(i => i.id);
    setSelectedItems(prev => {
      const existing = prev.filter(id => !itemIds.includes(id));
      // If all are selected, deselect all. Otherwise, select all.
      const allSelected = itemIds.every(id => prev.includes(id));
      return allSelected ? existing : [...existing, ...itemIds];
    });
  };

  // Handle bulk assign
  const handleBulkAssign = () => {
    if (!selectedUser || selectedItems.length === 0) return;
    bulkAssignMutation.mutate({ itemIds: selectedItems, assignToUserId: selectedUser });
  };

  // Get priority badge color
  const getPriorityColor = (priority) => {
    if (priority >= 8) return 'bg-red-100 text-red-700 border-red-300';
    if (priority >= 5) return 'bg-orange-100 text-orange-700 border-orange-300';
    return 'bg-gray-100 text-gray-600 border-gray-300';
  };

  return (
    <div className="space-y-6">
      {/* Header - Different for managers vs reps */}
      {!isManager && (
        <div className="bg-gradient-to-r from-panda-primary to-panda-secondary rounded-xl p-4 text-white">
          <h2 className="text-xl font-bold">My Assigned Leads</h2>
          <p className="text-white/80 text-sm">Leads assigned to you to call. Contact your manager if you need more leads.</p>
        </div>
      )}

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <List className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{isManager ? 'Active Lists' : 'My Lists'}</p>
              <p className="text-2xl font-bold text-gray-900">{stats.lists.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
              <Clock className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{isManager ? 'Total Queue' : 'My Queue'}</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.lists.reduce((sum, l) => sum + (l.counts?.pending || 0), 0)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Completed Today</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.todayTotals?.completedToday || 0}
              </p>
            </div>
          </div>
        </div>

        {/* Active Sessions - Only show for managers */}
        {isManager ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <Users className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Active Sessions</p>
                <p className="text-2xl font-bold text-gray-900">{stats.activeSessions?.length || 0}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <PhoneCall className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Items</p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.lists.reduce((sum, l) => sum + (l.items?.length || 0), 0)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Success Message Banner */}
      {assignSuccessMessage && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
          <span className="text-green-700 font-medium">{assignSuccessMessage}</span>
          <button
            onClick={() => setAssignSuccessMessage(null)}
            className="ml-auto text-green-600 hover:text-green-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Action Bar - Only show bulk assign for managers */}
      {selectedItems.length > 0 && (
        <div className="bg-panda-primary/10 border border-panda-primary/20 rounded-xl p-4 flex items-center justify-between">
          <span className="text-panda-primary font-medium">
            {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-3">
            {isManager && (
              <button
                onClick={() => setShowAssignModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90"
              >
                <UserPlus className="w-4 h-4" />
                Assign to Team Member
              </button>
            )}
            <button
              onClick={() => setSelectedItems([])}
              className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Clear Selection
            </button>
          </div>
        </div>
      )}

      {/* Queue Lists */}
      {isLoading ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-panda-primary mb-2" />
          <p className="text-gray-500">Loading queue data...</p>
        </div>
      ) : stats.lists.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <List className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          {isManager ? (
            <>
              <p className="font-medium text-gray-700">No call lists configured</p>
              <p className="text-sm text-gray-500">Initialize call lists from the Call Lists tab first</p>
            </>
          ) : (
            <>
              <p className="font-medium text-gray-700">No leads assigned to you</p>
              <p className="text-sm text-gray-500">Contact your manager to get leads assigned to your queue</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {stats.lists.map((list) => (
            <div key={list.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              {/* List Header - Click to expand */}
              <div
                onClick={() => setExpandedList(expandedList === list.id ? null : list.id)}
                className="p-5 cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      list.counts.pending > 20 ? 'bg-red-100' :
                      list.counts.pending > 10 ? 'bg-orange-100' :
                      list.counts.pending > 0 ? 'bg-blue-100' : 'bg-gray-100'
                    }`}>
                      <span className={`text-xl font-bold ${
                        list.counts.pending > 20 ? 'text-red-600' :
                        list.counts.pending > 10 ? 'text-orange-600' :
                        list.counts.pending > 0 ? 'text-blue-600' : 'text-gray-400'
                      }`}>
                        {list.counts.pending}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                        {list.name}
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${getPriorityColor(list.priority)}`}>
                          P{list.priority}
                        </span>
                      </h3>
                      <p className="text-sm text-gray-500">{list.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    {/* Time Metrics */}
                    <div className="text-right">
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Avg Time in List</p>
                      <p className={`text-lg font-semibold ${getUrgencyColor(list.metrics.avgTimeInListHours)}`}>
                        {formatHours(list.metrics.avgTimeInListHours)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Oldest</p>
                      <p className={`text-lg font-semibold ${getUrgencyColor(list.metrics.oldestItemHours)}`}>
                        {formatHours(list.metrics.oldestItemHours)}
                      </p>
                    </div>

                    {/* Stats Pills */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">
                        {list.counts.inProgress} in progress
                      </span>
                      <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">
                        {list.counts.completedToday} today
                      </span>
                    </div>

                    {/* Expand/Collapse Icon */}
                    {expandedList === list.id ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>
              </div>

              {/* Expanded Items List */}
              {expandedList === list.id && (
                <div className="border-t border-gray-100">
                  <div className="p-4 bg-gray-50 flex items-center justify-between">
                    <button
                      onClick={() => selectAllInList(list.id)}
                      className="text-sm text-panda-primary hover:underline"
                    >
                      {list.items.every(i => selectedItems.includes(i.id)) ? 'Deselect All' : 'Select All'}
                    </button>
                    <span className="text-sm text-gray-500">
                      Showing {Math.min(50, list.items.length)} of {list.counts.pending} pending
                    </span>
                  </div>

                  {list.items.length === 0 ? (
                    <div className="p-6 text-center text-gray-500">
                      <CheckCircle className="w-8 h-8 text-green-300 mx-auto mb-2" />
                      <p>No pending items in this list</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                      {list.items.map((item) => (
                        <div
                          key={item.id}
                          className={`p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors ${
                            selectedItems.includes(item.id) ? 'bg-panda-primary/5' : ''
                          }`}
                        >
                          {/* Checkbox */}
                          <input
                            type="checkbox"
                            checked={selectedItems.includes(item.id)}
                            onChange={() => toggleItemSelection(item.id)}
                            className="w-4 h-4 rounded border-gray-300 text-panda-primary focus:ring-panda-primary"
                          />

                          {/* Contact Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-gray-900 truncate">{item.displayName}</p>
                              {/* Assigned To Badge - prominently displayed */}
                              {(item.assignedToName || item.ownerName) ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                                  <User className="w-3 h-3" />
                                  {item.assignedToName || item.ownerName}
                                  {/* X button to unassign */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (window.confirm(`Remove assignment from ${item.displayName}?`)) {
                                        unassignItemMutation.mutate({ itemId: item.id });
                                      }
                                    }}
                                    className="ml-1 hover:bg-blue-200 rounded-full p-0.5"
                                    title="Remove assignment"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">
                                  Unassigned
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-sm text-gray-500">
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {item.phone || 'No phone'}
                              </span>
                              {item.email && (
                                <span className="flex items-center gap-1">
                                  <Mail className="w-3 h-3" />
                                  {item.email}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Time in List */}
                          <div className="text-right">
                            <p className="text-xs text-gray-500">In list</p>
                            <p className={`font-medium ${getUrgencyColor(item.hoursInList)}`}>
                              {formatHours(item.hoursInList)}
                            </p>
                          </div>

                          {/* Attempt Count */}
                          <div className="text-right">
                            <p className="text-xs text-gray-500">Attempts</p>
                            <p className="font-medium text-gray-700">{item.attemptCount}/{list.maxAttempts}</p>
                          </div>

                          {/* Quick Actions */}
                          <div className="flex items-center gap-1">
                            {item.phone && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  clickToCall?.(item.phone);
                                }}
                                className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                                title="Call"
                              >
                                <Phone className="w-4 h-4" />
                              </button>
                            )}
                            {item.phone && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openSmsModal?.({ phone: item.phone, name: item.displayName }, 'lead');
                                }}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                                title="Send SMS"
                              >
                                <MessageSquare className="w-4 h-4" />
                              </button>
                            )}
                            {item.email && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEmailModal?.({ email: item.email, name: item.displayName }, 'lead');
                                }}
                                className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg"
                                title="Send Email"
                              >
                                <Mail className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Active Sessions */}
      {stats.activeSessions?.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <PhoneCall className="w-5 h-5 text-green-600" />
            Active Calling Sessions
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stats.activeSessions.map((session) => (
              <div key={session.id} className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{session.userName || 'Agent'}</p>
                    <p className="text-sm text-gray-500">{session.listName}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    session.pausedAt ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                  }`}>
                    {session.pausedAt ? 'Paused' : 'Active'}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-3 text-sm text-gray-600">
                  <span>Calls: {session.callsCompleted}</span>
                  <span>Connected: {session.callsConnected}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Assign {selectedItems.length} Lead{selectedItems.length !== 1 ? 's' : ''} to Team Member
              </h3>
              <button
                onClick={() => setShowAssignModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Team Member
              </label>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
              >
                <option value="">Choose a team member...</option>
                {team.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.lastName}, {member.firstName}
                  </option>
                ))}
              </select>
            </div>

            <div className="p-5 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setShowAssignModal(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkAssign}
                disabled={!selectedUser || bulkAssignMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 disabled:opacity-50"
              >
                {bulkAssignMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <UserPlus className="w-4 h-4" />
                )}
                Assign Leads
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CallCenterDashboard() {
  const { user } = useAuth();
  const { clickToCall } = useRingCentral();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [timePeriod, setTimePeriod] = useState('today');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [apptDateFilter, setApptDateFilter] = useState('today');

  // Read tab from URL query param (e.g., /call-center?tab=serviceRequests)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab && DASHBOARD_TABS.some(t => t.id === tab)) {
      setActiveTab(tab);
    }
  }, [location.search]);

  // Modal states for lead confirmation and appointment booking
  const [confirmLeadModal, setConfirmLeadModal] = useState({ open: false, lead: null });
  const [bookApptModal, setBookApptModal] = useState({ open: false, opportunity: null });
  const [addNoteModal, setAddNoteModal] = useState({ open: false, record: null, type: null }); // type: 'lead' or 'opportunity'
  const [serviceRequestModal, setServiceRequestModal] = useState({ open: false, account: null }); // For creating new service requests
  // SMS and Email modals
  const [smsModal, setSmsModal] = useState({ open: false, phone: '', recipientName: '', mergeData: {} });
  const [emailModal, setEmailModal] = useState({ open: false, email: '', recipientName: '', mergeData: {} });

  // Form states for modals
  const [confirmFormData, setConfirmFormData] = useState({
    appointmentDate: '',
    appointmentTime: '',
    notes: '',
    workType: 'Inspection',
  });
  const [bookApptFormData, setBookApptFormData] = useState({
    scheduledStart: '',
    scheduledEnd: '',
    notes: '',
    selectedCrew: null,
  });
  const [crewSelectorOpen, setCrewSelectorOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [serviceRequestFormData, setServiceRequestFormData] = useState({
    notes: '',
  });

  // Check if user is a call center manager
  const isManager = user?.roleType === ROLE_TYPES.CALL_CENTER_MANAGER || user?.role?.name?.toLowerCase()?.includes('manager');

  // Calculate date range based on selected period
  const getDateRange = () => {
    const now = new Date();
    switch (timePeriod) {
      case 'today':
        return { start: startOfDay(now), end: endOfDay(now) };
      case 'week':
        return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
      case 'month':
        return { start: startOfMonth(now), end: endOfMonth(now) };
      default:
        return { start: startOfDay(now), end: endOfDay(now) };
    }
  };

  const dateRange = getDateRange();

  // Fetch call center leaderboard data
  const { data: leaderboardData, isLoading: leaderboardLoading } = useQuery({
    queryKey: ['callCenterLeaderboard', timePeriod],
    queryFn: () => leadsApi.getCallCenterLeaderboard({
      startDate: format(dateRange.start, 'yyyy-MM-dd'),
      endDate: format(dateRange.end, 'yyyy-MM-dd'),
    }),
    refetchInterval: 60000, // Refresh every minute for live updates
  });

  // Fetch my personal stats
  const { data: myStats } = useQuery({
    queryKey: ['myCallCenterStats', timePeriod, user?.id],
    queryFn: () => leadsApi.getMyCallCenterStats({
      userId: user?.id,
      startDate: format(dateRange.start, 'yyyy-MM-dd'),
      endDate: format(dateRange.end, 'yyyy-MM-dd'),
    }),
    enabled: !!user?.id,
  });

  // Fetch my recent leads (filtered by the selected time period)
  const { data: myRecentLeads } = useQuery({
    queryKey: ['myRecentLeads', user?.id, timePeriod],
    queryFn: () => leadsApi.getLeads({
      ownerId: user?.id,
      limit: 10,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      startDate: format(dateRange.start, 'yyyy-MM-dd'),
      endDate: format(dateRange.end, 'yyyy-MM-dd'),
    }),
    enabled: !!user?.id,
  });

  // Fetch team totals
  const { data: teamTotals } = useQuery({
    queryKey: ['callCenterTeamTotals', timePeriod],
    queryFn: () => leadsApi.getCallCenterTeamTotals({
      startDate: format(dateRange.start, 'yyyy-MM-dd'),
      endDate: format(dateRange.end, 'yyyy-MM-dd'),
    }),
  });

  // Calculate appointment date range based on filter
  const getApptDateRange = () => {
    const now = new Date();
    switch (apptDateFilter) {
      case 'today':
        return { start: format(startOfDay(now), 'yyyy-MM-dd'), end: format(endOfDay(now), 'yyyy-MM-dd') };
      case 'tomorrow':
        const tomorrow = addDays(now, 1);
        return { start: format(startOfDay(tomorrow), 'yyyy-MM-dd'), end: format(endOfDay(tomorrow), 'yyyy-MM-dd') };
      case 'thisWeek':
        return { start: format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'), end: format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd') };
      default:
        return { start: null, end: null };
    }
  };

  const apptDateRange = getApptDateRange();

  // Fetch unconfirmed leads (leads with tentative appointment that need confirmation)
  // Always fetch so tab counts are visible on initial load
  const { data: unconfirmedLeadsData, isLoading: unconfirmedLoading, refetch: refetchUnconfirmed } = useQuery({
    queryKey: ['unconfirmedLeads', apptDateFilter],
    queryFn: () => leadsApi.getUnconfirmedLeads({
      startDate: apptDateRange.start,
      endDate: apptDateRange.end,
      sortBy: 'tentativeAppointmentDate',
      sortOrder: 'asc',
    }),
    staleTime: 30000, // Consider data fresh for 30 seconds
  });

  // Fetch unscheduled appointments (opportunities that need service appointment booked)
  // Always fetch so tab counts are visible on initial load
  const { data: unscheduledData, isLoading: unscheduledLoading, refetch: refetchUnscheduled } = useQuery({
    queryKey: ['unscheduledAppointments', apptDateFilter],
    queryFn: () => opportunitiesApi.getUnscheduledAppointments({
      startDate: apptDateRange.start,
      endDate: apptDateRange.end,
      sortBy: 'tentativeAppointmentDate',
      sortOrder: 'asc',
    }),
    staleTime: 30000, // Consider data fresh for 30 seconds
  });

  const unconfirmedLeads = unconfirmedLeadsData?.data || [];
  const unscheduledAppointments = unscheduledData?.data || unscheduledData?.opportunities || [];

  // Fetch service requests (opportunities with serviceRequired=true, serviceComplete=false)
  // Service requests now live on Jobs (Opportunities) per the Opportunity Hub architecture
  // Always fetch so tab counts are visible on initial load
  const { data: serviceRequestsData, isLoading: serviceRequestsLoading, refetch: refetchServiceRequests } = useQuery({
    queryKey: ['serviceRequests'],
    queryFn: () => opportunitiesApi.getServiceRequests({
      status: 'pending',
    }),
    staleTime: 30000, // Consider data fresh for 30 seconds
  });

  const serviceRequests = serviceRequestsData?.data || [];

  // Mutation: Convert lead and book appointment
  const convertLeadMutation = useMutation({
    mutationFn: async ({ leadId, data }) => {
      return leadsApi.convertLead(leadId, {
        ...data,
        createOpportunity: true,
        createServiceAppointment: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['unconfirmedLeads']);
      queryClient.invalidateQueries(['unscheduledAppointments']);
      queryClient.invalidateQueries(['callCenterLeaderboard']);
      setConfirmLeadModal({ open: false, lead: null });
      setConfirmFormData({ appointmentDate: '', appointmentTime: '', notes: '', workType: 'Inspection' });
    },
  });

  // Mutation: Book appointment for opportunity
  const bookAppointmentMutation = useMutation({
    mutationFn: async ({ opportunityId, data }) => {
      return opportunitiesApi.bookAppointment(opportunityId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['unscheduledAppointments']);
      setBookApptModal({ open: false, opportunity: null });
      setBookApptFormData({ scheduledStart: '', scheduledEnd: '', notes: '', selectedCrew: null });
    },
  });

  // Mutation: Add note to lead
  const addLeadNoteMutation = useMutation({
    mutationFn: async ({ leadId, note }) => {
      return leadsApi.addLeadNote(leadId, note);
    },
    onSuccess: () => {
      setAddNoteModal({ open: false, record: null, type: null });
      setNoteText('');
    },
  });

  // Mutation: Add job message to opportunity
  const addJobMessageMutation = useMutation({
    mutationFn: async ({ opportunityId, message }) => {
      return opportunitiesApi.addJobMessage(opportunityId, message);
    },
    onSuccess: () => {
      setAddNoteModal({ open: false, record: null, type: null });
      setNoteText('');
    },
  });

  // Mutation: Complete service request (now on opportunities)
  const completeServiceRequestMutation = useMutation({
    mutationFn: async (opportunityId) => {
      return opportunitiesApi.completeServiceRequest(opportunityId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['serviceRequests']);
    },
  });

  // Handle confirm lead form submission
  const handleConfirmLead = (e) => {
    e.preventDefault();
    if (!confirmLeadModal.lead) return;

    const appointmentDateTime = new Date(`${confirmFormData.appointmentDate}T${confirmFormData.appointmentTime}`);

    convertLeadMutation.mutate({
      leadId: confirmLeadModal.lead.id,
      data: {
        tentativeAppointmentDate: appointmentDateTime.toISOString(),
        workType: confirmFormData.workType,
        notes: confirmFormData.notes,
      },
    });
  };

  // Handle book appointment form submission
  const handleBookAppointment = (e) => {
    e.preventDefault();
    if (!bookApptModal.opportunity) return;

    bookAppointmentMutation.mutate({
      opportunityId: bookApptModal.opportunity.id,
      data: {
        scheduledStart: bookApptFormData.scheduledStart,
        scheduledEnd: bookApptFormData.scheduledEnd,
        notes: bookApptFormData.notes,
        resourceId: bookApptFormData.selectedCrew?.id, // Assign selected crew
      },
    });
  };

  // Handle crew selection
  const handleCrewSelect = (crew) => {
    setBookApptFormData({ ...bookApptFormData, selectedCrew: crew });
    setCrewSelectorOpen(false);
  };

  // Handle add note form submission
  const handleAddNote = (e) => {
    e.preventDefault();
    if (!addNoteModal.record || !noteText.trim()) return;

    if (addNoteModal.type === 'lead') {
      addLeadNoteMutation.mutate({
        leadId: addNoteModal.record.id,
        note: noteText,
      });
    } else {
      addJobMessageMutation.mutate({
        opportunityId: addNoteModal.record.id,
        message: noteText,
      });
    }
  };

  // Open confirm modal with lead data
  const openConfirmModal = (lead) => {
    setConfirmFormData({
      appointmentDate: lead.tentativeAppointmentDate ? format(parseISO(lead.tentativeAppointmentDate), 'yyyy-MM-dd') : '',
      appointmentTime: lead.tentativeAppointmentTime || '09:00',
      notes: '',
      workType: lead.workType || 'Inspection',
    });
    setConfirmLeadModal({ open: true, lead });
  };

  // Open book appointment modal with opportunity data
  const openBookApptModal = (opportunity) => {
    const startDate = opportunity.tentativeAppointmentDate || opportunity.expectedAppointmentDate;
    const startDateTime = startDate ? format(parseISO(startDate), "yyyy-MM-dd'T'HH:mm") : '';
    const endDateTime = startDate ? format(addDays(parseISO(startDate), 0), "yyyy-MM-dd'T'" ) + '11:00' : '';

    setBookApptFormData({
      scheduledStart: startDateTime || format(new Date(), "yyyy-MM-dd'T'09:00"),
      scheduledEnd: endDateTime || format(new Date(), "yyyy-MM-dd'T'11:00"),
      notes: '',
    });
    setBookApptModal({ open: true, opportunity });
  };

  // Get greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // Find user's position in leaderboard
  const myPosition = leaderboardData?.leaderboard?.findIndex(rep => rep.userId === user?.id) ?? -1;
  const myRank = myPosition >= 0 ? myPosition + 1 : null;

  // Leaderboard with mock data fallback for now
  const leaderboard = leaderboardData?.leaderboard || [];

  // Personal stats with defaults
  const personalStats = myStats || {
    leadsCreated: 0,
    leadsConverted: 0,
    callsMade: 0,
    appointmentsSet: 0,
    conversionRate: 0,
    avgCallDuration: 0,
  };

  // Team totals with defaults
  const totals = teamTotals || {
    totalLeads: 0,
    totalConverted: 0,
    totalAppointments: 0,
    totalCalls: 0,
    teamConversionRate: 0,
  };

  // Get rank icon
  const getRankIcon = (rank) => {
    if (rank === 1) return <Trophy className="w-5 h-5 text-yellow-500" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-gray-400" />;
    if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />;
    return <span className="w-5 h-5 flex items-center justify-center text-sm font-bold text-gray-500">#{rank}</span>;
  };

  // Get rank badge color
  const getRankBadgeColor = (rank) => {
    if (rank === 1) return 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-white';
    if (rank === 2) return 'bg-gradient-to-r from-gray-300 to-gray-400 text-gray-700';
    if (rank === 3) return 'bg-gradient-to-r from-amber-400 to-amber-500 text-white';
    return 'bg-gray-100 text-gray-600';
  };

  // Personal performance cards
  const performanceCards = [
    {
      label: 'Leads Created',
      value: personalStats.leadsCreated,
      icon: UserPlus,
      color: 'from-green-500 to-green-600',
      trend: personalStats.leadsTrend,
    },
    {
      label: 'Appointments Set',
      value: personalStats.appointmentsSet,
      icon: Calendar,
      color: 'from-blue-500 to-blue-600',
      trend: personalStats.appointmentsTrend,
    },
    {
      label: 'Calls Made',
      value: personalStats.callsMade,
      icon: PhoneOutgoing,
      color: 'from-purple-500 to-purple-600',
      trend: personalStats.callsTrend,
    },
    {
      label: 'Conversion Rate',
      value: `${personalStats.conversionRate}%`,
      icon: TrendingUp,
      color: 'from-orange-500 to-orange-600',
      trend: personalStats.conversionTrend,
    },
  ];

  // Format appointment date/time nicely
  const formatApptDateTime = (dateStr, timeStr) => {
    if (!dateStr) return '-';
    const date = parseISO(dateStr);
    const dateLabel = isToday(date) ? 'Today' : isTomorrow(date) ? 'Tomorrow' : format(date, 'EEE, MMM d');
    return timeStr ? `${dateLabel} at ${timeStr}` : dateLabel;
  };

  // Open SMS modal
  const openSmsModal = (record, type) => {
    const phone = type === 'lead'
      ? record.phone
      : (record.contact?.phone || record.account?.phone);
    const recipientName = type === 'lead'
      ? `${record.firstName} ${record.lastName}`
      : (record.contact?.name || record.account?.name || record.name);

    // Build project address from available data
    const getProjectAddress = () => {
      if (type === 'lead') {
        return record.street ? `${record.street}, ${record.city || ''} ${record.state || ''}`.trim() : '';
      }
      const acct = record.account;
      if (acct?.billingStreet) {
        return `${acct.billingStreet}, ${acct.billingCity || ''} ${acct.billingState || ''}`.trim();
      }
      return '';
    };

    const mergeData = type === 'lead'
      ? {
          firstName: record.firstName,
          lastName: record.lastName,
          fullName: `${record.firstName} ${record.lastName}`,
          company: record.company,
          companyName: record.company,
          phone: record.phone,
          email: record.email,
          address: record.street,
          projectAddress: getProjectAddress(),
          city: record.city,
          state: record.state,
          status: record.status,
        }
      : {
          firstName: record.contact?.firstName || record.account?.name?.split(' ')[0] || '',
          lastName: record.contact?.lastName || '',
          fullName: record.contact?.name || record.account?.name || '',
          company: record.account?.name || '',
          companyName: record.account?.name || '',
          phone: record.contact?.phone || record.account?.phone,
          email: record.contact?.email || record.account?.email,
          projectAddress: getProjectAddress(),
          status: record.stage || record.status,
          appointmentDate: record.scheduledStart ? new Date(record.scheduledStart).toLocaleDateString() : '',
        };
    setSmsModal({ open: true, phone, recipientName, mergeData });
  };

  // Open Email modal
  const openEmailModal = (record, type) => {
    const email = type === 'lead'
      ? record.email
      : (record.contact?.email || record.account?.email);
    const recipientName = type === 'lead'
      ? `${record.firstName} ${record.lastName}`
      : (record.contact?.name || record.account?.name || record.name);

    // Build project address from available data
    const getProjectAddress = () => {
      if (type === 'lead') {
        return record.street ? `${record.street}, ${record.city || ''} ${record.state || ''}`.trim() : '';
      }
      const acct = record.account;
      if (acct?.billingStreet) {
        return `${acct.billingStreet}, ${acct.billingCity || ''} ${acct.billingState || ''}`.trim();
      }
      return '';
    };

    const mergeData = type === 'lead'
      ? {
          firstName: record.firstName,
          lastName: record.lastName,
          fullName: `${record.firstName} ${record.lastName}`,
          company: record.company,
          companyName: record.company,
          phone: record.phone,
          email: record.email,
          address: record.street,
          projectAddress: getProjectAddress(),
          city: record.city,
          state: record.state,
          status: record.status,
        }
      : {
          firstName: record.contact?.firstName || record.account?.name?.split(' ')[0] || '',
          lastName: record.contact?.lastName || '',
          fullName: record.contact?.name || record.account?.name || '',
          company: record.account?.name || '',
          companyName: record.account?.name || '',
          phone: record.contact?.phone || record.account?.phone,
          email: record.contact?.email || record.account?.email,
          projectAddress: getProjectAddress(),
          status: record.stage || record.status,
          appointmentDate: record.scheduledStart ? new Date(record.scheduledStart).toLocaleDateString() : '',
        };
    setEmailModal({ open: true, email, recipientName, mergeData });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            {getGreeting()}, {user?.firstName || user?.name?.split(' ')[0] || 'Champ'}!
            {isManager ? <Crown className="w-6 h-6 text-yellow-500" /> : <span>🎯</span>}
          </h1>
          <p className="text-gray-500">
            {isManager ? (
              <>Team Manager - Monitoring {leaderboard.length} team members</>
            ) : myRank ? (
              <>You're currently ranked <span className="font-bold text-panda-primary">#{myRank}</span> on the leaderboard!</>
            ) : (
              "Let's make some calls and climb that leaderboard!"
            )}
          </p>
        </div>

        {/* Time Period Toggle (only show on dashboard tab) */}
        {activeTab === 'dashboard' && (
          <div className="flex bg-gray-100 rounded-lg p-1">
            {TIME_PERIODS.map((period) => (
              <button
                key={period.id}
                onClick={() => setTimePeriod(period.id)}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                  timePeriod === period.id
                    ? 'bg-white text-panda-primary shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {period.label}
              </button>
            ))}
          </div>
        )}

        {/* Appointment Date Filter (show on unconfirmed/unscheduled tabs) */}
        {(activeTab === 'unconfirmed' || activeTab === 'unscheduled') && (
          <div className="flex bg-gray-100 rounded-lg p-1">
            {APPT_DATE_FILTERS.map((filter) => (
              <button
                key={filter.id}
                onClick={() => setApptDateFilter(filter.id)}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                  apptDateFilter === filter.id
                    ? 'bg-white text-panda-primary shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {DASHBOARD_TABS.map((tab) => {
            const Icon = tab.icon;
            const count = tab.id === 'unconfirmed' ? unconfirmedLeads.length :
                         tab.id === 'unscheduled' ? unscheduledAppointments.length :
                         tab.id === 'serviceRequests' ? serviceRequests.length : null;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-4 px-1 border-b-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'border-panda-primary text-panda-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {count !== null && count > 0 && (
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    activeTab === tab.id ? 'bg-panda-primary text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Dashboard Tab Content */}
      {activeTab === 'dashboard' && (
        <>
          {/* My Performance Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {performanceCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="bg-white rounded-xl p-5 shadow-sm border border-gray-100"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {typeof stat.value === 'number' ? formatNumber(stat.value) : stat.value}
                  </p>
                  {stat.trend !== undefined && (
                    <div className={`flex items-center text-xs mt-1 ${
                      stat.trend > 0 ? 'text-green-600' : stat.trend < 0 ? 'text-red-600' : 'text-gray-500'
                    }`}>
                      {stat.trend > 0 ? <ChevronUp className="w-3 h-3" /> :
                       stat.trend < 0 ? <ChevronDown className="w-3 h-3" /> :
                       <Minus className="w-3 h-3" />}
                      <span>{Math.abs(stat.trend)}% vs yesterday</span>
                    </div>
                  )}
                </div>
                <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Leaderboard */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-500" />
                <h2 className="text-lg font-semibold text-gray-900">
                  {timePeriod === 'today' ? "Today's" : timePeriod === 'week' ? 'This Week\'s' : 'This Month\'s'} Leaderboard
                </h2>
              </div>
              <div className="text-sm text-gray-500">
                <Flame className="w-4 h-4 inline text-orange-500 mr-1" />
                Live updates
              </div>
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {leaderboardLoading ? (
              <div className="p-8 text-center text-gray-500">Loading leaderboard...</div>
            ) : leaderboard.length > 0 ? (
              leaderboard.map((rep, index) => {
                const rank = index + 1;
                const isMe = rep.userId === user?.id;
                return (
                  <div
                    key={rep.userId}
                    className={`flex items-center p-4 ${isMe ? 'bg-panda-light' : 'hover:bg-gray-50'} transition-colors`}
                  >
                    {/* Rank */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getRankBadgeColor(rank)}`}>
                      {rank <= 3 ? getRankIcon(rank) : <span className="font-bold">{rank}</span>}
                    </div>

                    {/* Avatar & Name */}
                    <div className="flex items-center flex-1 ml-4">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-panda-primary to-panda-secondary flex items-center justify-center text-white font-medium">
                        {rep.firstName?.[0]}{rep.lastName?.[0]}
                      </div>
                      <div className="ml-3">
                        <p className={`font-medium ${isMe ? 'text-panda-primary' : 'text-gray-900'}`}>
                          {rep.firstName} {rep.lastName}
                          {isMe && <span className="ml-2 text-xs bg-panda-primary text-white px-2 py-0.5 rounded-full">You</span>}
                        </p>
                        <p className="text-xs text-gray-500">{rep.title || 'Call Center Rep'}</p>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-6 text-sm">
                      <div className="text-center">
                        <p className="font-bold text-gray-900">{rep.leadsCreated}</p>
                        <p className="text-xs text-gray-500">Leads</p>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-gray-900">{rep.appointmentsSet}</p>
                        <p className="text-xs text-gray-500">Appts</p>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-blue-600">{rep.conversionRate}%</p>
                        <p className="text-xs text-gray-500">Conv.</p>
                      </div>
                    </div>

                    {/* Streak/Fire indicator */}
                    {rep.streak >= 3 && (
                      <div className="ml-4 flex items-center text-orange-500">
                        <Flame className="w-4 h-4" />
                        <span className="text-xs font-bold ml-1">{rep.streak}</span>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center text-gray-500">
                <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p>No data yet for this period</p>
                <p className="text-sm">Start making calls to appear on the leaderboard!</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Team Totals */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-panda-primary" />
              Team Totals ({timePeriod === 'today' ? 'Today' : timePeriod === 'week' ? 'This Week' : 'This Month'})
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Total Leads</span>
                <span className="font-bold text-gray-900">{formatNumber(totals.totalLeads)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Appointments Set</span>
                <span className="font-bold text-gray-900">{formatNumber(totals.totalAppointments)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Converted</span>
                <span className="font-bold text-green-600">{formatNumber(totals.totalConverted)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Team Conversion</span>
                <span className="font-bold text-blue-600">{totals.teamConversionRate}%</span>
              </div>
              <div className="pt-3 border-t border-gray-100">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Total Calls</span>
                  <span className="font-bold text-purple-600">{formatNumber(totals.totalCalls)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* My Rank Card */}
          {myRank && (
            <div className={`rounded-xl p-5 ${
              myRank === 1 ? 'bg-gradient-to-br from-yellow-400 to-yellow-500 text-white' :
              myRank <= 3 ? 'bg-gradient-to-br from-panda-primary to-panda-secondary text-white' :
              'bg-white border border-gray-100 shadow-sm'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm ${myRank <= 3 ? 'text-white/80' : 'text-gray-500'}`}>Your Rank</p>
                  <p className="text-4xl font-bold mt-1">#{myRank}</p>
                </div>
                <div className="text-right">
                  {myRank === 1 ? (
                    <Trophy className="w-12 h-12 text-white" />
                  ) : myRank <= 3 ? (
                    <Medal className="w-12 h-12 text-white" />
                  ) : (
                    <Star className="w-12 h-12 text-panda-primary" />
                  )}
                </div>
              </div>
              {myRank > 1 && (
                <p className={`mt-3 text-sm ${myRank <= 3 ? 'text-white/80' : 'text-gray-500'}`}>
                  {leaderboard[myRank - 2]?.leadsCreated - personalStats.leadsCreated || 1} more lead
                  {((leaderboard[myRank - 2]?.leadsCreated - personalStats.leadsCreated) || 1) !== 1 ? 's' : ''} to move up!
                </p>
              )}
            </div>
          )}

          {/* Quick Actions */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Quick Actions</h3>
            <div className="space-y-2">
              <Link
                to="/leads/new"
                className="flex items-center justify-between p-3 rounded-lg bg-panda-light hover:bg-panda-primary hover:text-white transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <UserPlus className="w-5 h-5 text-panda-primary group-hover:text-white" />
                  <span className="font-medium text-panda-primary group-hover:text-white">Create New Lead</span>
                </div>
                <ArrowRight className="w-4 h-4 text-panda-primary group-hover:text-white" />
              </Link>
              <Link
                to="/leads"
                className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-gray-600" />
                  <span className="font-medium text-gray-700">View My Leads</span>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* My Recent Leads */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">My Recent Leads</h2>
            <Link to="/leads?owner=mine" className="text-panda-primary text-sm hover:underline flex items-center">
              View All <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </div>
        </div>
        <div className="divide-y divide-gray-100">
          {(myRecentLeads?.data || []).slice(0, 5).map((lead) => (
            <Link
              key={lead.id}
              to={`/leads/${lead.id}`}
              className="flex items-center p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex-1">
                <p className="font-medium text-gray-900">
                  {lead.firstName} {lead.lastName}
                </p>
                <p className="text-sm text-gray-500">
                  {lead.company || lead.city || 'No company'}
                  {lead.phone && ` • ${lead.phone}`}
                </p>
              </div>
              <div className="text-right">
                <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                  lead.status === 'NEW' ? 'bg-green-100 text-green-700' :
                  lead.status === 'CONTACTED' ? 'bg-blue-100 text-blue-700' :
                  lead.status === 'QUALIFIED' ? 'bg-purple-100 text-purple-700' :
                  lead.status === 'CONVERTED' ? 'bg-emerald-100 text-emerald-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {lead.status}
                </span>
                <p className="text-xs text-gray-400 mt-1">
                  {lead.createdAt && formatDistanceToNow(parseISO(lead.createdAt), { addSuffix: true })}
                </p>
              </div>
            </Link>
          ))}
          {(!myRecentLeads?.data || myRecentLeads.data.length === 0) && (
            <div className="p-8 text-center text-gray-500">
              <UserPlus className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p>No leads yet</p>
              <Link to="/leads/new" className="text-panda-primary hover:underline text-sm">
                Create your first lead →
              </Link>
            </div>
          )}
        </div>
      </div>
        </>
      )}

      {/* Unconfirmed Leads Tab Content */}
      {activeTab === 'unconfirmed' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-orange-500" />
                  Unconfirmed Leads
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Leads with tentative appointment dates that need confirmation calls
                </p>
              </div>
              <button
                onClick={() => refetchUnconfirmed()}
                className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>
          </div>

          {unconfirmedLoading ? (
            <div className="p-8 text-center text-gray-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary mx-auto mb-3"></div>
              Loading leads...
            </div>
          ) : unconfirmedLeads.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {unconfirmedLeads.map((lead) => (
                <div
                  key={lead.id}
                  className="flex items-center p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <Link
                        to={`/leads/${lead.id}`}
                        className="font-medium text-gray-900 hover:text-panda-primary truncate"
                      >
                        {lead.firstName} {lead.lastName}
                      </Link>
                      {lead.rating && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          lead.rating === 'Hot' ? 'bg-red-100 text-red-700' :
                          lead.rating === 'Warm' ? 'bg-orange-100 text-orange-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {lead.rating}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                      {lead.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {lead.phone}
                        </span>
                      )}
                      {lead.city && lead.state && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {lead.city}, {lead.state}
                        </span>
                      )}
                      {lead.workType && (
                        <span>{lead.workType}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 ml-4">
                    {/* Appointment Date/Time */}
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">
                        {formatApptDateTime(lead.tentativeAppointmentDate, lead.tentativeAppointmentTime)}
                      </p>
                      <p className="text-xs text-gray-500">Tentative</p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                      {/* RingCentral Call Button - Opens RingCentral directly */}
                      {lead.phone && (
                        <button
                          onClick={() => clickToCall(lead.phone)}
                          className="p-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
                          title="Call via RingCentral"
                        >
                          <Phone className="w-4 h-4" />
                        </button>
                      )}
                      {/* SMS Button */}
                      {lead.phone && (
                        <button
                          onClick={() => openSmsModal(lead, 'lead')}
                          className="p-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                          title="Send SMS"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                      )}
                      {/* Email Button */}
                      {lead.email && (
                        <button
                          onClick={() => openEmailModal(lead, 'lead')}
                          className="p-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
                          title="Send Email"
                        >
                          <Mail className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => setAddNoteModal({ open: true, record: lead, type: 'lead' })}
                        className="p-2 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition-colors"
                        title="Add Note"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openConfirmModal(lead)}
                        className="px-3 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-secondary transition-colors flex items-center gap-1 text-sm font-medium"
                        title="Confirm & Convert"
                      >
                        <Check className="w-4 h-4" />
                        Confirm
                      </button>
                      <Link
                        to={`/leads/${lead.id}`}
                        className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                        title="View Lead"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500">
              <CheckCircle className="w-12 h-12 text-green-300 mx-auto mb-3" />
              <p className="font-medium text-gray-700">All caught up!</p>
              <p className="text-sm">No unconfirmed leads for {apptDateFilter === 'all' ? 'any date' : apptDateFilter}</p>
            </div>
          )}
        </div>
      )}

      {/* Unscheduled Appointments Tab Content */}
      {activeTab === 'unscheduled' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <CalendarX className="w-5 h-5 text-red-500" />
                  Unscheduled Appointments
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Converted opportunities that need their service appointment booked
                </p>
              </div>
              <button
                onClick={() => refetchUnscheduled()}
                className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>
          </div>

          {unscheduledLoading ? (
            <div className="p-8 text-center text-gray-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary mx-auto mb-3"></div>
              Loading appointments...
            </div>
          ) : unscheduledAppointments.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {unscheduledAppointments.map((opp) => (
                <div
                  key={opp.id}
                  className="flex items-center p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <Link
                        to={`/opportunities/${opp.id}`}
                        className="font-medium text-gray-900 hover:text-panda-primary truncate"
                      >
                        {opp.name}
                      </Link>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        opp.stageName === 'LEAD_UNASSIGNED' ? 'bg-gray-100 text-gray-700' :
                        opp.stageName === 'LEAD_ASSIGNED' ? 'bg-blue-100 text-blue-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {opp.stageName?.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                      {opp.account?.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {opp.account.phone}
                        </span>
                      )}
                      {opp.account?.billingCity && opp.account?.billingState && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {opp.account.billingCity}, {opp.account.billingState}
                        </span>
                      )}
                      {opp.workType && (
                        <span>{opp.workType}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 ml-4">
                    {/* Earliest Start Date */}
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">
                        {formatApptDateTime(opp.tentativeAppointmentDate, opp.tentativeAppointmentTime)}
                      </p>
                      <p className="text-xs text-gray-500">Earliest Start</p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                      {/* RingCentral Call Button - Opens RingCentral directly */}
                      {(opp.account?.phone || opp.contact?.phone) && (
                        <button
                          onClick={() => clickToCall(opp.contact?.phone || opp.account?.phone)}
                          className="p-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
                          title="Call via RingCentral"
                        >
                          <Phone className="w-4 h-4" />
                        </button>
                      )}
                      {/* SMS Button */}
                      {(opp.account?.phone || opp.contact?.phone) && (
                        <button
                          onClick={() => openSmsModal(opp, 'opportunity')}
                          className="p-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                          title="Send SMS"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                      )}
                      {/* Email Button */}
                      {(opp.account?.email || opp.contact?.email) && (
                        <button
                          onClick={() => openEmailModal(opp, 'opportunity')}
                          className="p-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
                          title="Send Email"
                        >
                          <Mail className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => setAddNoteModal({ open: true, record: opp, type: 'opportunity' })}
                        className="p-2 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition-colors"
                        title="Add Job Message"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openBookApptModal(opp)}
                        className="px-3 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-secondary transition-colors flex items-center gap-1 text-sm font-medium"
                        title="Book Appointment"
                      >
                        <CalendarPlus className="w-4 h-4" />
                        Book
                      </button>
                      <Link
                        to={`/opportunities/${opp.id}`}
                        className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                        title="View Job"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500">
              <CalendarCheck className="w-12 h-12 text-green-300 mx-auto mb-3" />
              <p className="font-medium text-gray-700">All appointments scheduled!</p>
              <p className="text-sm">No unscheduled appointments for {apptDateFilter === 'all' ? 'any date' : apptDateFilter}</p>
            </div>
          )}
        </div>
      )}

      {/* Service Requests Tab Content */}
      {activeTab === 'serviceRequests' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Wrench className="w-5 h-5 text-orange-500" />
                  Service Requests
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Jobs with pending service work - mark complete when resolved
                </p>
              </div>
              <button
                onClick={() => refetchServiceRequests()}
                className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>
          </div>

          {serviceRequestsLoading ? (
            <div className="p-8 text-center text-gray-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary mx-auto mb-3"></div>
              Loading service requests...
            </div>
          ) : serviceRequests.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {serviceRequests.map((opp) => (
                <div
                  key={opp.id}
                  className="flex items-center p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <Link
                        to={`/opportunities/${opp.id}`}
                        className="font-medium text-gray-900 hover:text-panda-primary truncate"
                      >
                        {opp.name}
                      </Link>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        {opp.stageName || opp.stage?.replace(/_/g, ' ') || 'Active Job'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                      {(opp.account?.phone || opp.contact?.phone) && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {opp.contact?.phone || opp.account?.phone}
                        </span>
                      )}
                      {opp.account?.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {opp.account.location}
                        </span>
                      )}
                      {opp.projectManager && (
                        <span className="text-purple-600">
                          PM: {opp.projectManager.name}
                        </span>
                      )}
                    </div>
                    {opp.serviceNotes && (
                      <p className="mt-2 text-sm text-gray-600 bg-yellow-50 p-2 rounded border-l-2 border-yellow-400">
                        {opp.serviceNotes}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 ml-4">
                    {/* Request Date */}
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">
                        {opp.serviceRequestDate
                          ? formatDistanceToNow(parseISO(opp.serviceRequestDate), { addSuffix: true })
                          : '-'}
                      </p>
                      <p className="text-xs text-gray-500">Requested</p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                      {/* RingCentral Call Button - Opens RingCentral directly */}
                      {(opp.account?.phone || opp.contact?.phone) && (
                        <button
                          onClick={() => clickToCall(opp.contact?.phone || opp.account?.phone)}
                          className="p-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
                          title="Call via RingCentral"
                        >
                          <Phone className="w-4 h-4" />
                        </button>
                      )}
                      {/* SMS Button */}
                      {(opp.account?.phone || opp.contact?.phone) && (
                        <button
                          onClick={() => openSmsModal(opp, 'opportunity')}
                          className="p-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                          title="Send SMS"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                      )}
                      {/* Email Button */}
                      {(opp.account?.email || opp.contact?.email) && (
                        <button
                          onClick={() => openEmailModal(opp, 'opportunity')}
                          className="p-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
                          title="Send Email"
                        >
                          <Mail className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => completeServiceRequestMutation.mutate(opp.id)}
                        disabled={completeServiceRequestMutation.isPending}
                        className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1 text-sm font-medium disabled:opacity-50"
                        title="Mark Complete"
                      >
                        <CheckCheck className="w-4 h-4" />
                        Complete
                      </button>
                      <Link
                        to={`/opportunities/${opp.id}`}
                        className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                        title="View Job"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500">
              <CheckCircle className="w-12 h-12 text-green-300 mx-auto mb-3" />
              <p className="font-medium text-gray-700">No pending service requests!</p>
              <p className="text-sm">All service requests have been completed</p>
            </div>
          )}
        </div>
      )}

      {/* Manager Queue Dashboard Tab Content */}
      {/* All call center roles can see this tab, but non-managers only see leads assigned to them */}
      {activeTab === 'managerDashboard' && (
        <ManagerQueuePanel
          clickToCall={clickToCall}
          openSmsModal={openSmsModal}
          openEmailModal={openEmailModal}
          isManager={isManager}
          currentUserId={user?.id}
        />
      )}

      {/* Call Lists Tab Content */}
      {activeTab === 'callLists' && (
        <CallListsPanel clickToCall={clickToCall} openSmsModal={openSmsModal} isManager={isManager} />
      )}

      {/* ============================================================================ */}
      {/* MODALS */}
      {/* ============================================================================ */}

      {/* Confirm Lead Modal */}
      {confirmLeadModal.open && confirmLeadModal.lead && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <CalendarCheck className="w-5 h-5 text-panda-primary" />
                Confirm & Convert Lead to Job
              </h3>
              <button
                onClick={() => setConfirmLeadModal({ open: false, lead: null })}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleConfirmLead} className="p-5 space-y-4">
              {/* Lead Info */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="font-medium text-gray-900">
                  {confirmLeadModal.lead.firstName} {confirmLeadModal.lead.lastName}
                </p>
                <p className="text-sm text-gray-500">
                  {confirmLeadModal.lead.phone}
                  {confirmLeadModal.lead.city && ` • ${confirmLeadModal.lead.city}, ${confirmLeadModal.lead.state}`}
                </p>
              </div>

              {/* Work Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Work Type</label>
                <select
                  value={confirmFormData.workType}
                  onChange={(e) => setConfirmFormData({ ...confirmFormData, workType: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                >
                  <option value="Inspection">Inspection</option>
                  <option value="Retail Demo">Retail Demo</option>
                  <option value="Insurance">Insurance</option>
                </select>
              </div>

              {/* Appointment Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Appointment Date</label>
                <input
                  type="date"
                  value={confirmFormData.appointmentDate}
                  onChange={(e) => setConfirmFormData({ ...confirmFormData, appointmentDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  required
                />
              </div>

              {/* Appointment Time */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Appointment Time</label>
                <input
                  type="time"
                  value={confirmFormData.appointmentTime}
                  onChange={(e) => setConfirmFormData({ ...confirmFormData, appointmentTime: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  required
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
                <textarea
                  value={confirmFormData.notes}
                  onChange={(e) => setConfirmFormData({ ...confirmFormData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent resize-none"
                  placeholder="Any notes about the appointment..."
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmLeadModal({ open: false, lead: null })}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={convertLeadMutation.isPending}
                  className="flex-1 px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-secondary transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {convertLeadMutation.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      Converting...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Confirm & Convert
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Book Appointment Modal */}
      {bookApptModal.open && bookApptModal.opportunity && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <CalendarPlus className="w-5 h-5 text-panda-primary" />
                Book Service Appointment
              </h3>
              <button
                onClick={() => setBookApptModal({ open: false, opportunity: null })}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleBookAppointment} className="p-5 space-y-4">
              {/* Opportunity Info */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="font-medium text-gray-900">{bookApptModal.opportunity.name}</p>
                <p className="text-sm text-gray-500">
                  {bookApptModal.opportunity.contact?.name || bookApptModal.opportunity.account?.name}
                  {bookApptModal.opportunity.account?.address && ` • ${bookApptModal.opportunity.account.address}`}
                </p>
              </div>

              {/* Scheduled Start */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date & Time</label>
                <input
                  type="datetime-local"
                  value={bookApptFormData.scheduledStart}
                  onChange={(e) => setBookApptFormData({ ...bookApptFormData, scheduledStart: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  required
                />
              </div>

              {/* Scheduled End */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date & Time</label>
                <input
                  type="datetime-local"
                  value={bookApptFormData.scheduledEnd}
                  onChange={(e) => setBookApptFormData({ ...bookApptFormData, scheduledEnd: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  required
                />
              </div>

              {/* Crew Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assign Crew/Inspector</label>
                {bookApptFormData.selectedCrew ? (
                  <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                        <Users className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{bookApptFormData.selectedCrew.name}</p>
                        <p className="text-sm text-gray-500">
                          Match Score: {bookApptFormData.selectedCrew.score}%
                          {bookApptFormData.selectedCrew.distance && ` • ${bookApptFormData.selectedCrew.distance} mi away`}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCrewSelectorOpen(true)}
                      className="text-sm text-panda-primary hover:underline"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCrewSelectorOpen(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-panda-primary hover:text-panda-primary transition-colors"
                  >
                    <Users className="w-5 h-5" />
                    Select Best Available Crew
                  </button>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
                <textarea
                  value={bookApptFormData.notes}
                  onChange={(e) => setBookApptFormData({ ...bookApptFormData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent resize-none"
                  placeholder="Special instructions for the inspector..."
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setBookApptModal({ open: false, opportunity: null })}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bookAppointmentMutation.isPending}
                  className="flex-1 px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-secondary transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {bookAppointmentMutation.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      Booking...
                    </>
                  ) : (
                    <>
                      <CalendarCheck className="w-4 h-4" />
                      Book Appointment
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Note Modal */}
      {addNoteModal.open && addNoteModal.record && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-panda-primary" />
                {addNoteModal.type === 'lead' ? 'Add Lead Note' : 'Add Job Message'}
              </h3>
              <button
                onClick={() => setAddNoteModal({ open: false, record: null, type: null })}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleAddNote} className="p-5 space-y-4">
              {/* Record Info */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="font-medium text-gray-900">
                  {addNoteModal.type === 'lead'
                    ? `${addNoteModal.record.firstName} ${addNoteModal.record.lastName}`
                    : addNoteModal.record.name}
                </p>
              </div>

              {/* Note Text */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {addNoteModal.type === 'lead' ? 'Note' : 'Message'}
                </label>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent resize-none"
                  placeholder={addNoteModal.type === 'lead' ? 'Document your call notes...' : 'Add a job message...'}
                  required
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAddNoteModal({ open: false, record: null, type: null })}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addLeadNoteMutation.isPending || addJobMessageMutation.isPending}
                  className="flex-1 px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-secondary transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {(addLeadNoteMutation.isPending || addJobMessageMutation.isPending) ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Save Note
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SMS Modal */}
      <SmsModal
        isOpen={smsModal.open}
        onClose={() => setSmsModal({ open: false, phone: '', recipientName: '', mergeData: {} })}
        phone={smsModal.phone}
        recipientName={smsModal.recipientName}
        mergeData={smsModal.mergeData}
        onSent={() => {
          // Optionally refresh data or show success message
        }}
      />

      {/* Email Modal */}
      <EmailModal
        isOpen={emailModal.open}
        onClose={() => setEmailModal({ open: false, email: '', recipientName: '', mergeData: {} })}
        email={emailModal.email}
        recipientName={emailModal.recipientName}
        mergeData={emailModal.mergeData}
        onSent={() => {
          // Optionally refresh data or show success message
        }}
      />

      {/* Crew Selector Modal */}
      <CrewSelector
        isOpen={crewSelectorOpen}
        onClose={() => setCrewSelectorOpen(false)}
        onSelectCrew={handleCrewSelect}
        appointmentData={{
          opportunityId: bookApptModal.opportunity?.id,
          workType: 'Inspection',
          address: bookApptModal.opportunity?.account?.billingStreet
            ? `${bookApptModal.opportunity.account.billingStreet}, ${bookApptModal.opportunity.account.billingCity}, ${bookApptModal.opportunity.account.billingState}`
            : null,
          scheduledDate: bookApptFormData.scheduledStart,
        }}
      />
    </div>
  );
}
