import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { attentionApi } from '../services/api';
import {
  AlertCircle,
  Target,
  Users,
  FileText,
  Phone,
  Clock,
  CheckCircle,
  XCircle,
  Bell,
  BellOff,
  DollarSign,
  Calendar,
  MessageSquare,
  AlertTriangle,
  Briefcase,
  RefreshCw,
  Filter,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Check,
  X,
  Play,
  Pause,
  ExternalLink,
  User,
  Building2,
  Scale,
  FileCheck,
  Wrench,
  Receipt,
  Inbox,
  Zap,
} from 'lucide-react';

// Urgency badge colors
const urgencyColors = {
  CRITICAL: 'bg-red-600 text-white',
  HIGH: 'bg-red-500 text-white',
  MEDIUM: 'bg-yellow-500 text-white',
  LOW: 'bg-green-500 text-white',
};

const urgencyDot = {
  CRITICAL: 'bg-red-600 animate-pulse',
  HIGH: 'bg-red-500',
  MEDIUM: 'bg-yellow-500',
  LOW: 'bg-green-500',
};

// Category icons
const categoryIcons = {
  TASK: Briefcase,
  COMMUNICATION: MessageSquare,
  FINANCIAL: DollarSign,
  APPROVAL: Scale,
  SCHEDULING: Calendar,
  DOCUMENT: FileCheck,
  ESCALATION: AlertTriangle,
};

// Type icons
const typeIcons = {
  FOLLOW_UP: Phone,
  CALLBACK_REQUEST: Phone,
  OVERDUE_TASK: Clock,
  OVERDUE_INVOICE: Receipt,
  APPROVAL_NEEDED: Scale,
  SCHEDULE_CONFLICT: Calendar,
  UNREAD_MESSAGE: MessageSquare,
  STALLED_DEAL: Target,
  MISSING_INFO: AlertCircle,
  CUSTOMER_COMPLAINT: AlertTriangle,
  INSPECTION_DUE: Wrench,
  SUPPLEMENT_PENDING: FileText,
  PAYMENT_ISSUE: DollarSign,
  DOCUMENT_NEEDED: FileCheck,
  WORK_ORDER_ISSUE: Wrench,
  CASE_ESCALATION: AlertTriangle,
  LEAD_AGING: Users,
  QUOTE_EXPIRING: FileText,
  CONTRACT_ISSUE: FileText,
  GENERAL: Bell,
};

