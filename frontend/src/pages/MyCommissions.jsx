import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { commissionsApi, opportunitiesApi } from '../services/api';
import { format, parseISO, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear } from 'date-fns';
import { formatCurrency, formatNumber } from '../utils/formatters';
import {
  DollarSign,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  TrendingUp,
  Calendar,
  Filter,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Award,
  Briefcase,
  FileText,
  PauseCircle,
  XCircle,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  CreditCard,
} from 'lucide-react';

// Donut Chart Component
const DonutChart = ({ segments, size = 120, strokeWidth = 12 }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Calculate total for percentage calculations
  const total = segments.reduce((sum, seg) => sum + seg.value, 0);

  // Build the segments
  let currentOffset = 0;
  const paths = segments.map((segment, index) => {
    const percentage = total > 0 ? (segment.value / total) * 100 : 0;
    const dashLength = (percentage / 100) * circumference;
    const dashOffset = -currentOffset;
    currentOffset += dashLength;

    return (
      <circle
        key={index}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={segment.color}
        strokeWidth={strokeWidth}
        strokeDasharray={`${dashLength} ${circumference - dashLength}`}
        strokeDashoffset={dashOffset}
        className="transition-all duration-500"
        style={{ transformOrigin: 'center', transform: 'rotate(-90deg)' }}
      />
    );
  });

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
        />
        {/* Segments */}
        {paths}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <span className="text-2xl font-bold text-gray-900">{total}</span>
          <p className="text-xs text-gray-500">Total</p>
        </div>
      </div>
    </div>
  );
};

