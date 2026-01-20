import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  FileQuestion, Search, Filter, Plus, AlertCircle, CheckCircle, Clock,
  MessageSquare, RefreshCw, Building2, X, ArrowUp, RotateCcw, Send,
  ChevronDown, MoreVertical, User, Calendar, XCircle
} from 'lucide-react';
import { casesApi } from '../services/api';

// Status configurations
const statusConfig = {
  NEW: { label: 'New', color: 'bg-blue-100 text-blue-700', icon: FileQuestion },
  OPEN: { label: 'Open', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  IN_PROGRESS: { label: 'In Progress', color: 'bg-purple-100 text-purple-700', icon: Clock },
  ESCALATED: { label: 'Escalated', color: 'bg-red-100 text-red-700', icon: ArrowUp },
  PENDING: { label: 'Pending', color: 'bg-orange-100 text-orange-700', icon: Clock },
  RESOLVED: { label: 'Resolved', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  CLOSED: { label: 'Closed', color: 'bg-gray-100 text-gray-500', icon: XCircle },
};

const priorityConfig = {
  LOW: { label: 'Low', color: 'text-gray-500', bg: 'bg-gray-100' },
  NORMAL: { label: 'Normal', color: 'text-blue-600', bg: 'bg-blue-100' },
  HIGH: { label: 'High', color: 'text-orange-600', bg: 'bg-orange-100' },
  URGENT: { label: 'Urgent', color: 'text-red-600', bg: 'bg-red-100' },
};

const typeOptions = [
  'Customer Issue',
  'Warranty Claim',
  'Service Request',
  'Billing Question',
  'Complaint',
  'Feedback',
  'Other',
];

export default function Cases() {
  const [searchParams, setSearchParams] = useSearchParams();

  // State
  const [cases, setCases] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');
  const [priorityFilter, setPriorityFilter] = useState(searchParams.get('priority') || 'all');
  const [typeFilter, setTypeFilter] = useState(searchParams.get('type') || 'all');

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Modals
  const [selectedCase, setSelectedCase] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showNewCaseModal, setShowNewCaseModal] = useState(false);

  // Load data
  useEffect(() => {
    loadCases();
    loadStats();
  }, [page, statusFilter, priorityFilter, typeFilter]);

  const loadCases = async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 20,
        search: search || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        priority: priorityFilter !== 'all' ? priorityFilter : undefined,
        type: typeFilter !== 'all' ? typeFilter : undefined,
      };

      const response = await casesApi.getCases(params);
      setCases(response.data || []);
      setTotalPages(response.pagination?.totalPages || 1);
    } catch (err) {
      console.error('Error loading cases:', err);
      setError(err.message || 'Failed to load cases');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await casesApi.getCaseStats();
      setStats(response.data || response);
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    loadCases();
  };

  const handleEscalate = async (caseItem) => {
    try {
      await casesApi.escalateCase(caseItem.id);
      loadCases();
      loadStats();
    } catch (err) {
      setError(err.message || 'Failed to escalate case');
    }
  };

  const handleClose = async (caseItem) => {
    if (!window.confirm('Are you sure you want to close this case?')) return;
    try {
      await casesApi.closeCase(caseItem.id);
      loadCases();
      loadStats();
    } catch (err) {
      setError(err.message || 'Failed to close case');
    }
  };

  const handleReopen = async (caseItem) => {
    try {
      await casesApi.reopenCase(caseItem.id);
      loadCases();
      loadStats();
    } catch (err) {
      setError(err.message || 'Failed to reopen case');
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

  const formatRelativeTime = (date) => {
    if (!date) return '-';
    const now = new Date();
    const then = new Date(date);
    const diffMs = now - then;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMinutes > 0) return `${diffMinutes}m ago`;
    return 'Just now';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cases</h1>
          <p className="text-gray-500">Manage customer service cases and support tickets</p>
        </div>
        <button
          onClick={() => setShowNewCaseModal(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90"
        >
          <Plus className="w-4 h-4" />
          <span>Create Case</span>
        </button>
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
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Open</p>
                <p className="text-2xl font-bold text-gray-900">{stats.open || 0}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <FileQuestion className="w-6 h-6 text-blue-600" />
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
                <Clock className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Escalated</p>
                <p className="text-2xl font-bold text-red-600">{stats.escalated || 0}</p>
              </div>
              <div className="p-3 bg-red-100 rounded-lg">
                <ArrowUp className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Resolved Today</p>
                <p className="text-2xl font-bold text-green-600">{stats.resolvedToday || 0}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Avg Resolution</p>
                <p className="text-2xl font-bold text-purple-600">{stats.avgResolutionHours || 0}h</p>
              </div>
              <div className="p-3 bg-purple-100 rounded-lg">
                <Clock className="w-6 h-6 text-purple-600" />
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
                placeholder="Search cases..."
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
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="ESCALATED">Escalated</option>
              <option value="PENDING">Pending</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
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

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
          >
            <option value="all">All Types</option>
            {typeOptions.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>

          {/* Refresh */}
          <button
            onClick={() => { loadCases(); loadStats(); }}
            className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Cases Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Case</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Account</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
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
              ) : cases.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-gray-500">
                    <FileQuestion className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                    <p className="text-lg font-medium text-gray-900">No cases found</p>
                    <p className="mt-1">Create your first case to start tracking</p>
                  </td>
                </tr>
              ) : (
                cases.map((caseItem) => {
                  const StatusIcon = statusConfig[caseItem.status]?.icon || FileQuestion;
                  return (
                    <tr key={caseItem.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <button
                          onClick={() => { setSelectedCase(caseItem); setShowDetailModal(true); }}
                          className="font-medium text-panda-primary hover:underline text-left"
                        >
                          {caseItem.caseNumber}
                        </button>
                        <p className="text-sm text-gray-500 truncate max-w-[250px]">{caseItem.subject}</p>
                      </td>
                      <td className="px-6 py-4">
                        {caseItem.account ? (
                          <div className="flex items-center">
                            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center mr-3">
                              <Building2 className="w-4 h-4 text-purple-600" />
                            </div>
                            <Link
                              to={`/accounts/${caseItem.accountId}`}
                              className="font-medium text-gray-900 hover:text-panda-primary"
                            >
                              {caseItem.account.name}
                            </Link>
                          </div>
                        ) : (
                          <span className="text-gray-400">No account</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {caseItem.type || '-'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[caseItem.status]?.color || 'bg-gray-100 text-gray-700'}`}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {statusConfig[caseItem.status]?.label || caseItem.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${priorityConfig[caseItem.priority]?.bg || 'bg-gray-100'} ${priorityConfig[caseItem.priority]?.color || 'text-gray-600'}`}>
                          {priorityConfig[caseItem.priority]?.label || caseItem.priority}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <div className="flex items-center space-x-1">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span>{formatRelativeTime(caseItem.createdAt)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          {caseItem.status !== 'ESCALATED' && caseItem.status !== 'CLOSED' && caseItem.status !== 'RESOLVED' && (
                            <button
                              onClick={() => handleEscalate(caseItem)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                              title="Escalate"
                            >
                              <ArrowUp className="w-4 h-4" />
                            </button>
                          )}
                          {caseItem.status !== 'CLOSED' && caseItem.status !== 'RESOLVED' && (
                            <button
                              onClick={() => handleClose(caseItem)}
                              className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                              title="Close Case"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                          )}
                          {(caseItem.status === 'CLOSED' || caseItem.status === 'RESOLVED') && (
                            <button
                              onClick={() => handleReopen(caseItem)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                              title="Reopen"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => { setSelectedCase(caseItem); setShowDetailModal(true); }}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
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
      {showDetailModal && selectedCase && (
        <CaseDetailModal
          caseItem={selectedCase}
          onClose={() => { setShowDetailModal(false); setSelectedCase(null); }}
          onUpdate={() => { loadCases(); loadStats(); }}
        />
      )}

      {/* New Case Modal */}
      {showNewCaseModal && (
        <NewCaseModal
          onClose={() => setShowNewCaseModal(false)}
          onSuccess={() => { setShowNewCaseModal(false); loadCases(); loadStats(); }}
        />
      )}
    </div>
  );
}

// Case Detail Modal with Comments
function CaseDetailModal({ caseItem, onClose, onUpdate }) {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadComments();
  }, [caseItem.id]);

  const loadComments = async () => {
    try {
      const response = await casesApi.getCaseComments(caseItem.id);
      setComments(response.data || []);
    } catch (err) {
      console.error('Error loading comments:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setSubmitting(true);
    try {
      await casesApi.addCaseComment(caseItem.id, { content: newComment });
      setNewComment('');
      loadComments();
    } catch (err) {
      console.error('Error adding comment:', err);
    } finally {
      setSubmitting(false);
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

  const StatusIcon = statusConfig[caseItem.status]?.icon || FileQuestion;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center space-x-3">
                <h2 className="text-xl font-semibold text-gray-900">{caseItem.caseNumber}</h2>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[caseItem.status]?.color || 'bg-gray-100 text-gray-700'}`}>
                  <StatusIcon className="w-3 h-3 mr-1" />
                  {statusConfig[caseItem.status]?.label || caseItem.status}
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${priorityConfig[caseItem.priority]?.bg || 'bg-gray-100'} ${priorityConfig[caseItem.priority]?.color || 'text-gray-600'}`}>
                  {priorityConfig[caseItem.priority]?.label || caseItem.priority}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1">{caseItem.subject}</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Details */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-1">
                <Building2 className="w-4 h-4 text-gray-400" />
                <p className="text-sm text-gray-500">Account</p>
              </div>
              <p className="font-medium text-gray-900">{caseItem.account?.name || 'No account'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-1">
                <FileQuestion className="w-4 h-4 text-gray-400" />
                <p className="text-sm text-gray-500">Type</p>
              </div>
              <p className="font-medium text-gray-900">{caseItem.type || 'Not specified'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-1">
                <Calendar className="w-4 h-4 text-gray-400" />
                <p className="text-sm text-gray-500">Created</p>
              </div>
              <p className="font-medium text-gray-900">{formatDateTime(caseItem.createdAt)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-1">
                <Clock className="w-4 h-4 text-gray-400" />
                <p className="text-sm text-gray-500">Updated</p>
              </div>
              <p className="font-medium text-gray-900">{formatDateTime(caseItem.updatedAt)}</p>
            </div>
          </div>

          {/* Description */}
          {caseItem.description && (
            <div className="mb-6">
              <h3 className="font-semibold text-gray-900 mb-2">Description</h3>
              <p className="text-gray-600 bg-gray-50 rounded-lg p-4 whitespace-pre-wrap">{caseItem.description}</p>
            </div>
          )}

          {/* Comments */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Comments</h3>
            {loading ? (
              <div className="text-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-panda-primary mx-auto" />
              </div>
            ) : (
              <div className="space-y-3 mb-4">
                {comments.length === 0 ? (
                  <p className="text-gray-500 text-center py-4 bg-gray-50 rounded-lg">No comments yet</p>
                ) : (
                  comments.map((comment) => (
                    <div key={comment.id} className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <div className="w-8 h-8 rounded-full bg-panda-primary/10 flex items-center justify-center">
                            <User className="w-4 h-4 text-panda-primary" />
                          </div>
                          <span className="font-medium text-gray-900">{comment.user?.name || 'Unknown'}</span>
                        </div>
                        <span className="text-xs text-gray-500">{formatDateTime(comment.createdAt)}</span>
                      </div>
                      <p className="text-gray-600">{comment.content}</p>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Add Comment Form */}
            <form onSubmit={handleAddComment} className="flex space-x-2">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
              />
              <button
                type="submit"
                disabled={submitting || !newComment.trim()}
                className="px-4 py-2 bg-panda-primary text-white rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

        <div className="p-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// New Case Modal
function NewCaseModal({ onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    subject: '',
    description: '',
    type: '',
    priority: 'NORMAL',
    accountId: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await casesApi.createCase(formData);
      onSuccess();
    } catch (err) {
      setError(err.message || 'Failed to create case');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Create New Case</h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label>
            <input
              type="text"
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
            >
              <option value="">Select type...</option>
              {typeOptions.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <select
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
            >
              <option value="LOW">Low</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
              rows="4"
              placeholder="Describe the issue..."
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Case'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
