import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  CheckCircle,
  Clock,
  Circle,
  Calendar,
  MapPin,
  Phone,
  Mail,
  MessageSquare,
  Image,
  Send,
  AlertCircle,
  Loader2,
  ExternalLink,
  CreditCard,
  Receipt,
  X,
  CalendarPlus,
  CalendarClock,
  CalendarX,
  LayoutGrid,
  TrendingUp,
  LifeBuoy,
  RefreshCw,
  Users,
} from 'lucide-react';
import { customerPortalApi } from '../services/api';
import PortalLayout from '../components/customer-portal/PortalLayout';
import PortalTabNav from '../components/customer-portal/PortalTabNav';
import PayInvoiceModal from '../components/PayInvoiceModal';

// Timeline stage icons and colors
const stageConfig = {
  completed: {
    icon: CheckCircle,
    bgColor: 'bg-green-500',
    textColor: 'text-green-500',
    lineColor: 'bg-green-500',
  },
  in_progress: {
    icon: Clock,
    bgColor: 'bg-blue-500',
    textColor: 'text-blue-500',
    lineColor: 'bg-blue-500',
  },
  pending: {
    icon: Circle,
    bgColor: 'bg-gray-300',
    textColor: 'text-gray-400',
    lineColor: 'bg-gray-300',
  },
};

