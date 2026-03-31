import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bamboogliApi, ringCentralApi, opportunitiesApi, usersApi } from '../services/api';
import {
  MessageSquare,
  Mail,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Send,
  Paperclip,
  Search,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle,
  AlertCircle,
  Archive,
  Activity,
  Loader2,
  Zap,
  MailOpen,
  MessageCircle,
  X,
  Reply,
  User,
} from 'lucide-react';
import { formatDateMDY } from '../utils/formatters';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\u200B/g, '')
    .trim();
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function formatTimestamp(dateStr) {
  if (!dateStr) return '';
  return formatDateMDY(dateStr);
}

function formatDateSeparator(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = today - msgDay;
  if (diff === 0) return 'Today';
  if (diff === 86400000) return 'Yesterday';
  if (diff < 604800000) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function formatCallDuration(seconds) {
  if (!seconds || seconds === 0) return '0s';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function getStatusBadge(status) {
  const s = (status || '').toLowerCase();
  if (s === 'delivered' || s === 'sent') return { color: 'text-green-600', bg: 'bg-green-50', label: 'Delivered', icon: CheckCircle };
  if (s === 'failed' || s === 'error') return { color: 'text-red-600', bg: 'bg-red-50', label: 'Failed', icon: AlertCircle };
  if (s === 'queued' || s === 'sending') return { color: 'text-yellow-600', bg: 'bg-yellow-50', label: 'Sending', icon: Clock };
  return { color: 'text-gray-500', bg: 'bg-gray-50', label: status || 'Unknown', icon: Clock };
}

// ─── Channel Tab Button ───────────────────────────────────────────────────────

function ChannelTab({ icon: Icon, label, count, active, onClick, color }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
        active
          ? `${color} shadow-sm ring-1 ring-inset`
          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
      }`}
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
      {count > 0 && (
        <span className={`text-xs px-1.5 py-0.5 rounded-full ${active ? 'bg-white/60 text-gray-700' : 'bg-gray-100 text-gray-600'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

// ─── SMS Chat Bubble ──────────────────────────────────────────────────────────

function SmsBubble({ message, isOutbound, showTimestamp }) {
  const body = stripHtml(message.body || message.content || message.text || '');
  const status = getStatusBadge(message.status || message.deliveryStatus);
  const StatusIcon = status.icon;

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'} mb-1`}>
      <div className={`max-w-[75%] ${isOutbound ? 'order-1' : ''}`}>
        <div
          className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
            isOutbound
              ? 'bg-panda-primary text-white rounded-br-md'
              : 'bg-gray-100 text-gray-900 rounded-bl-md'
          }`}
        >
          {body || <span className="italic text-gray-400">No content</span>}
        </div>
        {showTimestamp && (
          <div className={`flex items-center space-x-1 mt-0.5 px-1 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
            <span className="text-[10px] text-gray-400">{formatTimestamp(message.createdAt || message.sentAt || message.timestamp)}</span>
            {isOutbound && <StatusIcon className={`w-3 h-3 ${status.color}`} />}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Email Thread Item ────────────────────────────────────────────────────────

function EmailThreadItem({ thread, onClick, isSelected }) {
  const latestMsg = thread.messages[thread.messages.length - 1];
  const subject = thread.subject || latestMsg?.subject || '(No Subject)';
  const preview = stripHtml(latestMsg?.body || latestMsg?.content || '');
  const from = latestMsg?.fromName || latestMsg?.from || latestMsg?.senderName || '';
  const isInbound = (latestMsg?.direction || '').toLowerCase() === 'inbound';
  const unread = thread.messages.some(m => !m.readAt && (m.direction || '').toLowerCase() === 'inbound');

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
        isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
      } ${unread ? 'bg-blue-50/40' : ''}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            {unread && <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />}
            <span className={`text-sm truncate ${unread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
              {isInbound ? from : `To: ${latestMsg?.to || latestMsg?.recipientEmail || ''}`}
            </span>
          </div>
          <p className={`text-sm truncate mt-0.5 ${unread ? 'font-medium text-gray-800' : 'text-gray-600'}`}>{subject}</p>
          <p className="text-xs text-gray-400 truncate mt-0.5">{preview.substring(0, 80)}{preview.length > 80 ? '...' : ''}</p>
        </div>
        <div className="flex flex-col items-end ml-3 flex-shrink-0">
          <span className="text-[10px] text-gray-400">{formatTime(latestMsg?.createdAt || latestMsg?.sentAt)}</span>
          <span className="text-[10px] text-gray-400 mt-1">{thread.messages.length > 1 ? `${thread.messages.length} msgs` : ''}</span>
        </div>
      </div>
    </button>
  );
}

// ─── Email Message (expanded in thread) ───────────────────────────────────────

function EmailMessage({ message, isLast }) {
  const [expanded, setExpanded] = useState(isLast);
  const body = message.body || message.content || message.htmlBody || '';
  const plainBody = stripHtml(body);
  const isInbound = (message.direction || '').toLowerCase() === 'inbound';
  const from = message.fromName || message.from || message.senderName || 'Unknown';
  const to = message.to || message.recipientEmail || '';

  return (
    <div className={`border-b border-gray-100 last:border-0 ${expanded ? '' : 'cursor-pointer hover:bg-gray-50'}`}>
      <div className="flex items-start px-4 py-3 space-x-3" onClick={() => !expanded && setExpanded(true)}>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isInbound ? 'bg-blue-100' : 'bg-green-100'}`}>
          <span className="text-xs font-medium">{from.charAt(0).toUpperCase()}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-gray-900">{from}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${isInbound ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                {isInbound ? 'Received' : 'Sent'}
              </span>
            </div>
            <span className="text-xs text-gray-400">{formatTimestamp(message.createdAt || message.sentAt)}</span>
          </div>
          {!expanded && (
            <p className="text-sm text-gray-500 truncate mt-0.5">{plainBody.substring(0, 120)}...</p>
          )}
          {expanded && (
            <>
              <div className="text-xs text-gray-400 mt-0.5">To: {to}</div>
              <div className="mt-3 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {plainBody}
              </div>
              {message.attachments?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {message.attachments.map((att, i) => (
                    <a
                      key={i}
                      href={att.url || att.contentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center space-x-1 px-2 py-1 bg-gray-100 rounded text-xs text-gray-600 hover:bg-gray-200"
                    >
                      <Paperclip className="w-3 h-3" />
                      <span>{att.filename || att.fileName || 'Attachment'}</span>
                    </a>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        {!isLast && (
          <button onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }} className="text-gray-400 hover:text-gray-600">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Call Log Item ────────────────────────────────────────────────────────────

function CallLogItem({ call }) {
  const direction = (call.direction || '').toLowerCase();
  const result = (call.result || call.disposition || '').toLowerCase();
  const isMissed = result === 'missed' || result === 'no answer' || result === 'voicemail';
  const DirIcon = direction === 'inbound'
    ? (isMissed ? PhoneMissed : PhoneIncoming)
    : PhoneOutgoing;
  const dirColor = isMissed ? 'text-red-500' : direction === 'inbound' ? 'text-blue-500' : 'text-green-500';
  const dirBg = isMissed ? 'bg-red-50' : direction === 'inbound' ? 'bg-blue-50' : 'bg-green-50';

  return (
    <div className="flex items-center space-x-3 px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0">
      <div className={`w-9 h-9 rounded-full ${dirBg} flex items-center justify-center flex-shrink-0`}>
        <DirIcon className={`w-4 h-4 ${dirColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium text-gray-900">
            {direction === 'inbound' ? 'Incoming Call' : 'Outgoing Call'}
          </span>
          {isMissed && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600">Missed</span>}
        </div>
        <div className="flex items-center space-x-3 mt-0.5">
          <span className="text-xs text-gray-500">{call.from || call.fromNumber || ''} → {call.to || call.toNumber || ''}</span>
          {call.duration > 0 && <span className="text-xs text-gray-400">{formatCallDuration(call.duration)}</span>}
        </div>
      </div>
      <span className="text-xs text-gray-400">{formatTimestamp(call.startTime || call.createdAt)}</span>
    </div>
  );
}

// ─── Compose Bar ──────────────────────────────────────────────────────────────

function ComposeBar({ channel, phone, email, contactName, opportunityId, onSent }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const textareaRef = useRef(null);

  const handleSend = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      if (channel === 'sms') {
        await bamboogliApi.sendSms({ to: phone, body, recipientName: contactName, opportunityId });
      } else if (channel === 'email') {
        await bamboogliApi.sendEmail({
          to: email,
          subject: emailSubject || `Re: ${contactName || 'Conversation'}`,
          body,
          bodyHtml: `<p>${body.replace(/\n/g, '<br/>')}</p>`,
          recipientName: contactName,
          opportunityId,
        });
      }
      setText('');
      setEmailSubject('');
      onSent?.();
    } catch (err) {
      console.error('Failed to send:', err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && channel === 'sms') {
      e.preventDefault();
      handleSend();
    }
  };

  const placeholder = channel === 'sms'
    ? `Text ${contactName || phone || ''}...`
    : `Email ${contactName || email || ''}...`;

  return (
    <div className="border-t border-gray-200 bg-white p-3">
      {channel === 'email' && (
        <input
          type="text"
          value={emailSubject}
          onChange={(e) => setEmailSubject(e.target.value)}
          placeholder="Subject..."
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 mb-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      )}
      <div className="flex items-end space-x-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-panda-primary/50 max-h-32"
          style={{ minHeight: '38px' }}
          onInput={(e) => {
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
          }}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || sending}
          className="w-9 h-9 rounded-full bg-panda-primary text-white flex items-center justify-center hover:bg-panda-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
      {channel === 'sms' && <p className="text-[10px] text-gray-400 mt-1 px-1">Press Enter to send, Shift+Enter for new line</p>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CommunicationsTab({
  phone,
  email,
  contactName,
  archivedActivities = [],
  onActivityClick,
  opportunityId,
  showArchiveChannel = true,
}) {
  const queryClient = useQueryClient();
  const [activeChannel, setActiveChannel] = useState('sms');
  const [selectedEmailThread, setSelectedEmailThread] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showArchive, setShowArchive] = useState(false);
  const [summaryData, setSummaryData] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const chatContainerRef = useRef(null);

  // ─── Data Fetching ──────────────────────────────────────────────────────────

  const identifier = phone || email || '';

  const { data: conversation } = useQuery({
    queryKey: ['comms-conversation', identifier],
    queryFn: () => bamboogliApi.getConversationByIdentifier(identifier),
    enabled: !!identifier,
    retry: false,
  });

  const conversationId = conversation?.data?.id || conversation?.id;

  const { data: opportunityConversations } = useQuery({
    queryKey: ['comms-opportunity-conversations', opportunityId],
    queryFn: () => bamboogliApi.getConversationsByOpportunity(opportunityId),
    enabled: !!opportunityId,
    retry: false,
    staleTime: 30000,
  });

  const conversationIds = useMemo(() => {
    if (conversationId) return [conversationId];
    const raw = opportunityConversations?.data || opportunityConversations || [];
    if (!Array.isArray(raw)) return [];
    return raw.map(c => c?.id).filter(Boolean);
  }, [conversationId, opportunityConversations]);

  const { data: messagesData, isLoading: messagesLoading } = useQuery({
    queryKey: ['comms-messages', conversationIds.join(',')],
    queryFn: async () => {
      if (conversationIds.length === 0) return [];
      if (conversationIds.length === 1) {
        return bamboogliApi.getMessagesByConversation(conversationIds[0], { limit: 200 });
      }
      const batches = await Promise.allSettled(
        conversationIds.map((id) => bamboogliApi.getMessagesByConversation(id, { limit: 200 }))
      );
      const combined = [];
      for (const batch of batches) {
        if (batch.status !== 'fulfilled') continue;
        const payload = batch.value?.data || batch.value?.messages || batch.value || [];
        if (Array.isArray(payload)) {
          combined.push(...payload);
        }
      }
      return combined;
    },
    enabled: conversationIds.length > 0,
    refetchInterval: 30000,
  });

  const { data: callLogsData, isLoading: callsLoading } = useQuery({
    queryKey: ['comms-call-logs', phone],
    queryFn: () => ringCentralApi.getCallLogs({ phoneNumber: phone, limit: 100 }),
    enabled: !!phone,
    retry: false,
  });

  const messages = useMemo(() => {
    const raw = messagesData?.data || messagesData?.messages || messagesData || [];
    return Array.isArray(raw) ? raw : [];
  }, [messagesData]);

  const callLogs = useMemo(() => {
    const raw = callLogsData?.data || callLogsData?.records || callLogsData || [];
    return Array.isArray(raw) ? raw : [];
  }, [callLogsData]);

  // ─── Categorize Messages ───────────────────────────────────────────────────

  const smsMessages = useMemo(() => {
    return messages
      .filter(m => {
        const ch = (m.channel || m.type || m.messageType || '').toLowerCase();
        return ch === 'sms' || ch === 'mms' || ch === 'text';
      })
      .sort((a, b) => new Date(a.createdAt || a.sentAt) - new Date(b.createdAt || b.sentAt));
  }, [messages]);

  const emailMessages = useMemo(() => {
    return messages
      .filter(m => {
        const ch = (m.channel || m.type || m.messageType || '').toLowerCase();
        return ch === 'email';
      })
      .sort((a, b) => new Date(a.createdAt || a.sentAt) - new Date(b.createdAt || b.sentAt));
  }, [messages]);

  // ─── Group Emails into Threads ──────────────────────────────────────────────

  const emailThreads = useMemo(() => {
    const threads = new Map();
    emailMessages.forEach(msg => {
      const threadKey = (msg.threadId || msg.subject || msg.metadata?.threading?.inReplyTo || msg.id || '').toLowerCase().replace(/^re:\s*/i, '').trim();
      const normalizedSubject = (msg.subject || '(No Subject)').replace(/^(re|fwd|fw):\s*/gi, '').trim();
      const key = msg.threadId || normalizedSubject.toLowerCase() || msg.id;

      if (!threads.has(key)) {
        threads.set(key, { subject: normalizedSubject, messages: [], threadId: msg.threadId || key });
      }
      threads.get(key).messages.push(msg);
    });

    // Sort threads by latest message date (newest first)
    return Array.from(threads.values()).sort((a, b) => {
      const aDate = new Date(a.messages[a.messages.length - 1]?.createdAt || a.messages[a.messages.length - 1]?.sentAt || 0);
      const bDate = new Date(b.messages[b.messages.length - 1]?.createdAt || b.messages[b.messages.length - 1]?.sentAt || 0);
      return bDate - aDate;
    });
  }, [emailMessages]);

  // ─── SMS Date Groups ────────────────────────────────────────────────────────

  const smsWithDateGroups = useMemo(() => {
    const groups = [];
    let lastDate = null;
    smsMessages.forEach(msg => {
      const msgDate = new Date(msg.createdAt || msg.sentAt);
      const dateKey = `${msgDate.getFullYear()}-${msgDate.getMonth()}-${msgDate.getDate()}`;
      if (dateKey !== lastDate) {
        groups.push({ type: 'date', date: msg.createdAt || msg.sentAt, key: dateKey });
        lastDate = dateKey;
      }
      groups.push({ type: 'message', message: msg });
    });
    return groups;
  }, [smsMessages]);

  // ─── Counts ─────────────────────────────────────────────────────────────────

  const counts = useMemo(() => ({
    sms: smsMessages.length,
    email: emailMessages.length,
    phone: callLogs.length,
    archive: archivedActivities.length,
  }), [smsMessages.length, emailMessages.length, callLogs.length, archivedActivities.length]);

  // ─── Auto-scroll SMS ───────────────────────────────────────────────────────

  useEffect(() => {
    if (activeChannel === 'sms' && chatContainerRef.current) {
      const container = chatContainerRef.current;
      if (container.scrollHeight > container.clientHeight) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [smsMessages.length, activeChannel]);

  // ─── AI Summary ─────────────────────────────────────────────────────────────

  const handleGenerateSummary = async () => {
    if (!opportunityId) return;
    setSummaryLoading(true);
    try {
      const result = await opportunitiesApi.summarizeConversation(opportunityId);
      setSummaryData(result?.data || result?.summary || result);
    } catch (err) {
      console.error('Summary failed:', err);
    } finally {
      setSummaryLoading(false);
    }
  };

  // ─── Refresh after send ─────────────────────────────────────────────────────

  const handleMessageSent = () => {
    queryClient.invalidateQueries(['comms-messages', conversationId]);
    queryClient.invalidateQueries(['comms-conversation', identifier]);
  };

  // ─── Search ─────────────────────────────────────────────────────────────────

  const filteredCallLogs = useMemo(() => {
    if (!searchTerm) return callLogs;
    const q = searchTerm.toLowerCase();
    return callLogs.filter(c =>
      (c.from || '').toLowerCase().includes(q) ||
      (c.to || '').toLowerCase().includes(q) ||
      (c.result || '').toLowerCase().includes(q)
    );
  }, [callLogs, searchTerm]);

  const filteredEmailThreads = useMemo(() => {
    if (!searchTerm) return emailThreads;
    const q = searchTerm.toLowerCase();
    return emailThreads.filter(t =>
      t.subject.toLowerCase().includes(q) ||
      t.messages.some(m =>
        stripHtml(m.body || m.content || '').toLowerCase().includes(q) ||
        (m.from || m.fromName || '').toLowerCase().includes(q)
      )
    );
  }, [emailThreads, searchTerm]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  const isLoading = messagesLoading || callsLoading;

  if (!phone && !email) {
    return (
      <div className="text-center py-16 text-gray-400">
        <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p className="font-medium text-gray-600">No Contact Information</p>
        <p className="text-sm mt-1">Add a phone number or email to this contact to view communications.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ minHeight: '500px' }}>
      {/* ── Header: Channel Tabs + Search ────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center space-x-1">
          {phone && (
            <ChannelTab
              icon={MessageSquare}
              label="SMS"
              count={counts.sms}
              active={activeChannel === 'sms'}
              onClick={() => { setActiveChannel('sms'); setShowArchive(false); }}
              color="bg-purple-50 text-purple-700 ring-purple-200"
            />
          )}
          {email && (
            <ChannelTab
              icon={Mail}
              label="Email"
              count={counts.email}
              active={activeChannel === 'email'}
              onClick={() => { setActiveChannel('email'); setShowArchive(false); setSelectedEmailThread(null); }}
              color="bg-blue-50 text-blue-700 ring-blue-200"
            />
          )}
          {phone && (
            <ChannelTab
              icon={Phone}
              label="Calls"
              count={counts.phone}
              active={activeChannel === 'phone'}
              onClick={() => { setActiveChannel('phone'); setShowArchive(false); }}
              color="bg-green-50 text-green-700 ring-green-200"
            />
          )}
          {showArchiveChannel && counts.archive > 0 && (
            <ChannelTab
              icon={Archive}
              label="Archive"
              count={counts.archive}
              active={showArchive}
              onClick={() => { setShowArchive(true); setActiveChannel('archive'); }}
              color="bg-gray-100 text-gray-700 ring-gray-200"
            />
          )}
        </div>

        <div className="flex items-center space-x-2">
          {/* AI Summary button */}
          <button
            onClick={handleGenerateSummary}
            disabled={summaryLoading}
            className="flex items-center space-x-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:from-purple-600 hover:to-blue-600 disabled:opacity-50"
          >
            {summaryLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
            <span>AI Summary</span>
          </button>

          {/* Search (email & phone channels) */}
          {(activeChannel === 'email' || activeChannel === 'phone') && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search..."
                className="w-40 text-xs pl-8 pr-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── AI Summary Banner ────────────────────────────────────────────────── */}
      {summaryData && (
        <div className="mx-4 mt-3 p-3 bg-gradient-to-r from-purple-50 via-blue-50 to-indigo-50 border border-purple-100 rounded-xl">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-2 mb-1">
              <Zap className="w-4 h-4 text-purple-500" />
              <span className="text-xs font-semibold text-purple-700">AI Conversation Summary</span>
            </div>
            <button onClick={() => setSummaryData(null)} className="text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">{typeof summaryData === 'string' ? summaryData : summaryData?.summary || JSON.stringify(summaryData)}</p>
        </div>
      )}

      {/* ── Loading State ────────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-panda-primary animate-spin" />
        </div>
      )}

      {/* ── SMS Channel: Chat Bubbles ────────────────────────────────────────── */}
      {!isLoading && activeChannel === 'sms' && (
        <div className="flex flex-col flex-1 min-h-0">
          <div
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto px-4 py-3 space-y-1 [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: 'none' }}
          >
            {smsWithDateGroups.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <MessageCircle className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p className="text-sm font-medium text-gray-500">No SMS messages yet</p>
                <p className="text-xs mt-1">Send the first message below</p>
              </div>
            ) : (
              smsWithDateGroups.map((item, idx) => {
                if (item.type === 'date') {
                  return (
                    <div key={item.key} className="flex justify-center py-3">
                      <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
                        {formatDateSeparator(item.date)}
                      </span>
                    </div>
                  );
                }
                const msg = item.message;
                const isOutbound = (msg.direction || '').toLowerCase() === 'outbound' || (msg.direction || '').toLowerCase() === 'sent';
                // Show timestamp on last message of group or every 5 messages
                const nextItem = smsWithDateGroups[idx + 1];
                const showTs = !nextItem || nextItem.type === 'date' || idx % 5 === 4;
                return (
                  <SmsBubble
                    key={msg.id || idx}
                    message={msg}
                    isOutbound={isOutbound}
                    showTimestamp={showTs}
                  />
                );
              })
            )}
          </div>
          {phone && (
            <ComposeBar
              channel="sms"
              phone={phone}
              email={email}
              contactName={contactName}
              opportunityId={opportunityId}
              onSent={handleMessageSent}
            />
          )}
        </div>
      )}

      {/* ── Email Channel: Thread List + Detail ──────────────────────────────── */}
      {!isLoading && activeChannel === 'email' && (
        <div className="flex flex-1 min-h-0">
          {/* Thread list */}
          <div className={`${selectedEmailThread ? 'hidden md:block md:w-80 md:border-r md:border-gray-200' : 'w-full'} overflow-y-auto [&::-webkit-scrollbar]:hidden`} style={{ scrollbarWidth: 'none' }}>
            {filteredEmailThreads.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <MailOpen className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p className="text-sm font-medium text-gray-500">No email conversations</p>
                <p className="text-xs mt-1">Send the first email below</p>
              </div>
            ) : (
              filteredEmailThreads.map((thread, idx) => (
                <EmailThreadItem
                  key={thread.threadId || idx}
                  thread={thread}
                  isSelected={selectedEmailThread?.threadId === thread.threadId}
                  onClick={() => setSelectedEmailThread(thread)}
                />
              ))
            )}
          </div>

          {/* Thread detail */}
          {selectedEmailThread ? (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Thread header */}
              <div className="flex items-center space-x-3 px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0">
                <button
                  onClick={() => setSelectedEmailThread(null)}
                  className="md:hidden text-gray-400 hover:text-gray-600"
                >
                  <ChevronRight className="w-5 h-5 rotate-180" />
                </button>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">{selectedEmailThread.subject}</h3>
                  <p className="text-xs text-gray-400">{selectedEmailThread.messages.length} message{selectedEmailThread.messages.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
                {selectedEmailThread.messages.map((msg, idx) => (
                  <EmailMessage
                    key={msg.id || idx}
                    message={msg}
                    isLast={idx === selectedEmailThread.messages.length - 1}
                  />
                ))}
              </div>
              {/* Compose */}
              {email && (
                <ComposeBar
                  channel="email"
                  phone={phone}
                  email={email}
                  contactName={contactName}
                  opportunityId={opportunityId}
                  onSent={handleMessageSent}
                />
              )}
            </div>
          ) : (
            /* No thread selected - show compose on mobile */
            <div className="hidden md:flex md:flex-1 items-center justify-center text-gray-400">
              <div className="text-center">
                <Mail className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">Select a thread to view</p>
              </div>
            </div>
          )}

          {/* Compose bar when no thread selected (mobile) */}
          {!selectedEmailThread && email && (
            <div className="md:hidden">
              <ComposeBar
                channel="email"
                phone={phone}
                email={email}
                contactName={contactName}
                opportunityId={opportunityId}
                onSent={handleMessageSent}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Phone Channel: Call Logs ──────────────────────────────────────────── */}
      {!isLoading && activeChannel === 'phone' && (
        <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          {filteredCallLogs.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <PhoneCall className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p className="text-sm font-medium text-gray-500">No call history</p>
              <p className="text-xs mt-1">Call logs from RingCentral will appear here</p>
            </div>
          ) : (
            filteredCallLogs
              .sort((a, b) => new Date(b.startTime || b.createdAt) - new Date(a.startTime || a.createdAt))
              .map((call, idx) => <CallLogItem key={call.id || idx} call={call} />)
          )}
        </div>
      )}

      {/* ── Archive Channel: Legacy Activities ───────────────────────────────── */}
      {!isLoading && showArchiveChannel && showArchive && (
        <div className="flex-1 overflow-y-auto px-4 py-3 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          {archivedActivities.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Archive className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p className="text-sm font-medium text-gray-500">No archived activities</p>
            </div>
          ) : (
            <div className="space-y-2">
              {archivedActivities.map((item, idx) => {
                const content = stripHtml(item.description || item.body || item.content || item.title || '');
                const typeLabel = item.activityType || item.type || 'Activity';
                return (
                  <button
                    key={item.id || idx}
                    onClick={() => onActivityClick?.(item)}
                    className="w-full text-left p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-medium uppercase">{typeLabel}</span>
                      <span className="text-[10px] text-gray-400">{formatTime(item.createdAt || item.occurredAt)}</span>
                    </div>
                    <p className="text-sm text-gray-700 line-clamp-2">{content || 'No content'}</p>
                    {item.createdBy && (
                      <p className="text-[10px] text-gray-400 mt-1">By {item.createdBy.firstName || ''} {item.createdBy.lastName || ''}</p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
