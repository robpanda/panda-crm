import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leadsApi, usersApi, bamboogliApi, ringCentralApi } from '../services/api';
import { useRingCentral } from '../context/RingCentralContext';
import {
  UserPlus, ArrowLeft, Phone, Mail, Building2, Edit, ArrowRight,
  Save, X, MapPin, Calendar, Star, FileText, Clock, User, Tag,
  MessageSquare, Send, Loader2, ChevronDown, ChevronUp, Activity, PhoneCall,
  PhoneIncoming, PhoneOutgoing, PhoneMissed, MailOpen, MessageCircle, Sparkles, Trophy
} from 'lucide-react';
import { LeadRankBadge, LeadScoreCard } from '../components/LeadRankBadge';

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

// Activity Tab Component - Shows communication history (SMS, Email, Phone Calls)
function ActivityTab({ phone, email, leadName, leadId }) {
  const [filter, setFilter] = useState('all'); // all, sms, email, phone
  const [expandedId, setExpandedId] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const queryClient = useQueryClient();

  // Fetch SMS conversation by phone number
  const { data: phoneConversation, isLoading: phoneConvLoading } = useQuery({
    queryKey: ['lead-phone-conversation', phone],
    queryFn: async () => {
      try {
        if (!phone) return null;
        const data = await bamboogliApi.getConversationByIdentifier(phone);
        return data;
      } catch (err) {
        console.error('Failed to fetch phone conversation:', err);
        return null;
      }
    },
    enabled: !!phone,
  });

  // Fetch Email conversation by email address
  const { data: emailConversation, isLoading: emailConvLoading } = useQuery({
    queryKey: ['lead-email-conversation', email],
    queryFn: async () => {
      try {
        if (!email) return null;
        const data = await bamboogliApi.getConversationByIdentifier(email);
        return data;
      } catch (err) {
        console.error('Failed to fetch email conversation:', err);
        return null;
      }
    },
    enabled: !!email,
  });

  // Fetch SMS messages for the phone conversation
  const { data: smsMessagesData, isLoading: smsMessagesLoading } = useQuery({
    queryKey: ['lead-sms-messages', phoneConversation?.id],
    queryFn: async () => {
      if (!phoneConversation?.id) return { data: [] };
      const data = await bamboogliApi.getMessagesByConversation(phoneConversation.id, { limit: 100 });
      return data;
    },
    enabled: !!phoneConversation?.id,
  });

  // Fetch Email messages for the email conversation
  const { data: emailMessagesData, isLoading: emailMessagesLoading } = useQuery({
    queryKey: ['lead-email-messages', emailConversation?.id],
    queryFn: async () => {
      if (!emailConversation?.id) return { data: [] };
      const data = await bamboogliApi.getMessagesByConversation(emailConversation.id, { limit: 100 });
      return data;
    },
    enabled: !!emailConversation?.id,
  });

  // Fetch RingCentral call logs for this phone number
  const { data: callLogsData, isLoading: callsLoading } = useQuery({
    queryKey: ['lead-call-logs', phone],
    queryFn: async () => {
      if (!phone) return { data: [] };
      try {
        const data = await ringCentralApi.getCallLogs({ phoneNumber: phone, limit: 100 });
        return data;
      } catch (err) {
        console.error('Failed to fetch call logs:', err);
        return { data: [] };
      }
    },
    enabled: !!phone,
  });

  const smsMessagesRaw = smsMessagesData?.data || smsMessagesData || [];
  const emailMessagesRaw = emailMessagesData?.data || emailMessagesData || [];
  const callLogs = callLogsData?.data || callLogsData || [];

  // Filter SMS and Email messages from their respective conversations
  const smsMessages = Array.isArray(smsMessagesRaw) ? smsMessagesRaw.filter(m => m.channel === 'SMS' || m.type === 'sms') : [];
  const emailMessages = Array.isArray(emailMessagesRaw) ? emailMessagesRaw.filter(m => m.channel === 'EMAIL' || m.type === 'email') : [];
  const phoneCalls = Array.isArray(callLogs) ? callLogs : [];

  // Combine all activities into a unified timeline
  const allActivities = [
    ...smsMessages.map(m => ({
      id: m.id,
      type: 'sms',
      direction: m.direction || (m.from ? 'inbound' : 'outbound'),
      timestamp: new Date(m.createdAt || m.timestamp || m.sentAt),
      content: m.body || m.content || m.message,
      status: m.status,
      conversationId: m.conversationId || phoneConversation?.id,
      sentBy: m.sentBy || m.sentById,
      sentByName: m.sentByName || m.sentBy?.fullName,
    })),
    ...emailMessages.map(m => ({
      id: m.id,
      type: 'email',
      direction: m.direction || (m.from ? 'inbound' : 'outbound'),
      timestamp: new Date(m.createdAt || m.timestamp || m.sentAt),
      subject: m.subject,
      content: m.body || m.content,
      bodyHtml: m.bodyHtml,
      status: m.status,
      conversationId: m.conversationId || emailConversation?.id,
      sentBy: m.sentBy || m.sentById,
      sentByName: m.sentByName || m.sentBy?.fullName,
    })),
    ...phoneCalls.map(c => ({
      id: c.id,
      type: 'phone',
      direction: c.direction?.toLowerCase() || 'outbound',
      timestamp: new Date(c.startTime || c.createdAt || c.timestamp),
      duration: c.duration,
      result: c.result || c.callResult,
      status: c.status,
      from: c.from?.phoneNumber || c.from,
      to: c.to?.phoneNumber || c.to,
    })),
  ].sort((a, b) => b.timestamp - a.timestamp);

  // Filter activities
  const filteredActivities = filter === 'all'
    ? allActivities
    : allActivities.filter(a => a.type === filter);

  const isLoading = phoneConvLoading || emailConvLoading || smsMessagesLoading || emailMessagesLoading || callsLoading;

  // Format duration in minutes:seconds
  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get icon for activity type
  const getActivityIcon = (activity) => {
    if (activity.type === 'sms') {
      return activity.direction === 'inbound' || activity.direction === 'incoming' || activity.direction === 'INBOUND'
        ? <MessageCircle className="w-4 h-4 text-purple-500" />
        : <MessageSquare className="w-4 h-4 text-purple-600" />;
    }
    if (activity.type === 'email') {
      return activity.direction === 'inbound' || activity.direction === 'incoming' || activity.direction === 'INBOUND'
        ? <MailOpen className="w-4 h-4 text-orange-500" />
        : <Mail className="w-4 h-4 text-orange-600" />;
    }
    if (activity.type === 'phone') {
      if (activity.result === 'Missed' || activity.result === 'missed') {
        return <PhoneMissed className="w-4 h-4 text-red-500" />;
      }
      return activity.direction === 'inbound' || activity.direction === 'incoming'
        ? <PhoneIncoming className="w-4 h-4 text-green-500" />
        : <PhoneOutgoing className="w-4 h-4 text-blue-500" />;
    }
    return <Activity className="w-4 h-4 text-gray-500" />;
  };

  // Get badge color for activity type
  const getActivityBadge = (activity) => {
    const badges = {
      sms: 'bg-purple-100 text-purple-700',
      email: 'bg-orange-100 text-orange-700',
      phone: 'bg-blue-100 text-blue-700',
    };
    return badges[activity.type] || 'bg-gray-100 text-gray-700';
  };

  // Handle sending a reply
  const handleSendReply = async (activity) => {
    if (!replyText.trim()) return;

    setIsSendingReply(true);
    try {
      if (activity.type === 'sms') {
        await bamboogliApi.replyToMessage(activity.id, {
          body: replyText.trim(),
          leadId,
        });
      } else if (activity.type === 'email') {
        await bamboogliApi.replyToMessage(activity.id, {
          body: replyText.trim(),
          subject: activity.subject?.startsWith('Re:') ? activity.subject : `Re: ${activity.subject || ''}`,
          leadId,
        });
      }

      setReplyText('');
      setExpandedId(null);
      // Refresh messages
      queryClient.invalidateQueries(['lead-sms-messages']);
      queryClient.invalidateQueries(['lead-email-messages']);
    } catch (err) {
      console.error('Failed to send reply:', err);
    } finally {
      setIsSendingReply(false);
    }
  };

  // Check if direction is inbound
  const isInbound = (direction) => {
    return direction === 'inbound' || direction === 'incoming' || direction === 'INBOUND';
  };

  return (
    <div className="flex gap-6">
      {/* Left Sidebar - Filter Options */}
      <div className="w-48 flex-shrink-0 hidden md:block">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sticky top-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Filter By Type</h3>
          <div className="space-y-1">
            <button
              onClick={() => setFilter('all')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                filter === 'all'
                  ? 'bg-panda-primary text-white'
                  : 'hover:bg-gray-100 text-gray-700'
              }`}
            >
              <span className="flex items-center">
                <Activity className="w-4 h-4 mr-2" />
                All Activity
              </span>
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                filter === 'all' ? 'bg-white/20' : 'bg-gray-200'
              }`}>
                {allActivities.length}
              </span>
            </button>

            <button
              onClick={() => setFilter('phone')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                filter === 'phone'
                  ? 'bg-blue-500 text-white'
                  : 'hover:bg-gray-100 text-gray-700'
              }`}
            >
              <span className="flex items-center">
                <PhoneCall className="w-4 h-4 mr-2" />
                Phone Calls
              </span>
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                filter === 'phone' ? 'bg-white/20' : 'bg-blue-100 text-blue-700'
              }`}>
                {phoneCalls.length}
              </span>
            </button>

            <button
              onClick={() => setFilter('sms')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                filter === 'sms'
                  ? 'bg-purple-500 text-white'
                  : 'hover:bg-gray-100 text-gray-700'
              }`}
            >
              <span className="flex items-center">
                <MessageSquare className="w-4 h-4 mr-2" />
                SMS
              </span>
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                filter === 'sms' ? 'bg-white/20' : 'bg-purple-100 text-purple-700'
              }`}>
                {smsMessages.length}
              </span>
            </button>

            <button
              onClick={() => setFilter('email')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                filter === 'email'
                  ? 'bg-orange-500 text-white'
                  : 'hover:bg-gray-100 text-gray-700'
              }`}
            >
              <span className="flex items-center">
                <Mail className="w-4 h-4 mr-2" />
                Email
              </span>
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                filter === 'email' ? 'bg-white/20' : 'bg-orange-100 text-orange-700'
              }`}>
                {emailMessages.length}
              </span>
            </button>
          </div>

          {/* Direction filter */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Quick Stats</h3>
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex justify-between">
                <span>Inbound</span>
                <span className="font-medium">{allActivities.filter(a => isInbound(a.direction)).length}</span>
              </div>
              <div className="flex justify-between">
                <span>Outbound</span>
                <span className="font-medium">{allActivities.filter(a => !isInbound(a.direction)).length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        {/* Mobile Filter Buttons */}
        <div className="md:hidden flex gap-2 mb-4 overflow-x-auto pb-2">
          <button
            onClick={() => setFilter('all')}
            className={`flex items-center px-3 py-2 rounded-lg text-sm whitespace-nowrap ${
              filter === 'all' ? 'bg-panda-primary text-white' : 'bg-white border border-gray-200'
            }`}
          >
            <Activity className="w-4 h-4 mr-1" />
            All ({allActivities.length})
          </button>
          <button
            onClick={() => setFilter('phone')}
            className={`flex items-center px-3 py-2 rounded-lg text-sm whitespace-nowrap ${
              filter === 'phone' ? 'bg-blue-500 text-white' : 'bg-white border border-gray-200'
            }`}
          >
            <PhoneCall className="w-4 h-4 mr-1" />
            Calls ({phoneCalls.length})
          </button>
          <button
            onClick={() => setFilter('sms')}
            className={`flex items-center px-3 py-2 rounded-lg text-sm whitespace-nowrap ${
              filter === 'sms' ? 'bg-purple-500 text-white' : 'bg-white border border-gray-200'
            }`}
          >
            <MessageSquare className="w-4 h-4 mr-1" />
            SMS ({smsMessages.length})
          </button>
          <button
            onClick={() => setFilter('email')}
            className={`flex items-center px-3 py-2 rounded-lg text-sm whitespace-nowrap ${
              filter === 'email' ? 'bg-orange-500 text-white' : 'bg-white border border-gray-200'
            }`}
          >
            <Mail className="w-4 h-4 mr-1" />
            Email ({emailMessages.length})
          </button>
        </div>

        {/* Activity Timeline */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <Activity className="w-5 h-5 mr-2 text-panda-primary" />
              Activity Timeline
            </h2>
            <span className="text-sm text-gray-500">
              {filteredActivities.length} {filter === 'all' ? 'activities' : filter === 'phone' ? 'calls' : filter === 'sms' ? 'messages' : 'emails'}
            </span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-panda-primary" />
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="w-12 h-12 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">No activity recorded yet</p>
              <p className="text-sm text-gray-400 mt-1">
                {!phone && !email ? 'No phone or email on record' : 'Communications will appear here'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredActivities.map((activity, index) => {
                const isExpanded = expandedId === activity.id;
                const canReply = activity.type === 'sms' || activity.type === 'email';

                return (
                  <div
                    key={activity.id || index}
                    className={`rounded-lg border transition-all ${
                      isExpanded
                        ? 'border-panda-primary bg-panda-primary/5'
                        : 'border-gray-100 bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    {/* Message Header - Clickable to expand */}
                    <div
                      onClick={() => canReply && setExpandedId(isExpanded ? null : activity.id)}
                      className={`flex items-start space-x-4 p-4 ${canReply ? 'cursor-pointer' : ''}`}
                    >
                      <div className="flex-shrink-0 mt-1">
                        {getActivityIcon(activity)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getActivityBadge(activity)}`}>
                            {activity.type.toUpperCase()}
                          </span>
                          <span className="text-xs text-gray-500 capitalize">
                            {isInbound(activity.direction) ? 'Incoming' : 'Outgoing'}
                          </span>
                          {activity.sentByName && !isInbound(activity.direction) && (
                            <span className="text-xs text-gray-400">
                              by {activity.sentByName}
                            </span>
                          )}
                          {activity.type === 'phone' && activity.result && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              activity.result === 'Missed' || activity.result === 'missed'
                                ? 'bg-red-100 text-red-700'
                                : activity.result === 'Answered' || activity.result === 'answered'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-700'
                            }`}>
                              {activity.result}
                            </span>
                          )}
                          {activity.type === 'phone' && activity.duration > 0 && (
                            <span className="text-xs text-gray-500">
                              {formatDuration(activity.duration)}
                            </span>
                          )}
                        </div>
                        {activity.type === 'email' && activity.subject && (
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {activity.subject}
                          </p>
                        )}
                        {activity.content && (
                          <p className={`text-sm text-gray-600 ${isExpanded ? '' : 'line-clamp-2'}`}>
                            {activity.content}
                          </p>
                        )}
                        {activity.type === 'phone' && !activity.content && (
                          <p className="text-sm text-gray-600">
                            {isInbound(activity.direction)
                              ? `Call from ${activity.from || 'unknown'}`
                              : `Call to ${activity.to || 'unknown'}`}
                          </p>
                        )}
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-xs text-gray-500">
                          {activity.timestamp.toLocaleDateString()}
                        </p>
                        <p className="text-xs text-gray-400">
                          {activity.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        {canReply && (
                          <div className="mt-2">
                            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Expanded Reply Section */}
                    {isExpanded && canReply && (
                      <div className="px-4 pb-4 border-t border-gray-200 mt-2 pt-4">
                        {/* Full message content if email with HTML */}
                        {activity.type === 'email' && activity.bodyHtml && (
                          <div
                            className="mb-4 p-3 bg-white rounded border border-gray-200 text-sm prose prose-sm max-w-none"
                            dangerouslySetInnerHTML={{ __html: activity.bodyHtml }}
                          />
                        )}

                        {/* Reply input */}
                        <div className="space-y-3">
                          <label className="block text-sm font-medium text-gray-700">
                            Reply to this {activity.type === 'sms' ? 'message' : 'email'}
                          </label>
                          <textarea
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder={`Type your ${activity.type === 'sms' ? 'SMS' : 'email'} reply...`}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-panda-primary text-sm"
                          />
                          <div className="flex justify-end space-x-2">
                            <button
                              onClick={() => {
                                setExpandedId(null);
                                setReplyText('');
                              }}
                              className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSendReply(activity)}
                              disabled={!replyText.trim() || isSendingReply}
                              className="flex items-center px-4 py-1.5 text-sm bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {isSendingReply ? (
                                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                              ) : (
                                <Send className="w-4 h-4 mr-1" />
                              )}
                              Send Reply
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
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
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({});
  const [showSmsModal, setShowSmsModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [activeTab, setActiveTab] = useState('details'); // details | activity
  const [isScoreExpanded, setIsScoreExpanded] = useState(false); // AI Score card collapsed by default

  const { data: lead, isLoading } = useQuery({
    queryKey: ['lead', id],
    queryFn: () => leadsApi.getLead(id),
    enabled: !!id,
    onSuccess: (data) => {
      if (!isEditing) {
        setFormData({
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          email: data.email || '',
          phone: data.phone || '',
          mobilePhone: data.mobilePhone || '',
          company: data.company || '',
          street: data.street || '',
          city: data.city || '',
          state: data.state || '',
          postalCode: data.postalCode || '',
          status: data.status || 'NEW',
          leadSource: data.leadSource || '',
          rating: data.rating || '',
          description: data.description || '',
          propertyType: data.propertyType || '',
          workType: data.workType || '',
          leadNotes: data.leadNotes || '',
          salesRabbitUser: data.salesRabbitUser || '',
          tentativeAppointmentDate: data.tentativeAppointmentDate ? data.tentativeAppointmentDate.split('T')[0] : '',
          tentativeAppointmentTime: data.tentativeAppointmentTime || '',
          leadSetById: data.leadSetById || '',
          leadDisposition: data.leadDisposition || '',
          ownerId: data.ownerId || '',
        });
      }
    },
  });

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.getUsers(),
  });
  const users = usersData?.data || [];

  const updateMutation = useMutation({
    mutationFn: (data) => leadsApi.updateLead(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['lead', id]);
      queryClient.invalidateQueries(['leads']);
      setIsEditing(false);
    },
  });

  const convertMutation = useMutation({
    mutationFn: () => leadsApi.convertLead(id, {}),
    onSuccess: () => {
      queryClient.invalidateQueries(['lead', id]);
    },
  });

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
      leadSource: lead.leadSource || '',
      rating: lead.rating || '',
      description: lead.description || '',
      propertyType: lead.propertyType || '',
      workType: lead.workType || '',
      leadNotes: lead.leadNotes || '',
      salesRabbitUser: lead.salesRabbitUser || '',
      tentativeAppointmentDate: lead.tentativeAppointmentDate ? lead.tentativeAppointmentDate.split('T')[0] : '',
      tentativeAppointmentTime: lead.tentativeAppointmentTime || '',
      leadSetById: lead.leadSetById || '',
      leadDisposition: lead.leadDisposition || '',
      ownerId: lead.ownerId || '',
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
      leadSource: lead.leadSource || '',
      rating: lead.rating || '',
      description: lead.description || '',
      propertyType: lead.propertyType || '',
      workType: lead.workType || '',
      leadNotes: lead.leadNotes || '',
      salesRabbitUser: lead.salesRabbitUser || '',
      tentativeAppointmentDate: lead.tentativeAppointmentDate ? lead.tentativeAppointmentDate.split('T')[0] : '',
      tentativeAppointmentTime: lead.tentativeAppointmentTime || '',
      leadSetById: lead.leadSetById || '',
      leadDisposition: lead.leadDisposition || '',
      ownerId: lead.ownerId || '',
    });
    setIsEditing(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary"></div>
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

  const activeUsers = users.filter(u => u.isActive);

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
                  onClick={() => convertMutation.mutate()}
                  disabled={convertMutation.isPending}
                  className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:opacity-90 disabled:opacity-50"
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Phone</label>
                  <input
                    type="tel"
                    name="mobilePhone"
                    value={formData.mobilePhone}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                  <select
                    name="state"
                    value={formData.state}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
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
                    name="leadDisposition"
                    value={formData.leadDisposition}
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rating</label>
                  <select
                    name="rating"
                    value={formData.rating}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  >
                    <option value="">Select Rating</option>
                    {RATINGS.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
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
                <span className="text-gray-900">{lead.leadDisposition || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Lead Source</span>
                <span className="text-gray-900">{lead.leadSource || '-'}</span>
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
                <span className="text-gray-500">Rating</span>
                <span className={`${
                  lead.rating === 'Hot' ? 'text-red-500' :
                  lead.rating === 'Warm' ? 'text-orange-500' :
                  lead.rating === 'Cold' ? 'text-blue-500' : 'text-gray-900'
                }`}>{lead.rating || '-'}</span>
              </div>
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
                <select
                  name="ownerId"
                  value={formData.ownerId}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                >
                  <option value="">Unassigned</option>
                  {activeUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lead Set By</label>
                <select
                  name="leadSetById"
                  value={formData.leadSetById}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                >
                  <option value="">Select User</option>
                  {activeUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                  ))}
                </select>
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
                  {lead.owner ? `${lead.owner.firstName} ${lead.owner.lastName}` : 'Unassigned'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Lead Set By</span>
                <span className="text-gray-900">
                  {lead.leadSetBy ? `${lead.leadSetBy.firstName} ${lead.leadSetBy.lastName}` : '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Tentative Date</span>
                <span className="text-gray-900">
                  {lead.tentativeAppointmentDate
                    ? new Date(lead.tentativeAppointmentDate).toLocaleDateString()
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

      {/* Notes Section - Full Width */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <FileText className="w-5 h-5 mr-2 text-panda-primary" />
          Notes & Description
        </h2>

        {isEditing ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                placeholder="General description of the lead..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lead Notes</label>
              <textarea
                name="leadNotes"
                value={formData.leadNotes}
                onChange={handleInputChange}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                placeholder="Additional notes about this lead..."
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Description</h3>
              <p className="text-gray-900 whitespace-pre-wrap">{lead.description || 'No description provided.'}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Lead Notes</h3>
              <p className="text-gray-900 whitespace-pre-wrap">{lead.leadNotes || 'No notes available.'}</p>
            </div>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-500">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <div className="flex items-center">
            <Clock className="w-4 h-4 mr-1" />
            Created: {new Date(lead.createdAt).toLocaleString()}
          </div>
          <div className="flex items-center">
            <Clock className="w-4 h-4 mr-1" />
            Updated: {new Date(lead.updatedAt).toLocaleString()}
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
    </div>
  );
}
