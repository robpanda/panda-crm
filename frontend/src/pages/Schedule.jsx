import { useState, useEffect, useCallback } from 'react';
import {
  Calendar, Clock, MapPin, User, Phone, Building2, ChevronLeft, ChevronRight, Plus,
  Users, Briefcase, Settings, RefreshCw, Filter, Search, X, Check, AlertCircle,
  Truck, Wrench, ClipboardList, PlayCircle, PauseCircle, CheckCircle, XCircle,
  Link2, Unlink, ChevronDown, MoreVertical, Edit2, Trash2, Eye, UserPlus,
  CalendarDays, LayoutGrid, List, Zap, Timer, Package, ShoppingCart, CheckSquare,
  FileText, Printer, Download, ExternalLink, Building
} from 'lucide-react';
import { scheduleApi } from '../services/api';

// Status colors for appointments
const appointmentStatusColors = {
  NONE: 'bg-gray-100 text-gray-700 border-gray-200',
  SCHEDULED: 'bg-blue-100 text-blue-700 border-blue-200',
  DISPATCHED: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  COMPLETED: 'bg-green-100 text-green-700 border-green-200',
  CANNOT_COMPLETE: 'bg-red-100 text-red-700 border-red-200',
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
  const [crewSchedulerData, setCrewSchedulerData] = useState([]); // Crews with their appointments
  const [toBeScheduledQueue, setToBeScheduledQueue] = useState([]); // Unscheduled jobs queue
  const [unscheduledCount, setUnscheduledCount] = useState(0);

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
            {getAppointmentsForDate(currentDate).length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Calendar className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                <p>No appointments scheduled for this day</p>
              </div>
            ) : (
              getAppointmentsForDate(currentDate).map((apt) => (
                <AppointmentCard
                  key={apt.id}
                  appointment={apt}
                  expanded
                  onClick={() => setSelectedAppointment(apt)}
                  onUpdateStatus={handleUpdateStatus}
                  onAutoSchedule={handleAutoSchedule}
                  workTypes={workTypes}
                />
              ))
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

    return (
      <div className="space-y-4">
        {/* Scheduler Header */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
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
          </div>
        </div>

        {/* To Be Scheduled Queue */}
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
            </div>
            <div className="flex space-x-3 overflow-x-auto pb-2">
              {toBeScheduledQueue.slice(0, 5).map((job) => (
                <div
                  key={job.id}
                  className="flex-shrink-0 bg-white border border-amber-200 rounded-lg p-3 min-w-[200px] cursor-pointer hover:shadow-md"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('jobId', job.id)}
                >
                  <div className="font-medium text-gray-900 truncate">{job.account?.name || job.subject}</div>
                  <div className="text-sm text-gray-500 mt-1">{job.workType?.name}</div>
                  {job.materialOrders?.[0] && (
                    <div className="mt-2 flex items-center">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                        materialStatusIndicator[job.materialOrders[0].materialStatus]?.bg
                      } ${materialStatusIndicator[job.materialOrders[0].materialStatus]?.text}`}>
                        {materialStatusIndicator[job.materialOrders[0].materialStatus]?.letter}
                      </span>
                      <span className="ml-1 text-xs text-gray-500">Materials</span>
                    </div>
                  )}
                </div>
              ))}
              {toBeScheduledQueue.length > 5 && (
                <div className="flex-shrink-0 flex items-center justify-center min-w-[100px] text-amber-700 font-medium">
                  +{toBeScheduledQueue.length - 5} more
                </div>
              )}
            </div>
          </div>
        )}

        {/* Gantt-style Crew Calendar */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
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
                {crewSchedulerData.map((crew, crewIdx) => (
                  <tr key={crew.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 sticky left-0 bg-white border-r border-gray-100">
                      <div className="flex items-center space-x-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: crewColors[crewIdx % crewColors.length] }}
                        />
                        <div>
                          <div className="font-medium text-gray-900">{crew.name}</div>
                          <div className="text-xs text-gray-500">{crew.resourceType}</div>
                        </div>
                      </div>
                    </td>
                    {weekDates.map((date, dayIdx) => {
                      const dateStr = date.toISOString().split('T')[0];
                      const dayJobs = crew.appointments?.filter(apt => {
                        const aptDate = new Date(apt.scheduledStart).toISOString().split('T')[0];
                        return aptDate === dateStr;
                      }) || [];

                      return (
                        <td
                          key={dayIdx}
                          className="px-1 py-2 align-top border-r border-gray-100 min-h-[80px]"
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            const jobId = e.dataTransfer.getData('jobId');
                            if (jobId) {
                              // Handle drop - schedule job for this crew on this date
                              console.log('Schedule job', jobId, 'for crew', crew.id, 'on', dateStr);
                            }
                          }}
                        >
                          <div className="space-y-1">
                            {dayJobs.map((job) => (
                              <div
                                key={job.id}
                                onClick={() => setSelectedAppointment(job)}
                                className="p-2 rounded text-xs cursor-pointer hover:opacity-80 transition-opacity"
                                style={{
                                  backgroundColor: crewColors[crewIdx % crewColors.length] + '20',
                                  borderLeft: `3px solid ${crewColors[crewIdx % crewColors.length]}`,
                                }}
                              >
                                <div className="font-medium truncate">{job.workOrder?.account?.name || job.subject}</div>
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
                            ))}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {crewSchedulerData.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      <Users className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                      <p>No crews/resources configured</p>
                      <p className="text-sm mt-1">Add service resources to start scheduling</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
        <div className="text-xs mt-1 truncate">{apt.account?.name || apt.contact?.name || ''}</div>
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
              <div className="truncate opacity-80">{apt.account?.name}</div>
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
              <p className="mt-1 text-gray-900">{apt.account?.name || '-'}</p>
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
