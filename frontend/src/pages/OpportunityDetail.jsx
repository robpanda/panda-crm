import { useState, useRef, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { opportunitiesApi, companyCamApi, scheduleApi, casesApi, emailsApi, notificationsApi, bamboogliApi, approvalsApi, measurementsApi, contactsApi, ringCentralApi } from '../services/api';
import PhotoGallery from '../components/PhotoGallery';
import ApprovalQueue, { CreateApprovalForm } from '../components/ApprovalQueue';
import DraggableMap from '../components/DraggableMap';
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
} from 'lucide-react';

// Communications Tab Component - Shows SMS, Email, and Phone call history
function CommunicationsTab({ phone, email, contactName }) {
  const [filter, setFilter] = useState('all'); // all, sms, email, phone

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-panda-primary" />
      </div>
    );
  }

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
            {filteredActivity.map((item, index) => (
              <div key={item.id || index} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start space-x-3">
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
                      <span className="text-xs text-gray-500">{item.displayDate}</span>
                    </div>

                    {/* Message Content */}
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
                          <p className="text-sm text-gray-600 line-clamp-2">
                            {item.body || item.content || item.text}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
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
    </div>
  );
}

export default function OpportunityDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('details');
  const [showQuickActionModal, setShowQuickActionModal] = useState(false);
  const [activeQuickAction, setActiveQuickAction] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  // Sidebar accordion states
  const [expandedSections, setExpandedSections] = useState({
    onboarding: true,
    expediting: false,
    audit: false,
    dates: false,
    photos: false,
  });

  // Product search
  const [productSearch, setProductSearch] = useState('');
  const [selectedProducts, setSelectedProducts] = useState([]);

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

  const { data: invoices } = useQuery({
    queryKey: ['opportunityInvoices', id],
    queryFn: () => opportunitiesApi.getInvoices(id),
    enabled: !!id,
  });

  const { data: commissions } = useQuery({
    queryKey: ['opportunityCommissions', id],
    queryFn: () => opportunitiesApi.getCommissions(id),
    enabled: !!id,
  });

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
      setAppointmentForm({ scheduledStart: '', scheduledEnd: '', status: 'SCHEDULED' });
      setTimeout(() => setActionSuccess(null), 3000);
    },
    onError: (error) => {
      setActionError(error.message || 'Failed to create appointment');
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
    scheduledStart: '',
    scheduledEnd: '',
    status: 'SCHEDULED',
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

  // Fetch work types for dropdown
  const { data: workTypes } = useQuery({
    queryKey: ['workTypes'],
    queryFn: () => scheduleApi.getWorkTypes(),
    staleTime: 1000 * 60 * 10, // Cache for 10 minutes
  });

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

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
        <Link to="/jobs" className="text-panda-primary hover:underline mt-2 inline-block">
          Back to Jobs
        </Link>
      </div>
    );
  }

  // Calculate days open
  const daysOpen = Math.floor((Date.now() - new Date(opportunity.createdAt).getTime()) / (1000 * 60 * 60 * 24));

  // Tabs configuration - using summary counts from Hub API
  // Count unread notifications
  const unreadNotifications = notifications?.filter(n => n.status === 'UNREAD')?.length || 0;

  // Count unread conversations
  const unreadConversations = conversations?.reduce((acc, c) => acc + (c.unreadCount || 0), 0) || 0;

  // Calculate total conversation count (SMS + Email)
  const totalConversationsCount = (conversations?.length || 0) + (emails?.length || 0);
  const totalUnread = unreadConversations + (emails?.filter(e => e.status === 'UNREAD')?.length || 0);

  const tabs = [
    { id: 'details', label: 'Details', icon: Info },
    { id: 'schedule', label: 'Schedule', icon: CalendarDays, count: summary?.counts?.appointments || appointments?.length || 0 },
    { id: 'contacts', label: 'Contacts', icon: Users, count: summary?.counts?.contacts || contacts?.length || 0 },
    { id: 'workOrders', label: 'Work Orders', icon: Wrench, count: summary?.counts?.workOrders || workOrders?.length || 0 },
    { id: 'cases', label: 'Cases', icon: Briefcase, count: cases?.length || 0 },
    { id: 'conversations', label: 'Conversations', icon: MessageSquare, count: totalUnread, highlight: totalUnread > 0 },
    { id: 'notifications', label: 'Notifications', icon: Bell, count: unreadNotifications, highlight: unreadNotifications > 0 },
    { id: 'approvals', label: 'Approvals', icon: Scale },
    { id: 'quotes', label: 'Quotes', icon: FileText, count: summary?.counts?.quotes || quotes?.length || 0 },
    { id: 'invoices', label: 'Invoices', icon: Receipt, count: summary?.counts?.invoices || invoices?.length || 0 },
    { id: 'commissions', label: 'Commissions', icon: Percent, count: summary?.counts?.commissions || commissions?.length || 0 },
    { id: 'documents', label: 'Documents', icon: FileSignature, count: summary?.counts?.documents || documents?.length || 0 },
    { id: 'activity', label: 'Activity', icon: Activity, count: activityData?.items?.length || 0 },
    { id: 'communications', label: 'Communications', icon: PhoneCall },
    { id: 'checklist', label: 'Checklist', icon: ClipboardList },
  ];

  // Mock onboarding checklist
  const onboardingChecklist = [
    { id: 'estimate', label: 'Estimate Received', checked: false },
    { id: 'contract', label: 'Contract Received', checked: false },
    { id: 'photos', label: 'Photos Collected', checked: false },
    { id: 'presupplement', label: 'Pre-Supplement Required', checked: false },
    { id: 'presuppComplete', label: 'Pre-Supplement Complete', checked: false },
  ];

  // Mock trades
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
      <div className="px-6 py-4">
        <Link to="/jobs" className="inline-flex items-center text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Link>
      </div>

      {/* Main Header */}
      <div className="px-4 sm:px-6 pb-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start space-x-3 sm:space-x-4">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-panda-primary to-panda-secondary flex items-center justify-center flex-shrink-0">
                <Target className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">{opportunity.name}</h1>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="inline-flex items-center px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium bg-blue-100 text-blue-800">
                    {opportunity.workType || 'Insurance Roofing'}
                  </span>
                  <span className="inline-flex items-center px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium bg-green-100 text-green-800">
                    {opportunity.stage?.replace(/_/g, ' ') || 'Approved'}
                  </span>
                </div>
              </div>
            </div>

            {/* Right side badges */}
            <div className="flex items-center gap-4 sm:gap-6 flex-shrink-0">
              <div className="text-left sm:text-right">
                <div className="flex items-center text-gray-500 text-xs sm:text-sm">
                  <User className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                  Job Priority
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                  <Flag className="w-3 h-3 mr-1" />
                  Urgent
                </span>
              </div>
              <div className="text-left sm:text-right">
                <div className="text-gray-500 text-xs sm:text-sm">Balance Due</div>
                <div className="text-lg sm:text-xl font-bold text-gray-900">$0</div>
              </div>
            </div>
          </div>

          {/* Stats Row - using Hub Summary data */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 mt-6 pt-6 border-t border-gray-100">
            <div className="text-center">
              <div className="text-gray-500 text-xs sm:text-sm">Contacts</div>
              <div className="text-lg sm:text-xl font-bold text-gray-900">{summary?.counts?.contacts || contacts?.length || 0}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-500 text-xs sm:text-sm">Quotes</div>
              <div className="text-lg sm:text-xl font-bold text-gray-900">{summary?.counts?.quotes || quotes?.length || 0}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-500 text-xs sm:text-sm">Work Orders</div>
              <div className="text-lg sm:text-xl font-bold text-gray-900">{summary?.counts?.workOrders || workOrders?.length || 0}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-500 text-xs sm:text-sm">Invoices</div>
              <div className="text-lg sm:text-xl font-bold text-gray-900">{summary?.counts?.invoices || invoices?.length || 0}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-500 text-xs sm:text-sm">Commissions</div>
              <div className="text-lg sm:text-xl font-bold text-gray-900">{summary?.counts?.commissions || commissions?.length || 0}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-500 text-xs sm:text-sm">Last Touched</div>
              <div className="text-xs sm:text-sm font-medium text-gray-900">
                {opportunity.updatedAt ? new Date(opportunity.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}
              </div>
            </div>
          </div>

          {/* Bottom Row - Key Metrics from Hub Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between p-2 sm:p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-500 text-xs sm:text-sm">Appointments</span>
              <span className="font-semibold text-gray-900 text-sm sm:text-base">{summary?.counts?.appointments || 0}</span>
            </div>
            <div className="flex items-center justify-between p-2 sm:p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-500 text-xs sm:text-sm">Contract Value</span>
              <span className="font-semibold text-green-600 text-sm sm:text-base">${(summary?.financials?.contractValue || opportunity.amount || 0).toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between p-2 sm:p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-500 text-xs sm:text-sm">Balance Due</span>
              <span className="font-semibold text-red-600 text-sm sm:text-base">${(summary?.financials?.balanceDue || 0).toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between p-2 sm:p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-500 text-xs sm:text-sm">Total Paid</span>
              <span className="font-semibold text-blue-600 text-sm sm:text-base">${(summary?.financials?.totalPaid || 0).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Two Column Layout */}
      <div className="px-4 sm:px-6 pb-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left Sidebar - Collapsible on mobile */}
          <div className="w-full lg:w-72 xl:w-80 flex-shrink-0 order-2 lg:order-1">
            <div className="lg:sticky lg:top-20 space-y-4">
              {/* Edit Button */}
              <button
                onClick={() => navigate(`/jobs/${id}/wizard`)}
                className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 transition-colors"
              >
                <Edit className="w-4 h-4" />
                <span>Edit</span>
              </button>

              {/* Build Work Order Button */}
              {(!workOrders || workOrders.length === 0) && (
                <button
                  onClick={() => {
                    setActiveQuickAction('createWorkOrder');
                    setShowQuickActionModal(true);
                  }}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all shadow-md"
                >
                  <Wrench className="w-4 h-4" />
                  <span>Build Work Order</span>
                </button>
              )}

              {/* Measurements Buttons */}
              <div className="space-y-2">
                <button
                  onClick={() => {
                    setActiveQuickAction('gafQuickMeasure');
                    setShowQuickActionModal(true);
                  }}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg hover:from-blue-600 hover:to-indigo-700 transition-all shadow-md"
                >
                  <Ruler className="w-4 h-4" />
                  <span>GAF Quick Measure</span>
                </button>
                <button
                  onClick={() => {
                    setActiveQuickAction('eagleviewMeasure');
                    setShowQuickActionModal(true);
                  }}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-lg hover:from-orange-600 hover:to-red-700 transition-all shadow-md"
                >
                  <Eye className="w-4 h-4" />
                  <span>EagleView Measurements</span>
                </button>
                <button
                  onClick={() => {
                    setActiveQuickAction('hoverCapture');
                    setShowQuickActionModal(true);
                  }}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg hover:from-purple-600 hover:to-pink-700 transition-all shadow-md"
                >
                  <Camera className="w-4 h-4" />
                  <span>Hover 3D Capture</span>
                </button>
              </div>

              {/* Collapsible Sections */}
              {/* Onboarding */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <button
                  onClick={() => toggleSection('onboarding')}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
                >
                  <span className="font-medium text-gray-900">Onboarding</span>
                  {expandedSections.onboarding ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
                </button>
                {expandedSections.onboarding && (
                  <div className="px-4 pb-4 space-y-3">
                    {onboardingChecklist.slice(0, 3).map((item) => (
                      <label key={item.id} className="flex items-center space-x-2 text-sm cursor-pointer">
                        <input type="checkbox" defaultChecked={item.checked} className="w-4 h-4 rounded border-gray-300 text-panda-primary" />
                        <span className="text-gray-700">{item.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Project Expediting */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <button
                  onClick={() => toggleSection('expediting')}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
                >
                  <span className="font-medium text-gray-900">Project Expediting</span>
                  {expandedSections.expediting ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
                </button>
                {expandedSections.expediting && (
                  <div className="px-4 pb-4 text-sm text-gray-500">
                    No expediting information available
                  </div>
                )}
              </div>

              {/* Job Audit */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <button
                  onClick={() => toggleSection('audit')}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
                >
                  <span className="font-medium text-gray-900">Job Audit</span>
                  {expandedSections.audit ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
                </button>
                {expandedSections.audit && (
                  <div className="px-4 pb-4 text-sm text-gray-500">
                    No audit information available
                  </div>
                )}
              </div>

              {/* Key Dates */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <button
                  onClick={() => toggleSection('dates')}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
                >
                  <span className="font-medium text-gray-900">Key Dates</span>
                  {expandedSections.dates ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
                </button>
                {expandedSections.dates && (
                  <div className="px-4 pb-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Created</span>
                      <span className="text-gray-900">{opportunity.createdAt ? new Date(opportunity.createdAt).toLocaleDateString() : 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Close Date</span>
                      <span className="text-gray-900">{opportunity.closeDate ? new Date(opportunity.closeDate).toLocaleDateString() : 'N/A'}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Photos (CompanyCam) */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <button
                  onClick={() => toggleSection('photos')}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
                >
                  <div className="flex items-center space-x-2">
                    <Camera className="w-4 h-4 text-gray-400" />
                    <span className="font-medium text-gray-900">Photos</span>
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                      {photos?.length || 0}
                    </span>
                  </div>
                  {expandedSections.photos ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
                </button>
                {expandedSections.photos && (
                  <div className="p-4">
                    <PhotoGallery opportunityId={id} title="" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 min-w-0 space-y-6 order-1 lg:order-2">
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

            {/* Stage, Close Date, Primary Contact, Days Open - All on Same Row */}
            <div className="grid grid-cols-4 gap-4">
              {/* Stage */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <label className="text-xs text-gray-500 uppercase tracking-wide">Stage</label>
                <p className="text-base font-semibold text-gray-900 mt-1">{opportunity.stage?.replace(/_/g, ' ') || 'Approved'}</p>
              </div>
              {/* Close Date */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <label className="text-xs text-gray-500 uppercase tracking-wide">Close Date</label>
                <p className="text-base font-semibold text-gray-900 mt-1">
                  {opportunity.closeDate ? new Date(opportunity.closeDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                </p>
              </div>
              {/* Primary Contact */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <label className="text-xs text-gray-500 uppercase tracking-wide">Primary Contact</label>
                <p className="text-base font-semibold text-gray-900 mt-1">{opportunity.contact?.firstName} {opportunity.contact?.lastName || 'N/A'}</p>
              </div>
              {/* Days Open */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <label className="text-xs text-gray-500 uppercase tracking-wide">Days Open</label>
                <p className="text-base font-semibold text-gray-900 mt-1">{daysOpen} days</p>
              </div>
            </div>

            {/* Tabs Section */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              {/* Tab Headers */}
              <div className="border-b border-gray-100 overflow-x-auto">
                <div className="flex">
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center space-x-2 px-4 py-4 border-b-2 whitespace-nowrap transition-colors ${
                          activeTab === tab.id
                            ? 'border-panda-primary text-panda-primary font-medium'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{tab.label}</span>
                        {tab.count !== undefined && (
                          <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
                            activeTab === tab.id ? 'bg-panda-primary/10 text-panda-primary' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {tab.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tab Content */}
              <div className="p-6">
                {activeTab === 'details' && (
                  <div className="space-y-6">
                    {/* Status Information */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-4">Status Information</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <label className="text-sm text-gray-500">Stage</label>
                          <p className="font-medium text-gray-900">{opportunity.stage?.replace(/_/g, ' ') || 'Approved'}</p>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <label className="text-sm text-gray-500">Approved</label>
                          <p className="font-medium text-green-600">Yes</p>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <label className="text-sm text-gray-500">Status</label>
                          <p className="font-medium text-gray-900">Not Scheduled</p>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <label className="text-sm text-gray-500">Disposition</label>
                          <p className="font-medium text-gray-500 italic">Not set</p>
                        </div>
                      </div>
                    </div>

                    {/* Sales Path */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-4">Sales Path</h3>
                      <div className="flex items-center space-x-2">
                        <button className="px-4 py-2 rounded-lg bg-panda-primary text-white text-sm font-medium">1. Call Center</button>
                        <button className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium">2. Path TBD</button>
                        <span className="text-sm text-gray-500 ml-4">Insurance / Retail / Inspection</span>
                      </div>
                    </div>

                    {/* Address */}
                    {(opportunity.street || opportunity.city) && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-4">Property Address</h3>
                        <div className="bg-gray-50 p-4 rounded-lg">
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
                      </div>
                    )}

                    {/* Measurement Data - from EagleView/GAF/Hover */}
                    {opportunity.measurementReport && (
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-semibold text-gray-900">Measurement Data</h3>
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              opportunity.measurementReport.provider === 'EAGLEVIEW'
                                ? 'bg-blue-100 text-blue-700'
                                : opportunity.measurementReport.provider === 'HOVER'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-green-100 text-green-700'
                            }`}>
                              {opportunity.measurementReport.provider === 'EAGLEVIEW' ? 'EagleView' :
                               opportunity.measurementReport.provider === 'HOVER' ? 'Hover 3D' : 'GAF QuickMeasure'}
                            </span>
                            {/* Show order status badge if not delivered */}
                            {opportunity.measurementReport.orderStatus && opportunity.measurementReport.orderStatus !== 'DELIVERED' && (
                              <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-700">
                                {opportunity.measurementReport.orderStatus === 'ORDERED' ? 'Order Pending' :
                                 opportunity.measurementReport.orderStatus === 'PROCESSING' ? 'Processing' :
                                 opportunity.measurementReport.orderStatus === 'FAILED' ? 'Order Failed' :
                                 opportunity.measurementReport.orderStatus}
                              </span>
                            )}
                            {opportunity.measurementReport.reportPdfUrl && (
                              <a
                                href={opportunity.measurementReport.reportPdfUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center text-sm text-panda-primary hover:underline"
                              >
                                <FileText className="w-4 h-4 mr-1" />
                                Download Report
                              </a>
                            )}
                            {opportunity.measurementReport.modelViewerUrl && (
                              <a
                                href={opportunity.measurementReport.modelViewerUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center text-sm text-purple-600 hover:underline"
                              >
                                <Camera className="w-4 h-4 mr-1" />
                                View 3D Model
                              </a>
                            )}
                            {opportunity.measurementReport.designViewerUrl && (
                              <a
                                href={opportunity.measurementReport.designViewerUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center text-sm text-pink-600 hover:underline"
                              >
                                <Eye className="w-4 h-4 mr-1" />
                                Design Visualizer
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                          {opportunity.measurementReport.totalRoofArea && (
                            <div className="bg-gray-50 p-3 rounded-lg">
                              <label className="text-xs text-gray-500">Total Roof Area</label>
                              <p className="font-semibold text-gray-900">{opportunity.measurementReport.totalRoofArea.toLocaleString()} sq ft</p>
                            </div>
                          )}
                          {opportunity.measurementReport.totalRoofSquares && (
                            <div className="bg-gray-50 p-3 rounded-lg">
                              <label className="text-xs text-gray-500">Roof Squares</label>
                              <p className="font-semibold text-gray-900">{opportunity.measurementReport.totalRoofSquares.toFixed(1)}</p>
                            </div>
                          )}
                          {opportunity.measurementReport.suggestedWasteFactor && (
                            <div className="bg-gray-50 p-3 rounded-lg">
                              <label className="text-xs text-gray-500">Recommended Waste</label>
                              <p className="font-semibold text-gray-900">{opportunity.measurementReport.suggestedWasteFactor}%</p>
                            </div>
                          )}
                          {opportunity.measurementReport.predominantPitch && (
                            <div className="bg-gray-50 p-3 rounded-lg">
                              <label className="text-xs text-gray-500">Predominant Pitch</label>
                              <p className="font-semibold text-gray-900">{opportunity.measurementReport.predominantPitch}</p>
                            </div>
                          )}
                          {opportunity.measurementReport.ridgeLength && (
                            <div className="bg-gray-50 p-3 rounded-lg">
                              <label className="text-xs text-gray-500">Ridges</label>
                              <p className="font-semibold text-gray-900">{opportunity.measurementReport.ridgeLength.toFixed(0)} ft</p>
                            </div>
                          )}
                          {opportunity.measurementReport.valleyLength && (
                            <div className="bg-gray-50 p-3 rounded-lg">
                              <label className="text-xs text-gray-500">Valleys</label>
                              <p className="font-semibold text-gray-900">{opportunity.measurementReport.valleyLength.toFixed(0)} ft</p>
                            </div>
                          )}
                          {opportunity.measurementReport.rakeLength && (
                            <div className="bg-gray-50 p-3 rounded-lg">
                              <label className="text-xs text-gray-500">Rakes</label>
                              <p className="font-semibold text-gray-900">{opportunity.measurementReport.rakeLength.toFixed(0)} ft</p>
                            </div>
                          )}
                          {opportunity.measurementReport.eaveLength && (
                            <div className="bg-gray-50 p-3 rounded-lg">
                              <label className="text-xs text-gray-500">Eaves</label>
                              <p className="font-semibold text-gray-900">{opportunity.measurementReport.eaveLength.toFixed(0)} ft</p>
                            </div>
                          )}
                          {opportunity.measurementReport.hipLength && (
                            <div className="bg-gray-50 p-3 rounded-lg">
                              <label className="text-xs text-gray-500">Hips</label>
                              <p className="font-semibold text-gray-900">{opportunity.measurementReport.hipLength.toFixed(0)} ft</p>
                            </div>
                          )}
                          {opportunity.measurementReport.flashingLength && (
                            <div className="bg-gray-50 p-3 rounded-lg">
                              <label className="text-xs text-gray-500">Flashing</label>
                              <p className="font-semibold text-gray-900">{opportunity.measurementReport.flashingLength.toFixed(0)} ft</p>
                            </div>
                          )}
                          {opportunity.measurementReport.stepFlashingLength && (
                            <div className="bg-gray-50 p-3 rounded-lg">
                              <label className="text-xs text-gray-500">Step Flashing</label>
                              <p className="font-semibold text-gray-900">{opportunity.measurementReport.stepFlashingLength.toFixed(0)} ft</p>
                            </div>
                          )}
                          {opportunity.measurementReport.dripEdgeLength && (
                            <div className="bg-gray-50 p-3 rounded-lg">
                              <label className="text-xs text-gray-500">Drip Edge</label>
                              <p className="font-semibold text-gray-900">{opportunity.measurementReport.dripEdgeLength.toFixed(0)} ft</p>
                            </div>
                          )}
                          {opportunity.measurementReport.facets && (
                            <div className="bg-gray-50 p-3 rounded-lg">
                              <label className="text-xs text-gray-500">Facets</label>
                              <p className="font-semibold text-gray-900">{opportunity.measurementReport.facets}</p>
                            </div>
                          )}
                        </div>
                        {opportunity.measurementReport.deliveredAt && (
                          <p className="text-xs text-gray-500 mt-2">
                            Report delivered: {new Date(opportunity.measurementReport.deliveredAt).toLocaleDateString()}
                          </p>
                        )}
                        {/* Show order info for pending reports */}
                        {!opportunity.measurementReport.deliveredAt && opportunity.measurementReport.orderedAt && (
                          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <div className="flex items-center text-yellow-700">
                              <svg className="w-5 h-5 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              <span className="font-medium">Order pending delivery</span>
                            </div>
                            <div className="mt-2 text-sm text-yellow-600">
                              {opportunity.measurementReport.orderNumber && (
                                <p>Order #: {opportunity.measurementReport.orderNumber}</p>
                              )}
                              <p>Ordered: {new Date(opportunity.measurementReport.orderedAt).toLocaleDateString()}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* No Measurements - Show Order Button */}
                    {!opportunity.measurementReport && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-4">Measurement Data</h3>
                        <div className="bg-gray-50 p-6 rounded-lg text-center">
                          <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                          <p className="text-gray-500 mb-4">No measurement report available</p>
                          <div className="flex flex-wrap justify-center gap-3">
                            <button
                              onClick={() => {
                                setActiveQuickAction('gafQuickMeasure');
                                setShowQuickActionModal(true);
                              }}
                              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
                            >
                              Order GAF QuickMeasure
                            </button>
                            <button
                              onClick={() => {
                                setActiveQuickAction('eagleviewMeasure');
                                setShowQuickActionModal(true);
                              }}
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                            >
                              Order EagleView
                            </button>
                            <button
                              onClick={() => {
                                setActiveQuickAction('hoverCapture');
                                setShowQuickActionModal(true);
                              }}
                              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium"
                            >
                              Order Hover 3D
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'schedule' && (
                  <div className="space-y-4">
                    {appointments && appointments.length > 0 ? appointments.map((apt) => (
                      <div key={apt.id} className="border border-gray-200 rounded-lg p-4 hover:border-panda-primary transition-colors">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-3">
                            <Calendar className="w-5 h-5 text-gray-400" />
                            <span className="font-medium text-gray-900">{apt.appointmentNumber || `SA-${apt.id.slice(-5)}`}</span>
                          </div>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            apt.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                            apt.status === 'SCHEDULED' ? 'bg-blue-100 text-blue-800' :
                            apt.status === 'IN_PROGRESS' ? 'bg-yellow-100 text-yellow-800' :
                            apt.status === 'CANCELED' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {apt.status || 'None'}
                          </span>
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
                            <div className="flex items-center text-gray-500">
                              <User className="w-4 h-4 mr-1" />
                              <span>{apt.assignedResource.name}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )) : (
                      <div className="text-center py-8 text-gray-500">
                        <Calendar className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                        <p>No appointments scheduled</p>
                        {workOrders && workOrders.length > 0 ? (
                          <button
                            onClick={() => {
                              setActiveQuickAction({ type: 'addAppointment', workOrderId: workOrders[0].id });
                              setShowQuickActionModal(true);
                            }}
                            className="mt-4 text-panda-primary hover:underline"
                          >
                            + Schedule Appointment
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setActiveQuickAction('createWorkOrder');
                              setShowQuickActionModal(true);
                            }}
                            className="mt-4 text-panda-primary hover:underline"
                          >
                            + Create Work Order First
                          </button>
                        )}
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
                                'bg-gray-100'
                              }`}>
                                <Wrench className={`w-5 h-5 ${
                                  wo.status === 'COMPLETED' ? 'text-green-600' :
                                  wo.status === 'IN_PROGRESS' ? 'text-yellow-600' :
                                  wo.status === 'SCHEDULED' ? 'text-blue-600' :
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
                      <div key={caseItem.id} className="border border-gray-200 rounded-lg overflow-hidden hover:border-panda-primary transition-colors">
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
                                <h4 className="font-medium text-gray-900">{caseItem.caseNumber}</h4>
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
                          onClick={() => {
                            setActiveQuickAction('sendSMS');
                            setShowQuickActionModal(true);
                          }}
                          className="flex items-center space-x-1 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                        >
                          <Phone className="w-4 h-4" />
                          <span>SMS</span>
                        </button>
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
                          className="flex items-center space-x-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                        >
                          <Mail className="w-4 h-4" />
                          <span>Email</span>
                        </button>
                        <button
                          onClick={() => {
                            setActiveQuickAction('logCall');
                            setShowQuickActionModal(true);
                          }}
                          className="flex items-center space-x-1 px-3 py-1.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm"
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
                                onClick={() => {
                                  setActiveQuickAction('sendSMS');
                                  setShowQuickActionModal(true);
                                }}
                                className="inline-flex items-center space-x-1 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                              >
                                <Phone className="w-4 h-4" />
                                <span>Send SMS</span>
                              </button>
                              <button
                                onClick={() => {
                                  setActiveQuickAction('composeEmail');
                                  setShowQuickActionModal(true);
                                }}
                                className="inline-flex items-center space-x-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
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
                      <div key={quote.id} className="border border-gray-200 rounded-lg p-4 hover:border-panda-primary transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <FileText className="w-5 h-5 text-gray-400" />
                            <div>
                              <h4 className="font-medium text-gray-900">{quote.quoteNumber || quote.name}</h4>
                              <p className="text-sm text-gray-500">${(quote.grandTotal || 0).toLocaleString()}</p>
                            </div>
                          </div>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            quote.status === 'ACCEPTED' ? 'bg-green-100 text-green-800' :
                            quote.status === 'SENT' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {quote.status || 'Draft'}
                          </span>
                        </div>
                      </div>
                    )) : (
                      <div className="text-center py-8 text-gray-500">
                        <FileText className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                        <p>No quotes found</p>
                      </div>
                    )}
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
                        <p className="text-2xl font-bold text-red-700">${(summary?.financials?.balanceDue || 0).toLocaleString()}</p>
                      </div>
                    </div>

                    {/* Invoice List */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-gray-900">Invoices</h3>
                      {invoices && invoices.length > 0 ? invoices.map((invoice) => (
                        <div key={invoice.id} className="border border-gray-200 rounded-lg p-4 hover:border-panda-primary transition-colors">
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
                          </div>
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

                {activeTab === 'commissions' && (
                  <div className="space-y-4">
                    {commissions && commissions.length > 0 ? commissions.map((commission) => (
                      <div key={commission.id} className="border border-gray-200 rounded-lg p-4 hover:border-panda-primary transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <Percent className="w-5 h-5 text-gray-400" />
                            <div>
                              <h4 className="font-medium text-gray-900">{commission.type?.replace(/_/g, ' ') || 'Commission'}</h4>
                              <p className="text-sm text-gray-500">
                                {commission.user?.firstName} {commission.user?.lastName || 'Unassigned'}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-green-600">${(commission.amount || 0).toLocaleString()}</p>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              commission.status === 'PAID' ? 'bg-green-100 text-green-800' :
                              commission.status === 'APPROVED' ? 'bg-blue-100 text-blue-800' :
                              commission.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {commission.status || 'Pending'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )) : (
                      <div className="text-center py-8 text-gray-500">
                        <Percent className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                        <p>No commissions found</p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'documents' && (
                  <div className="space-y-4">
                    {documents && documents.length > 0 ? documents.map((doc) => (
                      <div key={doc.id} className="border border-gray-200 rounded-lg p-4 hover:border-panda-primary transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <FileSignature className="w-5 h-5 text-gray-400" />
                            <div>
                              <h4 className="font-medium text-gray-900">{doc.name || doc.title}</h4>
                              <p className="text-sm text-gray-500">
                                {doc.type || 'Document'} • {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : '-'}
                              </p>
                            </div>
                          </div>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            doc.status === 'SIGNED' ? 'bg-green-100 text-green-800' :
                            doc.status === 'SENT' ? 'bg-yellow-100 text-yellow-800' :
                            doc.status === 'VIEWED' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {doc.status || 'Draft'}
                          </span>
                        </div>
                      </div>
                    )) : (
                      <div className="text-center py-8 text-gray-500">
                        <FileSignature className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                        <p>No documents uploaded</p>
                        <button className="mt-4 text-panda-primary hover:underline">Upload Documents</button>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'activity' && (
                  <div className="space-y-4">
                    {activityData?.items && activityData.items.length > 0 ? activityData.items.map((item, index) => (
                      <div key={item.id || index} className="flex items-start space-x-3 py-3 border-b border-gray-100 last:border-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          item.type === 'note' ? 'bg-blue-100' :
                          item.type === 'task' ? 'bg-yellow-100' :
                          item.type === 'event' ? 'bg-purple-100' :
                          'bg-gray-100'
                        }`}>
                          {item.type === 'note' && <MessageSquare className="w-4 h-4 text-blue-600" />}
                          {item.type === 'task' && <CheckSquare className="w-4 h-4 text-yellow-600" />}
                          {item.type === 'event' && <Calendar className="w-4 h-4 text-purple-600" />}
                          {!['note', 'task', 'event'].includes(item.type) && <Activity className="w-4 h-4 text-gray-600" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-gray-900 truncate">{item.subject || item.title}</p>
                            <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                              {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '-'}
                            </span>
                          </div>
                          {item.body && (
                            <p className="text-sm text-gray-500 mt-1 line-clamp-2">{item.body}</p>
                          )}
                          {item.user && (
                            <p className="text-xs text-gray-400 mt-1">
                              by {item.user.firstName} {item.user.lastName}
                            </p>
                          )}
                        </div>
                      </div>
                    )) : (
                      <div className="text-center py-8 text-gray-500">
                        <Activity className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                        <p>No activity yet</p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'communications' && (
                  <CommunicationsTab
                    phone={opportunity?.contact?.phone || opportunity?.contact?.mobilePhone}
                    email={opportunity?.contact?.email}
                    contactName={opportunity?.contact?.name || `${opportunity?.contact?.firstName || ''} ${opportunity?.contact?.lastName || ''}`}
                  />
                )}

                {activeTab === 'checklist' && (
                  <div className="space-y-6">
                    {/* Onboarding Checklist */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-4">Onboarding Checklist</h3>
                      <div className="space-y-3">
                        {onboardingChecklist.map((item) => (
                          <label key={item.id} className="flex items-center space-x-3 cursor-pointer">
                            <input type="checkbox" defaultChecked={item.checked} className="w-5 h-5 rounded border-gray-300 text-panda-primary focus:ring-panda-primary" />
                            <span className="text-gray-700">{item.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <label className="text-sm text-gray-500">Onboarding Start Date</label>
                        <p className="font-medium text-gray-500 italic">Not set</p>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <label className="text-sm text-gray-500">Approved Date</label>
                        <p className="font-medium text-gray-900">Aug 30, 2021</p>
                      </div>
                    </div>

                    {/* Financing */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-4">Financing</h3>
                      <div className="space-y-3">
                        {['Financed', 'Down Payment Received', 'Deductible Received'].map((item) => (
                          <label key={item} className="flex items-center space-x-3 cursor-pointer">
                            <input type="checkbox" className="w-5 h-5 rounded border-gray-300 text-panda-primary focus:ring-panda-primary" />
                            <span className="text-gray-700">{item}</span>
                          </label>
                        ))}
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
            ['gafQuickMeasure', 'eagleviewMeasure', 'hoverCapture'].includes(activeQuickAction)
              ? 'max-w-3xl'
              : 'max-w-lg'
          }`}>
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-xl font-semibold text-gray-900">
                {activeQuickAction === 'createWorkOrder' && 'Create Work Order'}
                {activeQuickAction?.type === 'editWorkOrder' && 'Edit Work Order'}
                {activeQuickAction?.type === 'addAppointment' && 'Schedule Appointment'}
                {activeQuickAction === 'gafQuickMeasure' && 'GAF Quick Measure'}
                {activeQuickAction === 'eagleviewMeasure' && 'Get EagleView Measurements'}
                {activeQuickAction === 'hoverCapture' && 'Hover 3D Capture'}
                {activeQuickAction === 'createCase' && 'Create Case'}
                {activeQuickAction === 'composeEmail' && 'Compose Email'}
                {activeQuickAction === 'sendMessage' && 'Send Message'}
                {activeQuickAction === 'addContact' && 'Add Contact'}
                {!activeQuickAction?.type && !['createWorkOrder', 'gafQuickMeasure', 'eagleviewMeasure', 'hoverCapture', 'createCase', 'composeEmail', 'sendMessage', 'addContact'].includes(activeQuickAction) && 'Quick Action'}
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
                      disabled={orderGAFMeasureMutation.isLoading || !gafMeasureForm.street || !gafMeasureForm.city || !gafMeasureForm.state || !gafMeasureForm.zip}
                      className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      {orderGAFMeasureMutation.isLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                      <Ruler className="w-4 h-4" />
                      <span>Submit Order</span>
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
                      disabled={orderEagleViewMutation.isLoading || !eagleviewForm.street || !eagleviewForm.city || !eagleviewForm.state || !eagleviewForm.zip || !eagleviewForm.measurementType}
                      className="px-4 py-2 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-lg hover:from-orange-600 hover:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      {orderEagleViewMutation.isLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                      <Eye className="w-4 h-4" />
                      <span>Submit Order</span>
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
                      disabled={createHoverCaptureMutation.isLoading || !hoverCaptureForm.street || !hoverCaptureForm.city || !hoverCaptureForm.state || !hoverCaptureForm.zip}
                      className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg hover:from-purple-600 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      {createHoverCaptureMutation.isLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                      <Camera className="w-4 h-4" />
                      <span>Create Capture Request</span>
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
    </div>
  );
}
