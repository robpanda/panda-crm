import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { opportunitiesApi, companyCamApi, scheduleApi, casesApi, emailsApi, notificationsApi, bamboogliApi, approvalsApi, measurementsApi, contactsApi, ringCentralApi, usersApi, quotesApi, invoicesApi, tasksApi, documentsApi } from '../services/api';
import { useRingCentral } from '../context/RingCentralContext';
import { useAuth } from '../context/AuthContext';
import PhotoGallery from '../components/PhotoGallery';
import CrewAccessManager from '../components/CrewAccessManager';
import InspectionChecklist from '../components/InspectionChecklist';
import ApprovalQueue, { CreateApprovalForm } from '../components/ApprovalQueue';
import DraggableMap from '../components/DraggableMap';
import MilestoneTracker from '../components/MilestoneTracker';
import JobPriority from '../components/JobPriority';
import SpecsPreparation from '../components/SpecsPreparation';
import CommissionsTab from '../components/CommissionsTab';
import TasksTab from '../components/TasksTab';
import ContractSigningModal from '../components/ContractSigningModal';
import ChangeOrderModal from '../components/ChangeOrderModal';
import PayInvoiceModal from '../components/PayInvoiceModal';
import SendInvoiceModal from '../components/SendInvoiceModal';
import SuperTabNav, { SubTabNav, CATEGORIES } from '../components/SuperTabNav';
import PhotoCamTab from '../components/photocam/PhotoCamTab';
import useJobCategories from '../hooks/useJobCategories';
import WorkflowSidebar from '../components/WorkflowSidebar';
import NotesSidebar from '../components/NotesSidebar';
import AddressAutocomplete from '../components/AddressAutocomplete';
import ExpediterChecklist from '../components/ExpediterChecklist';
import {
  Target,
  ArrowLeft,
  Building2,
  Calendar,
  DollarSign,
  Edit,
  Wrench,
  FileText,
  Users,
  Clock,
  ChevronDown,
  ChevronRight,
  Upload,
  Shield,
  CreditCard,
  Pen,
  Link as LinkIcon,
  ShoppingCart,
  Globe,
  Plus,
  X,
  AlertCircle,
  CheckCircle,
  Receipt,
  FileCheck,
  Info,
  MapPin,
  Megaphone,
  Package,
  TrendingUp,
  User,
  Phone,
  Mail,
  CheckSquare,
  Square,
  Camera,
  ClipboardList,
  Settings,
  CalendarDays,
  Image,
  Briefcase,
  AlertTriangle,
  Flag,
  Search,
  Activity,
  Percent,
  MessageSquare,
  FileSignature,
  Tag,
  Bell,
  BellOff,
  Archive,
  Eye,
  Scale,
  XCircle,
  Ruler,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  MailOpen,
  MessageCircle,
  Loader2,
  ClipboardCheck,
  MoreVertical,
  Send,
  ExternalLink,
  Download,
  ZoomIn,
  ChevronLeft,
  Grid,
  Zap,
  UserCircle,
} from 'lucide-react';

// SMS Modal Component with Canned Responses (same as LeadDetail)
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

// Email Modal Component with Canned Responses (same as LeadDetail)
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
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
              placeholder="Type your message or select an email template..."
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

