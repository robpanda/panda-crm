import { useState, useEffect, useRef, useContext } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leadsApi, bamboogliApi, usersApi } from '../services/api';
import AuthContext from '../context/AuthContext';
import { useRingCentral } from '../context/RingCentralContext';
import { addRecentItem } from '../utils/recentItems';
import {
  UserPlus, ArrowLeft, Phone, Mail, Building2, Edit, ArrowRight,
  Save, X, MapPin, Calendar, Star, FileText, Clock, User, Tag,
  MessageSquare, Send, Loader2, ChevronDown, ChevronUp, Activity, PhoneCall,
  PhoneIncoming, PhoneOutgoing, PhoneMissed, MailOpen, MessageCircle, Sparkles, Trophy
} from 'lucide-react';
import { LeadRankBadge, LeadScoreCard } from '../components/LeadRankBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import MentionTextarea from '../components/MentionTextarea';
import InternalNotesTabs from '../components/InternalNotesTabs';
import InternalComments from '../components/InternalComments';
import CommunicationsTab from '../components/CommunicationsTab';
import UserSearchDropdown from '../components/UserSearchDropdown';

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
              <MessageSquare className="w-5 h-5 mr-2 text-purple-500" />
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
            <div className="relative">
              <select
                value={selectedTemplate}
                onChange={(e) => handleTemplateSelect(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white appearance-none cursor-pointer"
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
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
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
              className="flex items-center space-x-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50"
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
              <Mail className="w-5 h-5 mr-2 text-orange-500" />
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
            <div className="relative">
              <select
                value={selectedTemplate}
                onChange={(e) => handleTemplateSelect(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white appearance-none cursor-pointer"
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
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
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
              className="flex items-center space-x-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50"
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

// Activity Tab Component - Threaded SMS/Email + call logs (conversation view)
function ActivityTab({ phone, email, leadName }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <CommunicationsTab
        phone={phone}
        email={email}
        contactName={leadName}
      />
    </div>
  );
}

// Constants from LeadWizard
const LEAD_STATUSES = [
  { value: 'NEW', label: 'New' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'QUALIFIED', label: 'Qualified' },
  { value: 'UNQUALIFIED', label: 'Unqualified' },
  { value: 'CONVERTED', label: 'Converted' },
];

const LEAD_DISPOSITIONS = [
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'CALLBACK', label: 'Callback' },
  { value: 'NOT_INTERESTED', label: 'Not Interested' },
  { value: 'BAD_NUMBER', label: 'Bad Number' },
  { value: 'NO_ANSWER', label: 'No Answer' },
  { value: 'LEFT_VOICEMAIL', label: 'Left Voicemail' },
  { value: 'WRONG_NUMBER', label: 'Wrong Number' },
  { value: 'DO_NOT_CALL', label: 'Do Not Call' },
];

const LEAD_SOURCES = [
  { value: 'Website', label: 'Website' },
  { value: 'Referral', label: 'Referral' },
  { value: 'Door Knock', label: 'Door Knock' },
  { value: 'Canvassing', label: 'Canvassing' },
  { value: 'Self-Gen', label: 'Self-Gen' },
  { value: 'RingCentral', label: 'RingCentral' },
  { value: 'Marketing', label: 'Marketing' },
  { value: 'Trade Show', label: 'Trade Show' },
  { value: 'Partner', label: 'Partner' },
  { value: 'Other', label: 'Other' },
];

const PROPERTY_TYPES = [
  { value: 'Single Family', label: 'Single Family' },
  { value: 'Multi Family', label: 'Multi Family' },
  { value: 'Townhouse', label: 'Townhouse' },
  { value: 'Condo', label: 'Condo' },
  { value: 'Commercial', label: 'Commercial' },
  { value: 'Other', label: 'Other' },
];

const ALL_WORK_TYPES = [
  { value: 'Roofing', label: 'Roofing' },
  { value: 'Siding', label: 'Siding' },
  { value: 'Windows', label: 'Windows' },
  { value: 'Gutters', label: 'Gutters' },
  { value: 'Interior', label: 'Interior' },
  { value: 'Solar', label: 'Solar' },
  { value: 'Other', label: 'Other' },
];

const RATINGS = [
  { value: 'Hot', label: 'Hot', color: 'text-red-500' },
  { value: 'Warm', label: 'Warm', color: 'text-orange-500' },
  { value: 'Cold', label: 'Cold', color: 'text-blue-500' },
];

const US_STATES = [
  { value: 'MD', label: 'Maryland' },
  { value: 'VA', label: 'Virginia' },
  { value: 'DC', label: 'Washington DC' },
  { value: 'DE', label: 'Delaware' },
  { value: 'PA', label: 'Pennsylvania' },
  { value: 'NJ', label: 'New Jersey' },
  { value: 'NC', label: 'North Carolina' },
  { value: 'FL', label: 'Florida' },
];

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { clickToCall } = useRingCentral();
  const authContext = useContext(AuthContext);
  const user = authContext?.user || null;
  const roleName = (user?.role?.name || user?.role || '').toString().toLowerCase();
  const roleType = (user?.roleType || '').toString().toLowerCase();
  const isCallCenter = roleName.includes('call center') ||
    roleName.includes('call_center') ||
    roleType.includes('call_center') ||
    user?.department?.toLowerCase() === 'call center';
  const canEditContactAddress = isCallCenter;
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({});
  const [showSmsModal, setShowSmsModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [activeTab, setActiveTab] = useState('details'); // details | activity | internal | internalComments
  const location = useLocation();
  const [isScoreExpanded, setIsScoreExpanded] = useState(false); // AI Score card collapsed by default
  const [leadActionStep, setLeadActionStep] = useState(null);
  const [noInspectionSuggestion, setNoInspectionSuggestion] = useState(null);
  const [isSuggestingInspectionSlot, setIsSuggestingInspectionSlot] = useState(false);
  const hasShownLeadPromptRef = useRef(false);

  const { data: lead, isLoading } = useQuery({
    queryKey: ['lead', id],
    queryFn: () => leadsApi.getLead(id),
    enabled: !!id,
  });

  const leadSetByIdForManager = (isEditing ? formData.leadSetById : lead?.leadSetById) || null;
  const { data: leadSetByUserData } = useQuery({
    queryKey: ['lead-set-by-user', leadSetByIdForManager],
    queryFn: () => usersApi.getUser(leadSetByIdForManager),
    enabled: !!leadSetByIdForManager,
    staleTime: 60000,
  });

  const leadSetByManagerId =
    leadSetByUserData?.managerId ||
    leadSetByUserData?.manager?.id ||
    lead?.leadSetBy?.managerId ||
    lead?.leadSetBy?.manager?.id ||
    null;

  const { data: leadSetByManagerData } = useQuery({
    queryKey: ['lead-set-by-manager', leadSetByManagerId],
    queryFn: () => usersApi.getUser(leadSetByManagerId),
    enabled: !!leadSetByManagerId,
    staleTime: 60000,
  });

  const leadSetByManagerName = leadSetByManagerData
    ? `${leadSetByManagerData.firstName || ''} ${leadSetByManagerData.lastName || ''}`.trim()
    : leadSetByUserData?.manager
      ? `${leadSetByUserData.manager.firstName || ''} ${leadSetByUserData.manager.lastName || ''}`.trim()
      : '';

  useEffect(() => {
    const tabParam = new URLSearchParams(location.search).get('tab');
    if (!tabParam) return;
    if (tabParam === 'internal-communications') {
      setActiveTab('internalComments');
      return;
    }
    if (tabParam === 'notes') {
      setActiveTab('internal');
      return;
    }
    if (tabParam === 'internal' || tabParam === 'internalComments' || tabParam === 'activity' || tabParam === 'details') {
      setActiveTab(tabParam);
    }
  }, [location.search]);

  useEffect(() => {
    if (!lead?.id || !user?.id) return;
    const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ');
    const label = name || lead.company || 'Lead';
    const meta = lead.email || lead.phone || lead.city || lead.street || '';
    addRecentItem('leads', user.id, {
      id: lead.id,
      label,
      meta,
      path: `/leads/${lead.id}`,
    });
  }, [lead?.id, user?.id]);

  const isSelfGenSource = (value) => {
    if (!value) return false;
    return value.toString().toLowerCase().replace(/[^a-z]/g, '') === 'selfgen';
  };

  const isOwner = Boolean(user?.id && (lead?.ownerId === user.id || lead?.owner?.id === user.id));
  const isLeadReadyForOwnerAction = Boolean(
    lead &&
    !lead.isConverted &&
    (lead.source || lead.leadSource) &&
    (lead.tentativeAppointmentDate || lead.tentativeAppointmentTime || isSelfGenSource(lead.source))
  );

  useEffect(() => {
    if (!lead || !isLeadReadyForOwnerAction || !isOwner) return;
    if (hasShownLeadPromptRef.current) return;
    setLeadActionStep('action');
    hasShownLeadPromptRef.current = true;
  }, [lead, isLeadReadyForOwnerAction, isOwner]);

  useEffect(() => {
    if (!lead || leadActionStep !== 'noInspection') return;
    if (isSuggestingInspectionSlot) return;
    setIsSuggestingInspectionSlot(true);
    leadsApi.suggestInspectionAppointment(id, {
      allowFallback: true,
      workType: lead.workType || 'Inspection',
      daysToSearch: 14,
      durationMinutes: 120,
    })
      .then((result) => setNoInspectionSuggestion(result))
      .catch((error) => {
        console.error('Failed to suggest inspection slot:', error);
        setNoInspectionSuggestion(null);
      })
      .finally(() => setIsSuggestingInspectionSlot(false));
  }, [leadActionStep, lead, id, isSuggestingInspectionSlot]);

  // Sync formData when lead data loads/changes (replaces removed onSuccess)
  useEffect(() => {
    if (lead && !isEditing) {
      setFormData({
        firstName: lead.firstName || '',
        lastName: lead.lastName || '',
        email: lead.email || '',
        phone: lead.phone || '',
        mobilePhone: lead.mobilePhone || '',
        company: lead.company || '',
        street: lead.street || '',
        city: lead.city || '',
        state: lead.state || '',
        postalCode: lead.postalCode || '',
        status: lead.status || 'NEW',
        leadSource: lead.source || lead.leadSource || '',
        rating: lead.rating || '',
        description: lead.description || '',
        propertyType: lead.propertyType || '',
        workType: lead.workType || '',
        leadNotes: lead.leadNotes || '',
        jobNotes: lead.jobNotes || '',
        salesRabbitUser: lead.salesRabbitUser || '',
        tentativeAppointmentDate: lead.tentativeAppointmentDate ? lead.tentativeAppointmentDate.split('T')[0] : '',
        tentativeAppointmentTime: lead.tentativeAppointmentTime || '',
        leadSetById: lead.leadSetById || '',
        disposition: lead.disposition || '',
        ownerId: lead.ownerId || '',
        ownerName: lead.owner ? `${lead.owner.firstName || ''} ${lead.owner.lastName || ''}`.trim() : '',
        leadSetByName: lead.leadSetBy ? `${lead.leadSetBy.firstName || ''} ${lead.leadSetBy.lastName || ''}`.trim() : '',
      });
    }
  }, [lead]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateMutation = useMutation({
    mutationFn: (data) => leadsApi.updateLead(id, data),
    onSuccess: async () => {
      setIsEditing(false);
      queryClient.invalidateQueries(['lead', id]);
      queryClient.invalidateQueries(['leads']);
      // Sales Path Gating: refresh gating state after update
      try { await leadsApi.getGatingState(id); } catch (e) { /* non-blocking */ }
    },
  });

  const convertMutation = useMutation({
    mutationFn: async (conversionOverrides = {}) => {
      // Sales Path Gating: validate before conversion
      const gatingResult = await leadsApi.validatePreConversion(id);
      if (!gatingResult?.success || gatingResult?.data?.blocked) {
        const messages = gatingResult?.data?.messages || ['Lead cannot be converted. Please check all gating requirements.'];
        throw new Error(messages.join('\n'));
      }
      const conversionData = { ...conversionOverrides };
      // Pass tentative date/time so backend creates a ServiceAppointment
      if (lead?.tentativeAppointmentDate) {
        conversionData.createServiceAppointment = true;
        const dateStr = lead.tentativeAppointmentDate.split('T')[0];
        if (lead.tentativeAppointmentTime) {
          conversionData.tentativeAppointmentDate = `${dateStr}T${lead.tentativeAppointmentTime}:00`;
          conversionData.tentativeAppointmentTime = lead.tentativeAppointmentTime;
        } else {
          conversionData.tentativeAppointmentDate = `${dateStr}T09:00:00`;
        }
      }
      return leadsApi.convertLead(id, conversionData);
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries(['lead', id]);
      let opportunityId =
        result?.opportunity?.id ||
        result?.opportunityId ||
        result?.job?.id ||
        result?.jobId;

      if (!opportunityId) {
        try {
          const refreshedLead = await leadsApi.getLead(id);
          opportunityId = refreshedLead?.opportunityId || null;
        } catch (error) {
          console.error('Failed to resolve converted opportunity:', error);
        }
      }

      if (opportunityId) {
        navigate(`/jobs/${opportunityId}`, {
          state: {
            openResultAppointmentWizard: true,
            fromLeadConversion: true,
          },
        });
      }
    },
    onError: (error) => {
      alert(error.message);
    },
  });

  const handleConvert = async (overrides = {}) => {
    await convertMutation.mutateAsync(overrides);
    setLeadActionStep(null);
  };

  const handleMarkInspected = async () => {
    await leadsApi.updateLead(id, {
      disposition: 'INSPECTED',
      inspectionDate: new Date().toISOString(),
      inspectionById: user?.id || null,
      inspectionNotes: 'Inspection confirmed via quick action',
    });
    queryClient.invalidateQueries(['lead', id]);
    setLeadActionStep('salesPath');
  };

  const handleSelectSalesPath = async (path) => {
    try {
      await leadsApi.selectSalesPath(id, path);
      queryClient.invalidateQueries(['lead', id]);
      const workType = path === 'RETAIL' ? 'Retail' : 'Insurance';
      await handleConvert({
        opportunityType: path,
        workType,
      });
    } catch (error) {
      alert(error?.message || 'Unable to select sales path.');
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = () => {
    // Clean up empty strings to null for optional fields
    const cleanedData = { ...formData };
    Object.keys(cleanedData).forEach(key => {
      if (cleanedData[key] === '') {
        cleanedData[key] = null;
      }
    });
    updateMutation.mutate(cleanedData);
  };

  const handleCancel = () => {
    setFormData({
      firstName: lead.firstName || '',
      lastName: lead.lastName || '',
      email: lead.email || '',
      phone: lead.phone || '',
      mobilePhone: lead.mobilePhone || '',
      company: lead.company || '',
      street: lead.street || '',
      city: lead.city || '',
      state: lead.state || '',
      postalCode: lead.postalCode || '',
      status: lead.status || 'NEW',
      leadSource: lead.source || lead.leadSource || '',
      rating: lead.rating || '',
      description: lead.description || '',
      propertyType: lead.propertyType || '',
      workType: lead.workType || '',
      leadNotes: lead.leadNotes || '',
      jobNotes: lead.jobNotes || '',
      salesRabbitUser: lead.salesRabbitUser || '',
      tentativeAppointmentDate: lead.tentativeAppointmentDate ? lead.tentativeAppointmentDate.split('T')[0] : '',
      tentativeAppointmentTime: lead.tentativeAppointmentTime || '',
      leadSetById: lead.leadSetById || '',
      leadSetByName: lead.leadSetBy ? `${lead.leadSetBy.firstName || ''} ${lead.leadSetBy.lastName || ''}`.trim() : '',
      disposition: lead.disposition || '',
      ownerId: lead.ownerId || '',
      ownerName: lead.owner ? `${lead.owner.firstName || ''} ${lead.owner.lastName || ''}`.trim() : '',
    });
    setIsEditing(false);
  };

  const startEditing = () => {
    setFormData({
      firstName: lead.firstName || '',
      lastName: lead.lastName || '',
      email: lead.email || '',
      phone: lead.phone || '',
      mobilePhone: lead.mobilePhone || '',
      company: lead.company || '',
      street: lead.street || '',
      city: lead.city || '',
      state: lead.state || '',
      postalCode: lead.postalCode || '',
      status: lead.status || 'NEW',
      leadSource: lead.source || lead.leadSource || '',
      rating: lead.rating || '',
      description: lead.description || '',
      propertyType: lead.propertyType || '',
      workType: lead.workType || '',
      leadNotes: lead.leadNotes || '',
      jobNotes: lead.jobNotes || '',
      salesRabbitUser: lead.salesRabbitUser || '',
      tentativeAppointmentDate: lead.tentativeAppointmentDate ? lead.tentativeAppointmentDate.split('T')[0] : '',
      tentativeAppointmentTime: lead.tentativeAppointmentTime || '',
      leadSetById: lead.leadSetById || '',
      leadSetByName: lead.leadSetBy ? `${lead.leadSetBy.firstName || ''} ${lead.leadSetBy.lastName || ''}`.trim() : '',
      disposition: lead.disposition || '',
      ownerId: lead.ownerId || '',
      ownerName: lead.owner ? `${lead.owner.firstName || ''} ${lead.owner.lastName || ''}`.trim() : '',
    });
    setIsEditing(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" message="Loading lead..." />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="text-center py-12">
        <UserPlus className="w-12 h-12 mx-auto text-gray-300 mb-4" />
        <p className="text-gray-500">Lead not found</p>
        <button onClick={() => navigate(-1)} className="text-panda-primary hover:underline mt-2 inline-block">
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </button>

        {!isEditing ? (
          <button
            onClick={startEditing}
            className="flex items-center space-x-2 px-4 py-2 bg-panda-primary text-white rounded-lg hover:opacity-90"
          >
            <Edit className="w-4 h-4" />
            <span>Edit Lead</span>
          </button>
        ) : (
          <div className="flex items-center space-x-2">
            <button
              onClick={handleCancel}
              className="flex items-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              <X className="w-4 h-4" />
              <span>Cancel</span>
            </button>
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{updateMutation.isPending ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Header Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-4">
            <div className={`w-16 h-16 rounded-xl flex items-center justify-center ${
              lead.status === 'NEW' ? 'bg-blue-100' :
              lead.status === 'CONTACTED' ? 'bg-yellow-100' :
              lead.status === 'QUALIFIED' ? 'bg-green-100' :
              lead.status === 'CONVERTED' ? 'bg-purple-100' : 'bg-gray-100'
            }`}>
              <UserPlus className={`w-8 h-8 ${
                lead.status === 'NEW' ? 'text-blue-600' :
                lead.status === 'CONTACTED' ? 'text-yellow-600' :
                lead.status === 'QUALIFIED' ? 'text-green-600' :
                lead.status === 'CONVERTED' ? 'text-purple-600' : 'text-gray-600'
              }`} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {lead.firstName} {lead.lastName}
              </h1>
              {lead.company && (
                <p className="text-gray-500 flex items-center">
                  <Building2 className="w-4 h-4 mr-1" />
                  {lead.company}
                </p>
              )}
              <div className="flex items-center space-x-4 mt-2">
                {lead.phone && (
                  <button
                    onClick={() => clickToCall(lead.phone)}
                    className="flex items-center text-sm text-panda-primary hover:underline"
                  >
                    <Phone className="w-4 h-4 mr-1" />
                    {lead.phone}
                  </button>
                )}
                {lead.email && (
                  <a href={`mailto:${lead.email}`} className="flex items-center text-sm text-panda-primary hover:underline">
                    <Mail className="w-4 h-4 mr-1" />
                    {lead.email}
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <span className={`badge ${
              lead.status === 'NEW' ? 'badge-info' :
              lead.status === 'CONTACTED' ? 'badge-warning' :
              lead.status === 'QUALIFIED' ? 'badge-success' :
              lead.status === 'CONVERTED' ? 'badge-purple' : 'badge-gray'
            }`}>
              {lead.status}
            </span>
            {/* AI Lead Score - replaces manual rating */}
            {lead.leadRank && (
              <LeadRankBadge rank={lead.leadRank} score={lead.leadScore} showLabel={true} size="md" />
            )}
          </div>
        </div>

        {/* Converted Lead Links */}
        {lead.isConverted && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Converted To:</h3>
            <div className="flex flex-wrap gap-3">
              {lead.convertedAccountId && (
                <Link
                  to={`/accounts/${lead.convertedAccountId}`}
                  className="inline-flex items-center px-3 py-1 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100"
                >
                  <Building2 className="w-4 h-4 mr-1" />
                  View Account
                </Link>
              )}
              {lead.convertedContactId && (
                <Link
                  to={`/contacts/${lead.convertedContactId}`}
                  className="inline-flex items-center px-3 py-1 bg-green-50 text-green-700 rounded-lg hover:bg-green-100"
                >
                  <User className="w-4 h-4 mr-1" />
                  View Contact
                </Link>
              )}
              {lead.convertedOpportunityId && (
                <Link
                  to={`/opportunities/${lead.convertedOpportunityId}`}
                  className="inline-flex items-center px-3 py-1 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100"
                >
                  <FileText className="w-4 h-4 mr-1" />
                  View Job
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {!isEditing && (
          <div className="mt-6 pt-6 border-t border-gray-100">
            <div className="flex flex-wrap gap-3">
              {/* Call Button */}
              {(lead.phone || lead.mobilePhone) && (
                <button
                  onClick={() => clickToCall(lead.mobilePhone || lead.phone)}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  <Phone className="w-4 h-4" />
                  <span>Call</span>
                </button>
              )}

              {/* SMS Button */}
              {(lead.phone || lead.mobilePhone) && (
                <button
                  onClick={() => setShowSmsModal(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>SMS</span>
                </button>
              )}

              {/* Email Button */}
              {lead.email && (
                <button
                  onClick={() => setShowEmailModal(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  <span>Email</span>
                </button>
              )}

              {/* Convert to Job Button */}
              {lead.status !== 'CONVERTED' && !lead.isConverted && (
                <button
                  onClick={() => setLeadActionStep('inspection')}
                  disabled={convertMutation.isPending || !isOwner}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
                    convertMutation.isPending || !isOwner
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:opacity-90'
                  }`}
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>{convertMutation.isPending ? 'Converting...' : 'Convert to Job'}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-1 flex space-x-1">
        <button
          onClick={() => setActiveTab('details')}
          className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 rounded-lg font-medium transition-all ${
            activeTab === 'details'
              ? 'bg-panda-primary text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <User className="w-4 h-4" />
          <span>Details</span>
        </button>
        <button
          onClick={() => setActiveTab('activity')}
          className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 rounded-lg font-medium transition-all ${
            activeTab === 'activity'
              ? 'bg-panda-primary text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Activity</span>
        </button>
        <button
          onClick={() => setActiveTab('internal')}
          className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 rounded-lg font-medium transition-all ${
            activeTab === 'internal'
              ? 'bg-panda-primary text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Notes</span>
        </button>
        <button
          onClick={() => setActiveTab('internalComments')}
          className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 rounded-lg font-medium transition-all ${
            activeTab === 'internalComments'
              ? 'bg-panda-primary text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <MessageCircle className="w-4 h-4" />
          <span>Internal Comments</span>
        </button>
      </div>

      {/* Activity Tab Content */}
      {activeTab === 'activity' && (
        <ActivityTab
          phone={lead.mobilePhone || lead.phone}
          email={lead.email}
          leadName={`${lead.firstName} ${lead.lastName}`}
          leadId={lead.id}
        />
      )}

      {activeTab === 'internal' && (
        <InternalNotesTabs entityType="lead" entityId={id} />
      )}

      {activeTab === 'internalComments' && (
        <InternalComments entityType="lead" entityId={id} />
      )}

      {/* Details Tab Content */}
      {activeTab === 'details' && (
      <>
      {/* AI Lead Score Card - Collapsible */}
      {lead.leadRank && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <button
            onClick={() => setIsScoreExpanded(!isScoreExpanded)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center">
              <Sparkles className="w-5 h-5 mr-2 text-purple-500" />
              <span className="text-lg font-semibold text-gray-900">AI Lead Intelligence Score</span>
              <span className={`ml-3 px-2 py-0.5 rounded-full text-sm font-bold ${
                lead.leadRank === 'A' ? 'bg-green-100 text-green-700' :
                lead.leadRank === 'B' ? 'bg-blue-100 text-blue-700' :
                lead.leadRank === 'C' ? 'bg-yellow-100 text-yellow-700' :
                lead.leadRank === 'D' ? 'bg-orange-100 text-orange-700' :
                'bg-red-100 text-red-700'
              }`}>
                {lead.leadRank} · {lead.leadScore}/100
              </span>
            </div>
            {isScoreExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>
          {isScoreExpanded && (
            <div className="px-6 pb-6">
              <LeadScoreCard
                rank={lead.leadRank}
                score={lead.leadScore}
                factors={lead.scoreFactors || []}
                scoredAt={lead.scoredAt}
              />
            </div>
          )}
        </div>
      )}

      {/* Edit Form / Detail View */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contact Information */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <User className="w-5 h-5 mr-2 text-panda-primary" />
            Contact Information
          </h2>

          {isEditing ? (
            <div className="space-y-4">
              {!canEditContactAddress && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Contact details are read-only for your role. Call Center can update contact info and address.
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleInputChange}
                    disabled={!canEditContactAddress}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent ${
                      !canEditContactAddress ? 'bg-gray-100 text-gray-500' : 'border-gray-300'
                    }`}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                  <input
                    type="text"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleInputChange}
                    disabled={!canEditContactAddress}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent ${
                      !canEditContactAddress ? 'bg-gray-100 text-gray-500' : 'border-gray-300'
                    }`}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  disabled={!canEditContactAddress}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent ${
                    !canEditContactAddress ? 'bg-gray-100 text-gray-500' : 'border-gray-300'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  disabled={!canEditContactAddress}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent ${
                    !canEditContactAddress ? 'bg-gray-100 text-gray-500' : 'border-gray-300'
                  }`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Phone</label>
                <input
                  type="tel"
                  name="mobilePhone"
                  value={formData.mobilePhone}
                  onChange={handleInputChange}
                  disabled={!canEditContactAddress}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent ${
                    !canEditContactAddress ? 'bg-gray-100 text-gray-500' : 'border-gray-300'
                  }`}
                />
              </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                <input
                  type="text"
                  name="company"
                  value={formData.company}
                  onChange={handleInputChange}
                  disabled={!canEditContactAddress}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent ${
                    !canEditContactAddress ? 'bg-gray-100 text-gray-500' : 'border-gray-300'
                  }`}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Name</span>
                <span className="text-gray-900">{lead.firstName} {lead.lastName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Email</span>
                <span className="text-gray-900">{lead.email || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Phone</span>
                <span className="text-gray-900">{lead.phone || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Mobile</span>
                <span className="text-gray-900">{lead.mobilePhone || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Company</span>
                <span className="text-gray-900">{lead.company || '-'}</span>
              </div>
            </div>
          )}
        </div>

        {/* Address Information */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <MapPin className="w-5 h-5 mr-2 text-panda-primary" />
            Address
          </h2>

          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Street</label>
                <input
                  type="text"
                  name="street"
                  value={formData.street}
                  onChange={handleInputChange}
                  disabled={!canEditContactAddress}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent ${
                    !canEditContactAddress ? 'bg-gray-100 text-gray-500' : 'border-gray-300'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleInputChange}
                    disabled={!canEditContactAddress}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent ${
                      !canEditContactAddress ? 'bg-gray-100 text-gray-500' : 'border-gray-300'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                  <select
                    name="state"
                    value={formData.state}
                    onChange={handleInputChange}
                    disabled={!canEditContactAddress}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent ${
                      !canEditContactAddress ? 'bg-gray-100 text-gray-500' : 'border-gray-300'
                    }`}
                  >
                    <option value="">Select State</option>
                    {US_STATES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
                <input
                  type="text"
                  name="postalCode"
                  value={formData.postalCode}
                  onChange={handleInputChange}
                  disabled={!canEditContactAddress}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent ${
                    !canEditContactAddress ? 'bg-gray-100 text-gray-500' : 'border-gray-300'
                  }`}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Street</span>
                <span className="text-gray-900">{lead.street || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">City</span>
                <span className="text-gray-900">{lead.city || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">State</span>
                <span className="text-gray-900">{lead.state || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Postal Code</span>
                <span className="text-gray-900">{lead.postalCode || '-'}</span>
              </div>
            </div>
          )}
        </div>

        {/* Lead Details */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Tag className="w-5 h-5 mr-2 text-panda-primary" />
            Lead Details
          </h2>

          {isEditing ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  >
                    {LEAD_STATUSES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Disposition</label>
                  <select
                    name="disposition"
                    value={formData.disposition}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  >
                    <option value="">Select Disposition</option>
                    {LEAD_DISPOSITIONS.map(d => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lead Source</label>
                  <select
                    name="leadSource"
                    value={formData.leadSource}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  >
                    <option value="">Select Source</option>
                    {LEAD_SOURCES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Property Type</label>
                  <select
                    name="propertyType"
                    value={formData.propertyType}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  >
                    <option value="">Select Type</option>
                    {PROPERTY_TYPES.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Work Type</label>
                  <select
                    name="workType"
                    value={formData.workType}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  >
                    <option value="">Select Work Type</option>
                    {ALL_WORK_TYPES.map(w => (
                      <option key={w.value} value={w.value}>{w.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SalesRabbit User</label>
                <input
                  type="text"
                  name="salesRabbitUser"
                  value={formData.salesRabbitUser}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <span className="text-gray-900">{lead.status || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Disposition</span>
                <span className="text-gray-900">{lead.disposition || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Lead Source</span>
                <span className="text-gray-900">{lead.source || lead.leadSource || '-'}</span>
              </div>
              {lead.isChampionReferral && (
                <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <div className="flex items-center gap-2 text-amber-800 font-medium mb-2">
                    <Trophy className="w-4 h-4" />
                    Champion Referral
                  </div>
                  <div className="text-sm text-amber-700 space-y-1">
                    {lead.championReferral?.champion && (
                      <p>Referred by: {lead.championReferral.champion.firstName} {lead.championReferral.champion.lastName}</p>
                    )}
                    {lead.championReferral?.referralCodeUsed && (
                      <p>Referral Code: {lead.championReferral.referralCodeUsed}</p>
                    )}
                  </div>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Property Type</span>
                <span className="text-gray-900">{lead.propertyType || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Work Type</span>
                <span className="text-gray-900">{lead.workType || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">SalesRabbit User</span>
                <span className="text-gray-900">{lead.salesRabbitUser || '-'}</span>
              </div>
            </div>
          )}
        </div>

        {/* Assignment & Scheduling */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Calendar className="w-5 h-5 mr-2 text-panda-primary" />
            Assignment & Scheduling
          </h2>

          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Owner (Assigned Rep)</label>
                <UserSearchDropdown
                  value={formData.ownerName || ''}
                  onChange={(name, user) => {
                    setFormData(prev => ({ ...prev, ownerId: user ? user.id : '', ownerName: name }));
                  }}
                  placeholder="Search for a user..."
                  showClear
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lead Set By</label>
                <UserSearchDropdown
                  value={formData.leadSetByName || ''}
                  onChange={(name, user) => {
                    setFormData(prev => ({ ...prev, leadSetById: user ? user.id : '', leadSetByName: name }));
                  }}
                  placeholder="Search for a user..."
                  showClear
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Manager</label>
                <input
                  type="text"
                  value={leadSetByManagerName || 'Unassigned'}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tentative Date</label>
                  <input
                    type="date"
                    name="tentativeAppointmentDate"
                    value={formData.tentativeAppointmentDate}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tentative Time</label>
                  <input
                    type="time"
                    name="tentativeAppointmentTime"
                    value={formData.tentativeAppointmentTime}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Owner</span>
                <span className="text-gray-900">
                  {lead.owner
                    ? `${lead.owner.firstName} ${lead.owner.lastName}`
                    : lead.ownerName || 'Unassigned'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Lead Set By</span>
                <span className="text-gray-900">
                  {lead.leadSetBy
                    ? `${lead.leadSetBy.firstName} ${lead.leadSetBy.lastName}`
                    : lead.leadSetByName || '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Manager</span>
                <span className="text-gray-900">{leadSetByManagerName || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Tentative Date</span>
                <span className="text-gray-900">
                  {lead.tentativeAppointmentDate
                    ? lead.tentativeAppointmentDate.split('T')[0]
                    : '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Tentative Time</span>
                <span className="text-gray-900">{lead.tentativeAppointmentTime || '-'}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-500">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <div className="flex items-center">
            <Clock className="w-4 h-4 mr-1" />
            Created: {new Date(lead.createdAt).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}
          </div>
          <div className="flex items-center">
            <Clock className="w-4 h-4 mr-1" />
            Updated: {new Date(lead.updatedAt).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}
          </div>
          {lead.creator && (
            <div className="flex items-center">
              <User className="w-4 h-4 mr-1" />
              Created By: {lead.creator.firstName} {lead.creator.lastName}
            </div>
          )}
          {lead.salesforceId && (
            <div>
              Salesforce ID: {lead.salesforceId}
            </div>
          )}
        </div>
      </div>
      </>
      )}

      {/* SMS Modal */}
      <SmsModal
        isOpen={showSmsModal}
        onClose={() => setShowSmsModal(false)}
        phone={lead.mobilePhone || lead.phone}
        recipientName={`${lead.firstName} ${lead.lastName}`}
        mergeData={{
          firstName: lead.firstName,
          lastName: lead.lastName,
          fullName: `${lead.firstName} ${lead.lastName}`,
          company: lead.company,
          companyName: lead.company,
          phone: lead.mobilePhone || lead.phone,
          email: lead.email,
          address: lead.street,
          projectAddress: lead.street ? `${lead.street}, ${lead.city || ''} ${lead.state || ''}`.trim() : '',
          city: lead.city,
          state: lead.state,
          status: lead.status,
          leadSource: lead.source,
        }}
        onSent={() => {
          // Optionally refresh data or show success toast
        }}
      />

      {/* Email Modal */}
      <EmailModal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        email={lead.email}
        recipientName={`${lead.firstName} ${lead.lastName}`}
        mergeData={{
          firstName: lead.firstName,
          lastName: lead.lastName,
          fullName: `${lead.firstName} ${lead.lastName}`,
          company: lead.company,
          companyName: lead.company,
          phone: lead.mobilePhone || lead.phone,
          email: lead.email,
          address: lead.street,
          projectAddress: lead.street ? `${lead.street}, ${lead.city || ''} ${lead.state || ''}`.trim() : '',
          city: lead.city,
          state: lead.state,
          status: lead.status,
          leadSource: lead.source,
        }}
        onSent={() => {
          // Optionally refresh data or show success toast
        }}
      />

      {/* Owner Action Prompt */}
      {leadActionStep === 'action' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl border border-gray-200">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Make a Selection</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Choose how you want to continue this lead.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLeadActionStep(null)}
                className="p-1 rounded hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setLeadActionStep(null);
                  setActiveTab('details');
                  startEditing();
                }}
                className="w-full px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Edit Lead
              </button>
              <button
                type="button"
                onClick={() => setLeadActionStep('inspection')}
                disabled={!isOwner}
                className={`w-full px-4 py-2 rounded-lg ${
                  isOwner
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                Convert to Job
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inspection Prompt */}
      {leadActionStep === 'inspection' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl border border-gray-200">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Was Property Inspected?</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Confirm inspection status to continue conversion.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLeadActionStep(null)}
                className="p-1 rounded hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setLeadActionStep('noInspection')}
                className="px-4 py-2 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50"
              >
                No
              </button>
              <button
                type="button"
                onClick={handleMarkInspected}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* No Inspection Notice */}
      {leadActionStep === 'noInspection' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl border border-gray-200">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Inspection Required</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Unable to convert to a job until an inspection is complete.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLeadActionStep(null)}
                className="p-1 rounded hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
              {isSuggestingInspectionSlot && 'Finding the next available inspection slot...'}
              {!isSuggestingInspectionSlot && noInspectionSuggestion?.found && (
                <span>
                  Suggested slot: {noInspectionSuggestion.appointmentDate} at {noInspectionSuggestion.appointmentTime}
                </span>
              )}
              {!isSuggestingInspectionSlot && noInspectionSuggestion && !noInspectionSuggestion.found && (
                <span>No inspection slots available in the next two weeks.</span>
              )}
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setLeadActionStep(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setLeadActionStep(null);
                  navigate('/production-center?view=dispatch');
                }}
                className="px-4 py-2 text-sm bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90"
              >
                Open Scheduling
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sales Path Selection */}
      {leadActionStep === 'salesPath' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl border border-gray-200">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Select Sales Path</h3>
                <p className="text-sm text-gray-600 mt-1">Choose Insurance or Retail.</p>
              </div>
              <button
                type="button"
                onClick={() => setLeadActionStep(null)}
                className="p-1 rounded hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleSelectSalesPath('INSURANCE')}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                Insurance
              </button>
              <button
                type="button"
                onClick={() => handleSelectSalesPath('RETAIL')}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
              >
                Retail
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