// Stats Card Component
function StatCard({ label, value, icon: Icon, color, onClick, active }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center space-x-4 p-4 rounded-xl border transition-all ${
        active
          ? 'border-panda-primary bg-panda-primary/5 ring-2 ring-panda-primary/20'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md'
      }`}
    >
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div className="text-left">
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </button>
  );
}

// Attention Item Row Component
function AttentionItemRow({ item, selected, onSelect, onAction }) {
  const [showActions, setShowActions] = useState(false);
  const navigate = useNavigate();
  const TypeIcon = typeIcons[item.type] || Bell;

  const handleNavigate = () => {
    if (item.actionUrl) {
      navigate(item.actionUrl);
    }
  };

  const formatTimeAgo = (date) => {
    const now = new Date();
    const then = new Date(date);
    const diff = Math.floor((now - then) / 1000);

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return then.toLocaleDateString();
  };

  return (
    <div
      className={`bg-white border rounded-xl p-4 transition-all hover:shadow-md ${
        selected ? 'border-panda-primary ring-2 ring-panda-primary/20' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Selection checkbox */}
        <div className="pt-1">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onSelect(item.id)}
            className="w-4 h-4 text-panda-primary rounded border-gray-300 focus:ring-panda-primary"
          />
        </div>

        {/* Urgency indicator */}
        <div className="pt-2">
          <div className={`w-3 h-3 rounded-full ${urgencyDot[item.urgency]}`} />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <TypeIcon className="w-4 h-4 text-gray-400" />
            <span className="text-xs text-gray-500 uppercase tracking-wide">
              {item.type.replace(/_/g, ' ')}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${urgencyColors[item.urgency]}`}>
              {item.urgency}
            </span>
            {item.daysOverdue > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                {item.daysOverdue}d overdue
              </span>
            )}
          </div>

          <h3
            className="font-medium text-gray-900 mb-1 cursor-pointer hover:text-panda-primary"
            onClick={handleNavigate}
          >
            {item.title}
          </h3>

          {item.description && (
            <p className="text-sm text-gray-500 mb-2 line-clamp-2">{item.description}</p>
          )}

          {/* Related records */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
            {item.opportunity && (
              <Link
                to={`/jobs/${item.opportunity.id}`}
                className="flex items-center gap-1 hover:text-panda-primary"
              >
                <Target className="w-3 h-3" />
                {item.opportunity.name}
              </Link>
            )}
            {item.account && (
              <Link
                to={`/accounts/${item.account.id}`}
                className="flex items-center gap-1 hover:text-panda-primary"
              >
                <Building2 className="w-3 h-3" />
                {item.account.name}
              </Link>
            )}
            {item.contact && (
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" />
                {item.contact.firstName} {item.contact.lastName}
              </span>
            )}
            {item.amount && (
              <span className="flex items-center gap-1 text-green-600 font-medium">
                <DollarSign className="w-3 h-3" />
                {Number(item.amount).toLocaleString()}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTimeAgo(item.createdAt)}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {item.actionUrl && (
            <button
              onClick={handleNavigate}
              className="p-2 text-gray-400 hover:text-panda-primary hover:bg-gray-100 rounded-lg transition-colors"
              title="Go to record"
            >
              <ExternalLink className="w-5 h-5" />
            </button>
          )}

          <div className="relative">
            <button
              onClick={() => setShowActions(!showActions)}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>

            {showActions && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowActions(false)} />
                <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-20">
                  <button
                    onClick={() => {
                      onAction('complete', item.id);
                      setShowActions(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <Check className="w-4 h-4 text-green-500" />
                    Mark Complete
                  </button>
                  <button
                    onClick={() => {
                      onAction('start', item.id);
                      setShowActions(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <Play className="w-4 h-4 text-blue-500" />
                    Start Working
                  </button>
                  <div className="border-t border-gray-100 my-1" />
                  <button
                    onClick={() => {
                      onAction('snooze', item.id, '1h');
                      setShowActions(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <Pause className="w-4 h-4 text-yellow-500" />
                    Snooze 1 hour
                  </button>
                  <button
                    onClick={() => {
                      onAction('snooze', item.id, '1d');
                      setShowActions(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <Pause className="w-4 h-4 text-yellow-500" />
                    Snooze 1 day
                  </button>
                  <button
                    onClick={() => {
                      onAction('snooze', item.id, '1w');
                      setShowActions(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <Pause className="w-4 h-4 text-yellow-500" />
                    Snooze 1 week
                  </button>
                  <div className="border-t border-gray-100 my-1" />
                  <button
                    onClick={() => {
                      onAction('dismiss', item.id);
                      setShowActions(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    Dismiss
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AttentionQueue() {
  const queryClient = useQueryClient();
  const [selectedItems, setSelectedItems] = useState([]);
  const [filters, setFilters] = useState({
    urgency: null,
    category: null,
    type: null,
    showAll: false,
  });
  const [showFilters, setShowFilters] = useState(false);

  // Fetch attention items
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['attention-items', filters],
    queryFn: () =>
      attentionApi.getItems({
        urgency: filters.urgency,
        category: filters.category,
        type: filters.type,
        all: filters.showAll ? 'true' : undefined,
        limit: 100,
      }),
  });

  // Fetch stats
  const { data: statsData } = useQuery({
    queryKey: ['attention-stats', filters.showAll],
    queryFn: () => attentionApi.getStats({ all: filters.showAll ? 'true' : undefined }),
  });

  const stats = statsData?.data || {};
  const items = data?.items || [];

  // Mutations
  const completeMutation = useMutation({
    mutationFn: (id) => attentionApi.completeItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attention-items'] });
      queryClient.invalidateQueries({ queryKey: ['attention-stats'] });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: (id) => attentionApi.dismissItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attention-items'] });
      queryClient.invalidateQueries({ queryKey: ['attention-stats'] });
    },
  });

  const snoozeMutation = useMutation({
    mutationFn: ({ id, duration }) => attentionApi.snoozeItem(id, duration),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attention-items'] });
      queryClient.invalidateQueries({ queryKey: ['attention-stats'] });
    },
  });

  const startMutation = useMutation({
    mutationFn: (id) => attentionApi.startItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attention-items'] });
    },
  });

  const refreshMutation = useMutation({
    mutationFn: () => attentionApi.refreshQueue(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attention-items'] });
      queryClient.invalidateQueries({ queryKey: ['attention-stats'] });
    },
  });

  const bulkCompleteMutation = useMutation({
    mutationFn: (ids) => attentionApi.bulkComplete(ids),
    onSuccess: () => {
      setSelectedItems([]);
      queryClient.invalidateQueries({ queryKey: ['attention-items'] });
      queryClient.invalidateQueries({ queryKey: ['attention-stats'] });
    },
  });

  const bulkDismissMutation = useMutation({
    mutationFn: (ids) => attentionApi.bulkDismiss(ids),
    onSuccess: () => {
      setSelectedItems([]);
      queryClient.invalidateQueries({ queryKey: ['attention-items'] });
      queryClient.invalidateQueries({ queryKey: ['attention-stats'] });
    },
  });

  const handleAction = (action, id, extra) => {
    switch (action) {
      case 'complete':
        completeMutation.mutate(id);
        break;
      case 'dismiss':
        dismissMutation.mutate(id);
        break;
      case 'snooze':
        snoozeMutation.mutate({ id, duration: extra });
        break;
      case 'start':
        startMutation.mutate(id);
        break;
    }
  };

  const handleSelectItem = (id) => {
    setSelectedItems((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedItems.length === items.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(items.map((i) => i.id));
    }
  };

  const handleBulkAction = (action) => {
    if (action === 'complete') {
      bulkCompleteMutation.mutate(selectedItems);
    } else if (action === 'dismiss') {
      bulkDismissMutation.mutate(selectedItems);
    }
  };

  const setUrgencyFilter = (urgency) => {
    setFilters((prev) => ({
      ...prev,
      urgency: prev.urgency === urgency ? null : urgency,
    }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attention Queue</h1>
          <p className="text-gray-500">
            {stats.total || 0} items requiring your attention
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={filters.showAll}
              onChange={(e) => setFilters((prev) => ({ ...prev, showAll: e.target.checked }))}
              className="rounded border-gray-300 text-panda-primary focus:ring-panda-primary"
            />
            Show all (not just mine)
          </label>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors ${
              showFilters
                ? 'border-panda-primary bg-panda-primary/5 text-panda-primary'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
            <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
          <button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-panda-primary text-white rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <StatCard
          label="Total"
          value={stats.total || 0}
          icon={Inbox}
          color="bg-gray-600"
          onClick={() => setFilters((prev) => ({ ...prev, urgency: null }))}
          active={!filters.urgency}
        />
        <StatCard
          label="Critical"
          value={stats.byUrgency?.critical || 0}
          icon={Zap}
          color="bg-red-600"
          onClick={() => setUrgencyFilter('CRITICAL')}
          active={filters.urgency === 'CRITICAL'}
        />
        <StatCard
          label="High"
          value={stats.byUrgency?.high || 0}
          icon={AlertTriangle}
          color="bg-red-500"
          onClick={() => setUrgencyFilter('HIGH')}
          active={filters.urgency === 'HIGH'}
        />
        <StatCard
          label="Medium"
          value={stats.byUrgency?.medium || 0}
          icon={Bell}
          color="bg-yellow-500"
          onClick={() => setUrgencyFilter('MEDIUM')}
          active={filters.urgency === 'MEDIUM'}
        />
        <StatCard
          label="Low"
          value={stats.byUrgency?.low || 0}
          icon={CheckCircle}
          color="bg-green-500"
          onClick={() => setUrgencyFilter('LOW')}
          active={filters.urgency === 'LOW'}
        />
        <StatCard
          label="Overdue"
          value={stats.overdue || 0}
          icon={Clock}
          color="bg-purple-600"
        />
      </div>

      {/* Advanced Filters */}
      {showFilters && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={filters.category || ''}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, category: e.target.value || null }))
                }
                className="w-full rounded-lg border-gray-300 focus:border-panda-primary focus:ring-panda-primary"
              >
                <option value="">All Categories</option>
                <option value="TASK">Tasks</option>
                <option value="COMMUNICATION">Communication</option>
                <option value="FINANCIAL">Financial</option>
                <option value="APPROVAL">Approvals</option>
                <option value="SCHEDULING">Scheduling</option>
                <option value="DOCUMENT">Documents</option>
                <option value="ESCALATION">Escalations</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={filters.type || ''}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, type: e.target.value || null }))
                }
                className="w-full rounded-lg border-gray-300 focus:border-panda-primary focus:ring-panda-primary"
              >
                <option value="">All Types</option>
                <option value="FOLLOW_UP">Follow Up</option>
                <option value="CALLBACK_REQUEST">Callback Request</option>
                <option value="OVERDUE_INVOICE">Overdue Invoice</option>
                <option value="APPROVAL_NEEDED">Approval Needed</option>
                <option value="STALLED_DEAL">Stalled Deal</option>
                <option value="UNREAD_MESSAGE">Unread Message</option>
                <option value="LEAD_AGING">Aging Lead</option>
                <option value="QUOTE_EXPIRING">Expiring Quote</option>
                <option value="CASE_ESCALATION">Case Escalation</option>
                <option value="PAYMENT_ISSUE">Payment Issue</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() =>
                  setFilters({ urgency: null, category: null, type: null, showAll: filters.showAll })
                }
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category breakdown */}
      {stats.byCategory && Object.keys(stats.byCategory).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats.byCategory).map(([category, count]) => {
            const Icon = categoryIcons[category] || Bell;
            return (
              <button
                key={category}
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    category: prev.category === category ? null : category,
                  }))
                }
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-colors ${
                  filters.category === category
                    ? 'bg-panda-primary text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {category.replace(/_/g, ' ')}
                <span className="font-medium">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Bulk actions bar */}
      {selectedItems.length > 0 && (
        <div className="bg-panda-primary/10 border border-panda-primary/20 rounded-xl p-4 flex items-center justify-between">
          <span className="text-sm font-medium text-panda-primary">
            {selectedItems.length} item{selectedItems.length > 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleBulkAction('complete')}
              disabled={bulkCompleteMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              Complete All
            </button>
            <button
              onClick={() => handleBulkAction('dismiss')}
              disabled={bulkDismissMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50"
            >
              <X className="w-4 h-4" />
              Dismiss All
            </button>
            <button
              onClick={() => setSelectedItems([])}
              className="px-4 py-2 text-gray-600 hover:text-gray-900"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Items list header */}
      {items.length > 0 && (
        <div className="flex items-center gap-4 px-4">
          <input
            type="checkbox"
            checked={selectedItems.length === items.length && items.length > 0}
            onChange={handleSelectAll}
            className="w-4 h-4 text-panda-primary rounded border-gray-300 focus:ring-panda-primary"
          />
          <span className="text-sm text-gray-500">
            Select all ({items.length} items)
          </span>
        </div>
      )}

      {/* Items list */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary mx-auto"></div>
            <p className="text-gray-500 mt-4">Loading attention items...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <CheckCircle className="w-16 h-16 mx-auto text-green-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">All caught up!</h3>
            <p className="text-gray-500 mt-1">
              {filters.urgency || filters.category || filters.type
                ? 'No items match your current filters'
                : 'No items require your attention'}
            </p>
            {(filters.urgency || filters.category || filters.type) && (
              <button
                onClick={() =>
                  setFilters({ urgency: null, category: null, type: null, showAll: filters.showAll })
                }
                className="mt-4 text-panda-primary hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          items.map((item) => (
            <AttentionItemRow
              key={item.id}
              item={item}
              selected={selectedItems.includes(item.id)}
              onSelect={handleSelectItem}
              onAction={handleAction}
            />
          ))
        )}
      </div>

      {/* Pagination */}
      {data?.pagination && data.pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <span className="text-sm text-gray-500">
            Page {data.pagination.page} of {data.pagination.pages}
          </span>
        </div>
      )}
    </div>
  );
}