// Invoice Detail Modal Component - Shows invoice details with payment history
function InvoiceDetailModal({ invoice, onClose }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPayments();
  }, [invoice.id]);

  const loadPayments = async () => {
    try {
      const response = await paymentsApi.getPaymentsByInvoice(invoice.id);
      setPayments(response.data || []);
    } catch (err) {
      console.error('Error loading payments:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <Receipt className="w-6 h-6 text-panda-primary" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {invoice.invoiceNumber || `INV-${invoice.id.slice(-6)}`}
              </h2>
              <p className="text-sm text-gray-500">Invoice Details</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Summary Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Invoice Date</p>
              <p className="text-sm font-medium">{formatDate(invoice.invoiceDate)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Due Date</p>
              <p className="text-sm font-medium">{formatDate(invoice.dueDate)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Total Amount</p>
              <p className="text-sm font-medium">{formatCurrency(invoice.totalAmount)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Balance Due</p>
              <p className={`text-sm font-medium ${parseFloat(invoice.balanceDue) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {formatCurrency(invoice.balanceDue)}
              </p>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Status:</span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              invoice.status === 'PAID' ? 'bg-green-100 text-green-800' :
              invoice.status === 'OVERDUE' ? 'bg-red-100 text-red-800' :
              invoice.status === 'SENT' ? 'bg-blue-100 text-blue-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {invoice.status || 'DRAFT'}
            </span>
          </div>

          {/* Line Items */}
          {invoice.lineItems && invoice.lineItems.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-2">Line Items</h3>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-2 text-gray-600">Description</th>
                      <th className="text-right p-2 text-gray-600">Qty</th>
                      <th className="text-right p-2 text-gray-600">Price</th>
                      <th className="text-right p-2 text-gray-600">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.lineItems.map((item, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="p-2">{item.description || item.name}</td>
                        <td className="p-2 text-right">{item.quantity || 1}</td>
                        <td className="p-2 text-right">{formatCurrency(item.unitPrice || item.price)}</td>
                        <td className="p-2 text-right">{formatCurrency(item.totalAmount || item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Payment History */}
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-2">Payment History</h3>
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <div className="w-5 h-5 border-2 border-panda-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : payments.length > 0 ? (
              <div className="space-y-2">
                {payments.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">{payment.paymentNumber || `PMT-${payment.id.slice(-6)}`}</p>
                      <p className="text-xs text-gray-500">
                        {formatDate(payment.paymentDate)} • {payment.paymentMethod || 'Unknown method'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-green-600">{formatCurrency(payment.amount)}</p>
                      <p className="text-xs text-gray-500">{payment.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 py-2">No payments recorded for this invoice.</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t p-4">
          <button
            onClick={onClose}
            className="w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Communications Tab Component - Shows SMS, Email, and Phone call history
function CommunicationsTab({ phone, email, contactName, archivedActivities = [], onActivityClick, opportunityId }) {
  const [filter, setFilter] = useState('all'); // all, sms, email, phone
  const [activeSubTab, setActiveSubTab] = useState('live'); // live, archive
  const [collapsedThreads, setCollapsedThreads] = useState(new Set());
  const [conversationSummary, setConversationSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [showReplyBox, setShowReplyBox] = useState(null); // null or activity id
  const [replyContent, setReplyContent] = useState('');
  const [mentionSearch, setMentionSearch] = useState('');
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [selectedMentions, setSelectedMentions] = useState([]);
  const [mentionCursorPos, setMentionCursorPos] = useState(0);
  const replyInputRef = useRef(null);

  // Fetch users for @mention autocomplete
  const { data: mentionUsers } = useQuery({
    queryKey: ['users-for-mention', mentionSearch],
    queryFn: async () => {
      if (!mentionSearch || mentionSearch.length < 1) return [];
      const result = await usersApi.searchUsers({ query: mentionSearch, limit: 10 });
      return result || [];
    },
    enabled: showMentionDropdown && mentionSearch.length >= 1,
  });

  // Fetch SMS/Email conversation by phone or email
  const { data: conversation, isLoading: conversationLoading } = useQuery({
    queryKey: ['opp-conversation', phone, email],
    queryFn: async () => {
      try {
        const identifier = phone || email;
        if (!identifier) return null;
        const data = await bamboogliApi.getConversationByIdentifier(identifier);
        return data;
      } catch (err) {
        console.error('Failed to fetch conversation:', err);
        return null;
      }
    },
    enabled: !!(phone || email),
  });

  // Fetch messages for the conversation
  const { data: messagesData, isLoading: messagesLoading } = useQuery({
    queryKey: ['opp-messages', conversation?.id],
    queryFn: async () => {
      if (!conversation?.id) return { data: [] };
      const data = await bamboogliApi.getMessagesByConversation(conversation.id, { limit: 100 });
      return data;
    },
    enabled: !!conversation?.id,
  });

  // Fetch RingCentral call logs for this phone number
  const { data: callLogsData, isLoading: callsLoading } = useQuery({
    queryKey: ['opp-call-logs', phone],
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

  const isLoading = conversationLoading || messagesLoading || callsLoading;
  const messages = messagesData?.data || messagesData || [];
  const callLogs = callLogsData?.data || callLogsData || [];

  // Separate messages by type
  const smsMessages = Array.isArray(messages) ? messages.filter(m => m.type === 'sms' || m.channel === 'sms') : [];
  const emailMessages = Array.isArray(messages) ? messages.filter(m => m.type === 'email' || m.channel === 'email') : [];

  // Combine all activity into a unified timeline
  const allActivity = [
    ...smsMessages.map(m => ({
      ...m,
      activityType: 'sms',
      timestamp: new Date(m.createdAt || m.timestamp),
      displayDate: new Date(m.createdAt || m.timestamp).toLocaleString(),
    })),
    ...emailMessages.map(m => ({
      ...m,
      activityType: 'email',
      timestamp: new Date(m.createdAt || m.timestamp),
      displayDate: new Date(m.createdAt || m.timestamp).toLocaleString(),
    })),
    ...(Array.isArray(callLogs) ? callLogs : []).map(c => ({
      ...c,
      activityType: 'phone',
      timestamp: new Date(c.startTime || c.createdAt),
      displayDate: new Date(c.startTime || c.createdAt).toLocaleString(),
    })),
  ].sort((a, b) => b.timestamp - a.timestamp);

  // Filter by type
  const filteredActivity = filter === 'all'
    ? allActivity
    : allActivity.filter(a => a.activityType === filter);

  // Activity counts for summary
  const counts = {
    total: allActivity.length,
    sms: smsMessages.length,
    email: emailMessages.length,
    phone: Array.isArray(callLogs) ? callLogs.length : 0,
  };

  // Count archived activities
  const archiveCount = archivedActivities?.length || 0;

  if (isLoading && activeSubTab === 'live') {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-panda-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sub-tabs: Live / Archive */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveSubTab('live')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeSubTab === 'live'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Live
          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
            activeSubTab === 'live' ? 'bg-panda-primary/10 text-panda-primary' : 'bg-gray-200'
          }`}>
            {counts.total}
          </span>
        </button>
        <button
          onClick={() => setActiveSubTab('archive')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeSubTab === 'archive'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Archive className="w-4 h-4 inline mr-1" />
          Archive
          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
            activeSubTab === 'archive' ? 'bg-amber-100 text-amber-700' : 'bg-gray-200'
          }`}>
            {archiveCount}
          </span>
        </button>
      </div>

      {/* AI Conversation Summary - Shows at top when there's activity */}
      {(counts.total > 0 || archiveCount > 0) && (
        <div className="bg-gradient-to-r from-purple-50 via-blue-50 to-indigo-50 border border-purple-100 rounded-xl p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">AI Conversation Summary</h3>
                <p className="text-xs text-gray-500">{counts.total + archiveCount} total interactions</p>
              </div>
            </div>
            {!conversationSummary && (
              <button
                onClick={async () => {
                  setSummaryLoading(true);
                  try {
                    const result = await opportunitiesApi.summarizeConversation(opportunityId);
                    setConversationSummary(result.summary);
                  } catch (err) {
                    console.error('Failed to generate conversation summary:', err);
                    setConversationSummary('Unable to generate summary. Please try again later.');
                  }
                  setSummaryLoading(false);
                }}
                disabled={summaryLoading}
                className="text-xs px-3 py-1.5 bg-white hover:bg-gray-50 border border-purple-200 rounded-lg text-purple-700 font-medium transition-colors disabled:opacity-50"
              >
                {summaryLoading ? (
                  <span className="flex items-center space-x-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Generating...</span>
                  </span>
                ) : (
                  'Generate Summary'
                )}
              </button>
            )}
          </div>
          {conversationSummary && (
            <div className="mt-3 p-3 bg-white/60 rounded-lg border border-white">
              <p className="text-sm text-gray-700 leading-relaxed">{conversationSummary}</p>
              <button
                onClick={() => setConversationSummary(null)}
                className="mt-2 text-xs text-purple-600 hover:text-purple-700 font-medium"
              >
                Regenerate
              </button>
            </div>
          )}
        </div>
      )}

      {/* Archive Sub-tab Content */}
      {activeSubTab === 'archive' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          {/* Archive AI Summary */}
          {archivedActivities && archivedActivities.length > 3 && (
            <div className="p-4 border-b border-gray-100 bg-amber-50/50">
              <p className="text-xs text-amber-700 font-medium flex items-center">
                <Archive className="w-3 h-3 mr-1" />
                {archivedActivities.length} historical messages imported from AccuLynx
              </p>
            </div>
          )}
          {archivedActivities && archivedActivities.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {archivedActivities.map((item, index) => {
                const isCollapsed = collapsedThreads.has(item.id || index);
                return (
                  <div key={item.id || index}>
                    <div
                      className="p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => onActivityClick && onActivityClick(item)}
                    >
                      <div className="flex items-start space-x-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setCollapsedThreads(prev => {
                              const next = new Set(prev);
                              if (next.has(item.id || index)) {
                                next.delete(item.id || index);
                              } else {
                                next.add(item.id || index);
                              }
                              return next;
                            });
                          }}
                          className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:bg-gray-100 flex-shrink-0 mt-2"
                        >
                          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                          <Archive className="w-5 h-5 text-amber-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <span className="px-2 py-0.5 text-xs font-medium rounded bg-amber-100 text-amber-700">
                                AccuLynx Import
                              </span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className="text-xs text-gray-500">
                                {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '-'}
                              </span>
                              <Eye className="w-3 h-3 text-gray-400" />
                            </div>
                          </div>
                          <div className="mt-1">
                            {item.subject && (
                              <p className="text-sm font-medium text-gray-900">{item.subject}</p>
                            )}
                            {!isCollapsed && item.body && (
                              <p className="text-sm text-gray-600 line-clamp-2 mt-0.5">{item.body}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <Archive className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p className="font-medium">No archived communications</p>
              <p className="text-sm mt-1">Historical messages from AccuLynx will appear here</p>
            </div>
          )}
        </div>
      )}

      {/* Live Sub-tab Content */}
      {activeSubTab === 'live' && (
        <>
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
              <Activity className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{counts.total}</p>
              <p className="text-sm text-gray-500">Total</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <PhoneCall className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{counts.phone}</p>
              <p className="text-sm text-gray-500">Phone</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{counts.sms}</p>
              <p className="text-sm text-gray-500">SMS</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <MailOpen className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{counts.email}</p>
              <p className="text-sm text-gray-500">Email</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Buttons */}
      <div className="flex space-x-2">
        {[
          { id: 'all', label: 'All Activity', icon: Activity },
          { id: 'phone', label: 'Phone', icon: PhoneCall },
          { id: 'sms', label: 'SMS', icon: MessageCircle },
          { id: 'email', label: 'Email', icon: MailOpen },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all ${
              filter === f.id
                ? 'bg-panda-primary text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <f.icon className="w-4 h-4" />
            <span>{f.label}</span>
            {f.id !== 'all' && (
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                filter === f.id ? 'bg-white/20' : 'bg-gray-200'
              }`}>
                {counts[f.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Activity Timeline */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        {filteredActivity.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {filteredActivity.map((item, index) => {
              const isCollapsed = collapsedThreads.has(item.id || `live-${index}`);
              const isReplyOpen = showReplyBox === (item.id || `live-${index}`);

              return (
                <div key={item.id || index} className="group">
                  <div className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start space-x-3">
                      {/* Collapse Toggle */}
                      <button
                        onClick={() => {
                          setCollapsedThreads(prev => {
                            const next = new Set(prev);
                            const key = item.id || `live-${index}`;
                            if (next.has(key)) {
                              next.delete(key);
                            } else {
                              next.add(key);
                            }
                            return next;
                          });
                        }}
                        className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:bg-gray-100 flex-shrink-0 mt-2"
                      >
                        {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>

                      {/* Icon */}
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        item.activityType === 'phone'
                          ? item.direction === 'Inbound'
                            ? 'bg-green-100'
                            : item.result === 'Missed' || item.result === 'No Answer'
                              ? 'bg-red-100'
                              : 'bg-blue-100'
                          : item.activityType === 'sms'
                            ? 'bg-green-100'
                            : 'bg-purple-100'
                      }`}>
                        {item.activityType === 'phone' && (
                          item.direction === 'Inbound'
                            ? <PhoneIncoming className="w-5 h-5 text-green-600" />
                            : item.result === 'Missed' || item.result === 'No Answer'
                              ? <PhoneMissed className="w-5 h-5 text-red-600" />
                              : <PhoneOutgoing className="w-5 h-5 text-blue-600" />
                        )}
                        {item.activityType === 'sms' && <MessageCircle className="w-5 h-5 text-green-600" />}
                        {item.activityType === 'email' && <MailOpen className="w-5 h-5 text-purple-600" />}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                              item.activityType === 'phone' ? 'bg-blue-100 text-blue-700' :
                              item.activityType === 'sms' ? 'bg-green-100 text-green-700' :
                              'bg-purple-100 text-purple-700'
                            }`}>
                              {item.activityType === 'phone' ? 'Phone' :
                               item.activityType === 'sms' ? 'SMS' : 'Email'}
                            </span>
                            {item.activityType === 'phone' && (
                              <span className={`px-2 py-0.5 text-xs rounded ${
                                item.direction === 'Inbound' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-600'
                              }`}>
                                {item.direction || 'Outbound'}
                              </span>
                            )}
                            {item.activityType !== 'phone' && (
                              <span className={`px-2 py-0.5 text-xs rounded ${
                                item.direction === 'inbound' || item.direction === 'received'
                                  ? 'bg-green-50 text-green-600'
                                  : 'bg-gray-100 text-gray-600'
                              }`}>
                                {item.direction === 'inbound' || item.direction === 'received' ? 'Received' : 'Sent'}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-gray-500">{item.displayDate}</span>
                            {/* Reply button - visible on hover */}
                            <button
                              onClick={() => {
                                setShowReplyBox(isReplyOpen ? null : (item.id || `live-${index}`));
                                setReplyContent('');
                                setSelectedMentions([]);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded transition-all"
                              title="Reply"
                            >
                              <MessageSquare className="w-4 h-4 text-gray-500" />
                            </button>
                          </div>
                        </div>

                        {/* Message Content - Collapsible */}
                        {!isCollapsed && (
                          <>
                            {item.activityType === 'phone' ? (
                              <div className="mt-1">
                                <p className="text-sm text-gray-900">
                                  {item.direction === 'Inbound' ? 'Incoming call' : 'Outgoing call'}
                                  {item.result && ` - ${item.result}`}
                                </p>
                                {item.duration && (
                                  <p className="text-xs text-gray-500 mt-0.5">
                                    Duration: {Math.floor(item.duration / 60)}m {item.duration % 60}s
                                  </p>
                                )}
                              </div>
                            ) : (
                              <div className="mt-1">
                                {item.subject && (
                                  <p className="text-sm font-medium text-gray-900">{item.subject}</p>
                                )}
                                {(item.body || item.content || item.text) && (
                                  <p className="text-sm text-gray-600 whitespace-pre-wrap">
                                    {item.body || item.content || item.text}
                                  </p>
                                )}
                              </div>
                            )}
                          </>
                        )}

                        {/* Reply Box with @mention support */}
                        {isReplyOpen && (
                          <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                            <div className="relative">
                              {/* Selected mentions */}
                              {selectedMentions.length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-2">
                                  {selectedMentions.map((mention, i) => (
                                    <span
                                      key={i}
                                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700"
                                    >
                                      @{mention.name}
                                      <button
                                        onClick={() => setSelectedMentions(prev => prev.filter((_, idx) => idx !== i))}
                                        className="ml-1 hover:text-blue-900"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              )}

                              <textarea
                                ref={replyInputRef}
                                value={replyContent}
                                onChange={(e) => {
                                  setReplyContent(e.target.value);
                                  // Check for @mention trigger
                                  const cursorPos = e.target.selectionStart;
                                  const textBeforeCursor = e.target.value.slice(0, cursorPos);
                                  const atMatch = textBeforeCursor.match(/@(\w*)$/);
                                  if (atMatch) {
                                    setShowMentionDropdown(true);
                                    setMentionSearch(atMatch[1]);
                                    setMentionCursorPos(cursorPos);
                                  } else {
                                    setShowMentionDropdown(false);
                                    setMentionSearch('');
                                  }
                                }}
                                placeholder={`Reply to this ${item.activityType}... Use @ to mention someone`}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none resize-none text-sm"
                                rows={2}
                              />

                              {/* @mention dropdown */}
                              {showMentionDropdown && mentionUsers && mentionUsers.length > 0 && (
                                <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
                                  {mentionUsers.map((user) => (
                                    <button
                                      key={user.id}
                                      onClick={() => {
                                        // Add mention and update text
                                        const userName = `${user.firstName} ${user.lastName}`;
                                        setSelectedMentions(prev => [...prev, { userId: user.id, name: userName }]);
                                        // Replace @query with empty and close dropdown
                                        const textBeforeMention = replyContent.slice(0, mentionCursorPos).replace(/@\w*$/, '');
                                        const textAfterMention = replyContent.slice(mentionCursorPos);
                                        setReplyContent(textBeforeMention + textAfterMention);
                                        setShowMentionDropdown(false);
                                        setMentionSearch('');
                                        replyInputRef.current?.focus();
                                      }}
                                      className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center space-x-2 text-sm"
                                    >
                                      <div className="w-6 h-6 rounded-full bg-panda-primary/20 flex items-center justify-center text-xs font-medium text-panda-primary">
                                        {user.firstName?.[0]}{user.lastName?.[0]}
                                      </div>
                                      <span>{user.firstName} {user.lastName}</span>
                                      <span className="text-xs text-gray-400">{user.email}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center justify-between mt-2">
                              <div className="text-xs text-gray-500">
                                {selectedMentions.length > 0 && (
                                  <span className="flex items-center">
                                    <Bell className="w-3 h-3 mr-1" />
                                    {selectedMentions.length} user(s) will be notified
                                  </span>
                                )}
                              </div>
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => {
                                    setShowReplyBox(null);
                                    setReplyContent('');
                                    setSelectedMentions([]);
                                  }}
                                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={async () => {
                                    if (!replyContent.trim() && selectedMentions.length === 0) return;
                                    try {
                                      await opportunitiesApi.addReply(opportunityId, {
                                        content: replyContent,
                                        parentId: item.id,
                                        mentions: selectedMentions,
                                        channel: item.activityType,
                                      });
                                      setShowReplyBox(null);
                                      setReplyContent('');
                                      setSelectedMentions([]);
                                      // Could refresh conversation here
                                    } catch (err) {
                                      console.error('Failed to send reply:', err);
                                    }
                                  }}
                                  disabled={!replyContent.trim() && selectedMentions.length === 0}
                                  className="px-3 py-1.5 text-sm bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1"
                                >
                                  <Send className="w-3 h-3" />
                                  <span>Send Reply</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            <Activity className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p className="font-medium">No communication history found</p>
            <p className="text-sm mt-1">
              {!phone && !email
                ? 'No phone or email available for this contact'
                : 'No SMS, Email, or Phone interactions recorded'}
            </p>
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
}

// Activity Timeline Tab - Collapsible chronological timeline for notes, tasks, events
function ActivityTimelineTab({ activities = [], onActivityClick }) {
  const [collapsedItems, setCollapsedItems] = useState(new Set());
  const [filter, setFilter] = useState('all'); // all, note, task, event

  // Toggle collapse state
  const toggleCollapse = (itemId) => {
    setCollapsedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  // Organize activities by type
  const counts = {
    total: activities.length,
    note: activities.filter(a => a.type?.toLowerCase() === 'note' || a.activityType === 'NOTE_ADDED').length,
    task: activities.filter(a => a.type?.toLowerCase() === 'task' || a.activityType === 'TASK').length,
    event: activities.filter(a => a.type?.toLowerCase() === 'event' || a.activityType === 'EVENT').length,
  };

  // Filter activities
  const filteredActivities = filter === 'all'
    ? activities
    : activities.filter(a => {
        const type = a.type?.toLowerCase() || a.activityType?.toLowerCase() || '';
        if (filter === 'note') return type === 'note' || type === 'note_added';
        if (filter === 'task') return type === 'task';
        if (filter === 'event') return type === 'event';
        return true;
      });

  // Sort by date (newest first)
  const sortedActivities = [...filteredActivities].sort((a, b) => {
    const dateA = new Date(a.createdAt || a.occurredAt || a.dueDate || 0);
    const dateB = new Date(b.createdAt || b.occurredAt || b.dueDate || 0);
    return dateB - dateA;
  });

  // Get icon and color for activity type
  const getActivityStyle = (activity) => {
    const type = activity.type?.toLowerCase() || activity.activityType?.toLowerCase() || '';
    if (type === 'note' || type === 'note_added') {
      return { icon: FileText, bgColor: 'bg-blue-100', iconColor: 'text-blue-600', label: 'Note' };
    }
    if (type === 'task') {
      return { icon: CheckSquare, bgColor: 'bg-yellow-100', iconColor: 'text-yellow-600', label: 'Task' };
    }
    if (type === 'event') {
      return { icon: Calendar, bgColor: 'bg-purple-100', iconColor: 'text-purple-600', label: 'Event' };
    }
    // Default for other types
    return { icon: Activity, bgColor: 'bg-gray-100', iconColor: 'text-gray-600', label: 'Activity' };
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
              <Activity className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{counts.total}</p>
              <p className="text-sm text-gray-500">Total</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{counts.note}</p>
              <p className="text-sm text-gray-500">Notes</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
              <CheckSquare className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{counts.task}</p>
              <p className="text-sm text-gray-500">Tasks</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{counts.event}</p>
              <p className="text-sm text-gray-500">Events</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Buttons */}
      <div className="flex space-x-2">
        {[
          { id: 'all', label: 'All Activity', icon: Activity },
          { id: 'note', label: 'Notes', icon: FileText },
          { id: 'task', label: 'Tasks', icon: CheckSquare },
          { id: 'event', label: 'Events', icon: Calendar },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all ${
              filter === f.id
                ? 'bg-panda-primary text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <f.icon className="w-4 h-4" />
            <span>{f.label}</span>
            {f.id !== 'all' && (
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                filter === f.id ? 'bg-white/20' : 'bg-gray-200'
              }`}>
                {counts[f.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Activity Timeline */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        {sortedActivities.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {sortedActivities.map((item, index) => {
              const itemKey = item.id || `activity-${index}`;
              const isCollapsed = collapsedItems.has(itemKey);
              const style = getActivityStyle(item);
              const IconComponent = style.icon;
              const displayDate = new Date(item.createdAt || item.occurredAt || item.dueDate).toLocaleString();
              const userName = item.user
                ? `${item.user.firstName || ''} ${item.user.lastName || ''}`.trim()
                : item.externalName || item.userName || 'System';

              return (
                <div key={itemKey} className="group">
                  <div className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start space-x-3">
                      {/* Collapse Toggle */}
                      <button
                        onClick={() => toggleCollapse(itemKey)}
                        className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:bg-gray-100 flex-shrink-0 mt-2"
                      >
                        {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>

                      {/* Icon */}
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${style.bgColor}`}>
                        <IconComponent className={`w-5 h-5 ${style.iconColor}`} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-0.5 text-xs font-medium rounded ${style.bgColor} ${style.iconColor}`}>
                              {style.label}
                            </span>
                            <span className="text-sm font-medium text-gray-900 truncate">
                              {item.subject || item.title || 'Activity'}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-gray-500">{displayDate}</span>
                            {/* View button - visible on hover */}
                            <button
                              onClick={() => onActivityClick?.(item)}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded transition-all"
                              title="View Details"
                            >
                              <Eye className="w-4 h-4 text-gray-500" />
                            </button>
                          </div>
                        </div>

                        {/* User info */}
                        <div className="mt-1 flex items-center space-x-2 text-xs text-gray-500">
                          <UserCircle className="w-3 h-3" />
                          <span>{userName}</span>
                        </div>

                        {/* Body Content - Collapsible */}
                        {!isCollapsed && (
                          <div className="mt-2">
                            {(item.description || item.body || item.content) && (
                              <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-4">
                                {item.description || item.body || item.content}
                              </p>
                            )}
                            {/* Task-specific info */}
                            {(item.type?.toLowerCase() === 'task' || item.activityType === 'TASK') && (
                              <div className="mt-2 flex items-center space-x-4 text-xs">
                                {item.status && (
                                  <span className={`px-2 py-0.5 rounded ${
                                    item.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                                    item.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                                    'bg-gray-100 text-gray-600'
                                  }`}>
                                    {item.status}
                                  </span>
                                )}
                                {item.dueDate && (
                                  <span className="text-gray-500">
                                    Due: {new Date(item.dueDate).toLocaleDateString()}
                                  </span>
                                )}
                                {item.priority && (
                                  <span className={`px-2 py-0.5 rounded ${
                                    item.priority === 'HIGH' ? 'bg-red-100 text-red-700' :
                                    item.priority === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' :
                                    'bg-gray-100 text-gray-600'
                                  }`}>
                                    {item.priority}
                                  </span>
                                )}
                              </div>
                            )}
                            {/* Event-specific info */}
                            {(item.type?.toLowerCase() === 'event' || item.activityType === 'EVENT') && (
                              <div className="mt-2 flex items-center space-x-4 text-xs text-gray-500">
                                {item.startDateTime && (
                                  <span>
                                    Start: {new Date(item.startDateTime).toLocaleString()}
                                  </span>
                                )}
                                {item.endDateTime && (
                                  <span>
                                    End: {new Date(item.endDateTime).toLocaleString()}
                                  </span>
                                )}
                                {item.location && (
                                  <span className="flex items-center">
                                    <MapPin className="w-3 h-3 mr-1" />
                                    {item.location}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            <Activity className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p className="font-medium">No activity found</p>
            <p className="text-sm mt-1">Notes, tasks, and events will appear here</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OpportunityDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { loadWidget, initiateCall, rcLoggedIn } = useRingCentral();
  const { user: currentUser } = useAuth();

  // Category-based navigation (replaces flat 16-tab system)
  const {
    activeCategory,
    activeSubTab,
    legacyTabId,
    showDetails,
    toggleDetails,
    changeCategory,
    changeSubTab,
    navigateToTab,
    calculateBadgeCounts,
    calculateSubTabCounts,
  } = useJobCategories('schedule');

  // For backward compatibility with existing tab content
  const activeTab = legacyTabId;
  const setActiveTab = navigateToTab;

  const [showQuickActionModal, setShowQuickActionModal] = useState(false);
  const [activeQuickAction, setActiveQuickAction] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [showSpecsPreparation, setShowSpecsPreparation] = useState(false);

  // Sidebar accordion states (now handled by WorkflowSidebar component)
  // const [expandedSections, setExpandedSections] = useState({
  //   onboarding: true,
  //   expediting: false,
  //   audit: false,
  //   dates: false,
  //   photos: false,
  // });

  // Product search
  const [productSearch, setProductSearch] = useState('');
  const [selectedProducts, setSelectedProducts] = useState([]);

  // Crew selection state
  const [showCrewModal, setShowCrewModal] = useState(false);
  const [selectedAppointmentForCrew, setSelectedAppointmentForCrew] = useState(null);
  const [selectedAppointmentDetail, setSelectedAppointmentDetail] = useState(null);
  const [showAppointmentDetailModal, setShowAppointmentDetailModal] = useState(false);
  const [selectedCrewId, setSelectedCrewId] = useState('');

  // Activity detail modal state
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [activitySummary, setActivitySummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Actions dropdown state
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const actionsMenuRef = useRef(null);

  // SMS and Email modal states
  const [showSmsModal, setShowSmsModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);

  // Document gallery state
  const [showDocumentGallery, setShowDocumentGallery] = useState(false);
  const [selectedDocumentIndex, setSelectedDocumentIndex] = useState(0);

  // Contract signing modal state
  const [showContractSigningModal, setShowContractSigningModal] = useState(false);

  // Change order modal state
  const [showChangeOrderModal, setShowChangeOrderModal] = useState(false);

  // Pay invoice modal state
  const [showPayInvoiceModal, setShowPayInvoiceModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  // Send invoice modal state
  const [showSendInvoiceModal, setShowSendInvoiceModal] = useState(false);
  const [invoiceToSend, setInvoiceToSend] = useState(null);

  // Create insurance invoice modal state
  const [showCreateInsuranceInvoiceModal, setShowCreateInsuranceInvoiceModal] = useState(false);

  // Invoice detail modal state
  const [showInvoiceDetailModal, setShowInvoiceDetailModal] = useState(false);

  // Documents sub-tab state (contracts vs photos)
  const [documentsSubTab, setDocumentsSubTab] = useState('contracts');

  // Details sub-tab state (status vs measurements)
  const [detailsSubTab, setDetailsSubTab] = useState('status');

  // Close actions menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target)) {
        setShowActionsMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Claim information editing state
  const [isEditingClaim, setIsEditingClaim] = useState(false);
  const [claimForm, setClaimForm] = useState({
    insuranceCarrier: '',
    claimNumber: '',
    dateOfLoss: '',
    claimFiledDate: '',
    damageLocation: '',
  });

  // Inline edit mode for job details
  const [isEditMode, setIsEditMode] = useState(false);
  const [editForm, setEditForm] = useState({
    stage: '',
    status: '',
    disposition: '',
    workType: '',
    leadSource: '',
    leadCreditor: '',
    amount: '',
    street: '',
    city: '',
    state: '',
    postalCode: '',
  });

  const { data: opportunity, isLoading } = useQuery({
    queryKey: ['opportunity', id],
    queryFn: () => opportunitiesApi.getOpportunity(id),
    enabled: !!id,
  });

  const { data: workOrders } = useQuery({
    queryKey: ['opportunityWorkOrders', id],
    queryFn: () => opportunitiesApi.getWorkOrders(id),
    enabled: !!id,
  });

  const { data: quotes } = useQuery({
    queryKey: ['opportunityQuotes', id],
    queryFn: () => opportunitiesApi.getQuotes(id),
    enabled: !!id,
  });

  const { data: contacts } = useQuery({
    queryKey: ['opportunityContacts', id],
    queryFn: () => opportunitiesApi.getContacts(id),
    enabled: !!id,
  });

  // Hub API Queries
  const { data: summary } = useQuery({
    queryKey: ['opportunitySummary', id],
    queryFn: () => opportunitiesApi.getSummary(id),
    enabled: !!id,
  });

  const { data: appointments } = useQuery({
    queryKey: ['opportunityAppointments', id],
    queryFn: () => opportunitiesApi.getAppointments(id),
    enabled: !!id,
  });

  const { data: contract } = useQuery({
    queryKey: ['opportunityContract', id],
    queryFn: () => opportunitiesApi.getContract(id),
    enabled: !!id,
  });

  const { data: invoicesData } = useQuery({
    queryKey: ['opportunityInvoices', id],
    queryFn: () => opportunitiesApi.getInvoices(id),
    enabled: !!id,
  });
  // Extract invoices array from the response structure
  const invoices = invoicesData?.invoices || [];
  const invoicesSummary = invoicesData?.summary;

  // Payments for opportunity
  const { data: paymentsData } = useQuery({
    queryKey: ['opportunityPayments', id],
    queryFn: () => paymentsApi.getPayments({ opportunityId: id }),
    enabled: !!id,
  });
  const payments = paymentsData?.data?.payments || paymentsData?.payments || [];

  const { data: commissionsData } = useQuery({
    queryKey: ['opportunityCommissions', id],
    queryFn: () => opportunitiesApi.getCommissions(id),
    enabled: !!id,
  });
  // Extract commissions array from the response structure
  const commissions = commissionsData?.commissions || commissionsData;

  // Tasks for opportunity
  const { data: tasksData, refetch: refetchTasks } = useQuery({
    queryKey: ['opportunityTasks', id],
    queryFn: () => tasksApi.getOpportunityTasks(id),
    enabled: !!id,
    retry: 1,
  });
  const tasks = tasksData?.tasks || [];

  // Users for dropdown (used in TasksTab for task assignment)
  const { data: usersForDropdown } = useQuery({
    queryKey: ['usersDropdown'],
    queryFn: () => usersApi.getUsersForDropdown(),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
  const users = usersForDropdown || [];

  const { data: activityData } = useQuery({
    queryKey: ['opportunityActivity', id],
    queryFn: () => opportunitiesApi.getActivity(id),
    enabled: !!id,
  });

  const { data: documents } = useQuery({
    queryKey: ['opportunityDocuments', id],
    queryFn: () => opportunitiesApi.getDocuments(id),
    enabled: !!id,
  });

  // Repository files (misc documents uploaded to the job)
  const { data: repositoryFiles } = useQuery({
    queryKey: ['opportunityRepositoryFiles', id],
    queryFn: () => documentsApi.getDocumentsByJob(id),
    enabled: !!id,
  });

  // Cases (linked via Account) - service not yet deployed, disable retries
  const { data: cases } = useQuery({
    queryKey: ['opportunityCases', id],
    queryFn: () => casesApi.getCasesByOpportunity(id),
    enabled: !!id,
    retry: false,
    staleTime: Infinity,
  });

  // Emails (linked to Contact/Opportunity) - service not yet deployed, disable retries
  const { data: emails } = useQuery({
    queryKey: ['opportunityEmails', id],
    queryFn: () => emailsApi.getEmailsByOpportunity(id),
    enabled: !!id,
    retry: false,
    staleTime: Infinity,
  });

  // Notifications (for this opportunity) - service not yet deployed, disable retries
  const { data: notifications } = useQuery({
    queryKey: ['opportunityNotifications', id],
    queryFn: () => notificationsApi.getNotificationsByOpportunity(id),
    enabled: !!id,
    retry: false,
    staleTime: Infinity,
  });

  // Bamboogli conversations (SMS + Email) for this opportunity
  const { data: conversations } = useQuery({
    queryKey: ['opportunityConversations', id],
    queryFn: () => bamboogliApi.getConversationsByOpportunity(id),
    enabled: !!id,
    retry: false,
    staleTime: Infinity,
  });

  // CompanyCam photos - service not yet deployed, disable retries
  const { data: photos } = useQuery({
    queryKey: ['opportunityPhotos', id],
    queryFn: () => companyCamApi.getOpportunityPhotos(id),
    enabled: !!id,
    retry: false,
    staleTime: Infinity,
  });

  // Measurement reports - all reports including pending
  const { data: measurementReportsData, refetch: refetchMeasurements } = useQuery({
    queryKey: ['opportunityMeasurements', id],
    queryFn: () => measurementsApi.getOpportunityReports(id),
    enabled: !!id,
    retry: 1,
    staleTime: 30000, // Refresh every 30 seconds to check for pending report updates
  });
  const measurementReports = measurementReportsData?.data || [];

  // Update opportunity mutation
  const updateMutation = useMutation({
    mutationFn: (data) => opportunitiesApi.updateOpportunity(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunity', id]);
      setActionSuccess('Job updated successfully');
      setTimeout(() => setActionSuccess(null), 3000);
    },
    onError: (error) => {
      setActionError(error.message || 'Failed to update job');
    },
  });

  // Initialize claim form when opportunity data loads
  useEffect(() => {
    if (opportunity) {
      setClaimForm({
        insuranceCarrier: opportunity.insuranceCarrier || '',
        claimNumber: opportunity.claimNumber || '',
        dateOfLoss: opportunity.dateOfLoss ? new Date(opportunity.dateOfLoss).toISOString().split('T')[0] : '',
        claimFiledDate: opportunity.claimFiledDate ? new Date(opportunity.claimFiledDate).toISOString().split('T')[0] : '',
        damageLocation: opportunity.damageLocation || '',
      });
    }
  }, [opportunity]);

  // Initialize edit form when entering edit mode
  const enterEditMode = useCallback(() => {
    if (opportunity) {
      setEditForm({
        stage: opportunity.stage || '',
        status: opportunity.status || '',
        disposition: opportunity.disposition || '',
        workType: opportunity.workType || '',
        leadSource: opportunity.leadSource || '',
        leadCreditor: opportunity.leadCreditor || '',
        amount: opportunity.amount || '',
        street: opportunity.street || '',
        city: opportunity.city || '',
        state: opportunity.state || '',
        postalCode: opportunity.postalCode || '',
      });
      setIsEditMode(true);
    }
  }, [opportunity]);

  // Cancel edit mode
  const cancelEditMode = useCallback(() => {
    setIsEditMode(false);
    // Reset form to original values
    if (opportunity) {
      setEditForm({
        stage: opportunity.stage || '',
        status: opportunity.status || '',
        disposition: opportunity.disposition || '',
        workType: opportunity.workType || '',
        leadSource: opportunity.leadSource || '',
        leadCreditor: opportunity.leadCreditor || '',
        amount: opportunity.amount || '',
        street: opportunity.street || '',
        city: opportunity.city || '',
        state: opportunity.state || '',
        postalCode: opportunity.postalCode || '',
      });
    }
  }, [opportunity]);

  // Save edited job details
  const handleEditSave = async () => {
    const updateData = {
      stage: editForm.stage || null,
      status: editForm.status || null,
      disposition: editForm.disposition || null,
      workType: editForm.workType || null,
      leadSource: editForm.leadSource || null,
      leadCreditor: editForm.leadCreditor || null,
      amount: editForm.amount ? parseFloat(editForm.amount) : null,
      street: editForm.street || null,
      city: editForm.city || null,
      state: editForm.state || null,
      postalCode: editForm.postalCode || null,
    };
    updateMutation.mutate(updateData, {
      onSuccess: () => {
        setIsEditMode(false);
      },
    });
  };

  // Handle claim information save
  const handleClaimSave = async (e) => {
    e.preventDefault();
    const updateData = {
      insuranceCarrier: claimForm.insuranceCarrier || null,
      claimNumber: claimForm.claimNumber || null,
      dateOfLoss: claimForm.dateOfLoss ? new Date(claimForm.dateOfLoss).toISOString() : null,
      claimFiledDate: claimForm.claimFiledDate ? new Date(claimForm.claimFiledDate).toISOString() : null,
      damageLocation: claimForm.damageLocation || null,
    };
    updateMutation.mutate(updateData);
    setIsEditingClaim(false);
  };

  // Work Order mutations
  const createWorkOrderMutation = useMutation({
    mutationFn: (data) => scheduleApi.createWorkOrder({ ...data, opportunityId: id }),
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunityWorkOrders', id]);
      setActionSuccess('Work order created successfully');
      setShowQuickActionModal(false);
      setWorkOrderForm({ subject: '', workTypeId: '', description: '', priority: 'MEDIUM', scheduledStartDate: '' });
      setTimeout(() => setActionSuccess(null), 3000);
    },
    onError: (error) => {
      setActionError(error.message || 'Failed to create work order');
    },
  });

  const updateWorkOrderMutation = useMutation({
    mutationFn: ({ workOrderId, data }) => scheduleApi.updateWorkOrder(workOrderId, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunityWorkOrders', id]);
      setActionSuccess('Work order updated successfully');
      setShowQuickActionModal(false);
      setTimeout(() => setActionSuccess(null), 3000);
    },
    onError: (error) => {
      setActionError(error.message || 'Failed to update work order');
    },
  });

  const createAppointmentMutation = useMutation({
    mutationFn: (data) => scheduleApi.createServiceAppointment(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunityWorkOrders', id]);
      setActionSuccess('Appointment scheduled successfully');
      setShowQuickActionModal(false);
      setAppointmentForm({ scheduledStart: '', scheduledEnd: '', status: 'SCHEDULED', workTypeId: '' });
      setTimeout(() => setActionSuccess(null), 3000);
    },
    onError: (error) => {
      setActionError(error.message || 'Failed to create appointment');
    },
  });

  // Combined mutation: use existing work order or create new one, then add appointment
  const scheduleAppointmentMutation = useMutation({
    mutationFn: async (data) => {
      let workOrderId = data.existingWorkOrderId;
      let workOrderIsDraft = false;
      let workOrderDraftReasons = [];

      // Helper to convert datetime-local format to ISO 8601
      const toISOString = (dateStr) => {
        if (!dateStr) return undefined;
        // datetime-local gives "2026-01-03T19:00", need to add seconds and timezone
        const date = new Date(dateStr);
        return date.toISOString();
      };

      // If no existing work order, create one (will create as DRAFT if data is incomplete)
      if (!workOrderId) {
        // accountId is required by the work order API
        const accountId = opportunity?.accountId || opportunity?.account?.id;
        if (!accountId) {
          throw new Error('Account ID is required to create a work order');
        }

        const workOrderResponse = await scheduleApi.createWorkOrder({
          accountId,
          opportunityId: id,
          subject: data.workType || 'Service Appointment',
          workTypeId: data.workTypeId || undefined,
          priority: 'NORMAL',
        });

        workOrderId = workOrderResponse?.data?.id || workOrderResponse?.id;
        workOrderIsDraft = workOrderResponse?.data?.isDraft || workOrderResponse?.isDraft || false;
        workOrderDraftReasons = workOrderResponse?.data?.draftReasons || workOrderResponse?.draftReasons || [];

        if (!workOrderId) {
          throw new Error('Failed to create work order');
        }
      } else {
        // Update existing work order with new work type if provided
        if (data.workTypeId) {
          await scheduleApi.updateWorkOrder(workOrderId, {
            workTypeId: data.workTypeId,
            subject: data.workType || undefined,
          });
        }
      }

      // Create the appointment linked to the work order
      const appointmentResult = await scheduleApi.createServiceAppointment({
        workOrderId,
        earliestStart: toISOString(data.earliestStart),
        dueDate: toISOString(data.dueDate),
        scheduledStart: toISOString(data.scheduledStart),
        scheduledEnd: toISOString(data.scheduledEnd),
        status: 'SCHEDULED',
      });

      // Return with work order draft info for the success handler
      return {
        ...appointmentResult,
        workOrderIsDraft,
        workOrderDraftReasons
      };
    },
    onSuccess: async (result) => {
      // Force immediate refetch of all related data
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['opportunityWorkOrders', id] }),
        queryClient.refetchQueries({ queryKey: ['opportunityAppointments', id] }),
        queryClient.refetchQueries({ queryKey: ['opportunity', id] }),
        queryClient.refetchQueries({ queryKey: ['opportunitySummary', id] }),
      ]);

      // Show appropriate message based on draft status
      if (result?.workOrderIsDraft) {
        const reasons = result.workOrderDraftReasons?.join(', ') || 'incomplete data';
        setActionSuccess(`Appointment scheduled. Work order created as DRAFT (${reasons})`);
      } else {
        setActionSuccess('Appointment scheduled successfully');
      }

      setShowQuickActionModal(false);
      setAppointmentForm({ earliestStart: '', dueDate: '', scheduledStart: '', scheduledEnd: '', status: 'SCHEDULED', workTypeId: '' });
      setTimeout(() => setActionSuccess(null), 5000); // Longer timeout for draft messages
    },
    onError: (error) => {
      setActionError(error.message || 'Failed to schedule appointment');
    },
  });

  // Crew query for assignment
  const { data: crews = [] } = useQuery({
    queryKey: ['crews'],
    queryFn: () => scheduleApi.getResources({ resourceType: 'CREW' }),
    enabled: showCrewModal,
  });

  // Assign crew mutation
  const assignCrewMutation = useMutation({
    mutationFn: ({ appointmentId, resourceId }) => scheduleApi.assignResource(appointmentId, resourceId, true),
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunityAppointments', id]);
      setActionSuccess('Crew assigned successfully');
      setShowCrewModal(false);
      setSelectedAppointmentForCrew(null);
      setSelectedCrewId('');
      setTimeout(() => setActionSuccess(null), 3000);
    },
    onError: (error) => {
      setActionError(error.message || 'Failed to assign crew');
    },
  });

  // Update appointment mutation
  const updateAppointmentMutation = useMutation({
    mutationFn: async ({ appointmentId, data }) => {
      // Helper to convert datetime-local format to ISO 8601
      const toISOString = (dateStr) => {
        if (!dateStr) return undefined;
        const date = new Date(dateStr);
        return date.toISOString();
      };

      return scheduleApi.updateServiceAppointment(appointmentId, {
        ...data,
        earliestStart: toISOString(data.earliestStart),
        dueDate: toISOString(data.dueDate),
        scheduledStart: toISOString(data.scheduledStart),
        scheduledEnd: toISOString(data.scheduledEnd),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunityAppointments', id]);
      queryClient.invalidateQueries(['opportunityWorkOrders', id]);
      setActionSuccess('Appointment updated successfully');
      setShowQuickActionModal(false);
      setActiveQuickAction(null);
      setAppointmentForm({ earliestStart: '', dueDate: '', scheduledStart: '', scheduledEnd: '', status: 'SCHEDULED', workTypeId: '' });
      setTimeout(() => setActionSuccess(null), 3000);
    },
    onError: (error) => {
      setActionError(error.message || 'Failed to update appointment');
    },
  });

  // Delete appointment mutation
  const deleteAppointmentMutation = useMutation({
    mutationFn: (appointmentId) => scheduleApi.deleteServiceAppointment(appointmentId),
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunityAppointments', id]);
      queryClient.invalidateQueries(['opportunityWorkOrders', id]);
      setActionSuccess('Appointment deleted successfully');
      setTimeout(() => setActionSuccess(null), 3000);
    },
    onError: (error) => {
      setActionError(error.message || 'Failed to delete appointment');
    },
  });

  // Work order form state
  const [workOrderForm, setWorkOrderForm] = useState({
    subject: '',
    workTypeId: '',
    description: '',
    priority: 'MEDIUM',
    scheduledStartDate: '',
  });

  // Appointment form state
  const [appointmentForm, setAppointmentForm] = useState({
    earliestStart: '',
    dueDate: '',
    scheduledStart: '',
    scheduledEnd: '',
    status: 'SCHEDULED',
    workTypeId: '',
  });

  // Case form state
  const [caseForm, setCaseForm] = useState({
    subject: '',
    description: '',
    priority: 'NORMAL',
    type: '',
  });

  // Case mutations
  const createCaseMutation = useMutation({
    mutationFn: (data) => casesApi.createCase({ ...data, opportunityId: id }),
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunityCases', id]);
      setActionSuccess('Case created successfully');
      setShowQuickActionModal(false);
      setCaseForm({ subject: '', description: '', priority: 'NORMAL', type: '' });
      setTimeout(() => setActionSuccess(null), 3000);
    },
    onError: (error) => {
      setActionError(error.message || 'Failed to create case');
    },
  });

  const updateCaseMutation = useMutation({
    mutationFn: ({ caseId, data }) => casesApi.updateCase(caseId, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunityCases', id]);
      setActionSuccess('Case updated successfully');
      setShowQuickActionModal(false);
      setTimeout(() => setActionSuccess(null), 3000);
    },
    onError: (error) => {
      setActionError(error.message || 'Failed to update case');
    },
  });

  const escalateCaseMutation = useMutation({
    mutationFn: (caseId) => casesApi.escalateCase(caseId),
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunityCases', id]);
      setActionSuccess('Case escalated successfully');
      setShowQuickActionModal(false);
      setTimeout(() => setActionSuccess(null), 3000);
    },
    onError: (error) => {
      setActionError(error.message || 'Failed to escalate case');
    },
  });

  const closeCaseMutation = useMutation({
    mutationFn: (caseId) => casesApi.closeCase(caseId),
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunityCases', id]);
      setActionSuccess('Case closed successfully');
      setShowQuickActionModal(false);
      setTimeout(() => setActionSuccess(null), 3000);
    },
    onError: (error) => {
      setActionError(error.message || 'Failed to close case');
    },
  });

  // Email form state
  const [emailForm, setEmailForm] = useState({
    toAddresses: [],
    ccAddresses: [],
    subject: '',
    bodyText: '',
    bodyHtml: '',
  });

  // Email mutations
  const createEmailMutation = useMutation({
    mutationFn: (data) => emailsApi.createEmail({
      ...data,
      opportunityId: id,
      contactId: opportunity?.contactId,
      fromAddress: 'noreply@pandaexteriors.com', // Default from address
      sendNow: data.sendNow || false,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunityEmails', id]);
      setActionSuccess('Email sent successfully');
      setShowQuickActionModal(false);
      setEmailForm({ toAddresses: [], ccAddresses: [], subject: '', bodyText: '', bodyHtml: '' });
      setTimeout(() => setActionSuccess(null), 3000);
    },
    onError: (error) => {
      setActionError(error.message || 'Failed to send email');
    },
  });

  const replyEmailMutation = useMutation({
    mutationFn: ({ emailId, data }) => emailsApi.replyToEmail(emailId, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunityEmails', id]);
      setActionSuccess('Reply sent successfully');
      setShowQuickActionModal(false);
      setTimeout(() => setActionSuccess(null), 3000);
    },
    onError: (error) => {
      setActionError(error.message || 'Failed to send reply');
    },
  });

  // Contact form state
  const [contactForm, setContactForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    mobilePhone: '',
    isPrimary: false,
  });

  // Contact mutation - add contact to account
  const addContactMutation = useMutation({
    mutationFn: (data) => contactsApi.createContact({
      ...data,
      accountId: opportunity?.accountId,
      fullName: `${data.firstName} ${data.lastName}`,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunityContacts', id]);
      setActionSuccess('Contact added successfully');
      setShowQuickActionModal(false);
      setContactForm({ firstName: '', lastName: '', email: '', phone: '', mobilePhone: '', isPrimary: false });
      setTimeout(() => setActionSuccess(null), 3000);
    },
    onError: (error) => {
      setActionError(error.message || 'Failed to add contact');
    },
  });

  // Notification mutations
  const markNotificationReadMutation = useMutation({
    mutationFn: (notificationId) => notificationsApi.markAsRead(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunityNotifications', id]);
    },
  });

  const archiveNotificationMutation = useMutation({
    mutationFn: (notificationId) => notificationsApi.archiveNotification(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunityNotifications', id]);
      setActionSuccess('Notification archived');
      setTimeout(() => setActionSuccess(null), 3000);
    },
  });

  // GAF Quick Measure form state
  const [gafMeasureForm, setGafMeasureForm] = useState({
    measurementType: 'QuickMeasureResidentialSingleFamily',
    measurementInstructions: 'Primary Structure Only',
    comments: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    latitude: '',
    longitude: '',
  });

  // Initialize GAF form with opportunity address when opportunity loads
  useEffect(() => {
    if (opportunity) {
      setGafMeasureForm(prev => ({
        ...prev,
        street: opportunity.street || opportunity.account?.billingStreet || '',
        city: opportunity.city || opportunity.account?.billingCity || '',
        state: opportunity.state || opportunity.account?.billingState || '',
        zip: opportunity.postalCode || opportunity.account?.billingPostalCode || '',
      }));
    }
  }, [opportunity]);

  // GAF Quick Measure mutation
  const orderGAFMeasureMutation = useMutation({
    mutationFn: (data) => measurementsApi.orderGAFReport({
      opportunityId: id,
      address: data.street,
      city: data.city,
      state: data.state,
      zip: data.zip,
      measurementType: data.measurementType,
      measurementInstructions: data.measurementInstructions,
      latitude: data.latitude ? parseFloat(data.latitude) : null,
      longitude: data.longitude ? parseFloat(data.longitude) : null,
      comments: data.comments,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunity', id]);
      setActionSuccess('GAF Quick Measure order submitted successfully');
      setShowQuickActionModal(false);
      setGafMeasureForm({
        measurementType: 'QuickMeasureResidentialSingleFamily',
        measurementInstructions: 'Primary Structure Only',
        comments: '',
        street: opportunity?.street || '',
        city: opportunity?.city || '',
        state: opportunity?.state || '',
        zip: opportunity?.postalCode || '',
        latitude: '',
        longitude: '',
      });
      setTimeout(() => setActionSuccess(null), 3000);
    },
    onError: (error) => {
      setActionError(error.message || 'Failed to submit GAF Quick Measure order');
    },
  });

  // EagleView Measurements form state
  const [eagleviewForm, setEagleviewForm] = useState({
    measurementType: 'ResidentialPremium',
    deliveryMethod: 'Regular',
    measurementInstructions: 'Primary Structure Only',
    comments: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    country: 'United States',
    latitude: '',
    longitude: '',
  });

  // Initialize EagleView form with opportunity address when opportunity loads
  useEffect(() => {
    if (opportunity) {
      setEagleviewForm(prev => ({
        ...prev,
        street: opportunity.street || opportunity.account?.billingStreet || '',
        city: opportunity.city || opportunity.account?.billingCity || '',
        state: opportunity.state || opportunity.account?.billingState || '',
        zip: opportunity.postalCode || opportunity.account?.billingPostalCode || '',
      }));
    }
  }, [opportunity]);

  // EagleView Measurements mutation
  const orderEagleViewMutation = useMutation({
    mutationFn: (data) => measurementsApi.orderEagleViewReport({
      opportunityId: id,
      address: data.street,
      city: data.city,
      state: data.state,
      zip: data.zip,
      country: data.country,
      measurementType: data.measurementType,
      deliveryMethod: data.deliveryMethod,
      measurementInstructions: data.measurementInstructions,
      latitude: data.latitude ? parseFloat(data.latitude) : null,
      longitude: data.longitude ? parseFloat(data.longitude) : null,
      comments: data.comments,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunity', id]);
      setActionSuccess('EagleView measurement order submitted successfully');
      setShowQuickActionModal(false);
      setEagleviewForm({
        measurementType: 'ResidentialPremium',
        deliveryMethod: 'Regular',
        measurementInstructions: 'Primary Structure Only',
        comments: '',
        street: opportunity?.street || '',
        city: opportunity?.city || '',
        state: opportunity?.state || '',
        zip: opportunity?.postalCode || '',
        country: 'United States',
        latitude: '',
        longitude: '',
      });
      setTimeout(() => setActionSuccess(null), 3000);
    },
    onError: (error) => {
      setActionError(error.message || 'Failed to submit EagleView order');
    },
  });

  // Hover 3D Capture form state
  const [hoverCaptureForm, setHoverCaptureForm] = useState({
    captureType: 'EXTERIOR',
    street: '',
    city: '',
    state: '',
    zip: '',
    notes: '',
  });

  // Initialize Hover form with opportunity address when opportunity loads
  useEffect(() => {
    if (opportunity) {
      setHoverCaptureForm(prev => ({
        ...prev,
        street: opportunity.street || opportunity.account?.billingStreet || '',
        city: opportunity.city || opportunity.account?.billingCity || '',
        state: opportunity.state || opportunity.account?.billingState || '',
        zip: opportunity.postalCode || opportunity.account?.billingPostalCode || '',
      }));
    }
  }, [opportunity]);

  // Hover Capture mutation
  const createHoverCaptureMutation = useMutation({
    mutationFn: (data) => measurementsApi.createHoverCaptureRequest({
      opportunityId: id,
      address: data.street,
      city: data.city,
      state: data.state,
      zip: data.zip,
      captureType: data.captureType,
      notes: data.notes,
    }),
    onSuccess: (response) => {
      queryClient.invalidateQueries(['opportunity', id]);
      setActionSuccess(`Hover capture request created! Share this link with the field team: ${response.data?.captureLink || 'Link will be provided by email'}`);
      setShowQuickActionModal(false);
      setHoverCaptureForm({
        captureType: 'EXTERIOR',
        street: opportunity?.street || '',
        city: opportunity?.city || '',
        state: opportunity?.state || '',
        zip: opportunity?.postalCode || '',
        notes: '',
      });
      setTimeout(() => setActionSuccess(null), 10000); // Show success longer for copy link
    },
    onError: (error) => {
      setActionError(error.message || 'Failed to create Hover capture request');
    },
  });

  // Instant Measurement state
  const [instantMeasureResult, setInstantMeasureResult] = useState(null);
  const [instantMeasureLoading, setInstantMeasureLoading] = useState(false);
  const [instantMeasureStartTime, setInstantMeasureStartTime] = useState(null);
  const [instantMeasureElapsed, setInstantMeasureElapsed] = useState(0);
  const INSTANT_MEASURE_ESTIMATED_TIME = 15; // Estimated seconds for completion

  // Instant Measurement mutation
  const instantMeasureMutation = useMutation({
    mutationFn: async () => {
      setInstantMeasureLoading(true);
      setInstantMeasureStartTime(Date.now());
      setInstantMeasureElapsed(0);
      const address = {
        street: opportunity?.street || opportunity?.account?.billingStreet || '',
        city: opportunity?.city || opportunity?.account?.billingCity || '',
        state: opportunity?.state || opportunity?.account?.billingState || '',
        zip: opportunity?.postalCode || opportunity?.account?.billingPostalCode || '',
      };
      return measurementsApi.getInstantMeasurement({
        address,
        opportunityId: id,
      });
    },
    onSuccess: (response) => {
      // Transform the API response to match the expected frontend format
      const data = response.data || response;

      // Get predominant pitch - first roof segment's pitch or from roofSegments
      const firstSegment = data.roofSegments?.[0];
      const predominantPitchDegrees = firstSegment?.pitchDegrees || null;
      const predominantPitchRatio = firstSegment?.pitchRatio ? `${firstSegment.pitchRatio}/12` : data.predominantPitch;

      const transformedResult = {
        ...data,
        roofData: {
          totalRoofArea: data.totalRoofArea,
          totalRoofSquares: data.totalRoofSquares,
          facetCount: data.facets,
          complexity: data.roofComplexity,
          // Transform pitches - backend returns strings like "6/12", we need objects with degrees and ratio
          pitches: data.roofSegments?.map(seg => ({
            degrees: seg.pitchDegrees,
            ratio: seg.pitchRatio ? `${seg.pitchRatio}/12` : null,
          })).filter(p => p.degrees != null) || [],
          facets: data.roofSegments?.map((seg, idx) => ({
            areaSqFt: seg.areaSqFt,
            pitchDegrees: seg.pitchDegrees,
            pitchRatio: seg.pitchRatio,
            direction: seg.direction || seg.azimuthDirection,
          })) || [],
        },
        // Store predominant pitch in a format the display can use
        predominantPitchDisplay: predominantPitchDegrees != null
          ? `${Math.round(predominantPitchDegrees)}° (${predominantPitchRatio || data.predominantPitch})`
          : data.predominantPitch || null,
        // Convert imageryDate object {year, month, day} to string format
        // Support both Google Solar API (sources.googleSolar) and NAIP pipeline (sources.naip)
        imageryDate: data.sources?.googleSolar?.imageryDate
          ? `${data.sources.googleSolar.imageryDate.year}-${String(data.sources.googleSolar.imageryDate.month).padStart(2, '0')}-${String(data.sources.googleSolar.imageryDate.day).padStart(2, '0')}`
          : data.sources?.naip?.imageryDate
            ? `${data.sources.naip.imageryDate.year}-${String(data.sources.naip.imageryDate.month).padStart(2, '0')}-${String(data.sources.naip.imageryDate.day).padStart(2, '0')}`
            : data.imageryDate || null,
        imageryQuality: data.sources?.googleSolar?.imageryQuality || data.sources?.naip?.imageryQuality || data.imageryQuality || data.confidence?.overall,
        // Add source attribution for display
        imagerySource: data.provider === 'FREE_NAIP' ? 'NAIP (USDA)' : data.sources?.naip ? 'NAIP (USDA)' : data.sources?.googleSolar ? 'Google Solar API' : 'Unknown',
      };
      setInstantMeasureResult(transformedResult);
      setInstantMeasureLoading(false);
      setInstantMeasureStartTime(null);
      queryClient.invalidateQueries(['opportunity', id]);
      queryClient.invalidateQueries(['opportunityMeasurements', id]);
    },
    onError: (error) => {
      setInstantMeasureLoading(false);
      setInstantMeasureStartTime(null);
      setActionError(error.response?.data?.error?.message || error.message || 'Failed to get instant measurement');
    },
  });

  // Effect to update elapsed time during instant measure loading
  useEffect(() => {
    let interval;
    if (instantMeasureLoading && instantMeasureStartTime) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - instantMeasureStartTime) / 1000);
        setInstantMeasureElapsed(elapsed);
      }, 100);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [instantMeasureLoading, instantMeasureStartTime]);

  // Request Estimate form state - Combines Salesforce Estimate_Request_Flow with Task fields
  const [estimateRequestForm, setEstimateRequestForm] = useState({
    // Salesforce Estimate_Request_Flow fields
    estimateType: 'Full Replacement', // Full Replacement, Repair (matches Quote.Estimate_Type__c)
    tradeType: 'Roof', // Roof, Siding, Gutters, Trim, Capping, Painter, Drywall, Electrical (matches Quote.Trade_Type__c)
    affectedStructures: '', // Text field (matches Quote.Affected_Structures__c)
    priorityLevel: 'Medium', // High, Medium, Low (matches Quote.Priority_Level__c)
    // Task/Assignment fields
    assignedToId: '', // Required - User to assign the estimate task to
    dueDate: '', // Required - Due date for the estimate
    status: 'Open', // Required - Open, Completed, Interested, Accepted, Declined
    otherInformation: '', // Optional - Additional notes
    // Reminder fields
    reminderEnabled: false,
    reminderDate: '',
    reminderTime: '',
    // Recurring task fields
    isRecurring: false,
    recurringFrequency: 'weekly', // daily, weekly, monthly
    recurringEndDate: '',
  });

  // User search state for Assigned To field
  const [assigneeSearchQuery, setAssigneeSearchQuery] = useState('');
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
  const [selectedAssignee, setSelectedAssignee] = useState(null);

  // Search users for assignment
  const { data: assigneeSearchResults } = useQuery({
    queryKey: ['user-search-assignee', assigneeSearchQuery],
    queryFn: async () => {
      if (assigneeSearchQuery.length < 2) return [];
      const response = await usersApi.searchUsers({ query: assigneeSearchQuery, limit: 10 });
      return response.data || response || [];
    },
    enabled: assigneeSearchQuery.length >= 2,
  });

  // Request Estimate mutation - creates a Service Appointment for estimating
  const requestEstimateMutation = useMutation({
    mutationFn: async (data) => {
      // Validate required fields
      if (!data.assignedToId) {
        throw new Error('Please select someone to assign this estimate to');
      }
      if (!data.dueDate) {
        throw new Error('Please select a due date');
      }
      if (!data.estimateType) {
        throw new Error('Please select an estimate type');
      }
      if (!data.tradeType) {
        throw new Error('Please select a trade type');
      }
      if (!data.affectedStructures) {
        throw new Error('Please enter the affected structures');
      }

      // Create a Service Appointment for the estimate request
      // This will appear on the Appointments tab
      const appointmentData = {
        opportunityId: id,
        subject: `Estimate Request: ${data.estimateType} - ${data.tradeType}`,
        description: `Affected Structures: ${data.affectedStructures}\n\nPriority: ${data.priorityLevel}\n\n${data.otherInformation || ''}`.trim(),
        workTypeName: 'Estimate',
        status: 'SCHEDULED',
        // Schedule for the due date - default 9am-10am
        scheduledStart: `${data.dueDate}T09:00:00`,
        scheduledEnd: `${data.dueDate}T10:00:00`,
        // Assignment
        assignedResourceId: data.assignedToId,
        // Store estimate-specific metadata
        estimateType: data.estimateType,
        tradeType: data.tradeType,
        affectedStructures: data.affectedStructures,
        priorityLevel: data.priorityLevel,
        isEstimateRequest: true,
      };

      const response = await scheduleApi.createServiceAppointment(appointmentData);
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(['opportunity', id]);
      queryClient.invalidateQueries(['appointments', id]);
      queryClient.invalidateQueries(['opportunity-summary', id]);
      const assigneeName = selectedAssignee?.fullName || selectedAssignee?.name || 'the assigned user';
      setActionSuccess(`Estimate appointment scheduled and assigned to ${assigneeName}. View it on the Appointments tab.`);
      setShowQuickActionModal(false);
      setEstimateRequestForm({
        estimateType: 'Full Replacement',
        tradeType: 'Roof',
        affectedStructures: '',
        priorityLevel: 'Medium',
        assignedToId: '',
        dueDate: '',
        status: 'Open',
        otherInformation: '',
        reminderEnabled: false,
        reminderDate: '',
        reminderTime: '',
        isRecurring: false,
        recurringFrequency: 'weekly',
        recurringEndDate: '',
      });
      setSelectedAssignee(null);
      setAssigneeSearchQuery('');
      setTimeout(() => setActionSuccess(null), 3000);
    },
    onError: (error) => {
      setActionError(error.message || 'Failed to submit estimate request');
    },
  });

  // Meeting Outcome form state (Insurance workflow - Adjuster Meeting Results)
  const [meetingOutcomeForm, setMeetingOutcomeForm] = useState({
    outcome: '', // full_approval, pending_estimate, repair_denied
    notes: '',
    estimateAmount: '',
    deductible: '',
    nextSteps: '',
  });

  // Meeting Outcome mutation - updates opportunity status and triggers automations
  const updateMeetingOutcomeMutation = useMutation({
    mutationFn: async (data) => {
      // Update opportunity with meeting outcome
      const updateData = {
        adjusterMeetingOutcome: data.outcome,
        adjusterMeetingNotes: data.notes,
      };

      // Update stage based on outcome
      if (data.outcome === 'full_approval') {
        updateData.stage = 'CLAIM_APPROVED';
        updateData.isApproved = true;
        if (data.estimateAmount) updateData.rcvAmount = parseFloat(data.estimateAmount);
        if (data.deductible) updateData.deductible = parseFloat(data.deductible);
      } else if (data.outcome === 'pending_estimate') {
        updateData.stage = 'PENDING_ESTIMATE';
      } else if (data.outcome === 'repair_denied') {
        updateData.stage = 'CLAIM_DENIED';
      }

      const response = await opportunitiesApi.update(id, updateData);

      // Create follow-up actions based on outcome
      if (data.outcome === 'full_approval') {
        // Create task to prep project specs
        await opportunitiesApi.createTask(id, {
          subject: 'Prep Project Specs',
          type: 'PROJECT_PREP',
          priority: 'HIGH',
          description: 'Customer approved. Prepare project specifications for contract signing.',
          status: 'OPEN',
        });
        // Create service appointment for contract signing
        const workOrder = await opportunitiesApi.getWorkOrders(id);
        if (workOrder?.data?.length > 0) {
          await scheduleApi.createAppointment({
            workOrderId: workOrder.data[0].id,
            subject: 'Contract Signing',
            status: 'NONE',
            duration: 60,
          });
        }
      } else if (data.outcome === 'pending_estimate') {
        // Create task to follow up on adjuster estimate
        await opportunitiesApi.createTask(id, {
          subject: 'Follow up on Adjuster Estimate',
          type: 'FOLLOW_UP',
          priority: 'NORMAL',
          description: 'Adjuster meeting complete. Follow up to obtain the estimate document.',
          status: 'OPEN',
        });
      } else if (data.outcome === 'repair_denied') {
        // Create PandaClaims case for denied/repair estimate
        await casesApi.create({
          opportunityId: id,
          accountId: opportunity.accountId,
          subject: 'Claim Denied / Repair Estimate - Review Needed',
          type: 'PANDA_CLAIMS',
          priority: 'HIGH',
          description: `Adjuster meeting resulted in ${data.outcome === 'repair_denied' ? 'denial or repair estimate' : 'adverse outcome'}. Notes: ${data.notes || 'None'}`,
          status: 'OPEN',
        });
      }

      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries(['opportunity', id]);
      queryClient.invalidateQueries(['tasks', id]);
      queryClient.invalidateQueries(['cases', id]);

      const outcomeMessages = {
        full_approval: 'Meeting outcome updated: Full Approval. Tasks created for project prep and contract signing.',
        pending_estimate: 'Meeting outcome updated: Pending Estimate. Follow-up task created.',
        repair_denied: 'Meeting outcome updated: Denied/Repair. PandaClaims case created for review.',
      };

      setActionSuccess(outcomeMessages[variables.outcome] || 'Meeting outcome updated successfully');
      setShowQuickActionModal(false);
      setMeetingOutcomeForm({ outcome: '', notes: '', estimateAmount: '', deductible: '', nextSteps: '' });
      setTimeout(() => setActionSuccess(null), 5000);
    },
    onError: (error) => {
      setActionError(error.message || 'Failed to update meeting outcome');
    },
  });

  // Create Insurance Invoice mutation
  const createInsuranceInvoiceMutation = useMutation({
    mutationFn: async (data) => {
      return invoicesApi.createInvoice({
        accountId: opportunity.accountId,
        opportunityId: id,
        isInsuranceInvoice: true,
        insuranceCarrier: opportunity.insuranceCarrier || data.insuranceCarrier,
        claimNumber: opportunity.claimNumber || data.claimNumber,
        notes: data.notes,
        terms: 30,
        tax: 0,
        lineItems: data.lineItems || [{
          description: `Insurance Claim - ${opportunity.insuranceCarrier || 'Insurance'} - Claim #${opportunity.claimNumber || 'N/A'}`,
          quantity: 1,
          unitPrice: data.amount || opportunity.amount || 0,
        }],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunityInvoices', id]);
      setShowCreateInsuranceInvoiceModal(false);
      setActionSuccess('Insurance invoice created successfully');
      setTimeout(() => setActionSuccess(null), 5000);
    },
    onError: (error) => {
      setActionError(error.message || 'Failed to create insurance invoice');
    },
  });

  // Fetch work types for dropdown
  const { data: workTypes } = useQuery({
    queryKey: ['workTypes'],
    queryFn: () => scheduleApi.getWorkTypes(),
    staleTime: 1000 * 60 * 10, // Cache for 10 minutes
  });

  // toggleSection moved to WorkflowSidebar component
  // const toggleSection = (section) => {
  //   setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  // };

  const openQuickActionModal = (actionId) => {
    setActiveQuickAction(actionId);
    setShowQuickActionModal(true);
    setActionError(null);
  };

  const handleQuickActionSubmit = async (actionType) => {
    setActionLoading(true);
    setActionError(null);

    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const successMessages = {
        orderGAF: 'GAF measurement order submitted successfully',
        orderEagleview: 'Eagleview measurement order submitted successfully',
        updateInsurance: 'Insurance information updated',
        updateFinancing: 'Financing information updated',
        sendForSignature: 'Document sent for signature',
        generatePaymentLink: 'Payment link generated and copied to clipboard',
        startOrder: 'Material order created',
      };
      setActionSuccess(successMessages[actionType] || 'Action completed successfully');
      setShowQuickActionModal(false);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (error) {
      setActionError(error.message || 'Failed to complete action');
    } finally {
      setActionLoading(false);
    }
  };

  // Tabs configuration - using summary counts from Hub API
  // Count unread notifications
  const unreadNotifications = notifications?.filter(n => n.status === 'UNREAD')?.length || 0;

  // Count unread conversations
  const unreadConversations = conversations?.reduce((acc, c) => acc + (c.unreadCount || 0), 0) || 0;

  // Calculate total conversation count (SMS + Email)
  const totalConversationsCount = (conversations?.length || 0) + (emails?.length || 0);
  const totalUnread = unreadConversations + (emails?.filter(e => e.status === 'UNREAD')?.length || 0);

  // Calculate badge counts for the new category tabs (must be before early returns)
  const categoryBadgeCounts = useMemo(() => ({
    schedule: (appointments?.length || 0) + (tasks?.filter(t => t.status !== 'COMPLETED')?.length || 0),
    financial: (invoices?.length || 0) + (commissions?.length || 0) + (quotes?.length || 0),
    documents: (documents?.documents?.length || 0) + (photos?.length || 0) + (activityData?.activities?.filter(a => a.sourceType !== 'ACCULYNX_IMPORT')?.length || 0),
    team: (contacts?.length || 0) + (workOrders?.length || 0) + (cases?.length || 0),
    messages: totalUnread + unreadNotifications,
  }), [appointments, tasks, invoices, commissions, quotes, documents, photos, activityData, contacts, workOrders, cases, totalUnread, unreadNotifications]);

  // Calculate sub-tab counts for the current category (must be before early returns)
  const subTabCounts = useMemo(() => {
    switch (activeCategory) {
      case 'schedule':
        return {
          schedule: appointments?.length || 0,
          tasks: tasks?.filter(t => t.status !== 'COMPLETED')?.length || 0,
          checklist: 0,
        };
      case 'financial':
        return {
          invoices: invoices?.length || 0,
          commissions: commissions?.length || 0,
          quotes: quotes?.length || 0,
        };
      case 'documents':
        return {
          documents: (documents?.documents?.length || 0) + (photos?.length || 0),
          activity: activityData?.activities?.filter(a => a.sourceType !== 'ACCULYNX_IMPORT')?.length || 0,
        };
      case 'team':
        return {
          contacts: contacts?.length || 0,
          workOrders: workOrders?.length || 0,
          cases: cases?.length || 0,
          approvals: 0,
        };
      case 'messages':
        return {
          conversations: totalUnread,
          communications: activityData?.activities?.filter(a => a.sourceType === 'ACCULYNX_IMPORT')?.length || 0,
          notifications: unreadNotifications,
        };
      default:
        return {};
    }
  }, [activeCategory, appointments, tasks, invoices, commissions, quotes, documents, photos, activityData, contacts, workOrders, cases, totalUnread, unreadNotifications]);

  // Early returns (after all hooks)
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary"></div>
      </div>
    );
  }

  if (!opportunity) {
    return (
      <div className="text-center py-12">
        <Target className="w-12 h-12 mx-auto text-gray-300 mb-4" />
        <p className="text-gray-500">Job not found</p>
        <button onClick={() => navigate(-1)} className="text-panda-primary hover:underline mt-2 inline-block">
          Back
        </button>
      </div>
    );
  }

  // Calculate days open
  const daysOpen = Math.floor((Date.now() - new Date(opportunity.createdAt).getTime()) / (1000 * 60 * 60 * 24));

  // Keep legacy tabs array for backward compatibility
  const tabs = [
    { id: 'details', label: 'Details', icon: Info },
    { id: 'schedule', label: 'Appointments', icon: CalendarDays, count: summary?.counts?.appointments || appointments?.length || 0 },
    { id: 'contacts', label: 'Contacts', icon: Users, count: summary?.counts?.contacts || contacts?.length || 0 },
    { id: 'workOrders', label: 'Work Orders', icon: Wrench, count: summary?.counts?.workOrders || workOrders?.length || 0 },
    { id: 'cases', label: 'Cases', icon: Briefcase, count: cases?.length || 0 },
    { id: 'conversations', label: 'Conversations', icon: MessageSquare, count: totalUnread, highlight: totalUnread > 0 },
    { id: 'notifications', label: 'Notifications', icon: Bell, count: unreadNotifications, highlight: unreadNotifications > 0 },
    { id: 'approvals', label: 'Approvals', icon: Scale },
    { id: 'financials', label: 'Financials', icon: DollarSign, count: (invoices?.length || 0) + (quotes?.length || 0) },
    { id: 'quotes', label: 'Quotes', icon: FileText, count: summary?.counts?.quotes || quotes?.length || 0 },
    { id: 'invoices', label: 'Invoices', icon: Receipt, count: summary?.counts?.invoices || invoices?.length || 0 },
    { id: 'payments', label: 'Payments', icon: CreditCard, count: payments?.length || 0 },
    { id: 'commissions', label: 'Commissions', icon: Percent, count: summary?.counts?.commissions || commissions?.length || 0 },
    { id: 'documents', label: 'Documents', icon: FileSignature, count: (summary?.counts?.documents || documents?.documents?.length || 0) },
    { id: 'activity', label: 'Activity', icon: Activity, count: activityData?.activities?.filter(a => a.sourceType !== 'ACCULYNX_IMPORT')?.length || 0 },
    { id: 'communications', label: 'Communications', icon: PhoneCall, count: activityData?.activities?.filter(a => a.sourceType === 'ACCULYNX_IMPORT')?.length || 0 },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare, count: tasks?.filter(t => t.status !== 'COMPLETED')?.length || 0 },
    { id: 'checklist', label: 'Checklist', icon: ClipboardList },
  ];

  // Onboarding checklist - wired to actual opportunity data
  const onboardingChecklist = [
    { id: 'estimateReceived', label: 'Estimate Received', checked: opportunity.estimateReceived || false, field: 'estimateReceived' },
    { id: 'contractReceived', label: 'Contract Received', checked: opportunity.contractReceived || false, field: 'contractReceived' },
    { id: 'photosCollected', label: 'Photos Collected', checked: opportunity.photosCollected === 'sufficient', field: 'photosCollected' },
    { id: 'preSupplementRequired', label: 'Pre-Supplement Required', checked: opportunity.preSupplementRequired || false, field: 'preSupplementRequired' },
    { id: 'piiComplete', label: 'PII Complete', checked: opportunity.piiComplete || false, field: 'piiComplete' },
  ];

  // Financing checklist - wired to actual opportunity data
  const financingChecklist = [
    { id: 'financed', label: 'Financed', checked: opportunity.financed || false, field: 'financed' },
    { id: 'downPaymentReceived', label: 'Down Payment Received', checked: opportunity.downPaymentReceived || false, field: 'downPaymentReceived' },
    { id: 'deductibleReceived', label: 'Deductible Received', checked: opportunity.deductibleReceived || false, field: 'deductibleReceived' },
  ];

  // HOA & Permit checklist
  const hoaPermitChecklist = [
    { id: 'hoaApproved', label: 'HOA Approved', checked: opportunity.hoaApproved || false, field: 'hoaApproved' },
    { id: 'permitRequired', label: 'Permit Required', checked: opportunity.permitRequired || false, field: 'permitRequired' },
    { id: 'permitObtained', label: 'Permit Obtained', checked: opportunity.permitObtained || false, field: 'permitObtained' },
  ];

  // Handler for checklist item toggle
  const handleChecklistToggle = async (field, currentValue, isSpecialField = false) => {
    try {
      let newValue;
      if (field === 'photosCollected') {
        // Special handling for photos_collected which is a string enum
        newValue = currentValue === 'sufficient' ? 'pending' : 'sufficient';
      } else {
        newValue = !currentValue;
      }

      await updateMutation.mutateAsync({ [field]: newValue });

      // PPSQ Workflow: Auto-create a Case when Pre-Supplement Required is toggled to true
      // This queues the supplements team for intake per Scribehow documentation
      if (field === 'preSupplementRequired' && newValue === true) {
        const jobName = opportunity?.name || opportunity?.jobId || 'Unknown Job';
        const accountName = opportunity?.account?.name || '';

        createCaseMutation.mutate({
          subject: `Pre-Supplement Required - ${jobName}`,
          description: `Pre-Supplement has been marked as required for ${jobName}${accountName ? ` (${accountName})` : ''}. This case has been automatically created to queue the supplements team for intake.\n\nPlease review the PPSQ information and proceed with the supplement intake process.`,
          priority: 'HIGH',
          type: 'SUPPLEMENT',
        });

        setActionSuccess('Pre-Supplement Required marked - Case created for supplements team');
      }
    } catch (error) {
      console.error('Failed to update checklist item:', error);
      setActionError(`Failed to update ${field}`);
    }
  };

  // Available trades options
  const trades = ['Roofing', 'Gutters', 'Siding', 'GAF Solar', 'Skylight', 'Trim & Capping', 'Interior Work', 'GAF TimberSteel'];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Success/Error Toast */}
      {actionSuccess && (
        <div className="fixed top-4 right-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg shadow-lg flex items-center space-x-2 z-50 animate-fade-in">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <span>{actionSuccess}</span>
        </div>
      )}
      {actionError && (
        <div className="fixed top-4 right-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg shadow-lg flex items-center space-x-2 z-50 animate-fade-in">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="ml-2 text-red-600 hover:text-red-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Back Link */}
      <div className="px-4 sm:px-6 py-3">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center text-gray-500 hover:text-gray-700 text-sm"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </button>
      </div>

      {/* Compact Header with Gradient */}
      <div className="px-4 sm:px-6 pb-4">
        <div className="bg-gradient-to-r from-slate-50 via-white to-blue-50 rounded-xl shadow-sm border border-gray-200">
          {/* Top Bar - Name and Key Info */}
          <div className="p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              {/* Left: Icon + Name + Badges */}
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gradient-to-br from-panda-primary to-panda-secondary flex items-center justify-center flex-shrink-0 shadow-sm">
                  <Target className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate">
                    {opportunity.contact?.firstName && opportunity.contact?.lastName
                      ? `${opportunity.contact.firstName} ${opportunity.contact.lastName}`
                      : opportunity.name}
                  </h1>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-100 text-blue-700">
                      {opportunity.workType || 'Insurance'}
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-100 text-emerald-700">
                      {opportunity.stage?.replace(/_/g, ' ') || 'Lead'}
                    </span>
                    {opportunity.isApproved ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-green-100 text-green-700">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Approved
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-amber-100 text-amber-700">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        Pending Approval
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Job # and Priority */}
              <div className="flex items-center gap-4 sm:gap-5">
                {/* Job Number */}
                <div className="bg-white/80 backdrop-blur-sm rounded-lg px-3 py-2 border border-gray-100 shadow-sm">
                  <div className="text-xs text-gray-500 font-medium">Job #</div>
                  <div className="text-sm sm:text-base font-bold text-panda-primary">
                    {opportunity.jobId || (
                      <button
                        onClick={async () => {
                          try {
                            const result = await opportunitiesApi.assignJobId(id);
                            if (result.jobId) {
                              queryClient.invalidateQueries(['opportunity', id]);
                              setActionSuccess(`Assigned Job #${result.jobId}`);
                            }
                          } catch (err) {
                            setActionError('Failed to assign Job #');
                          }
                        }}
                        className="text-xs text-gray-400 hover:text-panda-primary underline"
                      >
                        Assign
                      </button>
                    )}
                  </div>
                </div>
                {/* Priority */}
                <div className="hidden sm:block">
                  <JobPriority opportunity={opportunity} />
                </div>
              </div>
            </div>
          </div>

          {/* Metrics Bar - Compact single row (financials + key counts only) */}
          <div className="px-4 sm:px-5 pb-4">
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 sm:gap-3">
              {/* Financials with colors */}
              <div className="col-span-2 sm:col-span-1 bg-emerald-50 rounded-lg p-2 sm:p-3 text-center border border-emerald-100">
                <div className="text-[10px] sm:text-xs text-emerald-600 font-medium uppercase tracking-wide">Contract</div>
                <div className="text-sm sm:text-base font-bold text-emerald-700">${(summary?.financials?.contractValue || opportunity.amount || 0).toLocaleString()}</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-2 sm:p-3 text-center border border-blue-100">
                <div className="text-[10px] sm:text-xs text-blue-600 font-medium uppercase tracking-wide">Paid</div>
                <div className="text-sm sm:text-base font-bold text-blue-700">${(summary?.financials?.totalPaid || 0).toLocaleString()}</div>
              </div>
              <div className="bg-amber-50 rounded-lg p-2 sm:p-3 text-center border border-amber-100">
                <div className="text-[10px] sm:text-xs text-amber-600 font-medium uppercase tracking-wide">Due</div>
                <div className="text-sm sm:text-base font-bold text-amber-700">${(summary?.financials?.balanceDue || 0).toLocaleString()}</div>
              </div>

              {/* Counts */}
              <div className="hidden sm:block bg-white rounded-lg p-2 sm:p-3 text-center border border-gray-100">
                <div className="text-[10px] sm:text-xs text-gray-500 font-medium uppercase tracking-wide">Quotes</div>
                <div className="text-sm sm:text-base font-bold text-gray-700">{summary?.counts?.quotes || quotes?.length || 0}</div>
              </div>
              <div className="hidden sm:block bg-white rounded-lg p-2 sm:p-3 text-center border border-gray-100">
                <div className="text-[10px] sm:text-xs text-gray-500 font-medium uppercase tracking-wide">Work Orders</div>
                <div className="text-sm sm:text-base font-bold text-gray-700">{summary?.counts?.workOrders || workOrders?.length || 0}</div>
              </div>
              <div className="hidden sm:block bg-white rounded-lg p-2 sm:p-3 text-center border border-gray-100">
                <div className="text-[10px] sm:text-xs text-gray-500 font-medium uppercase tracking-wide">Appts</div>
                <div className="text-sm sm:text-base font-bold text-gray-700">{summary?.counts?.appointments || 0}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Milestone Tracker */}
      <div className="px-4 sm:px-6 pb-4">
        <MilestoneTracker opportunity={opportunity} />
      </div>

      {/* Main Content - Two Column Layout */}
      <div className="px-4 sm:px-6 pb-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left Sidebar - Compact actions and info */}
          <div className="w-full lg:w-80 xl:w-96 flex-shrink-0 order-2 lg:order-1">
            <div className="lg:sticky lg:top-24 space-y-3 max-h-[calc(100vh-120px)] overflow-y-auto pb-4">
              {/* Primary Actions Row */}
              <div className="flex gap-2">
                {isEditMode ? (
                  <>
                    <button
                      onClick={handleEditSave}
                      disabled={updateMutation.isPending}
                      className="flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50"
                    >
                      {updateMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle className="w-4 h-4" />
                      )}
                      <span>Save Changes</span>
                    </button>
                    <button
                      onClick={cancelEditMode}
                      className="px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={enterEditMode}
                    className="flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 transition-colors text-sm font-medium"
                  >
                    <Edit className="w-4 h-4" />
                    <span>Edit Job</span>
                  </button>
                )}

                {/* Actions Dropdown */}
                <div className="relative" ref={actionsMenuRef}>
                  <button
                    onClick={() => setShowActionsMenu(!showActionsMenu)}
                    className="px-3 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    title="More Actions"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {showActionsMenu && (
                    <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                      {/* Work Order */}
                      {(!workOrders || workOrders.length === 0) && (
                        <button
                          onClick={() => {
                            setActiveQuickAction('createWorkOrder');
                            setShowQuickActionModal(true);
                            setShowActionsMenu(false);
                          }}
                          className="w-full flex items-center space-x-3 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <Wrench className="w-4 h-4 text-green-600" />
                          <span>Build Work Order</span>
                        </button>
                      )}

                      {/* Measurements Section */}
                      <div className="border-t border-gray-100 my-1" />
                      <div className="px-4 py-1.5 text-xs font-medium text-gray-400 uppercase">Measurements</div>
                      <button
                        onClick={() => {
                          setActiveQuickAction('gafQuickMeasure');
                          setShowQuickActionModal(true);
                          setShowActionsMenu(false);
                        }}
                        className="w-full flex items-center space-x-3 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Ruler className="w-4 h-4 text-blue-600" />
                        <span>GAF Quick Measure</span>
                      </button>
                      <button
                        onClick={() => {
                          setActiveQuickAction('eagleviewMeasure');
                          setShowQuickActionModal(true);
                          setShowActionsMenu(false);
                        }}
                        className="w-full flex items-center space-x-3 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Eye className="w-4 h-4 text-orange-600" />
                        <span>EagleView Measurements</span>
                      </button>
                      <button
                        onClick={() => {
                          setActiveQuickAction('hoverCapture');
                          setShowQuickActionModal(true);
                          setShowActionsMenu(false);
                        }}
                        className="w-full flex items-center space-x-3 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Camera className="w-4 h-4 text-purple-600" />
                        <span>Hover 3D Capture</span>
                      </button>
                      <button
                        onClick={() => {
                          setActiveQuickAction('instantMeasure');
                          setShowQuickActionModal(true);
                          setShowActionsMenu(false);
                        }}
                        className="w-full flex items-center space-x-3 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Zap className="w-4 h-4 text-green-600" />
                        <span>Instant Measurement</span>
                        <span className="ml-auto text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">FREE</span>
                      </button>

                      {/* Sales Actions Section */}
                      <div className="border-t border-gray-100 my-1" />
                      <div className="px-4 py-1.5 text-xs font-medium text-gray-400 uppercase">Sales Actions</div>
                      <button
                        onClick={() => {
                          setActiveQuickAction('requestEstimate');
                          setShowQuickActionModal(true);
                          setShowActionsMenu(false);
                        }}
                        className="w-full flex items-center space-x-3 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <FileText className="w-4 h-4 text-teal-600" />
                        <span>Request Estimate</span>
                      </button>
                      <button
                        onClick={() => {
                          setActiveQuickAction('updateMeetingOutcome');
                          setShowQuickActionModal(true);
                          setShowActionsMenu(false);
                        }}
                        className="w-full flex items-center space-x-3 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <ClipboardCheck className="w-4 h-4 text-amber-600" />
                        <span>Update Meeting Outcome</span>
                      </button>
                      {/* Prepare Specs - Only show for insurance opportunities after claim approved */}
                      {(opportunity.type === 'INSURANCE' || opportunity.workType?.toLowerCase().includes('insurance')) && (
                        <button
                          onClick={() => {
                            setShowSpecsPreparation(true);
                            setShowActionsMenu(false);
                          }}
                          className="w-full flex items-center space-x-3 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <ClipboardList className="w-4 h-4 text-blue-600" />
                          <span>Prepare Specs</span>
                          {opportunity.specsPrepped && (
                            <CheckCircle className="w-4 h-4 text-green-500 ml-auto" />
                          )}
                        </button>
                      )}
                      {/* Generate Contract - Show after specs are prepped */}
                      {opportunity.specsPrepped && (
                        <button
                          onClick={async () => {
                            setShowActionsMenu(false);
                            try {
                              const response = await fetch(`${import.meta.env.VITE_API_BASE || ''}/api/workflows/triggers/contract/generate`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  opportunityId: id,
                                  userId: null, // Will be filled by backend from auth
                                }),
                              });
                              if (response.ok) {
                                setActionSuccess('Contract generation triggered successfully');
                                queryClient.invalidateQueries(['opportunity', id]);
                              } else {
                                const error = await response.json();
                                setActionError(error.message || 'Failed to generate contract');
                              }
                            } catch (err) {
                              setActionError('Failed to trigger contract generation');
                            }
                          }}
                          className="w-full flex items-center space-x-3 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <FileSignature className="w-4 h-4 text-green-600" />
                          <span>Generate Contract</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Notes Sidebar - Pinned note at top, others chronological */}
              <NotesSidebar opportunityId={id} />

              {/* Stage-Aware Workflow Sidebar */}
              <WorkflowSidebar
                opportunity={opportunity}
                onActionClick={(action) => {
                  console.log('Sidebar action clicked:', action);
                }}
                onEditClick={() => navigate(`/jobs/${id}/wizard`)}
                onScheduleClick={() => {
                  setActiveQuickAction('schedule');
                  setShowQuickActionModal(true);
                }}
              />
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 min-w-0 space-y-6 order-1 lg:order-2">
            {/* Category Tabs Section - Redesigned UX */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              {/* Category Navigation (5 Smart Categories + Details) */}
              <div className="p-4 border-b border-gray-100">
                <SuperTabNav
                  activeCategory={activeCategory}
                  onCategoryChange={changeCategory}
                  badgeCounts={categoryBadgeCounts}
                  showDetailsButton={true}
                  isDetailsActive={showDetails}
                  onDetailsClick={toggleDetails}
                />
              </div>

              {/* Sub-Tab Navigation (hidden when Details is active) */}
              {!showDetails && (
                <div className="px-6 pt-4">
                  <SubTabNav
                    category={activeCategory}
                    activeSubTab={activeSubTab}
                    onSubTabChange={changeSubTab}
                    subTabCounts={subTabCounts}
                  />
                </div>
              )}

              {/* Tab Content */}
              <div className="p-6 pt-0">
                {activeTab === 'details' && (
                  <div className="space-y-6">
                    {/* Sub-tab navigation for Status Information, Measurements, and Contacts */}
                    <div className="flex gap-1 border-b border-gray-200 mb-4">
                      <button
                        onClick={() => setDetailsSubTab('status')}
                        className={`
                          flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px
                          transition-colors duration-150
                          ${detailsSubTab === 'status'
                            ? 'border-panda-primary text-panda-primary'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                          }
                        `}
                      >
                        <Info className="w-4 h-4" />
                        <span>Status Information</span>
                      </button>
                      <button
                        onClick={() => setDetailsSubTab('measurements')}
                        className={`
                          flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px
                          transition-colors duration-150
                          ${detailsSubTab === 'measurements'
                            ? 'border-panda-primary text-panda-primary'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                          }
                        `}
                      >
                        <Ruler className="w-4 h-4" />
                        <span>Measurements</span>
                        {measurementReports?.length > 0 && (
                          <span className={`
                            px-1.5 py-0.5 rounded-full text-xs min-w-[1.25rem] text-center
                            ${detailsSubTab === 'measurements'
                              ? 'bg-panda-primary/10 text-panda-primary'
                              : 'bg-gray-100 text-gray-600'
                            }
                          `}>
                            {measurementReports.length}
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => setDetailsSubTab('contacts')}
                        className={`
                          flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px
                          transition-colors duration-150
                          ${detailsSubTab === 'contacts'
                            ? 'border-panda-primary text-panda-primary'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                          }
                        `}
                      >
                        <Users className="w-4 h-4" />
                        <span>Contacts</span>
                        {contacts?.length > 0 && (
                          <span className={`
                            px-1.5 py-0.5 rounded-full text-xs min-w-[1.25rem] text-center
                            ${detailsSubTab === 'contacts'
                              ? 'bg-panda-primary/10 text-panda-primary'
                              : 'bg-gray-100 text-gray-600'
                            }
                          `}>
                            {contacts.length}
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => setDetailsSubTab('jobTeam')}
                        className={`
                          flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px
                          transition-colors duration-150
                          ${detailsSubTab === 'jobTeam'
                            ? 'border-panda-primary text-panda-primary'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                          }
                        `}
                      >
                        <UserCircle className="w-4 h-4" />
                        <span>Job Team</span>
                      </button>
                    </div>

                    {/* Edit Mode Banner */}
                    {isEditMode && detailsSubTab === 'status' && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2">
                        <Edit className="w-4 h-4 text-blue-600" />
                        <span className="text-sm text-blue-700">Edit mode active - make changes below and click Save Changes when done</span>
                      </div>
                    )}

                    {/* Status Information Sub-tab */}
                    {detailsSubTab === 'status' && (
                      <>
                    {/* Status Information */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-4">Status Information</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className={`bg-gray-50 p-4 rounded-lg border-l-4 border-purple-400 ${isEditMode ? 'ring-2 ring-blue-200' : ''}`}>
                          <label className="text-sm text-gray-500">Stage</label>
                          {isEditMode ? (
                            <select
                              value={editForm.stage}
                              onChange={(e) => setEditForm({ ...editForm, stage: e.target.value })}
                              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                            >
                              <option value="">Select Stage</option>
                              <option value="LEAD_UNASSIGNED">Lead Unassigned</option>
                              <option value="LEAD_ASSIGNED">Lead Assigned</option>
                              <option value="SCHEDULED">Scheduled</option>
                              <option value="INSPECTED">Inspected</option>
                              <option value="CLAIM_FILED">Claim Filed</option>
                              <option value="ADJUSTER_MEETING_COMPLETE">Adjuster Meeting Complete</option>
                              <option value="APPROVED">Approved</option>
                              <option value="CONTRACT_SIGNED">Contract Signed</option>
                              <option value="IN_PRODUCTION">In Production</option>
                              <option value="COMPLETED">Completed</option>
                              <option value="CLOSED_WON">Closed Won</option>
                              <option value="CLOSED_LOST">Closed Lost</option>
                            </select>
                          ) : (
                            <p className="font-medium text-gray-900">{opportunity.stage?.replace(/_/g, ' ') || 'Approved'}</p>
                          )}
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg border-l-4 border-purple-400">
                          <label className="text-sm text-gray-500">Approved</label>
                          <p className="font-medium text-green-600">Yes</p>
                        </div>
                        <div className={`bg-gray-50 p-4 rounded-lg border-l-4 border-purple-400 ${isEditMode ? 'ring-2 ring-blue-200' : ''}`}>
                          <label className="text-sm text-gray-500">Status</label>
                          {isEditMode ? (
                            <input
                              type="text"
                              value={editForm.status}
                              onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                              placeholder="Enter status"
                              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                            />
                          ) : (
                            <p className="font-medium text-gray-900">{opportunity.status || 'Not Scheduled'}</p>
                          )}
                        </div>
                        <div className={`bg-gray-50 p-4 rounded-lg border-l-4 border-purple-400 ${isEditMode ? 'ring-2 ring-blue-200' : ''}`}>
                          <label className="text-sm text-gray-500">Disposition</label>
                          {isEditMode ? (
                            <input
                              type="text"
                              value={editForm.disposition}
                              onChange={(e) => setEditForm({ ...editForm, disposition: e.target.value })}
                              placeholder="Enter disposition"
                              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                            />
                          ) : (
                            <p className={`font-medium ${opportunity.disposition ? 'text-gray-900' : 'text-gray-500 italic'}`}>
                              {opportunity.disposition || 'Not set'}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Job Details */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-4">Job Details</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className={`bg-gray-50 p-4 rounded-lg border-l-4 border-blue-400 ${isEditMode ? 'ring-2 ring-blue-200' : ''}`}>
                          <label className="text-sm text-gray-500">Work Type</label>
                          {isEditMode ? (
                            <select
                              value={editForm.workType}
                              onChange={(e) => setEditForm({ ...editForm, workType: e.target.value })}
                              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                            >
                              <option value="">Select Work Type</option>
                              <option value="Insurance Roofing">Insurance Roofing</option>
                              <option value="Retail Roofing">Retail Roofing</option>
                              <option value="Insurance Gutters">Insurance Gutters</option>
                              <option value="Retail Gutters">Retail Gutters</option>
                              <option value="Insurance Siding">Insurance Siding</option>
                              <option value="Retail Siding">Retail Siding</option>
                              <option value="Inspection">Inspection</option>
                              <option value="Interior">Interior</option>
                            </select>
                          ) : (
                            <p className="font-medium text-gray-900">{opportunity.workType || 'Insurance Roofing'}</p>
                          )}
                        </div>
                        <div className={`bg-gray-50 p-4 rounded-lg border-l-4 border-blue-400 ${isEditMode ? 'ring-2 ring-blue-200' : ''}`}>
                          <label className="text-sm text-gray-500">Lead Source</label>
                          {isEditMode ? (
                            <input
                              type="text"
                              value={editForm.leadSource}
                              onChange={(e) => setEditForm({ ...editForm, leadSource: e.target.value })}
                              placeholder="Enter lead source"
                              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                            />
                          ) : (
                            <p className={`font-medium ${opportunity.leadSource ? 'text-gray-900' : 'text-gray-500 italic'}`}>
                              {opportunity.leadSource || 'Not set'}
                            </p>
                          )}
                        </div>
                        <div className={`bg-gray-50 p-4 rounded-lg border-l-4 border-blue-400 ${isEditMode ? 'ring-2 ring-blue-200' : ''}`}>
                          <label className="text-sm text-gray-500">Lead Creditor</label>
                          {isEditMode ? (
                            <input
                              type="text"
                              value={editForm.leadCreditor}
                              onChange={(e) => setEditForm({ ...editForm, leadCreditor: e.target.value })}
                              placeholder="Enter lead creditor"
                              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                            />
                          ) : (
                            <p className={`font-medium ${opportunity.leadCreditor ? 'text-gray-900' : 'text-gray-500 italic'}`}>
                              {opportunity.leadCreditor || 'Not set'}
                            </p>
                          )}
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg border-l-4 border-blue-400">
                          <label className="text-sm text-gray-500">Account Name</label>
                          <p className="font-medium text-gray-900">
                            {opportunity.account?.name || opportunity.name || 'Not set'}
                          </p>
                        </div>
                        <div className={`bg-gray-50 p-4 rounded-lg border-l-4 border-blue-400 ${isEditMode ? 'ring-2 ring-blue-200' : ''}`}>
                          <label className="text-sm text-gray-500">Amount</label>
                          {isEditMode ? (
                            <div className="relative mt-1">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                              <input
                                type="number"
                                value={editForm.amount}
                                onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                                placeholder="0.00"
                                className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                              />
                            </div>
                          ) : (
                            <p className={`font-medium ${opportunity.amount ? 'text-gray-900' : 'text-gray-500 italic'}`}>
                              {opportunity.amount ? `$${parseFloat(opportunity.amount).toLocaleString()}` : 'Not set'}
                            </p>
                          )}
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg border-l-4 border-blue-400">
                          <label className="text-sm text-gray-500">Prospect Date</label>
                          <p className={`font-medium ${opportunity.createdAt ? 'text-gray-900' : 'text-gray-500 italic'}`}>
                            {opportunity.createdAt
                              ? new Date(opportunity.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                              : 'Not set'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Sales Path - Dynamic based on work type */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-4">Sales Path</h3>
                      {(() => {
                        // Determine the sales path based on opportunity type/work type
                        const workType = opportunity.workType?.toLowerCase() || opportunity.type?.toLowerCase() || '';
                        const isInsurance = workType.includes('insurance') || opportunity.type === 'INSURANCE';
                        const isRetail = workType.includes('retail') || opportunity.type === 'RETAIL';
                        const isInspection = workType.includes('inspection');

                        // Define the paths
                        const insurancePath = [
                          { step: 1, label: 'Call Center', stage: 'LEAD_ASSIGNED' },
                          { step: 2, label: 'Inspection', stage: 'SCHEDULED' },
                          { step: 3, label: 'Claim Filed', stage: 'CLAIM_FILED' },
                          { step: 4, label: 'Adjuster Meeting', stage: 'ADJUSTER_MEETING_COMPLETE' },
                          { step: 5, label: 'Approved', stage: 'APPROVED' },
                          { step: 6, label: 'Contract Signed', stage: 'CONTRACT_SIGNED' },
                          { step: 7, label: 'Production', stage: 'IN_PRODUCTION' },
                          { step: 8, label: 'Completed', stage: 'COMPLETED' },
                        ];

                        const retailPath = [
                          { step: 1, label: 'Call Center', stage: 'LEAD_ASSIGNED' },
                          { step: 2, label: 'Demo Scheduled', stage: 'SCHEDULED' },
                          { step: 3, label: 'Demo Complete', stage: 'INSPECTED' },
                          { step: 4, label: 'Quote Sent', stage: 'APPROVED' },
                          { step: 5, label: 'Contract Signed', stage: 'CONTRACT_SIGNED' },
                          { step: 6, label: 'Production', stage: 'IN_PRODUCTION' },
                          { step: 7, label: 'Completed', stage: 'COMPLETED' },
                        ];

                        const inspectionPath = [
                          { step: 1, label: 'Call Center', stage: 'LEAD_ASSIGNED' },
                          { step: 2, label: 'Inspection Scheduled', stage: 'SCHEDULED' },
                          { step: 3, label: 'Inspection Complete', stage: 'INSPECTED' },
                          { step: 4, label: 'Report Delivered', stage: 'COMPLETED' },
                        ];

                        // Select the appropriate path
                        const currentPath = isInspection ? inspectionPath : isRetail ? retailPath : insurancePath;
                        const pathType = isInspection ? 'Inspection' : isRetail ? 'Retail' : 'Insurance';

                        // Find current step based on stage
                        const stageOrder = ['LEAD_UNASSIGNED', 'LEAD_ASSIGNED', 'SCHEDULED', 'INSPECTED', 'CLAIM_FILED', 'ADJUSTER_MEETING_COMPLETE', 'APPROVED', 'CONTRACT_SIGNED', 'IN_PRODUCTION', 'COMPLETED', 'CLOSED_WON'];
                        const currentStageIndex = stageOrder.indexOf(opportunity.stage);

                        return (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 mb-3">
                              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                isInsurance ? 'bg-blue-100 text-blue-700' :
                                isRetail ? 'bg-green-100 text-green-700' :
                                'bg-amber-100 text-amber-700'
                              }`}>
                                {pathType} Path
                              </span>
                            </div>
                            <div className="flex items-center flex-wrap gap-1">
                              {currentPath.map((item, idx) => {
                                const itemStageIndex = stageOrder.indexOf(item.stage);
                                const isComplete = currentStageIndex >= itemStageIndex;
                                const isCurrent = opportunity.stage === item.stage;

                                return (
                                  <div key={item.step} className="flex items-center">
                                    <div className={`
                                      px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1
                                      ${isCurrent
                                        ? 'bg-panda-primary text-white shadow-md'
                                        : isComplete
                                          ? 'bg-green-100 text-green-700'
                                          : 'bg-gray-100 text-gray-500'
                                      }
                                    `}>
                                      {isComplete && !isCurrent && (
                                        <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                      )}
                                      <span>{item.step}. {item.label}</span>
                                    </div>
                                    {idx < currentPath.length - 1 && (
                                      <ChevronRight className="w-3 h-3 text-gray-300 mx-0.5 flex-shrink-0" />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Address */}
                    {(opportunity.street || opportunity.city || isEditMode) && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-4">Property Address</h3>
                        {isEditMode ? (
                          <div className="bg-gray-50 p-4 rounded-lg border-l-4 border-green-400 ring-2 ring-blue-200 space-y-3">
                            <div>
                              <label className="text-sm text-gray-500">Street Address</label>
                              <input
                                type="text"
                                value={editForm.street}
                                onChange={(e) => setEditForm({ ...editForm, street: e.target.value })}
                                placeholder="123 Main St"
                                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                              />
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <label className="text-sm text-gray-500">City</label>
                                <input
                                  type="text"
                                  value={editForm.city}
                                  onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                                  placeholder="City"
                                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                                />
                              </div>
                              <div>
                                <label className="text-sm text-gray-500">State</label>
                                <input
                                  type="text"
                                  value={editForm.state}
                                  onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                                  placeholder="ST"
                                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                                />
                              </div>
                              <div>
                                <label className="text-sm text-gray-500">ZIP Code</label>
                                <input
                                  type="text"
                                  value={editForm.postalCode}
                                  onChange={(e) => setEditForm({ ...editForm, postalCode: e.target.value })}
                                  placeholder="12345"
                                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-gray-50 p-4 rounded-lg border-l-4 border-green-400">
                            <div className="flex items-start">
                              <MapPin className="w-5 h-5 text-gray-400 mr-3 mt-0.5" />
                              <div>
                                {opportunity.street && <p className="text-gray-900">{opportunity.street}</p>}
                                <p className="text-gray-900">
                                  {[opportunity.city, opportunity.state].filter(Boolean).join(', ')}
                                  {opportunity.postalCode && ` ${opportunity.postalCode}`}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                      </>
                    )}

                    {/* Measurements Sub-tab */}
                    {detailsSubTab === 'measurements' && (
                      <div className="space-y-6">
                        {/* Provider Order Buttons */}
                        <div className="flex flex-wrap gap-3 mb-6">
                          <button
                            onClick={() => {
                              setActiveQuickAction('gafQuickMeasure');
                              setShowQuickActionModal(true);
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium transition-colors"
                          >
                            <Ruler className="w-4 h-4" />
                            Order GAF QuickMeasure
                          </button>
                          <button
                            onClick={() => {
                              setActiveQuickAction('eagleviewMeasure');
                              setShowQuickActionModal(true);
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors"
                          >
                            <Ruler className="w-4 h-4" />
                            Order EagleView
                          </button>
                          <button
                            onClick={() => {
                              setActiveQuickAction('hoverCapture');
                              setShowQuickActionModal(true);
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium transition-colors"
                          >
                            <Camera className="w-4 h-4" />
                            Order Hover 3D
                          </button>
                          <button
                            onClick={() => {
                              // Call mutation directly - no modal needed
                              instantMeasureMutation.mutate();
                            }}
                            disabled={instantMeasureLoading || instantMeasureMutation.isPending}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {(instantMeasureLoading || instantMeasureMutation.isPending) ? (
                              <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                <span>Analyzing...</span>
                              </>
                            ) : (
                              <>
                                <Zap className="w-4 h-4" />
                                <span>Instant Measure</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* Inline Progress Tracker for Instant Measurement */}
                        {(instantMeasureLoading || instantMeasureMutation.isPending) && !instantMeasureResult && (
                          <div className="p-4 bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-xl mb-4">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center space-x-3">
                                <div className="p-2 bg-emerald-100 rounded-lg">
                                  <Zap className="w-5 h-5 text-emerald-600" />
                                </div>
                                <div>
                                  <span className="text-sm font-semibold text-emerald-800">Instant Measurement in Progress</span>
                                  <p className="text-xs text-emerald-600">Analyzing satellite imagery...</p>
                                </div>
                              </div>
                              <span className="text-sm text-emerald-600 font-mono bg-emerald-100 px-2 py-1 rounded">
                                {instantMeasureElapsed}s / ~{INSTANT_MEASURE_ESTIMATED_TIME}s
                              </span>
                            </div>
                            {/* Progress Bar */}
                            <div className="w-full bg-emerald-200 rounded-full h-2.5 overflow-hidden">
                              <div
                                className="bg-gradient-to-r from-emerald-500 to-green-500 h-2.5 rounded-full transition-all duration-300 ease-out"
                                style={{
                                  width: `${Math.min((instantMeasureElapsed / INSTANT_MEASURE_ESTIMATED_TIME) * 100, 95)}%`
                                }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Inline Success Message after Instant Measurement completes */}
                        {instantMeasureResult && (
                          <div className="p-4 bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-300 rounded-xl mb-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <div className="p-2 bg-emerald-100 rounded-lg">
                                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                                </div>
                                <div>
                                  <span className="text-sm font-semibold text-emerald-800">Instant Measurement Complete!</span>
                                  <p className="text-xs text-emerald-600">
                                    {instantMeasureResult.roofData?.totalRoofSquares ?
                                      `${instantMeasureResult.roofData.totalRoofSquares} squares • ${instantMeasureResult.roofData.totalRoofArea?.toLocaleString()} sq ft` :
                                      'Data saved to measurements'}
                                  </p>
                                </div>
                              </div>
                              <button
                                onClick={() => setInstantMeasureResult(null)}
                                className="text-xs text-emerald-600 hover:text-emerald-700 underline"
                              >
                                Dismiss
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Measurement Reports List - All reports including pending */}
                        {/* Measurement Reports List - All reports including pending */}
                        {measurementReports && measurementReports.length > 0 ? (
                          <div className="space-y-4">
                            {measurementReports.map((report) => (
                              <div key={report.id} className="bg-white rounded-xl border border-gray-200 p-6">
                                <div className="flex items-center justify-between mb-4">
                                  <div className="flex items-center gap-3">
                                    <div className={`p-2.5 rounded-lg ${
                                      report.provider === 'EAGLEVIEW'
                                        ? 'bg-blue-100'
                                        : report.provider === 'HOVER'
                                        ? 'bg-purple-100'
                                        : report.provider === 'INSTANT_MEASURE'
                                        ? 'bg-emerald-100'
                                        : 'bg-green-100'
                                    }`}>
                                      {report.provider === 'INSTANT_MEASURE' ? (
                                        <Zap className="w-5 h-5 text-emerald-600" />
                                      ) : (
                                        <Ruler className={`w-5 h-5 ${
                                          report.provider === 'EAGLEVIEW'
                                            ? 'text-blue-600'
                                            : report.provider === 'HOVER'
                                            ? 'text-purple-600'
                                            : 'text-green-600'
                                        }`} />
                                      )}
                                    </div>
                                    <div>
                                      <h3 className="text-lg font-semibold text-gray-900">
                                        {report.provider === 'EAGLEVIEW' ? 'EagleView' :
                                         report.provider === 'HOVER' ? 'Hover 3D' :
                                         report.provider === 'GAF_QUICKMEASURE' ? 'GAF QuickMeasure' :
                                         report.provider === 'INSTANT_MEASURE' ? 'Instant Measurement' : report.provider}
                                      </h3>
                                      <div className="flex items-center gap-2 mt-1">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                          report.provider === 'EAGLEVIEW'
                                            ? 'bg-blue-100 text-blue-700'
                                            : report.provider === 'HOVER'
                                            ? 'bg-purple-100 text-purple-700'
                                            : report.provider === 'INSTANT_MEASURE'
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : 'bg-green-100 text-green-700'
                                        }`}>
                                          {report.provider === 'EAGLEVIEW' ? 'EagleView' :
                                           report.provider === 'HOVER' ? 'Hover 3D' :
                                           report.provider === 'GAF_QUICKMEASURE' ? 'GAF' :
                                           report.provider === 'INSTANT_MEASURE' ? 'Instant' : report.provider}
                                        </span>
                                        {report.orderNumber && (
                                          <span className="text-xs text-gray-500">Order #{report.orderNumber}</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    {/* Status Badge */}
                                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                      report.orderStatus === 'DELIVERED' || report.orderStatus === 'COMPLETED'
                                        ? 'bg-green-100 text-green-700'
                                        : report.orderStatus === 'PROCESSING' || report.orderStatus === 'IN_PROGRESS'
                                        ? 'bg-blue-100 text-blue-700'
                                        : report.orderStatus === 'FAILED' || report.orderStatus === 'ERROR'
                                        ? 'bg-red-100 text-red-700'
                                        : report.orderStatus === 'PENDING' || report.orderStatus === 'ORDERED'
                                        ? 'bg-yellow-100 text-yellow-700'
                                        : 'bg-gray-100 text-gray-700'
                                    }`}>
                                      {report.orderStatus === 'DELIVERED' || report.orderStatus === 'COMPLETED' ? 'Delivered' :
                                       report.orderStatus === 'PROCESSING' || report.orderStatus === 'IN_PROGRESS' ? 'Processing' :
                                       report.orderStatus === 'FAILED' || report.orderStatus === 'ERROR' ? 'Failed' :
                                       report.orderStatus === 'PENDING' || report.orderStatus === 'ORDERED' ? 'Pending' :
                                       report.orderStatus || 'Unknown'}
                                    </span>
                                  </div>
                                </div>

                                {/* Show pending status with spinner for non-delivered orders */}
                                {report.orderStatus !== 'DELIVERED' && report.orderStatus !== 'COMPLETED' && (
                                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg mb-4">
                                    <div className="flex items-center text-yellow-700">
                                      <svg className="w-5 h-5 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                      </svg>
                                      <span className="font-medium">
                                        {report.orderStatus === 'PROCESSING' || report.orderStatus === 'IN_PROGRESS'
                                          ? 'Report being generated...'
                                          : 'Waiting for measurement report...'}
                                      </span>
                                    </div>
                                    <div className="mt-2 text-sm text-yellow-600">
                                      <p>Ordered: {report.orderedAt ? new Date(report.orderedAt).toLocaleDateString() : report.createdAt ? new Date(report.createdAt).toLocaleDateString() : 'N/A'}</p>
                                    </div>
                                  </div>
                                )}

                                {/* Action Buttons - only show if delivered */}
                                {(report.orderStatus === 'DELIVERED' || report.orderStatus === 'COMPLETED') && (
                                  <>
                                    <div className="flex flex-wrap gap-3 mb-6 pb-6 border-b border-gray-200">
                                      {report.reportPdfUrl && (
                                        <a
                                          href={report.reportPdfUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-2 px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 text-sm font-medium transition-colors"
                                        >
                                          <Download className="w-4 h-4" />
                                          Download PDF Report
                                        </a>
                                      )}
                                      {report.modelViewerUrl && (
                                        <a
                                          href={report.modelViewerUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium transition-colors"
                                        >
                                          <Camera className="w-4 h-4" />
                                          View 3D Model
                                        </a>
                                      )}
                                      {report.designViewerUrl && (
                                        <a
                                          href={report.designViewerUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-2 px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 text-sm font-medium transition-colors"
                                        >
                                          <Eye className="w-4 h-4" />
                                          Design Visualizer
                                        </a>
                                      )}
                                    </div>

                                    {/* Measurement Data - Provider-aware display */}
                                    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                                      {report.provider === 'INSTANT_MEASURE' ? (
                                        /* INSTANT_MEASURE - Full display with all linear measurements */
                                        <div className="grid grid-cols-2 divide-x divide-gray-200">
                                          {/* Left Column */}
                                          <div className="divide-y divide-gray-200">
                                            {/* Total Roof Area */}
                                            <div className="px-4 py-3 flex justify-between items-center">
                                              <span className="text-sm text-gray-500">Total Roof Area</span>
                                              <span className="text-sm font-medium text-gray-900">
                                                {report.totalRoofArea ? `${report.totalRoofArea.toLocaleString()} sq ft` : '—'}
                                              </span>
                                            </div>
                                            {/* Roof Squares */}
                                            <div className="px-4 py-3 flex justify-between items-center">
                                              <span className="text-sm text-gray-500">Roof Squares</span>
                                              <span className="text-sm font-medium text-gray-900">
                                                {report.totalRoofSquares ? report.totalRoofSquares.toFixed(2) : '—'}
                                              </span>
                                            </div>
                                            {/* Predominant Pitch */}
                                            <div className="px-4 py-3 flex justify-between items-center">
                                              <span className="text-sm text-gray-500">Predominant Pitch</span>
                                              <span className="text-sm font-medium text-gray-900">
                                                {report.predominantPitch || '—'}
                                              </span>
                                            </div>
                                            {/* Facets */}
                                            <div className="px-4 py-3 flex justify-between items-center">
                                              <span className="text-sm text-gray-500">Roof Facets</span>
                                              <span className="text-sm font-medium text-gray-900">
                                                {report.facets || (report.rawData?.facets) || '—'}
                                              </span>
                                            </div>
                                            {/* Roof Complexity */}
                                            <div className="px-4 py-3 flex justify-between items-center">
                                              <span className="text-sm text-gray-500">Complexity</span>
                                              <span className={`text-sm font-medium px-2 py-0.5 rounded ${
                                                report.roofComplexity === 'SIMPLE' ? 'bg-green-100 text-green-700' :
                                                report.roofComplexity === 'MODERATE' ? 'bg-yellow-100 text-yellow-700' :
                                                report.roofComplexity === 'COMPLEX' ? 'bg-orange-100 text-orange-700' :
                                                report.roofComplexity === 'VERY_COMPLEX' ? 'bg-red-100 text-red-700' :
                                                'text-gray-900'
                                              }`}>
                                                {report.roofComplexity ? report.roofComplexity.replace('_', ' ') : '—'}
                                              </span>
                                            </div>
                                            {/* Suggested Waste */}
                                            <div className="px-4 py-3 flex justify-between items-center">
                                              <span className="text-sm text-gray-500">Suggested Waste</span>
                                              <span className="text-sm font-medium text-gray-900">
                                                {report.suggestedWasteFactor ? `${report.suggestedWasteFactor}%` : '—'}
                                              </span>
                                            </div>
                                          </div>
                                          {/* Right Column - Linear Measurements */}
                                          <div className="divide-y divide-gray-200">
                                            {/* Ridges */}
                                            <div className="px-4 py-3 flex justify-between items-center">
                                              <span className="text-sm text-gray-500">Ridges</span>
                                              <span className="text-sm font-medium text-gray-900">
                                                {report.ridgeLength ? `${report.ridgeLength.toFixed(1)} ft` : '—'}
                                              </span>
                                            </div>
                                            {/* Hips */}
                                            <div className="px-4 py-3 flex justify-between items-center">
                                              <span className="text-sm text-gray-500">Hips</span>
                                              <span className="text-sm font-medium text-gray-900">
                                                {report.hipLength ? `${report.hipLength.toFixed(1)} ft` : '—'}
                                              </span>
                                            </div>
                                            {/* Valleys */}
                                            <div className="px-4 py-3 flex justify-between items-center">
                                              <span className="text-sm text-gray-500">Valleys</span>
                                              <span className="text-sm font-medium text-gray-900">
                                                {report.valleyLength != null ? `${report.valleyLength.toFixed(1)} ft` : '—'}
                                              </span>
                                            </div>
                                            {/* Rakes */}
                                            <div className="px-4 py-3 flex justify-between items-center">
                                              <span className="text-sm text-gray-500">Rakes</span>
                                              <span className="text-sm font-medium text-gray-900">
                                                {report.rakeLength ? `${report.rakeLength.toFixed(1)} ft` : '—'}
                                              </span>
                                            </div>
                                            {/* Eaves */}
                                            <div className="px-4 py-3 flex justify-between items-center">
                                              <span className="text-sm text-gray-500">Eaves</span>
                                              <span className="text-sm font-medium text-gray-900">
                                                {report.eaveLength ? `${report.eaveLength.toFixed(1)} ft` : '—'}
                                              </span>
                                            </div>
                                            {/* Drip Edge */}
                                            <div className="px-4 py-3 flex justify-between items-center">
                                              <span className="text-sm text-gray-500">Drip Edge</span>
                                              <span className="text-sm font-medium text-gray-900">
                                                {report.dripEdgeLength ? `${report.dripEdgeLength.toFixed(1)} ft` : '—'}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                      ) : (
                                        /* Professional reports (EagleView, GAF, Hover) - Full display */
                                        <div className="grid grid-cols-2 divide-x divide-gray-200">
                                          {/* Left Column */}
                                          <div className="divide-y divide-gray-200">
                                            {/* Measurement Type Row */}
                                            <div className="px-4 py-3 flex justify-between items-center">
                                              <span className="text-sm text-gray-500">Measurement Type</span>
                                              <span className="text-sm font-medium text-gray-900">
                                                {report.provider === 'EAGLEVIEW' ? 'EagleView' :
                                                 report.provider === 'GAF_QUICKMEASURE' ? 'GAF QuickMeasure' :
                                                 report.provider === 'HOVER' ? 'Hover 3D' :
                                                 report.provider || 'Report'}
                                              </span>
                                            </div>
                                            {/* Total Roof Area */}
                                            <div className="px-4 py-3 flex justify-between items-center">
                                              <span className="text-sm text-gray-500">Total Roof Area</span>
                                              <span className="text-sm font-medium text-gray-900">
                                                {report.totalRoofArea ? report.totalRoofArea.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                                              </span>
                                            </div>
                                            {/* Recommended Waste */}
                                            <div className="px-4 py-3 flex justify-between items-center">
                                              <span className="text-sm text-gray-500">Recommended Waste</span>
                                              <span className="text-sm font-medium text-gray-900">
                                                {report.suggestedWasteFactor ? `${report.suggestedWasteFactor}%` : '—'}
                                              </span>
                                            </div>
                                            {/* Ridges */}
                                            <div className="px-4 py-3 flex justify-between items-center">
                                              <span className="text-sm text-gray-500">Ridges</span>
                                              <span className="text-sm font-medium text-gray-900">
                                                {report.ridgeLength ? report.ridgeLength.toFixed(2) : '—'}
                                              </span>
                                            </div>
                                            {/* Rakes */}
                                            <div className="px-4 py-3 flex justify-between items-center">
                                              <span className="text-sm text-gray-500">Rakes</span>
                                              <span className="text-sm font-medium text-gray-900">
                                                {report.rakeLength ? report.rakeLength.toFixed(2) : '—'}
                                              </span>
                                            </div>
                                            {/* Hips */}
                                            <div className="px-4 py-3 flex justify-between items-center">
                                              <span className="text-sm text-gray-500">Hips</span>
                                              <span className="text-sm font-medium text-gray-900">
                                                {report.hipLength ? report.hipLength.toFixed(2) : '—'}
                                              </span>
                                            </div>
                                            {/* Flashing */}
                                            <div className="px-4 py-3 flex justify-between items-center">
                                              <span className="text-sm text-gray-500">Flashing</span>
                                              <span className="text-sm font-medium text-gray-900">
                                                {report.flashingLength ? report.flashingLength.toFixed(2) : '—'}
                                              </span>
                                            </div>
                                          </div>
                                          {/* Right Column */}
                                          <div className="divide-y divide-gray-200">
                                            {/* Report Download Link */}
                                            <div className="px-4 py-3 flex justify-between items-center">
                                              <span className="text-sm text-gray-500">Report Download</span>
                                              <span className="text-sm font-medium">
                                                {report.reportPdfUrl ? (
                                                  <a
                                                    href={report.reportPdfUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-600 hover:text-blue-800 hover:underline"
                                                  >
                                                    Download PDF
                                                  </a>
                                                ) : '—'}
                                              </span>
                                            </div>
                                            {/* Roof Squares */}
                                            <div className="px-4 py-3 flex justify-between items-center">
                                              <span className="text-sm text-gray-500">Roof Squares</span>
                                              <span className="text-sm font-medium text-gray-900">
                                                {report.totalRoofSquares ? report.totalRoofSquares.toFixed(2) : '—'}
                                              </span>
                                            </div>
                                            {/* Predominant Pitch */}
                                            <div className="px-4 py-3 flex justify-between items-center">
                                              <span className="text-sm text-gray-500">Predominant Pitch</span>
                                              <span className="text-sm font-medium text-gray-900">
                                                {report.predominantPitch || '—'}
                                              </span>
                                            </div>
                                            {/* Valleys */}
                                            <div className="px-4 py-3 flex justify-between items-center">
                                              <span className="text-sm text-gray-500">Valleys</span>
                                              <span className="text-sm font-medium text-gray-900">
                                                {report.valleyLength != null ? report.valleyLength.toFixed(2) : '—'}
                                              </span>
                                            </div>
                                            {/* Eaves */}
                                            <div className="px-4 py-3 flex justify-between items-center">
                                              <span className="text-sm text-gray-500">Eaves</span>
                                              <span className="text-sm font-medium text-gray-900">
                                                {report.eaveLength ? report.eaveLength.toFixed(2) : '—'}
                                              </span>
                                            </div>
                                            {/* Drip Edge */}
                                            <div className="px-4 py-3 flex justify-between items-center">
                                              <span className="text-sm text-gray-500">Drip Edge</span>
                                              <span className="text-sm font-medium text-gray-900">
                                                {report.dripEdgeLength ? report.dripEdgeLength.toFixed(2) : '—'}
                                              </span>
                                            </div>
                                            {/* Step Flashing */}
                                            <div className="px-4 py-3 flex justify-between items-center">
                                              <span className="text-sm text-gray-500">Step Flashing</span>
                                              <span className="text-sm font-medium text-gray-900">
                                                {report.stepFlashingLength ? report.stepFlashingLength.toFixed(2) : '—'}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>

                                    {/* Footer with dates */}
                                    <div className="mt-6 pt-4 border-t border-gray-200 flex items-center justify-between text-sm text-gray-500">
                                      {report.deliveredAt && (
                                        <p>Report delivered: {new Date(report.deliveredAt).toLocaleDateString()}</p>
                                      )}
                                    </div>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          /* No Measurement Reports - Show empty state OR instant measure results */
                          <>
                            {/* Inline Instant Measure Progress Tracker - shown during loading */}
                            {(instantMeasureLoading || instantMeasureMutation.isPending) && !instantMeasureResult && (
                              <div className="mt-6 p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg">
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center space-x-2">
                                    <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                                    <span className="text-sm font-medium text-green-700">Analyzing satellite imagery...</span>
                                  </div>
                                  <span className="text-sm text-green-600 font-mono">
                                    {instantMeasureElapsed}s / ~{INSTANT_MEASURE_ESTIMATED_TIME}s
                                  </span>
                                </div>
                                {/* Progress Bar */}
                                <div className="w-full bg-green-200 rounded-full h-2.5 overflow-hidden">
                                  <div
                                    className="bg-gradient-to-r from-green-500 to-emerald-500 h-2.5 rounded-full transition-all duration-300 ease-out"
                                    style={{
                                      width: `${Math.min((instantMeasureElapsed / INSTANT_MEASURE_ESTIMATED_TIME) * 100, 95)}%`
                                    }}
                                  />
                                </div>
                                <div className="mt-2 text-xs text-green-600">
                                  <span>Getting roof measurements from Google Solar API</span>
                                </div>
                              </div>
                            )}

                            {/* Inline Instant Measure Results - Salesforce-style two-column layout */}
                            {instantMeasureResult && (
                              <div className="mt-6 bg-white border border-gray-200 rounded-xl overflow-hidden">
                                {/* Header */}
                                <div className="px-4 py-3 bg-gradient-to-r from-emerald-50 to-green-50 border-b border-gray-200 flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <CheckCircle className="w-5 h-5 text-green-600" />
                                    <h4 className="font-semibold text-gray-900">Instant Measurement Results</h4>
                                  </div>
                                  <button
                                    onClick={() => setInstantMeasureResult(null)}
                                    className="text-gray-400 hover:text-gray-600"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>

                                {/* Two-column Salesforce-style layout */}
                                <div className="grid grid-cols-2 divide-x divide-gray-200">
                                  {/* Left Column */}
                                  <div className="divide-y divide-gray-200">
                                    <div className="px-4 py-3 flex justify-between items-center">
                                      <span className="text-sm text-gray-500">Measurement Type</span>
                                      <span className="text-sm font-medium text-gray-900">Instant Measure</span>
                                    </div>
                                    <div className="px-4 py-3 flex justify-between items-center">
                                      <span className="text-sm text-gray-500">Total Roof Area</span>
                                      <span className="text-sm font-medium text-gray-900">
                                        {instantMeasureResult.roofData?.totalRoofArea
                                          ? instantMeasureResult.roofData.totalRoofArea.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                          : '—'}
                                      </span>
                                    </div>
                                    <div className="px-4 py-3 flex justify-between items-center">
                                      <span className="text-sm text-gray-500">Recommended Waste</span>
                                      <span className="text-sm font-medium text-gray-900">
                                        {instantMeasureResult.suggestedWasteFactor
                                          ? `${(instantMeasureResult.suggestedWasteFactor * 100).toFixed(0)}%`
                                          : '—'}
                                      </span>
                                    </div>
                                    <div className="px-4 py-3 flex justify-between items-center">
                                      <span className="text-sm text-gray-500">Ridges (est.)</span>
                                      <span className="text-sm font-medium text-gray-900">
                                        {instantMeasureResult.ridgeLength
                                          ? `${instantMeasureResult.ridgeLength.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ft`
                                          : '—'}
                                      </span>
                                    </div>
                                    <div className="px-4 py-3 flex justify-between items-center">
                                      <span className="text-sm text-gray-500">Rakes (est.)</span>
                                      <span className="text-sm font-medium text-gray-900">
                                        {instantMeasureResult.rakeLength
                                          ? `${instantMeasureResult.rakeLength.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ft`
                                          : '—'}
                                      </span>
                                    </div>
                                    <div className="px-4 py-3 flex justify-between items-center">
                                      <span className="text-sm text-gray-500">Hips (est.)</span>
                                      <span className="text-sm font-medium text-gray-900">
                                        {instantMeasureResult.hipLength
                                          ? `${instantMeasureResult.hipLength.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ft`
                                          : '—'}
                                      </span>
                                    </div>
                                    <div className="px-4 py-3 flex justify-between items-center">
                                      <span className="text-sm text-gray-500">Flashing (est.)</span>
                                      <span className="text-sm font-medium text-gray-900">
                                        {instantMeasureResult.flashingLength
                                          ? `${instantMeasureResult.flashingLength.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ft`
                                          : '—'}
                                      </span>
                                    </div>
                                  </div>
                                  {/* Right Column */}
                                  <div className="divide-y divide-gray-200">
                                    <div className="px-4 py-3 flex justify-between items-center">
                                      <span className="text-sm text-gray-500">Imagery Date</span>
                                      <span className="text-sm font-medium text-gray-900">
                                        {instantMeasureResult.imageryDate || '—'}
                                      </span>
                                    </div>
                                    <div className="px-4 py-3 flex justify-between items-center">
                                      <span className="text-sm text-gray-500">Roof Squares</span>
                                      <span className="text-sm font-medium text-gray-900">
                                        {instantMeasureResult.roofData?.totalRoofSquares
                                          ? instantMeasureResult.roofData.totalRoofSquares.toFixed(2)
                                          : '—'}
                                      </span>
                                    </div>
                                    <div className="px-4 py-3 flex justify-between items-center">
                                      <span className="text-sm text-gray-500">Predominant Pitch</span>
                                      <span className="text-sm font-medium text-gray-900">
                                        {instantMeasureResult.predominantPitchDisplay || instantMeasureResult.predominantPitch || '—'}
                                      </span>
                                    </div>
                                    <div className="px-4 py-3 flex justify-between items-center">
                                      <span className="text-sm text-gray-500">Valleys (est.)</span>
                                      <span className="text-sm font-medium text-gray-900">
                                        {instantMeasureResult.valleyLength
                                          ? `${instantMeasureResult.valleyLength.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ft`
                                          : '—'}
                                      </span>
                                    </div>
                                    <div className="px-4 py-3 flex justify-between items-center">
                                      <span className="text-sm text-gray-500">Eaves (est.)</span>
                                      <span className="text-sm font-medium text-gray-900">
                                        {instantMeasureResult.eaveLength
                                          ? `${instantMeasureResult.eaveLength.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ft`
                                          : '—'}
                                      </span>
                                    </div>
                                    <div className="px-4 py-3 flex justify-between items-center">
                                      <span className="text-sm text-gray-500">Drip Edge (est.)</span>
                                      <span className="text-sm font-medium text-gray-900">
                                        {instantMeasureResult.dripEdgeLength
                                          ? `${instantMeasureResult.dripEdgeLength.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ft`
                                          : '—'}
                                      </span>
                                    </div>
                                    <div className="px-4 py-3 flex justify-between items-center">
                                      <span className="text-sm text-gray-500">Step Flashing (est.)</span>
                                      <span className="text-sm font-medium text-gray-900">
                                        {instantMeasureResult.stepFlashingLength
                                          ? `${instantMeasureResult.stepFlashingLength.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ft`
                                          : '—'}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Roof Segments Details - Collapsible */}
                                {instantMeasureResult.roofData?.facets && instantMeasureResult.roofData.facets.length > 0 && (
                                  <details className="border-t border-gray-200">
                                    <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-between">
                                      <span>Roof Segments ({instantMeasureResult.roofData.facetCount || instantMeasureResult.roofData.facets.length})</span>
                                      <span className="text-gray-400 text-xs">Click to expand</span>
                                    </summary>
                                    <div className="p-4 pt-0">
                                      <table className="min-w-full text-xs">
                                        <thead className="bg-gray-100">
                                          <tr>
                                            <th className="px-2 py-1 text-left">Segment</th>
                                            <th className="px-2 py-1 text-right">Area (sq ft)</th>
                                            <th className="px-2 py-1 text-right">Pitch</th>
                                            <th className="px-2 py-1 text-right">Direction</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {instantMeasureResult.roofData.facets.map((facet, idx) => (
                                            <tr key={idx} className="border-b border-gray-100">
                                              <td className="px-2 py-1">{idx + 1}</td>
                                              <td className="px-2 py-1 text-right">{facet.areaSqFt?.toLocaleString()}</td>
                                              <td className="px-2 py-1 text-right">{facet.pitchDegrees}° ({facet.pitchRatio})</td>
                                              <td className="px-2 py-1 text-right">{facet.direction}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </details>
                                )}

                                {/* Footer */}
                                <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between text-xs text-gray-500">
                                  <div className="flex items-center gap-3">
                                    <span>Source: {instantMeasureResult.imagerySource || (instantMeasureResult.provider === 'FREE_NAIP' ? 'NAIP (USDA)' : 'Google Solar API')}</span>
                                    {/* PDF Report download link if available */}
                                    {(instantMeasureResult.reportPdfUrl || instantMeasureResult.reportUrl) && (
                                      <a
                                        href={instantMeasureResult.reportPdfUrl || instantMeasureResult.reportUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 font-medium"
                                      >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                                          <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clipRule="evenodd" />
                                        </svg>
                                        PDF Report
                                      </a>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3">
                                    {instantMeasureResult.roofComplexity && (
                                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                        instantMeasureResult.roofComplexity === 'SIMPLE' ? 'bg-green-100 text-green-700' :
                                        instantMeasureResult.roofComplexity === 'MODERATE' ? 'bg-yellow-100 text-yellow-700' :
                                        instantMeasureResult.roofComplexity === 'COMPLEX' ? 'bg-orange-100 text-orange-700' :
                                        instantMeasureResult.roofComplexity === 'VERY_COMPLEX' ? 'bg-red-100 text-red-700' :
                                        'bg-gray-100 text-gray-700'
                                      }`}>
                                        {instantMeasureResult.roofComplexity.replace('_', ' ')}
                                      </span>
                                    )}
                                    <span>Quality: {instantMeasureResult.imageryQuality || instantMeasureResult.sources?.naip?.imageryQuality || instantMeasureResult.sources?.googleSolar?.imageryQuality || 'HIGH'}</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Contacts sub-tab under Details */}
                {activeTab === 'details' && detailsSubTab === 'contacts' && (
                  <div className="space-y-4">
                    {/* Header with Add Contact Button */}
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-900">Contacts</h3>
                      <button
                        onClick={() => {
                          setActiveQuickAction('addContact');
                          setShowQuickActionModal(true);
                        }}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-panda-primary text-white rounded-lg hover:bg-panda-dark text-sm"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add Contact</span>
                      </button>
                    </div>

                    {contacts && contacts.length > 0 ? contacts.map((contact, index) => {
                      // Build address string
                      const addressParts = [
                        contact.mailingStreet || contact.street,
                        contact.mailingCity || contact.city,
                        contact.mailingState || contact.state,
                        contact.mailingPostalCode || contact.postalCode
                      ].filter(Boolean);
                      const fullAddress = addressParts.join(', ');
                      const googleMapsUrl = fullAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}` : null;

                      // Contact is Primary if isPrimaryContact (linked on opportunity), isPrimary flag, or first in list
                      const isPrimary = contact.isPrimaryContact || contact.isPrimary || index === 0;

                      return (
                        <div
                          key={contact.id}
                          className="block border border-gray-200 rounded-lg p-4 hover:border-panda-primary transition-colors"
                        >
                          <div className="flex items-start space-x-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                              <span className="text-white text-sm font-medium">
                                {contact.firstName?.charAt(0)}{contact.lastName?.charAt(0)}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2">
                                <Link to={`/contacts/${contact.id}`} className="font-medium text-gray-900 hover:text-panda-primary">
                                  {contact.firstName} {contact.lastName}
                                </Link>
                                {isPrimary && (
                                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">Primary</span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 mt-1">
                                {contact.email && (
                                  <span className="flex items-center">
                                    <Mail className="w-3 h-3 mr-1" />
                                    {contact.email}
                                  </span>
                                )}
                                {(contact.phone || contact.mobilePhone) && (
                                  <span className="flex items-center">
                                    <Phone className="w-3 h-3 mr-1" />
                                    {contact.mobilePhone || contact.phone}
                                  </span>
                                )}
                              </div>
                              {/* Address with Google Maps link */}
                              {fullAddress && (
                                <div className="mt-2">
                                  <a
                                    href={googleMapsUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center text-sm text-gray-500 hover:text-panda-primary"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <MapPin className="w-3 h-3 mr-1 flex-shrink-0" />
                                    <span className="truncate">{fullAddress}</span>
                                    <ExternalLink className="w-3 h-3 ml-1 flex-shrink-0" />
                                  </a>
                                </div>
                              )}
                            </div>
                            {/* Edit button */}
                            <Link
                              to={`/contacts/${contact.id}`}
                              className="p-2 text-gray-400 hover:text-panda-primary hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                              title="Edit Contact"
                            >
                              <Edit className="w-4 h-4" />
                            </Link>
                          </div>
                        </div>
                      );
                    }) : (
                      <div className="text-center py-8 text-gray-500">
                        <Users className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                        <p>No contacts found</p>
                        <button
                          onClick={() => {
                            setActiveQuickAction('addContact');
                            setShowQuickActionModal(true);
                          }}
                          className="mt-4 text-panda-primary hover:underline"
                        >
                          + Add Contact
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Job Team sub-tab under Details */}
                {activeTab === 'details' && detailsSubTab === 'jobTeam' && (
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-900">Job Team</h3>
                    </div>

                    {/* Team Members */}
                    <div className="space-y-3">
                      {/* Sales Rep / Owner */}
                      {opportunity?.owner && (
                        <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-panda-primary transition-colors">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                              <span className="text-white text-sm font-medium">
                                {opportunity.owner.firstName?.charAt(0)}{opportunity.owner.lastName?.charAt(0)}
                              </span>
                            </div>
                            <div>
                              <Link
                                to={`/users/${opportunity.owner.id}`}
                                className="font-medium text-gray-900 hover:text-panda-primary"
                              >
                                {opportunity.owner.firstName} {opportunity.owner.lastName}
                              </Link>
                              <p className="text-sm text-gray-500">Sales Rep</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            {opportunity.owner.phone && (
                              <a
                                href={`tel:${opportunity.owner.phone}`}
                                className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                title="Call"
                              >
                                <Phone className="w-4 h-4" />
                              </a>
                            )}
                            {opportunity.owner.email && (
                              <a
                                href={`mailto:${opportunity.owner.email}`}
                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Email"
                              >
                                <Mail className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Project Manager */}
                      {opportunity?.projectManager && (
                        <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-panda-primary transition-colors">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-violet-500 flex items-center justify-center">
                              <span className="text-white text-sm font-medium">
                                {opportunity.projectManager.firstName?.charAt(0)}{opportunity.projectManager.lastName?.charAt(0)}
                              </span>
                            </div>
                            <div>
                              <Link
                                to={`/users/${opportunity.projectManager.id}`}
                                className="font-medium text-gray-900 hover:text-panda-primary"
                              >
                                {opportunity.projectManager.firstName} {opportunity.projectManager.lastName}
                              </Link>
                              <p className="text-sm text-gray-500">Project Manager</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            {opportunity.projectManager.phone && (
                              <a
                                href={`tel:${opportunity.projectManager.phone}`}
                                className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                title="Call"
                              >
                                <Phone className="w-4 h-4" />
                              </a>
                            )}
                            {opportunity.projectManager.email && (
                              <a
                                href={`mailto:${opportunity.projectManager.email}`}
                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Email"
                              >
                                <Mail className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Onboarded By */}
                      {opportunity?.onboardedBy && (
                        <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-panda-primary transition-colors">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                              <span className="text-white text-sm font-medium">
                                {opportunity.onboardedBy.firstName?.charAt(0)}{opportunity.onboardedBy.lastName?.charAt(0)}
                              </span>
                            </div>
                            <div>
                              <Link
                                to={`/users/${opportunity.onboardedBy.id}`}
                                className="font-medium text-gray-900 hover:text-panda-primary"
                              >
                                {opportunity.onboardedBy.firstName} {opportunity.onboardedBy.lastName}
                              </Link>
                              <p className="text-sm text-gray-500">Onboarding</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            {opportunity.onboardedBy.phone && (
                              <a
                                href={`tel:${opportunity.onboardedBy.phone}`}
                                className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                title="Call"
                              >
                                <Phone className="w-4 h-4" />
                              </a>
                            )}
                            {opportunity.onboardedBy.email && (
                              <a
                                href={`mailto:${opportunity.onboardedBy.email}`}
                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Email"
                              >
                                <Mail className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Approved By */}
                      {opportunity?.approvedBy && (
                        <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-panda-primary transition-colors">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center">
                              <span className="text-white text-sm font-medium">
                                {opportunity.approvedBy.firstName?.charAt(0)}{opportunity.approvedBy.lastName?.charAt(0)}
                              </span>
                            </div>
                            <div>
                              <Link
                                to={`/users/${opportunity.approvedBy.id}`}
                                className="font-medium text-gray-900 hover:text-panda-primary"
                              >
                                {opportunity.approvedBy.firstName} {opportunity.approvedBy.lastName}
                              </Link>
                              <p className="text-sm text-gray-500">Approver</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            {opportunity.approvedBy.phone && (
                              <a
                                href={`tel:${opportunity.approvedBy.phone}`}
                                className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                title="Call"
                              >
                                <Phone className="w-4 h-4" />
                              </a>
                            )}
                            {opportunity.approvedBy.email && (
                              <a
                                href={`mailto:${opportunity.approvedBy.email}`}
                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Email"
                              >
                                <Mail className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Empty State */}
                      {!opportunity?.owner && !opportunity?.projectManager && !opportunity?.onboardedBy && !opportunity?.approvedBy && (
                        <div className="text-center py-8 text-gray-500">
                          <UserCircle className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                          <p>No team members assigned</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'schedule' && (
                  <div className="space-y-4">
                    {/* Add Appointment button at top */}
                    <div className="flex justify-end">
                      <button
                        onClick={() => {
                          setActiveQuickAction({
                            type: 'scheduleAppointment',
                            existingWorkOrderId: workOrders?.[0]?.id || null,
                          });
                          setShowQuickActionModal(true);
                        }}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-panda-primary text-white rounded-lg hover:bg-panda-dark text-sm"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Schedule Appointment</span>
                      </button>
                    </div>

                    {appointments && appointments.length > 0 ? appointments.map((apt) => (
                      <div key={apt.id} className="border border-gray-200 rounded-lg p-4 hover:border-panda-primary transition-colors">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-3">
                            <Calendar className="w-5 h-5 text-gray-400" />
                            <button
                              onClick={() => {
                                setSelectedAppointmentDetail(apt);
                                setShowAppointmentDetailModal(true);
                              }}
                              className="font-medium text-panda-primary hover:text-panda-dark hover:underline"
                            >
                              {apt.appointmentNumber || `SA-${apt.id.slice(-5)}`}
                            </button>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              apt.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                              apt.status === 'DISPATCHED' ? 'bg-purple-100 text-purple-800' :
                              apt.status === 'SCHEDULED' ? 'bg-yellow-100 text-yellow-800' :
                              apt.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' :
                              apt.status === 'CANCELED' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {apt.status || 'None'}
                            </span>
                            {/* Dispatch Button - shown when status is SCHEDULED or NONE */}
                            {(apt.status === 'SCHEDULED' || apt.status === 'NONE' || !apt.status) && (
                              <button
                                onClick={async () => {
                                  if (window.confirm(`Dispatch appointment ${apt.appointmentNumber || apt.workType?.name || 'this appointment'}? This will notify the assigned resource.`)) {
                                    try {
                                      await updateAppointmentMutation.mutateAsync({
                                        appointmentId: apt.id,
                                        data: {
                                          status: 'DISPATCHED',
                                          earliestStart: apt.earliestStart,
                                          dueDate: apt.dueDate,
                                          scheduledStart: apt.scheduledStart,
                                          scheduledEnd: apt.scheduledEnd,
                                        }
                                      });
                                      setActionSuccess(`Appointment dispatched successfully${apt.assignedResource ? ' to ' + apt.assignedResource.name : ''}`);
                                      setTimeout(() => setActionSuccess(null), 3000);
                                    } catch (error) {
                                      setActionError(error.message || 'Failed to dispatch appointment');
                                    }
                                  }
                                }}
                                disabled={updateAppointmentMutation.isPending}
                                className="px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 transition-colors disabled:opacity-50 flex items-center space-x-1"
                              >
                                <Send className="w-3 h-3" />
                                <span>Dispatch</span>
                              </button>
                            )}
                            {/* Assign Crew Button */}
                            <button
                              onClick={() => {
                                setSelectedAppointmentForCrew(apt);
                                setShowCrewModal(true);
                              }}
                              className="px-2 py-1 text-xs bg-panda-light text-panda-primary rounded hover:bg-panda-primary hover:text-white transition-colors"
                            >
                              {apt.assignedResource ? 'Change Crew' : 'Assign Crew'}
                            </button>
                            {/* Edit Button */}
                            <button
                              onClick={() => {
                                // Convert ISO dates to datetime-local format
                                const toLocalDateTime = (isoStr) => {
                                  if (!isoStr) return '';
                                  const date = new Date(isoStr);
                                  return date.toISOString().slice(0, 16);
                                };
                                setAppointmentForm({
                                  earliestStart: toLocalDateTime(apt.earliestStart),
                                  dueDate: toLocalDateTime(apt.dueDate),
                                  scheduledStart: toLocalDateTime(apt.scheduledStart),
                                  scheduledEnd: toLocalDateTime(apt.scheduledEnd),
                                  status: apt.status || 'SCHEDULED',
                                  workTypeId: apt.workType?.id || '',
                                });
                                setActiveQuickAction({ type: 'editAppointment', appointment: apt });
                                setShowQuickActionModal(true);
                              }}
                              className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors"
                            >
                              <Edit className="w-3 h-3" />
                            </button>
                            {/* Delete Button */}
                            <button
                              onClick={() => {
                                if (window.confirm(`Are you sure you want to delete appointment ${apt.appointmentNumber || 'this appointment'}?`)) {
                                  deleteAppointmentMutation.mutate(apt.id);
                                }
                              }}
                              disabled={deleteAppointmentMutation.isPending}
                              className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors disabled:opacity-50"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        <div className="ml-8 space-y-2 text-sm">
                          <p className="text-gray-900">{apt.workType?.name || apt.subject || 'Service Appointment'}</p>
                          <div className="flex items-center text-gray-500">
                            <Clock className="w-4 h-4 mr-1" />
                            {apt.scheduledStart ? (
                              <span>
                                {new Date(apt.scheduledStart).toLocaleDateString('en-US', {
                                  weekday: 'short', month: 'short', day: 'numeric'
                                })} at {new Date(apt.scheduledStart).toLocaleTimeString('en-US', {
                                  hour: 'numeric', minute: '2-digit'
                                })}
                              </span>
                            ) : (
                              <span>Not scheduled</span>
                            )}
                          </div>
                          {apt.assignedResource && (
                            <div className="flex items-center text-green-600 font-medium">
                              <Users className="w-4 h-4 mr-1" />
                              <span>{apt.assignedResource.name}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )) : (
                      <div className="text-center py-8 text-gray-500">
                        <Calendar className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                        <p>No appointments scheduled</p>
                        <button
                          onClick={() => {
                            // Always use scheduleAppointment - pass existing work order if available
                            setActiveQuickAction({
                              type: 'scheduleAppointment',
                              existingWorkOrderId: workOrders?.[0]?.id || null,
                            });
                            setShowQuickActionModal(true);
                          }}
                          className="mt-4 text-panda-primary hover:underline"
                        >
                          + Schedule Appointment
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'contacts' && (
                  <div className="space-y-4">
                    {/* Header with Add Contact Button */}
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-900">Contacts</h3>
                      <button
                        onClick={() => {
                          setActiveQuickAction('addContact');
                          setShowQuickActionModal(true);
                        }}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-panda-primary text-white rounded-lg hover:bg-panda-dark text-sm"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add Contact</span>
                      </button>
                    </div>

                    {contacts && contacts.length > 0 ? contacts.map((contact) => (
                      <Link
                        key={contact.id}
                        to={`/contacts/${contact.id}`}
                        className="block border border-gray-200 rounded-lg p-4 hover:border-panda-primary transition-colors"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                            <span className="text-white text-sm font-medium">
                              {contact.firstName?.charAt(0)}{contact.lastName?.charAt(0)}
                            </span>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center space-x-2">
                              <h4 className="font-medium text-gray-900">{contact.firstName} {contact.lastName}</h4>
                              {contact.isPrimary && (
                                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">Primary</span>
                              )}
                            </div>
                            <div className="flex items-center space-x-4 text-sm text-gray-500">
                              {contact.email && (
                                <span className="flex items-center">
                                  <Mail className="w-3 h-3 mr-1" />
                                  {contact.email}
                                </span>
                              )}
                              {(contact.phone || contact.mobilePhone) && (
                                <span className="flex items-center">
                                  <Phone className="w-3 h-3 mr-1" />
                                  {contact.mobilePhone || contact.phone}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </Link>
                    )) : (
                      <div className="text-center py-8 text-gray-500">
                        <Users className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                        <p>No contacts found</p>
                        <button
                          onClick={() => {
                            setActiveQuickAction('addContact');
                            setShowQuickActionModal(true);
                          }}
                          className="mt-4 text-panda-primary hover:underline"
                        >
                          + Add Contact
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'workOrders' && (
                  <div className="space-y-4">
                    {/* Header with Create Button */}
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-900">Work Orders</h3>
                      <button
                        onClick={() => {
                          setActiveQuickAction('createWorkOrder');
                          setShowQuickActionModal(true);
                        }}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-panda-primary text-white rounded-lg hover:bg-panda-dark text-sm"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Create Work Order</span>
                      </button>
                    </div>

                    {/* Work Order List */}
                    {workOrders && workOrders.length > 0 ? workOrders.map((wo) => (
                      <div key={wo.id} className="border border-gray-200 rounded-lg overflow-hidden hover:border-panda-primary transition-colors">
                        {/* Work Order Header */}
                        <div className="p-4 bg-gray-50 border-b border-gray-200">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className={`p-2 rounded-lg ${
                                wo.status === 'COMPLETED' ? 'bg-green-100' :
                                wo.status === 'IN_PROGRESS' ? 'bg-yellow-100' :
                                wo.status === 'SCHEDULED' ? 'bg-blue-100' :
                                wo.status === 'DRAFT' ? 'bg-orange-100' :
                                'bg-gray-100'
                              }`}>
                                <Wrench className={`w-5 h-5 ${
                                  wo.status === 'COMPLETED' ? 'text-green-600' :
                                  wo.status === 'IN_PROGRESS' ? 'text-yellow-600' :
                                  wo.status === 'SCHEDULED' ? 'text-blue-600' :
                                  wo.status === 'DRAFT' ? 'text-orange-600' :
                                  'text-gray-500'
                                }`} />
                              </div>
                              <div>
                                <h4 className="font-medium text-gray-900">{wo.workOrderNumber || wo.subject}</h4>
                                <p className="text-sm text-gray-500">{wo.workType?.name || 'General Work'}</p>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                wo.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                                wo.status === 'IN_PROGRESS' ? 'bg-yellow-100 text-yellow-800' :
                                wo.status === 'SCHEDULED' ? 'bg-blue-100 text-blue-800' :
                                wo.status === 'DRAFT' ? 'bg-orange-100 text-orange-800' :
                                wo.status === 'CANCELLED' ? 'bg-red-100 text-red-800' :
                                'bg-gray-100 text-gray-600'
                              }`}>
                                {wo.status?.replace(/_/g, ' ') || 'New'}
                              </span>
                              {wo.priority && (
                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                  wo.priority === 'HIGH' ? 'bg-red-100 text-red-800' :
                                  wo.priority === 'MEDIUM' ? 'bg-orange-100 text-orange-800' :
                                  'bg-gray-100 text-gray-600'
                                }`}>
                                  {wo.priority}
                                </span>
                              )}
                            </div>
                          </div>
                          {wo.description && (
                            <p className="mt-2 text-sm text-gray-600">{wo.description}</p>
                          )}
                        </div>

                        {/* Work Order Details */}
                        <div className="p-4">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            {wo.scheduledStartDate && (
                              <div className="flex items-center space-x-2 text-gray-600">
                                <Calendar className="w-4 h-4" />
                                <span>Scheduled: {new Date(wo.scheduledStartDate).toLocaleDateString()}</span>
                              </div>
                            )}
                            {wo.serviceTerritory?.name && (
                              <div className="flex items-center space-x-2 text-gray-600">
                                <MapPin className="w-4 h-4" />
                                <span>{wo.serviceTerritory.name}</span>
                              </div>
                            )}
                          </div>

                          {/* Service Appointments */}
                          {wo.serviceAppointments && wo.serviceAppointments.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-gray-100">
                              <h5 className="text-xs font-medium text-gray-500 uppercase mb-2">Appointments</h5>
                              <div className="space-y-2">
                                {wo.serviceAppointments.map((apt) => (
                                  <div key={apt.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                                    <div className="flex items-center space-x-2">
                                      <CalendarDays className="w-4 h-4 text-gray-400" />
                                      <div>
                                        <p className="text-sm font-medium text-gray-700">
                                          {apt.scheduledStart ? new Date(apt.scheduledStart).toLocaleDateString() : 'Unscheduled'}
                                        </p>
                                        {apt.scheduledStart && apt.scheduledEnd && (
                                          <p className="text-xs text-gray-500">
                                            {new Date(apt.scheduledStart).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} -
                                            {new Date(apt.scheduledEnd).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      {apt.assignedResources && apt.assignedResources.length > 0 && (
                                        <span className="text-xs text-gray-500">
                                          {apt.assignedResources.map(r => r.serviceResource?.name).filter(Boolean).join(', ')}
                                        </span>
                                      )}
                                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                        apt.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                                        apt.status === 'DISPATCHED' ? 'bg-blue-100 text-blue-700' :
                                        apt.status === 'SCHEDULED' ? 'bg-purple-100 text-purple-700' :
                                        apt.status === 'IN_PROGRESS' ? 'bg-yellow-100 text-yellow-700' :
                                        'bg-gray-100 text-gray-600'
                                      }`}>
                                        {apt.status?.replace(/_/g, ' ') || 'Pending'}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Action Buttons */}
                          <div className="mt-4 flex items-center justify-end space-x-2">
                            <button
                              onClick={() => {
                                setActiveQuickAction({ type: 'addAppointment', workOrderId: wo.id });
                                setShowQuickActionModal(true);
                              }}
                              className="flex items-center space-x-1 px-2 py-1 text-sm text-panda-primary hover:bg-panda-primary/10 rounded"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Add Appointment</span>
                            </button>
                            <button
                              onClick={() => {
                                setActiveQuickAction({ type: 'editWorkOrder', workOrder: wo });
                                setShowQuickActionModal(true);
                              }}
                              className="flex items-center space-x-1 px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded"
                            >
                              <Edit className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )) : (
                      <div className="text-center py-12 text-gray-500">
                        <Wrench className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                        <h4 className="font-medium text-gray-900 mb-1">No work orders yet</h4>
                        <p className="text-sm mb-4">Create a work order to schedule and track installation work</p>
                        <button
                          onClick={() => {
                            setActiveQuickAction('createWorkOrder');
                            setShowQuickActionModal(true);
                          }}
                          className="inline-flex items-center space-x-1 px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-dark text-sm"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Create Work Order</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'cases' && (
                  <div className="space-y-4">
                    {/* Header with Create Button */}
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-900">Cases</h3>
                      <button
                        onClick={() => {
                          setActiveQuickAction('createCase');
                          setShowQuickActionModal(true);
                        }}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-panda-primary text-white rounded-lg hover:bg-panda-dark text-sm"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Create Case</span>
                      </button>
                    </div>

                    {/* Cases List */}
                    {cases && cases.length > 0 ? cases.map((caseItem) => (
                      <div key={caseItem.id} className="border border-gray-200 rounded-lg overflow-hidden hover:border-panda-primary transition-colors cursor-pointer"
                        onClick={(e) => {
                          // Don't navigate if clicking on action buttons
                          if (e.target.closest('button')) return;
                          navigate(`/cases/${caseItem.id}`);
                        }}
                      >
                        <div className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className={`p-2 rounded-lg ${
                                caseItem.status === 'CLOSED' ? 'bg-green-100' :
                                caseItem.status === 'ESCALATED' ? 'bg-red-100' :
                                caseItem.status === 'WORKING' ? 'bg-blue-100' :
                                'bg-gray-100'
                              }`}>
                                <Briefcase className={`w-5 h-5 ${
                                  caseItem.status === 'CLOSED' ? 'text-green-600' :
                                  caseItem.status === 'ESCALATED' ? 'text-red-600' :
                                  caseItem.status === 'WORKING' ? 'text-blue-600' :
                                  'text-gray-500'
                                }`} />
                              </div>
                              <div>
                                <h4 className="font-medium text-gray-900 hover:text-panda-primary">{caseItem.caseNumber}</h4>
                                <p className="text-sm text-gray-600">{caseItem.subject}</p>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                caseItem.status === 'CLOSED' ? 'bg-green-100 text-green-800' :
                                caseItem.status === 'ESCALATED' ? 'bg-red-100 text-red-800' :
                                caseItem.status === 'WORKING' ? 'bg-blue-100 text-blue-800' :
                                'bg-gray-100 text-gray-600'
                              }`}>
                                {caseItem.status || 'New'}
                              </span>
                              {caseItem.priority && caseItem.priority !== 'NORMAL' && (
                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                  caseItem.priority === 'HIGH' || caseItem.priority === 'CRITICAL' ? 'bg-red-100 text-red-800' :
                                  caseItem.priority === 'LOW' ? 'bg-gray-100 text-gray-600' :
                                  'bg-orange-100 text-orange-800'
                                }`}>
                                  {caseItem.priority}
                                </span>
                              )}
                            </div>
                          </div>
                          {caseItem.description && (
                            <p className="mt-2 text-sm text-gray-500 line-clamp-2">{caseItem.description}</p>
                          )}
                          <div className="mt-3 flex items-center justify-between">
                            <div className="flex items-center space-x-4 text-xs text-gray-500">
                              {caseItem.type && (
                                <span className="flex items-center">
                                  <Tag className="w-3 h-3 mr-1" />
                                  {caseItem.type}
                                </span>
                              )}
                              <span className="flex items-center">
                                <Calendar className="w-3 h-3 mr-1" />
                                {new Date(caseItem.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            <div className="flex items-center space-x-2">
                              {caseItem.status !== 'CLOSED' && caseItem.status !== 'ESCALATED' && (
                                <button
                                  onClick={() => {
                                    setActiveQuickAction({ type: 'escalateCase', caseItem });
                                    setShowQuickActionModal(true);
                                  }}
                                  className="text-xs text-orange-600 hover:text-orange-700 hover:bg-orange-50 px-2 py-1 rounded"
                                >
                                  Escalate
                                </button>
                              )}
                              {caseItem.status !== 'CLOSED' && (
                                <button
                                  onClick={() => {
                                    setActiveQuickAction({ type: 'closeCase', caseItem });
                                    setShowQuickActionModal(true);
                                  }}
                                  className="text-xs text-green-600 hover:text-green-700 hover:bg-green-50 px-2 py-1 rounded"
                                >
                                  Close
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setActiveQuickAction({ type: 'editCase', caseItem });
                                  setShowQuickActionModal(true);
                                }}
                                className="text-xs text-gray-600 hover:text-gray-700 hover:bg-gray-100 px-2 py-1 rounded"
                              >
                                Edit
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )) : (
                      <div className="text-center py-12 text-gray-500">
                        <Briefcase className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                        <h4 className="font-medium text-gray-900 mb-1">No cases yet</h4>
                        <p className="text-sm mb-4">Cases help track customer service issues related to this job</p>
                        <button
                          onClick={() => {
                            setActiveQuickAction('createCase');
                            setShowQuickActionModal(true);
                          }}
                          className="inline-flex items-center space-x-1 px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-dark text-sm"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Create Case</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* ============================================================ */}
                {/* UNIFIED CONVERSATIONS TAB - SMS, Email, and Call Log */}
                {/* ============================================================ */}
                {activeTab === 'conversations' && (
                  <div className="space-y-4">
                    {/* Header with Action Buttons */}
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-900">Conversations</h3>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setShowSmsModal(true)}
                          disabled={!opportunity?.contact?.phone && !opportunity?.phone}
                          className="flex items-center space-x-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <MessageSquare className="w-4 h-4" />
                          <span>SMS</span>
                        </button>
                        <button
                          onClick={() => setShowEmailModal(true)}
                          disabled={!opportunity?.contact?.email}
                          className="flex items-center space-x-1 px-3 py-1.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Mail className="w-4 h-4" />
                          <span>Email</span>
                        </button>
                        <button
                          onClick={() => {
                            const phoneNumber = opportunity?.contact?.phone || opportunity?.phone;
                            if (phoneNumber) {
                              if (rcLoggedIn) {
                                initiateCall(phoneNumber);
                              } else {
                                loadWidget();
                                // After widget loads, user can click to call
                                setActionSuccess('RingCentral widget loaded. Click on the phone number to call.');
                                setTimeout(() => setActionSuccess(null), 3000);
                              }
                            }
                          }}
                          disabled={!opportunity?.contact?.phone && !opportunity?.phone}
                          className="flex items-center space-x-1 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Phone className="w-4 h-4" />
                          <span>Call</span>
                        </button>
                      </div>
                    </div>

                    {/* Unified Timeline - SMS Conversations + Emails merged and sorted by date */}
                    {(() => {
                      // Merge conversations and emails into a unified timeline
                      const smsItems = (conversations || []).map(c => ({
                        ...c,
                        itemType: 'sms',
                        sortDate: c.lastMessageAt || c.createdAt,
                      }));
                      const emailItems = (emails || []).map(e => ({
                        ...e,
                        itemType: 'email',
                        sortDate: e.sentAt || e.createdAt,
                      }));
                      const allItems = [...smsItems, ...emailItems].sort((a, b) =>
                        new Date(b.sortDate) - new Date(a.sortDate)
                      );

                      if (allItems.length === 0) {
                        return (
                          <div className="text-center py-8">
                            <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                            <p className="text-gray-500 text-sm">No conversations yet</p>
                            <p className="text-gray-400 text-xs mt-1">Send an SMS or email to start a conversation</p>
                            <div className="mt-4 flex justify-center space-x-2">
                              <button
                                onClick={() => setShowSmsModal(true)}
                                disabled={!opportunity?.contact?.phone && !opportunity?.phone}
                                className="inline-flex items-center space-x-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <MessageSquare className="w-4 h-4" />
                                <span>Send SMS</span>
                              </button>
                              <button
                                onClick={() => setShowEmailModal(true)}
                                disabled={!opportunity?.contact?.email}
                                className="inline-flex items-center space-x-1 px-3 py-1.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <Mail className="w-4 h-4" />
                                <span>Send Email</span>
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return allItems.map((item) => {
                        if (item.itemType === 'sms') {
                          // SMS Conversation Card
                          return (
                            <div key={`sms-${item.id}`} className="border border-gray-200 rounded-lg overflow-hidden hover:border-green-400 transition-colors">
                              <div className="p-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-3">
                                    <div className="p-2 rounded-lg bg-green-100">
                                      <Phone className="w-5 h-5 text-green-600" />
                                    </div>
                                    <div>
                                      <div className="flex items-center space-x-2">
                                        <h4 className="font-medium text-gray-900">{item.phoneNumber || 'SMS Conversation'}</h4>
                                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">SMS</span>
                                      </div>
                                      <p className="text-sm text-gray-600 line-clamp-1">{item.lastMessagePreview || 'No messages yet'}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    {item.unreadCount > 0 && (
                                      <span className="px-2 py-1 bg-panda-primary text-white rounded-full text-xs font-medium">{item.unreadCount}</span>
                                    )}
                                  </div>
                                </div>
                                <div className="mt-3 flex items-center justify-between">
                                  <span className="flex items-center text-xs text-gray-500">
                                    <Clock className="w-3 h-3 mr-1" />
                                    {item.lastMessageAt ? new Date(item.lastMessageAt).toLocaleString() : 'No date'}
                                  </span>
                                  <button
                                    onClick={() => {
                                      setActiveQuickAction({ type: 'viewConversation', conversation: item });
                                      setShowQuickActionModal(true);
                                    }}
                                    className="text-xs text-panda-primary hover:text-panda-dark hover:bg-panda-light px-2 py-1 rounded"
                                  >
                                    View Thread
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        } else {
                          // Email Card
                          return (
                            <div key={`email-${item.id}`} className="border border-gray-200 rounded-lg overflow-hidden hover:border-blue-400 transition-colors">
                              <div className="p-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-3">
                                    <div className={`p-2 rounded-lg ${item.direction === 'INBOUND' ? 'bg-blue-100' : 'bg-indigo-100'}`}>
                                      <Mail className={`w-5 h-5 ${item.direction === 'INBOUND' ? 'text-blue-600' : 'text-indigo-600'}`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center space-x-2">
                                        <h4 className="font-medium text-gray-900 truncate">{item.subject}</h4>
                                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">Email</span>
                                        {item.attachmentCount > 0 && <span className="text-xs text-gray-400">📎 {item.attachmentCount}</span>}
                                      </div>
                                      <p className="text-sm text-gray-500">
                                        {item.direction === 'INBOUND' ? 'From: ' : 'To: '}
                                        {item.direction === 'INBOUND' ? (item.fromName || item.fromAddress) : item.toAddresses?.join(', ')}
                                      </p>
                                    </div>
                                  </div>
                                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                                    item.status === 'DELIVERED' || item.status === 'SENT' ? 'bg-green-100 text-green-800' :
                                    item.status === 'OPENED' ? 'bg-blue-100 text-blue-800' :
                                    item.status === 'BOUNCED' ? 'bg-red-100 text-red-800' :
                                    'bg-gray-100 text-gray-600'
                                  }`}>
                                    {item.status === 'OPENED' ? '👁 Opened' : item.status}
                                  </span>
                                </div>
                                {item.bodyText && <p className="mt-2 text-sm text-gray-500 line-clamp-2">{item.bodyText}</p>}
                                <div className="mt-3 flex items-center justify-between">
                                  <span className="flex items-center text-xs text-gray-500">
                                    <Clock className="w-3 h-3 mr-1" />
                                    {item.sentAt ? new Date(item.sentAt).toLocaleString() : new Date(item.createdAt).toLocaleString()}
                                  </span>
                                  <div className="flex items-center space-x-2">
                                    <button
                                      onClick={() => {
                                        setActiveQuickAction({ type: 'replyEmail', email: item });
                                        setShowQuickActionModal(true);
                                      }}
                                      className="text-xs text-panda-primary hover:text-panda-dark hover:bg-panda-light px-2 py-1 rounded"
                                    >
                                      Reply
                                    </button>
                                    <button
                                      onClick={() => {
                                        setActiveQuickAction({ type: 'viewEmail', email: item });
                                        setShowQuickActionModal(true);
                                      }}
                                      className="text-xs text-gray-600 hover:text-gray-700 hover:bg-gray-100 px-2 py-1 rounded"
                                    >
                                      View
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        }
                      });
                    })()}
                  </div>
                )}

                {activeTab === 'emails' && (
                  <div className="space-y-4">
                    {/* Header with Compose Button */}
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-900">Email Activity</h3>
                      <button
                        onClick={() => {
                          // Pre-fill email with contact email if available
                          if (opportunity?.contact?.email) {
                            setEmailForm(prev => ({
                              ...prev,
                              toAddresses: [opportunity.contact.email],
                            }));
                          }
                          setActiveQuickAction('composeEmail');
                          setShowQuickActionModal(true);
                        }}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-panda-primary text-white rounded-lg hover:bg-panda-dark text-sm"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Compose Email</span>
                      </button>
                    </div>

                    {/* Emails List */}
                    {emails && emails.length > 0 ? emails.map((email) => (
                      <div key={email.id} className="border border-gray-200 rounded-lg overflow-hidden hover:border-panda-primary transition-colors">
                        <div className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className={`p-2 rounded-lg ${
                                email.direction === 'INBOUND' ? 'bg-blue-100' : 'bg-green-100'
                              }`}>
                                <Mail className={`w-5 h-5 ${
                                  email.direction === 'INBOUND' ? 'text-blue-600' : 'text-green-600'
                                }`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center space-x-2">
                                  <h4 className="font-medium text-gray-900 truncate">{email.subject}</h4>
                                  {email.attachmentCount > 0 && (
                                    <span className="text-xs text-gray-400">
                                      📎 {email.attachmentCount}
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-gray-500">
                                  {email.direction === 'INBOUND' ? 'From: ' : 'To: '}
                                  {email.direction === 'INBOUND'
                                    ? (email.fromName || email.fromAddress)
                                    : email.toAddresses?.join(', ')
                                  }
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                email.status === 'DELIVERED' || email.status === 'SENT' ? 'bg-green-100 text-green-800' :
                                email.status === 'OPENED' || email.status === 'CLICKED' ? 'bg-blue-100 text-blue-800' :
                                email.status === 'BOUNCED' || email.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                                email.status === 'DRAFT' ? 'bg-gray-100 text-gray-600' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {email.status === 'OPENED' ? '👁 Opened' :
                                 email.status === 'CLICKED' ? '🔗 Clicked' :
                                 email.status === 'BOUNCED' ? '⚠️ Bounced' :
                                 email.status}
                              </span>
                            </div>
                          </div>
                          {email.bodyText && (
                            <p className="mt-2 text-sm text-gray-500 line-clamp-2">{email.bodyText}</p>
                          )}
                          <div className="mt-3 flex items-center justify-between">
                            <div className="flex items-center space-x-4 text-xs text-gray-500">
                              <span className="flex items-center">
                                <Calendar className="w-3 h-3 mr-1" />
                                {email.sentAt
                                  ? new Date(email.sentAt).toLocaleString()
                                  : new Date(email.createdAt).toLocaleString()
                                }
                              </span>
                              {email.contact && (
                                <span className="flex items-center">
                                  <User className="w-3 h-3 mr-1" />
                                  {email.contact.firstName} {email.contact.lastName}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center space-x-2">
                              {email.status !== 'DRAFT' && (
                                <button
                                  onClick={() => {
                                    setActiveQuickAction({ type: 'replyEmail', email });
                                    setShowQuickActionModal(true);
                                  }}
                                  className="text-xs text-panda-primary hover:text-panda-dark hover:bg-panda-light px-2 py-1 rounded"
                                >
                                  Reply
                                </button>
                              )}
                              {email.status === 'DRAFT' && (
                                <button
                                  onClick={() => {
                                    setActiveQuickAction({ type: 'sendDraftEmail', email });
                                    setShowQuickActionModal(true);
                                  }}
                                  className="text-xs text-green-600 hover:text-green-700 hover:bg-green-50 px-2 py-1 rounded"
                                >
                                  Send
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setActiveQuickAction({ type: 'viewEmail', email });
                                  setShowQuickActionModal(true);
                                }}
                                className="text-xs text-gray-600 hover:text-gray-700 hover:bg-gray-100 px-2 py-1 rounded"
                              >
                                View
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )) : (
                      <div className="text-center py-12 text-gray-500">
                        <Mail className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                        <h4 className="font-medium text-gray-900 mb-1">No emails yet</h4>
                        <p className="text-sm mb-4">Email communication with the customer will appear here</p>
                        <button
                          onClick={() => {
                            if (opportunity?.contact?.email) {
                              setEmailForm(prev => ({
                                ...prev,
                                toAddresses: [opportunity.contact.email],
                              }));
                            }
                            setActiveQuickAction('composeEmail');
                            setShowQuickActionModal(true);
                          }}
                          className="inline-flex items-center space-x-1 px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-dark text-sm"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Compose Email</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Notifications Tab */}
                {activeTab === 'notifications' && (
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
                      {unreadNotifications > 0 && (
                        <button
                          onClick={() => {
                            const unreadIds = notifications?.filter(n => n.status === 'UNREAD').map(n => n.id);
                            if (unreadIds?.length) {
                              notificationsApi.bulkUpdateStatus(unreadIds, 'READ').then(() => {
                                queryClient.invalidateQueries(['opportunityNotifications', id]);
                              });
                            }
                          }}
                          className="text-xs text-panda-primary hover:text-panda-dark hover:underline"
                        >
                          Mark all as read
                        </button>
                      )}
                    </div>

                    {/* Notification List */}
                    {notifications && notifications.length > 0 ? notifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={`border rounded-lg p-4 transition-colors ${
                          notification.status === 'UNREAD'
                            ? 'border-panda-primary bg-panda-light/30'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => {
                          if (notification.status === 'UNREAD') {
                            markNotificationReadMutation.mutate(notification.id);
                          }
                        }}
                      >
                        <div className="flex items-start space-x-3">
                          {/* Icon based on type */}
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                            notification.priority === 'URGENT' ? 'bg-red-100 text-red-600' :
                            notification.priority === 'HIGH' ? 'bg-orange-100 text-orange-600' :
                            notification.type?.includes('WON') ? 'bg-green-100 text-green-600' :
                            'bg-blue-100 text-blue-600'
                          }`}>
                            {notification.type === 'STAGE_CHANGE' && <TrendingUp className="w-4 h-4" />}
                            {notification.type === 'ASSIGNMENT' && <User className="w-4 h-4" />}
                            {notification.type === 'OPPORTUNITY_WON' && <CheckCircle className="w-4 h-4" />}
                            {notification.type === 'WORK_ORDER_CREATED' && <Wrench className="w-4 h-4" />}
                            {notification.type === 'CASE_CREATED' && <Briefcase className="w-4 h-4" />}
                            {notification.type === 'TASK_ASSIGNED' && <CheckSquare className="w-4 h-4" />}
                            {notification.type === 'APPOINTMENT_SCHEDULED' && <Calendar className="w-4 h-4" />}
                            {!['STAGE_CHANGE', 'ASSIGNMENT', 'OPPORTUNITY_WON', 'WORK_ORDER_CREATED', 'CASE_CREATED', 'TASK_ASSIGNED', 'APPOINTMENT_SCHEDULED'].includes(notification.type) && (
                              <Bell className="w-4 h-4" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <h4 className={`text-sm font-medium ${
                                notification.status === 'UNREAD' ? 'text-gray-900' : 'text-gray-700'
                              }`}>
                                {notification.title}
                              </h4>
                              <div className="flex items-center space-x-2">
                                {notification.priority === 'URGENT' && (
                                  <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded">
                                    URGENT
                                  </span>
                                )}
                                {notification.priority === 'HIGH' && (
                                  <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded">
                                    HIGH
                                  </span>
                                )}
                                {notification.status === 'UNREAD' && (
                                  <span className="w-2 h-2 bg-panda-primary rounded-full" />
                                )}
                              </div>
                            </div>
                            <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
                            <div className="mt-2 flex items-center justify-between">
                              <span className="text-xs text-gray-500">
                                {new Date(notification.createdAt).toLocaleString()}
                              </span>
                              <div className="flex items-center space-x-2">
                                {notification.actionUrl && (
                                  <Link
                                    to={notification.actionUrl}
                                    className="text-xs text-panda-primary hover:text-panda-dark"
                                  >
                                    {notification.actionLabel || 'View'}
                                  </Link>
                                )}
                                {notification.status !== 'ARCHIVED' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      archiveNotificationMutation.mutate(notification.id);
                                    }}
                                    className="text-xs text-gray-500 hover:text-gray-700"
                                    title="Archive"
                                  >
                                    <Archive className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )) : (
                      <div className="text-center py-12 text-gray-500">
                        <BellOff className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                        <h4 className="font-medium text-gray-900 mb-1">No notifications</h4>
                        <p className="text-sm">Notifications about this job will appear here</p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'approvals' && (
                  <div className="space-y-6">
                    {/* Approval Stats */}
                    <div className="grid grid-cols-4 gap-4">
                      <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                        <div className="flex items-center justify-between">
                          <div>
                            <label className="text-sm text-yellow-600">Pending</label>
                            <p className="text-2xl font-bold text-yellow-700">
                              {summary?.approvals?.pending || 0}
                            </p>
                          </div>
                          <Clock className="w-8 h-8 text-yellow-400" />
                        </div>
                      </div>
                      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                        <div className="flex items-center justify-between">
                          <div>
                            <label className="text-sm text-blue-600">In Review</label>
                            <p className="text-2xl font-bold text-blue-700">
                              {summary?.approvals?.inReview || 0}
                            </p>
                          </div>
                          <Scale className="w-8 h-8 text-blue-400" />
                        </div>
                      </div>
                      <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                        <div className="flex items-center justify-between">
                          <div>
                            <label className="text-sm text-green-600">Approved</label>
                            <p className="text-2xl font-bold text-green-700">
                              {summary?.approvals?.approved || 0}
                            </p>
                          </div>
                          <CheckCircle className="w-8 h-8 text-green-400" />
                        </div>
                      </div>
                      <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                        <div className="flex items-center justify-between">
                          <div>
                            <label className="text-sm text-red-600">Rejected</label>
                            <p className="text-2xl font-bold text-red-700">
                              {summary?.approvals?.rejected || 0}
                            </p>
                          </div>
                          <XCircle className="w-8 h-8 text-red-400" />
                        </div>
                      </div>
                    </div>

                    {/* Approval Queue */}
                    <ApprovalQueue opportunityId={id} mode="all" />
                  </div>
                )}

                {activeTab === 'quotes' && (
                  <div className="space-y-4">
                    {quotes && quotes.length > 0 ? quotes.map((quote) => (
                      <div
                        key={quote.id}
                        onClick={() => navigate(`/quotes/${quote.id}`)}
                        className="border border-gray-200 rounded-lg p-4 hover:border-panda-primary hover:shadow-md transition-all cursor-pointer"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <FileText className="w-5 h-5 text-gray-400" />
                            <div>
                              <h4 className="font-medium text-gray-900">{quote.quoteNumber || quote.name}</h4>
                              <p className="text-sm text-gray-500">${(parseFloat(quote.total) || quote.grandTotal || quote.totalAmount || 0).toLocaleString()}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              quote.status === 'ACCEPTED' ? 'bg-green-100 text-green-800' :
                              quote.status === 'SENT' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {quote.status || 'Draft'}
                            </span>
                            <ExternalLink className="w-4 h-4 text-gray-400" />
                          </div>
                        </div>
                        {/* Quote line items preview */}
                        {quote.lineItems && quote.lineItems.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <p className="text-xs text-gray-500 mb-2">{quote.lineItems.length} line item(s)</p>
                            <div className="space-y-1">
                              {quote.lineItems.slice(0, 3).map((item, idx) => (
                                <div key={idx} className="flex justify-between text-sm">
                                  <span className="text-gray-600 truncate max-w-[200px]">{item.productName || item.description}</span>
                                  <span className="text-gray-900">${(item.totalPrice || item.unitPrice || 0).toLocaleString()}</span>
                                </div>
                              ))}
                              {quote.lineItems.length > 3 && (
                                <p className="text-xs text-gray-400">+{quote.lineItems.length - 3} more items</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )) : (
                      <div className="text-center py-8 text-gray-500">
                        <FileText className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                        <p>No quotes found</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ============ FINANCIALS TAB ============ */}
                {activeTab === 'financials' && (
                  <div className="space-y-6">
                    {/* PPSQ Review Panel - Contract & Estimate Review */}
                    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-200 overflow-hidden">
                      <div className="px-4 py-3 bg-indigo-100/50 border-b border-indigo-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Shield className="w-5 h-5 text-indigo-600" />
                            <h3 className="font-semibold text-indigo-900">
                              {(opportunity?.type === 'INSURANCE' || opportunity?.isPandaClaims || opportunity?.workType?.toLowerCase().includes('insurance'))
                                ? 'PPSQ Review - Property Preservation Service Quote'
                                : 'Contract & Estimate Review'}
                            </h3>
                          </div>
                          <span className="px-2 py-1 bg-indigo-100 text-indigo-700 text-xs font-medium rounded">
                            {opportunity?.workType || 'Job Review'}
                          </span>
                        </div>
                        <p className="text-sm text-indigo-600 mt-1">Review these details to determine if pre-supplement is required</p>
                      </div>
                        <div className="p-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Left Column - Insurance & Claim Info */}
                            <div className="space-y-4">
                              <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Insurance Information</h4>
                              <div className="bg-white rounded-lg p-4 border border-gray-200 space-y-3">
                                <div className="flex justify-between">
                                  <span className="text-sm text-gray-500">Insurance Carrier</span>
                                  <span className="text-sm font-medium text-gray-900">{opportunity.insuranceCarrier || '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-sm text-gray-500">Claim Number</span>
                                  <span className="text-sm font-medium text-gray-900">{opportunity.claimNumber || '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-sm text-gray-500">Date of Loss</span>
                                  <span className="text-sm font-medium text-gray-900">
                                    {opportunity.dateOfLoss ? new Date(opportunity.dateOfLoss).toLocaleDateString() : '-'}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-sm text-gray-500">Deductible</span>
                                  <span className="text-sm font-medium text-gray-900">
                                    ${(opportunity.deductible || 0).toLocaleString()}
                                  </span>
                                </div>
                              </div>

                              <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide pt-2">Estimate Details</h4>
                              <div className="bg-white rounded-lg p-4 border border-gray-200 space-y-3">
                                <div className="flex justify-between">
                                  <span className="text-sm text-gray-500">RCV Amount</span>
                                  <span className="text-sm font-bold text-green-600">
                                    ${(opportunity.rcvAmount || 0).toLocaleString()}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-sm text-gray-500">ACV Amount</span>
                                  <span className="text-sm font-medium text-gray-900">
                                    ${(opportunity.acvAmount || 0).toLocaleString()}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-sm text-gray-500">Depreciation</span>
                                  <span className="text-sm font-medium text-gray-900">
                                    ${((opportunity.rcvAmount || 0) - (opportunity.acvAmount || 0)).toLocaleString()}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-sm text-gray-500">Estimate Received</span>
                                  <span className={`text-sm font-medium ${opportunity.estimateReceived ? 'text-green-600' : 'text-red-600'}`}>
                                    {opportunity.estimateReceived ? 'Yes' : 'No'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Right Column - Contract & PPSQ Action */}
                            <div className="space-y-4">
                              <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Contract Information</h4>
                              <div className="bg-white rounded-lg p-4 border border-gray-200 space-y-3">
                                <div className="flex justify-between">
                                  <span className="text-sm text-gray-500">Contract Value</span>
                                  <span className="text-sm font-bold text-gray-900">
                                    ${(opportunity.amount || 0).toLocaleString()}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-sm text-gray-500">Contract Received</span>
                                  <span className={`text-sm font-medium ${opportunity.contractReceived ? 'text-green-600' : 'text-red-600'}`}>
                                    {opportunity.contractReceived ? 'Yes' : 'No'}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-sm text-gray-500">Photos Collected</span>
                                  <span className={`text-sm font-medium ${opportunity.photosCollected === 'sufficient' ? 'text-green-600' : 'text-yellow-600'}`}>
                                    {opportunity.photosCollected === 'sufficient' ? 'Sufficient' : opportunity.photosCollected || 'Pending'}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-sm text-gray-500">Specs Prepped</span>
                                  <span className={`text-sm font-medium ${opportunity.specsPrepped ? 'text-green-600' : 'text-gray-400'}`}>
                                    {opportunity.specsPrepped ? 'Yes' : 'No'}
                                  </span>
                                </div>
                              </div>

                              {/* PPSQ Decision Box */}
                              <div className={`rounded-lg p-4 border-2 ${opportunity.preSupplementRequired ? 'bg-amber-50 border-amber-300' : 'bg-gray-50 border-gray-200'}`}>
                                <h4 className="text-sm font-semibold text-gray-700 mb-3">Pre-Supplement Decision</h4>
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-sm text-gray-600">
                                      {opportunity.preSupplementRequired
                                        ? 'Pre-Supplement has been marked as required'
                                        : 'Review PPSQ details above to determine if pre-supplement is needed'}
                                    </p>
                                    {opportunity.preSupplementRequired && (
                                      <p className="text-xs text-amber-600 mt-1">
                                        A case has been created for the supplements team
                                      </p>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => handleChecklistToggle('preSupplementRequired', opportunity.preSupplementRequired)}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                      opportunity.preSupplementRequired
                                        ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                    }`}
                                  >
                                    {opportunity.preSupplementRequired ? 'Pre-Supplement Required' : 'Mark Pre-Supplement Required'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                    {/* Financial Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                        <label className="text-sm text-green-600">Contract Value</label>
                        <p className="text-2xl font-bold text-green-700">${(summary?.financials?.contractValue || opportunity.amount || 0).toLocaleString()}</p>
                      </div>
                      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                        <label className="text-sm text-blue-600">Total Paid</label>
                        <p className="text-2xl font-bold text-blue-700">${(summary?.financials?.totalPaid || 0).toLocaleString()}</p>
                      </div>
                      <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                        <label className="text-sm text-red-600">Balance Due</label>
                        <p className="text-2xl font-bold text-red-700">${(invoices?.reduce((sum, inv) => sum + (parseFloat(inv.balanceDue) || 0), 0) || summary?.financials?.balanceDue || 0).toLocaleString()}</p>
                      </div>
                      <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                        <label className="text-sm text-purple-600">Est. Commissions</label>
                        <p className="text-2xl font-bold text-purple-700">
                          ${(commissions?.reduce((sum, c) => sum + (parseFloat(c.requestedAmount || c.commissionAmount) || 0), 0) || 0).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    {/* Quick Links to Sub-tabs */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Quotes Summary Card */}
                      <div
                        onClick={() => setActiveTab('quotes')}
                        className="bg-white rounded-lg border border-gray-200 p-4 hover:border-panda-primary hover:shadow-md transition-all cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <FileText className="w-5 h-5 text-gray-500" />
                            <h4 className="font-medium text-gray-900">Quotes</h4>
                          </div>
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded">
                            {quotes?.length || 0}
                          </span>
                        </div>
                        <div className="space-y-2 text-sm">
                          {quotes && quotes.length > 0 ? (
                            <>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Latest Quote</span>
                                <span className="font-medium">${(parseFloat(quotes[0]?.total) || quotes[0]?.totalAmount || 0).toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Status</span>
                                <span className={`font-medium ${quotes[0]?.status === 'ACCEPTED' ? 'text-green-600' : 'text-gray-600'}`}>
                                  {quotes[0]?.status || 'Draft'}
                                </span>
                              </div>
                            </>
                          ) : (
                            <p className="text-gray-400">No quotes yet</p>
                          )}
                        </div>
                        <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-panda-primary font-medium">
                          View All Quotes →
                        </div>
                      </div>

                      {/* Invoices Summary Card */}
                      <div
                        onClick={() => setActiveTab('invoices')}
                        className="bg-white rounded-lg border border-gray-200 p-4 hover:border-panda-primary hover:shadow-md transition-all cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Receipt className="w-5 h-5 text-gray-500" />
                            <h4 className="font-medium text-gray-900">Invoices</h4>
                          </div>
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded">
                            {invoices?.length || 0}
                          </span>
                        </div>
                        <div className="space-y-2 text-sm">
                          {invoices && invoices.length > 0 ? (
                            <>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Total Invoiced</span>
                                <span className="font-medium">
                                  ${invoices.reduce((sum, inv) => sum + (parseFloat(inv.totalAmount) || 0), 0).toLocaleString()}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Outstanding</span>
                                <span className="font-medium text-red-600">
                                  ${invoices.reduce((sum, inv) => sum + (parseFloat(inv.balanceDue) || 0), 0).toLocaleString()}
                                </span>
                              </div>
                            </>
                          ) : (
                            <p className="text-gray-400">No invoices yet</p>
                          )}
                        </div>
                        <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-panda-primary font-medium">
                          View All Invoices →
                        </div>
                      </div>

                      {/* Commissions Summary Card */}
                      <div
                        onClick={() => setActiveTab('commissions')}
                        className="bg-white rounded-lg border border-gray-200 p-4 hover:border-panda-primary hover:shadow-md transition-all cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Percent className="w-5 h-5 text-gray-500" />
                            <h4 className="font-medium text-gray-900">Commissions</h4>
                          </div>
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded">
                            {commissions?.length || 0}
                          </span>
                        </div>
                        <div className="space-y-2 text-sm">
                          {commissions && commissions.length > 0 ? (
                            <>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Pending</span>
                                <span className="font-medium text-yellow-600">
                                  ${commissions.filter(c => c.status === 'REQUESTED' || c.status === 'NEW').reduce((sum, c) => sum + (parseFloat(c.requestedAmount || c.commissionAmount) || 0), 0).toLocaleString()}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Paid</span>
                                <span className="font-medium text-green-600">
                                  ${commissions.filter(c => c.status === 'PAID').reduce((sum, c) => sum + (parseFloat(c.paidAmount || c.requestedAmount) || 0), 0).toLocaleString()}
                                </span>
                              </div>
                            </>
                          ) : (
                            <p className="text-gray-400">No commissions yet</p>
                          )}
                        </div>
                        <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-panda-primary font-medium">
                          View All Commissions →
                        </div>
                      </div>

                      {/* Payments Summary Card */}
                      <div
                        onClick={() => setActiveTab('payments')}
                        className="bg-white rounded-lg border border-gray-200 p-4 hover:border-panda-primary hover:shadow-md transition-all cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <CreditCard className="w-5 h-5 text-gray-500" />
                            <h4 className="font-medium text-gray-900">Payments</h4>
                          </div>
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded">
                            {payments?.length || 0}
                          </span>
                        </div>
                        <div className="space-y-2 text-sm">
                          {payments && payments.length > 0 ? (
                            <>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Total Paid</span>
                                <span className="font-medium text-green-600">
                                  ${payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0).toLocaleString()}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Last Payment</span>
                                <span className="font-medium text-gray-700">
                                  {payments[0]?.paymentDate ? new Date(payments[0].paymentDate).toLocaleDateString() : '-'}
                                </span>
                              </div>
                            </>
                          ) : (
                            <p className="text-gray-400">No payments yet</p>
                          )}
                        </div>
                        <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-panda-primary font-medium">
                          View All Payments →
                        </div>
                      </div>
                    </div>

                    {/* Recent Transactions Timeline */}
                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                      <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Activity className="w-5 h-5 text-gray-500" />
                        Recent Financial Activity
                      </h3>
                      <div className="space-y-3">
                        {/* Combine and sort invoices and commissions by date */}
                        {[
                          ...(invoices || []).map(inv => ({
                            type: 'invoice',
                            date: inv.createdAt,
                            label: `Invoice ${inv.invoiceNumber || `#${inv.id?.slice(-6)}`}`,
                            amount: inv.totalAmount,
                            status: inv.status,
                          })),
                          ...(commissions || []).filter(c => c.status === 'PAID').map(comm => ({
                            type: 'commission',
                            date: comm.paidDate || comm.updatedAt,
                            label: `Commission Paid - ${comm.owner?.firstName || ''} ${comm.owner?.lastName || ''}`.trim(),
                            amount: comm.paidAmount || comm.requestedAmount,
                            status: 'PAID',
                          })),
                        ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5).map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                            <div className="flex items-center gap-3">
                              {item.type === 'invoice' ? (
                                <Receipt className="w-4 h-4 text-blue-500" />
                              ) : (
                                <DollarSign className="w-4 h-4 text-green-500" />
                              )}
                              <div>
                                <p className="text-sm font-medium text-gray-900">{item.label}</p>
                                <p className="text-xs text-gray-500">
                                  {item.date ? new Date(item.date).toLocaleDateString() : '-'}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-gray-900">
                                ${(parseFloat(item.amount) || 0).toLocaleString()}
                              </p>
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                item.status === 'PAID' ? 'bg-green-100 text-green-700' :
                                item.status === 'SENT' ? 'bg-blue-100 text-blue-700' :
                                'bg-gray-100 text-gray-600'
                              }`}>
                                {item.status}
                              </span>
                            </div>
                          </div>
                        ))}
                        {(!invoices || invoices.length === 0) && (!commissions || commissions.length === 0) && (
                          <p className="text-center text-gray-400 py-4">No financial activity yet</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'invoices' && (
                  <div className="space-y-6">
                    {/* Financial Summary */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                        <label className="text-sm text-green-600">Contract Value</label>
                        <p className="text-2xl font-bold text-green-700">${(summary?.financials?.contractValue || opportunity.amount || 0).toLocaleString()}</p>
                      </div>
                      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                        <label className="text-sm text-blue-600">Total Paid</label>
                        <p className="text-2xl font-bold text-blue-700">${(summary?.financials?.totalPaid || 0).toLocaleString()}</p>
                      </div>
                      <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                        <label className="text-sm text-red-600">Balance Due</label>
                        <p className="text-2xl font-bold text-red-700">${(invoices?.reduce((sum, inv) => sum + (parseFloat(inv.balanceDue) || 0), 0) || summary?.financials?.balanceDue || 0).toLocaleString()}</p>
                      </div>
                    </div>

                    {/* Invoice List */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-900">Invoices</h3>
                        {/* Create Insurance Invoice button - only show for insurance jobs */}
                        {(opportunity?.type === 'INSURANCE' || opportunity?.isPandaClaims || opportunity?.insuranceCarrier) && (
                          <button
                            onClick={() => setShowCreateInsuranceInvoiceModal(true)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                          >
                            <Shield className="w-4 h-4" />
                            Create Insurance Invoice
                          </button>
                        )}
                      </div>
                      {invoices && invoices.length > 0 ? invoices.map((invoice) => (
                        <div
                          key={invoice.id}
                          onClick={() => { setSelectedInvoice(invoice); setShowInvoiceDetailModal(true); }}
                          className="border border-gray-200 rounded-lg p-4 hover:border-panda-primary hover:shadow-md transition-all cursor-pointer"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <Receipt className="w-5 h-5 text-gray-400" />
                              <div>
                                <h4 className="font-medium text-gray-900">{invoice.invoiceNumber || `INV-${invoice.id.slice(-6)}`}</h4>
                                <p className="text-sm text-gray-500">
                                  {invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString() : '-'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <p className="font-semibold text-gray-900">${(invoice.totalAmount || 0).toLocaleString()}</p>
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  invoice.status === 'PAID' ? 'bg-green-100 text-green-800' :
                                  invoice.status === 'OVERDUE' ? 'bg-red-100 text-red-800' :
                                  invoice.status === 'SENT' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-gray-100 text-gray-600'
                                }`}>
                                  {invoice.status || 'Draft'}
                                </span>
                              </div>
                              {/* Invoice Action Buttons */}
                              <div className="flex items-center gap-2">
                                {/* Send Invoice Button - show if not already sent or paid */}
                                {invoice.status !== 'PAID' && invoice.status !== 'SENT' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setInvoiceToSend(invoice);
                                      setShowSendInvoiceModal(true);
                                    }}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                                  >
                                    <Mail className="w-4 h-4" />
                                    Send
                                  </button>
                                )}
                                {/* Pay Invoice Button - only show if not fully paid */}
                                {invoice.status !== 'PAID' && (parseFloat(invoice.balanceDue) > 0 || parseFloat(invoice.totalAmount) > parseFloat(invoice.amountPaid || 0)) && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedInvoice(invoice);
                                      setShowPayInvoiceModal(true);
                                    }}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
                                  >
                                    <CreditCard className="w-4 h-4" />
                                    Pay
                                  </button>
                                )}
                                {/* View indicator */}
                                <ExternalLink className="w-4 h-4 text-gray-400" />
                              </div>
                            </div>
                          </div>
                          {/* Balance info */}
                          {invoice.status !== 'PAID' && (
                            <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-sm">
                              <span className="text-gray-500">Balance Due:</span>
                              <span className="font-medium text-red-600">
                                ${parseFloat(invoice.balanceDue || (invoice.totalAmount - (invoice.amountPaid || 0)) || 0).toLocaleString()}
                              </span>
                            </div>
                          )}
                        </div>
                      )) : (
                        <div className="text-center py-8 text-gray-500">
                          <Receipt className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                          <p>No invoices found</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'payments' && (
                  <div className="space-y-4">
                    {/* Payment Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border border-green-100">
                        <div className="flex items-center gap-2 text-green-600 text-sm font-medium mb-1">
                          <DollarSign className="w-4 h-4" />
                          Total Paid
                        </div>
                        <div className="text-2xl font-bold text-green-700">
                          ${payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0).toLocaleString()}
                        </div>
                      </div>
                      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
                        <div className="flex items-center gap-2 text-blue-600 text-sm font-medium mb-1">
                          <CreditCard className="w-4 h-4" />
                          Payment Count
                        </div>
                        <div className="text-2xl font-bold text-blue-700">
                          {payments.length}
                        </div>
                      </div>
                      <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl p-4 border border-purple-100">
                        <div className="flex items-center gap-2 text-purple-600 text-sm font-medium mb-1">
                          <Calendar className="w-4 h-4" />
                          Last Payment
                        </div>
                        <div className="text-lg font-bold text-purple-700">
                          {payments.length > 0
                            ? new Date(payments[0].paymentDate || payments[0].createdAt).toLocaleDateString()
                            : 'N/A'}
                        </div>
                      </div>
                    </div>

                    {/* Payments List */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                      <div className="p-4 border-b border-gray-100">
                        <h3 className="font-semibold text-gray-900">Payment Records</h3>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {payments.length > 0 ? payments.map((payment) => (
                          <div key={payment.id} className="p-4 hover:bg-gray-50 transition-colors">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                  payment.status === 'COMPLETED' || payment.status === 'Settled Successfully'
                                    ? 'bg-green-100 text-green-600'
                                    : payment.status === 'PENDING' || payment.status === 'Processing'
                                    ? 'bg-yellow-100 text-yellow-600'
                                    : payment.status === 'FAILED' || payment.status === 'Declined'
                                    ? 'bg-red-100 text-red-600'
                                    : 'bg-gray-100 text-gray-600'
                                }`}>
                                  <CreditCard className="w-5 h-5" />
                                </div>
                                <div>
                                  <div className="font-medium text-gray-900">
                                    {payment.paymentNumber || payment.transactionId || `Payment #${payment.id.slice(-6)}`}
                                  </div>
                                  <div className="text-sm text-gray-500">
                                    {payment.paymentMethod || payment.method || 'Card'} • {new Date(payment.paymentDate || payment.createdAt).toLocaleDateString()}{payment.invoice?.invoiceNumber && ` • Invoice ${payment.invoice.invoiceNumber}`}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-semibold text-gray-900">
                                  ${parseFloat(payment.amount || 0).toLocaleString()}
                                </div>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                  payment.status === 'COMPLETED' || payment.status === 'Settled Successfully'
                                    ? 'bg-green-100 text-green-700'
                                    : payment.status === 'PENDING' || payment.status === 'Processing'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : payment.status === 'FAILED' || payment.status === 'Declined'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-gray-100 text-gray-700'
                                }`}>
                                  {payment.status || 'Unknown'}
                                </span>
                              </div>
                            </div>
                            {payment.notes && (
                              <div className="mt-2 text-sm text-gray-500 pl-13">
                                {payment.notes}
                              </div>
                            )}
                          </div>
                        )) : (
                          <div className="text-center py-8 text-gray-500">
                            <CreditCard className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                            <p>No payments recorded</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'commissions' && (
                  <CommissionsTab
                    commissions={commissions}
                    commissionSummary={commissionsData?.summary}
                    summary={summary}
                    opportunity={opportunity}
                    isLoading={!commissionsData}
                  />
                )}

                {activeTab === 'tasks' && (
                  <TasksTab
                    opportunityId={id}
                    users={users}
                  />
                )}

                {activeTab === 'documents' && (
                  <div className="space-y-4">
                    {/* Sub-tab navigation for Contracts and Photos */}
                    <div className="flex items-center justify-between border-b border-gray-200 pb-3">
                      <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
                        <button
                          onClick={() => setDocumentsSubTab('contracts')}
                          className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                            documentsSubTab === 'contracts'
                              ? 'bg-white text-panda-primary shadow-sm'
                              : 'text-gray-600 hover:text-gray-900'
                          }`}
                        >
                          <FileSignature className="w-4 h-4" />
                          <span>Contracts</span>
                          {documents?.documents?.length > 0 && (
                            <span className="ml-1 px-2 py-0.5 bg-panda-primary/10 text-panda-primary text-xs rounded-full">
                              {documents.documents.length}
                            </span>
                          )}
                        </button>
                        <button
                          onClick={() => setDocumentsSubTab('files')}
                          className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                            documentsSubTab === 'files'
                              ? 'bg-white text-panda-primary shadow-sm'
                              : 'text-gray-600 hover:text-gray-900'
                          }`}
                        >
                          <FileText className="w-4 h-4" />
                          <span>Files</span>
                          {(repositoryFiles?.data?.length || repositoryFiles?.length || 0) > 0 && (
                            <span className="ml-1 px-2 py-0.5 bg-panda-primary/10 text-panda-primary text-xs rounded-full">
                              {repositoryFiles?.data?.length || repositoryFiles?.length || 0}
                            </span>
                          )}
                        </button>
                      </div>
                      {/* Contract Action Buttons - only show on contracts sub-tab */}
                      {documentsSubTab === 'contracts' && (
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => setShowChangeOrderModal(true)}
                            className="inline-flex items-center px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 shadow-sm"
                          >
                            <Edit className="w-4 h-4 mr-2" />
                            Change Order
                          </button>
                          <button
                            onClick={() => setShowContractSigningModal(true)}
                            className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90 shadow-sm"
                          >
                            <Send className="w-4 h-4 mr-2" />
                            Send Contract
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Contracts Sub-tab Content */}
                    {documentsSubTab === 'contracts' && (
                      <>
                    {/* Agreement Summary */}
                    {documents?.summary && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-gray-50 rounded-lg mb-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-gray-900">{documents.summary.total}</div>
                          <div className="text-xs text-gray-500">Total</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-green-600">{documents.summary.signed}</div>
                          <div className="text-xs text-gray-500">Signed</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-yellow-600">{documents.summary.pending}</div>
                          <div className="text-xs text-gray-500">Pending</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-gray-400">{documents.summary.draft}</div>
                          <div className="text-xs text-gray-500">Draft</div>
                        </div>
                      </div>
                    )}

                    {/* Document Thumbnails Grid */}
                    {documents?.documents && documents.documents.length > 0 ? (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                          {documents.documents.map((doc, index) => (
                            <div
                              key={doc.id}
                              className="group relative border border-gray-200 rounded-lg overflow-hidden hover:border-panda-primary hover:shadow-md transition-all cursor-pointer bg-white"
                              onClick={() => {
                                setSelectedDocumentIndex(index);
                                setShowDocumentGallery(true);
                              }}
                            >
                              {/* PDF Thumbnail Preview */}
                              <div className="aspect-[3/4] bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center relative">
                                {(doc.signedDocumentUrl || doc.documentUrl) ? (
                                  <>
                                    {/* PDF Icon as placeholder - could use pdf.js for actual thumbnails */}
                                    <div className="text-center">
                                      <FileSignature className="w-12 h-12 text-panda-primary mx-auto mb-2" />
                                      <span className="text-xs text-gray-500 font-medium">PDF</span>
                                    </div>
                                    {/* Status badge */}
                                    <div className={`absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-semibold ${
                                      doc.status === 'SIGNED' ? 'bg-green-500 text-white' :
                                      doc.status === 'SENT' ? 'bg-yellow-500 text-white' :
                                      doc.status === 'VIEWED' ? 'bg-blue-500 text-white' :
                                      doc.status === 'DECLINED' ? 'bg-red-500 text-white' :
                                      'bg-gray-500 text-white'
                                    }`}>
                                      {doc.status || 'DRAFT'}
                                    </div>
                                    {/* Hover overlay */}
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                      <ZoomIn className="w-8 h-8 text-white" />
                                    </div>
                                  </>
                                ) : (
                                  <div className="text-center">
                                    <FileSignature className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                                    <span className="text-xs text-gray-400">No Preview</span>
                                  </div>
                                )}
                              </div>
                              {/* Document info */}
                              <div className="p-3">
                                <h4 className="font-medium text-sm text-gray-900 truncate" title={doc.name || doc.agreementNumber}>
                                  {doc.name || doc.agreementNumber}
                                </h4>
                                <p className="text-xs text-gray-500 mt-1">
                                  {doc.signedAt
                                    ? `Signed ${new Date(doc.signedAt).toLocaleDateString()}`
                                    : doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : '-'
                                  }
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Document Gallery Modal */}
                        {showDocumentGallery && documents.documents.length > 0 && (
                          <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
                            {/* Header */}
                            <div className="flex items-center justify-between p-4 bg-black/50">
                              <div className="flex items-center space-x-4">
                                <button
                                  onClick={() => setShowDocumentGallery(false)}
                                  className="p-2 text-white hover:bg-white/10 rounded-lg"
                                >
                                  <X className="w-6 h-6" />
                                </button>
                                <div className="text-white">
                                  <h3 className="font-medium">{documents.documents[selectedDocumentIndex]?.name || 'Document'}</h3>
                                  <p className="text-sm text-gray-300">
                                    {selectedDocumentIndex + 1} of {documents.documents.length}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                {/* Download button */}
                                {documents.documents[selectedDocumentIndex]?.downloadUrl && (
                                  <a
                                    href={documents.documents[selectedDocumentIndex].downloadUrl}
                                    download={documents.documents[selectedDocumentIndex].fileName}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center space-x-2 px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Download className="w-4 h-4" />
                                    <span>Download</span>
                                  </a>
                                )}
                                {/* Open in new tab */}
                                {(documents.documents[selectedDocumentIndex]?.signedDocumentUrl || documents.documents[selectedDocumentIndex]?.documentUrl) && (
                                  <a
                                    href={documents.documents[selectedDocumentIndex].signedDocumentUrl || documents.documents[selectedDocumentIndex].documentUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center space-x-2 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                    <span>Open</span>
                                  </a>
                                )}
                              </div>
                            </div>

                            {/* Main content - PDF viewer */}
                            <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
                              {(documents.documents[selectedDocumentIndex]?.signedDocumentUrl || documents.documents[selectedDocumentIndex]?.documentUrl) ? (
                                <iframe
                                  src={documents.documents[selectedDocumentIndex].signedDocumentUrl || documents.documents[selectedDocumentIndex].documentUrl}
                                  className="w-full max-w-4xl h-full rounded-lg bg-white"
                                  title="Document Preview"
                                />
                              ) : (
                                <div className="text-center text-white">
                                  <FileSignature className="w-24 h-24 mx-auto mb-4 text-gray-400" />
                                  <p className="text-xl">No document available</p>
                                </div>
                              )}
                            </div>

                            {/* Navigation arrows */}
                            {documents.documents.length > 1 && (
                              <>
                                <button
                                  onClick={() => setSelectedDocumentIndex((prev) => (prev === 0 ? documents.documents.length - 1 : prev - 1))}
                                  className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 text-white rounded-full hover:bg-black/70"
                                >
                                  <ChevronLeft className="w-6 h-6" />
                                </button>
                                <button
                                  onClick={() => setSelectedDocumentIndex((prev) => (prev === documents.documents.length - 1 ? 0 : prev + 1))}
                                  className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 text-white rounded-full hover:bg-black/70"
                                >
                                  <ChevronRight className="w-6 h-6" />
                                </button>
                              </>
                            )}

                            {/* Thumbnail strip at bottom */}
                            {documents.documents.length > 1 && (
                              <div className="bg-black/50 p-4 overflow-x-auto">
                                <div className="flex space-x-2 justify-center">
                                  {documents.documents.map((doc, index) => (
                                    <button
                                      key={doc.id}
                                      onClick={() => setSelectedDocumentIndex(index)}
                                      className={`flex-shrink-0 w-16 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                                        index === selectedDocumentIndex
                                          ? 'border-panda-primary ring-2 ring-panda-primary/50'
                                          : 'border-transparent opacity-60 hover:opacity-100'
                                      }`}
                                    >
                                      <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center">
                                        <FileSignature className="w-6 h-6 text-gray-400" />
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        <FileSignature className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                        <p>No agreements found</p>
                        <button
                          onClick={() => setShowContractSigningModal(true)}
                          className="mt-4 inline-flex items-center px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90"
                        >
                          <Send className="w-4 h-4 mr-2" />
                          Send Contract
                        </button>
                      </div>
                    )}
                      </>
                    )}

                    {/* Files Sub-tab Content */}
                    {documentsSubTab === 'files' && (
                      <div className="space-y-4">
                        {(() => {
                          const files = repositoryFiles?.data || repositoryFiles || [];
                          if (files.length === 0) {
                            return (
                              <div className="text-center py-12">
                                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                <p className="text-gray-500">No files uploaded yet</p>
                                <p className="text-sm text-gray-400 mt-1">Files uploaded to this job will appear here</p>
                              </div>
                            );
                          }
                          return (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                              {files.map((file) => (
                                <div
                                  key={file.id}
                                  className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                                >
                                  <div className="flex items-start space-x-3">
                                    <div className="flex-shrink-0">
                                      <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                                        <FileText className="w-5 h-5 text-gray-500" />
                                      </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-gray-900 truncate" title={file.title || file.fileName || 'Untitled'}>
                                        {file.title || file.fileName || 'Untitled'}
                                      </p>
                                      <p className="text-xs text-gray-500 mt-1">
                                        {file.fileType || file.fileExtension || 'File'}
                                        {file.contentSize && ` • ${(file.contentSize / 1024).toFixed(1)} KB`}
                                      </p>
                                      <p className="text-xs text-gray-400 mt-1">
                                        {file.createdAt && new Date(file.createdAt).toLocaleDateString()}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="mt-3 flex space-x-2">
                                    {file.contentUrl ? (
                                      <a
                                        href={file.contentUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-1 inline-flex items-center justify-center px-3 py-1.5 bg-panda-primary/10 text-panda-primary text-xs font-medium rounded-md hover:bg-panda-primary/20 transition-colors"
                                      >
                                        <Download className="w-3 h-3 mr-1" />
                                        Download
                                      </a>
                                    ) : (
                                      <span className="flex-1 inline-flex items-center justify-center px-3 py-1.5 bg-gray-100 text-gray-400 text-xs font-medium rounded-md">
                                        <FileText className="w-3 h-3 mr-1" />
                                        {file.category || 'Salesforce'}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    )}

                  </div>
                )}

                {/* Photos Category - Gallery, Checklists, Before/After */}
                {(activeTab === 'photos' || activeTab === 'checklists' || activeTab === 'comparisons') && (
                  <PhotoCamTab
                    opportunityId={id}
                    activeSubTab={activeTab}
                  />
                )}

                {activeTab === 'activity' && (
                  <ActivityTimelineTab
                    activities={activityData?.activities?.filter(a => a.sourceType !== 'ACCULYNX_IMPORT') || []}
                    onActivityClick={(item) => {
                      setSelectedActivity(item);
                      setShowActivityModal(true);
                    }}
                  />
                )}

                {activeTab === 'communications' && (
                  <CommunicationsTab
                    phone={opportunity?.contact?.phone || opportunity?.contact?.mobilePhone}
                    email={opportunity?.contact?.email}
                    contactName={opportunity?.contact?.name || `${opportunity?.contact?.firstName || ''} ${opportunity?.contact?.lastName || ''}`}
                    archivedActivities={activityData?.activities?.filter(a => a.sourceType === 'ACCULYNX_IMPORT') || []}
                    onActivityClick={(item) => {
                      setSelectedActivity(item);
                      setShowActivityModal(true);
                    }}
                    opportunityId={id}
                  />
                )}

                {activeTab === 'checklist' && (
                  <div className="space-y-6">
                    {/* Onboarding Checklist */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-4">Onboarding Checklist</h3>
                      <div className="space-y-3">
                        {onboardingChecklist.map((item) => (
                          <label key={item.id} className="flex items-center space-x-3 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={item.checked}
                              onChange={() => handleChecklistToggle(item.field, item.field === 'photosCollected' ? opportunity.photosCollected : item.checked)}
                              disabled={updateMutation.isPending}
                              className="w-5 h-5 rounded border-gray-300 text-panda-primary focus:ring-panda-primary disabled:opacity-50"
                            />
                            <span className={`text-gray-700 ${item.checked ? 'line-through text-gray-400' : ''}`}>{item.label}</span>
                            {updateMutation.isPending && <span className="text-xs text-gray-400">Saving...</span>}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Onboarding Dates & Assigned Users */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-gray-900">Onboarding Details</h3>

                      {/* Row 1: Onboarding Start Date & Onboarded By */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <label className="block text-sm text-gray-500 mb-1">Onboarding Start Date</label>
                          <input
                            type="date"
                            value={opportunity.onboardingStartDate ? new Date(opportunity.onboardingStartDate).toISOString().split('T')[0] : ''}
                            onChange={async (e) => {
                              const value = e.target.value ? new Date(e.target.value).toISOString() : null;
                              await updateMutation.mutateAsync({ onboardingStartDate: value });
                            }}
                            disabled={updateMutation.isPending}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-panda-primary focus:border-panda-primary disabled:opacity-50"
                          />
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <label className="block text-sm text-gray-500 mb-1">Onboarded By</label>
                          <select
                            value={opportunity.onboardedById || ''}
                            onChange={async (e) => {
                              await updateMutation.mutateAsync({ onboardedById: e.target.value || null });
                            }}
                            disabled={updateMutation.isPending}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-panda-primary focus:border-panda-primary disabled:opacity-50"
                          >
                            <option value="">-- Select User --</option>
                            {(usersForDropdown?.data || usersForDropdown || []).map((user) => (
                              <option key={user.id} value={user.id}>
                                {user.firstName} {user.lastName}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Row 2: Approved Date & Approved By */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <label className="block text-sm text-gray-500 mb-1">Approved Date</label>
                          <input
                            type="date"
                            value={opportunity.approvedDate ? new Date(opportunity.approvedDate).toISOString().split('T')[0] : ''}
                            onChange={async (e) => {
                              const value = e.target.value ? new Date(e.target.value).toISOString() : null;
                              await updateMutation.mutateAsync({ approvedDate: value });
                            }}
                            disabled={updateMutation.isPending}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-panda-primary focus:border-panda-primary disabled:opacity-50"
                          />
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <label className="block text-sm text-gray-500 mb-1">Approved By</label>
                          <select
                            value={opportunity.approvedById || ''}
                            onChange={async (e) => {
                              await updateMutation.mutateAsync({ approvedById: e.target.value || null });
                            }}
                            disabled={updateMutation.isPending}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-panda-primary focus:border-panda-primary disabled:opacity-50"
                          >
                            <option value="">-- Select User --</option>
                            {(usersForDropdown?.data || usersForDropdown || []).map((user) => (
                              <option key={user.id} value={user.id}>
                                {user.firstName} {user.lastName}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Row 3: Project Expeditor */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <label className="block text-sm text-gray-500 mb-1">Project Expeditor</label>
                          <select
                            value={opportunity.projectManagerId || ''}
                            onChange={async (e) => {
                              await updateMutation.mutateAsync({ projectManagerId: e.target.value || null });
                            }}
                            disabled={updateMutation.isPending}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-panda-primary focus:border-panda-primary disabled:opacity-50"
                          >
                            <option value="">-- Select User --</option>
                            {(usersForDropdown?.data || usersForDropdown || []).map((user) => (
                              <option key={user.id} value={user.id}>
                                {user.firstName} {user.lastName}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <label className="block text-sm text-gray-500 mb-1">Onboarding Complete Date</label>
                          <input
                            type="date"
                            value={opportunity.onboardingCompleteDate ? new Date(opportunity.onboardingCompleteDate).toISOString().split('T')[0] : ''}
                            onChange={async (e) => {
                              const value = e.target.value ? new Date(e.target.value).toISOString() : null;
                              await updateMutation.mutateAsync({ onboardingCompleteDate: value });
                            }}
                            disabled={updateMutation.isPending}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-panda-primary focus:border-panda-primary disabled:opacity-50"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Project Expediting Checklist - Mobile-first with HOA case creation */}
                    <ExpediterChecklist
                      opportunity={opportunity}
                      onUpdate={(data) => updateMutation.mutateAsync(data)}
                      users={usersForDropdown?.data || usersForDropdown || []}
                    />

                    {/* HOA & Permits */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-4">HOA & Permits</h3>
                      <div className="space-y-3">
                        <div className="flex items-center space-x-3">
                          <label className="text-sm text-gray-500 w-32">HOA Required:</label>
                          <span className={`px-2 py-1 rounded text-sm ${
                            opportunity.hoaRequired === 'yes' ? 'bg-yellow-100 text-yellow-800' :
                            opportunity.hoaRequired === 'no' ? 'bg-green-100 text-green-800' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {opportunity.hoaRequired || 'Unknown'}
                          </span>
                        </div>
                        {hoaPermitChecklist.map((item) => (
                          <label key={item.id} className="flex items-center space-x-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={item.checked}
                              onChange={() => handleChecklistToggle(item.field, item.checked)}
                              disabled={updateMutation.isPending}
                              className="w-5 h-5 rounded border-gray-300 text-panda-primary focus:ring-panda-primary disabled:opacity-50"
                            />
                            <span className={`text-gray-700 ${item.checked ? 'line-through text-gray-400' : ''}`}>{item.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Financing */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-4">Financing</h3>
                      <div className="space-y-3">
                        {financingChecklist.map((item) => (
                          <label key={item.id} className="flex items-center space-x-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={item.checked}
                              onChange={() => handleChecklistToggle(item.field, item.checked)}
                              disabled={updateMutation.isPending}
                              className="w-5 h-5 rounded border-gray-300 text-panda-primary focus:ring-panda-primary disabled:opacity-50"
                            />
                            <span className={`text-gray-700 ${item.checked ? 'line-through text-gray-400' : ''}`}>{item.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Photos Status */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-4">Photo Review Status</h3>
                      <div className="flex items-center space-x-4">
                        <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                          opportunity.photosCollected === 'sufficient' ? 'bg-green-100 text-green-800' :
                          opportunity.photosCollected === 'insufficient' ? 'bg-red-100 text-red-800' :
                          opportunity.photosCollected === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {opportunity.photosCollected === 'sufficient' ? '✓ Photos Sufficient' :
                           opportunity.photosCollected === 'insufficient' ? '✗ Photos Insufficient' :
                           opportunity.photosCollected === 'pending' ? '⏳ Pending Review' :
                           'Not Reviewed'}
                        </span>
                        {opportunity.photosReviewedDate && (
                          <span className="text-sm text-gray-500">
                            Reviewed: {new Date(opportunity.photosReviewedDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Trades */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-4">Trades</h3>
                      <div className="flex flex-wrap gap-2">
                        {trades.map((trade) => (
                          <label key={trade} className="flex items-center space-x-2 px-3 py-2 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                            <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-panda-primary focus:ring-panda-primary" />
                            <span className="text-sm text-gray-700">{trade}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Not Install Ready */}
                    {opportunity.notInstallReady && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-red-800 mb-2">⚠️ Not Install Ready</h3>
                        <p className="text-sm text-red-700">{opportunity.notInstallReadyNotes || 'No notes provided'}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            {/* Job Details Card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              <div className="p-5 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Job Details</h2>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <div>
                    <label className="text-sm text-gray-500">Work Type</label>
                    <p className="font-medium text-gray-900">{opportunity.workType || 'Insurance Roofing'}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Lead Source</label>
                    <p className="font-medium text-gray-500 italic">Not set</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Lead Creditor</label>
                    <p className="font-medium text-gray-500 italic">Not set</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Account Name</label>
                    <p className="font-medium text-gray-900">{opportunity.account?.name || opportunity.name}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Amount</label>
                    <p className="font-medium text-green-600">
                      {opportunity.amount ? `$${opportunity.amount.toLocaleString()}` : 'Not set'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Prospect Date</label>
                    <p className="font-medium text-gray-900">
                      {opportunity.createdAt ? new Date(opportunity.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Claim Information Card - Only show for Insurance opportunities */}
            {(opportunity.type === 'INSURANCE' || opportunity.workType?.toLowerCase().includes('insurance')) && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">Claim Information</h2>
                  <button
                    onClick={() => setIsEditingClaim(!isEditingClaim)}
                    className="text-panda-primary text-sm hover:underline"
                  >
                    {isEditingClaim ? 'Cancel' : 'Edit'}
                  </button>
                </div>
                <div className="p-5">
                  {isEditingClaim ? (
                    <form onSubmit={handleClaimSave} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm text-gray-500 mb-1">Insurance Company</label>
                          <input
                            type="text"
                            value={claimForm.insuranceCarrier}
                            onChange={(e) => setClaimForm({ ...claimForm, insuranceCarrier: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                            placeholder="Enter insurance company"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-500 mb-1">Claim Number</label>
                          <input
                            type="text"
                            value={claimForm.claimNumber}
                            onChange={(e) => setClaimForm({ ...claimForm, claimNumber: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                            placeholder="Enter claim number"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-500 mb-1">Date of Loss</label>
                          <input
                            type="date"
                            value={claimForm.dateOfLoss}
                            onChange={(e) => setClaimForm({ ...claimForm, dateOfLoss: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-500 mb-1">Claim Filed Date</label>
                          <input
                            type="date"
                            value={claimForm.claimFiledDate}
                            onChange={(e) => setClaimForm({ ...claimForm, claimFiledDate: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-sm text-gray-500 mb-1">Damage Location</label>
                          <input
                            type="text"
                            value={claimForm.damageLocation}
                            onChange={(e) => setClaimForm({ ...claimForm, damageLocation: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                            placeholder="e.g., Roof, Siding, Gutters"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end space-x-3 pt-2">
                        <button
                          type="button"
                          onClick={() => setIsEditingClaim(false)}
                          className="px-4 py-2 text-gray-600 hover:text-gray-800"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90"
                        >
                          Save Changes
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                      <div>
                        <label className="text-sm text-gray-500">Insurance Company</label>
                        <p className={`font-medium ${opportunity.insuranceCarrier ? 'text-gray-900' : 'text-gray-500 italic'}`}>
                          {opportunity.insuranceCarrier || 'Not set'}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm text-gray-500">Claim Number</label>
                        <p className={`font-medium ${opportunity.claimNumber ? 'text-gray-900' : 'text-gray-500 italic'}`}>
                          {opportunity.claimNumber || 'Not set'}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm text-gray-500">Date of Loss</label>
                        <p className={`font-medium ${opportunity.dateOfLoss ? 'text-gray-900' : 'text-gray-500 italic'}`}>
                          {opportunity.dateOfLoss
                            ? new Date(opportunity.dateOfLoss).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : 'Not set'}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm text-gray-500">Claim Filed Date</label>
                        <p className={`font-medium ${opportunity.claimFiledDate ? 'text-gray-900' : 'text-gray-500 italic'}`}>
                          {opportunity.claimFiledDate
                            ? new Date(opportunity.claimFiledDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : 'Not set'}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <label className="text-sm text-gray-500">Damage Location</label>
                        <p className={`font-medium ${opportunity.damageLocation ? 'text-gray-900' : 'text-gray-500 italic'}`}>
                          {opportunity.damageLocation || 'Not set'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Appointments Card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Appointments ({summary?.counts?.appointments || appointments?.length || 0})</h2>
                <button className="text-panda-primary text-sm hover:underline">+ Add</button>
              </div>
              <div className="p-5">
                {appointments && appointments.length > 0 ? (
                  <div className="space-y-3">
                    {appointments.slice(0, 2).map((apt) => (
                      <div key={apt.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-medium text-gray-900">{apt.appointmentNumber || `SA-${apt.id.slice(-5)}`}</span>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            apt.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                            apt.status === 'SCHEDULED' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {apt.status || 'None'}
                          </span>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex">
                            <span className="text-gray-500 w-32">Work Type:</span>
                            <span className="text-gray-900">{apt.workType?.name || apt.subject || '-'}</span>
                          </div>
                          <div className="flex">
                            <span className="text-gray-500 w-32">Scheduled Start:</span>
                            <span className={apt.scheduledStart ? 'text-gray-900' : 'text-gray-500 italic'}>
                              {apt.scheduledStart ? new Date(apt.scheduledStart).toLocaleString() : '-'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {appointments.length > 2 && (
                      <button
                        onClick={() => setActiveTab('schedule')}
                        className="text-panda-primary text-sm hover:underline"
                      >
                        View all {appointments.length} appointments →
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4 text-gray-500">
                    <p className="text-sm">No appointments scheduled</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Quick Action Modal */}
      {showQuickActionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className={`bg-white rounded-xl shadow-xl w-full mx-4 max-h-[90vh] overflow-y-auto ${
            ['gafQuickMeasure', 'eagleviewMeasure', 'hoverCapture', 'instantMeasure'].includes(activeQuickAction)
              ? 'max-w-3xl'
              : 'max-w-lg'
          }`}>
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-xl font-semibold text-gray-900">
                {activeQuickAction === 'createWorkOrder' && 'Create Work Order'}
                {activeQuickAction?.type === 'editWorkOrder' && 'Edit Work Order'}
                {activeQuickAction?.type === 'addAppointment' && 'Schedule Appointment'}
                {activeQuickAction?.type === 'scheduleAppointment' && 'Schedule Appointment'}
                {activeQuickAction?.type === 'editAppointment' && 'Edit Appointment'}
                {activeQuickAction === 'gafQuickMeasure' && 'GAF Quick Measure'}
                {activeQuickAction === 'eagleviewMeasure' && 'Get EagleView Measurements'}
                {activeQuickAction === 'hoverCapture' && 'Hover 3D Capture'}
                {activeQuickAction === 'instantMeasure' && 'Instant Measurement'}
                {activeQuickAction === 'requestEstimate' && 'Request Estimate'}
                {activeQuickAction === 'updateMeetingOutcome' && 'Update Adjuster Meeting Outcome'}
                {activeQuickAction === 'createCase' && 'Create Case'}
                {activeQuickAction === 'composeEmail' && 'Compose Email'}
                {activeQuickAction === 'sendMessage' && 'Send Message'}
                {activeQuickAction === 'addContact' && 'Add Contact'}
                {!activeQuickAction?.type && !['createWorkOrder', 'gafQuickMeasure', 'eagleviewMeasure', 'hoverCapture', 'instantMeasure', 'requestEstimate', 'updateMeetingOutcome', 'createCase', 'composeEmail', 'sendMessage', 'addContact'].includes(activeQuickAction) && 'Quick Action'}
              </h2>
              <button
                onClick={() => {
                  setShowQuickActionModal(false);
                  setActiveQuickAction(null);
                  setActionError(null);
                }}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {actionError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2 text-red-700">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm">{actionError}</span>
                </div>
              )}

              {/* Create Work Order Form */}
              {activeQuickAction === 'createWorkOrder' && (
                <form onSubmit={(e) => {
                  e.preventDefault();
                  createWorkOrderMutation.mutate(workOrderForm);
                }} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label>
                    <input
                      type="text"
                      value={workOrderForm.subject}
                      onChange={(e) => setWorkOrderForm(prev => ({ ...prev, subject: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                      placeholder="e.g., Roof Installation"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Work Type</label>
                    <select
                      value={workOrderForm.workTypeId}
                      onChange={(e) => setWorkOrderForm(prev => ({ ...prev, workTypeId: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                    >
                      <option value="">Select work type...</option>
                      {workTypes?.map((wt) => (
                        <option key={wt.id} value={wt.id}>{wt.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                    <select
                      value={workOrderForm.priority}
                      onChange={(e) => setWorkOrderForm(prev => ({ ...prev, priority: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled Start Date</label>
                    <input
                      type="date"
                      value={workOrderForm.scheduledStartDate}
                      onChange={(e) => setWorkOrderForm(prev => ({ ...prev, scheduledStartDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={workOrderForm.description}
                      onChange={(e) => setWorkOrderForm(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                      rows={3}
                      placeholder="Add any notes or special instructions..."
                    />
                  </div>

                  <div className="flex items-center justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowQuickActionModal(false)}
                      className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={createWorkOrderMutation.isLoading || !workOrderForm.subject}
                      className="px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-dark disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      {createWorkOrderMutation.isLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                      <span>Create Work Order</span>
                    </button>
                  </div>
                </form>
              )}

              {/* GAF Quick Measure Form */}
              {activeQuickAction === 'gafQuickMeasure' && (
                <form onSubmit={(e) => {
                  e.preventDefault();
                  orderGAFMeasureMutation.mutate(gafMeasureForm);
                }} className="space-y-4">
                  {/* Measurement Type */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Measurement Type *</label>
                    <select
                      value={gafMeasureForm.measurementType}
                      onChange={(e) => setGafMeasureForm(prev => ({ ...prev, measurementType: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                      required
                    >
                      <option value="QuickMeasureResidentialSingleFamily">Residential Single Family</option>
                      <option value="ResidentialMultiFamily">Residential Multi Family</option>
                      <option value="Commercial">Commercial</option>
                    </select>
                  </div>

                  {/* Measurement Instructions */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Measurement Instructions *</label>
                    <select
                      value={gafMeasureForm.measurementInstructions}
                      onChange={(e) => setGafMeasureForm(prev => ({ ...prev, measurementInstructions: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                      required
                    >
                      <option value="Primary Structure Only">Primary Structure Only</option>
                      <option value="Primary Structure & Detached Garage">Primary Structure & Detached Garage</option>
                      <option value="All Structures on Parcel">All Structures on Parcel</option>
                      <option value="Commercial Complex">Commercial Complex</option>
                    </select>
                  </div>

                  {/* Comments */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Comments</label>
                    <textarea
                      value={gafMeasureForm.comments}
                      onChange={(e) => setGafMeasureForm(prev => ({ ...prev, comments: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                      rows={2}
                      placeholder="Add any special instructions..."
                    />
                  </div>

                  {/* Address Section */}
                  <div className="border-t border-gray-200 pt-4 mt-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
                      <MapPin className="w-4 h-4 mr-2 text-gray-500" />
                      Property Address
                    </h3>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Street Address *</label>
                        <input
                          type="text"
                          value={gafMeasureForm.street}
                          onChange={(e) => setGafMeasureForm(prev => ({ ...prev, street: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                          placeholder="123 Main St"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                          <input
                            type="text"
                            value={gafMeasureForm.city}
                            onChange={(e) => setGafMeasureForm(prev => ({ ...prev, city: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
                          <input
                            type="text"
                            value={gafMeasureForm.state}
                            onChange={(e) => setGafMeasureForm(prev => ({ ...prev, state: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                            placeholder="MD"
                            maxLength={2}
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">ZIP Code *</label>
                        <input
                          type="text"
                          value={gafMeasureForm.zip}
                          onChange={(e) => setGafMeasureForm(prev => ({ ...prev, zip: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                          placeholder="21201"
                          maxLength={10}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* Draggable Map for Pin Placement */}
                  <div className="border-t border-gray-200 pt-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
                      <MapPin className="w-4 h-4 mr-2 text-red-500" />
                      Verify Property Location
                    </h3>
                    <p className="text-xs text-gray-500 mb-3">
                      Drag the pin or click on the map to set the exact property location. This ensures accurate measurements.
                    </p>
                    <DraggableMap
                      latitude={gafMeasureForm.latitude}
                      longitude={gafMeasureForm.longitude}
                      address={`${gafMeasureForm.street}, ${gafMeasureForm.city}, ${gafMeasureForm.state} ${gafMeasureForm.zip}`}
                      onLocationChange={(lat, lng) => {
                        setGafMeasureForm(prev => ({
                          ...prev,
                          latitude: lat.toFixed(6),
                          longitude: lng.toFixed(6),
                        }));
                      }}
                      height={350}
                    />
                  </div>

                  {/* Coordinates Section */}
                  <div className="border-t border-gray-200 pt-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
                      <Globe className="w-4 h-4 mr-2 text-gray-500" />
                      Geo Coordinates
                    </h3>
                    <p className="text-xs text-gray-500 mb-3">
                      These values update automatically when you move the pin on the map.
                    </p>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
                        <input
                          type="text"
                          value={gafMeasureForm.latitude}
                          onChange={(e) => setGafMeasureForm(prev => ({ ...prev, latitude: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-gray-50"
                          placeholder="39.2904"
                          readOnly
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
                        <input
                          type="text"
                          value={gafMeasureForm.longitude}
                          onChange={(e) => setGafMeasureForm(prev => ({ ...prev, longitude: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-gray-50"
                          placeholder="-76.6122"
                          readOnly
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={() => setShowQuickActionModal(false)}
                      className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={orderGAFMeasureMutation.isPending || !gafMeasureForm.street || !gafMeasureForm.city || !gafMeasureForm.state || !gafMeasureForm.zip}
                      className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      {orderGAFMeasureMutation.isPending ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Submitting...</span>
                        </>
                      ) : (
                        <>
                          <Ruler className="w-4 h-4" />
                          <span>Submit Order</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* EagleView Measurements Form */}
              {activeQuickAction === 'eagleviewMeasure' && (
                <form onSubmit={(e) => {
                  e.preventDefault();
                  orderEagleViewMutation.mutate(eagleviewForm);
                }} className="space-y-4">
                  {/* Measurement Type */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Measurement Type *</label>
                    <select
                      value={eagleviewForm.measurementType}
                      onChange={(e) => setEagleviewForm(prev => ({ ...prev, measurementType: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                      required
                    >
                      <option value="">--None--</option>
                      <option value="ResidentialPremium">Residential Premium</option>
                      <option value="CommercialPremium">Commercial Premium</option>
                      <option value="SolarResidential">Solar Residential</option>
                      <option value="SolarAdvancedResidential">Solar Advanced Residential</option>
                      <option value="QuickSquares">QuickSquares</option>
                      <option value="ResidentialGutter">Residential Gutter</option>
                      <option value="WholeHome">Whole Home</option>
                      <option value="SolarInformEssentialsResidential">Solar Inform Essentials Residential</option>
                      <option value="ResidentialWallsWindowsDoors">Residential Walls, Windows & Doors</option>
                      <option value="ResidentialBidPerfect">Residential Bid Perfect</option>
                      <option value="CommercialGutter">Commercial Gutter</option>
                      <option value="CommercialWalls">Commercial Walls</option>
                      <option value="CommercialBidPerfect">Commercial Bid Perfect</option>
                      <option value="SolarInformEssentialsCommercial">Solar Inform Essentials Commercial</option>
                      <option value="SolarInformAdvancedResidential">Solar Inform Advanced Residential</option>
                    </select>
                  </div>

                  {/* Delivery Method */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Method *</label>
                    <select
                      value={eagleviewForm.deliveryMethod}
                      onChange={(e) => setEagleviewForm(prev => ({ ...prev, deliveryMethod: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                      required
                    >
                      <option value="Regular">Regular</option>
                    </select>
                  </div>

                  {/* Measurement Instructions */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Measurement Instructions *</label>
                    <select
                      value={eagleviewForm.measurementInstructions}
                      onChange={(e) => setEagleviewForm(prev => ({ ...prev, measurementInstructions: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                      required
                    >
                      <option value="Primary Structure Only">Primary Structure Only</option>
                      <option value="Primary Structure & Detached Garage">Primary Structure & Detached Garage</option>
                      <option value="All Structures on Parcel">All Structures on Parcel</option>
                      <option value="Commercial Complex">Commercial Complex</option>
                    </select>
                  </div>

                  {/* Comments */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Comments</label>
                    <textarea
                      value={eagleviewForm.comments}
                      onChange={(e) => setEagleviewForm(prev => ({ ...prev, comments: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                      rows={2}
                      placeholder="Add any special instructions..."
                    />
                  </div>

                  {/* Address Section */}
                  <div className="border-t border-gray-200 pt-4 mt-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
                      <MapPin className="w-4 h-4 mr-2 text-gray-500" />
                      Property Address
                    </h3>
                    <p className="text-xs text-red-500 mb-3">
                      Use the coordinates below to verify the pin placement
                    </p>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Street *</label>
                        <textarea
                          value={eagleviewForm.street}
                          onChange={(e) => setEagleviewForm(prev => ({ ...prev, street: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                          rows={2}
                          placeholder="123 Main St"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                          <input
                            type="text"
                            value={eagleviewForm.city}
                            onChange={(e) => setEagleviewForm(prev => ({ ...prev, city: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">State/Province *</label>
                          <input
                            type="text"
                            value={eagleviewForm.state}
                            onChange={(e) => setEagleviewForm(prev => ({ ...prev, state: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                            placeholder="NJ"
                            required
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Zip/Postal Code *</label>
                          <input
                            type="text"
                            value={eagleviewForm.zip}
                            onChange={(e) => setEagleviewForm(prev => ({ ...prev, zip: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                            placeholder="08859"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                          <input
                            type="text"
                            value={eagleviewForm.country}
                            onChange={(e) => setEagleviewForm(prev => ({ ...prev, country: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                            placeholder="United States"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Draggable Map for Pin Placement */}
                  <div className="border-t border-gray-200 pt-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
                      <MapPin className="w-4 h-4 mr-2 text-red-500" />
                      Verify Property Location
                    </h3>
                    <p className="text-xs text-red-500 mb-3">
                      Use the coordinates below to verify the pin placement. Drag the pin or click on the map to adjust.
                    </p>
                    <DraggableMap
                      latitude={eagleviewForm.latitude}
                      longitude={eagleviewForm.longitude}
                      address={`${eagleviewForm.street}, ${eagleviewForm.city}, ${eagleviewForm.state} ${eagleviewForm.zip}`}
                      onLocationChange={(lat, lng) => {
                        setEagleviewForm(prev => ({
                          ...prev,
                          latitude: lat.toFixed(6),
                          longitude: lng.toFixed(6),
                        }));
                      }}
                      height={350}
                    />
                  </div>

                  {/* Coordinates Section */}
                  <div className="border-t border-gray-200 pt-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
                      <Globe className="w-4 h-4 mr-2 text-gray-500" />
                      Geo Coordinates
                    </h3>
                    <p className="text-xs text-gray-500 mb-3">
                      These values update automatically when you move the pin on the map.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
                        <input
                          type="text"
                          value={eagleviewForm.latitude}
                          onChange={(e) => setEagleviewForm(prev => ({ ...prev, latitude: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-gray-50"
                          placeholder="40.458339"
                          readOnly
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
                        <input
                          type="text"
                          value={eagleviewForm.longitude}
                          onChange={(e) => setEagleviewForm(prev => ({ ...prev, longitude: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-gray-50"
                          placeholder="-74.27022"
                          readOnly
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={() => setShowQuickActionModal(false)}
                      className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={orderEagleViewMutation.isPending || !eagleviewForm.street || !eagleviewForm.city || !eagleviewForm.state || !eagleviewForm.zip || !eagleviewForm.measurementType}
                      className="px-4 py-2 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-lg hover:from-orange-600 hover:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      {orderEagleViewMutation.isPending ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Submitting...</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-4 h-4" />
                          <span>Submit Order</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Hover 3D Capture Form */}
              {activeQuickAction === 'hoverCapture' && (
                <form onSubmit={(e) => {
                  e.preventDefault();
                  createHoverCaptureMutation.mutate(hoverCaptureForm);
                }} className="space-y-4">
                  {/* Info Banner */}
                  <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                    <div className="flex items-start space-x-3">
                      <Camera className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-purple-800">
                        <p className="font-medium">Photo-Based 3D Modeling</p>
                        <p className="mt-1">Hover creates a detailed 3D model from smartphone photos. A capture link will be generated that can be shared with the field team or homeowner.</p>
                      </div>
                    </div>
                  </div>

                  {/* Capture Type */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Capture Type *</label>
                    <select
                      value={hoverCaptureForm.captureType}
                      onChange={(e) => setHoverCaptureForm(prev => ({ ...prev, captureType: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                      required
                    >
                      <option value="EXTERIOR">Exterior 3D Model ($25)</option>
                      <option value="EXTERIOR_PLUS">Exterior + Design Visualization ($45)</option>
                      <option value="FULL_PROPERTY">Full Property (Interior + Exterior) ($75)</option>
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      {hoverCaptureForm.captureType === 'EXTERIOR' && 'Full exterior measurements with 3D model'}
                      {hoverCaptureForm.captureType === 'EXTERIOR_PLUS' && 'Includes design visualization with real materials (GAF, JamesHardie, Alside)'}
                      {hoverCaptureForm.captureType === 'FULL_PROPERTY' && 'Exterior + interior measurements and 3D model'}
                    </p>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes for Field Team</label>
                    <textarea
                      value={hoverCaptureForm.notes}
                      onChange={(e) => setHoverCaptureForm(prev => ({ ...prev, notes: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                      rows={2}
                      placeholder="e.g., Please capture all sides including the detached garage..."
                    />
                  </div>

                  {/* Address Section */}
                  <div className="border-t border-gray-200 pt-4 mt-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
                      <MapPin className="w-4 h-4 mr-2 text-gray-500" />
                      Property Address
                    </h3>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Street Address *</label>
                        <input
                          type="text"
                          value={hoverCaptureForm.street}
                          onChange={(e) => setHoverCaptureForm(prev => ({ ...prev, street: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                          placeholder="123 Main St"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                          <input
                            type="text"
                            value={hoverCaptureForm.city}
                            onChange={(e) => setHoverCaptureForm(prev => ({ ...prev, city: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
                          <input
                            type="text"
                            value={hoverCaptureForm.state}
                            onChange={(e) => setHoverCaptureForm(prev => ({ ...prev, state: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                            maxLength={2}
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">ZIP Code *</label>
                        <input
                          type="text"
                          value={hoverCaptureForm.zip}
                          onChange={(e) => setHoverCaptureForm(prev => ({ ...prev, zip: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                          maxLength={10}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={() => setShowQuickActionModal(false)}
                      className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={createHoverCaptureMutation.isPending || !hoverCaptureForm.street || !hoverCaptureForm.city || !hoverCaptureForm.state || !hoverCaptureForm.zip}
                      className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg hover:from-purple-600 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      {createHoverCaptureMutation.isPending ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Creating...</span>
                        </>
                      ) : (
                        <>
                          <Camera className="w-4 h-4" />
                          <span>Create Capture Request</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Instant Measurement - Now handled inline in Measurements section, no modal needed */}

              {/* Request Estimate Form - Combines Salesforce fields with Task assignment */}
              {activeQuickAction === 'requestEstimate' && (
                <form onSubmit={(e) => {
                  e.preventDefault();
                  requestEstimateMutation.mutate(estimateRequestForm);
                }} className="space-y-4 max-h-[70vh] overflow-y-auto">
                  {/* Info Banner */}
                  <div className="p-4 bg-teal-50 border border-teal-200 rounded-lg">
                    <div className="flex items-start space-x-3">
                      <FileText className="w-5 h-5 text-teal-600 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-teal-800">
                        <p className="font-medium">Request Estimate</p>
                        <p className="mt-1">Create an estimate request and assign it to a team member with a due date.</p>
                      </div>
                    </div>
                  </div>

                  {/* Assignment Section */}
                  <div className="p-4 bg-gray-50 rounded-lg space-y-4">
                    <h4 className="font-medium text-gray-900 flex items-center">
                      <User className="w-4 h-4 mr-2" />
                      Assignment
                    </h4>

                    {/* Assigned To - User Search */}
                    <div className="relative">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Assigned To *</label>
                      {selectedAssignee ? (
                        <div className="flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg bg-white">
                          <div className="flex items-center space-x-2">
                            <div className="w-8 h-8 bg-panda-primary/10 rounded-full flex items-center justify-center">
                              <User className="w-4 h-4 text-panda-primary" />
                            </div>
                            <span className="text-sm font-medium">{selectedAssignee.fullName || selectedAssignee.name}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedAssignee(null);
                              setEstimateRequestForm(prev => ({ ...prev, assignedToId: '' }));
                              setAssigneeSearchQuery('');
                            }}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                              type="text"
                              value={assigneeSearchQuery}
                              onChange={(e) => {
                                setAssigneeSearchQuery(e.target.value);
                                setShowAssigneeDropdown(true);
                              }}
                              onFocus={() => setShowAssigneeDropdown(true)}
                              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                              placeholder="Search for a user..."
                            />
                          </div>
                          {showAssigneeDropdown && assigneeSearchResults?.length > 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                              {assigneeSearchResults.map((user) => (
                                <button
                                  key={user.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedAssignee(user);
                                    setEstimateRequestForm(prev => ({ ...prev, assignedToId: user.id }));
                                    setShowAssigneeDropdown(false);
                                    setAssigneeSearchQuery('');
                                  }}
                                  className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center space-x-2"
                                >
                                  <div className="w-8 h-8 bg-panda-primary/10 rounded-full flex items-center justify-center">
                                    <User className="w-4 h-4 text-panda-primary" />
                                  </div>
                                  <div>
                                    <div className="text-sm font-medium">{user.fullName || `${user.firstName} ${user.lastName}`}</div>
                                    <div className="text-xs text-gray-500">{user.email}</div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Due Date */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Due Date *</label>
                      <input
                        type="date"
                        value={estimateRequestForm.dueDate}
                        onChange={(e) => setEstimateRequestForm(prev => ({ ...prev, dueDate: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                        required
                      />
                    </div>

                    {/* Status */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Status *</label>
                      <select
                        value={estimateRequestForm.status}
                        onChange={(e) => setEstimateRequestForm(prev => ({ ...prev, status: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                        required
                      >
                        <option value="Open">Open</option>
                        <option value="Completed">Completed</option>
                        <option value="Interested">Interested</option>
                        <option value="Accepted">Accepted</option>
                        <option value="Declined">Declined</option>
                      </select>
                    </div>
                  </div>

                  {/* Estimate Details Section */}
                  <div className="p-4 bg-gray-50 rounded-lg space-y-4">
                    <h4 className="font-medium text-gray-900 flex items-center">
                      <FileText className="w-4 h-4 mr-2" />
                      Estimate Details
                    </h4>

                    {/* Estimate Type */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Estimate Type *</label>
                      <select
                        value={estimateRequestForm.estimateType}
                        onChange={(e) => setEstimateRequestForm(prev => ({ ...prev, estimateType: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                        required
                      >
                        <option value="Full Replacement">Full Replacement</option>
                        <option value="Repair">Repair</option>
                      </select>
                    </div>

                    {/* Trade Type */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Trade Type *</label>
                      <select
                        value={estimateRequestForm.tradeType}
                        onChange={(e) => setEstimateRequestForm(prev => ({ ...prev, tradeType: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                        required
                      >
                        <option value="Roof">Roof</option>
                        <option value="Siding">Siding</option>
                        <option value="Gutters">Gutters</option>
                        <option value="Trim">Trim</option>
                        <option value="Capping">Capping</option>
                        <option value="Painter">Painter</option>
                        <option value="Drywall">Drywall</option>
                        <option value="Electrical">Electrical</option>
                      </select>
                    </div>

                    {/* Affected Structures */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Affected Structures *</label>
                      <input
                        type="text"
                        value={estimateRequestForm.affectedStructures}
                        onChange={(e) => setEstimateRequestForm(prev => ({ ...prev, affectedStructures: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                        placeholder="e.g., Main House, Garage, Shed"
                        required
                      />
                    </div>

                    {/* Priority Level */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Priority Level *</label>
                      <select
                        value={estimateRequestForm.priorityLevel}
                        onChange={(e) => setEstimateRequestForm(prev => ({ ...prev, priorityLevel: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                        required
                      >
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                    </div>

                    {/* Other Information */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Other Information</label>
                      <textarea
                        value={estimateRequestForm.otherInformation}
                        onChange={(e) => setEstimateRequestForm(prev => ({ ...prev, otherInformation: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                        rows={3}
                        placeholder="Additional notes or instructions..."
                      />
                    </div>
                  </div>

                  {/* Reminder Section */}
                  <div className="p-4 bg-gray-50 rounded-lg space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-gray-900 flex items-center">
                        <Bell className="w-4 h-4 mr-2" />
                        Set Reminder
                      </h4>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={estimateRequestForm.reminderEnabled}
                          onChange={(e) => setEstimateRequestForm(prev => ({ ...prev, reminderEnabled: e.target.checked }))}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-panda-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-panda-primary"></div>
                      </label>
                    </div>

                    {estimateRequestForm.reminderEnabled && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Reminder Date</label>
                          <input
                            type="date"
                            value={estimateRequestForm.reminderDate}
                            onChange={(e) => setEstimateRequestForm(prev => ({ ...prev, reminderDate: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Reminder Time</label>
                          <input
                            type="time"
                            value={estimateRequestForm.reminderTime}
                            onChange={(e) => setEstimateRequestForm(prev => ({ ...prev, reminderTime: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Recurring Task Section */}
                  <div className="p-4 bg-gray-50 rounded-lg space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-gray-900 flex items-center">
                        <Calendar className="w-4 h-4 mr-2" />
                        Create Recurring Series
                      </h4>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={estimateRequestForm.isRecurring}
                          onChange={(e) => setEstimateRequestForm(prev => ({ ...prev, isRecurring: e.target.checked }))}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-panda-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-panda-primary"></div>
                      </label>
                    </div>

                    {estimateRequestForm.isRecurring && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
                          <select
                            value={estimateRequestForm.recurringFrequency}
                            onChange={(e) => setEstimateRequestForm(prev => ({ ...prev, recurringFrequency: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                          >
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                          <input
                            type="date"
                            value={estimateRequestForm.recurringEndDate}
                            onChange={(e) => setEstimateRequestForm(prev => ({ ...prev, recurringEndDate: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200 sticky bottom-0 bg-white pb-2">
                    <button
                      type="button"
                      onClick={() => setShowQuickActionModal(false)}
                      className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={requestEstimateMutation.isPending || !estimateRequestForm.assignedToId || !estimateRequestForm.dueDate || !estimateRequestForm.affectedStructures}
                      className="px-4 py-2 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-lg hover:from-teal-600 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      {requestEstimateMutation.isPending ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Submitting...</span>
                        </>
                      ) : (
                        <>
                          <FileText className="w-4 h-4" />
                          <span>Submit</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Update Meeting Outcome Form (Insurance) */}
              {activeQuickAction === 'updateMeetingOutcome' && (
                <form onSubmit={(e) => {
                  e.preventDefault();
                  if (!meetingOutcomeForm.outcome) {
                    setActionError('Please select a meeting outcome');
                    return;
                  }
                  updateMeetingOutcomeMutation.mutate(meetingOutcomeForm);
                }} className="space-y-4">
                  {/* Info Banner */}
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start space-x-3">
                      <ClipboardCheck className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-amber-800">
                        <p className="font-medium">Update Adjuster Meeting Outcome</p>
                        <p className="mt-1">Select the result of the adjuster meeting. This will update the opportunity status and create follow-up actions automatically.</p>
                      </div>
                    </div>
                  </div>

                  {/* Outcome Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">Meeting Outcome *</label>
                    <div className="space-y-3">
                      <label className={`flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all ${
                        meetingOutcomeForm.outcome === 'full_approval'
                          ? 'border-green-500 bg-green-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}>
                        <input
                          type="radio"
                          name="outcome"
                          value="full_approval"
                          checked={meetingOutcomeForm.outcome === 'full_approval'}
                          onChange={(e) => setMeetingOutcomeForm(prev => ({ ...prev, outcome: e.target.value }))}
                          className="mt-1 mr-3"
                        />
                        <div>
                          <span className="font-medium text-gray-900">Full Approval w/ Estimate</span>
                          <p className="text-sm text-gray-500 mt-1">Claim approved - enables contract signing. Creates task to prep project specs and schedules contract signing appointment.</p>
                        </div>
                      </label>

                      <label className={`flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all ${
                        meetingOutcomeForm.outcome === 'pending_estimate'
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}>
                        <input
                          type="radio"
                          name="outcome"
                          value="pending_estimate"
                          checked={meetingOutcomeForm.outcome === 'pending_estimate'}
                          onChange={(e) => setMeetingOutcomeForm(prev => ({ ...prev, outcome: e.target.value }))}
                          className="mt-1 mr-3"
                        />
                        <div>
                          <span className="font-medium text-gray-900">Pending Estimate</span>
                          <p className="text-sm text-gray-500 mt-1">Meeting complete but awaiting estimate document. Creates follow-up task to obtain estimate.</p>
                        </div>
                      </label>

                      <label className={`flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all ${
                        meetingOutcomeForm.outcome === 'repair_denied'
                          ? 'border-red-500 bg-red-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}>
                        <input
                          type="radio"
                          name="outcome"
                          value="repair_denied"
                          checked={meetingOutcomeForm.outcome === 'repair_denied'}
                          onChange={(e) => setMeetingOutcomeForm(prev => ({ ...prev, outcome: e.target.value }))}
                          className="mt-1 mr-3"
                        />
                        <div>
                          <span className="font-medium text-gray-900">Repair Estimate OR Denied</span>
                          <p className="text-sm text-gray-500 mt-1">Claim denied or only repair estimate approved. Creates PandaClaims case for review.</p>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Additional Fields for Full Approval */}
                  {meetingOutcomeForm.outcome === 'full_approval' && (
                    <div className="grid grid-cols-2 gap-4 p-4 bg-green-50 rounded-lg border border-green-200">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">RCV Amount ($)</label>
                        <input
                          type="number"
                          value={meetingOutcomeForm.estimateAmount}
                          onChange={(e) => setMeetingOutcomeForm(prev => ({ ...prev, estimateAmount: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                          placeholder="0.00"
                          step="0.01"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Deductible ($)</label>
                        <input
                          type="number"
                          value={meetingOutcomeForm.deductible}
                          onChange={(e) => setMeetingOutcomeForm(prev => ({ ...prev, deductible: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                          placeholder="0.00"
                          step="0.01"
                        />
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Meeting Notes</label>
                    <textarea
                      value={meetingOutcomeForm.notes}
                      onChange={(e) => setMeetingOutcomeForm(prev => ({ ...prev, notes: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                      rows={3}
                      placeholder="Document what occurred during the meeting..."
                    />
                  </div>

                  <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={() => setShowQuickActionModal(false)}
                      className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={updateMeetingOutcomeMutation.isPending || !meetingOutcomeForm.outcome}
                      className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-lg hover:from-amber-600 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      {updateMeetingOutcomeMutation.isPending ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Updating...</span>
                        </>
                      ) : (
                        <>
                          <ClipboardCheck className="w-4 h-4" />
                          <span>Save Outcome</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Edit Work Order Form */}
              {activeQuickAction?.type === 'editWorkOrder' && (
                <form onSubmit={(e) => {
                  e.preventDefault();
                  updateWorkOrderMutation.mutate({
                    workOrderId: activeQuickAction.workOrder.id,
                    data: {
                      subject: activeQuickAction.workOrder.subject,
                      status: activeQuickAction.workOrder.status,
                      priority: activeQuickAction.workOrder.priority,
                      description: activeQuickAction.workOrder.description,
                    }
                  });
                }} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                    <input
                      type="text"
                      defaultValue={activeQuickAction.workOrder.subject}
                      onChange={(e) => { activeQuickAction.workOrder.subject = e.target.value; }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      defaultValue={activeQuickAction.workOrder.status}
                      onChange={(e) => { activeQuickAction.workOrder.status = e.target.value; }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                    >
                      <option value="DRAFT">Draft</option>
                      <option value="NEW">New</option>
                      <option value="SCHEDULED">Scheduled</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="CANCELLED">Cancelled</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                    <select
                      defaultValue={activeQuickAction.workOrder.priority || 'MEDIUM'}
                      onChange={(e) => { activeQuickAction.workOrder.priority = e.target.value; }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      defaultValue={activeQuickAction.workOrder.description || ''}
                      onChange={(e) => { activeQuickAction.workOrder.description = e.target.value; }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                      rows={3}
                    />
                  </div>

                  <div className="flex items-center justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowQuickActionModal(false)}
                      className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={updateWorkOrderMutation.isLoading}
                      className="px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-dark disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      {updateWorkOrderMutation.isLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                      <span>Update Work Order</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Add Appointment Form */}
              {activeQuickAction?.type === 'addAppointment' && (
                <form onSubmit={(e) => {
                  e.preventDefault();
                  createAppointmentMutation.mutate({
                    workOrderId: activeQuickAction.workOrderId,
                    ...appointmentForm,
                  });
                }} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled Start *</label>
                    <input
                      type="datetime-local"
                      value={appointmentForm.scheduledStart}
                      onChange={(e) => setAppointmentForm(prev => ({ ...prev, scheduledStart: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled End *</label>
                    <input
                      type="datetime-local"
                      value={appointmentForm.scheduledEnd}
                      onChange={(e) => setAppointmentForm(prev => ({ ...prev, scheduledEnd: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      value={appointmentForm.status}
                      onChange={(e) => setAppointmentForm(prev => ({ ...prev, status: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                    >
                      <option value="SCHEDULED">Scheduled</option>
                      <option value="DISPATCHED">Dispatched</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="COMPLETED">Completed</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowQuickActionModal(false)}
                      className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={createAppointmentMutation.isLoading || !appointmentForm.scheduledStart || !appointmentForm.scheduledEnd}
                      className="px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-dark disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      {createAppointmentMutation.isLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                      <span>Schedule Appointment</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Schedule Appointment Form (uses existing work order or creates new one) */}
              {activeQuickAction?.type === 'scheduleAppointment' && (
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const selectedWorkType = workTypes?.find(wt => wt.id === appointmentForm.workTypeId);
                  scheduleAppointmentMutation.mutate({
                    existingWorkOrderId: activeQuickAction.existingWorkOrderId,
                    workTypeId: appointmentForm.workTypeId,
                    workType: selectedWorkType?.name || 'Service Appointment',
                    earliestStart: appointmentForm.earliestStart,
                    dueDate: appointmentForm.dueDate,
                    scheduledStart: appointmentForm.scheduledStart,
                    scheduledEnd: appointmentForm.scheduledEnd,
                  });
                }} className="space-y-4 max-h-[70vh] overflow-y-auto">
                  {/* Info Banner */}
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-start space-x-3">
                      <Calendar className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-blue-800">
                        <p className="font-medium">Schedule Appointment</p>
                        <p className="mt-1">Create a new service appointment for this job. Select the appointment type and schedule the date/time.</p>
                      </div>
                    </div>
                  </div>

                  {/* Appointment Type Section */}
                  <div className="p-4 bg-gray-50 rounded-lg space-y-4">
                    <h4 className="font-medium text-gray-900 flex items-center">
                      <ClipboardList className="w-4 h-4 mr-2" />
                      Appointment Type
                    </h4>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                      <select
                        value={appointmentForm.workTypeId || ''}
                        onChange={(e) => setAppointmentForm(prev => ({ ...prev, workTypeId: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                        required
                      >
                        <option value="">Select appointment type...</option>
                        {/* Inspection Types */}
                        <optgroup label="Inspections">
                          {workTypes?.filter(wt => wt.name?.toLowerCase().includes('inspection')).map((wt) => (
                            <option key={wt.id} value={wt.id}>{wt.name}</option>
                          ))}
                        </optgroup>
                        {/* Install Types */}
                        <optgroup label="Installations">
                          {workTypes?.filter(wt => wt.name?.toLowerCase().includes('install')).map((wt) => (
                            <option key={wt.id} value={wt.id}>{wt.name}</option>
                          ))}
                        </optgroup>
                        {/* Insurance Types - Contract Signing, Adjuster Meeting, ATR, Spec, Supplement */}
                        <optgroup label="Insurance Workflow">
                          {workTypes?.filter(wt => {
                            const name = wt.name?.toLowerCase() || '';
                            return name.includes('contract') || name.includes('adjuster') || name.includes('atr') ||
                                   name.includes('spec') || name.includes('supplement');
                          }).map((wt) => (
                            <option key={wt.id} value={wt.id}>{wt.name}</option>
                          ))}
                        </optgroup>
                        {/* Adjustment/ATR Types - for non-insurance adjustments */}
                        <optgroup label="Adjustments">
                          {workTypes?.filter(wt => wt.name?.toLowerCase().includes('adjustment')).map((wt) => (
                            <option key={wt.id} value={wt.id}>{wt.name}</option>
                          ))}
                        </optgroup>
                        {/* Service/Repair Types */}
                        <optgroup label="Service & Repairs">
                          {workTypes?.filter(wt => wt.name?.toLowerCase().includes('service') || wt.name?.toLowerCase().includes('repair') || wt.name?.toLowerCase().includes('warranty')).map((wt) => (
                            <option key={wt.id} value={wt.id}>{wt.name}</option>
                          ))}
                        </optgroup>
                        {/* Other Types */}
                        <optgroup label="Other">
                          {workTypes?.filter(wt => {
                            const name = wt.name?.toLowerCase() || '';
                            return !name.includes('inspection') && !name.includes('install') &&
                                   !name.includes('adjustment') && !name.includes('atr') &&
                                   !name.includes('service') && !name.includes('repair') && !name.includes('warranty') &&
                                   !name.includes('contract') && !name.includes('adjuster') &&
                                   !name.includes('spec') && !name.includes('supplement');
                          }).map((wt) => (
                            <option key={wt.id} value={wt.id}>{wt.name}</option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                  </div>

                  {/* Scheduling Window Section */}
                  <div className="p-4 bg-gray-50 rounded-lg space-y-4">
                    <h4 className="font-medium text-gray-900 flex items-center">
                      <Clock className="w-4 h-4 mr-2" />
                      Scheduling Window
                    </h4>
                    <p className="text-xs text-gray-500 -mt-2">Define the acceptable date range for this appointment</p>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Earliest Start</label>
                        <input
                          type="datetime-local"
                          value={appointmentForm.earliestStart}
                          onChange={(e) => setAppointmentForm(prev => ({ ...prev, earliestStart: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                        />
                        <p className="text-xs text-gray-500 mt-1">Cannot start before this</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Latest Start (Due)</label>
                        <input
                          type="datetime-local"
                          value={appointmentForm.dueDate}
                          onChange={(e) => setAppointmentForm(prev => ({ ...prev, dueDate: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                        />
                        <p className="text-xs text-gray-500 mt-1">Must start by this date</p>
                      </div>
                    </div>
                  </div>

                  {/* Scheduled Time Section */}
                  <div className="p-4 bg-gray-50 rounded-lg space-y-4">
                    <h4 className="font-medium text-gray-900 flex items-center">
                      <CalendarDays className="w-4 h-4 mr-2" />
                      Scheduled Time
                    </h4>
                    <p className="text-xs text-gray-500 -mt-2">Set the exact date and time for this appointment</p>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Start Date & Time *</label>
                        <input
                          type="datetime-local"
                          value={appointmentForm.scheduledStart}
                          onChange={(e) => setAppointmentForm(prev => ({ ...prev, scheduledStart: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">End Date & Time *</label>
                        <input
                          type="datetime-local"
                          value={appointmentForm.scheduledEnd}
                          onChange={(e) => setAppointmentForm(prev => ({ ...prev, scheduledEnd: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowQuickActionModal(false)}
                      className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={scheduleAppointmentMutation.isPending || !appointmentForm.scheduledStart || !appointmentForm.scheduledEnd || !appointmentForm.workTypeId}
                      className="px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-dark disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      {scheduleAppointmentMutation.isPending && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                      <span>Schedule Appointment</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Edit Appointment Form */}
              {activeQuickAction?.type === 'editAppointment' && (
                <form onSubmit={(e) => {
                  e.preventDefault();
                  updateAppointmentMutation.mutate({
                    appointmentId: activeQuickAction.appointment.id,
                    data: {
                      earliestStart: appointmentForm.earliestStart,
                      dueDate: appointmentForm.dueDate,
                      scheduledStart: appointmentForm.scheduledStart,
                      scheduledEnd: appointmentForm.scheduledEnd,
                      status: appointmentForm.status,
                    },
                  });
                }} className="space-y-4">
                  <div className="bg-gray-50 p-3 rounded-lg mb-4">
                    <p className="text-sm text-gray-600">
                      Editing: <span className="font-medium text-gray-900">{activeQuickAction.appointment.appointmentNumber}</span>
                    </p>
                  </div>

                  {/* Status */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      value={appointmentForm.status}
                      onChange={(e) => setAppointmentForm(prev => ({ ...prev, status: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                    >
                      <option value="NONE">None</option>
                      <option value="SCHEDULED">Scheduled</option>
                      <option value="DISPATCHED">Dispatched</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="CANNOT_COMPLETE">Cannot Complete</option>
                      <option value="CANCELED">Canceled</option>
                    </select>
                  </div>

                  {/* Date Range Section */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Earliest Start Date</label>
                      <input
                        type="datetime-local"
                        value={appointmentForm.earliestStart}
                        onChange={(e) => setAppointmentForm(prev => ({ ...prev, earliestStart: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                      />
                      <p className="text-xs text-gray-500 mt-1">Cannot start before this date</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Latest Start Date (Due)</label>
                      <input
                        type="datetime-local"
                        value={appointmentForm.dueDate}
                        onChange={(e) => setAppointmentForm(prev => ({ ...prev, dueDate: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                      />
                      <p className="text-xs text-gray-500 mt-1">Must start by this date</p>
                    </div>
                  </div>

                  {/* Scheduled Date/Time Section */}
                  <div className="border-t pt-4 mt-4">
                    <p className="text-sm font-medium text-gray-700 mb-3">Scheduled Appointment Time</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Start Date & Time</label>
                        <input
                          type="datetime-local"
                          value={appointmentForm.scheduledStart}
                          onChange={(e) => setAppointmentForm(prev => ({ ...prev, scheduledStart: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">End Date & Time</label>
                        <input
                          type="datetime-local"
                          value={appointmentForm.scheduledEnd}
                          onChange={(e) => setAppointmentForm(prev => ({ ...prev, scheduledEnd: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowQuickActionModal(false)}
                      className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={updateAppointmentMutation.isPending}
                      className="px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-dark disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      {updateAppointmentMutation.isPending && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                      <span>Update Appointment</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Create Case Form */}
              {activeQuickAction === 'createCase' && (
                <form onSubmit={(e) => {
                  e.preventDefault();
                  createCaseMutation.mutate(caseForm);
                }} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label>
                    <input
                      type="text"
                      value={caseForm.subject}
                      onChange={(e) => setCaseForm(prev => ({ ...prev, subject: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                      placeholder="e.g., Customer complaint about installation"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                    <select
                      value={caseForm.type}
                      onChange={(e) => setCaseForm(prev => ({ ...prev, type: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                    >
                      <option value="">Select type...</option>
                      <option value="Complaint">Complaint</option>
                      <option value="Service Request">Service Request</option>
                      <option value="Question">Question</option>
                      <option value="Warranty">Warranty</option>
                      <option value="Follow-up">Follow-up</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                    <select
                      value={caseForm.priority}
                      onChange={(e) => setCaseForm(prev => ({ ...prev, priority: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                    >
                      <option value="LOW">Low</option>
                      <option value="NORMAL">Normal</option>
                      <option value="HIGH">High</option>
                      <option value="CRITICAL">Critical</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={caseForm.description}
                      onChange={(e) => setCaseForm(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                      rows={3}
                      placeholder="Describe the issue or request..."
                    />
                  </div>

                  <div className="flex items-center justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowQuickActionModal(false)}
                      className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={createCaseMutation.isLoading || !caseForm.subject}
                      className="px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-dark disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      {createCaseMutation.isLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                      <span>Create Case</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Escalate Case Confirmation */}
              {activeQuickAction?.type === 'escalateCase' && (
                <div className="space-y-4">
                  <p className="text-gray-600">
                    Are you sure you want to escalate case <strong>{activeQuickAction.caseItem.caseNumber}</strong>?
                    This will set the priority to HIGH and mark it as escalated.
                  </p>
                  <div className="flex items-center justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowQuickActionModal(false)}
                      className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => escalateCaseMutation.mutate(activeQuickAction.caseItem.id)}
                      disabled={escalateCaseMutation.isLoading}
                      className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      {escalateCaseMutation.isLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                      <span>Escalate Case</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Close Case Confirmation */}
              {activeQuickAction?.type === 'closeCase' && (
                <div className="space-y-4">
                  <p className="text-gray-600">
                    Are you sure you want to close case <strong>{activeQuickAction.caseItem.caseNumber}</strong>?
                  </p>
                  <div className="flex items-center justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowQuickActionModal(false)}
                      className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => closeCaseMutation.mutate(activeQuickAction.caseItem.id)}
                      disabled={closeCaseMutation.isLoading}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      {closeCaseMutation.isLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                      <span>Close Case</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Edit Case Form */}
              {activeQuickAction?.type === 'editCase' && (
                <form onSubmit={(e) => {
                  e.preventDefault();
                  updateCaseMutation.mutate({
                    caseId: activeQuickAction.caseItem.id,
                    data: {
                      subject: activeQuickAction.caseItem.subject,
                      status: activeQuickAction.caseItem.status,
                      priority: activeQuickAction.caseItem.priority,
                      type: activeQuickAction.caseItem.type,
                      description: activeQuickAction.caseItem.description,
                    }
                  });
                }} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                    <input
                      type="text"
                      defaultValue={activeQuickAction.caseItem.subject}
                      onChange={(e) => { activeQuickAction.caseItem.subject = e.target.value; }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      defaultValue={activeQuickAction.caseItem.status}
                      onChange={(e) => { activeQuickAction.caseItem.status = e.target.value; }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                    >
                      <option value="NEW">New</option>
                      <option value="WORKING">Working</option>
                      <option value="ESCALATED">Escalated</option>
                      <option value="CLOSED">Closed</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                    <select
                      defaultValue={activeQuickAction.caseItem.priority || 'NORMAL'}
                      onChange={(e) => { activeQuickAction.caseItem.priority = e.target.value; }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                    >
                      <option value="LOW">Low</option>
                      <option value="NORMAL">Normal</option>
                      <option value="HIGH">High</option>
                      <option value="CRITICAL">Critical</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      defaultValue={activeQuickAction.caseItem.description || ''}
                      onChange={(e) => { activeQuickAction.caseItem.description = e.target.value; }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                      rows={3}
                    />
                  </div>

                  <div className="flex items-center justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowQuickActionModal(false)}
                      className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={updateCaseMutation.isLoading}
                      className="px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-dark disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      {updateCaseMutation.isLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                      <span>Update Case</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Compose Email Form */}
              {activeQuickAction === 'composeEmail' && (
                <form onSubmit={(e) => {
                  e.preventDefault();
                  createEmailMutation.mutate({
                    ...emailForm,
                    sendNow: true,
                  });
                }} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">To *</label>
                    <input
                      type="email"
                      value={emailForm.toAddresses[0] || ''}
                      onChange={(e) => setEmailForm(prev => ({ ...prev, toAddresses: [e.target.value] }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                      placeholder="recipient@email.com"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">CC</label>
                    <input
                      type="text"
                      value={emailForm.ccAddresses.join(', ')}
                      onChange={(e) => setEmailForm(prev => ({
                        ...prev,
                        ccAddresses: e.target.value.split(',').map(email => email.trim()).filter(Boolean)
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                      placeholder="cc@email.com, cc2@email.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label>
                    <input
                      type="text"
                      value={emailForm.subject}
                      onChange={(e) => setEmailForm(prev => ({ ...prev, subject: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                      placeholder="Email subject..."
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Message *</label>
                    <textarea
                      value={emailForm.bodyText}
                      onChange={(e) => setEmailForm(prev => ({ ...prev, bodyText: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                      rows={6}
                      placeholder="Write your email message..."
                      required
                    />
                  </div>

                  <div className="flex items-center justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowQuickActionModal(false);
                        setEmailForm({ toAddresses: [], ccAddresses: [], subject: '', bodyText: '', bodyHtml: '' });
                      }}
                      className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        createEmailMutation.mutate({ ...emailForm, sendNow: false });
                      }}
                      disabled={createEmailMutation.isLoading}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                      Save Draft
                    </button>
                    <button
                      type="submit"
                      disabled={createEmailMutation.isLoading || !emailForm.subject || !emailForm.toAddresses[0]}
                      className="px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-dark disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      {createEmailMutation.isLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                      <span>Send Email</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Reply Email Form */}
              {activeQuickAction?.type === 'replyEmail' && (
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.target);
                  replyEmailMutation.mutate({
                    emailId: activeQuickAction.email.id,
                    data: {
                      bodyText: formData.get('bodyText'),
                      sendNow: true,
                    }
                  });
                }} className="space-y-4">
                  <div className="bg-gray-50 p-3 rounded-lg text-sm">
                    <p className="text-gray-500">Replying to: <strong>{activeQuickAction.email.subject}</strong></p>
                    <p className="text-gray-400 text-xs mt-1">
                      From: {activeQuickAction.email.fromName || activeQuickAction.email.fromAddress}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Your Reply *</label>
                    <textarea
                      name="bodyText"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                      rows={6}
                      placeholder="Write your reply..."
                      required
                    />
                  </div>

                  <div className="flex items-center justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowQuickActionModal(false)}
                      className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={replyEmailMutation.isLoading}
                      className="px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-dark disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      {replyEmailMutation.isLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                      <span>Send Reply</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Add Contact Form */}
              {activeQuickAction === 'addContact' && (
                <form onSubmit={(e) => {
                  e.preventDefault();
                  addContactMutation.mutate(contactForm);
                }} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                      <input
                        type="text"
                        value={contactForm.firstName}
                        onChange={(e) => setContactForm(prev => ({ ...prev, firstName: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                        placeholder="John"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                      <input
                        type="text"
                        value={contactForm.lastName}
                        onChange={(e) => setContactForm(prev => ({ ...prev, lastName: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                        placeholder="Doe"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={contactForm.email}
                      onChange={(e) => setContactForm(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                      placeholder="john@example.com"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                      <input
                        type="tel"
                        value={contactForm.phone}
                        onChange={(e) => setContactForm(prev => ({ ...prev, phone: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                        placeholder="(555) 123-4567"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Phone</label>
                      <input
                        type="tel"
                        value={contactForm.mobilePhone}
                        onChange={(e) => setContactForm(prev => ({ ...prev, mobilePhone: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                        placeholder="(555) 987-6543"
                      />
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="isPrimary"
                      checked={contactForm.isPrimary}
                      onChange={(e) => setContactForm(prev => ({ ...prev, isPrimary: e.target.checked }))}
                      className="w-4 h-4 text-panda-primary border-gray-300 rounded focus:ring-panda-primary"
                    />
                    <label htmlFor="isPrimary" className="text-sm text-gray-700">Set as Primary Contact</label>
                  </div>

                  <div className="flex items-center justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowQuickActionModal(false);
                        setContactForm({ firstName: '', lastName: '', email: '', phone: '', mobilePhone: '', isPrimary: false });
                      }}
                      className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={addContactMutation.isLoading || !contactForm.firstName || !contactForm.lastName}
                      className="px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-dark disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      {addContactMutation.isLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                      <span>Add Contact</span>
                    </button>
                  </div>
                </form>
              )}

              {/* View Email */}
              {activeQuickAction?.type === 'viewEmail' && (
                <div className="space-y-4">
                  <div className="border-b border-gray-200 pb-4">
                    <h3 className="font-semibold text-lg text-gray-900">{activeQuickAction.email.subject}</h3>
                    <div className="mt-2 text-sm text-gray-500 space-y-1">
                      <p><strong>From:</strong> {activeQuickAction.email.fromName || activeQuickAction.email.fromAddress}</p>
                      <p><strong>To:</strong> {activeQuickAction.email.toAddresses?.join(', ')}</p>
                      {activeQuickAction.email.ccAddresses?.length > 0 && (
                        <p><strong>CC:</strong> {activeQuickAction.email.ccAddresses.join(', ')}</p>
                      )}
                      <p><strong>Date:</strong> {new Date(activeQuickAction.email.sentAt || activeQuickAction.email.createdAt).toLocaleString()}</p>
                      <p><strong>Status:</strong> <span className={`px-2 py-0.5 rounded text-xs ${
                        activeQuickAction.email.status === 'OPENED' ? 'bg-blue-100 text-blue-800' :
                        activeQuickAction.email.status === 'BOUNCED' ? 'bg-red-100 text-red-800' :
                        'bg-green-100 text-green-800'
                      }`}>{activeQuickAction.email.status}</span></p>
                    </div>
                  </div>

                  <div className="prose prose-sm max-w-none">
                    {activeQuickAction.email.bodyHtml ? (
                      <div dangerouslySetInnerHTML={{ __html: activeQuickAction.email.bodyHtml }} />
                    ) : (
                      <pre className="whitespace-pre-wrap text-gray-700 font-sans">{activeQuickAction.email.bodyText}</pre>
                    )}
                  </div>

                  <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={() => setShowQuickActionModal(false)}
                      className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                    >
                      Close
                    </button>
                    <button
                      onClick={() => {
                        setActiveQuickAction({ type: 'replyEmail', email: activeQuickAction.email });
                      }}
                      className="px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-dark flex items-center space-x-2"
                    >
                      <Mail className="w-4 h-4" />
                      <span>Reply</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Crew Selection Modal */}
      {showCrewModal && selectedAppointmentForCrew && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">Assign Crew</h3>
              <button
                onClick={() => {
                  setShowCrewModal(false);
                  setSelectedAppointmentForCrew(null);
                  setSelectedCrewId('');
                }}
                className="p-1 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm font-medium text-gray-900">
                  {selectedAppointmentForCrew.appointmentNumber || `SA-${selectedAppointmentForCrew.id.slice(-5)}`}
                </p>
                <p className="text-xs text-gray-500">
                  {selectedAppointmentForCrew.workType?.name || 'Service Appointment'}
                </p>
                {selectedAppointmentForCrew.scheduledStart && (
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(selectedAppointmentForCrew.scheduledStart).toLocaleDateString('en-US', {
                      weekday: 'short', month: 'short', day: 'numeric'
                    })} at {new Date(selectedAppointmentForCrew.scheduledStart).toLocaleTimeString('en-US', {
                      hour: 'numeric', minute: '2-digit'
                    })}
                  </p>
                )}
                {selectedAppointmentForCrew.assignedResource && (
                  <p className="text-xs text-green-600 mt-1 font-medium">
                    Currently assigned: {selectedAppointmentForCrew.assignedResource.name}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Crew
                </label>
                <select
                  value={selectedCrewId}
                  onChange={(e) => setSelectedCrewId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none"
                >
                  <option value="">Choose a crew...</option>
                  {(crews?.data || crews || []).map((crew) => (
                    <option key={crew.id} value={crew.id}>
                      {crew.name} {crew.territory?.name ? `(${crew.territory.name})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end space-x-3 p-4 border-t bg-gray-50 rounded-b-xl">
              <button
                onClick={() => {
                  setShowCrewModal(false);
                  setSelectedAppointmentForCrew(null);
                  setSelectedCrewId('');
                }}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (selectedCrewId && selectedAppointmentForCrew) {
                    assignCrewMutation.mutate({
                      appointmentId: selectedAppointmentForCrew.id,
                      resourceId: selectedCrewId,
                    });
                  }
                }}
                disabled={!selectedCrewId || assignCrewMutation.isPending}
                className="flex items-center space-x-2 px-4 py-2 text-sm bg-panda-primary text-white rounded-lg hover:bg-panda-dark disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {assignCrewMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Assigning...</span>
                  </>
                ) : (
                  <>
                    <Users className="w-4 h-4" />
                    <span>Assign Crew</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Appointment Detail Modal */}
      {showAppointmentDetailModal && selectedAppointmentDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-panda-primary/5 to-panda-secondary/5">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg bg-panda-primary/10 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-panda-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {selectedAppointmentDetail.appointmentNumber || `SA-${selectedAppointmentDetail.id.slice(-5)}`}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {selectedAppointmentDetail.workType?.name || selectedAppointmentDetail.subject || 'Service Appointment'}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                  selectedAppointmentDetail.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                  selectedAppointmentDetail.status === 'SCHEDULED' ? 'bg-blue-100 text-blue-800' :
                  selectedAppointmentDetail.status === 'IN_PROGRESS' ? 'bg-yellow-100 text-yellow-800' :
                  selectedAppointmentDetail.status === 'DISPATCHED' ? 'bg-purple-100 text-purple-800' :
                  selectedAppointmentDetail.status === 'CANCELED' ? 'bg-red-100 text-red-800' :
                  selectedAppointmentDetail.status === 'CANNOT_COMPLETE' ? 'bg-orange-100 text-orange-800' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {selectedAppointmentDetail.status || 'None'}
                </span>
                <button
                  onClick={() => {
                    setShowAppointmentDetailModal(false);
                    setSelectedAppointmentDetail(null);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column - Main Details */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Scheduled Times Section */}
                  <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center">
                      <Clock className="w-4 h-4 mr-2 text-panda-primary" />
                      Scheduled Times
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Scheduled Start</p>
                        <p className="text-sm font-medium text-gray-900">
                          {selectedAppointmentDetail.scheduledStart
                            ? new Date(selectedAppointmentDetail.scheduledStart).toLocaleString('en-US', {
                                weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                                hour: 'numeric', minute: '2-digit'
                              })
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Scheduled End</p>
                        <p className="text-sm font-medium text-gray-900">
                          {selectedAppointmentDetail.scheduledEnd
                            ? new Date(selectedAppointmentDetail.scheduledEnd).toLocaleString('en-US', {
                                weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                                hour: 'numeric', minute: '2-digit'
                              })
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Duration</p>
                        <p className="text-sm font-medium text-gray-900">
                          {selectedAppointmentDetail.scheduledStart && selectedAppointmentDetail.scheduledEnd
                            ? (() => {
                                const start = new Date(selectedAppointmentDetail.scheduledStart);
                                const end = new Date(selectedAppointmentDetail.scheduledEnd);
                                const diff = Math.abs(end - start) / (1000 * 60);
                                const hours = Math.floor(diff / 60);
                                const mins = Math.round(diff % 60);
                                return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                              })()
                            : selectedAppointmentDetail.duration
                              ? `${selectedAppointmentDetail.duration} mins`
                              : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Work Type</p>
                        <p className="text-sm font-medium text-gray-900">
                          {selectedAppointmentDetail.workType?.name || '—'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Time Constraints Section */}
                  <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center">
                      <AlertCircle className="w-4 h-4 mr-2 text-orange-500" />
                      Time Constraints
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Earliest Start Permitted</p>
                        <p className="text-sm font-medium text-gray-900">
                          {selectedAppointmentDetail.earliestStart
                            ? new Date(selectedAppointmentDetail.earliestStart).toLocaleString('en-US', {
                                month: 'short', day: 'numeric', year: 'numeric',
                                hour: 'numeric', minute: '2-digit'
                              })
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Due Date</p>
                        <p className="text-sm font-medium text-gray-900">
                          {selectedAppointmentDetail.dueDate
                            ? new Date(selectedAppointmentDetail.dueDate).toLocaleString('en-US', {
                                month: 'short', day: 'numeric', year: 'numeric',
                                hour: 'numeric', minute: '2-digit'
                              })
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Arrival Window Start</p>
                        <p className="text-sm font-medium text-gray-900">
                          {selectedAppointmentDetail.arrivalWindowStart
                            ? new Date(selectedAppointmentDetail.arrivalWindowStart).toLocaleString('en-US', {
                                hour: 'numeric', minute: '2-digit'
                              })
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Arrival Window End</p>
                        <p className="text-sm font-medium text-gray-900">
                          {selectedAppointmentDetail.arrivalWindowEnd
                            ? new Date(selectedAppointmentDetail.arrivalWindowEnd).toLocaleString('en-US', {
                                hour: 'numeric', minute: '2-digit'
                              })
                            : '—'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Actual Times Section (if completed) */}
                  {(selectedAppointmentDetail.actualStart || selectedAppointmentDetail.actualEnd) && (
                    <div className="bg-white border border-gray-200 rounded-xl p-5">
                      <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center">
                        <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
                        Actual Times
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Actual Start</p>
                          <p className="text-sm font-medium text-gray-900">
                            {selectedAppointmentDetail.actualStart
                              ? new Date(selectedAppointmentDetail.actualStart).toLocaleString('en-US', {
                                  month: 'short', day: 'numeric', year: 'numeric',
                                  hour: 'numeric', minute: '2-digit'
                                })
                              : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Actual End</p>
                          <p className="text-sm font-medium text-gray-900">
                            {selectedAppointmentDetail.actualEnd
                              ? new Date(selectedAppointmentDetail.actualEnd).toLocaleString('en-US', {
                                  month: 'short', day: 'numeric', year: 'numeric',
                                  hour: 'numeric', minute: '2-digit'
                                })
                              : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Actual Duration</p>
                          <p className="text-sm font-medium text-gray-900">
                            {selectedAppointmentDetail.actualStart && selectedAppointmentDetail.actualEnd
                              ? (() => {
                                  const start = new Date(selectedAppointmentDetail.actualStart);
                                  const end = new Date(selectedAppointmentDetail.actualEnd);
                                  const diff = Math.abs(end - start) / (1000 * 60);
                                  const hours = Math.floor(diff / 60);
                                  const mins = Math.round(diff % 60);
                                  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                                })()
                              : '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Opportunity Details Section */}
                  <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center">
                      <Briefcase className="w-4 h-4 mr-2 text-panda-primary" />
                      Opportunity Details
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Opportunity</p>
                        <Link
                          to={`/jobs/${id}`}
                          className="text-sm font-medium text-panda-primary hover:text-panda-dark hover:underline"
                        >
                          {opportunity?.name || opportunity?.opportunityName || '—'}
                        </Link>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Stage</p>
                        <p className="text-sm font-medium text-gray-900">
                          {opportunity?.stageName || opportunity?.stage || '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Amount</p>
                        <p className="text-sm font-medium text-gray-900">
                          {opportunity?.amount
                            ? `$${opportunity.amount.toLocaleString()}`
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Account</p>
                        <Link
                          to={`/accounts/${opportunity?.accountId || opportunity?.account?.id}`}
                          className="text-sm font-medium text-panda-primary hover:text-panda-dark hover:underline"
                        >
                          {opportunity?.account?.name || '—'}
                        </Link>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Owner</p>
                        <p className="text-sm font-medium text-gray-900">
                          {opportunity?.owner?.name || opportunity?.ownerName || '—'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Description/Notes Section */}
                  {(selectedAppointmentDetail.description || selectedAppointmentDetail.notes) && (
                    <div className="bg-white border border-gray-200 rounded-xl p-5">
                      <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center">
                        <FileText className="w-4 h-4 mr-2 text-gray-500" />
                        Notes
                      </h4>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">
                        {selectedAppointmentDetail.description || selectedAppointmentDetail.notes}
                      </p>
                    </div>
                  )}
                </div>

                {/* Right Column - Sidebar */}
                <div className="space-y-6">
                  {/* Assigned Resources Section */}
                  <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center">
                      <Users className="w-4 h-4 mr-2 text-panda-primary" />
                      Assigned Resources
                    </h4>
                    {selectedAppointmentDetail.assignedResource ? (
                      <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                        <div className="w-10 h-10 rounded-full bg-panda-primary/10 flex items-center justify-center">
                          <User className="w-5 h-5 text-panda-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {selectedAppointmentDetail.assignedResource.name}
                          </p>
                          {selectedAppointmentDetail.assignedResource.phone && (
                            <p className="text-xs text-gray-500">
                              {selectedAppointmentDetail.assignedResource.phone}
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">No crew assigned</p>
                        <button
                          onClick={() => {
                            setShowAppointmentDetailModal(false);
                            setSelectedAppointmentForCrew(selectedAppointmentDetail);
                            setShowCrewModal(true);
                          }}
                          className="mt-2 text-sm text-panda-primary hover:underline"
                        >
                          + Assign Crew
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Property Details Section */}
                  <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center">
                      <MapPin className="w-4 h-4 mr-2 text-red-500" />
                      Property Details
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Address</p>
                        <p className="text-sm text-gray-900">
                          {selectedAppointmentDetail.street ||
                            opportunity?.account?.billingStreet ||
                            opportunity?.billingStreet ||
                            '—'}
                        </p>
                        <p className="text-sm text-gray-900">
                          {[
                            selectedAppointmentDetail.city || opportunity?.account?.billingCity || opportunity?.billingCity,
                            selectedAppointmentDetail.state || opportunity?.account?.billingState || opportunity?.billingState,
                            selectedAppointmentDetail.postalCode || opportunity?.account?.billingPostalCode || opportunity?.billingPostalCode
                          ].filter(Boolean).join(', ')}
                        </p>
                      </div>
                      {(selectedAppointmentDetail.latitude && selectedAppointmentDetail.longitude) ||
                       (opportunity?.account?.latitude && opportunity?.account?.longitude) ? (
                        <div className="bg-gray-100 rounded-lg h-32 flex items-center justify-center">
                          <p className="text-xs text-gray-500">Map View</p>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Record Info Section */}
                  <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center">
                      <Info className="w-4 h-4 mr-2 text-gray-500" />
                      Record Information
                    </h4>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Appointment #</span>
                        <span className="font-medium text-gray-900">
                          {selectedAppointmentDetail.appointmentNumber || `SA-${selectedAppointmentDetail.id.slice(-5)}`}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Status</span>
                        <span className="font-medium text-gray-900">
                          {selectedAppointmentDetail.status || 'None'}
                        </span>
                      </div>
                      {selectedAppointmentDetail.workOrder && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Work Order</span>
                          <span className="font-medium text-gray-900">
                            {selectedAppointmentDetail.workOrder.workOrderNumber ||
                              `WO-${selectedAppointmentDetail.workOrder.id?.slice(-5)}`}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-gray-500">Created</span>
                        <span className="font-medium text-gray-900">
                          {selectedAppointmentDetail.createdAt
                            ? new Date(selectedAppointmentDetail.createdAt).toLocaleDateString()
                            : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Last Modified</span>
                        <span className="font-medium text-gray-900">
                          {selectedAppointmentDetail.updatedAt
                            ? new Date(selectedAppointmentDetail.updatedAt).toLocaleDateString()
                            : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer with Actions */}
            <div className="flex items-center justify-between p-4 border-t bg-gray-50">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    setShowAppointmentDetailModal(false);
                    const apt = selectedAppointmentDetail;
                    // Convert ISO dates to datetime-local format
                    const toLocalDateTime = (isoStr) => {
                      if (!isoStr) return '';
                      const date = new Date(isoStr);
                      return date.toISOString().slice(0, 16);
                    };
                    setAppointmentForm({
                      earliestStart: toLocalDateTime(apt.earliestStart),
                      dueDate: toLocalDateTime(apt.dueDate),
                      scheduledStart: toLocalDateTime(apt.scheduledStart),
                      scheduledEnd: toLocalDateTime(apt.scheduledEnd),
                      status: apt.status || 'SCHEDULED',
                      workTypeId: apt.workType?.id || '',
                    });
                    setActiveQuickAction({ type: 'editAppointment', appointment: apt });
                    setShowQuickActionModal(true);
                  }}
                  className="flex items-center space-x-2 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100"
                >
                  <Edit className="w-4 h-4" />
                  <span>Edit</span>
                </button>
                {!selectedAppointmentDetail.assignedResource && (
                  <button
                    onClick={() => {
                      setShowAppointmentDetailModal(false);
                      setSelectedAppointmentForCrew(selectedAppointmentDetail);
                      setShowCrewModal(true);
                    }}
                    className="flex items-center space-x-2 px-4 py-2 text-sm bg-panda-primary text-white rounded-lg hover:bg-panda-dark"
                  >
                    <Users className="w-4 h-4" />
                    <span>Assign Crew</span>
                  </button>
                )}
                {selectedAppointmentDetail.assignedResource && (
                  <button
                    onClick={() => {
                      setShowAppointmentDetailModal(false);
                      setSelectedAppointmentForCrew(selectedAppointmentDetail);
                      setShowCrewModal(true);
                    }}
                    className="flex items-center space-x-2 px-4 py-2 text-sm border border-panda-primary text-panda-primary rounded-lg hover:bg-panda-light"
                  >
                    <Users className="w-4 h-4" />
                    <span>Change Crew</span>
                  </button>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    if (window.confirm(`Are you sure you want to delete appointment ${selectedAppointmentDetail.appointmentNumber || 'this appointment'}?`)) {
                      deleteAppointmentMutation.mutate(selectedAppointmentDetail.id);
                      setShowAppointmentDetailModal(false);
                      setSelectedAppointmentDetail(null);
                    }
                  }}
                  className="flex items-center space-x-2 px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                >
                  <X className="w-4 h-4" />
                  <span>Delete</span>
                </button>
                <button
                  onClick={() => {
                    setShowAppointmentDetailModal(false);
                    setSelectedAppointmentDetail(null);
                  }}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Specs Preparation Modal - Insurance workflow */}
      {showSpecsPreparation && (
        <SpecsPreparation
          opportunityId={id}
          opportunity={opportunity}
          onComplete={() => {
            setShowSpecsPreparation(false);
            setActionSuccess('Specs preparation completed successfully. Opportunity status updated to "Specs Prepped".');
            queryClient.invalidateQueries(['opportunity', id]);
            setTimeout(() => setActionSuccess(null), 5000);
          }}
          onCancel={() => setShowSpecsPreparation(false)}
        />
      )}

      {/* Activity Detail Modal */}
      {showActivityModal && selectedActivity && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div className="flex items-center space-x-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  selectedActivity.type === 'note' ? 'bg-blue-100' :
                  selectedActivity.type === 'task' ? 'bg-yellow-100' :
                  selectedActivity.type === 'event' ? 'bg-purple-100' :
                  selectedActivity.sourceType === 'ACCULYNX_IMPORT' ? 'bg-amber-100' :
                  'bg-gray-100'
                }`}>
                  {selectedActivity.type === 'note' && <MessageSquare className="w-5 h-5 text-blue-600" />}
                  {selectedActivity.type === 'task' && <CheckSquare className="w-5 h-5 text-yellow-600" />}
                  {selectedActivity.type === 'event' && <Calendar className="w-5 h-5 text-purple-600" />}
                  {selectedActivity.sourceType === 'ACCULYNX_IMPORT' && <Archive className="w-5 h-5 text-amber-600" />}
                  {!['note', 'task', 'event'].includes(selectedActivity.type) && selectedActivity.sourceType !== 'ACCULYNX_IMPORT' && <Activity className="w-5 h-5 text-gray-600" />}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {selectedActivity.subject || selectedActivity.title || 'Internal Note'}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {selectedActivity.createdAt ? new Date(selectedActivity.createdAt).toLocaleString() : ''}
                    {selectedActivity.user && ` • by ${selectedActivity.user.firstName} ${selectedActivity.user.lastName}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowActivityModal(false);
                  setSelectedActivity(null);
                  setActivitySummary(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {/* AI Summary Section */}
              {selectedActivity.sourceType === 'ACCULYNX_IMPORT' && (
                <div className="mb-4">
                  {activitySummary ? (
                    <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-100 rounded-lg p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <span className="text-xs font-medium text-purple-700">AI Summary</span>
                      </div>
                      <p className="text-sm text-gray-700">{activitySummary}</p>
                    </div>
                  ) : (
                    <button
                      onClick={async () => {
                        setSummaryLoading(true);
                        try {
                          const content = selectedActivity.body || selectedActivity.description || '';
                          const result = await opportunitiesApi.summarizeActivity(id, content, selectedActivity.id);
                          setActivitySummary(result.summary);
                        } catch (err) {
                          console.error('Failed to generate summary:', err);
                          setActivitySummary('Unable to generate summary');
                        }
                        setSummaryLoading(false);
                      }}
                      disabled={summaryLoading}
                      className="w-full bg-gradient-to-r from-purple-50 to-blue-50 hover:from-purple-100 hover:to-blue-100 border border-purple-200 rounded-lg p-3 flex items-center justify-center space-x-2 transition-colors disabled:opacity-50"
                    >
                      {summaryLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 text-purple-600 animate-spin" />
                          <span className="text-sm text-purple-700">Generating summary...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          <span className="text-sm text-purple-700 font-medium">Generate AI Summary</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}

              {/* Message Content */}
              <div className="prose prose-sm max-w-none">
                <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {selectedActivity.body || selectedActivity.description || 'No content available'}
                </p>
              </div>
              {selectedActivity.sourceType && (
                <div className="mt-6 pt-4 border-t border-gray-100">
                  <p className="text-xs text-gray-400">
                    Source: {selectedActivity.sourceType === 'ACCULYNX_IMPORT' ? 'AccuLynx Import' : selectedActivity.sourceType}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Contract Signing Modal */}
      <ContractSigningModal
        isOpen={showContractSigningModal}
        onClose={() => setShowContractSigningModal(false)}
        opportunity={opportunity}
        contact={contacts?.[0] || opportunity?.contact}
        account={opportunity?.account}
        onSuccess={(agreement) => {
          setShowContractSigningModal(false);
          setActionSuccess(`Contract sent successfully to ${agreement?.recipientEmail || 'recipient'}`);
          queryClient.invalidateQueries(['opportunityDocuments', id]);
          setTimeout(() => setActionSuccess(null), 5000);
        }}
      />

      {/* Change Order Modal - Mobile-first with touch-friendly signing */}
      <ChangeOrderModal
        isOpen={showChangeOrderModal}
        onClose={() => setShowChangeOrderModal(false)}
        opportunity={opportunity}
        contact={contacts?.[0] || opportunity?.contact}
        account={opportunity?.account}
        currentUser={currentUser}
        onSuccess={(changeOrder) => {
          setShowChangeOrderModal(false);
          setActionSuccess(`Change order signed and sent to ${changeOrder?.data?.agreement?.recipientEmail || 'customer'}`);
          queryClient.invalidateQueries(['opportunityDocuments', id]);
          queryClient.invalidateQueries(['opportunity', id]);
          queryClient.invalidateQueries(['cases']);
          setTimeout(() => setActionSuccess(null), 5000);
        }}
      />

      {/* Pay Invoice Modal */}
      <PayInvoiceModal
        isOpen={showPayInvoiceModal}
        onClose={() => {
          setShowPayInvoiceModal(false);
          setSelectedInvoice(null);
        }}
        invoice={selectedInvoice}
        opportunity={opportunity}
      />

      {/* Invoice Detail Modal */}
      {showInvoiceDetailModal && selectedInvoice && (
        <InvoiceDetailModal
          invoice={selectedInvoice}
          onClose={() => {
            setShowInvoiceDetailModal(false);
            setSelectedInvoice(null);
          }}
        />
      )}

      {/* Send Invoice Modal */}
      <SendInvoiceModal
        isOpen={showSendInvoiceModal}
        onClose={() => {
          setShowSendInvoiceModal(false);
          setInvoiceToSend(null);
        }}
        invoice={invoiceToSend}
        opportunity={opportunity}
        contact={opportunity?.contact}
      />

      {/* Create Insurance Invoice Modal */}
      {showCreateInsuranceInvoiceModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-indigo-600" />
                <h3 className="text-lg font-semibold">Create Insurance Invoice</h3>
              </div>
              <button
                onClick={() => setShowCreateInsuranceInvoiceModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                createInsuranceInvoiceMutation.mutate({
                  amount: parseFloat(formData.get('amount')) || opportunity.amount || 0,
                  notes: formData.get('notes'),
                  insuranceCarrier: formData.get('insuranceCarrier') || opportunity.insuranceCarrier,
                  claimNumber: formData.get('claimNumber') || opportunity.claimNumber,
                });
              }}
              className="p-4 space-y-4"
            >
              {/* Job Info Display */}
              <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Customer:</span>
                  <span className="font-medium">{opportunity?.account?.name || opportunity?.name || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Job Number:</span>
                  <span className="font-medium">{opportunity?.jobId || '-'}</span>
                </div>
              </div>

              {/* Insurance Carrier */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Insurance Carrier</label>
                <input
                  type="text"
                  name="insuranceCarrier"
                  defaultValue={opportunity?.insuranceCarrier || ''}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="e.g., State Farm, Allstate"
                />
              </div>

              {/* Claim Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Claim Number</label>
                <input
                  type="text"
                  name="claimNumber"
                  defaultValue={opportunity?.claimNumber || ''}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Claim #"
                />
              </div>

              {/* Invoice Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    name="amount"
                    step="0.01"
                    defaultValue={opportunity?.rcvAmount || opportunity?.amount || ''}
                    className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="0.00"
                    required
                  />
                </div>
                {opportunity?.rcvAmount && (
                  <p className="mt-1 text-xs text-gray-500">
                    RCV Amount: ${parseFloat(opportunity.rcvAmount).toLocaleString()}
                  </p>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
                <textarea
                  name="notes"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Add any notes about this invoice..."
                />
              </div>

              {/* Action Error */}
              {actionError && (
                <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-2 rounded">
                  <AlertCircle className="w-4 h-4" />
                  {actionError}
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateInsuranceInvoiceModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createInsuranceInvoiceMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {createInsuranceInvoiceMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Receipt className="w-4 h-4" />
                      Create Invoice
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
        isOpen={showSmsModal}
        onClose={() => setShowSmsModal(false)}
        phone={opportunity?.contact?.phone || opportunity?.phone || ''}
        recipientName={opportunity?.contact?.firstName ? `${opportunity.contact.firstName} ${opportunity.contact.lastName || ''}`.trim() : opportunity?.name || 'Customer'}
        onSent={() => {
          queryClient.invalidateQueries({ queryKey: ['opportunity', id, 'conversations'] });
          setActionSuccess('SMS sent successfully');
          setTimeout(() => setActionSuccess(null), 3000);
        }}
        mergeData={{
          firstName: opportunity?.contact?.firstName || '',
          lastName: opportunity?.contact?.lastName || '',
          fullName: opportunity?.contact?.firstName ? `${opportunity.contact.firstName} ${opportunity.contact.lastName || ''}`.trim() : '',
          company: opportunity?.account?.name || '',
          phone: opportunity?.contact?.phone || opportunity?.phone || '',
          email: opportunity?.contact?.email || '',
          jobNumber: opportunity?.jobId || '',
        }}
      />

      {/* Email Modal */}
      <EmailModal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        email={opportunity?.contact?.email || ''}
        recipientName={opportunity?.contact?.firstName ? `${opportunity.contact.firstName} ${opportunity.contact.lastName || ''}`.trim() : opportunity?.name || 'Customer'}
        onSent={() => {
          queryClient.invalidateQueries({ queryKey: ['opportunity', id, 'emails'] });
          setActionSuccess('Email sent successfully');
          setTimeout(() => setActionSuccess(null), 3000);
        }}
        mergeData={{
          firstName: opportunity?.contact?.firstName || '',
          lastName: opportunity?.contact?.lastName || '',
          fullName: opportunity?.contact?.firstName ? `${opportunity.contact.firstName} ${opportunity.contact.lastName || ''}`.trim() : '',
          company: opportunity?.account?.name || '',
          phone: opportunity?.contact?.phone || opportunity?.phone || '',
          email: opportunity?.contact?.email || '',
          jobNumber: opportunity?.jobId || '',
        }}
      />
    </div>
  );
}
