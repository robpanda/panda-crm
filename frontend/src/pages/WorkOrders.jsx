import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Wrench, Search, Filter, Plus, Calendar, Clock, CheckCircle, AlertCircle,
  Play, Pause, XCircle, RefreshCw, Building2, MapPin, User, MoreVertical, X,
  ChevronDown, ClipboardList, Truck, Settings
} from 'lucide-react';
import { workOrdersApi } from '../services/api';

// Status configurations
const statusConfig = {
  NEW: { label: 'New', color: 'bg-blue-100 text-blue-700', icon: ClipboardList },
  READY_TO_SCHEDULE: { label: 'Ready to Schedule', color: 'bg-indigo-100 text-indigo-700', icon: Clock },
  SCHEDULED: { label: 'Scheduled', color: 'bg-purple-100 text-purple-700', icon: Calendar },
  IN_PROGRESS: { label: 'In Progress', color: 'bg-yellow-100 text-yellow-700', icon: Play },
  ON_HOLD: { label: 'On Hold', color: 'bg-orange-100 text-orange-700', icon: Pause },
  COMPLETED: { label: 'Completed', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  CANCELLED: { label: 'Cancelled', color: 'bg-gray-100 text-gray-500', icon: XCircle },
  CANCELED: { label: 'Cancelled', color: 'bg-gray-100 text-gray-500', icon: XCircle },
};

const priorityConfig = {
  LOW: { label: 'Low', color: 'text-gray-500' },
  NORMAL: { label: 'Normal', color: 'text-blue-600' },
  HIGH: { label: 'High', color: 'text-orange-600' },
  URGENT: { label: 'Urgent', color: 'text-red-600' },
};

export default function WorkOrders() {
  const [searchParams, setSearchParams] = useSearchParams();

  // State
  const [workOrders, setWorkOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');
  const [priorityFilter, setPriorityFilter] = useState(searchParams.get('priority') || 'all');

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Detail modal
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Load data
  useEffect(() => {
    loadWorkOrders();
    loadStats();
  }, [page, statusFilter, priorityFilter]);

  const loadWorkOrders = async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 20,
        search: search || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        priority: priorityFilter !== 'all' ? priorityFilter : undefined,
      };

      const response = await workOrdersApi.getWorkOrders(params);
      setWorkOrders(response.data || []);
      setTotalPages(response.pagination?.totalPages || 1);
    } catch (err) {
      console.error('Error loading work orders:', err);
      setError(err.message || 'Failed to load work orders');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await workOrdersApi.getWorkOrderStats();
      setStats(response.data || response);
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    loadWorkOrders();
  };

  const handleStatusChange = async (workOrder, newStatus) => {
    try {
      await workOrdersApi.updateWorkOrder(workOrder.id, { status: newStatus });
      loadWorkOrders();
      loadStats();
    } catch (err) {
      setError(err.message || 'Failed to update work order');
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

  const formatDateTime = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Work Orders</h1>
          <p className="text-gray-500">Manage work orders and service appointments</p>
        </div>
        <Link
          to="/workorders/new"
          className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90"
        >
          <Plus className="w-4 h-4" />
          <span>Create Work Order</span>
        </Link>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="flex items-center p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <AlertCircle className="w-5 h-5 mr-2" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total || 0}</p>
              </div>
              <div className="p-3 bg-gray-100 rounded-lg">
                <Wrench className="w-6 h-6 text-gray-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">New</p>
                <p className="text-2xl font-bold text-blue-600">{stats.new || 0}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <ClipboardList className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Ready to Schedule</p>
                <p className="text-2xl font-bold text-indigo-600">{stats.readyToSchedule || 0}</p>
              </div>
              <div className="p-3 bg-indigo-100 rounded-lg">
                <Clock className="w-6 h-6 text-indigo-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Scheduled</p>
                <p className="text-2xl font-bold text-purple-600">{stats.scheduled || 0}</p>
              </div>
              <div className="p-3 bg-purple-100 rounded-lg">
                <Calendar className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">In Progress</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.inProgress || 0}</p>
              </div>
              <div className="p-3 bg-yellow-100 rounded-lg">
                <Play className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Completed</p>
                <p className="text-2xl font-bold text-green-600">{stats.completed || 0}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search work orders..."
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
              />
            </div>
          </form>

          {/* Status Filter */}
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
            >
              <option value="all">All Status</option>
              <option value="NEW">New</option>
              <option value="READY_TO_SCHEDULE">Ready to Schedule</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="ON_HOLD">On Hold</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
          >
            <option value="all">All Priority</option>
            <option value="LOW">Low</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>

          {/* Refresh */}
          <button
            onClick={() => { loadWorkOrders(); loadStats(); }}
            className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Work Orders Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Work Order</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Account</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Scheduled</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary mx-auto" />
                  </td>
                </tr>
              ) : workOrders.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-gray-500">
                    <Wrench className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                    <p className="text-lg font-medium text-gray-900">No work orders found</p>
                    <p className="mt-1">Create your first work order to get started</p>
                  </td>
                </tr>
              ) : (
                workOrders.map((workOrder) => {
                  const StatusIcon = statusConfig[workOrder.status]?.icon || ClipboardList;
                  return (
                    <tr key={workOrder.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <button
                          onClick={() => { setSelectedWorkOrder(workOrder); setShowDetailModal(true); }}
                          className="font-medium text-panda-primary hover:underline text-left"
                        >
                          {workOrder.workOrderNumber}
                        </button>
                        {workOrder.subject && (
                          <p className="text-sm text-gray-500 truncate max-w-[200px]">{workOrder.subject}</p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center mr-3">
                            <Building2 className="w-4 h-4 text-purple-600" />
                          </div>
                          <div>
                            <Link
                              to={`/accounts/${workOrder.accountId}`}
                              className="font-medium text-gray-900 hover:text-panda-primary"
                            >
                              {workOrder.account?.name || 'Unknown'}
                            </Link>
                            {workOrder.opportunity && (
                              <Link
                                to={`/jobs/${workOrder.opportunityId}`}
                                className="block text-xs text-gray-500 hover:text-panda-primary"
                              >
                                {workOrder.opportunity.name}
                              </Link>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <Settings className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-900">{workOrder.workType?.name || 'General'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[workOrder.status]?.color || 'bg-gray-100 text-gray-700'}`}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {statusConfig[workOrder.status]?.label || workOrder.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-sm font-medium ${priorityConfig[workOrder.priority]?.color || 'text-gray-600'}`}>
                          {priorityConfig[workOrder.priority]?.label || workOrder.priority}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {workOrder.startDate ? (
                          <div className="flex items-center space-x-1">
                            <Calendar className="w-4 h-4 text-gray-400" />
                            <span>{formatDateTime(workOrder.startDate)}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400">Not scheduled</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          {workOrder.status === 'NEW' && (
                            <button
                              onClick={() => handleStatusChange(workOrder, 'IN_PROGRESS')}
                              className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                              title="Start Work"
                            >
                              <Play className="w-4 h-4" />
                            </button>
                          )}
                          {workOrder.status === 'IN_PROGRESS' && (
                            <>
                              <button
                                onClick={() => handleStatusChange(workOrder, 'ON_HOLD')}
                                className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg"
                                title="Put On Hold"
                              >
                                <Pause className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleStatusChange(workOrder, 'COMPLETED')}
                                className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                                title="Complete"
                              >
                                <CheckCircle className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {workOrder.status === 'ON_HOLD' && (
                            <button
                              onClick={() => handleStatusChange(workOrder, 'IN_PROGRESS')}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                              title="Resume"
                            >
                              <Play className="w-4 h-4" />
                            </button>
                          )}
                          <div className="relative group">
                            <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                              <MoreVertical className="w-4 h-4" />
                            </button>
                            <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10 hidden group-hover:block">
                              <button
                                onClick={() => { setSelectedWorkOrder(workOrder); setShowDetailModal(true); }}
                                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                              >
                                View Details
                              </button>
                              <Link
                                to={`/workorders/${workOrder.id}/edit`}
                                className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                              >
                                Edit Work Order
                              </Link>
                              {workOrder.status !== 'CANCELLED' && workOrder.status !== 'COMPLETED' && (
                                <button
                                  onClick={() => handleStatusChange(workOrder, 'CANCELLED')}
                                  className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                                >
                                  Cancel Work Order
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </p>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedWorkOrder && (
        <WorkOrderDetailModal
          workOrder={selectedWorkOrder}
          onClose={() => { setShowDetailModal(false); setSelectedWorkOrder(null); }}
          onStatusChange={(newStatus) => {
            handleStatusChange(selectedWorkOrder, newStatus);
            setShowDetailModal(false);
            setSelectedWorkOrder(null);
          }}
        />
      )}
    </div>
  );
}

// Work Order Detail Modal
function WorkOrderDetailModal({ workOrder, onClose, onStatusChange }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAppointments();
  }, [workOrder.id]);

  const loadAppointments = async () => {
    try {
      // Appointments would be loaded here if we had them associated
      setAppointments(workOrder.serviceAppointments || []);
    } catch (err) {
      console.error('Error loading appointments:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const StatusIcon = statusConfig[workOrder.status]?.icon || ClipboardList;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center space-x-3">
                <h2 className="text-xl font-semibold text-gray-900">{workOrder.workOrderNumber}</h2>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[workOrder.status]?.color || 'bg-gray-100 text-gray-700'}`}>
                  <StatusIcon className="w-3 h-3 mr-1" />
                  {statusConfig[workOrder.status]?.label || workOrder.status}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1">{workOrder.subject || 'No subject'}</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-1">
                <Building2 className="w-4 h-4 text-gray-400" />
                <p className="text-sm text-gray-500">Account</p>
              </div>
              <p className="font-medium text-gray-900">{workOrder.account?.name || 'Unknown'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-1">
                <Settings className="w-4 h-4 text-gray-400" />
                <p className="text-sm text-gray-500">Work Type</p>
              </div>
              <p className="font-medium text-gray-900">{workOrder.workType?.name || 'General'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-1">
                <Calendar className="w-4 h-4 text-gray-400" />
                <p className="text-sm text-gray-500">Start Date</p>
              </div>
              <p className="font-medium text-gray-900">{formatDateTime(workOrder.startDate)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-1">
                <Clock className="w-4 h-4 text-gray-400" />
                <p className="text-sm text-gray-500">End Date</p>
              </div>
              <p className="font-medium text-gray-900">{formatDateTime(workOrder.endDate)}</p>
            </div>
          </div>

          {/* Description */}
          {workOrder.description && (
            <div className="mb-6">
              <h3 className="font-semibold text-gray-900 mb-2">Description</h3>
              <p className="text-gray-600 bg-gray-50 rounded-lg p-4">{workOrder.description}</p>
            </div>
          )}

          {/* Service Appointments */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Service Appointments</h3>
            {loading ? (
              <div className="text-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-panda-primary mx-auto" />
              </div>
            ) : appointments.length === 0 ? (
              <div className="text-center py-4 text-gray-500 bg-gray-50 rounded-lg">
                No service appointments scheduled
              </div>
            ) : (
              <div className="space-y-2">
                {appointments.map((apt) => (
                  <div key={apt.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-purple-100 rounded-lg">
                        <Calendar className="w-4 h-4 text-purple-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{apt.appointmentNumber}</p>
                        <p className="text-xs text-gray-500">{formatDateTime(apt.scheduledStart)}</p>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      apt.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                      apt.status === 'SCHEDULED' ? 'bg-purple-100 text-purple-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {apt.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-gray-100 flex justify-between">
          <div className="flex space-x-2">
            {workOrder.status === 'NEW' && (
              <button
                onClick={() => onStatusChange('IN_PROGRESS')}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Start Work
              </button>
            )}
            {workOrder.status === 'IN_PROGRESS' && (
              <>
                <button
                  onClick={() => onStatusChange('COMPLETED')}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Complete
                </button>
                <button
                  onClick={() => onStatusChange('ON_HOLD')}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
                >
                  Put On Hold
                </button>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