export default function CustomerPortal() {
  const { token, jobId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [projectData, setProjectData] = useState(null);
  const [stages, setStages] = useState([]);
  const [galleries, setGalleries] = useState([]);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [messageSent, setMessageSent] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [portalToken, setPortalToken] = useState(token); // Store the token for API calls
  const [activeTab, setActiveTab] = useState('overview');
  const [trackerLoaded, setTrackerLoaded] = useState(false);
  const [trackerError, setTrackerError] = useState(false);

  // Self-service booking state
  const [appointments, setAppointments] = useState([]);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [bookingDate, setBookingDate] = useState('');
  const [bookingTimeSlot, setBookingTimeSlot] = useState('');
  const [bookingNotes, setBookingNotes] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(null);
  const [bookingError, setBookingError] = useState(null);
  const showAppointments = false;
  const refreshBilling = async (activeToken) => {
    if (!activeToken) return;
    try {
      const billingResponse = await customerPortalApi.getPayments(activeToken);
      if (billingResponse.success) {
        const billingData = billingResponse.data || {};
        const resolvedInvoices = Array.isArray(billingData)
          ? billingData
          : (billingData.invoices || []);
        const resolvedPayments = Array.isArray(billingData)
          ? []
          : (billingData.payments || []);
        setInvoices(resolvedInvoices);
        setPayments(resolvedPayments);
      }
    } catch (err) {
      console.error('Error refreshing billing:', err);
    }
  };

  useEffect(() => {
    async function loadPortalData() {
      // Allow access via token OR jobId
      if (!token && !jobId) {
        setError('Invalid portal link');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        let projectResponse;
        let activeToken = token;

        // If accessing via job number, fetch initial data and get the token
        if (jobId && !token) {
          if (typeof customerPortalApi.getProjectByJobId === 'function') {
            projectResponse = await customerPortalApi.getProjectByJobId(jobId);
            if (projectResponse.success && projectResponse.data.token) {
              activeToken = projectResponse.data.token;
              setPortalToken(activeToken);
            }
          } else {
            throw new Error('Invalid portal link');
          }
        } else {
          projectResponse = await customerPortalApi.getProject(token);
        }

        if (projectResponse.success) {
          setProjectData(projectResponse.data);
        }

        // Use the resolved token for remaining API calls
        const [stagesResponse, galleriesResponse, billingResponse, appointmentsResponse] = await Promise.all([
          customerPortalApi.getStages(activeToken),
          customerPortalApi.getGalleries(activeToken),
          customerPortalApi.getInvoices(activeToken),
          customerPortalApi.getAppointments(activeToken).catch(() => ({ success: false, data: [] })),
        ]);

        if (projectResponse.success) {
          setProjectData(projectResponse.data);
        }
        if (stagesResponse.success) {
          setStages(stagesResponse.data);
        }
        if (galleriesResponse.success) {
          setGalleries(galleriesResponse.data);
        }
        if (billingResponse.success) {
          const billingData = billingResponse.data || {};
          const resolvedInvoices = Array.isArray(billingData)
            ? billingData
            : (billingData.invoices || []);
          const resolvedPayments = Array.isArray(billingData)
            ? []
            : (billingData.payments || []);
          setInvoices(resolvedInvoices);
          setPayments(resolvedPayments);
        }
        if (appointmentsResponse.success) {
          setAppointments(appointmentsResponse.data);
        }
      } catch (err) {
        console.error('Error loading portal data:', err);
        const errorMessage = err.response?.data?.error?.message || 'Unable to load project information';
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    }

    loadPortalData();
  }, [token, jobId]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;

    setIsSending(true);
    try {
      const activeToken = portalToken || token;
      if (!activeToken) return;
      const senderName = projectData?.contact?.name || projectData?.project?.accountName;
      const senderPhone = projectData?.contact?.phone || projectData?.project?.accountPhone;
      await customerPortalApi.sendMessage(
        activeToken,
        message.trim(),
        senderName,
        senderPhone
      );
      setMessage('');
      setMessageSent(true);
      setTimeout(() => setMessageSent(false), 5000);
    } catch (err) {
      console.error('Error sending message:', err);
    } finally {
      setIsSending(false);
    }
  };

  // Load available slots for booking
  const loadAvailableSlots = async (startDate, endDate) => {
    if (!portalToken) return;
    setSlotsLoading(true);
    try {
      const response = await customerPortalApi.getAvailableSlots(portalToken, {
        startDate,
        endDate,
        duration: 120, // 2 hours default
      });
      if (response.success) {
        setAvailableSlots(response.data.slots || []);
      } else {
        setAvailableSlots([]);
      }
    } catch (err) {
      console.error('Error loading available slots:', err);
      setAvailableSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  };

  // Handle booking new appointment
  const handleBookAppointment = async (e) => {
    e.preventDefault();
    if (!bookingDate || !bookingTimeSlot) {
      setBookingError('Please select a date and time slot');
      return;
    }

    setIsSubmitting(true);
    setBookingError(null);
    try {
      const response = await customerPortalApi.bookAppointment(portalToken, {
        date: bookingDate,
        timeSlot: bookingTimeSlot,
        notes: bookingNotes,
      });
      if (response.success) {
        setBookingSuccess('Your appointment request has been submitted! You will receive a confirmation soon.');
        setAppointments(prev => [...prev, response.data]);
        setTimeout(() => {
          setShowBookingModal(false);
          setBookingSuccess(null);
          setBookingDate('');
          setBookingTimeSlot('');
          setBookingNotes('');
        }, 3000);
      }
    } catch (err) {
      console.error('Error booking appointment:', err);
      setBookingError(err.response?.data?.error?.message || 'Failed to book appointment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle rescheduling appointment
  const handleRescheduleAppointment = async (e) => {
    e.preventDefault();
    if (!selectedAppointment || !bookingDate || !bookingTimeSlot) {
      setBookingError('Please select a new date and time slot');
      return;
    }

    setIsSubmitting(true);
    setBookingError(null);
    try {
      const response = await customerPortalApi.rescheduleAppointment(portalToken, selectedAppointment.id, {
        newDate: bookingDate,
        newTimeSlot: bookingTimeSlot,
        reason: bookingNotes || 'Customer requested reschedule',
      });
      if (response.success) {
        setBookingSuccess('Your appointment has been rescheduled!');
        setAppointments(prev => prev.map(apt =>
          apt.id === selectedAppointment.id ? response.data : apt
        ));
        setTimeout(() => {
          setShowRescheduleModal(false);
          setBookingSuccess(null);
          setSelectedAppointment(null);
          setBookingDate('');
          setBookingTimeSlot('');
          setBookingNotes('');
        }, 3000);
      }
    } catch (err) {
      console.error('Error rescheduling appointment:', err);
      setBookingError(err.response?.data?.error?.message || 'Failed to reschedule appointment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle cancellation
  const handleCancelAppointment = async (e) => {
    e.preventDefault();
    if (!selectedAppointment || !cancelReason.trim()) {
      setBookingError('Please provide a reason for cancellation');
      return;
    }

    setIsSubmitting(true);
    setBookingError(null);
    try {
      const response = await customerPortalApi.cancelAppointment(portalToken, selectedAppointment.id, {
        reason: cancelReason,
      });
      if (response.success) {
        setBookingSuccess('Your appointment has been cancelled.');
        setAppointments(prev => prev.map(apt =>
          apt.id === selectedAppointment.id ? { ...apt, status: 'CANCELED' } : apt
        ));
        setTimeout(() => {
          setShowCancelModal(false);
          setBookingSuccess(null);
          setSelectedAppointment(null);
          setCancelReason('');
        }, 3000);
      }
    } catch (err) {
      console.error('Error cancelling appointment:', err);
      setBookingError(err.response?.data?.error?.message || 'Failed to cancel appointment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open booking modal
  const openBookingModal = () => {
    setShowBookingModal(true);
    setBookingError(null);
    setBookingSuccess(null);
    // Load slots for next 2 weeks
    const startDate = new Date().toISOString().split('T')[0];
    const endDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    loadAvailableSlots(startDate, endDate);
  };

  // Open reschedule modal
  const openRescheduleModal = (appointment) => {
    setSelectedAppointment(appointment);
    setShowRescheduleModal(true);
    setBookingError(null);
    setBookingSuccess(null);
    // Load slots for next 2 weeks
    const startDate = new Date().toISOString().split('T')[0];
    const endDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    loadAvailableSlots(startDate, endDate);
  };

  // Open cancel modal
  const openCancelModal = (appointment) => {
    setSelectedAppointment(appointment);
    setShowCancelModal(true);
    setBookingError(null);
    setBookingSuccess(null);
    setCancelReason('');
  };

  // Format appointment status
  const getStatusBadge = (status) => {
    const statusConfig = {
      SCHEDULED: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Scheduled' },
      CONFIRMED: { bg: 'bg-green-100', text: 'text-green-700', label: 'Confirmed' },
      IN_PROGRESS: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'In Progress' },
      COMPLETED: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Completed' },
      CANCELED: { bg: 'bg-red-100', text: 'text-red-700', label: 'Cancelled' },
      PENDING_CONFIRMATION: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pending' },
    };
    const config = statusConfig[status] || { bg: 'bg-gray-100', text: 'text-gray-700', label: status };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    );
  };

  const toNumber = (value) => {
    if (value === null || value === undefined) return 0;
    const numberValue = typeof value === 'string' ? Number(value) : value;
    return Number.isFinite(numberValue) ? numberValue : 0;
  };

  const formatCurrency = (value) => {
    const numberValue = toNumber(value);
    return numberValue.toFixed(2);
  };

  const { project, progress, contact, projectManager } = projectData || {};
  const resolvedContact = contact || (project?.accountName ? { name: project.accountName, phone: project.accountPhone } : null);
  const resolvedProjectManager = projectManager ? {
    ...projectManager,
    name: projectManager.name || [projectManager.firstName, projectManager.lastName].filter(Boolean).join(' '),
  } : null;
  const projectAddress = project?.address || (project?.street ? {
    street: project.street,
    city: project.city,
    state: project.state,
    postalCode: project.postalCode,
  } : null);
  const enabledStages = useMemo(
    () => (stages || []).filter((stage) => stage.is_enabled !== false),
    [stages]
  );
  const completedStages = useMemo(
    () => enabledStages.filter((stage) => stage.status === 'completed').length,
    [enabledStages]
  );
  const progressPercent = useMemo(() => {
    if (typeof progress?.percent === 'number') return progress.percent;
    if (!enabledStages.length) return 0;
    return Math.round((completedStages / enabledStages.length) * 100);
  }, [progress?.percent, enabledStages.length, completedStages]);

  const outstandingBalance = useMemo(
    () => (invoices || []).reduce((total, invoice) => total + toNumber(invoice.balanceDue), 0),
    [invoices]
  );

  const nextDueDate = useMemo(() => {
    const upcoming = (invoices || [])
      .filter((invoice) => toNumber(invoice.balanceDue) > 0 && invoice.dueDate)
      .map((invoice) => new Date(invoice.dueDate))
      .sort((a, b) => a - b);
    return upcoming[0] || null;
  }, [invoices]);

  const nextAppointment = useMemo(() => {
    const upcoming = (appointments || [])
      .filter((appointment) => appointment.scheduledStart && !['CANCELED', 'COMPLETED', 'CANNOT_COMPLETE'].includes(appointment.status))
      .sort((a, b) => new Date(a.scheduledStart) - new Date(b.scheduledStart));
    return upcoming[0] || null;
  }, [appointments]);

  const trackerUrl = useMemo(() => {
    const resolvedToken = portalToken || token;
    const params = new URLSearchParams();
    if (resolvedToken) params.set('token', resolvedToken);
    if (jobId) params.set('jobId', jobId);
    const suffix = params.toString();
    return `https://d3mxtzkuxghkkv.cloudfront.net/project-progress.html${suffix ? `?${suffix}` : ''}`;
  }, [portalToken, token, jobId]);

  useEffect(() => {
    if (activeTab !== 'progress') return;
    setTrackerLoaded(false);
    setTrackerError(false);
  }, [activeTab, trackerUrl]);

  const tabs = useMemo(() => ([
    { id: 'overview', label: 'Overview', icon: LayoutGrid },
    { id: 'progress', label: 'Project Progress', icon: TrendingUp },
    { id: 'documents', label: 'Documents', icon: Image },
    { id: 'billing', label: 'Billing', icon: CreditCard },
    { id: 'messages', label: 'Messages', icon: MessageSquare },
    { id: 'support', label: 'Support', icon: LifeBuoy },
  ]), []);

  const portalBrand = useMemo(() => ({
    name: 'Panda Exteriors',
    subtitle: 'Customer Portal',
    logoSrc: '/panda-logo.svg',
    primary: '#f88000',
    secondary: '#68a000',
    accent: '#f8b848',
  }), []);

  const resolvedJobId = project?.jobId || jobId;

  if (loading) {
    return (
      <PortalLayout title="Panda Exteriors" subtitle="Customer Portal" jobId={jobId}>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-[color:var(--portal-primary)]" />
            <p className="text-[color:var(--portal-muted)]">Loading your project...</p>
          </div>
        </div>
      </PortalLayout>
    );
  }

  if (error) {
    return (
      <PortalLayout title="Panda Exteriors" subtitle="Customer Portal" jobId={jobId}>
        <div className="flex min-h-[60vh] items-center justify-center px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <h1 className="mb-2 text-2xl font-bold text-gray-900">Access Error</h1>
            <p className="mb-6 text-gray-600">{error}</p>
            <p className="text-sm text-gray-500">
              If you believe this is an error, please contact your project manager.
            </p>
          </div>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout
      title="Panda Exteriors"
      subtitle="Customer Portal"
      jobId={resolvedJobId}
      brand={portalBrand}
    >
      <PortalTabNav tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      <div className="mt-6 space-y-6">
        {activeTab === 'overview' && (
          <>
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Project Card */}
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--portal-muted)]">Project</p>
                <h2 className="mt-2 text-xl font-semibold text-gray-900">
                  {project?.name || resolvedContact?.name || 'Your Project'}
                </h2>
                {projectAddress && (
                  <div className="mt-2 flex items-center text-sm text-gray-600">
                    <MapPin className="w-4 h-4 mr-2" />
                    <span>
                      {projectAddress.street && `${projectAddress.street}, `}
                      {projectAddress.city}, {projectAddress.state} {projectAddress.postalCode}
                    </span>
                  </div>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {project?.installDate && (
                    <div className="flex items-center bg-[color:var(--portal-accent)]/20 text-[color:var(--portal-primary)] px-3 py-2 rounded-lg text-sm">
                      <Calendar className="w-4 h-4 mr-2" />
                      <span>
                        Install {new Date(project.installDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  )}
                  {showAppointments && nextAppointment?.scheduledStart && (
                    <div className="flex items-center bg-gray-100 px-3 py-2 rounded-lg text-sm text-gray-700">
                      <CalendarClock className="w-4 h-4 mr-2 text-gray-500" />
                      <span>
                        Next appt {new Date(nextAppointment.scheduledStart).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  )}
                </div>
                {showAppointments && (
                  <div className="mt-4">
                    {nextAppointment ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => openRescheduleModal(nextAppointment)}
                          className="flex-1 px-3 py-2 text-sm text-[color:var(--portal-primary)] border border-[color:var(--portal-primary)]/30 rounded-lg hover:bg-[color:var(--portal-primary)]/10 transition-colors"
                        >
                          Reschedule
                        </button>
                        <button
                          onClick={() => openCancelModal(nextAppointment)}
                          className="flex-1 px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={openBookingModal}
                        className="w-full flex items-center justify-center px-4 py-2 bg-[color:var(--portal-primary)] text-white rounded-lg hover:bg-[color:var(--portal-secondary)] transition-colors text-sm font-medium"
                      >
                        <CalendarPlus className="w-4 h-4 mr-2" />
                        Book appointment
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Progress Snapshot */}
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--portal-muted)]">Progress</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('progress')}
                    className="text-sm font-medium text-[color:var(--portal-primary)] hover:text-[color:var(--portal-secondary)]"
                  >
                    View tracker →
                  </button>
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <p className="text-4xl font-semibold text-[color:var(--portal-primary)]">{progressPercent}%</p>
                  <p className="text-sm text-[color:var(--portal-muted)]">
                    {completedStages} of {enabledStages.length} stages complete
                  </p>
                </div>
                <div className="mt-4 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[color:var(--portal-secondary)] to-[color:var(--portal-primary)] rounded-full transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Billing Snapshot */}
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--portal-muted)]">Billing</p>
                <p className="mt-3 text-3xl font-semibold text-gray-900">
                  ${formatCurrency(outstandingBalance)}
                </p>
                <p className="text-sm text-gray-500">Outstanding balance</p>
                <div className="mt-3 text-sm text-gray-600">
                  {nextDueDate ? (
                    <span>Next due {nextDueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  ) : (
                    <span>No upcoming due dates</span>
                  )}
                </div>
                <button
                  onClick={() => setActiveTab('billing')}
                  className="mt-4 w-full rounded-lg bg-[color:var(--portal-accent)]/20 px-4 py-2 text-sm font-medium text-[color:var(--portal-primary)] hover:bg-[color:var(--portal-accent)]/30"
                >
                  View invoices
                </button>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {/* Documents */}
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--portal-muted)]">Documents</p>
                  <div className="w-10 h-10 bg-[color:var(--portal-accent)]/30 rounded-lg flex items-center justify-center">
                    <Image className="w-5 h-5 text-[color:var(--portal-primary)]" />
                  </div>
                </div>
                <h3 className="mt-3 text-lg font-semibold text-gray-900">Photos & files</h3>
                <p className="text-sm text-gray-500">
                  {galleries.length ? `${galleries.length} galleries available.` : 'We will add project photos as work progresses.'}
                </p>
                <button
                  onClick={() => setActiveTab('documents')}
                  className="mt-4 inline-flex items-center justify-center rounded-lg border border-[color:var(--portal-primary)]/20 px-4 py-2 text-sm font-medium text-[color:var(--portal-primary)] hover:bg-[color:var(--portal-primary)]/10"
                >
                  Browse documents
                </button>
              </div>

              {/* Support */}
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--portal-muted)]">Support</p>
                  <div className="w-10 h-10 bg-[color:var(--portal-accent)]/30 rounded-lg flex items-center justify-center">
                    <LifeBuoy className="w-5 h-5 text-[color:var(--portal-primary)]" />
                  </div>
                </div>
                <h3 className="mt-3 text-lg font-semibold text-gray-900">Need anything?</h3>
                <p className="text-sm text-gray-500">Send a message and our team will respond soon.</p>
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => setActiveTab('messages')}
                    className="flex-1 rounded-lg bg-[color:var(--portal-primary)] text-white px-4 py-2 text-sm font-medium hover:bg-[color:var(--portal-secondary)]"
                  >
                    Send a message
                  </button>
                  <button
                    onClick={() => setActiveTab('support')}
                    className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Contact info
                  </button>
                </div>
              </div>

              {/* Team */}
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--portal-muted)]">Team</p>
                  <div className="w-10 h-10 bg-[color:var(--portal-accent)]/30 rounded-lg flex items-center justify-center">
                    <Users className="w-5 h-5 text-[color:var(--portal-primary)]" />
                  </div>
                </div>
                <h3 className="mt-3 text-lg font-semibold text-gray-900">Project Manager</h3>
                <p className="text-sm text-gray-500">
                  {resolvedProjectManager?.name || 'Assigned soon'}
                </p>
                <div className="mt-3 space-y-2 text-sm text-gray-600">
                  {resolvedProjectManager?.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-[color:var(--portal-muted)]" />
                      <span>{resolvedProjectManager.phone}</span>
                    </div>
                  )}
                  {resolvedProjectManager?.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-[color:var(--portal-muted)]" />
                      <span className="truncate">{resolvedProjectManager.email}</span>
                    </div>
                  )}
                  {!resolvedProjectManager?.phone && !resolvedProjectManager?.email && (
                    <p className="text-sm text-gray-500">Contact details will appear once assigned.</p>
                  )}
                </div>
                <button
                  onClick={() => setActiveTab('support')}
                  className="mt-4 w-full rounded-lg border border-[color:var(--portal-primary)]/20 px-4 py-2 text-sm font-medium text-[color:var(--portal-primary)] hover:bg-[color:var(--portal-primary)]/10"
                >
                  View contact info
                </button>
              </div>

              {/* Messages */}
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--portal-muted)]">Updates</p>
                  <div className="w-10 h-10 bg-[color:var(--portal-accent)]/30 rounded-lg flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-[color:var(--portal-primary)]" />
                  </div>
                </div>
                <h3 className="mt-3 text-lg font-semibold text-gray-900">Messages</h3>
                <p className="text-sm text-gray-500">Send updates, questions, or approvals.</p>
                <button
                  onClick={() => setActiveTab('messages')}
                  className="mt-4 w-full rounded-lg bg-[color:var(--portal-primary)] text-white px-4 py-2 text-sm font-medium hover:bg-[color:var(--portal-secondary)]"
                >
                  Open messages
                </button>
              </div>

              {/* Payments */}
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--portal-muted)]">Invoices</p>
                  <div className="w-10 h-10 bg-[color:var(--portal-accent)]/30 rounded-lg flex items-center justify-center">
                    <Receipt className="w-5 h-5 text-[color:var(--portal-primary)]" />
                  </div>
                </div>
                <h3 className="mt-3 text-lg font-semibold text-gray-900">Payments</h3>
                <p className="text-sm text-gray-500">Track invoices and pay securely.</p>
                <button
                  onClick={() => setActiveTab('billing')}
                  className="mt-4 w-full rounded-lg bg-[color:var(--portal-primary)] text-white px-4 py-2 text-sm font-medium hover:bg-[color:var(--portal-secondary)]"
                >
                  Manage billing
                </button>
              </div>

              {/* Tracker */}
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--portal-muted)]">Progress</p>
                  <div className="w-10 h-10 bg-[color:var(--portal-accent)]/30 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-[color:var(--portal-primary)]" />
                  </div>
                </div>
                <h3 className="mt-3 text-lg font-semibold text-gray-900">Tracker</h3>
                <p className="text-sm text-gray-500">See milestones and completion.</p>
                <button
                  onClick={() => setActiveTab('progress')}
                  className="mt-4 w-full rounded-lg bg-[color:var(--portal-primary)] text-white px-4 py-2 text-sm font-medium hover:bg-[color:var(--portal-secondary)]"
                >
                  View tracker
                </button>
              </div>
            </div>
          </>
        )}

        {activeTab === 'progress' && (
          <>
            {/* Progress Bar */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Project Progress</h3>
                <span className="text-3xl font-bold text-[color:var(--portal-primary)]">{progressPercent}%</span>
              </div>
              <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[color:var(--portal-secondary)] to-[color:var(--portal-primary)] rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Timeline */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-6">Project Timeline</h3>
              <div className="relative">
                {stages.map((stage, index) => {
                  const config = stageConfig[stage.status] || stageConfig.pending;
                  const Icon = config.icon;
                  const isLast = index === stages.length - 1;

                  return (
                    <div key={stage.number} className="flex items-start mb-6 last:mb-0">
                      {/* Icon and line */}
                      <div className="relative flex flex-col items-center mr-4">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center ${config.bgColor} ${
                            stage.status === 'pending' ? 'bg-opacity-50' : ''
                          }`}
                        >
                          <Icon className={`w-5 h-5 ${stage.status === 'pending' ? 'text-gray-500' : 'text-white'}`} />
                        </div>
                        {!isLast && (
                          <div
                            className={`w-0.5 h-full absolute top-10 ${
                              stage.status === 'completed' ? 'bg-green-500' : 'bg-gray-300'
                            }`}
                            style={{ minHeight: '40px' }}
                          />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 pt-1">
                        <div className="flex items-center justify-between">
                          <h4
                            className={`font-semibold ${
                              stage.status === 'pending' ? 'text-gray-400' : 'text-gray-900'
                            }`}
                          >
                            {stage.name}
                          </h4>
                          {stage.completedAt && (
                            <span className="text-sm text-green-600">
                              {new Date(stage.completedAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          )}
                        </div>
                        {stage.status === 'in_progress' && (
                          <p className="text-sm text-[color:var(--portal-primary)] mt-1">In Progress</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tracker */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Project Progress Tracker</h3>
                  <p className="text-sm text-[color:var(--portal-muted)]">
                    Live view of your project milestones and tasks.
                  </p>
                </div>
                <a
                  href={trackerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium text-[color:var(--portal-primary)] hover:text-[color:var(--portal-secondary)]"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open full tracker
                </a>
              </div>
              <div className="relative overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-white">
                {!trackerLoaded && !trackerError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                    <div className="text-center">
                      <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-[color:var(--portal-primary)]" />
                      <p className="text-sm text-[color:var(--portal-muted)]">Loading tracker...</p>
                    </div>
                  </div>
                )}
                {trackerError ? (
                  <div className="flex min-h-[360px] flex-col items-center justify-center gap-2 px-4 text-center">
                    <AlertCircle className="h-8 w-8 text-red-500" />
                    <p className="text-sm text-gray-600">Unable to load progress tracker. Try again.</p>
                  </div>
                ) : (
                  <iframe
                    title="Project Progress Tracker"
                    src={trackerUrl}
                    className="h-[70vh] min-h-[420px] w-full"
                    onLoad={() => setTrackerLoaded(true)}
                    onError={() => setTrackerError(true)}
                  />
                )}
              </div>
            </div>
          </>
        )}

        {activeTab === 'documents' && (
          <>
            {galleries.length > 0 ? (
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Photo Galleries</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {galleries.map((gallery) => (
                    <a
                      key={gallery.id}
                      href={`/gallery/${gallery.publicToken}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-[color:var(--portal-accent)]/30 rounded-lg flex items-center justify-center mr-3">
                          <Image className="w-5 h-5 text-[color:var(--portal-primary)]" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{gallery.name}</p>
                          <p className="text-sm text-gray-500">{gallery.photoCount} photos</p>
                        </div>
                      </div>
                      <ExternalLink className="w-5 h-5 text-gray-400" />
                    </a>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-lg p-10 text-center">
                <Image className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No documents available yet.</p>
              </div>
            )}
          </>
        )}

        {activeTab === 'billing' && (
          <>
            {invoices.length > 0 ? (
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  <Receipt className="w-5 h-5 inline mr-2" />
                  Invoices & Payments
                </h3>

                {/* Payment Success Message */}
                {paymentSuccess && (
                  <div className="mb-4 p-4 bg-green-50 text-green-700 rounded-lg flex items-center">
                    <CheckCircle className="w-5 h-5 mr-2" />
                    Payment successful! Thank you.
                  </div>
                )}

                {/* Invoices List */}
                <div className="space-y-4">
                  {invoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="border border-gray-200 rounded-lg p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="font-semibold text-gray-900">
                            Invoice #{invoice.invoiceNumber}
                          </p>
                          <p className="text-sm text-gray-500">
                            {invoice.description || 'Project Invoice'}
                          </p>
                        </div>
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-medium ${
                            invoice.status === 'PAID'
                              ? 'bg-green-100 text-green-700'
                              : invoice.status === 'PARTIALLY_PAID'
                              ? 'bg-yellow-100 text-yellow-700'
                              : invoice.status === 'OVERDUE'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-[color:var(--portal-accent)]/20 text-[color:var(--portal-primary)]'
                          }`}
                        >
                          {invoice.status === 'PARTIALLY_PAID' ? 'Partial' : invoice.status}
                        </span>
                      </div>

                      {/* Invoice Details */}
                      <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                        <div>
                          <p className="text-gray-500">Issue Date</p>
                          <p className="font-medium">
                            {invoice.issueDate
                              ? new Date(invoice.issueDate).toLocaleDateString()
                              : '-'}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Due Date</p>
                          <p className="font-medium">
                            {invoice.dueDate
                              ? new Date(invoice.dueDate).toLocaleDateString()
                              : '-'}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Total Amount</p>
                          <p className="font-medium text-lg">
                            ${formatCurrency(invoice.total)}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Balance Due</p>
                          <p className={`font-bold text-lg ${invoice.balanceDue > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            ${formatCurrency(invoice.balanceDue)}
                          </p>
                        </div>
                      </div>

                      {/* Line Items (collapsible) */}
                      {invoice.lineItems && invoice.lineItems.length > 0 && (
                        <details className="mb-4">
                          <summary className="cursor-pointer text-sm text-[color:var(--portal-primary)] hover:text-[color:var(--portal-secondary)]">
                            View Details ({invoice.lineItems.length} items)
                          </summary>
                          <div className="mt-2 bg-gray-50 rounded p-3 text-sm">
                            {invoice.lineItems.map((item, idx) => (
                              <div key={idx} className="flex justify-between py-1 border-b border-gray-200 last:border-0">
                                <span className="text-gray-700">{item.description}</span>
                                <span className="font-medium">${formatCurrency(item.amount)}</span>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}

                      {/* Pay Button */}
                      {invoice.balanceDue > 0 && invoice.status !== 'PAID' && (
                        <button
                          onClick={() => setSelectedInvoice(invoice)}
                          className="w-full flex items-center justify-center px-4 py-3 bg-[color:var(--portal-secondary)] text-white rounded-lg hover:bg-[color:var(--portal-primary)] transition-colors font-medium"
                        >
                          <CreditCard className="w-5 h-5 mr-2" />
                          Pay ${formatCurrency(invoice.balanceDue)}
                        </button>
                      )}

                      {invoice.status === 'PAID' && (
                        <div className="flex items-center justify-center text-green-600 py-2">
                          <CheckCircle className="w-5 h-5 mr-2" />
                          Paid in Full
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Payment History */}
                {payments.length > 0 && (
                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <h4 className="font-medium text-gray-900 mb-3">Payment History</h4>
                    <div className="space-y-2">
                      {payments.map((payment) => (
                        <div
                          key={payment.id}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm"
                        >
                          <div className="flex items-center">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${
                              payment.status === 'COMPLETED' ? 'bg-green-100' : 'bg-yellow-100'
                            }`}>
                              {payment.status === 'COMPLETED' ? (
                                <CheckCircle className="w-4 h-4 text-green-600" />
                              ) : (
                                <Clock className="w-4 h-4 text-yellow-600" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">
                                ${formatCurrency(payment.amount)}
                              </p>
                              <p className="text-gray-500 text-xs">
                                {new Date(payment.createdAt).toLocaleDateString()} - {payment.method}
                              </p>
                            </div>
                          </div>
                          <span className={`px-2 py-1 rounded text-xs ${
                            payment.status === 'COMPLETED'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {payment.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-lg p-10 text-center">
                <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No invoices available yet.</p>
              </div>
            )}
          </>
        )}

        {activeTab === 'support' && (
          <>
            {resolvedProjectManager ? (
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Project Manager</h3>
                <div className="flex items-center mb-4">
                  <div className="w-14 h-14 bg-gradient-to-br from-[color:var(--portal-secondary)] to-[color:var(--portal-primary)] rounded-full flex items-center justify-center text-white text-xl font-bold mr-4">
                    {resolvedProjectManager.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .substring(0, 2)}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-lg">{resolvedProjectManager.name}</p>
                    <p className="text-gray-500">Project Manager</p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {resolvedProjectManager.phone && (
                    <a
                      href={`tel:${resolvedProjectManager.phone}`}
                      className="flex items-center p-3 bg-[color:var(--portal-secondary)]/10 text-[color:var(--portal-secondary)] rounded-lg hover:bg-[color:var(--portal-secondary)]/20 transition-colors"
                    >
                      <Phone className="w-5 h-5 mr-3" />
                      <span className="font-medium">{resolvedProjectManager.phone}</span>
                    </a>
                  )}
                  {resolvedProjectManager.email && (
                    <a
                      href={`mailto:${resolvedProjectManager.email}`}
                      className="flex items-center p-3 bg-[color:var(--portal-accent)]/20 text-[color:var(--portal-primary)] rounded-lg hover:bg-[color:var(--portal-accent)]/30 transition-colors"
                    >
                      <Mail className="w-5 h-5 mr-3" />
                      <span className="font-medium truncate">{resolvedProjectManager.email}</span>
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-lg p-10 text-center">
                <LifeBuoy className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">Your project manager details are not available yet.</p>
              </div>
            )}
          </>
        )}

        {activeTab === 'messages' && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              <MessageSquare className="w-5 h-5 inline mr-2" />
              Send a Message
            </h3>
            {messageSent && (
              <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg flex items-center">
                <CheckCircle className="w-5 h-5 mr-2" />
                Your message has been sent. We'll get back to you soon!
              </div>
            )}
            <form onSubmit={handleSendMessage}>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your message here..."
                rows={4}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[color:var(--portal-primary)] focus:border-transparent resize-none"
              />
              <div className="flex justify-end mt-4">
                <button
                  type="submit"
                  disabled={!message.trim() || isSending}
                  className="flex items-center px-6 py-3 bg-[color:var(--portal-primary)] text-white rounded-lg hover:bg-[color:var(--portal-secondary)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {isSending ? (
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  ) : (
                    <Send className="w-5 h-5 mr-2" />
                  )}
                  Send Message
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Stripe Payment Modal (Full Amount Only) */}
      <PayInvoiceModal
        isOpen={!!selectedInvoice}
        onClose={() => {
          setSelectedInvoice(null);
        }}
        invoice={selectedInvoice}
        opportunity={project}
        fullAmountOnly
        onSuccess={() => {
          const activeToken = portalToken || token;
          refreshBilling(activeToken);
          setPaymentSuccess(true);
          setTimeout(() => setPaymentSuccess(false), 5000);
        }}
      />

      {/* Booking Modal */}
      {showAppointments && showBookingModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                <CalendarPlus className="w-5 h-5 inline mr-2" />
                Book Appointment
              </h3>
              <button
                onClick={() => {
                  setShowBookingModal(false);
                  setBookingError(null);
                  setBookingSuccess(null);
                }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {bookingSuccess && (
              <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg flex items-center">
                <CheckCircle className="w-5 h-5 mr-2" />
                {bookingSuccess}
              </div>
            )}

            {bookingError && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg flex items-center">
                <AlertCircle className="w-5 h-5 mr-2" />
                {bookingError}
              </div>
            )}

            <form onSubmit={handleBookAppointment}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Date
                </label>
                <input
                  type="date"
                  value={bookingDate}
                  onChange={(e) => setBookingDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[color:var(--portal-primary)] focus:border-transparent"
                  required
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Time Slot
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {['08:00-10:00', '10:00-12:00', '12:00-14:00', '14:00-16:00'].map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setBookingTimeSlot(slot)}
                      className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                        bookingTimeSlot === slot
                          ? 'bg-[color:var(--portal-primary)] text-white border-[color:var(--portal-primary)]'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-[color:var(--portal-primary)]'
                      }`}
                    >
                      {slot.replace('-', ' - ')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Additional Notes (Optional)
                </label>
                <textarea
                  value={bookingNotes}
                  onChange={(e) => setBookingNotes(e.target.value)}
                  placeholder="Any special instructions for our team?"
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[color:var(--portal-primary)] focus:border-transparent resize-none"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowBookingModal(false);
                    setBookingError(null);
                    setBookingSuccess(null);
                  }}
                  className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !bookingDate || !bookingTimeSlot}
                  className="flex-1 flex items-center justify-center px-4 py-3 bg-[color:var(--portal-primary)] text-white rounded-lg hover:bg-[color:var(--portal-secondary)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <CalendarPlus className="w-5 h-5 mr-2" />
                      Book Appointment
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {showAppointments && showRescheduleModal && selectedAppointment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                <CalendarClock className="w-5 h-5 inline mr-2" />
                Reschedule Appointment
              </h3>
              <button
                onClick={() => {
                  setShowRescheduleModal(false);
                  setSelectedAppointment(null);
                  setBookingError(null);
                  setBookingSuccess(null);
                }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Current appointment info */}
            <div className="mb-4 p-3 bg-[color:var(--portal-accent)]/20 rounded-lg border border-[color:var(--portal-accent)]/30">
              <p className="text-sm text-[color:var(--portal-primary)] font-medium mb-1">
                Current Appointment:
              </p>
              <p className="text-gray-900">
                {selectedAppointment.subject || selectedAppointment.workType || 'Service Appointment'}
              </p>
              <p className="text-sm text-gray-600">
                {selectedAppointment.scheduledStart
                  ? new Date(selectedAppointment.scheduledStart).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
                  : 'Not yet scheduled'}
              </p>
            </div>

            {bookingSuccess && (
              <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg flex items-center">
                <CheckCircle className="w-5 h-5 mr-2" />
                {bookingSuccess}
              </div>
            )}

            {bookingError && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg flex items-center">
                <AlertCircle className="w-5 h-5 mr-2" />
                {bookingError}
              </div>
            )}

            <form onSubmit={handleRescheduleAppointment}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  New Date
                </label>
                <input
                  type="date"
                  value={bookingDate}
                  onChange={(e) => setBookingDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[color:var(--portal-primary)] focus:border-transparent"
                  required
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  New Time Slot
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {['08:00-10:00', '10:00-12:00', '12:00-14:00', '14:00-16:00'].map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setBookingTimeSlot(slot)}
                      className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                        bookingTimeSlot === slot
                          ? 'bg-[color:var(--portal-primary)] text-white border-[color:var(--portal-primary)]'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-[color:var(--portal-primary)]'
                      }`}
                    >
                      {slot.replace('-', ' - ')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for Rescheduling
                </label>
                <textarea
                  value={bookingNotes}
                  onChange={(e) => setBookingNotes(e.target.value)}
                  placeholder="Why do you need to reschedule?"
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[color:var(--portal-primary)] focus:border-transparent resize-none"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowRescheduleModal(false);
                    setSelectedAppointment(null);
                    setBookingError(null);
                    setBookingSuccess(null);
                  }}
                  className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !bookingDate || !bookingTimeSlot}
                  className="flex-1 flex items-center justify-center px-4 py-3 bg-[color:var(--portal-primary)] text-white rounded-lg hover:bg-[color:var(--portal-secondary)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <RefreshCw className="w-5 h-5 mr-2" />
                      Reschedule
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {showAppointments && showCancelModal && selectedAppointment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                <CalendarX className="w-5 h-5 inline mr-2 text-red-600" />
                Cancel Appointment
              </h3>
              <button
                onClick={() => {
                  setShowCancelModal(false);
                  setSelectedAppointment(null);
                  setBookingError(null);
                  setBookingSuccess(null);
                }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Appointment info */}
            <div className="mb-4 p-3 bg-red-50 rounded-lg border border-red-100">
              <p className="text-sm text-red-600 font-medium mb-1">
                You are about to cancel:
              </p>
              <p className="text-gray-900">
                {selectedAppointment.subject || selectedAppointment.workType || 'Service Appointment'}
              </p>
              <p className="text-sm text-gray-600">
                {selectedAppointment.scheduledStart
                  ? new Date(selectedAppointment.scheduledStart).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
                  : 'Not yet scheduled'}
              </p>
            </div>

            {bookingSuccess && (
              <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg flex items-center">
                <CheckCircle className="w-5 h-5 mr-2" />
                {bookingSuccess}
              </div>
            )}

            {bookingError && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg flex items-center">
                <AlertCircle className="w-5 h-5 mr-2" />
                {bookingError}
              </div>
            )}

            <form onSubmit={handleCancelAppointment}>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for Cancellation <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Please tell us why you need to cancel..."
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                  required
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCancelModal(false);
                    setSelectedAppointment(null);
                    setBookingError(null);
                    setBookingSuccess(null);
                  }}
                  className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Keep Appointment
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !cancelReason.trim()}
                  className="flex-1 flex items-center justify-center px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <CalendarX className="w-5 h-5 mr-2" />
                      Cancel Appointment
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
