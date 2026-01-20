import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Calendar, Clock, MapPin, User, Phone, Building2, ChevronLeft, ChevronRight, Plus,
  Users, Briefcase, Settings, RefreshCw, Filter, Search, X, Check, AlertCircle,
  Truck, Wrench, ClipboardList, PlayCircle, PauseCircle, CheckCircle, XCircle,
  Link2, Unlink, ChevronDown, MoreVertical, Edit2, Trash2, Eye, UserPlus,
  CalendarDays, LayoutGrid, List, Zap, Timer, Package, ShoppingCart, CheckSquare,
  FileText, Printer, Download, ExternalLink, Building, Route, Target, BarChart3,
  Gauge, TrendingUp, Sparkles, Navigation, Star
} from 'lucide-react';
import { scheduleApi } from '../services/api';

// ==========================================
// Google Calendar Client-Side Cache
// ==========================================
const GOOGLE_CALENDAR_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes client-side cache
const googleCalendarCache = new Map();

/**
 * Generate cache key for date range
 */
function getGoogleCalendarCacheKey(startDate, endDate) {
  const start = new Date(startDate).toISOString().split('T')[0];
  const end = new Date(endDate).toISOString().split('T')[0];
  return `${start}:${end}`;
}

/**
 * Get cached Google Calendar events or fetch fresh
 */
async function getCachedGoogleCalendarEvents(startDate, endDate) {
  const cacheKey = getGoogleCalendarCacheKey(startDate, endDate);
  const cached = googleCalendarCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < GOOGLE_CALENDAR_CACHE_TTL_MS) {
    console.log('[GoogleCalendar] Client cache HIT:', cacheKey);
    return { data: cached.data, fromClientCache: true };
  }

  console.log('[GoogleCalendar] Client cache MISS - fetching:', cacheKey);
  const data = await scheduleApi.getResourceCalendarEvents({
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  });

  // Store in client cache
  googleCalendarCache.set(cacheKey, {
    data,
    timestamp: Date.now(),
  });

  return { data, fromClientCache: false };
}

/**
 * Preload Google Calendar events for adjacent date ranges (background)
 */
function preloadGoogleCalendarEvents(currentStart, currentEnd, view) {
  // Don't block - run in background
  setTimeout(async () => {
    try {
      // Calculate next and previous ranges based on view
      const msPerDay = 24 * 60 * 60 * 1000;
      let rangeDays;
      if (view === 'day') rangeDays = 1;
      else if (view === 'week') rangeDays = 7;
      else rangeDays = 31; // month

      // Preload next range
      const nextStart = new Date(currentEnd.getTime() + msPerDay);
      const nextEnd = new Date(nextStart.getTime() + (rangeDays * msPerDay));
      const nextCacheKey = getGoogleCalendarCacheKey(nextStart, nextEnd);

      if (!googleCalendarCache.has(nextCacheKey)) {
        console.log('[GoogleCalendar] Preloading next range:', nextCacheKey);
        await getCachedGoogleCalendarEvents(nextStart, nextEnd);
      }

      // Preload previous range
      const prevEnd = new Date(currentStart.getTime() - msPerDay);
      const prevStart = new Date(prevEnd.getTime() - (rangeDays * msPerDay));
      const prevCacheKey = getGoogleCalendarCacheKey(prevStart, prevEnd);

      if (!googleCalendarCache.has(prevCacheKey)) {
        console.log('[GoogleCalendar] Preloading previous range:', prevCacheKey);
        await getCachedGoogleCalendarEvents(prevStart, prevEnd);
      }
    } catch (e) {
      console.warn('[GoogleCalendar] Preload failed (non-critical):', e);
    }
  }, 500); // Slight delay to prioritize current view loading
}

// Status colors for appointments (FSL-style: Yellow=Scheduled, Blue=Dispatched, Green=In Progress/Complete, Red=Cannot Complete)
const appointmentStatusColors = {
  NONE: 'bg-gray-100 text-gray-700 border-gray-200',
  SCHEDULED: 'bg-yellow-100 text-yellow-700 border-yellow-300',  // Yellow - Confirmed but not dispatched
  DISPATCHED: 'bg-blue-100 text-blue-700 border-blue-300',       // Blue - Sent to crew
  IN_PROGRESS: 'bg-green-100 text-green-700 border-green-300',   // Green - Crew working on it
  COMPLETED: 'bg-emerald-100 text-emerald-700 border-emerald-300', // Dark Green - Finished
  CANNOT_COMPLETE: 'bg-red-100 text-red-700 border-red-300',     // Red - Issue encountered
  CANCELED: 'bg-gray-200 text-gray-600 border-gray-300',
};

const appointmentStatusIcons = {
  NONE: Clock,
  SCHEDULED: Calendar,
  DISPATCHED: Truck,
  IN_PROGRESS: PlayCircle,
  COMPLETED: CheckCircle,
  CANNOT_COMPLETE: XCircle,
  CANCELED: X,
};

// Status colors for work orders
const workOrderStatusColors = {
  NEW: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
  ON_HOLD: 'bg-orange-100 text-orange-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CLOSED: 'bg-gray-100 text-gray-600',
  CANCELED: 'bg-red-100 text-red-700',
};

// Work type colors
const workTypeColors = {
  'Inspection': 'bg-blue-500',
  'Installation': 'bg-green-500',
  'Repair': 'bg-orange-500',
  'Walkthrough': 'bg-purple-500',
  'Estimate': 'bg-yellow-500',
  'Roofing': 'bg-red-500',
  'Siding': 'bg-teal-500',
  'Gutters': 'bg-cyan-500',
  'Solar': 'bg-amber-500',
  'Interior': 'bg-pink-500',
  // Insurance-specific work types
  'Contract Signing': 'bg-indigo-500',
  'Contract': 'bg-indigo-500',
  'Adjuster Meeting': 'bg-violet-500',
  'Adjustment': 'bg-violet-500',
  'ATR': 'bg-fuchsia-500', // Attempt to Repair
  'Spec': 'bg-rose-500',
  'Supplement': 'bg-emerald-500',
  'default': 'bg-gray-500',
};

// Material order status colors (W/O/D)
const materialStatusColors = {
  WAITING: 'bg-gray-100 text-gray-700 border-gray-300',
  ORDERED: 'bg-blue-100 text-blue-700 border-blue-300',
  DELIVERED: 'bg-green-100 text-green-700 border-green-300',
  CANCELLED: 'bg-red-100 text-red-700 border-red-300',
};

// Material status indicator (W/O/D pill)
const materialStatusIndicator = {
  WAITING: { letter: 'W', bg: 'bg-gray-200', text: 'text-gray-600' },
  ORDERED: { letter: 'O', bg: 'bg-blue-500', text: 'text-white' },
  DELIVERED: { letter: 'D', bg: 'bg-green-500', text: 'text-white' },
  CANCELLED: { letter: 'X', bg: 'bg-red-500', text: 'text-white' },
};

// Crew colors for calendar view (assign different colors to crews)
const crewColors = [
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-teal-500',
  'bg-indigo-500',
  'bg-amber-500',
  'bg-cyan-500',
  'bg-rose-500',
];

