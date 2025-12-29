import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CreditCard,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CheckCircle,
  AlertCircle,
  FileText,
  RefreshCw,
  Link2,
  ExternalLink,
  Building2,
  Send,
  Ban,
  RotateCcw,
  Search,
  Filter,
  Download,
  ChevronDown,
  ChevronRight,
  Eye,
  Plus,
  Calendar,
  TrendingUp,
  Banknote,
  Receipt,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Settings,
  Zap,
} from 'lucide-react';
import { paymentsApi } from '../../services/api';

// Status configurations
const INVOICE_STATUS_CONFIG = {
  DRAFT: { color: 'bg-gray-100 text-gray-700', icon: FileText, label: 'Draft' },
  PENDING: { color: 'bg-yellow-100 text-yellow-700', icon: Clock, label: 'Pending' },
  SENT: { color: 'bg-blue-100 text-blue-700', icon: Send, label: 'Sent' },
  PARTIAL: { color: 'bg-orange-100 text-orange-700', icon: DollarSign, label: 'Partial' },
  PAID: { color: 'bg-green-100 text-green-700', icon: CheckCircle, label: 'Paid' },
  OVERDUE: { color: 'bg-red-100 text-red-700', icon: AlertCircle, label: 'Overdue' },
  VOID: { color: 'bg-gray-100 text-gray-500', icon: Ban, label: 'Void' },
};

const PAYMENT_STATUS_CONFIG = {
  PENDING: { color: 'bg-yellow-100 text-yellow-700', icon: Clock, label: 'Pending' },
  PROCESSING: { color: 'bg-blue-100 text-blue-700', icon: RefreshCw, label: 'Processing' },
  SETTLED: { color: 'bg-green-100 text-green-700', icon: CheckCircle, label: 'Settled' },
  FAILED: { color: 'bg-red-100 text-red-700', icon: XCircle, label: 'Failed' },
  REFUNDED: { color: 'bg-purple-100 text-purple-700', icon: RotateCcw, label: 'Refunded' },
  PARTIALLY_REFUNDED: { color: 'bg-orange-100 text-orange-700', icon: RotateCcw, label: 'Partial Refund' },
};

const PAYMENT_METHOD_LABELS = {
  CHECK: 'Check',
  CREDIT_CARD: 'Credit Card',
  ACH: 'ACH Transfer',
  WIRE: 'Wire Transfer',
  CASH: 'Cash',
  INSURANCE_CHECK: 'Insurance Check',
  FINANCING: 'Financing',
};

const SYNC_STATUS_CONFIG = {
  PENDING: { color: 'bg-yellow-100 text-yellow-700', label: 'Pending Sync' },
  SYNCED: { color: 'bg-green-100 text-green-700', label: 'Synced' },
  FAILED: { color: 'bg-red-100 text-red-700', label: 'Sync Failed' },
  SKIPPED: { color: 'bg-gray-100 text-gray-500', label: 'Skipped' },
};

// Tab configurations
const TABS = [
  { id: 'overview', label: 'Overview', icon: TrendingUp },
  { id: 'invoices', label: 'Invoices', icon: FileText },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'quickbooks', label: 'QuickBooks', icon: Building2 },
  { id: 'stripe', label: 'Stripe', icon: Zap },
];