// Status Card Component
const StatusCard = ({ label, count, amount, icon: Icon, color, bgColor, link, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
      isActive
        ? `border-${color} ring-2 ring-${color}/20`
        : 'border-gray-100 hover:border-gray-200'
    } bg-white shadow-sm`}
  >
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{count}</p>
        <p className={`text-sm font-medium mt-1 ${color ? `text-${color}` : 'text-gray-600'}`}>
          {formatCurrency(amount)}
        </p>
      </div>
      <div className={`p-2 rounded-lg ${bgColor || 'bg-gray-100'}`}>
        <Icon className={`w-5 h-5 ${color ? `text-${color}` : 'text-gray-600'}`} />
      </div>
    </div>
  </button>
);

// Commission Row Component
const CommissionRow = ({ commission, expanded, onToggle }) => {
  const statusConfig = {
    NEW: { color: 'text-gray-600', bg: 'bg-gray-100', icon: Clock, label: 'Unrequested' },
    REQUESTED: { color: 'text-blue-600', bg: 'bg-blue-100', icon: FileText, label: 'Requested' },
    APPROVED: { color: 'text-green-600', bg: 'bg-green-100', icon: CheckCircle, label: 'Approved' },
    PAID: { color: 'text-emerald-600', bg: 'bg-emerald-100', icon: CreditCard, label: 'Paid' },
    HOLD: { color: 'text-yellow-600', bg: 'bg-yellow-100', icon: PauseCircle, label: 'On Hold' },
    DENIED: { color: 'text-red-600', bg: 'bg-red-100', icon: XCircle, label: 'Denied' },
  };

  const config = statusConfig[commission.status] || statusConfig.NEW;
  const StatusIcon = config.icon;

  return (
    <div className="border-b border-gray-100 last:border-0">
      <div
        className="flex items-center p-4 hover:bg-gray-50 cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link
              to={`/jobs/${commission.opportunityId}`}
              onClick={(e) => e.stopPropagation()}
              className="text-sm font-medium text-gray-900 hover:text-panda-primary truncate"
            >
              {typeof commission.opportunity?.name === 'string' ? commission.opportunity.name : (typeof commission.serviceContract?.contractNumber === 'string' ? commission.serviceContract.contractNumber : 'Unknown Job')}
            </Link>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {commission.commissionType || 'Sales Commission'}
            {commission.commissionRateOfPay && ` • ${commission.commissionRateOfPay}%`}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-semibold text-gray-900">
              {formatCurrency(commission.commissionAmount || 0)}
            </p>
            {commission.paidAmount && commission.status === 'PAID' && (
              <p className="text-xs text-green-600">
                Paid: {formatCurrency(commission.paidAmount)}
              </p>
            )}
          </div>
          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
            <StatusIcon className="w-3 h-3 mr-1" />
            {config.label}
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 bg-gray-50">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Contract Value</p>
              <p className="font-medium">{formatCurrency(commission.serviceContract?.grandTotal || commission.commissionValue || 0)}</p>
            </div>
            <div>
              <p className="text-gray-500">Rate</p>
              <p className="font-medium">{commission.commissionRateOfPay || 0}%</p>
            </div>
            <div>
              <p className="text-gray-500">Created</p>
              <p className="font-medium">
                {commission.createdAt ? format(parseISO(commission.createdAt), 'MMM d, yyyy') : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-gray-500">
                {commission.status === 'PAID' ? 'Paid Date' : 'Status Date'}
              </p>
              <p className="font-medium">
                {commission.paidDate
                  ? format(parseISO(commission.paidDate), 'MMM d, yyyy')
                  : commission.updatedAt
                    ? format(parseISO(commission.updatedAt), 'MMM d, yyyy')
                    : 'N/A'
                }
              </p>
            </div>
          </div>
          {commission.notes && (
            <div className="mt-3 p-2 bg-white rounded border border-gray-200">
              <p className="text-xs text-gray-500">Notes</p>
              <p className="text-sm text-gray-700">{commission.notes}</p>
            </div>
          )}
          {commission.opportunityId && (
            <div className="mt-3 flex gap-2">
              <Link
                to={`/jobs/${commission.opportunityId}`}
                className="inline-flex items-center text-xs text-panda-primary hover:underline"
              >
                <Eye className="w-3 h-3 mr-1" />
                View Job
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Pagination Component
const Pagination = ({ currentPage, totalPages, totalItems, itemsPerPage, onPageChange, onItemsPerPageChange }) => {
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  // Generate page numbers to show
  const getPageNumbers = () => {
    const pages = [];
    const maxPagesToShow = 5;

    if (totalPages <= maxPagesToShow) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      }
    }
    return pages;
  };

  if (totalItems === 0) return null;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 border-t border-gray-100">
      {/* Items per page selector */}
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <span>Show</span>
        <select
          value={itemsPerPage}
          onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
          className="px-2 py-1 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-panda-primary focus:border-transparent"
        >
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
        <span>per page</span>
      </div>

      {/* Page info */}
      <div className="text-sm text-gray-600">
        Showing {startItem}-{endItem} of {totalItems}
      </div>

      {/* Page navigation */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {getPageNumbers().map((page, index) => (
          page === '...' ? (
            <span key={`ellipsis-${index}`} className="px-2 text-gray-400">...</span>
          ) : (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                currentPage === page
                  ? 'bg-panda-primary text-white'
                  : 'hover:bg-gray-100 text-gray-700'
              }`}
            >
              {page}
            </button>
          )
        ))}

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default function MyCommissions() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  // Read initial status from URL params (e.g., ?status=PAID)
  const initialStatus = searchParams.get('status')?.toUpperCase() || 'ALL';

  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [dateFilter, setDateFilter] = useState('ALL_TIME');
  const [expandedId, setExpandedId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  const today = new Date();
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const lastMonthStart = startOfMonth(subMonths(today, 1));
  const lastMonthEnd = endOfMonth(subMonths(today, 1));
  const yearStart = startOfYear(today);
  const yearEnd = endOfYear(today);

  // Build date filter params - use startDate/endDate to match backend API
  const getDateFilterParams = () => {
    switch (dateFilter) {
      case 'THIS_MONTH':
        return { startDate: format(monthStart, 'yyyy-MM-dd'), endDate: format(monthEnd, 'yyyy-MM-dd') };
      case 'LAST_MONTH':
        return { startDate: format(lastMonthStart, 'yyyy-MM-dd'), endDate: format(lastMonthEnd, 'yyyy-MM-dd') };
      case 'THIS_YEAR':
        return { startDate: format(yearStart, 'yyyy-MM-dd'), endDate: format(yearEnd, 'yyyy-MM-dd') };
      default:
        return {};
    }
  };

  // Fetch all commissions for the user
  const { data: commissionsData, isLoading } = useQuery({
    queryKey: ['my-commissions-all', user?.id, dateFilter],
    queryFn: () => commissionsApi.getCommissions({
      ownerId: user?.id,
      limit: 500,
      include: 'serviceContract,opportunity',
      ...getDateFilterParams(),
    }),
    enabled: !!user?.id,
  });

  // Fetch commission summary
  const { data: summaryData } = useQuery({
    queryKey: ['my-commission-summary', user?.id],
    queryFn: () => commissionsApi.getSummary({ userId: user?.id }),
    enabled: !!user?.id,
  });

  // Fetch this month's paid commissions
  const { data: thisMonthPaidData } = useQuery({
    queryKey: ['my-commissions-paid-this-month', user?.id],
    queryFn: () => commissionsApi.getCommissions({
      ownerId: user?.id,
      status: 'PAID',
      paidDateFrom: format(monthStart, 'yyyy-MM-dd'),
      paidDateTo: format(monthEnd, 'yyyy-MM-dd'),
      limit: 100,
    }),
    enabled: !!user?.id,
  });

  // Fetch last month's paid commissions for comparison
  const { data: lastMonthPaidData } = useQuery({
    queryKey: ['my-commissions-paid-last-month', user?.id],
    queryFn: () => commissionsApi.getCommissions({
      ownerId: user?.id,
      status: 'PAID',
      paidDateFrom: format(lastMonthStart, 'yyyy-MM-dd'),
      paidDateTo: format(lastMonthEnd, 'yyyy-MM-dd'),
      limit: 100,
    }),
    enabled: !!user?.id,
  });

  const commissions = commissionsData?.data || [];

  // Calculate counts by status
  const statusCounts = {
    NEW: commissions.filter(c => c.status === 'NEW'),
    REQUESTED: commissions.filter(c => c.status === 'REQUESTED'),
    APPROVED: commissions.filter(c => c.status === 'APPROVED'),
    PAID: commissions.filter(c => c.status === 'PAID'),
    HOLD: commissions.filter(c => c.status === 'HOLD'),
    DENIED: commissions.filter(c => c.status === 'DENIED'),
  };

  // Calculate amounts by status
  const getAmount = (list) => list.reduce((sum, c) => sum + (parseFloat(c.commissionAmount) || 0), 0);
  const getPaidAmount = (list) => list.reduce((sum, c) => sum + (parseFloat(c.paidAmount || c.commissionAmount) || 0), 0);

  const statusAmounts = {
    NEW: getAmount(statusCounts.NEW),
    REQUESTED: getAmount(statusCounts.REQUESTED),
    APPROVED: getAmount(statusCounts.APPROVED),
    PAID: getPaidAmount(statusCounts.PAID),
    HOLD: getAmount(statusCounts.HOLD),
    DENIED: getAmount(statusCounts.DENIED),
  };

  // This month vs last month comparison
  const thisMonthPaid = thisMonthPaidData?.data || [];
  const lastMonthPaid = lastMonthPaidData?.data || [];
  const thisMonthPaidAmount = getPaidAmount(thisMonthPaid);
  const lastMonthPaidAmount = getPaidAmount(lastMonthPaid);
  const paidTrend = lastMonthPaidAmount > 0
    ? Math.round(((thisMonthPaidAmount - lastMonthPaidAmount) / lastMonthPaidAmount) * 100)
    : 0;

  // Unpaid total (NEW + REQUESTED + APPROVED)
  const unpaidAmount = statusAmounts.NEW + statusAmounts.REQUESTED + statusAmounts.APPROVED;
  const unpaidCount = statusCounts.NEW.length + statusCounts.REQUESTED.length + statusCounts.APPROVED.length;

  // Filter commissions based on selected status
  const filteredCommissions = statusFilter === 'ALL'
    ? commissions
    : statusCounts[statusFilter] || [];

  // Sort by date descending
  const sortedCommissions = [...filteredCommissions].sort((a, b) => {
    const dateA = new Date(a.createdAt || 0);
    const dateB = new Date(b.createdAt || 0);
    return dateB - dateA;
  });

  // Pagination calculations
  const totalItems = sortedCommissions.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const paginatedCommissions = sortedCommissions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset to page 1 when filter changes
  const handleStatusFilterChange = (newStatus) => {
    setStatusFilter(newStatus);
    setCurrentPage(1);
  };

  const handleItemsPerPageChange = (newItemsPerPage) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
  };

  // Donut chart segments
  const donutSegments = [
    { value: statusCounts.NEW.length, color: '#9ca3af', label: 'Unrequested' },
    { value: statusCounts.REQUESTED.length, color: '#3b82f6', label: 'Requested' },
    { value: statusCounts.APPROVED.length, color: '#22c55e', label: 'Approved' },
    { value: statusCounts.PAID.length, color: '#10b981', label: 'Paid' },
    { value: statusCounts.HOLD.length, color: '#eab308', label: 'On Hold' },
    { value: statusCounts.DENIED.length, color: '#ef4444', label: 'Denied' },
  ].filter(s => s.value > 0);

  const dateFilterOptions = [
    { value: 'ALL_TIME', label: 'All Time' },
    { value: 'THIS_MONTH', label: 'This Month' },
    { value: 'LAST_MONTH', label: 'Last Month' },
    { value: 'THIS_YEAR', label: 'This Year' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Commissions</h1>
          <p className="text-gray-500">Track your earnings and commission status</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-panda-primary focus:border-transparent"
          >
            {dateFilterOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <Link
            to="/"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-panda-primary hover:bg-panda-light rounded-lg transition-colors"
          >
            <ArrowRight className="w-4 h-4 mr-1 rotate-180" />
            Dashboard
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Unpaid Total - filtered by date */}
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/80">
                Unpaid Commissions
                {dateFilter !== 'ALL_TIME' && (
                  <span className="ml-1 text-xs opacity-70">
                    ({dateFilterOptions.find(o => o.value === dateFilter)?.label})
                  </span>
                )}
              </p>
              <p className="text-3xl font-bold mt-1">{formatCurrency(unpaidAmount)}</p>
              <p className="text-sm text-white/70 mt-1">{unpaidCount} commission{unpaidCount !== 1 ? 's' : ''} pending</p>
            </div>
            <div className="p-3 bg-white/20 rounded-xl">
              <Clock className="w-8 h-8" />
            </div>
          </div>
        </div>

        {/* Paid in Selected Period */}
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/80">
                {dateFilter === 'ALL_TIME' ? 'Paid This Month' :
                 dateFilter === 'THIS_MONTH' ? 'Paid This Month' :
                 dateFilter === 'LAST_MONTH' ? 'Paid Last Month' :
                 dateFilter === 'THIS_YEAR' ? 'Paid This Year' : 'Paid'}
              </p>
              <p className="text-3xl font-bold mt-1">
                {formatCurrency(dateFilter === 'ALL_TIME' || dateFilter === 'THIS_MONTH'
                  ? thisMonthPaidAmount
                  : dateFilter === 'LAST_MONTH'
                    ? lastMonthPaidAmount
                    : statusAmounts.PAID)}
              </p>
              {(dateFilter === 'ALL_TIME' || dateFilter === 'THIS_MONTH') && (
                <div className="flex items-center mt-1 text-sm">
                  {paidTrend >= 0 ? (
                    <ArrowUpRight className="w-4 h-4 mr-1" />
                  ) : (
                    <ArrowDownRight className="w-4 h-4 mr-1" />
                  )}
                  <span className="text-white/80">
                    {Math.abs(paidTrend)}% vs last month
                  </span>
                </div>
              )}
              {dateFilter === 'LAST_MONTH' && (
                <p className="text-sm text-white/70 mt-1">
                  {lastMonthPaid.length} commission{lastMonthPaid.length !== 1 ? 's' : ''} paid
                </p>
              )}
              {dateFilter === 'THIS_YEAR' && (
                <p className="text-sm text-white/70 mt-1">
                  {statusCounts.PAID.length} commission{statusCounts.PAID.length !== 1 ? 's' : ''} paid
                </p>
              )}
            </div>
            <div className="p-3 bg-white/20 rounded-xl">
              <CreditCard className="w-8 h-8" />
            </div>
          </div>
        </div>

        {/* Total Paid in Period */}
        <div className="bg-gradient-to-br from-panda-primary to-panda-secondary rounded-xl p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/80">
                {dateFilter === 'ALL_TIME' ? 'Total Paid (All Time)' :
                 `Total Paid (${dateFilterOptions.find(o => o.value === dateFilter)?.label})`}
              </p>
              <p className="text-3xl font-bold mt-1">{formatCurrency(statusAmounts.PAID)}</p>
              <p className="text-sm text-white/70 mt-1">{statusCounts.PAID.length} commission{statusCounts.PAID.length !== 1 ? 's' : ''} received</p>
            </div>
            <div className="p-3 bg-white/20 rounded-xl">
              <Award className="w-8 h-8" />
            </div>
          </div>
        </div>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Donut Chart Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-medium text-gray-700 mb-4">Status Breakdown</h3>
          <div className="flex flex-col items-center">
            <DonutChart segments={donutSegments} size={140} strokeWidth={16} />
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              {donutSegments.map((seg, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: seg.color }} />
                  <span className="text-gray-600">{seg.label}: {seg.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Status Cards */}
        <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatusCard
            label="Unrequested"
            count={statusCounts.NEW.length}
            amount={statusAmounts.NEW}
            icon={Clock}
            color="gray-600"
            bgColor="bg-gray-100"
            isActive={statusFilter === 'NEW'}
            onClick={() => handleStatusFilterChange(statusFilter === 'NEW' ? 'ALL' : 'NEW')}
          />
          <StatusCard
            label="Requested"
            count={statusCounts.REQUESTED.length}
            amount={statusAmounts.REQUESTED}
            icon={FileText}
            color="blue-600"
            bgColor="bg-blue-100"
            isActive={statusFilter === 'REQUESTED'}
            onClick={() => handleStatusFilterChange(statusFilter === 'REQUESTED' ? 'ALL' : 'REQUESTED')}
          />
          <StatusCard
            label="Approved"
            count={statusCounts.APPROVED.length}
            amount={statusAmounts.APPROVED}
            icon={CheckCircle}
            color="green-600"
            bgColor="bg-green-100"
            isActive={statusFilter === 'APPROVED'}
            onClick={() => handleStatusFilterChange(statusFilter === 'APPROVED' ? 'ALL' : 'APPROVED')}
          />
          <StatusCard
            label="Paid"
            count={statusCounts.PAID.length}
            amount={statusAmounts.PAID}
            icon={CreditCard}
            color="emerald-600"
            bgColor="bg-emerald-100"
            isActive={statusFilter === 'PAID'}
            onClick={() => handleStatusFilterChange(statusFilter === 'PAID' ? 'ALL' : 'PAID')}
          />
          <StatusCard
            label="On Hold"
            count={statusCounts.HOLD.length}
            amount={statusAmounts.HOLD}
            icon={PauseCircle}
            color="yellow-600"
            bgColor="bg-yellow-100"
            isActive={statusFilter === 'HOLD'}
            onClick={() => handleStatusFilterChange(statusFilter === 'HOLD' ? 'ALL' : 'HOLD')}
          />
          <StatusCard
            label="Denied"
            count={statusCounts.DENIED.length}
            amount={statusAmounts.DENIED}
            icon={XCircle}
            color="red-600"
            bgColor="bg-red-100"
            isActive={statusFilter === 'DENIED'}
            onClick={() => handleStatusFilterChange(statusFilter === 'DENIED' ? 'ALL' : 'DENIED')}
          />
        </div>
      </div>

      {/* Commission List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900">
              {statusFilter === 'ALL' ? 'All Commissions' : `${statusFilter.charAt(0) + statusFilter.slice(1).toLowerCase()} Commissions`}
            </h2>
            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
              {filteredCommissions.length}
            </span>
          </div>
          {statusFilter !== 'ALL' && (
            <button
              onClick={() => handleStatusFilterChange('ALL')}
              className="text-sm text-panda-primary hover:underline flex items-center"
            >
              Clear Filter
              <XCircle className="w-4 h-4 ml-1" />
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary mx-auto"></div>
            <p className="text-gray-500 mt-2">Loading commissions...</p>
          </div>
        ) : sortedCommissions.length > 0 ? (
          <>
            <div className="divide-y divide-gray-100">
              {paginatedCommissions.map((commission) => (
                <CommissionRow
                  key={commission.id}
                  commission={commission}
                  expanded={expandedId === commission.id}
                  onToggle={() => setExpandedId(expandedId === commission.id ? null : commission.id)}
                />
              ))}
            </div>
            {/* Pagination */}
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={handleItemsPerPageChange}
            />
          </>
        ) : (
          <div className="p-8 text-center">
            <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-gray-900">No Commissions Found</h3>
            <p className="text-gray-500 mt-1">
              {statusFilter === 'ALL'
                ? "You don't have any commissions yet."
                : `You don't have any ${statusFilter.toLowerCase()} commissions.`
              }
            </p>
            {statusFilter !== 'ALL' && (
              <button
                onClick={() => handleStatusFilterChange('ALL')}
                className="mt-3 text-panda-primary hover:underline"
              >
                View all commissions
              </button>
            )}
          </div>
        )}
      </div>

      {/* Recent Jobs with Commissions */}
      {statusFilter === 'ALL' && sortedCommissions.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Commission Timeline</h3>
          <div className="space-y-4">
            {sortedCommissions.slice(0, 5).map((commission, index) => (
              <div key={commission.id} className="flex items-start gap-4">
                <div className="flex flex-col items-center">
                  <div className={`w-3 h-3 rounded-full ${
                    commission.status === 'PAID' ? 'bg-emerald-500' :
                    commission.status === 'APPROVED' ? 'bg-green-500' :
                    commission.status === 'REQUESTED' ? 'bg-blue-500' :
                    commission.status === 'HOLD' ? 'bg-yellow-500' :
                    commission.status === 'DENIED' ? 'bg-red-500' : 'bg-gray-400'
                  }`} />
                  {index < Math.min(4, sortedCommissions.length - 1) && (
                    <div className="w-0.5 h-12 bg-gray-200" />
                  )}
                </div>
                <div className="flex-1 min-w-0 pb-4">
                  <Link
                    to={`/jobs/${commission.opportunityId}`}
                    className="text-sm font-medium text-gray-900 hover:text-panda-primary truncate block"
                  >
                    {typeof commission.opportunity?.name === 'string' ? commission.opportunity.name : (typeof commission.serviceContract?.contractNumber === 'string' ? commission.serviceContract.contractNumber : 'Unknown Job')}
                  </Link>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                    <span>{commission.commissionType || 'Sales Commission'}</span>
                    <span>•</span>
                    <span>{formatCurrency(commission.commissionAmount || 0)}</span>
                    <span>•</span>
                    <span>{commission.createdAt ? format(parseISO(commission.createdAt), 'MMM d, yyyy') : 'N/A'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {sortedCommissions.length > 5 && (
            <p className="text-center text-sm text-gray-500 mt-4">
              And {sortedCommissions.length - 5} more commission{sortedCommissions.length - 5 !== 1 ? 's' : ''}...
            </p>
          )}
        </div>
      )}
    </div>
  );
}