export default function Schedule() {
  // Main tab state
  const [activeTab, setActiveTab] = useState('calendar');

  // Calendar state
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState('week');
  const [appointments, setAppointments] = useState([]);
  const [selectedAppointment, setSelectedAppointment] = useState(null);

  // Dispatch board state
  const [dispatchData, setDispatchData] = useState({ resources: [], appointments: [] });
  const [dispatchDate, setDispatchDate] = useState(new Date());

  // Resources state
  const [resources, setResources] = useState([]);
  const [selectedResource, setSelectedResource] = useState(null);
  const [resourceAbsences, setResourceAbsences] = useState([]);

  // Work orders state
  const [workOrders, setWorkOrders] = useState([]);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [workOrderFilter, setWorkOrderFilter] = useState('all');

  // Work types
  const [workTypes, setWorkTypes] = useState([]);

  // Material orders state (AccuLynx-style Order Manager)
  const [materialOrders, setMaterialOrders] = useState([]);
  const [materialOrderCounts, setMaterialOrderCounts] = useState({ WAITING: 0, ORDERED: 0, DELIVERED: 0, CANCELLED: 0 });
  const [materialStatusFilter, setMaterialStatusFilter] = useState('WAITING'); // W/O/D tabs
  const [materialSupplierFilter, setMaterialSupplierFilter] = useState(''); // Filter by supplier
  const [selectedMaterialOrders, setSelectedMaterialOrders] = useState([]); // Multi-select for bulk actions
  const [selectedMaterialOrder, setSelectedMaterialOrder] = useState(null);
  const [suppliers, setSuppliers] = useState([]);

  // Crew Scheduler state (Gantt-style view)
  const [crewSchedulerDate, setCrewSchedulerDate] = useState(new Date());
  const [crewSchedulerView, setCrewSchedulerView] = useState('week'); // 'day', 'week', '2week'
  const [ganttMode, setGanttMode] = useState('daily'); // 'daily' (week overview) or 'hourly' (FSL-style single day)
  const [crewSchedulerData, setCrewSchedulerData] = useState([]); // Crews with their appointments
  const [toBeScheduledQueue, setToBeScheduledQueue] = useState([]); // Unscheduled jobs queue
  const [unscheduledCount, setUnscheduledCount] = useState(0);

  // Google Calendar integration state
  const [googleCalendarEvents, setGoogleCalendarEvents] = useState([]); // Events from Google Calendar
  const [showGoogleCalendarEvents, setShowGoogleCalendarEvents] = useState(true); // Toggle visibility
  const [googleCalendarResourceSummary, setGoogleCalendarResourceSummary] = useState([]); // Which resources have calendar synced
  const [googleCalendarCacheInfo, setGoogleCalendarCacheInfo] = useState(null); // Backend cache stats

  // Production Agenda state
  const [agendaDate, setAgendaDate] = useState(new Date());
  const [productionAgendaData, setProductionAgendaData] = useState([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showNewAppointmentModal, setShowNewAppointmentModal] = useState(false);
  const [showNewWorkOrderModal, setShowNewWorkOrderModal] = useState(false);
  const [showResourceModal, setShowResourceModal] = useState(false);
  const [showNewMaterialOrderModal, setShowNewMaterialOrderModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Crew Scheduler filters and modal state
  const [showJobDetailModal, setShowJobDetailModal] = useState(false);
  const [selectedJobForDetail, setSelectedJobForDetail] = useState(null);
  const [schedulerTerritoryFilter, setSchedulerTerritoryFilter] = useState('');
  const [schedulerSkillFilter, setSchedulerSkillFilter] = useState('');
  const [schedulerCrewFilter, setSchedulerCrewFilter] = useState('');
  const [schedulerPolicyFilter, setSchedulerPolicyFilter] = useState('');
  const [territories, setTerritories] = useState([]);
  const [skills, setSkills] = useState([]);
  const [schedulingPolicies, setSchedulingPolicies] = useState([]);
  const [scheduling, setScheduling] = useState(false);
  const [showTerritorySidebar, setShowTerritorySidebar] = useState(true);
  const [selectedTerritories, setSelectedTerritories] = useState(new Set()); // Multi-select territories

  // FSL-equivalent scheduling state
  const [resourceUtilization, setResourceUtilization] = useState({}); // { resourceId: { utilization, hoursScheduled, hoursAvailable } }
  const [teamCapacity, setTeamCapacity] = useState(null);
  const [optimizingRoute, setOptimizingRoute] = useState(false);
  const [showCapacityPanel, setShowCapacityPanel] = useState(false);
  const [bestResourcesForJob, setBestResourcesForJob] = useState([]);
  const [showBestResourcesModal, setShowBestResourcesModal] = useState(false);
  const [selectedJobForBestResources, setSelectedJobForBestResources] = useState(null);

  // Find Availability flow state (FSL-style slot picker)
  const [showFindAvailabilityModal, setShowFindAvailabilityModal] = useState(false);
  const [selectedJobForAvailability, setSelectedJobForAvailability] = useState(null);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);

  // Confirmations queue state (appointments ready to be dispatched)
  const [confirmationsQueue, setConfirmationsQueue] = useState([]);
  const [showConfirmationsFilter, setShowConfirmationsFilter] = useState(false);

  // Load data based on active tab
  useEffect(() => {
    loadData();
  }, [activeTab, currentDate, dispatchDate, workOrderFilter, materialStatusFilter, crewSchedulerDate, agendaDate]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Always load work types and resources
      const typesData = await scheduleApi.getWorkTypes();
      setWorkTypes(typesData || []);

      switch (activeTab) {
        case 'calendar':
          await loadCalendarData();
          break;
        case 'dispatch':
          await loadDispatchData();
          break;
        case 'resources':
          await loadResourcesData();
          break;
        case 'workorders':
          await loadWorkOrdersData();
          break;
        case 'orders':
          await loadMaterialOrdersData();
          break;
        case 'scheduler':
          await loadCrewSchedulerData();
          break;
        case 'agenda':
          await loadProductionAgendaData();
          break;
      }
    } catch (err) {
      console.error('Error loading data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadCalendarData = async () => {
    const startDate = getWeekStart(currentDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + (calendarView === 'day' ? 1 : calendarView === 'week' ? 7 : 31));

    const data = await scheduleApi.getServiceAppointments({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });
    setAppointments(data?.data || data?.appointments || []);

    // Also load Google Calendar events for display in calendar view (with client-side caching)
    try {
      const { data: googleCalendarData, fromClientCache } = await getCachedGoogleCalendarEvents(startDate, endDate);

      if (googleCalendarData?.success && googleCalendarData?.data) {
        setGoogleCalendarEvents(googleCalendarData.data.events || []);
        setGoogleCalendarResourceSummary(googleCalendarData.data.resources || []);
        setGoogleCalendarCacheInfo({
          ...googleCalendarData.data.cacheInfo,
          fromClientCache,
        });

        // Preload adjacent date ranges in background
        preloadGoogleCalendarEvents(startDate, endDate, calendarView);
      }
    } catch (e) {
      console.warn('Could not load Google Calendar events:', e);
      // Continue without calendar events - not a critical error
    }
  };

  const loadDispatchData = async () => {
    const data = await scheduleApi.getDispatchBoard({
      date: dispatchDate.toISOString().split('T')[0],
    });
    setDispatchData(data || { resources: [], appointments: [] });
  };

  const loadResourcesData = async () => {
    const data = await scheduleApi.getResources();
    setResources(data?.data || data?.resources || []);
  };

  const loadWorkOrdersData = async () => {
    const params = workOrderFilter !== 'all' ? { status: workOrderFilter } : {};
    const data = await scheduleApi.getWorkOrders(params);
    setWorkOrders(data?.data || data?.workOrders || []);
  };

  // Load Material Orders (Order Manager)
  const loadMaterialOrdersData = async () => {
    try {
      // Load counts for all tabs
      const countsData = await scheduleApi.getMaterialOrderCounts();
      setMaterialOrderCounts(countsData.counts || { WAITING: 0, ORDERED: 0, DELIVERED: 0, CANCELLED: 0 });

      // Load orders for current tab
      const ordersData = await scheduleApi.getMaterialOrders({ status: materialStatusFilter });
      setMaterialOrders(ordersData?.data || []);

      // Load suppliers
      const suppliersData = await scheduleApi.getSuppliers();
      setSuppliers(suppliersData?.data || []);
    } catch (err) {
      console.error('Error loading material orders:', err);
    }
  };

  // Load Crew Scheduler data (AccuLynx-style Gantt view)
  const loadCrewSchedulerData = async () => {
    try {
      // Load resources (crews)
      const resourcesData = await scheduleApi.getResources();
      const crews = resourcesData?.data || resourcesData?.resources || [];
      setResources(crews);

      // Load territories for filtering
      try {
        const territoriesData = await scheduleApi.getTerritories();
        setTerritories(territoriesData?.data || []);
      } catch (e) {
        console.warn('Could not load territories:', e);
        setTerritories([]);
      }

      // Load skills from API
      try {
        const skillsData = await scheduleApi.getSkills();
        setSkills(skillsData?.data || []);
      } catch (e) {
        console.warn('Could not load skills:', e);
        // Fallback: Extract unique skills from resources
        const uniqueSkills = new Set();
        crews.forEach(crew => {
          crew.skills?.forEach(skill => {
            if (skill.skill?.name) uniqueSkills.add(skill.skill.name);
          });
        });
        setSkills(Array.from(uniqueSkills).sort().map(name => ({ id: name, name })));
      }

      // Load scheduling policies
      try {
        const policiesData = await scheduleApi.getSchedulingPolicies();
        setSchedulingPolicies(policiesData?.data || []);
      } catch (e) {
        console.warn('Could not load scheduling policies:', e);
        setSchedulingPolicies([]);
      }

      // Calculate date range based on view
      const startDate = getWeekStart(crewSchedulerDate);
      const endDate = new Date(startDate);
      if (crewSchedulerView === 'day') {
        endDate.setDate(endDate.getDate() + 1);
      } else if (crewSchedulerView === 'week') {
        endDate.setDate(endDate.getDate() + 7);
      } else {
        endDate.setDate(endDate.getDate() + 14);
      }

      // Load appointments for date range
      const appointmentsData = await scheduleApi.getServiceAppointments({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });
      const allAppointments = appointmentsData?.data || appointmentsData?.appointments || [];
      setAppointments(allAppointments);

      // Build crew scheduler data - map appointments to their assigned resources
      const crewData = crews.map(crew => ({
        ...crew,
        appointments: allAppointments.filter(apt =>
          apt.assignedResources?.some(ar => ar.serviceResourceId === crew.id)
        ),
      }));
      setCrewSchedulerData(crewData);

      // Load unscheduled jobs (work orders without appointments or appointments with status NONE)
      const unscheduledData = await scheduleApi.getServiceAppointments({
        status: 'NONE',
      });
      const unscheduledJobs = unscheduledData?.data || [];
      setToBeScheduledQueue(unscheduledJobs);
      setUnscheduledCount(unscheduledJobs.length);

      // Load material orders for calendar overlay
      const materialData = await scheduleApi.getMaterialOrdersForCalendar(
        startDate.toISOString(),
        endDate.toISOString()
      );
      setMaterialOrders(materialData?.data || []);

      // Load Google Calendar events for service resources
      try {
        const googleCalendarData = await scheduleApi.getResourceCalendarEvents({
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        });

        if (googleCalendarData?.success && googleCalendarData?.data) {
          const calendarEvents = googleCalendarData.data.events || [];
          const resourceSummary = googleCalendarData.data.resources || [];

          setGoogleCalendarEvents(calendarEvents);
          setGoogleCalendarResourceSummary(resourceSummary);

          // Merge Google Calendar events with crew data
          const crewDataWithCalendar = crews.map(crew => {
            const crewAppointments = allAppointments.filter(apt =>
              apt.assignedResources?.some(ar => ar.serviceResourceId === crew.id)
            );

            // Get Google Calendar events for this resource
            const crewCalendarEvents = calendarEvents.filter(evt => evt.resourceId === crew.id);

            return {
              ...crew,
              appointments: crewAppointments,
              googleCalendarEvents: crewCalendarEvents,
              hasGoogleCalendar: resourceSummary.some(r => r.resourceId === crew.id),
            };
          });

          setCrewSchedulerData(crewDataWithCalendar);
        }
      } catch (e) {
        console.warn('Could not load Google Calendar events:', e);
        // Continue without calendar events - not a critical error
      }
    } catch (err) {
      console.error('Error loading crew scheduler data:', err);
    }
  };

  // Load Production Agenda data
  const loadProductionAgendaData = async () => {
    try {
      const startOfDay = new Date(agendaDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(agendaDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Load appointments for the day sorted by time
      const appointmentsData = await scheduleApi.getServiceAppointments({
        startDate: startOfDay.toISOString(),
        endDate: endOfDay.toISOString(),
        sortBy: 'scheduledStart',
        sortOrder: 'asc',
      });
      const dayAppointments = appointmentsData?.data || appointmentsData?.appointments || [];
      setProductionAgendaData(dayAppointments);
      setAppointments(dayAppointments);

      // Load resources for crew info
      const resourcesData = await scheduleApi.getResources();
      setResources(resourcesData?.data || resourcesData?.resources || []);

      // Load material orders for delivery info
      const materialData = await scheduleApi.getMaterialOrdersForCalendar(
        startOfDay.toISOString(),
        endOfDay.toISOString()
      );
      setMaterialOrders(materialData?.data || []);
    } catch (err) {
      console.error('Error loading production agenda:', err);
    }
  };

  // Handle material order status change
  const handleUpdateMaterialStatus = async (orderId, newStatus) => {
    try {
      await scheduleApi.updateMaterialOrderStatus(orderId, newStatus);
      await loadMaterialOrdersData();
    } catch (err) {
      setError(err.message || 'Failed to update status');
    }
  };

  // Handle bulk material status update
  const handleBulkUpdateStatus = async (newStatus) => {
    if (selectedMaterialOrders.length === 0) return;
    try {
      await scheduleApi.bulkUpdateMaterialOrderStatus(selectedMaterialOrders, newStatus);
      setSelectedMaterialOrders([]);
      await loadMaterialOrdersData();
    } catch (err) {
      setError(err.message || 'Failed to bulk update');
    }
  };

  // Handle submit to ABC Supply
  const handleSubmitToAbc = async (orderId) => {
    try {
      await scheduleApi.submitToAbcSupply(orderId);
      await loadMaterialOrdersData();
    } catch (err) {
      setError(err.message || 'Failed to submit to ABC Supply');
    }
  };

  // Date helpers
  const getWeekStart = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const getWeekDates = (date) => {
    const week = [];
    const startOfWeek = getWeekStart(date);
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      week.push(d);
    }
    return week;
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatDateFull = (date) => {
    return new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  const formatTime = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const isToday = (date) => {
    return new Date(date).toDateString() === new Date().toDateString();
  };

  const getAppointmentsForDate = (date) => {
    return appointments.filter(apt => {
      const aptDate = new Date(apt.scheduledStart || apt.earliestStart);
      return aptDate.toDateString() === date.toDateString();
    });
  };

  // Get Google Calendar events for a specific date
  const getCalendarEventsForDate = (date) => {
    if (!showGoogleCalendarEvents) return [];
    return googleCalendarEvents.filter(evt => {
      const evtDate = new Date(evt.start);
      return evtDate.toDateString() === date.toDateString();
    });
  };

  // Navigation
  const goToPrevious = () => {
    const newDate = new Date(currentDate);
    if (calendarView === 'day') newDate.setDate(newDate.getDate() - 1);
    else if (calendarView === 'week') newDate.setDate(newDate.getDate() - 7);
    else newDate.setMonth(newDate.getMonth() - 1);
    setCurrentDate(newDate);
  };

  const goToNext = () => {
    const newDate = new Date(currentDate);
    if (calendarView === 'day') newDate.setDate(newDate.getDate() + 1);
    else if (calendarView === 'week') newDate.setDate(newDate.getDate() + 7);
    else newDate.setMonth(newDate.getMonth() + 1);
    setCurrentDate(newDate);
  };

  // Auto-schedule appointment
  const handleAutoSchedule = async (appointmentId) => {
    try {
      setLoading(true);
      await scheduleApi.autoScheduleAppointment({ appointmentId });
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to auto-schedule');
    } finally {
      setLoading(false);
    }
  };

  // Smart auto-schedule with policy selection (FSL-equivalent)
  const handleSmartAutoSchedule = async (appointmentId, policyId = null) => {
    try {
      setScheduling(true);
      const policy = policyId || schedulerPolicyFilter || null;
      const result = await scheduleApi.smartAutoSchedule(appointmentId, policy);
      if (result.success) {
        await loadData();
      } else {
        setError(result.message || 'Failed to find available slot');
      }
    } catch (err) {
      setError(err.message || 'Failed to smart auto-schedule');
    } finally {
      setScheduling(false);
    }
  };

  // Batch smart schedule unscheduled jobs
  const handleBatchSmartSchedule = async () => {
    if (toBeScheduledQueue.length === 0) return;
    try {
      setScheduling(true);
      const appointmentIds = toBeScheduledQueue.slice(0, 10).map(j => j.id); // Limit to 10 at a time
      const policy = schedulerPolicyFilter || null;
      const result = await scheduleApi.batchSmartSchedule(appointmentIds, policy);
      if (result.data) {
        const scheduled = result.data.filter(r => r.success).length;
        const failed = result.data.filter(r => !r.success).length;
        if (failed > 0) {
          setError(`Scheduled ${scheduled} jobs. ${failed} could not be scheduled.`);
        }
        await loadData();
      }
    } catch (err) {
      setError(err.message || 'Failed to batch schedule');
    } finally {
      setScheduling(false);
    }
  };

  // Find best resources for a job
  const handleFindBestResources = async (job) => {
    try {
      setSelectedJobForBestResources(job);
      const result = await scheduleApi.findBestResources(job.id, {
        policyId: schedulerPolicyFilter || null,
        limit: 5,
      });
      setBestResourcesForJob(result.data || []);
      setShowBestResourcesModal(true);
    } catch (err) {
      setError(err.message || 'Failed to find best resources');
    }
  };

  // Find available time slots for a resource (FSL Find Availability flow)
  const handleFindAvailability = async (job, resourceId = null) => {
    try {
      setLoadingSlots(true);
      setSelectedJobForAvailability(job);
      setShowFindAvailabilityModal(true);
      setAvailableSlots([]);
      setSelectedSlot(null);

      // Calculate date range: from tomorrow to 30 days out
      const earliestStart = new Date();
      earliestStart.setDate(earliestStart.getDate() + 1);
      earliestStart.setHours(0, 0, 0, 0);

      const dueDate = new Date(earliestStart);
      dueDate.setDate(dueDate.getDate() + 30);

      // Get estimated duration from work type or default to 4 hours
      const duration = job.workOrder?.workType?.estimatedDuration || 240;

      // If a specific resource is selected, find slots for that resource
      // Otherwise, find slots for all available resources and aggregate
      if (resourceId) {
        const result = await scheduleApi.findAvailableSlots({
          resourceId,
          earliestStart: earliestStart.toISOString(),
          dueDate: dueDate.toISOString(),
          duration,
          maxSlots: 20,
        });
        setAvailableSlots(result.slots || []);
      } else {
        // Find best resources first, then get their available slots
        const bestResources = await scheduleApi.findBestResources(job.id, {
          policyId: schedulerPolicyFilter || null,
          limit: 3,
        });

        const allSlots = [];
        for (const resource of (bestResources.data || []).slice(0, 3)) {
          try {
            const result = await scheduleApi.findAvailableSlots({
              resourceId: resource.id,
              earliestStart: earliestStart.toISOString(),
              dueDate: dueDate.toISOString(),
              duration,
              maxSlots: 10,
            });
            const slotsWithResource = (result.slots || []).map(slot => ({
              ...slot,
              resourceId: resource.id,
              resourceName: resource.name,
              resourceScore: resource.score,
            }));
            allSlots.push(...slotsWithResource);
          } catch (e) {
            console.warn(`Could not get slots for ${resource.name}:`, e);
          }
        }

        // Sort by date/time
        allSlots.sort((a, b) => new Date(a.start) - new Date(b.start));
        setAvailableSlots(allSlots);
      }
    } catch (err) {
      setError(err.message || 'Failed to find available slots');
    } finally {
      setLoadingSlots(false);
    }
  };

  // Book an appointment on a selected slot
  const handleBookSlot = async (slot) => {
    setScheduling(true);
    try {
      const job = selectedJobForAvailability;

      // Update the appointment with scheduled times and status
      await scheduleApi.updateServiceAppointment(job.id, {
        scheduledStart: slot.start,
        scheduledEnd: slot.end,
        status: 'SCHEDULED',
      });

      // Assign the resource to the appointment
      if (slot.resourceId) {
        await scheduleApi.assignResource(job.id, slot.resourceId, true);
      }

      // Close modal and reload data
      setShowFindAvailabilityModal(false);
      setSelectedJobForAvailability(null);
      setAvailableSlots([]);
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to book appointment');
    } finally {
      setScheduling(false);
    }
  };

  // Dispatch an appointment (change status from SCHEDULED to DISPATCHED)
  const handleDispatchAppointment = async (appointmentId) => {
    try {
      await scheduleApi.updateServiceAppointment(appointmentId, {
        status: 'DISPATCHED',
      });
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to dispatch appointment');
    }
  };

  // Load Confirmations queue (SCHEDULED appointments ready for dispatch)
  const loadConfirmationsQueue = async () => {
    try {
      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 7);

      const data = await scheduleApi.getServiceAppointments({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        status: 'SCHEDULED',
      });

      // Sort by scheduled start time
      const scheduled = (data?.data || data?.appointments || []).sort((a, b) =>
        new Date(a.scheduledStart) - new Date(b.scheduledStart)
      );
      setConfirmationsQueue(scheduled);
    } catch (err) {
      console.error('Error loading confirmations queue:', err);
    }
  };

  // Optimize route for a resource
  const handleOptimizeRoute = async (resourceId, date) => {
    try {
      setOptimizingRoute(true);
      const result = await scheduleApi.optimizeResourceRoute(resourceId, date.toISOString());
      if (result.success) {
        await loadData();
      } else {
        setError(result.message || 'Failed to optimize route');
      }
    } catch (err) {
      setError(err.message || 'Failed to optimize route');
    } finally {
      setOptimizingRoute(false);
    }
  };

  // Load resource utilization for visible crews
  const loadResourceUtilization = async (crews) => {
    const utilData = {};
    const dateStr = currentDate.toISOString().split('T')[0];
    for (const crew of crews.slice(0, 20)) { // Limit to avoid too many API calls
      try {
        const result = await scheduleApi.getResourceUtilization(crew.id, { date: dateStr });
        if (result.data) {
          utilData[crew.id] = result.data;
        }
      } catch (e) {
        console.warn(`Could not load utilization for ${crew.name}:`, e);
      }
    }
    setResourceUtilization(utilData);
  };

  // Load team capacity for selected territory
  const loadTeamCapacity = async (territoryId) => {
    try {
      const startDate = getWeekStart(currentDate);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 7);
      const result = await scheduleApi.getTeamCapacity(territoryId, {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });
      setTeamCapacity(result.data || null);
    } catch (err) {
      console.warn('Could not load team capacity:', err);
    }
  };

  // Update appointment status
  const handleUpdateStatus = async (appointmentId, status) => {
    try {
      await scheduleApi.updateAppointmentStatus(appointmentId, status);
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to update status');
    }
  };

  // Assign resource to appointment
  const handleAssignResource = async (appointmentId, resourceId) => {
    try {
      await scheduleApi.assignResource(appointmentId, resourceId, true);
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to assign resource');
    }
  };

  // Connect Google Calendar
  const handleConnectGoogleCalendar = async (resourceId) => {
    try {
      const { authUrl } = await scheduleApi.getGoogleAuthUrl(resourceId);
      window.open(authUrl, '_blank', 'width=600,height=700');
    } catch (err) {
      setError(err.message || 'Failed to get Google Calendar auth URL');
    }
  };

  // Sync to Google Calendar
  const handleSyncToGoogle = async (resourceId) => {
    try {
      await scheduleApi.syncToGoogleCalendar(resourceId);
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to sync to Google Calendar');
    }
  };

  // Schedule job to a crew on a specific date (drag-and-drop handler)
  const handleScheduleJob = async (jobId, crewId, targetDate) => {
    setScheduling(true);
    setError(null);
    try {
      // Set scheduled start to 8 AM on the target date
      const scheduledStart = new Date(targetDate);
      scheduledStart.setHours(8, 0, 0, 0);

      // Set scheduled end based on estimated duration or default 4 hours
      const job = toBeScheduledQueue.find(j => j.id === jobId);
      const durationMinutes = job?.workOrder?.workType?.estimatedDuration || 240;
      const scheduledEnd = new Date(scheduledStart);
      scheduledEnd.setMinutes(scheduledEnd.getMinutes() + durationMinutes);

      // Update the appointment with scheduled times and status
      await scheduleApi.updateServiceAppointment(jobId, {
        scheduledStart: scheduledStart.toISOString(),
        scheduledEnd: scheduledEnd.toISOString(),
        status: 'SCHEDULED',
      });

      // Assign the resource to the appointment
      await scheduleApi.assignResource(jobId, crewId, true);

      // Reload data to refresh the view
      await loadData();
    } catch (err) {
      console.error('Error scheduling job:', err);
      setError(err.message || 'Failed to schedule job');
    } finally {
      setScheduling(false);
    }
  };

  // Open job detail modal
  const handleOpenJobDetail = (job) => {
    setSelectedJobForDetail(job);
    setShowJobDetailModal(true);
  };

  // Close job detail modal
  const handleCloseJobDetail = () => {
    setShowJobDetailModal(false);
    setSelectedJobForDetail(null);
  };

  // Filter crews based on selected filters
  const getFilteredCrews = () => {
    let filtered = crewSchedulerData;

    // Filter by crew name search
    if (schedulerCrewFilter) {
      filtered = filtered.filter(crew =>
        crew.name?.toLowerCase().includes(schedulerCrewFilter.toLowerCase())
      );
    }

    // Filter by territory (sidebar multi-select or dropdown single-select)
    if (selectedTerritories.size > 0) {
      filtered = filtered.filter(crew =>
        crew.territoryMembers?.some(tm => selectedTerritories.has(tm.territory?.name))
      );
    } else if (schedulerTerritoryFilter) {
      filtered = filtered.filter(crew =>
        crew.territoryMembers?.some(tm => tm.territory?.name === schedulerTerritoryFilter)
      );
    }

    // Filter by skill
    if (schedulerSkillFilter) {
      filtered = filtered.filter(crew =>
        crew.skills?.some(s => s.skill?.name === schedulerSkillFilter)
      );
    }

    return filtered;
  };

  // Toggle territory selection in sidebar
  const toggleTerritorySelection = (territoryName) => {
    const newSelected = new Set(selectedTerritories);
    if (newSelected.has(territoryName)) {
      newSelected.delete(territoryName);
    } else {
      newSelected.add(territoryName);
    }
    setSelectedTerritories(newSelected);
    // Clear the dropdown filter when using sidebar
    setSchedulerTerritoryFilter('');
  };

  // Select/deselect all territories
  const toggleAllTerritories = () => {
    if (selectedTerritories.size === territories.length) {
      setSelectedTerritories(new Set());
    } else {
      setSelectedTerritories(new Set(territories.map(t => t.name)));
    }
  };

  const weekDates = getWeekDates(currentDate);

  // Tab content components
  const renderCalendarTab = () => (
    <div className="space-y-4">
      {/* Calendar Controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center space-x-4">
            <button onClick={goToPrevious} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <button onClick={goToNext} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
            <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
              Today
            </button>
            <h2 className="text-lg font-semibold text-gray-900">
              {calendarView === 'day' && formatDateFull(currentDate)}
              {calendarView === 'week' && `${formatDate(weekDates[0])} - ${formatDate(weekDates[6])}`}
              {calendarView === 'month' && currentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
            </h2>
          </div>
          <div className="flex items-center space-x-4">
            <button onClick={() => setShowNewAppointmentModal(true)} className="inline-flex items-center px-3 py-1.5 bg-panda-primary text-white text-sm rounded-lg hover:bg-panda-primary/90">
              <Plus className="w-4 h-4 mr-1" />
              New
            </button>
            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              {['day', 'week', 'month'].map((v) => (
                <button
                  key={v}
                  onClick={() => setCalendarView(v)}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors capitalize ${
                    calendarView === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Week View */}
      {calendarView === 'week' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-gray-200">
            {weekDates.map((date, index) => (
              <div key={index} className={`py-3 px-2 text-center border-r border-gray-200 last:border-r-0 ${isToday(date) ? 'bg-panda-primary/5' : ''}`}>
                <div className="text-xs font-medium text-gray-500 uppercase">
                  {date.toLocaleDateString('en-US', { weekday: 'short' })}
                </div>
                <div className={`text-lg font-semibold mt-1 ${isToday(date) ? 'text-panda-primary' : 'text-gray-900'}`}>
                  {date.getDate()}
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 min-h-[500px]">
            {weekDates.map((date, index) => {
              const dayAppointments = getAppointmentsForDate(date);
              const dayCalendarEvents = getCalendarEventsForDate(date);
              return (
                <div key={index} className={`border-r border-gray-200 last:border-r-0 p-2 ${isToday(date) ? 'bg-panda-primary/5' : ''}`}>
                  {dayAppointments.map((apt) => (
                    <AppointmentCard
                      key={apt.id}
                      appointment={apt}
                      compact
                      onClick={() => setSelectedAppointment(apt)}
                      workTypes={workTypes}
                    />
                  ))}
                  {/* Google Calendar Events */}
                  {dayCalendarEvents.map((event) => (
                    <div
                      key={event.id}
                      className="p-2 mb-1 rounded text-xs border-l-4 bg-red-50 border-red-400 cursor-default"
                      title={`Google Calendar: ${event.title}\n${event.resourceName || ''}\n${event.location || ''}`}
                    >
                      <div className="flex items-center space-x-1">
                        <Calendar className="w-3 h-3 text-red-500 flex-shrink-0" />
                        <span className="font-medium text-red-700 truncate">{event.title || 'Busy'}</span>
                      </div>
                      <div className="text-red-600 mt-0.5">
                        {new Date(event.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        {event.resourceName && <span className="ml-1 text-gray-500">• {event.resourceName}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Day View */}
      {calendarView === 'day' && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">{formatDateFull(currentDate)}</h3>
          </div>
          <div className="divide-y divide-gray-200">
            {getAppointmentsForDate(currentDate).length === 0 && getCalendarEventsForDate(currentDate).length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Calendar className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                <p>No appointments scheduled for this day</p>
              </div>
            ) : (
              <>
                {getAppointmentsForDate(currentDate).map((apt) => (
                  <AppointmentCard
                    key={apt.id}
                    appointment={apt}
                    expanded
                    onClick={() => setSelectedAppointment(apt)}
                    onUpdateStatus={handleUpdateStatus}
                    onAutoSchedule={handleAutoSchedule}
                    workTypes={workTypes}
                  />
                ))}
                {/* Google Calendar Events in Day View */}
                {getCalendarEventsForDate(currentDate).map((event) => (
                  <div
                    key={event.id}
                    className="p-4 border-l-4 bg-red-50 border-red-400"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <Calendar className="w-5 h-5 text-red-500" />
                        <div>
                          <h4 className="font-medium text-red-700">{event.title || 'Busy'}</h4>
                          <p className="text-sm text-red-600">
                            {new Date(event.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} -
                            {new Date(event.end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </p>
                          {event.resourceName && (
                            <p className="text-sm text-gray-500">{event.resourceName}</p>
                          )}
                        </div>
                      </div>
                      <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded-full">Google Calendar</span>
                    </div>
                    {event.location && (
                      <p className="text-sm text-gray-600 mt-2 flex items-center">
                        <MapPin className="w-4 h-4 mr-1" />
                        {event.location}
                      </p>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* Month View */}
      {calendarView === 'month' && (
        <MonthView
          currentDate={currentDate}
          appointments={appointments}
          onSelectDate={(date) => {
            setCurrentDate(date);
            setCalendarView('day');
          }}
          workTypes={workTypes}
        />
      )}
    </div>
  );

  const renderDispatchTab = () => (
    <div className="space-y-4">
      {/* Dispatch Controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center space-x-4">
            <button onClick={() => setDispatchDate(d => { const nd = new Date(d); nd.setDate(nd.getDate() - 1); return nd; })} className="p-2 hover:bg-gray-100 rounded-lg">
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <button onClick={() => setDispatchDate(d => { const nd = new Date(d); nd.setDate(nd.getDate() + 1); return nd; })} className="p-2 hover:bg-gray-100 rounded-lg">
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
            <button onClick={() => setDispatchDate(new Date())} className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">
              Today
            </button>
            <h2 className="text-lg font-semibold text-gray-900">{formatDateFull(dispatchDate)}</h2>
          </div>
          <div className="flex items-center space-x-2">
            <button onClick={loadDispatchData} className="inline-flex items-center px-3 py-1.5 text-gray-700 text-sm rounded-lg border hover:bg-gray-50">
              <RefreshCw className="w-4 h-4 mr-1" />
              Refresh
            </button>
            <button className="inline-flex items-center px-3 py-1.5 bg-panda-primary text-white text-sm rounded-lg hover:bg-panda-primary/90">
              <Zap className="w-4 h-4 mr-1" />
              Optimize Schedule
            </button>
          </div>
        </div>
      </div>

      {/* Dispatch Board */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[1200px]">
            {/* Time header */}
            <div className="flex border-b border-gray-200 bg-gray-50">
              <div className="w-48 flex-shrink-0 p-3 font-medium text-gray-700 border-r border-gray-200">
                Resource
              </div>
              <div className="flex-1 flex">
                {Array.from({ length: 12 }, (_, i) => i + 6).map((hour) => (
                  <div key={hour} className="flex-1 p-2 text-center text-xs font-medium text-gray-500 border-r border-gray-100 last:border-r-0">
                    {hour > 12 ? `${hour - 12}PM` : hour === 12 ? '12PM' : `${hour}AM`}
                  </div>
                ))}
              </div>
            </div>

            {/* Resource rows */}
            {(dispatchData.resources || []).length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Users className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                <p>No resources available</p>
              </div>
            ) : (
              (dispatchData.resources || []).map((resource) => (
                <DispatchRow
                  key={resource.id}
                  resource={resource}
                  appointments={(dispatchData.appointments || []).filter(a =>
                    a.assignedResources?.some(ar => ar.resourceId === resource.id)
                  )}
                  onAssign={(aptId) => handleAssignResource(aptId, resource.id)}
                  workTypes={workTypes}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Unassigned Appointments */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
          <AlertCircle className="w-5 h-5 mr-2 text-orange-500" />
          Unassigned Appointments ({(dispatchData.appointments || []).filter(a => !a.assignedResources?.length).length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(dispatchData.appointments || []).filter(a => !a.assignedResources?.length).map((apt) => (
            <AppointmentCard
              key={apt.id}
              appointment={apt}
              compact
              onClick={() => setSelectedAppointment(apt)}
              onAutoSchedule={handleAutoSchedule}
              workTypes={workTypes}
            />
          ))}
        </div>
      </div>
    </div>
  );

  const renderResourcesTab = () => (
    <div className="space-y-4">
      {/* Resources Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search resources..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
            />
          </div>
          <button onClick={() => setShowResourceModal(true)} className="inline-flex items-center px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90">
            <UserPlus className="w-4 h-4 mr-2" />
            Add Resource
          </button>
        </div>
      </div>

      {/* Resources Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {resources.filter(r =>
          !searchQuery || r.name?.toLowerCase().includes(searchQuery.toLowerCase())
        ).map((resource) => (
          <ResourceCard
            key={resource.id}
            resource={resource}
            onClick={() => setSelectedResource(resource)}
            onConnectGoogle={() => handleConnectGoogleCalendar(resource.id)}
            onSyncGoogle={() => handleSyncToGoogle(resource.id)}
          />
        ))}
      </div>

      {resources.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
          <Users className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <p className="text-lg font-medium text-gray-900">No resources yet</p>
          <p className="mt-1">Add service resources (technicians, crews) to start scheduling</p>
        </div>
      )}
    </div>
  );

  const renderWorkOrdersTab = () => (
    <div className="space-y-4">
      {/* Work Orders Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center space-x-2">
            <select
              value={workOrderFilter}
              onChange={(e) => setWorkOrderFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
            >
              <option value="all">All Work Orders</option>
              <option value="NEW">New</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="ON_HOLD">On Hold</option>
              <option value="COMPLETED">Completed</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>
          <button onClick={() => setShowNewWorkOrderModal(true)} className="inline-flex items-center px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90">
            <Plus className="w-4 h-4 mr-2" />
            New Work Order
          </button>
        </div>
      </div>

      {/* Work Orders List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Work Order</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Account</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Work Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Appointments</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {workOrders.map((wo) => (
              <tr key={wo.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedWorkOrder(wo)}>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{wo.workOrderNumber}</div>
                  <div className="text-sm text-gray-500">{wo.subject}</div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {wo.account?.name || wo.opportunity?.name || '-'}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                    {wo.workType?.name || '-'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${workOrderStatusColors[wo.status] || 'bg-gray-100 text-gray-700'}`}>
                    {wo.status?.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <PriorityBadge priority={wo.priority} />
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {wo._count?.serviceAppointments || wo.serviceAppointments?.length || 0}
                </td>
                <td className="px-4 py-3 text-right">
                  <button className="p-1 hover:bg-gray-100 rounded">
                    <MoreVertical className="w-4 h-4 text-gray-400" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {workOrders.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            <ClipboardList className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p>No work orders found</p>
          </div>
        )}
      </div>
    </div>
  );

  // ========== ORDER MANAGER TAB (AccuLynx-style W/O/D) ==========
  const renderOrdersTab = () => (
    <div className="space-y-4">
      {/* Order Status Tabs (W/O/D) */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex border-b border-gray-200">
          {[
            { id: 'WAITING', label: 'Waiting to Order', letter: 'W', count: materialOrderCounts.WAITING || 0 },
            { id: 'ORDERED', label: 'Ordered', letter: 'O', count: materialOrderCounts.ORDERED || 0 },
            { id: 'DELIVERED', label: 'Delivered', letter: 'D', count: materialOrderCounts.DELIVERED || 0 },
          ].map((status) => (
            <button
              key={status.id}
              onClick={() => setMaterialStatusFilter(status.id)}
              className={`flex-1 flex items-center justify-center px-4 py-3 text-sm font-medium transition-colors ${
                materialStatusFilter === status.id
                  ? 'text-panda-primary border-b-2 border-panda-primary bg-panda-primary/5'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <span className={`w-6 h-6 rounded-full flex items-center justify-center mr-2 text-xs font-bold ${
                materialStatusIndicator[status.id]?.bg || 'bg-gray-200'
              } ${materialStatusIndicator[status.id]?.text || 'text-gray-600'}`}>
                {status.letter}
              </span>
              {status.label}
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
                {status.count}
              </span>
            </button>
          ))}
        </div>

        {/* Order Actions Bar */}
        <div className="p-4 flex items-center justify-between border-b border-gray-100">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={selectedMaterialOrders.length > 0 && selectedMaterialOrders.length === materialOrders.length}
              onChange={(e) => setSelectedMaterialOrders(e.target.checked ? materialOrders.map(o => o.id) : [])}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-500">
              {selectedMaterialOrders.length > 0 ? `${selectedMaterialOrders.length} selected` : 'Select all'}
            </span>
            {selectedMaterialOrders.length > 0 && (
              <div className="flex items-center space-x-2 ml-4">
                {materialStatusFilter === 'WAITING' && (
                  <button
                    onClick={() => handleBulkUpdateStatus('ORDERED')}
                    className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600"
                  >
                    <ShoppingCart className="w-4 h-4 inline mr-1" />
                    Mark Ordered
                  </button>
                )}
                {materialStatusFilter === 'ORDERED' && (
                  <button
                    onClick={() => handleBulkUpdateStatus('DELIVERED')}
                    className="px-3 py-1.5 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600"
                  >
                    <CheckSquare className="w-4 h-4 inline mr-1" />
                    Mark Delivered
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <select
              value={materialSupplierFilter}
              onChange={(e) => setMaterialSupplierFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="">All Suppliers</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Material Orders List */}
        <div className="divide-y divide-gray-100">
          {materialOrders.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Package className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p className="font-medium">No {materialStatusFilter.toLowerCase()} orders</p>
              <p className="text-sm mt-1">Orders will appear here when materials need to be ordered</p>
            </div>
          ) : (
            materialOrders.map((order) => (
              <div
                key={order.id}
                className={`p-4 hover:bg-gray-50 cursor-pointer ${
                  selectedMaterialOrders.includes(order.id) ? 'bg-blue-50' : ''
                }`}
              >
                <div className="flex items-start space-x-3">
                  <input
                    type="checkbox"
                    checked={selectedMaterialOrders.includes(order.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      setSelectedMaterialOrders(prev =>
                        e.target.checked
                          ? [...prev, order.id]
                          : prev.filter(id => id !== order.id)
                      );
                    }}
                    className="mt-1 rounded border-gray-300"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium text-gray-900">{order.materialOrderNumber}</span>
                        {order.supplierOrderNumber && (
                          <span className="ml-2 text-sm text-gray-500">
                            (Supplier: {order.supplierOrderNumber})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        {/* Material Status Badge */}
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${materialStatusColors[order.materialStatus]}`}>
                          {order.materialStatus}
                        </span>
                        {/* ABC Supply badge */}
                        {order.supplier?.isAbcSupply && (
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-700">
                            ABC Supply
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-1 text-sm text-gray-600">
                      <span className="font-medium">{order.workOrder?.account?.name || order.opportunity?.name || 'N/A'}</span>
                      {order.workOrder?.workOrderNumber && (
                        <span className="ml-2">• WO: {order.workOrder.workOrderNumber}</span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center space-x-4 text-sm text-gray-500">
                      {order.supplier && (
                        <span>
                          <Building className="w-4 h-4 inline mr-1" />
                          {order.supplier.name}
                        </span>
                      )}
                      {order.deliveryDate && (
                        <span>
                          <Calendar className="w-4 h-4 inline mr-1" />
                          {new Date(order.deliveryDate).toLocaleDateString()}
                          {order.deliveryTimeWindow && ` (${order.deliveryTimeWindow})`}
                        </span>
                      )}
                      {order.estimatedCost && (
                        <span className="font-medium text-gray-700">
                          ${parseFloat(order.estimatedCost).toLocaleString()}
                        </span>
                      )}
                    </div>
                    {/* ABC Supply Order Tracking */}
                    {order.abcConfirmationNumber && (
                      <div className="mt-2 flex items-center flex-wrap gap-2 text-sm">
                        <span className="px-2 py-0.5 bg-orange-50 text-orange-700 rounded text-xs">
                          Confirmation: {order.abcConfirmationNumber}
                        </span>
                        {order.abcOrderNumber && (
                          <span className="px-2 py-0.5 bg-orange-50 text-orange-700 rounded text-xs">
                            ABC Order: {order.abcOrderNumber}
                          </span>
                        )}
                        {order.abcStatus && (
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            order.abcStatus === 'Delivered' ? 'bg-green-50 text-green-700' :
                            order.abcStatus === 'Shipped' ? 'bg-blue-50 text-blue-700' :
                            'bg-gray-50 text-gray-700'
                          }`}>
                            {order.abcStatus}
                          </span>
                        )}
                        {order.abcTrackingId && (
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
                            Tracking: {order.abcTrackingId}
                          </span>
                        )}
                      </div>
                    )}
                    {/* Line Items Preview */}
                    {order.lineItems?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {order.lineItems.slice(0, 3).map((item, idx) => (
                          <span key={idx} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                            {item.description || item.product?.name || 'Item'}
                            {item.quantity > 1 && ` (${item.quantity})`}
                          </span>
                        ))}
                        {order.lineItems.length > 3 && (
                          <span className="px-2 py-0.5 text-xs text-gray-500">
                            +{order.lineItems.length - 3} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Quick Actions */}
                  <div className="flex items-center space-x-1">
                    {order.materialStatus === 'WAITING' && order.supplier?.isAbcSupply && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSubmitToAbc(order.id);
                        }}
                        className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg"
                        title="Submit to ABC Supply"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    )}
                    {order.materialStatus === 'WAITING' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUpdateMaterialStatus(order.id, 'ORDERED');
                        }}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                        title="Mark as Ordered"
                      >
                        <ShoppingCart className="w-4 h-4" />
                      </button>
                    )}
                    {order.materialStatus === 'ORDERED' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUpdateMaterialStatus(order.id, 'DELIVERED');
                        }}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                        title="Mark as Delivered"
                      >
                        <CheckSquare className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  // ========== CREW SCHEDULER TAB (Gantt-style) ==========
  const renderCrewSchedulerTab = () => {
    // Generate date headers for the week
    const weekStart = new Date(currentDate);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekDates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });

    // Get filtered crews
    const filteredCrews = getFilteredCrews();

    return (
      <div className="flex gap-4">
        {/* Territory Sidebar (FSL-style) */}
        {showTerritorySidebar && (
          <div className="w-64 flex-shrink-0">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Sidebar Header */}
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center">
                  <MapPin className="w-4 h-4 text-gray-500 mr-2" />
                  <span className="font-medium text-gray-900 text-sm">Territories</span>
                </div>
                <button
                  onClick={() => setShowTerritorySidebar(false)}
                  className="p-1 hover:bg-gray-200 rounded"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              {/* Select All / Clear */}
              <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                <button
                  onClick={toggleAllTerritories}
                  className="text-xs text-panda-primary hover:underline"
                >
                  {selectedTerritories.size === territories.length ? 'Clear all' : 'Select all'}
                </button>
                <span className="text-xs text-gray-500">
                  {selectedTerritories.size} of {territories.length}
                </span>
              </div>

              {/* Territory List */}
              <div className="max-h-[400px] overflow-y-auto">
                {territories.map((territory) => {
                  const isSelected = selectedTerritories.has(territory.name);
                  const crewCount = territory._count?.members || 0;
                  return (
                    <label
                      key={territory.id}
                      className={`flex items-center px-4 py-2 cursor-pointer hover:bg-gray-50 border-b border-gray-50 ${
                        isSelected ? 'bg-panda-primary/5' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleTerritorySelection(territory.name)}
                        className="w-4 h-4 text-panda-primary border-gray-300 rounded focus:ring-panda-primary"
                      />
                      <div className="ml-3 flex-1 min-w-0">
                        <div className="text-sm text-gray-900 truncate">{territory.name}</div>
                        <div className="text-xs text-gray-500">{crewCount} crew{crewCount !== 1 ? 's' : ''}</div>
                      </div>
                    </label>
                  );
                })}

                {territories.length === 0 && (
                  <div className="px-4 py-6 text-center text-gray-500 text-sm">
                    No territories configured
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className={`flex-1 space-y-4 ${!showTerritorySidebar ? 'w-full' : ''}`}>

          {/* Show sidebar toggle when hidden */}
          {!showTerritorySidebar && (
            <button
              onClick={() => setShowTerritorySidebar(true)}
              className="flex items-center px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <MapPin className="w-4 h-4 mr-2" />
              Show Territories
            </button>
          )}
        {/* Scheduler Header with Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex flex-col gap-4">
            {/* Date Navigation */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    const prev = new Date(currentDate);
                    prev.setDate(prev.getDate() - 7);
                    setCurrentDate(prev);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="font-medium text-gray-900">
                  {weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {' '}
                  {weekDates[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                <button
                  onClick={() => {
                    const next = new Date(currentDate);
                    next.setDate(next.getDate() + 7);
                    setCurrentDate(next);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
              <button
                onClick={() => setCurrentDate(new Date())}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Today
              </button>

              {/* Gantt Mode Toggle */}
              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden ml-4">
                <button
                  onClick={() => setGanttMode('daily')}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    ganttMode === 'daily'
                      ? 'bg-panda-primary text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Week View
                </button>
                <button
                  onClick={() => setGanttMode('hourly')}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    ganttMode === 'hourly'
                      ? 'bg-panda-primary text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Day View (Gantt)
                </button>
              </div>

              {/* FSL Action Buttons */}
              <div className="flex items-center space-x-2 ml-4">
                {/* Confirmations Queue Button (FSL-style) */}
                <button
                  onClick={() => {
                    loadConfirmationsQueue();
                    setShowConfirmationsFilter(true);
                  }}
                  className={`inline-flex items-center px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    showConfirmationsFilter
                      ? 'bg-yellow-100 text-yellow-700 border border-yellow-200'
                      : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                  title="Open Confirmations Queue"
                >
                  <ClipboardList className="w-4 h-4 mr-1" />
                  Confirmations
                  {confirmationsQueue.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 bg-yellow-200 text-yellow-800 rounded-full text-xs font-bold">
                      {confirmationsQueue.length}
                    </span>
                  )}
                </button>

                {/* Capacity Dashboard Toggle */}
                <button
                  onClick={() => {
                    setShowCapacityPanel(!showCapacityPanel);
                    if (!showCapacityPanel && schedulerTerritoryFilter) {
                      loadTeamCapacity(territories.find(t => t.name === schedulerTerritoryFilter)?.id);
                    }
                  }}
                  className={`inline-flex items-center px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    showCapacityPanel
                      ? 'bg-purple-100 text-purple-700 border border-purple-200'
                      : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                  title="Toggle Capacity Dashboard"
                >
                  <Gauge className="w-4 h-4 mr-1" />
                  Capacity
                </button>

                {/* Google Calendar Toggle */}
                <button
                  onClick={() => setShowGoogleCalendarEvents(!showGoogleCalendarEvents)}
                  className={`inline-flex items-center px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    showGoogleCalendarEvents
                      ? 'bg-red-100 text-red-700 border border-red-200'
                      : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                  title="Toggle Google Calendar Events"
                >
                  <CalendarDays className="w-4 h-4 mr-1" />
                  Google Cal
                  {googleCalendarResourceSummary.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 bg-red-200 text-red-800 rounded-full text-xs font-bold">
                      {googleCalendarResourceSummary.length}
                    </span>
                  )}
                </button>

                {/* Optimize Routes for Selected Date */}
                {ganttMode === 'hourly' && (
                  <button
                    onClick={() => {
                      // Optimize routes for all visible crews on current date
                      const crews = getFilteredCrews();
                      crews.forEach(crew => handleOptimizeRoute(crew.id, currentDate));
                    }}
                    disabled={optimizingRoute}
                    className="inline-flex items-center px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    title="Optimize Routes for All Crews"
                  >
                    {optimizingRoute ? (
                      <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Route className="w-4 h-4 mr-1" />
                    )}
                    Optimize Routes
                  </button>
                )}
              </div>
            </div>

            {/* Filters Row */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-600">Filters:</span>
              </div>

              {/* Crew Search */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search crew..."
                  value={schedulerCrewFilter}
                  onChange={(e) => setSchedulerCrewFilter(e.target.value)}
                  className="pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary w-40"
                />
              </div>

              {/* Territory Filter */}
              <select
                value={schedulerTerritoryFilter}
                onChange={(e) => setSchedulerTerritoryFilter(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
              >
                <option value="">All Territories</option>
                {territories.map((t) => (
                  <option key={t.id} value={t.name}>{t.name}</option>
                ))}
              </select>

              {/* Skill Filter */}
              <select
                value={schedulerSkillFilter}
                onChange={(e) => setSchedulerSkillFilter(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
              >
                <option value="">All Skills</option>
                {skills.map((skill) => (
                  <option key={skill.id || skill.name || skill} value={skill.name || skill}>
                    {skill.name || skill}
                  </option>
                ))}
              </select>

              {/* Scheduling Policy Dropdown */}
              <select
                value={schedulerPolicyFilter}
                onChange={(e) => setSchedulerPolicyFilter(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
              >
                <option value="">Scheduling Policy</option>
                {schedulingPolicies.map((policy) => (
                  <option key={policy.id} value={policy.id}>
                    {policy.name}
                  </option>
                ))}
              </select>

              {/* Clear Filters */}
              {(schedulerCrewFilter || schedulerTerritoryFilter || schedulerSkillFilter || schedulerPolicyFilter) && (
                <button
                  onClick={() => {
                    setSchedulerCrewFilter('');
                    setSchedulerTerritoryFilter('');
                    setSchedulerSkillFilter('');
                    setSchedulerPolicyFilter('');
                  }}
                  className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  Clear
                </button>
              )}

              {/* Results Count */}
              <span className="text-xs text-gray-500 ml-auto">
                Showing {filteredCrews.length} of {crewSchedulerData.length} crews
              </span>
            </div>
          </div>
        </div>

        {/* Scheduling Indicator */}
        {scheduling && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-center">
            <RefreshCw className="w-5 h-5 text-blue-600 animate-spin mr-2" />
            <span className="text-blue-700">Scheduling job...</span>
          </div>
        )}

        {/* To Be Scheduled Queue with Smart Scheduling */}
        {toBeScheduledQueue.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center">
                <AlertCircle className="w-5 h-5 text-amber-600 mr-2" />
                <span className="font-medium text-amber-800">To Be Scheduled</span>
                <span className="ml-2 px-2 py-0.5 bg-amber-200 text-amber-800 rounded-full text-sm font-bold">
                  {toBeScheduledQueue.length}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-amber-600 mr-2">Drag to calendar or:</span>
                {/* Smart Auto-Schedule Button */}
                <button
                  onClick={handleBatchSmartSchedule}
                  disabled={scheduling}
                  className="inline-flex items-center px-3 py-1.5 bg-gradient-to-r from-panda-primary to-indigo-500 text-white text-sm rounded-lg hover:from-panda-primary/90 hover:to-indigo-500/90 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                  <Sparkles className="w-4 h-4 mr-1" />
                  Smart Schedule All
                </button>
              </div>
            </div>
            <div className="flex space-x-3 overflow-x-auto pb-2">
              {toBeScheduledQueue.slice(0, 5).map((job) => (
                <div
                  key={job.id}
                  className="flex-shrink-0 bg-white border border-amber-200 rounded-lg p-3 min-w-[220px] cursor-grab hover:shadow-md active:cursor-grabbing transition-shadow group"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('jobId', job.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0" onClick={() => handleOpenJobDetail(job)}>
                      <div className="font-medium text-gray-900 truncate">{job.workOrder?.account?.name || job.subject}</div>
                      <div className="text-sm text-gray-500 mt-1">{job.workOrder?.workType?.name || 'No work type'}</div>
                    </div>
                    <div className="flex flex-col space-y-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleFindAvailability(job); }}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Find Availability"
                      >
                        <Calendar className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSmartAutoSchedule(job.id); }}
                        className="p-1 text-indigo-600 hover:bg-indigo-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Smart Auto-Schedule"
                      >
                        <Sparkles className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleFindBestResources(job); }}
                        className="p-1 text-green-600 hover:bg-green-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Find Best Crew"
                      >
                        <Target className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {job.workOrder?.materialOrders?.[0] && (
                    <div className="mt-2 flex items-center">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                        materialStatusIndicator[job.workOrder.materialOrders[0].materialStatus]?.bg
                      } ${materialStatusIndicator[job.workOrder.materialOrders[0].materialStatus]?.text}`}>
                        {materialStatusIndicator[job.workOrder.materialOrders[0].materialStatus]?.letter}
                      </span>
                      <span className="ml-1 text-xs text-gray-500">Materials</span>
                    </div>
                  )}
                </div>
              ))}
              {toBeScheduledQueue.length > 5 && (
                <button
                  onClick={() => {/* Could open a modal showing all unscheduled jobs */}}
                  className="flex-shrink-0 flex items-center justify-center min-w-[100px] text-amber-700 font-medium hover:underline"
                >
                  +{toBeScheduledQueue.length - 5} more
                </button>
              )}
            </div>
          </div>
        )}

        {/* Capacity Dashboard Panel (Toggle) */}
        {showCapacityPanel && teamCapacity && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <BarChart3 className="w-5 h-5 text-panda-primary mr-2" />
                <span className="font-medium text-gray-900">Team Capacity Overview</span>
              </div>
              <button onClick={() => setShowCapacityPanel(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-sm text-gray-500">Total Capacity</div>
                <div className="text-2xl font-bold text-gray-900">{teamCapacity.totalHoursAvailable || 0}h</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-3">
                <div className="text-sm text-blue-600">Scheduled</div>
                <div className="text-2xl font-bold text-blue-700">{teamCapacity.totalHoursScheduled || 0}h</div>
              </div>
              <div className="bg-green-50 rounded-lg p-3">
                <div className="text-sm text-green-600">Available</div>
                <div className="text-2xl font-bold text-green-700">
                  {(teamCapacity.totalHoursAvailable || 0) - (teamCapacity.totalHoursScheduled || 0)}h
                </div>
              </div>
              <div className="bg-purple-50 rounded-lg p-3">
                <div className="text-sm text-purple-600">Utilization</div>
                <div className="text-2xl font-bold text-purple-700">
                  {Math.round(((teamCapacity.totalHoursScheduled || 0) / (teamCapacity.totalHoursAvailable || 1)) * 100)}%
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Gantt-style Crew Calendar */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            {/* Weekly View (Daily columns) */}
            {ganttMode === 'daily' && (
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-48 sticky left-0 bg-gray-50">
                    Crew / Resource
                  </th>
                  {weekDates.map((date, idx) => {
                    const isToday = date.toDateString() === new Date().toDateString();
                    return (
                      <th
                        key={idx}
                        className={`px-2 py-3 text-center text-xs font-medium uppercase min-w-[120px] ${
                          isToday ? 'bg-panda-primary/10 text-panda-primary' : 'text-gray-500'
                        }`}
                      >
                        <div>{date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                        <div className="text-lg font-bold">{date.getDate()}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCrews.map((crew, crewIdx) => (
                  <tr key={crew.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 sticky left-0 bg-white border-r border-gray-100">
                      <div className="flex items-center space-x-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: crewColors[crewIdx % crewColors.length] }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center">
                            <span className="font-medium text-gray-900 truncate">{crew.name}</span>
                            {crew.hasGoogleCalendar && (
                              <CalendarDays className="w-3 h-3 text-red-500 ml-1 flex-shrink-0" title="Google Calendar linked" />
                            )}
                          </div>
                          <div className="text-xs text-gray-500">
                            {crew.resourceType}
                            {crew.territoryMembers?.[0]?.territory?.name && (
                              <span className="ml-1">• {crew.territoryMembers[0].territory.name}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    {weekDates.map((date, dayIdx) => {
                      const dateStr = date.toISOString().split('T')[0];
                      const dayJobs = crew.appointments?.filter(apt => {
                        const aptDate = new Date(apt.scheduledStart).toISOString().split('T')[0];
                        return aptDate === dateStr;
                      }) || [];
                      // Get Google Calendar events for this day
                      const dayCalendarEvents = showGoogleCalendarEvents ? (crew.googleCalendarEvents?.filter(evt => {
                        const evtDate = new Date(evt.start).toISOString().split('T')[0];
                        return evtDate === dateStr;
                      }) || []) : [];
                      const isDropTarget = !scheduling;

                      return (
                        <td
                          key={dayIdx}
                          className={`px-1 py-2 align-top border-r border-gray-100 min-h-[80px] transition-colors ${
                            isDropTarget ? 'hover:bg-green-50' : ''
                          }`}
                          onDragOver={(e) => {
                            if (isDropTarget) {
                              e.preventDefault();
                              e.currentTarget.classList.add('bg-green-100');
                            }
                          }}
                          onDragLeave={(e) => {
                            e.currentTarget.classList.remove('bg-green-100');
                          }}
                          onDrop={(e) => {
                            e.currentTarget.classList.remove('bg-green-100');
                            const jobId = e.dataTransfer.getData('jobId');
                            if (jobId && !scheduling) {
                              handleScheduleJob(jobId, crew.id, date);
                            }
                          }}
                        >
                          <div className="space-y-1">
                            {dayJobs.map((job) => {
                              // Get status-based colors (FSL-style: Yellow=Scheduled, Blue=Dispatched)
                              const statusColor = job.status === 'DISPATCHED' ? 'bg-blue-100 border-blue-400' :
                                                  job.status === 'SCHEDULED' ? 'bg-yellow-100 border-yellow-400' :
                                                  job.status === 'IN_PROGRESS' ? 'bg-green-100 border-green-400' :
                                                  job.status === 'COMPLETED' ? 'bg-emerald-100 border-emerald-400' :
                                                  'bg-gray-100 border-gray-300';
                              const textColor = job.status === 'DISPATCHED' ? 'text-blue-700' :
                                                job.status === 'SCHEDULED' ? 'text-yellow-700' :
                                                job.status === 'IN_PROGRESS' ? 'text-green-700' :
                                                job.status === 'COMPLETED' ? 'text-emerald-700' :
                                                'text-gray-700';

                              return (
                                <div
                                  key={job.id}
                                  className={`p-2 rounded text-xs cursor-pointer hover:shadow-md transition-all border-l-4 ${statusColor} group relative`}
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.setData('jobId', job.id);
                                    e.dataTransfer.setData('fromCrewId', crew.id);
                                    e.dataTransfer.effectAllowed = 'move';
                                  }}
                                >
                                  <div onClick={() => handleOpenJobDetail(job)}>
                                    <div className={`font-medium truncate ${textColor}`}>{job.workOrder?.account?.name || job.subject}</div>
                                    <div className="text-gray-500 mt-0.5">
                                      {new Date(job.scheduledStart).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                    </div>
                                    {/* Material Status Indicator */}
                                    {job.workOrder?.materialOrders?.[0] && (
                                      <div className="mt-1">
                                        <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold ${
                                          materialStatusIndicator[job.workOrder.materialOrders[0].materialStatus]?.bg
                                        } ${materialStatusIndicator[job.workOrder.materialOrders[0].materialStatus]?.text}`}>
                                          {materialStatusIndicator[job.workOrder.materialOrders[0].materialStatus]?.letter}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  {/* Quick Dispatch Button (appears on hover for SCHEDULED appointments) */}
                                  {job.status === 'SCHEDULED' && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleDispatchAppointment(job.id); }}
                                      className="absolute top-1 right-1 p-1 bg-blue-500 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-600"
                                      title="Dispatch"
                                    >
                                      <Truck className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                            {/* Google Calendar Events (distinct styling with red/coral border) */}
                            {dayCalendarEvents.map((event) => (
                              <div
                                key={event.id}
                                className="p-2 rounded text-xs cursor-default border-l-4 bg-red-50 border-red-400 group relative"
                                title={`Google Calendar: ${event.title}\n${event.location || ''}`}
                              >
                                <div className="flex items-center space-x-1">
                                  <CalendarDays className="w-3 h-3 text-red-500 flex-shrink-0" />
                                  <div className="font-medium truncate text-red-700">{event.title}</div>
                                </div>
                                <div className="text-red-500 mt-0.5">
                                  {event.allDay ? 'All Day' : new Date(event.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                  {!event.allDay && event.end && ` - ${new Date(event.end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
                                </div>
                                {event.location && (
                                  <div className="text-red-400 text-[10px] truncate mt-0.5">
                                    <MapPin className="w-2.5 h-2.5 inline mr-0.5" />{event.location}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {filteredCrews.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      <Users className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                      {crewSchedulerData.length === 0 ? (
                        <>
                          <p>No crews/resources configured</p>
                          <p className="text-sm mt-1">Add service resources to start scheduling</p>
                        </>
                      ) : (
                        <>
                          <p>No crews match your filters</p>
                          <button
                            onClick={() => {
                              setSchedulerCrewFilter('');
                              setSchedulerTerritoryFilter('');
                              setSchedulerSkillFilter('');
                            }}
                            className="text-sm mt-1 text-panda-primary hover:underline"
                          >
                            Clear filters
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            )}

            {/* Hourly Gantt View (FSL-style single day) */}
            {ganttMode === 'hourly' && (
              <div className="min-w-[1400px]">
                {/* Current Date Display */}
                <div className="bg-gray-50 border-b border-gray-200 px-4 py-2">
                  <span className="font-medium text-gray-900">
                    {currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>

                {/* Hours Header Row */}
                <div className="flex border-b border-gray-200 bg-gray-50">
                  <div className="w-48 flex-shrink-0 px-4 py-2 text-xs font-medium text-gray-500 uppercase sticky left-0 bg-gray-50 border-r border-gray-200">
                    Crew / Resource
                  </div>
                  <div className="flex-1 flex">
                    {/* Generate hours from 6 AM to 8 PM (working hours) */}
                    {Array.from({ length: 15 }, (_, i) => 6 + i).map((hour) => (
                      <div
                        key={hour}
                        className="flex-1 min-w-[60px] px-1 py-2 text-center text-xs font-medium text-gray-500 border-r border-gray-100"
                      >
                        {hour === 12 ? '12PM' : hour > 12 ? `${hour - 12}PM` : `${hour}AM`}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Crew Rows with Gantt Bars */}
                {filteredCrews.map((crew, crewIdx) => {
                  // Get appointments for current date
                  const dateStr = currentDate.toISOString().split('T')[0];
                  const dayJobs = crew.appointments?.filter(apt => {
                    const aptDate = new Date(apt.scheduledStart).toISOString().split('T')[0];
                    return aptDate === dateStr;
                  }) || [];
                  // Get Google Calendar events for this day
                  const dayCalendarEvents = showGoogleCalendarEvents ? (crew.googleCalendarEvents?.filter(evt => {
                    const evtDate = new Date(evt.start).toISOString().split('T')[0];
                    return evtDate === dateStr;
                  }) || []) : [];

                  return (
                    <div key={crew.id} className="flex border-b border-gray-100 hover:bg-gray-50 min-h-[60px]">
                      {/* Crew Name Column */}
                      <div className="w-48 flex-shrink-0 px-4 py-2 sticky left-0 bg-white border-r border-gray-100 flex items-center">
                        <div className="flex items-center space-x-2">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: crewColors[crewIdx % crewColors.length] }}
                          />
                          <div className="min-w-0">
                            <div className="flex items-center">
                              <span className="font-medium text-gray-900 text-sm truncate">{crew.name}</span>
                              {crew.hasGoogleCalendar && (
                                <CalendarDays className="w-3 h-3 text-red-500 ml-1 flex-shrink-0" title="Google Calendar linked" />
                              )}
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                              {crew.territoryMembers?.[0]?.territory?.name || crew.resourceType}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Gantt Timeline */}
                      <div
                        className="flex-1 relative"
                        style={{ minHeight: '60px' }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.currentTarget.classList.add('bg-green-50');
                        }}
                        onDragLeave={(e) => {
                          e.currentTarget.classList.remove('bg-green-50');
                        }}
                        onDrop={(e) => {
                          e.currentTarget.classList.remove('bg-green-50');
                          const jobId = e.dataTransfer.getData('jobId');
                          if (jobId && !scheduling) {
                            // Calculate drop position to determine time
                            const rect = e.currentTarget.getBoundingClientRect();
                            const relativeX = e.clientX - rect.left;
                            const percentX = relativeX / rect.width;
                            const hourOffset = Math.floor(percentX * 15); // 15 hours (6AM-8PM)
                            const dropHour = 6 + hourOffset;

                            const scheduledDate = new Date(currentDate);
                            scheduledDate.setHours(dropHour, 0, 0, 0);
                            handleScheduleJob(jobId, crew.id, scheduledDate);
                          }
                        }}
                      >
                        {/* Hour Grid Lines */}
                        <div className="absolute inset-0 flex pointer-events-none">
                          {Array.from({ length: 15 }, (_, i) => (
                            <div key={i} className="flex-1 border-r border-gray-100" />
                          ))}
                        </div>

                        {/* Job Bars */}
                        {dayJobs.map((job) => {
                          const startTime = new Date(job.scheduledStart);
                          const endTime = new Date(job.scheduledEnd);
                          const startHour = startTime.getHours() + startTime.getMinutes() / 60;
                          const endHour = endTime.getHours() + endTime.getMinutes() / 60;

                          // Calculate position (6AM = 0%, 8PM = 100%)
                          const startPercent = Math.max(0, ((startHour - 6) / 15) * 100);
                          const endPercent = Math.min(100, ((endHour - 6) / 15) * 100);
                          const widthPercent = endPercent - startPercent;

                          if (widthPercent <= 0) return null;

                          return (
                            <div
                              key={job.id}
                              onClick={() => handleOpenJobDetail(job)}
                              className="absolute top-2 bottom-2 rounded cursor-pointer hover:opacity-90 transition-opacity z-10 flex items-center px-2 overflow-hidden"
                              style={{
                                left: `${startPercent}%`,
                                width: `${widthPercent}%`,
                                backgroundColor: crewColors[crewIdx % crewColors.length],
                                minWidth: '60px',
                              }}
                            >
                              <div className="text-white text-xs font-medium truncate">
                                {job.workOrder?.account?.name || job.subject}
                              </div>
                              {/* Lead Time / Block Indicator */}
                              {job.workOrder?.leadTimeRequired && (
                                <span className="ml-1 px-1 py-0.5 bg-white/30 rounded text-[10px] font-bold">
                                  BLOCK
                                </span>
                              )}
                            </div>
                          );
                        })}

                        {/* Google Calendar Event Bars */}
                        {dayCalendarEvents.map((event) => {
                          // Skip all-day events in hourly view or handle differently
                          if (event.allDay) {
                            return (
                              <div
                                key={event.id}
                                className="absolute top-0 left-0 right-0 h-4 bg-red-100 border-b border-red-300 flex items-center px-2 z-5"
                                title={`All Day: ${event.title}`}
                              >
                                <CalendarDays className="w-3 h-3 text-red-500 mr-1 flex-shrink-0" />
                                <span className="text-red-600 text-[10px] font-medium truncate">{event.title}</span>
                              </div>
                            );
                          }

                          const startTime = new Date(event.start);
                          const endTime = new Date(event.end);
                          const startHour = startTime.getHours() + startTime.getMinutes() / 60;
                          const endHour = endTime.getHours() + endTime.getMinutes() / 60;

                          // Calculate position (6AM = 0%, 8PM = 100%)
                          const startPercent = Math.max(0, ((startHour - 6) / 15) * 100);
                          const endPercent = Math.min(100, ((endHour - 6) / 15) * 100);
                          const widthPercent = endPercent - startPercent;

                          if (widthPercent <= 0) return null;

                          return (
                            <div
                              key={event.id}
                              className="absolute top-2 bottom-2 rounded cursor-default transition-opacity z-5 flex items-center px-2 overflow-hidden border-2 border-dashed border-red-400 bg-red-100/70"
                              style={{
                                left: `${startPercent}%`,
                                width: `${widthPercent}%`,
                                minWidth: '50px',
                              }}
                              title={`Google Calendar: ${event.title}\n${event.location || ''}`}
                            >
                              <CalendarDays className="w-3 h-3 text-red-500 mr-1 flex-shrink-0" />
                              <div className="text-red-700 text-xs font-medium truncate">
                                {event.title}
                              </div>
                            </div>
                          );
                        })}

                        {/* Utilization indicator */}
                        {dayJobs.length > 0 && (
                          <div className="absolute right-2 top-1 text-[10px] text-gray-400">
                            {Math.round((dayJobs.reduce((sum, job) => {
                              const start = new Date(job.scheduledStart);
                              const end = new Date(job.scheduledEnd);
                              return sum + (end - start) / (1000 * 60 * 60);
                            }, 0) / 8) * 100)}% util
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Empty state */}
                {filteredCrews.length === 0 && (
                  <div className="px-4 py-8 text-center text-gray-500">
                    <Users className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                    <p>No crews match your filters</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        </div>
      </div>
    );
  };

  // ========== PRODUCTION AGENDA TAB (Printable) ==========
  const renderAgendaTab = () => {
    const agendaDate = new Date(currentDate).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    return (
      <div className="space-y-4">
        {/* Agenda Header */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 print:hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => {
                  const prev = new Date(currentDate);
                  prev.setDate(prev.getDate() - 1);
                  setCurrentDate(prev);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="font-medium text-gray-900">{agendaDate}</span>
              <button
                onClick={() => {
                  const next = new Date(currentDate);
                  next.setDate(next.getDate() + 1);
                  setCurrentDate(next);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentDate(new Date())}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Today
              </button>
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 flex items-center"
              >
                <Printer className="w-4 h-4 mr-2" />
                Print Agenda
              </button>
              <button
                onClick={() => {/* Export to PDF */}}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center"
              >
                <Download className="w-4 h-4 mr-2" />
                Export PDF
              </button>
            </div>
          </div>
        </div>

        {/* Printable Agenda */}
        <div className="bg-white rounded-xl border border-gray-200 print:border-0 print:rounded-none">
          {/* Print Header */}
          <div className="p-6 border-b border-gray-200 print:border-b-2 print:border-black">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Production Agenda</h2>
                <p className="text-lg text-gray-600 mt-1">{agendaDate}</p>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold text-panda-primary">Panda Exteriors</div>
                <div className="text-sm text-gray-500">Daily Production Schedule</div>
              </div>
            </div>
          </div>

          {/* Agenda Content */}
          <div className="divide-y divide-gray-200">
            {productionAgendaData.length === 0 ? (
              <div className="p-8 text-center text-gray-500 print:hidden">
                <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                <p>No appointments scheduled for this date</p>
              </div>
            ) : (
              productionAgendaData.map((item, idx) => (
                <div key={item.id} className="p-4 print:p-3 hover:bg-gray-50 print:hover:bg-white">
                  <div className="flex items-start space-x-4">
                    {/* Time Column */}
                    <div className="w-24 flex-shrink-0">
                      <div className="text-lg font-bold text-gray-900">
                        {item.scheduledStart
                          ? new Date(item.scheduledStart).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                          : 'TBD'}
                      </div>
                      <div className="text-sm text-gray-500">
                        {item.scheduledEnd
                          ? new Date(item.scheduledEnd).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                          : ''}
                      </div>
                    </div>

                    {/* Job Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-gray-900 text-lg">
                          {item.workOrder?.account?.name || item.subject}
                        </span>
                        {item.workOrder?.materialOrders?.[0] && (
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            materialStatusIndicator[item.workOrder.materialOrders[0].materialStatus]?.bg
                          } ${materialStatusIndicator[item.workOrder.materialOrders[0].materialStatus]?.text}`}>
                            {materialStatusIndicator[item.workOrder.materialOrders[0].materialStatus]?.letter}
                          </span>
                        )}
                      </div>

                      {/* Address */}
                      <div className="text-sm text-gray-600 mt-1">
                        <MapPin className="w-4 h-4 inline mr-1" />
                        {item.address || item.workOrder?.account?.billingStreet || 'Address TBD'}
                        {item.workOrder?.account?.billingCity && `, ${item.workOrder.account.billingCity}`}
                      </div>

                      {/* Work Type & Crew */}
                      <div className="flex items-center space-x-4 mt-2 text-sm">
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded">
                          {item.workType?.name || 'General'}
                        </span>
                        {item.assignedResources?.[0] && (
                          <span className="flex items-center text-gray-600">
                            <Users className="w-4 h-4 mr-1" />
                            {item.assignedResources.map(ar => ar.serviceResource?.name).join(', ')}
                          </span>
                        )}
                      </div>

                      {/* Material Delivery Info */}
                      {item.workOrder?.materialOrders?.[0] && (
                        <div className="mt-2 p-2 bg-gray-50 rounded-lg text-sm print:bg-gray-100">
                          <div className="flex items-center">
                            <Package className="w-4 h-4 text-gray-500 mr-2" />
                            <span className="font-medium">Materials:</span>
                            <span className="ml-2">
                              {item.workOrder.materialOrders[0].supplier?.name || 'Supplier TBD'}
                            </span>
                            {item.workOrder.materialOrders[0].deliveryDate && (
                              <span className="ml-2 text-gray-500">
                                • Delivery: {new Date(item.workOrder.materialOrders[0].deliveryDate).toLocaleDateString()}
                                {item.workOrder.materialOrders[0].deliveryTimeWindow &&
                                  ` (${item.workOrder.materialOrders[0].deliveryTimeWindow})`
                                }
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Notes */}
                      {item.description && (
                        <div className="mt-2 text-sm text-gray-600 italic">
                          {item.description}
                        </div>
                      )}
                    </div>

                    {/* Contact Info */}
                    <div className="w-48 flex-shrink-0 text-right text-sm">
                      {item.workOrder?.account?.phone && (
                        <div className="flex items-center justify-end text-gray-600">
                          <Phone className="w-4 h-4 mr-1" />
                          {item.workOrder.account.phone}
                        </div>
                      )}
                      {item.workOrder?.workOrderNumber && (
                        <div className="text-gray-500 mt-1">
                          WO: {item.workOrder.workOrderNumber}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Agenda Footer */}
          <div className="p-4 border-t border-gray-200 bg-gray-50 print:bg-white print:border-t-2 print:border-black">
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>Total Jobs: {productionAgendaData.length}</span>
              <span>Generated: {new Date().toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
          <p className="text-gray-600 mt-1">Field Service Management with Google Calendar Integration</p>
        </div>
        {error && (
          <div className="flex items-center px-4 py-2 bg-red-50 text-red-700 rounded-lg text-sm">
            <AlertCircle className="w-4 h-4 mr-2" />
            {error}
            <button onClick={() => setError(null)} className="ml-2">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex border-b border-gray-200">
          {[
            { id: 'calendar', label: 'Calendar', icon: Calendar },
            { id: 'dispatch', label: 'Dispatch Board', icon: LayoutGrid },
            { id: 'orders', label: 'Order Manager', icon: Package },
            { id: 'scheduler', label: 'Crew Scheduler', icon: Users },
            { id: 'resources', label: 'Resources', icon: Settings },
            { id: 'workorders', label: 'Work Orders', icon: ClipboardList },
            { id: 'agenda', label: 'Production Agenda', icon: FileText },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-panda-primary border-b-2 border-panda-primary bg-panda-primary/5'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <tab.icon className="w-4 h-4 mr-2" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary" />
        </div>
      ) : (
        <>
          {activeTab === 'calendar' && renderCalendarTab()}
          {activeTab === 'dispatch' && renderDispatchTab()}
          {activeTab === 'orders' && renderOrdersTab()}
          {activeTab === 'scheduler' && renderCrewSchedulerTab()}
          {activeTab === 'resources' && renderResourcesTab()}
          {activeTab === 'workorders' && renderWorkOrdersTab()}
          {activeTab === 'agenda' && renderAgendaTab()}
        </>
      )}

      {/* Appointment Detail Modal */}
      {selectedAppointment && (
        <AppointmentDetailModal
          appointment={selectedAppointment}
          resources={resources}
          workTypes={workTypes}
          onClose={() => setSelectedAppointment(null)}
          onUpdateStatus={handleUpdateStatus}
          onAssignResource={handleAssignResource}
          onAutoSchedule={handleAutoSchedule}
        />
      )}

      {/* New Appointment Modal */}
      {showNewAppointmentModal && (
        <NewAppointmentModal
          workTypes={workTypes}
          resources={resources}
          workOrders={workOrders}
          onClose={() => setShowNewAppointmentModal(false)}
          onSave={async (data) => {
            await scheduleApi.createServiceAppointment(data);
            setShowNewAppointmentModal(false);
            loadData();
          }}
        />
      )}

      {/* New Work Order Modal */}
      {showNewWorkOrderModal && (
        <NewWorkOrderModal
          workTypes={workTypes}
          onClose={() => setShowNewWorkOrderModal(false)}
          onSave={async (data) => {
            await scheduleApi.createWorkOrder(data);
            setShowNewWorkOrderModal(false);
            loadData();
          }}
        />
      )}

      {/* Job Detail Modal (Quick View) */}
      {showJobDetailModal && selectedJobForDetail && (
        <JobDetailModal
          job={selectedJobForDetail}
          onClose={handleCloseJobDetail}
          onSchedule={(crewId, date) => {
            handleScheduleJob(selectedJobForDetail.id, crewId, date);
            handleCloseJobDetail();
          }}
          resources={resources}
        />
      )}

      {/* Best Resources Modal (FSL-equivalent) */}
      {showBestResourcesModal && selectedJobForBestResources && (
        <BestResourcesModal
          job={selectedJobForBestResources}
          resources={bestResourcesForJob}
          onClose={() => {
            setShowBestResourcesModal(false);
            setSelectedJobForBestResources(null);
            setBestResourcesForJob([]);
          }}
          onSelectResource={(resourceId) => {
            handleScheduleJob(selectedJobForBestResources.id, resourceId, new Date());
            setShowBestResourcesModal(false);
            setSelectedJobForBestResources(null);
          }}
        />
      )}

      {/* Find Availability Modal (FSL-style slot picker) */}
      {showFindAvailabilityModal && selectedJobForAvailability && (
        <FindAvailabilityModal
          job={selectedJobForAvailability}
          slots={availableSlots}
          loading={loadingSlots}
          scheduling={scheduling}
          onClose={() => {
            setShowFindAvailabilityModal(false);
            setSelectedJobForAvailability(null);
            setAvailableSlots([]);
            setSelectedSlot(null);
          }}
          onSelectSlot={handleBookSlot}
        />
      )}

      {/* Confirmations Queue Panel */}
      {showConfirmationsFilter && (
        <ConfirmationsPanel
          appointments={confirmationsQueue}
          onClose={() => setShowConfirmationsFilter(false)}
          onDispatch={handleDispatchAppointment}
          onRefresh={loadConfirmationsQueue}
        />
      )}
    </div>
  );
}

// Sub-components

function AppointmentCard({ appointment, compact, expanded, onClick, onUpdateStatus, onAutoSchedule, workTypes }) {
  const apt = appointment;
  const StatusIcon = appointmentStatusIcons[apt.status] || Clock;
  const workTypeName = apt.workType?.name || workTypes?.find(wt => wt.id === apt.workTypeId)?.name || 'Appointment';
  const workTypeColor = workTypeColors[workTypeName] || workTypeColors.default;

  if (compact) {
    return (
      <div
        onClick={onClick}
        className={`mb-2 p-2 rounded-lg border cursor-pointer hover:shadow-md transition-shadow ${appointmentStatusColors[apt.status] || 'bg-gray-50'}`}
      >
        <div className="flex items-center space-x-1">
          <div className={`w-2 h-2 rounded-full ${workTypeColor}`} />
          <span className="text-xs font-medium">
            {formatTime(apt.scheduledStart)}
          </span>
        </div>
        <div className="font-medium text-sm mt-1 truncate">{apt.subject || workTypeName}</div>
        <div className="text-xs mt-1 truncate">{apt.workOrder?.account?.name || apt.contact?.name || ''}</div>
      </div>
    );
  }

  return (
    <div onClick={onClick} className="p-4 hover:bg-gray-50 transition-colors cursor-pointer">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3">
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${appointmentStatusColors[apt.status]}`}>
              <StatusIcon className="w-3 h-3 inline mr-1" />
              {apt.status?.replace('_', ' ')}
            </span>
            <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
              {workTypeName}
            </span>
          </div>
          <h4 className="font-semibold text-gray-900 mt-2">{apt.subject || apt.appointmentNumber}</h4>
          <div className="mt-3 space-y-2 text-sm text-gray-600">
            <div className="flex items-center">
              <Clock className="w-4 h-4 mr-2" />
              {formatTime(apt.scheduledStart)} - {formatTime(apt.scheduledEnd)}
            </div>
            {apt.account && (
              <div className="flex items-center">
                <Building2 className="w-4 h-4 mr-2" />
                {apt.account.name}
              </div>
            )}
            {apt.address && (
              <div className="flex items-center">
                <MapPin className="w-4 h-4 mr-2" />
                {apt.address}
              </div>
            )}
            {apt.assignedResources?.length > 0 && (
              <div className="flex items-center">
                <User className="w-4 h-4 mr-2" />
                {apt.assignedResources.map(ar => ar.resource?.name).join(', ')}
              </div>
            )}
          </div>
        </div>
        {expanded && (
          <div className="flex flex-col space-y-2">
            {apt.status === 'SCHEDULED' && (
              <button
                onClick={(e) => { e.stopPropagation(); onUpdateStatus(apt.id, 'DISPATCHED'); }}
                className="px-3 py-1 text-xs bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200"
              >
                Dispatch
              </button>
            )}
            {apt.status === 'DISPATCHED' && (
              <button
                onClick={(e) => { e.stopPropagation(); onUpdateStatus(apt.id, 'IN_PROGRESS'); }}
                className="px-3 py-1 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200"
              >
                Start
              </button>
            )}
            {apt.status === 'IN_PROGRESS' && (
              <button
                onClick={(e) => { e.stopPropagation(); onUpdateStatus(apt.id, 'COMPLETED'); }}
                className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
              >
                Complete
              </button>
            )}
            {!apt.scheduledStart && (
              <button
                onClick={(e) => { e.stopPropagation(); onAutoSchedule(apt.id); }}
                className="px-3 py-1 text-xs bg-panda-primary text-white rounded hover:bg-panda-primary/90"
              >
                <Zap className="w-3 h-3 inline mr-1" />
                Auto-Schedule
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatTime(dateString) {
  if (!dateString) return '';
  return new Date(dateString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function DispatchRow({ resource, appointments, onAssign, workTypes }) {
  const hours = Array.from({ length: 12 }, (_, i) => i + 6);

  return (
    <div className="flex border-b border-gray-200 last:border-b-0 hover:bg-gray-50">
      <div className="w-48 flex-shrink-0 p-3 border-r border-gray-200">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-panda-primary/10 rounded-full flex items-center justify-center">
            <User className="w-4 h-4 text-panda-primary" />
          </div>
          <div>
            <div className="font-medium text-sm text-gray-900">{resource.name}</div>
            <div className="text-xs text-gray-500">{resource.resourceType}</div>
          </div>
        </div>
        {resource.googleCalendarConnected && (
          <div className="mt-2 flex items-center text-xs text-green-600">
            <Link2 className="w-3 h-3 mr-1" />
            Google Calendar
          </div>
        )}
      </div>
      <div className="flex-1 flex relative min-h-[60px]">
        {hours.map((hour) => (
          <div key={hour} className="flex-1 border-r border-gray-100 last:border-r-0" />
        ))}
        {/* Render appointments as positioned blocks */}
        {appointments.map((apt) => {
          const start = new Date(apt.scheduledStart);
          const end = new Date(apt.scheduledEnd);
          const startHour = start.getHours() + start.getMinutes() / 60;
          const endHour = end.getHours() + end.getMinutes() / 60;
          const left = ((startHour - 6) / 12) * 100;
          const width = ((endHour - startHour) / 12) * 100;
          const workTypeName = apt.workType?.name || workTypes?.find(wt => wt.id === apt.workTypeId)?.name;
          const color = workTypeColors[workTypeName] || workTypeColors.default;

          return (
            <div
              key={apt.id}
              className={`absolute top-1 bottom-1 ${color} text-white text-xs rounded px-1 overflow-hidden cursor-pointer hover:opacity-90`}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`${apt.subject || apt.appointmentNumber}\n${formatTime(apt.scheduledStart)} - ${formatTime(apt.scheduledEnd)}`}
            >
              <div className="truncate font-medium">{apt.subject || apt.appointmentNumber}</div>
              <div className="truncate opacity-80">{apt.workOrder?.account?.name}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ResourceCard({ resource, onClick, onConnectGoogle, onSyncGoogle }) {
  return (
    <div onClick={onClick} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer">
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-panda-primary/10 rounded-full flex items-center justify-center">
            {resource.resourceType === 'CREW' ? (
              <Users className="w-6 h-6 text-panda-primary" />
            ) : (
              <User className="w-6 h-6 text-panda-primary" />
            )}
          </div>
          <div>
            <h4 className="font-semibold text-gray-900">{resource.name}</h4>
            <p className="text-sm text-gray-500">{resource.resourceType}</p>
          </div>
        </div>
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${resource.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
          {resource.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>

      <div className="mt-4 space-y-2">
        {resource.skills?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {resource.skills.slice(0, 3).map((skill, i) => (
              <span key={i} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                {skill.skill?.name || skill.name}
              </span>
            ))}
            {resource.skills.length > 3 && (
              <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                +{resource.skills.length - 3} more
              </span>
            )}
          </div>
        )}

        <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
          {resource.googleCalendarConnected ? (
            <>
              <span className="text-xs text-green-600 flex items-center">
                <Link2 className="w-3 h-3 mr-1" />
                Google Calendar Connected
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); onSyncGoogle(); }}
                className="text-xs text-panda-primary hover:underline"
              >
                Sync Now
              </button>
            </>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onConnectGoogle(); }}
              className="text-xs text-panda-primary hover:underline flex items-center"
            >
              <CalendarDays className="w-3 h-3 mr-1" />
              Connect Google Calendar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PriorityBadge({ priority }) {
  const colors = {
    1: 'bg-red-100 text-red-700',
    2: 'bg-orange-100 text-orange-700',
    3: 'bg-yellow-100 text-yellow-700',
    4: 'bg-blue-100 text-blue-700',
    5: 'bg-gray-100 text-gray-600',
  };
  const labels = {
    1: 'Critical',
    2: 'High',
    3: 'Medium',
    4: 'Low',
    5: 'None',
  };

  return (
    <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${colors[priority] || colors[5]}`}>
      {labels[priority] || 'None'}
    </span>
  );
}

function MonthView({ currentDate, appointments, onSelectDate, workTypes }) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - firstDay.getDay());

  const weeks = [];
  let currentWeek = [];
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 42);

  for (let d = new Date(startDate); d < endDate; d.setDate(d.getDate() + 1)) {
    currentWeek.push(new Date(d));
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  const getAppointmentsForDate = (date) => {
    return appointments.filter(apt => {
      const aptDate = new Date(apt.scheduledStart || apt.earliestStart);
      return aptDate.toDateString() === date.toDateString();
    });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div key={day} className="py-2 text-center text-xs font-medium text-gray-500 uppercase">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="divide-y divide-gray-200">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7 min-h-[100px]">
            {week.map((date, dayIndex) => {
              const isCurrentMonth = date.getMonth() === month;
              const isToday = date.toDateString() === new Date().toDateString();
              const dayAppointments = getAppointmentsForDate(date);

              return (
                <div
                  key={dayIndex}
                  onClick={() => onSelectDate(date)}
                  className={`p-2 border-r border-gray-200 last:border-r-0 cursor-pointer hover:bg-gray-50 ${
                    !isCurrentMonth ? 'bg-gray-50 text-gray-400' : ''
                  } ${isToday ? 'bg-panda-primary/5' : ''}`}
                >
                  <div className={`text-sm font-medium mb-1 ${isToday ? 'text-panda-primary' : ''}`}>
                    {date.getDate()}
                  </div>
                  <div className="space-y-1">
                    {dayAppointments.slice(0, 2).map((apt) => {
                      const workTypeName = apt.workType?.name || workTypes?.find(wt => wt.id === apt.workTypeId)?.name;
                      const color = workTypeColors[workTypeName] || workTypeColors.default;
                      return (
                        <div key={apt.id} className={`text-xs p-1 rounded ${color} text-white truncate`}>
                          {apt.subject || apt.appointmentNumber}
                        </div>
                      );
                    })}
                    {dayAppointments.length > 2 && (
                      <div className="text-xs text-gray-500">+{dayAppointments.length - 2} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function AppointmentDetailModal({ appointment, resources, workTypes, onClose, onUpdateStatus, onAssignResource, onAutoSchedule }) {
  const apt = appointment;
  const StatusIcon = appointmentStatusIcons[apt.status] || Clock;
  const workTypeName = apt.workType?.name || workTypes?.find(wt => wt.id === apt.workTypeId)?.name || 'Appointment';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">{apt.subject || apt.appointmentNumber}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Status and Type */}
          <div className="flex items-center space-x-3">
            <span className={`px-3 py-1.5 text-sm font-medium rounded-full ${appointmentStatusColors[apt.status]}`}>
              <StatusIcon className="w-4 h-4 inline mr-1" />
              {apt.status?.replace('_', ' ')}
            </span>
            <span className="px-3 py-1.5 text-sm font-medium rounded-full bg-gray-100 text-gray-700">
              {workTypeName}
            </span>
          </div>

          {/* Details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Scheduled Time</label>
              <p className="mt-1 text-gray-900">
                {apt.scheduledStart ? (
                  <>
                    {new Date(apt.scheduledStart).toLocaleDateString()}<br />
                    {formatTime(apt.scheduledStart)} - {formatTime(apt.scheduledEnd)}
                  </>
                ) : (
                  <span className="text-gray-400">Not scheduled</span>
                )}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Duration</label>
              <p className="mt-1 text-gray-900">{apt.duration ? `${apt.duration} minutes` : '-'}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Account</label>
              <p className="mt-1 text-gray-900">{apt.workOrder?.account?.name || '-'}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Contact</label>
              <p className="mt-1 text-gray-900">{apt.contact?.name || '-'}</p>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-500 uppercase">Address</label>
              <p className="mt-1 text-gray-900">{apt.address || apt.street || '-'}</p>
            </div>
          </div>

          {/* Assigned Resources */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase">Assigned Resources</label>
            <div className="mt-2 space-y-2">
              {apt.assignedResources?.length > 0 ? (
                apt.assignedResources.map((ar) => (
                  <div key={ar.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-900">{ar.resource?.name}</span>
                      {ar.isPrimary && <span className="text-xs bg-panda-primary/10 text-panda-primary px-2 py-0.5 rounded">Primary</span>}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-400">No resources assigned</p>
              )}
            </div>

            {/* Assign resource dropdown */}
            <div className="mt-3">
              <select
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
                onChange={(e) => {
                  if (e.target.value) {
                    onAssignResource(apt.id, e.target.value);
                    e.target.value = '';
                  }
                }}
                defaultValue=""
              >
                <option value="">Assign a resource...</option>
                {resources.filter(r => r.isActive && !apt.assignedResources?.some(ar => ar.resourceId === r.id)).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          {apt.description && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Description</label>
              <p className="mt-1 text-gray-700 text-sm">{apt.description}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-6 border-t border-gray-200 flex flex-wrap gap-2">
          {!apt.scheduledStart && (
            <button
              onClick={() => { onAutoSchedule(apt.id); onClose(); }}
              className="px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 text-sm font-medium"
            >
              <Zap className="w-4 h-4 inline mr-1" />
              Auto-Schedule
            </button>
          )}
          {apt.status === 'NONE' && (
            <button
              onClick={() => { onUpdateStatus(apt.id, 'SCHEDULED'); onClose(); }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              Schedule
            </button>
          )}
          {apt.status === 'SCHEDULED' && (
            <button
              onClick={() => { onUpdateStatus(apt.id, 'DISPATCHED'); onClose(); }}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
            >
              Dispatch
            </button>
          )}
          {apt.status === 'DISPATCHED' && (
            <button
              onClick={() => { onUpdateStatus(apt.id, 'IN_PROGRESS'); onClose(); }}
              className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-sm font-medium"
            >
              Start Work
            </button>
          )}
          {apt.status === 'IN_PROGRESS' && (
            <button
              onClick={() => { onUpdateStatus(apt.id, 'COMPLETED'); onClose(); }}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
            >
              Complete
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium ml-auto"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function NewAppointmentModal({ workTypes, resources, workOrders, onClose, onSave }) {
  const [formData, setFormData] = useState({
    workOrderId: '',
    workTypeId: '',
    subject: '',
    description: '',
    earliestStart: '',
    dueDate: '',
    duration: 60,
    street: '',
    city: '',
    state: '',
    postalCode: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(formData);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">New Appointment</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Work Order</label>
              <select
                value={formData.workOrderId}
                onChange={(e) => setFormData({ ...formData, workOrderId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
              >
                <option value="">Select work order...</option>
                {workOrders.map((wo) => (
                  <option key={wo.id} value={wo.id}>{wo.workOrderNumber} - {wo.subject}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Work Type *</label>
              <select
                value={formData.workTypeId}
                onChange={(e) => setFormData({ ...formData, workTypeId: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
              >
                <option value="">Select type...</option>
                {workTypes.map((wt) => (
                  <option key={wt.id} value={wt.id}>{wt.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <input
              type="text"
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
              placeholder="Appointment subject"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
              placeholder="Additional details..."
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Earliest Start</label>
              <input
                type="datetime-local"
                value={formData.earliestStart}
                onChange={(e) => setFormData({ ...formData, earliestStart: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <input
                type="datetime-local"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration (min)</label>
              <input
                type="number"
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                min="15"
                step="15"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
              <input
                type="text"
                value={formData.street}
                onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                <input
                  type="text"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Zip</label>
                <input
                  type="text"
                  value={formData.postalCode}
                  onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create Appointment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NewWorkOrderModal({ workTypes, onClose, onSave }) {
  const [formData, setFormData] = useState({
    subject: '',
    description: '',
    workTypeId: '',
    priority: 3,
    street: '',
    city: '',
    state: '',
    postalCode: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(formData);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">New Work Order</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label>
            <input
              type="text"
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
              placeholder="Work order subject"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Work Type *</label>
              <select
                value={formData.workTypeId}
                onChange={(e) => setFormData({ ...formData, workTypeId: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
              >
                <option value="">Select type...</option>
                {workTypes.map((wt) => (
                  <option key={wt.id} value={wt.id}>{wt.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
              >
                <option value={1}>Critical</option>
                <option value={2}>High</option>
                <option value={3}>Medium</option>
                <option value={4}>Low</option>
                <option value={5}>None</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
              placeholder="Work order details..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
              <input
                type="text"
                value={formData.street}
                onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                <input
                  type="text"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Zip</label>
                <input
                  type="text"
                  value={formData.postalCode}
                  onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create Work Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Job Detail Modal - Quick view for unscheduled jobs
function JobDetailModal({ job, onClose, onSchedule, resources }) {
  const [selectedCrew, setSelectedCrew] = useState('');
  const [selectedDate, setSelectedDate] = useState('');

  const workOrder = job.workOrder || {};
  const account = workOrder.account || {};
  const workType = workOrder.workType || {};
  const materialOrder = workOrder.materialOrders?.[0] || job.materialOrders?.[0];

  const handleQuickSchedule = () => {
    if (selectedCrew && selectedDate) {
      onSchedule(selectedCrew, new Date(selectedDate));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-t-xl">
          <div>
            <h2 className="text-lg font-semibold">Job Details</h2>
            <p className="text-white/80 text-sm">{job.appointmentNumber || 'New Appointment'}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Customer Info */}
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-start gap-3">
              <Building className="w-5 h-5 text-gray-400 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium text-gray-900">{account.name || job.subject || 'Unknown Customer'}</div>
                {account.phone && (
                  <div className="text-sm text-gray-500 flex items-center mt-1">
                    <Phone className="w-3.5 h-3.5 mr-1" />
                    {account.phone}
                  </div>
                )}
                {(account.billingStreet || workOrder.street) && (
                  <div className="text-sm text-gray-500 flex items-center mt-1">
                    <MapPin className="w-3.5 h-3.5 mr-1" />
                    {account.billingStreet || workOrder.street}, {account.billingCity || workOrder.city}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Work Type & Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="text-xs text-blue-600 font-medium uppercase">Work Type</div>
              <div className="font-medium text-gray-900 mt-1">{workType.name || 'Not specified'}</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-3">
              <div className="text-xs text-amber-600 font-medium uppercase">Status</div>
              <div className="font-medium text-gray-900 mt-1">{job.status || 'NONE'}</div>
            </div>
          </div>

          {/* Duration */}
          {(workType.estimatedDuration || job.duration) && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Timer className="w-4 h-4" />
              <span>Estimated Duration: {workType.estimatedDuration || job.duration || 240} minutes</span>
            </div>
          )}

          {/* Material Status */}
          {materialOrder && (
            <div className={`rounded-lg p-3 flex items-center gap-3 ${
              materialOrder.materialStatus === 'DELIVERED' ? 'bg-green-50' :
              materialOrder.materialStatus === 'ORDERED' ? 'bg-blue-50' : 'bg-gray-50'
            }`}>
              <Package className={`w-5 h-5 ${
                materialOrder.materialStatus === 'DELIVERED' ? 'text-green-600' :
                materialOrder.materialStatus === 'ORDERED' ? 'text-blue-600' : 'text-gray-400'
              }`} />
              <div>
                <div className="text-xs font-medium uppercase text-gray-500">Material Status</div>
                <div className="font-medium text-gray-900">{materialOrder.materialStatus || 'Waiting'}</div>
                {materialOrder.supplier && (
                  <div className="text-sm text-gray-500">{materialOrder.supplier}</div>
                )}
              </div>
            </div>
          )}

          {/* Description */}
          {(workOrder.description || job.description) && (
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs font-medium uppercase text-gray-500 mb-1">Description</div>
              <p className="text-sm text-gray-700">{workOrder.description || job.description}</p>
            </div>
          )}

          {/* Quick Schedule Section */}
          <div className="border-t border-gray-200 pt-4">
            <div className="text-sm font-medium text-gray-700 mb-3">Quick Schedule</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Select Crew</label>
                <select
                  value={selectedCrew}
                  onChange={(e) => setSelectedCrew(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
                >
                  <option value="">Choose crew...</option>
                  {resources.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Select Date</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-200 flex items-center justify-between bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            Close
          </button>
          <button
            onClick={handleQuickSchedule}
            disabled={!selectedCrew || !selectedDate}
            className="px-4 py-2 bg-panda-primary text-white text-sm rounded-lg hover:bg-panda-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Calendar className="w-4 h-4" />
            Schedule Job
          </button>
        </div>
      </div>
    </div>
  );
}

// FSL-equivalent Best Resources Modal - Shows ranked resource recommendations based on scheduling policy
function BestResourcesModal({ job, resources, onClose, onSelectResource }) {
  const workType = job.workOrder?.workType?.name || job.workType?.name || 'Unknown';
  const account = job.workOrder?.account?.name || job.subject || 'Unknown';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-panda-primary to-indigo-500">
          <div className="flex items-center justify-between">
            <div className="flex items-center text-white">
              <Target className="w-5 h-5 mr-2" />
              <span className="font-semibold">Best Crews for This Job</span>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-white/20 rounded text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="mt-2 text-white/80 text-sm">
            {workType} • {account}
          </div>
        </div>

        {/* Resource Recommendations */}
        <div className="p-4 overflow-y-auto max-h-[50vh]">
          {resources.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Users className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p>No matching resources found</p>
              <p className="text-sm mt-1">Try adjusting the scheduling policy or filters</p>
            </div>
          ) : (
            <div className="space-y-3">
              {resources.map((resource, index) => (
                <div
                  key={resource.id || index}
                  className="p-4 border border-gray-200 rounded-lg hover:border-panda-primary hover:bg-panda-primary/5 cursor-pointer transition-all group"
                  onClick={() => onSelectResource(resource.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      {/* Rank Badge */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        index === 0 ? 'bg-yellow-100 text-yellow-700' :
                        index === 1 ? 'bg-gray-100 text-gray-600' :
                        index === 2 ? 'bg-orange-100 text-orange-700' :
                        'bg-gray-50 text-gray-500'
                      }`}>
                        {index === 0 ? <Star className="w-4 h-4" /> : index + 1}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{resource.name}</div>
                        <div className="text-sm text-gray-500">
                          {resource.territoryName || resource.resourceType || 'Crew'}
                        </div>
                      </div>
                    </div>

                    {/* Score */}
                    <div className="text-right">
                      <div className="text-lg font-bold text-panda-primary">
                        {Math.round(resource.score || 0)}
                      </div>
                      <div className="text-xs text-gray-500">score</div>
                    </div>
                  </div>

                  {/* Score Breakdown */}
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    {resource.skillMatch !== undefined && (
                      <div className="flex items-center text-gray-600">
                        <Wrench className="w-3 h-3 mr-1" />
                        Skills: {resource.skillMatch ? '✓' : '✗'}
                      </div>
                    )}
                    {resource.travelTime !== undefined && (
                      <div className="flex items-center text-gray-600">
                        <Navigation className="w-3 h-3 mr-1" />
                        {resource.travelTime} min
                      </div>
                    )}
                    {resource.utilization !== undefined && (
                      <div className="flex items-center text-gray-600">
                        <Gauge className="w-3 h-3 mr-1" />
                        {Math.round(resource.utilization)}% util
                      </div>
                    )}
                  </div>

                  {/* Select Button (appears on hover) */}
                  <div className="mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="w-full py-2 bg-panda-primary text-white text-sm rounded-lg hover:bg-panda-primary/90 flex items-center justify-center">
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Select This Crew
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 text-center text-xs text-gray-500">
          Resources are ranked based on skills, territory, travel time, and utilization
        </div>
      </div>
    </div>
  );
}

// FSL-style Find Availability Modal - Shows available time slots to pick from
function FindAvailabilityModal({ job, slots, loading, scheduling, onClose, onSelectSlot }) {
  const workType = job.workOrder?.workType?.name || job.workType?.name || 'Unknown';
  const account = job.workOrder?.account?.name || job.subject || 'Unknown';
  const duration = job.workOrder?.workType?.estimatedDuration || 240;

  // Group slots by date for easier viewing
  const slotsByDate = slots.reduce((acc, slot) => {
    const dateKey = new Date(slot.start).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(slot);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-blue-500 to-cyan-500">
          <div className="flex items-center justify-between">
            <div className="flex items-center text-white">
              <Calendar className="w-5 h-5 mr-2" />
              <span className="font-semibold">Find Availability</span>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-white/20 rounded text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="mt-2 text-white/80 text-sm">
            {workType} • {account} • {Math.round(duration / 60)}hr
          </div>
        </div>

        {/* Slot List */}
        <div className="p-4 overflow-y-auto max-h-[55vh]">
          {loading ? (
            <div className="text-center py-12">
              <RefreshCw className="w-8 h-8 mx-auto text-blue-500 animate-spin mb-3" />
              <p className="text-gray-500">Finding available time slots...</p>
            </div>
          ) : slots.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Calendar className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p>No available slots found</p>
              <p className="text-sm mt-1">Try adjusting the date range or selecting different crews</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(slotsByDate).map(([dateStr, dateSlots]) => (
                <div key={dateStr}>
                  <h4 className="text-sm font-medium text-gray-900 mb-2 flex items-center">
                    <CalendarDays className="w-4 h-4 mr-2 text-blue-500" />
                    {dateStr}
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {dateSlots.map((slot, idx) => {
                      const startTime = new Date(slot.start).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                      });
                      const endTime = new Date(slot.end).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                      });

                      return (
                        <button
                          key={idx}
                          onClick={() => onSelectSlot(slot)}
                          disabled={scheduling}
                          className="p-3 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all text-left group disabled:opacity-50"
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-medium text-gray-900">
                              {startTime} - {endTime}
                            </div>
                            <CheckCircle className="w-4 h-4 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          {slot.resourceName && (
                            <div className="text-xs text-gray-500 mt-1 flex items-center">
                              <Users className="w-3 h-3 mr-1" />
                              {slot.resourceName}
                              {slot.resourceScore && (
                                <span className="ml-2 text-blue-600">({Math.round(slot.resourceScore)} pts)</span>
                              )}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <div className="text-xs text-gray-500">
            {slots.length} available slot{slots.length !== 1 ? 's' : ''} found
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// Confirmations Panel - FSL-style queue of appointments ready to be dispatched
function ConfirmationsPanel({ appointments, onClose, onDispatch, onRefresh }) {
  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-yellow-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <ClipboardList className="w-5 h-5 mr-2 text-yellow-600" />
            <span className="font-semibold text-gray-900">Confirmations Queue</span>
            <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-yellow-200 text-yellow-800 rounded-full">
              {appointments.length}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <button onClick={onRefresh} className="p-1 hover:bg-yellow-100 rounded text-yellow-600">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-1 hover:bg-yellow-100 rounded text-gray-500">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Scheduled appointments ready to dispatch
        </p>
      </div>

      {/* Appointment List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {appointments.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <CheckCircle className="w-12 h-12 mx-auto text-green-300 mb-3" />
            <p>All caught up!</p>
            <p className="text-sm mt-1">No appointments waiting for dispatch</p>
          </div>
        ) : (
          appointments.map((apt) => (
            <div
              key={apt.id}
              className="p-3 border border-yellow-200 bg-yellow-50 rounded-lg hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">
                    {apt.workOrder?.account?.name || apt.subject}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {apt.workOrder?.workType?.name || 'Appointment'}
                  </div>
                  <div className="text-xs text-gray-500 mt-2 flex items-center">
                    <Clock className="w-3 h-3 mr-1" />
                    {new Date(apt.scheduledStart).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}{' '}
                    at{' '}
                    {new Date(apt.scheduledStart).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </div>
                  {apt.assignedResources?.length > 0 && (
                    <div className="text-xs text-gray-500 mt-1 flex items-center">
                      <Users className="w-3 h-3 mr-1" />
                      {apt.assignedResources.map(ar => ar.resource?.name || ar.serviceResource?.name).filter(Boolean).join(', ')}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => onDispatch(apt.id)}
                  className="px-3 py-1.5 bg-blue-500 text-white text-xs font-medium rounded-lg hover:bg-blue-600 flex items-center"
                >
                  <Truck className="w-3 h-3 mr-1" />
                  Dispatch
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer - Bulk Dispatch */}
      {appointments.length > 0 && (
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={() => {
              appointments.forEach(apt => onDispatch(apt.id));
            }}
            className="w-full py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 flex items-center justify-center"
          >
            <Truck className="w-4 h-4 mr-2" />
            Dispatch All ({appointments.length})
          </button>
        </div>
      )}
    </div>
  );
}