function formatCurrency(amount) {
  if (amount === null || amount === undefined) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

function formatDate(date) {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(date) {
  if (!date) return '-';
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Stat Card Component
function StatCard({ title, value, icon: Icon, trend, trendValue, color = 'blue', subtitle }) {
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    yellow: 'bg-yellow-100 text-yellow-600',
    red: 'bg-red-100 text-red-600',
    purple: 'bg-purple-100 text-purple-600',
  };

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
          {trend && (
            <div className={`flex items-center mt-2 text-sm ${trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
              {trend === 'up' ? (
                <ArrowUpRight className="w-4 h-4 mr-1" />
              ) : (
                <ArrowDownRight className="w-4 h-4 mr-1" />
              )}
              <span>{trendValue}</span>
            </div>
          )}
        </div>
        <div className={`w-12 h-12 rounded-xl ${colorClasses[color]} flex items-center justify-center`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}

// Overview Tab Component
function OverviewTab({ invoiceStats, paymentStats, qbStatus }) {
  return (
    <div className="space-y-6">
      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Outstanding"
          value={formatCurrency(invoiceStats?.totalOutstanding || 0)}
          icon={DollarSign}
          color="blue"
          subtitle={`${invoiceStats?.outstandingCount || 0} invoices`}
        />
        <StatCard
          title="Collected This Month"
          value={formatCurrency(paymentStats?.thisMonth || 0)}
          icon={CheckCircle}
          color="green"
          trend="up"
          trendValue="+12% vs last month"
        />
        <StatCard
          title="Overdue Amount"
          value={formatCurrency(invoiceStats?.overdueAmount || 0)}
          icon={AlertCircle}
          color="red"
          subtitle={`${invoiceStats?.overdueCount || 0} overdue`}
        />
        <StatCard
          title="Pending Payments"
          value={formatCurrency(paymentStats?.pending || 0)}
          icon={Clock}
          color="yellow"
          subtitle="Processing"
        />
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Recent Payments</h3>
            <button className="text-sm text-panda-primary hover:underline">View All</button>
          </div>
          <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
            {paymentStats?.recentPayments?.length > 0 ? (
              paymentStats.recentPayments.map((payment, idx) => (
                <div key={idx} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{payment.account?.name || 'Unknown'}</p>
                      <p className="text-sm text-gray-500">
                        {PAYMENT_METHOD_LABELS[payment.paymentMethod] || payment.paymentMethod} • {formatDate(payment.paymentDate)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-green-600">{formatCurrency(payment.amount)}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${PAYMENT_STATUS_CONFIG[payment.status]?.color || 'bg-gray-100'}`}>
                        {PAYMENT_STATUS_CONFIG[payment.status]?.label || payment.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-gray-500">
                <Receipt className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>No recent payments</p>
              </div>
            )}
          </div>
        </div>

        {/* Integration Status */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Integration Status</h3>
          </div>
          <div className="p-6 space-y-4">
            {/* Stripe Status */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Zap className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Stripe</p>
                  <p className="text-sm text-gray-500">Payment Processing</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                <span className="text-sm text-green-600 font-medium">Connected</span>
              </div>
            </div>

            {/* QuickBooks Status */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">QuickBooks</p>
                  <p className="text-sm text-gray-500">Accounting Sync</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {qbStatus?.connected ? (
                  <>
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                    <span className="text-sm text-green-600 font-medium">Connected</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
                    <button className="text-sm text-panda-primary font-medium hover:underline">Connect</button>
                  </>
                )}
              </div>
            </div>

            {/* Sync Stats */}
            <div className="pt-4 border-t border-gray-200">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Sync Summary</h4>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <p className="text-xl font-bold text-green-600">{invoiceStats?.syncedCount || 0}</p>
                  <p className="text-xs text-gray-500">Synced</p>
                </div>
                <div className="text-center p-3 bg-yellow-50 rounded-lg">
                  <p className="text-xl font-bold text-yellow-600">{invoiceStats?.pendingSyncCount || 0}</p>
                  <p className="text-xs text-gray-500">Pending</p>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <p className="text-xl font-bold text-red-600">{invoiceStats?.failedSyncCount || 0}</p>
                  <p className="text-xs text-gray-500">Failed</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Alerts & Actions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Action Items</h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Overdue Invoices Alert */}
            {(invoiceStats?.overdueCount || 0) > 0 && (
              <div className="flex items-start space-x-3 p-4 bg-red-50 rounded-lg border border-red-100">
                <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-red-800">{invoiceStats.overdueCount} Overdue Invoices</p>
                  <p className="text-sm text-red-600">{formatCurrency(invoiceStats.overdueAmount)} outstanding</p>
                  <button className="mt-2 text-sm font-medium text-red-700 hover:underline">
                    Send Reminders →
                  </button>
                </div>
              </div>
            )}

            {/* Failed Syncs Alert */}
            {(invoiceStats?.failedSyncCount || 0) > 0 && (
              <div className="flex items-start space-x-3 p-4 bg-yellow-50 rounded-lg border border-yellow-100">
                <RefreshCw className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-yellow-800">{invoiceStats.failedSyncCount} Sync Failures</p>
                  <p className="text-sm text-yellow-600">QuickBooks sync issues</p>
                  <button className="mt-2 text-sm font-medium text-yellow-700 hover:underline">
                    Retry Sync →
                  </button>
                </div>
              </div>
            )}

            {/* Draft Invoices */}
            {(invoiceStats?.draftCount || 0) > 0 && (
              <div className="flex items-start space-x-3 p-4 bg-blue-50 rounded-lg border border-blue-100">
                <FileText className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-blue-800">{invoiceStats.draftCount} Draft Invoices</p>
                  <p className="text-sm text-blue-600">Ready to send</p>
                  <button className="mt-2 text-sm font-medium text-blue-700 hover:underline">
                    Review Drafts →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Invoices Tab Component
function InvoicesTab() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const { data: invoicesData, isLoading, refetch } = useQuery({
    queryKey: ['invoices', { page, status: statusFilter, search: searchTerm }],
    queryFn: () => paymentsApi.getInvoices({ page, limit: 20, status: statusFilter, search: searchTerm }),
  });

  const invoices = invoicesData?.data || [];
  const pagination = invoicesData?.pagination || {};

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search invoices..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none"
          >
            <option value="">All Status</option>
            {Object.entries(INVOICE_STATUS_CONFIG).map(([key, config]) => (
              <option key={key} value={key}>{config.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => refetch()}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button className="px-4 py-2 bg-panda-primary text-white text-sm font-medium rounded-lg hover:bg-panda-primary/90 transition-colors flex items-center space-x-2">
            <Plus className="w-4 h-4" />
            <span>New Invoice</span>
          </button>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Account</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">QB Sync</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-panda-primary" />
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>No invoices found</p>
                  </td>
                </tr>
              ) : (
                invoices.map((invoice) => {
                  const statusConfig = INVOICE_STATUS_CONFIG[invoice.status] || INVOICE_STATUS_CONFIG.DRAFT;
                  const syncConfig = SYNC_STATUS_CONFIG[invoice.qbSyncStatus] || SYNC_STATUS_CONFIG.PENDING;
                  const StatusIcon = statusConfig.icon;

                  return (
                    <tr key={invoice.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                          <div className={`w-8 h-8 rounded-lg ${statusConfig.color} flex items-center justify-center`}>
                            <StatusIcon className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{invoice.invoiceNumber}</p>
                            <p className="text-xs text-gray-500">{formatDate(invoice.invoiceDate)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-gray-900">{invoice.account?.name || '-'}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-gray-900">{formatCurrency(invoice.total)}</p>
                          {invoice.balanceDue > 0 && invoice.balanceDue !== invoice.total && (
                            <p className="text-xs text-red-500">Due: {formatCurrency(invoice.balanceDue)}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className={invoice.status === 'OVERDUE' ? 'text-red-600 font-medium' : 'text-gray-700'}>
                          {formatDate(invoice.dueDate)}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusConfig.color}`}>
                          {statusConfig.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${syncConfig.color}`}>
                          {syncConfig.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded" title="View">
                            <Eye className="w-4 h-4" />
                          </button>
                          {invoice.status === 'DRAFT' && (
                            <button className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded" title="Send">
                              <Send className="w-4 h-4" />
                            </button>
                          )}
                          {invoice.stripePaymentLinkUrl && (
                            <a
                              href={invoice.stripePaymentLinkUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 text-purple-500 hover:text-purple-700 hover:bg-purple-50 rounded"
                              title="Payment Link"
                            >
                              <Link2 className="w-4 h-4" />
                            </a>
                          )}
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
        {pagination.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing {((page - 1) * pagination.limit) + 1} to {Math.min(page * pagination.limit, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                disabled={page === pagination.totalPages}
                className="px-3 py-1 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Payments Tab Component
function PaymentsTab() {
  const [searchTerm, setSearchTerm] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const { data: paymentsData, isLoading, refetch } = useQuery({
    queryKey: ['payments', { page, method: methodFilter, status: statusFilter, search: searchTerm }],
    queryFn: () => paymentsApi.getPayments({ page, limit: 20, paymentMethod: methodFilter, status: statusFilter, search: searchTerm }),
  });

  const payments = paymentsData?.data || [];
  const pagination = paymentsData?.pagination || {};

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search payments..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none"
            />
          </div>
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none"
          >
            <option value="">All Methods</option>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none"
          >
            <option value="">All Status</option>
            {Object.entries(PAYMENT_STATUS_CONFIG).map(([key, config]) => (
              <option key={key} value={key}>{config.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => refetch()}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-2">
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
          <button className="px-4 py-2 bg-panda-primary text-white text-sm font-medium rounded-lg hover:bg-panda-primary/90 transition-colors flex items-center space-x-2">
            <Plus className="w-4 h-4" />
            <span>Record Payment</span>
          </button>
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">QB Sync</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-panda-primary" />
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    <CreditCard className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>No payments found</p>
                  </td>
                </tr>
              ) : (
                payments.map((payment) => {
                  const statusConfig = PAYMENT_STATUS_CONFIG[payment.status] || PAYMENT_STATUS_CONFIG.PENDING;
                  const syncConfig = SYNC_STATUS_CONFIG[payment.qbSyncStatus] || SYNC_STATUS_CONFIG.PENDING;
                  const StatusIcon = statusConfig.icon;

                  return (
                    <tr key={payment.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                          <div className={`w-8 h-8 rounded-lg ${statusConfig.color} flex items-center justify-center`}>
                            <StatusIcon className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{payment.paymentNumber}</p>
                            {payment.referenceNumber && (
                              <p className="text-xs text-gray-500">Ref: {payment.referenceNumber}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-gray-900">{payment.invoice?.invoiceNumber || '-'}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-medium text-gray-900">{formatCurrency(payment.amount)}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <Banknote className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-700">{PAYMENT_METHOD_LABELS[payment.paymentMethod] || payment.paymentMethod}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-gray-700">{formatDate(payment.paymentDate)}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusConfig.color}`}>
                          {statusConfig.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${syncConfig.color}`}>
                          {syncConfig.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded" title="View">
                            <Eye className="w-4 h-4" />
                          </button>
                          {payment.stripeReceiptUrl && (
                            <a
                              href={payment.stripeReceiptUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 text-purple-500 hover:text-purple-700 hover:bg-purple-50 rounded"
                              title="Stripe Receipt"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                          {payment.status === 'SETTLED' && (
                            <button className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded" title="Refund">
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          )}
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
        {pagination.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing {((page - 1) * pagination.limit) + 1} to {Math.min(page * pagination.limit, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                disabled={page === pagination.totalPages}
                className="px-3 py-1 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// QuickBooks Tab Component
function QuickBooksTab() {
  const queryClient = useQueryClient();

  const { data: qbStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['quickbooks-status'],
    queryFn: paymentsApi.getQuickBooksStatus,
  });

  const { data: customerBalance } = useQuery({
    queryKey: ['qb-customer-balance'],
    queryFn: paymentsApi.getQBCustomerBalance,
    enabled: qbStatus?.connected,
  });

  return (
    <div className="space-y-6">
      {/* Connection Status Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 bg-green-100 rounded-xl flex items-center justify-center">
              <Building2 className="w-8 h-8 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">QuickBooks Online</h3>
              <p className="text-gray-500">
                {qbStatus?.connected ? (
                  <span className="flex items-center text-green-600">
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    Connected to {qbStatus.companyName || 'QuickBooks'}
                  </span>
                ) : (
                  <span className="text-yellow-600">Not connected</span>
                )}
              </p>
            </div>
          </div>
          {qbStatus?.connected ? (
            <button className="px-4 py-2 border border-red-300 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors">
              Disconnect
            </button>
          ) : (
            <button className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors">
              Connect QuickBooks
            </button>
          )}
        </div>
      </div>

      {qbStatus?.connected && (
        <>
          {/* Sync Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-left hover:border-panda-primary transition-colors">
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <RefreshCw className="w-5 h-5 text-blue-600" />
                </div>
                <span className="font-medium text-gray-900">Sync All Customers</span>
              </div>
              <p className="text-sm text-gray-500">Push all CRM accounts to QuickBooks</p>
            </button>

            <button className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-left hover:border-panda-primary transition-colors">
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-purple-600" />
                </div>
                <span className="font-medium text-gray-900">Sync Invoices</span>
              </div>
              <p className="text-sm text-gray-500">Sync pending invoices to QuickBooks</p>
            </button>

            <button className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-left hover:border-panda-primary transition-colors">
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-green-600" />
                </div>
                <span className="font-medium text-gray-900">Sync Payments</span>
              </div>
              <p className="text-sm text-gray-500">Record new payments in QuickBooks</p>
            </button>
          </div>

          {/* Reports */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">QuickBooks Reports</h3>
              <button className="text-sm text-panda-primary hover:underline flex items-center">
                <ExternalLink className="w-4 h-4 mr-1" />
                Open in QuickBooks
              </button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Customer Balance */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-4">Customer Balances (Top 10)</h4>
                  <div className="space-y-3">
                    {customerBalance?.rows?.slice(0, 10).map((row, idx) => (
                      <div key={idx} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                        <span className="text-gray-700">{row.customerName}</span>
                        <span className="font-medium text-gray-900">{formatCurrency(row.balance)}</span>
                      </div>
                    )) || (
                      <p className="text-gray-500 text-sm">No data available</p>
                    )}
                  </div>
                </div>

                {/* Quick Actions */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-4">Quick Actions</h4>
                  <div className="space-y-3">
                    <button className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <span className="text-gray-700">View Profit & Loss</span>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </button>
                    <button className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <span className="text-gray-700">View Balance Sheet</span>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </button>
                    <button className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <span className="text-gray-700">View A/R Aging</span>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </button>
                    <button className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <span className="text-gray-700">Manage Items</span>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Stripe Tab Component
function StripeTab() {
  return (
    <div className="space-y-6">
      {/* Connection Status Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 bg-purple-100 rounded-xl flex items-center justify-center">
              <Zap className="w-8 h-8 text-purple-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Stripe</h3>
              <p className="text-gray-500">
                <span className="flex items-center text-green-600">
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  Connected - Live Mode
                </span>
              </p>
            </div>
          </div>
          <a
            href="https://dashboard.stripe.com"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-2"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Open Dashboard</span>
          </a>
        </div>
      </div>

      {/* Stripe Features */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Link2 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h4 className="font-medium text-gray-900">Payment Links</h4>
              <p className="text-sm text-gray-500">Shareable payment URLs</p>
            </div>
          </div>
          <button className="w-full px-4 py-2 bg-panda-primary text-white text-sm font-medium rounded-lg hover:bg-panda-primary/90 transition-colors">
            Create Payment Link
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h4 className="font-medium text-gray-900">Virtual Terminal</h4>
              <p className="text-sm text-gray-500">Process manual payments</p>
            </div>
          </div>
          <button className="w-full px-4 py-2 bg-panda-primary text-white text-sm font-medium rounded-lg hover:bg-panda-primary/90 transition-colors">
            Take Payment
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h4 className="font-medium text-gray-900">Payment Plans</h4>
              <p className="text-sm text-gray-500">Recurring payments</p>
            </div>
          </div>
          <button className="w-full px-4 py-2 bg-panda-primary text-white text-sm font-medium rounded-lg hover:bg-panda-primary/90 transition-colors">
            Create Plan
          </button>
        </div>
      </div>

      {/* Recent Stripe Activity */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Recent Stripe Activity</h3>
          <a
            href="https://dashboard.stripe.com/payments"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-panda-primary hover:underline flex items-center"
          >
            View All in Stripe
            <ExternalLink className="w-3 h-3 ml-1" />
          </a>
        </div>
        <div className="p-6">
          <div className="text-center py-8 text-gray-500">
            <Zap className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>Recent Stripe transactions will appear here</p>
            <p className="text-sm mt-1">Data synced from Stripe webhooks</p>
          </div>
        </div>
      </div>

      {/* Webhook Status */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Webhook Configuration</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center space-x-3">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <span className="text-gray-700">payment_intent.succeeded</span>
            </div>
            <span className="text-sm text-green-600">Active</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center space-x-3">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <span className="text-gray-700">payment_intent.payment_failed</span>
            </div>
            <span className="text-sm text-green-600">Active</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center space-x-3">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <span className="text-gray-700">charge.refunded</span>
            </div>
            <span className="text-sm text-green-600">Active</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Main Component
export default function PaymentEngine() {
  const [activeTab, setActiveTab] = useState('overview');

  // Fetch stats for overview
  const { data: invoiceStats } = useQuery({
    queryKey: ['invoice-stats'],
    queryFn: paymentsApi.getInvoiceStats,
  });

  const { data: paymentStats } = useQuery({
    queryKey: ['payment-stats'],
    queryFn: paymentsApi.getPaymentStats,
  });

  const { data: qbStatus } = useQuery({
    queryKey: ['quickbooks-status'],
    queryFn: paymentsApi.getQuickBooksStatus,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payment Center</h1>
          <p className="text-gray-500 mt-1">
            Manage invoices, payments, and accounting integrations
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-2">
            <Settings className="w-4 h-4" />
            <span>Settings</span>
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  isActive
                    ? 'border-panda-primary text-panda-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab invoiceStats={invoiceStats} paymentStats={paymentStats} qbStatus={qbStatus} />
      )}
      {activeTab === 'invoices' && <InvoicesTab />}
      {activeTab === 'payments' && <PaymentsTab />}
      {activeTab === 'quickbooks' && <QuickBooksTab />}
      {activeTab === 'stripe' && <StripeTab />}
    </div>
  );
}
