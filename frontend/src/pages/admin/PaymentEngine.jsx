import { useState, useMemo, useEffect } from 'react';
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
  X,
  User,
} from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { paymentsApi, accountsApi, contactsApi } from '../../services/api';
import AdminLayout from '../../components/AdminLayout';

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
function OverviewTab({ invoiceStats, paymentStats, qbStatus, onConnectQuickBooks, isConnecting }) {
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
                    <button
                      onClick={onConnectQuickBooks}
                      disabled={isConnecting}
                      className="text-sm text-panda-primary font-medium hover:underline disabled:opacity-50"
                    >
                      {isConnecting ? 'Connecting...' : 'Connect'}
                    </button>
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
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showNewInvoiceModal, setShowNewInvoiceModal] = useState(false);
  const [newInvoiceForm, setNewInvoiceForm] = useState({
    accountId: '',
    dueDate: '',
    notes: '',
    terms: 'Net 30',
    lineItems: [{ description: '', quantity: 1, unitPrice: '' }],
  });

  const queryClient = useQueryClient();

  const { data: invoicesData, isLoading, refetch } = useQuery({
    queryKey: ['invoices', { page, status: statusFilter, search: searchTerm }],
    queryFn: () => paymentsApi.getInvoices({ page, limit: 20, status: statusFilter, search: searchTerm }),
  });

  // Query for accounts (for new invoice dropdown)
  const { data: accountsData } = useQuery({
    queryKey: ['accounts-dropdown'],
    queryFn: () => accountsApi.getAccounts({ limit: 100 }),
  });

  // Mutation for sending invoice
  const sendInvoiceMutation = useMutation({
    mutationFn: (invoiceId) => paymentsApi.sendInvoice(invoiceId),
    onSuccess: () => {
      refetch();
    },
    onError: (error) => {
      console.error('Failed to send invoice:', error);
      alert('Failed to send invoice. Please try again.');
    },
  });

  // Mutation for creating invoice
  const createInvoiceMutation = useMutation({
    mutationFn: (data) => paymentsApi.createInvoice(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['invoices']);
      setShowNewInvoiceModal(false);
      setNewInvoiceForm({
        accountId: '',
        dueDate: '',
        notes: '',
        terms: 'Net 30',
        lineItems: [{ description: '', quantity: 1, unitPrice: '' }],
      });
    },
    onError: (error) => {
      console.error('Failed to create invoice:', error);
      alert('Failed to create invoice. Please try again.');
    },
  });

  const handleCreateInvoice = () => {
    if (!newInvoiceForm.accountId) {
      alert('Please select an account');
      return;
    }
    if (!newInvoiceForm.lineItems.some(li => li.description && li.unitPrice)) {
      alert('Please add at least one line item with description and price');
      return;
    }
    const filteredLineItems = newInvoiceForm.lineItems.filter(li => li.description && li.unitPrice);
    createInvoiceMutation.mutate({
      ...newInvoiceForm,
      lineItems: filteredLineItems.map(li => ({
        description: li.description,
        quantity: parseInt(li.quantity) || 1,
        unitPrice: parseFloat(li.unitPrice) || 0,
      })),
    });
  };

  const addLineItem = () => {
    setNewInvoiceForm(prev => ({
      ...prev,
      lineItems: [...prev.lineItems, { description: '', quantity: 1, unitPrice: '' }],
    }));
  };

  const removeLineItem = (index) => {
    setNewInvoiceForm(prev => ({
      ...prev,
      lineItems: prev.lineItems.filter((_, i) => i !== index),
    }));
  };

  const updateLineItem = (index, field, value) => {
    setNewInvoiceForm(prev => ({
      ...prev,
      lineItems: prev.lineItems.map((li, i) => i === index ? { ...li, [field]: value } : li),
    }));
  };

  const accounts = accountsData?.data || [];

  const handleViewInvoice = (invoice) => {
    setSelectedInvoice(invoice);
    setShowViewModal(true);
  };

  const handleSendInvoice = (invoice) => {
    if (window.confirm(`Send invoice ${invoice.invoiceNumber} to the customer?`)) {
      sendInvoiceMutation.mutate(invoice.id);
    }
  };

  const handleResendInvoice = (invoice) => {
    if (window.confirm(`Resend invoice ${invoice.invoiceNumber} to the customer?`)) {
      sendInvoiceMutation.mutate(invoice.id);
    }
  };

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
          <button
            onClick={() => setShowNewInvoiceModal(true)}
            className="px-4 py-2 bg-panda-primary text-white text-sm font-medium rounded-lg hover:bg-panda-primary/90 transition-colors flex items-center space-x-2"
          >
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
                          <button
                            onClick={() => handleViewInvoice(invoice)}
                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                            title="View"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {invoice.status === 'DRAFT' && (
                            <button
                              onClick={() => handleSendInvoice(invoice)}
                              disabled={sendInvoiceMutation.isPending}
                              className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded disabled:opacity-50"
                              title="Send"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                          )}
                          {(invoice.status === 'SENT' || invoice.status === 'OVERDUE' || invoice.status === 'PARTIAL') && (
                            <button
                              onClick={() => handleResendInvoice(invoice)}
                              disabled={sendInvoiceMutation.isPending}
                              className="p-1.5 text-orange-500 hover:text-orange-700 hover:bg-orange-50 rounded disabled:opacity-50"
                              title="Resend"
                            >
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

      {/* Invoice View Modal */}
      {showViewModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Invoice Details</h3>
                  <p className="text-sm text-gray-500">{selectedInvoice.invoiceNumber}</p>
                </div>
                <button
                  onClick={() => { setShowViewModal(false); setSelectedInvoice(null); }}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              {/* Invoice Status */}
              <div className="flex items-center space-x-3">
                <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${INVOICE_STATUS_CONFIG[selectedInvoice.status]?.color || 'bg-gray-100 text-gray-700'}`}>
                  {INVOICE_STATUS_CONFIG[selectedInvoice.status]?.label || selectedInvoice.status}
                </span>
                {selectedInvoice.isPmInvoice && (
                  <span className="px-3 py-1.5 rounded-full text-sm font-medium bg-purple-100 text-purple-700">
                    PM Invoice
                  </span>
                )}
              </div>

              {/* Account Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-500 mb-2">Customer</h4>
                <p className="font-medium text-gray-900">{selectedInvoice.account?.name || 'N/A'}</p>
                {selectedInvoice.opportunity && (
                  <p className="text-sm text-gray-600 mt-1">Job: {selectedInvoice.opportunity.name}</p>
                )}
              </div>

              {/* Financial Details */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-gray-500 mb-1">Subtotal</h4>
                  <p className="text-lg font-semibold text-gray-900">{formatCurrency(selectedInvoice.subtotal)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-gray-500 mb-1">Tax</h4>
                  <p className="text-lg font-semibold text-gray-900">{formatCurrency(selectedInvoice.tax)}</p>
                </div>
                <div className="bg-panda-primary/10 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-panda-primary mb-1">Total</h4>
                  <p className="text-lg font-semibold text-panda-primary">{formatCurrency(selectedInvoice.total)}</p>
                </div>
                <div className={`rounded-lg p-4 ${selectedInvoice.balanceDue > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                  <h4 className={`text-sm font-medium mb-1 ${selectedInvoice.balanceDue > 0 ? 'text-red-600' : 'text-green-600'}`}>Balance Due</h4>
                  <p className={`text-lg font-semibold ${selectedInvoice.balanceDue > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(selectedInvoice.balanceDue)}</p>
                </div>
              </div>

              {/* Payment Info */}
              {selectedInvoice.amountPaid > 0 && (
                <div className="bg-green-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-green-600 mb-1">Amount Paid</h4>
                  <p className="text-lg font-semibold text-green-700">{formatCurrency(selectedInvoice.amountPaid)}</p>
                </div>
              )}

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-500">Invoice Date</h4>
                  <p className="text-gray-900">{formatDate(selectedInvoice.invoiceDate)}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-500">Due Date</h4>
                  <p className={selectedInvoice.status === 'OVERDUE' ? 'text-red-600 font-medium' : 'text-gray-900'}>
                    {formatDate(selectedInvoice.dueDate)}
                  </p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-500">Terms</h4>
                  <p className="text-gray-900">{selectedInvoice.terms ? `Net ${selectedInvoice.terms}` : 'N/A'}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-500">Created</h4>
                  <p className="text-gray-900">{formatDate(selectedInvoice.createdAt)}</p>
                </div>
              </div>

              {/* Payment Link */}
              {selectedInvoice.stripePaymentLinkUrl && (
                <div className="bg-purple-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-purple-600 mb-2">Payment Link</h4>
                  <a
                    href={selectedInvoice.stripePaymentLinkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-700 hover:underline break-all"
                  >
                    {selectedInvoice.stripePaymentLinkUrl}
                  </a>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="p-6 border-t border-gray-100 flex justify-end space-x-3">
              <button
                onClick={() => { setShowViewModal(false); setSelectedInvoice(null); }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Close
              </button>
              {(selectedInvoice.status === 'DRAFT' || selectedInvoice.status === 'SENT' || selectedInvoice.status === 'OVERDUE' || selectedInvoice.status === 'PARTIAL') && (
                <button
                  onClick={() => {
                    handleResendInvoice(selectedInvoice);
                    setShowViewModal(false);
                    setSelectedInvoice(null);
                  }}
                  disabled={sendInvoiceMutation.isPending}
                  className="px-4 py-2 text-white bg-panda-primary rounded-lg hover:bg-panda-primary/90 transition-colors disabled:opacity-50 flex items-center space-x-2"
                >
                  <Send className="w-4 h-4" />
                  <span>{selectedInvoice.status === 'DRAFT' ? 'Send Invoice' : 'Resend Invoice'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* New Invoice Modal */}
      {showNewInvoiceModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Create New Invoice</h3>
                <button
                  onClick={() => setShowNewInvoiceModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Account Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Account <span className="text-red-500">*</span>
                </label>
                <select
                  value={newInvoiceForm.accountId}
                  onChange={(e) => setNewInvoiceForm(prev => ({ ...prev, accountId: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                >
                  <option value="">Select an account...</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Line Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Line Items <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={addLineItem}
                    className="text-sm text-panda-primary hover:text-panda-primary/80 flex items-center space-x-1"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Item</span>
                  </button>
                </div>
                <div className="space-y-3">
                  {newInvoiceForm.lineItems.map((item, index) => (
                    <div key={index} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <input
                          type="text"
                          placeholder="Description"
                          value={item.description}
                          onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent text-sm"
                        />
                      </div>
                      <div className="w-20">
                        <input
                          type="number"
                          placeholder="Qty"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateLineItem(index, 'quantity', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent text-sm"
                        />
                      </div>
                      <div className="w-28">
                        <input
                          type="number"
                          placeholder="Price"
                          step="0.01"
                          min="0"
                          value={item.unitPrice}
                          onChange={(e) => updateLineItem(index, 'unitPrice', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent text-sm"
                        />
                      </div>
                      {newInvoiceForm.lineItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLineItem(index)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {/* Line Items Total */}
                <div className="mt-3 text-right text-sm text-gray-600">
                  Total: <span className="font-semibold text-gray-900">
                    ${newInvoiceForm.lineItems.reduce((sum, li) => sum + (parseFloat(li.unitPrice) || 0) * (parseInt(li.quantity) || 1), 0).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Due Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Due Date
                </label>
                <input
                  type="date"
                  value={newInvoiceForm.dueDate}
                  onChange={(e) => setNewInvoiceForm(prev => ({ ...prev, dueDate: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                />
              </div>

              {/* Terms */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Terms
                </label>
                <select
                  value={newInvoiceForm.terms}
                  onChange={(e) => setNewInvoiceForm(prev => ({ ...prev, terms: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                >
                  <option value="Due on Receipt">Due on Receipt</option>
                  <option value="Net 15">Net 15</option>
                  <option value="Net 30">Net 30</option>
                  <option value="Net 45">Net 45</option>
                  <option value="Net 60">Net 60</option>
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes
                </label>
                <textarea
                  rows={3}
                  value={newInvoiceForm.notes}
                  onChange={(e) => setNewInvoiceForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Add any additional notes for this invoice..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent resize-none"
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => setShowNewInvoiceModal(false)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateInvoice}
                disabled={createInvoiceMutation.isPending}
                className="px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 transition-colors disabled:opacity-50 flex items-center space-x-2"
              >
                {createInvoiceMutation.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>Create Invoice</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Payments Tab Component
function PaymentsTab() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  // Record Payment Modal state
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState(false);
  const [recordPaymentForm, setRecordPaymentForm] = useState({
    accountId: '',
    invoiceId: '',
    amount: '',
    paymentMethod: 'CHECK',
    paymentDate: new Date().toISOString().split('T')[0],
    referenceNumber: '',
    notes: '',
  });

  const { data: paymentsData, isLoading, refetch } = useQuery({
    queryKey: ['payments', { page, method: methodFilter, status: statusFilter, search: searchTerm }],
    queryFn: () => paymentsApi.getPayments({ page, limit: 20, paymentMethod: methodFilter, status: statusFilter, search: searchTerm }),
  });

  // Fetch accounts for dropdown
  const { data: accountsData } = useQuery({
    queryKey: ['accounts-dropdown'],
    queryFn: () => accountsApi.getAccounts({ limit: 500 }),
    enabled: showRecordPaymentModal,
  });

  // Fetch invoices for selected account
  const { data: invoicesData } = useQuery({
    queryKey: ['account-invoices', recordPaymentForm.accountId],
    queryFn: () => invoicesApi.getInvoices({ accountId: recordPaymentForm.accountId, status: 'UNPAID' }),
    enabled: showRecordPaymentModal && !!recordPaymentForm.accountId,
  });

  const payments = paymentsData?.data || [];
  const pagination = paymentsData?.pagination || {};
  const accounts = accountsData?.data || [];
  const invoices = invoicesData?.data || [];

  // Record payment mutation
  const recordPaymentMutation = useMutation({
    mutationFn: (data) => paymentsApi.createPayment(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['payments']);
      setShowRecordPaymentModal(false);
      setRecordPaymentForm({
        accountId: '',
        invoiceId: '',
        amount: '',
        paymentMethod: 'CHECK',
        paymentDate: new Date().toISOString().split('T')[0],
        referenceNumber: '',
        notes: '',
      });
    },
  });

  // Sync from Stripe mutation
  const [syncMessage, setSyncMessage] = useState(null);
  const syncStripeMutation = useMutation({
    mutationFn: () => paymentsApi.syncStripePayments({ daysBack: 30, limit: 100 }),
    onSuccess: (data) => {
      queryClient.invalidateQueries(['payments']);
      setSyncMessage({
        type: 'success',
        text: `Synced ${data.synced || 0} payments from Stripe (${data.skipped || 0} already existed)`,
      });
      setTimeout(() => setSyncMessage(null), 5000);
    },
    onError: (error) => {
      setSyncMessage({
        type: 'error',
        text: error.message || 'Failed to sync from Stripe',
      });
      setTimeout(() => setSyncMessage(null), 5000);
    },
  });

  // Export payments to CSV
  const handleExport = () => {
    if (payments.length === 0) return;

    const headers = ['Payment Number', 'Reference', 'Invoice', 'Amount', 'Method', 'Date', 'Status', 'QB Sync'];
    const rows = payments.map(p => [
      p.paymentNumber || '',
      p.referenceNumber || '',
      p.invoice?.invoiceNumber || '',
      p.amount || '',
      PAYMENT_METHOD_LABELS[p.paymentMethod] || p.paymentMethod || '',
      p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : '',
      PAYMENT_STATUS_CONFIG[p.status]?.label || p.status || '',
      SYNC_STATUS_CONFIG[p.qbSyncStatus]?.label || p.qbSyncStatus || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `payments-export-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // Handle form submission
  const handleRecordPayment = () => {
    if (!recordPaymentForm.amount || parseFloat(recordPaymentForm.amount) <= 0) return;

    recordPaymentMutation.mutate({
      accountId: recordPaymentForm.accountId || undefined,
      invoiceId: recordPaymentForm.invoiceId || undefined,
      amount: parseFloat(recordPaymentForm.amount),
      paymentMethod: recordPaymentForm.paymentMethod,
      paymentDate: recordPaymentForm.paymentDate,
      referenceNumber: recordPaymentForm.referenceNumber || undefined,
      notes: recordPaymentForm.notes || undefined,
      status: 'SETTLED',
    });
  };

  return (
    <div className="space-y-4">
      {/* Sync Status Message */}
      {syncMessage && (
        <div className={`p-4 rounded-lg flex items-center justify-between ${
          syncMessage.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          <div className="flex items-center space-x-2">
            {syncMessage.type === 'success' ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
            <span>{syncMessage.text}</span>
          </div>
          <button onClick={() => setSyncMessage(null)} className="hover:opacity-70">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

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
          <button
            onClick={handleExport}
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-2"
          >
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
          <button
            onClick={() => syncStripeMutation.mutate()}
            disabled={syncStripeMutation.isPending}
            className="px-4 py-2 border border-purple-300 text-purple-700 text-sm font-medium rounded-lg hover:bg-purple-50 transition-colors flex items-center space-x-2 disabled:opacity-50"
          >
            {syncStripeMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            <span>{syncStripeMutation.isPending ? 'Syncing...' : 'Sync from Stripe'}</span>
          </button>
          <button
            onClick={() => setShowRecordPaymentModal(true)}
            className="px-4 py-2 bg-panda-primary text-white text-sm font-medium rounded-lg hover:bg-panda-primary/90 transition-colors flex items-center space-x-2"
          >
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

      {/* Record Payment Modal */}
      {showRecordPaymentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Record Payment</h3>
                <button
                  onClick={() => {
                    setShowRecordPaymentModal(false);
                    setRecordPaymentForm({
                      accountId: '',
                      invoiceId: '',
                      amount: '',
                      paymentMethod: 'CHECK',
                      paymentDate: new Date().toISOString().split('T')[0],
                      referenceNumber: '',
                      notes: '',
                    });
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>
            <form onSubmit={handleRecordPayment} className="p-6 space-y-4">
              {/* Account Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Account <span className="text-red-500">*</span>
                </label>
                <select
                  value={recordPaymentForm.accountId}
                  onChange={(e) => setRecordPaymentForm(f => ({ ...f, accountId: e.target.value, invoiceId: '' }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                  required
                >
                  <option value="">Select an account...</option>
                  {accountsDropdown?.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Invoice Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Invoice
                </label>
                <select
                  value={recordPaymentForm.invoiceId}
                  onChange={(e) => {
                    const invoice = accountInvoices?.find(inv => inv.id === e.target.value);
                    setRecordPaymentForm(f => ({
                      ...f,
                      invoiceId: e.target.value,
                      amount: invoice ? invoice.balanceDue?.toString() || '' : f.amount,
                    }));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                  disabled={!recordPaymentForm.accountId}
                >
                  <option value="">No invoice (general payment)</option>
                  {accountInvoices?.map(invoice => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.invoiceNumber} - ${invoice.balanceDue?.toFixed(2)} due
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={recordPaymentForm.amount}
                    onChange={(e) => setRecordPaymentForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Method <span className="text-red-500">*</span>
                </label>
                <select
                  value={recordPaymentForm.paymentMethod}
                  onChange={(e) => setRecordPaymentForm(f => ({ ...f, paymentMethod: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                  required
                >
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Payment Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={recordPaymentForm.paymentDate}
                  onChange={(e) => setRecordPaymentForm(f => ({ ...f, paymentDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                  required
                />
              </div>

              {/* Reference Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reference Number
                </label>
                <input
                  type="text"
                  value={recordPaymentForm.referenceNumber}
                  onChange={(e) => setRecordPaymentForm(f => ({ ...f, referenceNumber: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                  placeholder="Check number, transaction ID, etc."
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={recordPaymentForm.notes}
                  onChange={(e) => setRecordPaymentForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                  rows={3}
                  placeholder="Optional notes about this payment..."
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowRecordPaymentModal(false);
                    setRecordPaymentForm({
                      accountId: '',
                      invoiceId: '',
                      amount: '',
                      paymentMethod: 'CHECK',
                      paymentDate: new Date().toISOString().split('T')[0],
                      referenceNumber: '',
                      notes: '',
                    });
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={recordPaymentMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-panda-primary hover:bg-panda-primary/90 rounded-lg transition-colors disabled:opacity-50 flex items-center space-x-2"
                >
                  {recordPaymentMutation.isPending ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Recording...</span>
                    </>
                  ) : (
                    <>
                      <DollarSign className="w-4 h-4" />
                      <span>Record Payment</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// QuickBooks Tab Component
function QuickBooksTab({ onConnectQuickBooks, isConnecting }) {
  const queryClient = useQueryClient();

  // Modal states
  const [showProfitLossModal, setShowProfitLossModal] = useState(false);
  const [showItemsModal, setShowItemsModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncType, setSyncType] = useState(null); // 'customers', 'invoices', 'payments'
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0, status: '' });

  // P&L date range state
  const [plDateRange, setPlDateRange] = useState({
    startDate: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0], // Jan 1 of current year
    endDate: new Date().toISOString().split('T')[0], // Today
  });

  const { data: qbStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['quickbooks-status'],
    queryFn: paymentsApi.getQuickBooksStatus,
  });

  const { data: customerBalance } = useQuery({
    queryKey: ['qb-customer-balance'],
    queryFn: paymentsApi.getQBCustomerBalance,
    enabled: qbStatus?.connected,
  });

  // Fetch P&L report
  const { data: profitLossData, isLoading: plLoading, refetch: refetchPL } = useQuery({
    queryKey: ['qb-profit-loss', plDateRange.startDate, plDateRange.endDate],
    queryFn: () => paymentsApi.getQBProfitLoss(plDateRange.startDate, plDateRange.endDate),
    enabled: showProfitLossModal && qbStatus?.connected,
  });

  // Fetch QB Items
  const { data: qbItems, isLoading: itemsLoading } = useQuery({
    queryKey: ['qb-items'],
    queryFn: paymentsApi.getQBItems,
    enabled: showItemsModal && qbStatus?.connected,
  });

  // Fetch accounts for sync
  const { data: accountsData } = useQuery({
    queryKey: ['accounts-for-sync'],
    queryFn: () => accountsApi.getAccounts({ limit: 500, hasQbCustomerId: false }),
    enabled: syncType === 'customers' && showSyncModal,
  });

  // Fetch invoices for sync
  const { data: invoicesData } = useQuery({
    queryKey: ['invoices-for-sync'],
    queryFn: () => invoicesApi.getInvoices({ limit: 500, notSyncedToQB: true }),
    enabled: syncType === 'invoices' && showSyncModal,
  });

  // Fetch payments for sync
  const { data: paymentsData } = useQuery({
    queryKey: ['payments-for-sync'],
    queryFn: () => paymentsApi.getPayments({ limit: 500, notSyncedToQB: true }),
    enabled: syncType === 'payments' && showSyncModal,
  });

  // Handle sync operations
  const handleStartSync = async () => {
    let items = [];
    let syncFn = null;

    if (syncType === 'customers') {
      items = accountsData?.data || [];
      syncFn = (item) => paymentsApi.syncCustomerToQB(item.id);
    } else if (syncType === 'invoices') {
      items = invoicesData?.data || [];
      syncFn = (item) => paymentsApi.syncInvoiceToQB(item.id);
    } else if (syncType === 'payments') {
      items = paymentsData?.data || [];
      syncFn = (item) => paymentsApi.syncPaymentToQB(item.id);
    }

    if (items.length === 0) {
      setSyncProgress({ current: 0, total: 0, status: 'No items to sync' });
      return;
    }

    setSyncProgress({ current: 0, total: items.length, status: 'Syncing...' });

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < items.length; i++) {
      try {
        await syncFn(items[i]);
        successCount++;
      } catch (error) {
        console.error(`Failed to sync item ${items[i].id}:`, error);
        errorCount++;
      }
      setSyncProgress({
        current: i + 1,
        total: items.length,
        status: `Synced ${successCount} of ${i + 1}${errorCount > 0 ? ` (${errorCount} errors)` : ''}`
      });
    }

    setSyncProgress({
      current: items.length,
      total: items.length,
      status: `Complete! ${successCount} synced${errorCount > 0 ? `, ${errorCount} failed` : ''}`
    });

    // Invalidate queries to refresh data
    queryClient.invalidateQueries(['quickbooks-status']);
    queryClient.invalidateQueries(['qb-customer-balance']);
  };

  // Open sync modal
  const openSyncModal = (type) => {
    setSyncType(type);
    setSyncProgress({ current: 0, total: 0, status: '' });
    setShowSyncModal(true);
  };

  // Handle disconnect (clear QB connection)
  const handleDisconnect = async () => {
    if (window.confirm('Are you sure you want to disconnect QuickBooks? You will need to re-authorize to sync data again.')) {
      // Note: Backend would need a disconnect endpoint - for now just show alert
      alert('To disconnect QuickBooks, please contact your administrator or use the QuickBooks Online dashboard.');
    }
  };

  // Open QuickBooks in new tab
  const openInQuickBooks = () => {
    window.open('https://qbo.intuit.com', '_blank');
  };

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
            <button
              onClick={handleDisconnect}
              className="px-4 py-2 border border-red-300 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={onConnectQuickBooks}
              disabled={isConnecting}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
            >
              {isConnecting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{isConnecting ? 'Connecting...' : 'Connect QuickBooks'}</span>
            </button>
          )}
        </div>
      </div>

      {qbStatus?.connected && (
        <>
          {/* Sync Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => openSyncModal('customers')}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-left hover:border-panda-primary transition-colors"
            >
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <RefreshCw className="w-5 h-5 text-blue-600" />
                </div>
                <span className="font-medium text-gray-900">Sync All Customers</span>
              </div>
              <p className="text-sm text-gray-500">Push all CRM accounts to QuickBooks</p>
            </button>

            <button
              onClick={() => openSyncModal('invoices')}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-left hover:border-panda-primary transition-colors"
            >
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-purple-600" />
                </div>
                <span className="font-medium text-gray-900">Sync Invoices</span>
              </div>
              <p className="text-sm text-gray-500">Sync pending invoices to QuickBooks</p>
            </button>

            <button
              onClick={() => openSyncModal('payments')}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-left hover:border-panda-primary transition-colors"
            >
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
              <button
                onClick={openInQuickBooks}
                className="text-sm text-panda-primary hover:underline flex items-center"
              >
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
                    <button
                      onClick={() => setShowProfitLossModal(true)}
                      className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <span className="text-gray-700">View Profit & Loss</span>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </button>
                    <button
                      onClick={() => window.open('https://qbo.intuit.com/app/reportv2?token=BALANCE_SHEET', '_blank')}
                      className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <span className="text-gray-700">View Balance Sheet</span>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </button>
                    <button
                      onClick={() => window.open('https://qbo.intuit.com/app/reportv2?token=AR_AGING', '_blank')}
                      className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <span className="text-gray-700">View A/R Aging</span>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </button>
                    <button
                      onClick={() => setShowItemsModal(true)}
                      className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
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

      {/* Sync Progress Modal */}
      {showSyncModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">
                Sync {syncType === 'customers' ? 'Customers' : syncType === 'invoices' ? 'Invoices' : 'Payments'} to QuickBooks
              </h3>
            </div>
            <div className="p-6">
              {syncProgress.status === 'idle' && (
                <div className="text-center">
                  <p className="text-gray-600 mb-4">
                    This will sync {syncType === 'customers' ? 'all CRM accounts' : syncType === 'invoices' ? 'pending invoices' : 'recent payments'} to QuickBooks.
                  </p>
                  <p className="text-sm text-gray-500 mb-6">
                    {syncType === 'customers' && `${accountsData?.data?.length || 0} accounts to sync`}
                    {syncType === 'invoices' && `${invoicesData?.data?.length || 0} invoices to sync`}
                    {syncType === 'payments' && `${paymentsData?.data?.length || 0} payments to sync`}
                  </p>
                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={() => setShowSyncModal(false)}
                      className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleStartSync}
                      className="px-4 py-2 bg-panda-primary text-white text-sm font-medium rounded-lg hover:bg-panda-primary/90"
                    >
                      Start Sync
                    </button>
                  </div>
                </div>
              )}
              {syncProgress.status === 'syncing' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">Syncing...</span>
                    <span className="text-sm font-medium text-gray-900">
                      {syncProgress.completed} / {syncProgress.total}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                      className="bg-panda-primary h-2.5 rounded-full transition-all duration-300"
                      style={{ width: `${(syncProgress.completed / syncProgress.total) * 100}%` }}
                    />
                  </div>
                  {syncProgress.errors.length > 0 && (
                    <p className="text-sm text-red-600 mt-2">
                      {syncProgress.errors.length} error(s) encountered
                    </p>
                  )}
                </div>
              )}
              {syncProgress.status === 'complete' && (
                <div className="text-center">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  </div>
                  <p className="text-gray-900 font-medium mb-2">Sync Complete!</p>
                  <p className="text-sm text-gray-600 mb-4">
                    Successfully synced {syncProgress.completed} {syncType}.
                    {syncProgress.errors.length > 0 && ` ${syncProgress.errors.length} failed.`}
                  </p>
                  {syncProgress.errors.length > 0 && (
                    <div className="bg-red-50 rounded-lg p-3 mb-4 max-h-32 overflow-y-auto">
                      <p className="text-sm text-red-700 font-medium mb-1">Errors:</p>
                      {syncProgress.errors.map((error, idx) => (
                        <p key={idx} className="text-xs text-red-600">{error}</p>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => {
                      setShowSyncModal(false);
                      setSyncProgress({ status: 'idle', total: 0, completed: 0, errors: [] });
                    }}
                    className="px-4 py-2 bg-panda-primary text-white text-sm font-medium rounded-lg hover:bg-panda-primary/90"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Profit & Loss Modal */}
      {showProfitLossModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Profit & Loss Report</h3>
              <button
                onClick={() => setShowProfitLossModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div className="flex items-center gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={plDateRange.startDate}
                    onChange={(e) => setPlDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={plDateRange.endDate}
                    onChange={(e) => setPlDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>
              {plLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-4 border-panda-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : plError ? (
                <div className="text-center py-12">
                  <p className="text-red-600">Failed to load report</p>
                </div>
              ) : plData?.data ? (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-500 mb-1">Total Income</p>
                    <p className="text-2xl font-bold text-green-600">
                      ${(plData.data.totalIncome || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-500 mb-1">Total Expenses</p>
                    <p className="text-2xl font-bold text-red-600">
                      ${(plData.data.totalExpenses || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="bg-panda-primary/5 rounded-lg p-4 border border-panda-primary/20">
                    <p className="text-sm text-gray-500 mb-1">Net Income</p>
                    <p className="text-2xl font-bold text-panda-primary">
                      ${(plData.data.netIncome || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  No data available for selected date range
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50">
              <button
                onClick={() => window.open('https://qbo.intuit.com/app/reportv2?token=PROFIT_AND_LOSS', '_blank')}
                className="text-sm text-panda-primary hover:underline flex items-center"
              >
                <ExternalLink className="w-4 h-4 mr-1" />
                View Full Report in QuickBooks
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Items Modal */}
      {showItemsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">QuickBooks Items</h3>
              <button
                onClick={() => setShowItemsModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {qbItemsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-4 border-panda-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : qbItemsError ? (
                <div className="text-center py-12">
                  <p className="text-red-600">Failed to load items</p>
                </div>
              ) : qbItemsData?.data?.length > 0 ? (
                <div className="space-y-2">
                  {qbItemsData.data.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-gray-900">{item.name}</p>
                        {item.description && (
                          <p className="text-sm text-gray-500">{item.description}</p>
                        )}
                      </div>
                      <div className="text-right">
                        {item.unitPrice && (
                          <p className="font-medium text-gray-900">
                            ${parseFloat(item.unitPrice).toFixed(2)}
                          </p>
                        )}
                        <p className="text-xs text-gray-500">{item.type}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  No items found in QuickBooks
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50">
              <button
                onClick={() => window.open('https://qbo.intuit.com/app/items', '_blank')}
                className="text-sm text-panda-primary hover:underline flex items-center"
              >
                <ExternalLink className="w-4 h-4 mr-1" />
                Manage Items in QuickBooks
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Card Element styling for Stripe
const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '16px',
      color: '#374151',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      '::placeholder': {
        color: '#9CA3AF',
      },
    },
    invalid: {
      color: '#EF4444',
      iconColor: '#EF4444',
    },
  },
};

// Take Payment Form Component (uses Stripe hooks)
function TakePaymentForm({ onClose, onSuccess }) {
  const stripe = useStripe();
  const elements = useElements();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [emailSearchQuery, setEmailSearchQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  // Email lookup function
  const searchByEmail = async (email) => {
    if (!email || email.length < 3) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    setIsSearching(true);
    try {
      // Search contacts first
      const contactsResponse = await contactsApi.getContacts({ email, limit: 5 });
      const contacts = (contactsResponse?.data || []).map(c => ({
        type: 'contact',
        id: c.id,
        name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unknown',
        email: c.email,
        phone: c.phone || c.mobilePhone,
        accountName: c.account?.name,
        accountId: c.accountId,
      }));

      // Search accounts
      const accountsResponse = await accountsApi.getAccounts({ search: email, limit: 5 });
      const accounts = (accountsResponse?.data || []).map(a => ({
        type: 'account',
        id: a.id,
        name: a.name,
        email: a.billingEmail || a.email,
        phone: a.phone,
      }));

      const combined = [...contacts, ...accounts].filter(r => r.email);
      setSearchResults(combined);
      setShowSearchResults(combined.length > 0);
    } catch (error) {
      console.error('Email search error:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Debounced email search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (emailSearchQuery && emailSearchQuery.includes('@')) {
        searchByEmail(emailSearchQuery);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [emailSearchQuery]);

  const handleEmailInputChange = (e) => {
    const value = e.target.value;
    setEmailSearchQuery(value);
    setCustomerEmail(value);
    setSelectedCustomer(null);
  };

  const selectCustomer = (customer) => {
    setSelectedCustomer(customer);
    setCustomerEmail(customer.email);
    setEmailSearchQuery(customer.email);
    setShowSearchResults(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!stripe || !elements || !cardComplete) {
      setPaymentError('Please enter valid card details');
      return;
    }

    const amountInCents = Math.round(parseFloat(amount) * 100);
    if (!amountInCents || amountInCents < 50) {
      setPaymentError('Amount must be at least $0.50');
      return;
    }

    setIsProcessing(true);
    setPaymentError(null);

    try {
      // Create payment intent on backend
      const intentResponse = await paymentsApi.createPaymentIntent({
        amount: amountInCents,
        description: description || 'Virtual Terminal Payment',
        metadata: {
          customerEmail,
          customerId: selectedCustomer?.id,
          customerType: selectedCustomer?.type,
          source: 'virtual_terminal',
        },
      });

      if (!intentResponse?.clientSecret) {
        throw new Error('Failed to create payment intent');
      }

      // Confirm the payment with Stripe
      const cardElement = elements.getElement(CardElement);
      const { error, paymentIntent } = await stripe.confirmCardPayment(intentResponse.clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            email: customerEmail || undefined,
          },
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (paymentIntent.status === 'succeeded') {
        setPaymentSuccess(true);
        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 2000);
      } else {
        throw new Error(`Payment status: ${paymentIntent.status}`);
      }
    } catch (error) {
      console.error('Payment error:', error);
      setPaymentError(error.message || 'Payment failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (paymentSuccess) {
    return (
      <div className="p-6 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Payment Successful!</h3>
        <p className="text-gray-600">The payment of ${parseFloat(amount).toFixed(2)} has been processed.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Amount */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($) *</label>
        <input
          type="number"
          step="0.01"
          min="0.50"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
          placeholder="0.00"
          required
        />
      </div>

      {/* Customer Email with Lookup */}
      <div className="relative">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Customer Email
          {isSearching && <Loader2 className="w-3 h-3 inline ml-2 animate-spin text-gray-400" />}
        </label>
        <div className="relative">
          <input
            type="email"
            value={emailSearchQuery}
            onChange={handleEmailInputChange}
            onFocus={() => searchResults.length > 0 && setShowSearchResults(true)}
            onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
            className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
            placeholder="Search by email to find existing customer..."
          />
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
        </div>

        {/* Search Results Dropdown */}
        {showSearchResults && searchResults.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {searchResults.map((result, idx) => (
              <button
                key={`${result.type}-${result.id}-${idx}`}
                type="button"
                onClick={() => selectCustomer(result)}
                className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center space-x-3 border-b last:border-b-0"
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  result.type === 'contact' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'
                }`}>
                  {result.type === 'contact' ? <User className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{result.name}</div>
                  <div className="text-xs text-gray-500 truncate">{result.email}</div>
                  {result.accountName && (
                    <div className="text-xs text-gray-400 truncate">{result.accountName}</div>
                  )}
                </div>
                <span className="text-xs text-gray-400 capitalize">{result.type}</span>
              </button>
            ))}
          </div>
        )}

        {/* Selected Customer Badge */}
        {selectedCustomer && (
          <div className="mt-2 flex items-center space-x-2 text-sm bg-green-50 text-green-700 px-3 py-1.5 rounded-lg">
            <CheckCircle className="w-4 h-4" />
            <span>Linked to: {selectedCustomer.name} ({selectedCustomer.type})</span>
            <button
              type="button"
              onClick={() => {
                setSelectedCustomer(null);
                setEmailSearchQuery('');
                setCustomerEmail('');
              }}
              className="ml-auto text-green-600 hover:text-green-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
          placeholder="Payment for services"
        />
      </div>

      {/* Stripe Card Element */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Card Details *</label>
        <div className="border border-gray-300 rounded-lg p-3 focus-within:ring-2 focus-within:ring-panda-primary focus-within:border-transparent">
          <CardElement
            options={CARD_ELEMENT_OPTIONS}
            onChange={(e) => setCardComplete(e.complete)}
          />
        </div>
        <p className="text-xs text-gray-500 mt-1 flex items-center">
          <CreditCard className="w-3 h-3 mr-1" />
          Secure payment powered by Stripe
        </p>
      </div>

      {/* Error Message */}
      {paymentError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-700 flex items-center">
            <AlertTriangle className="w-4 h-4 mr-2" />
            {paymentError}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex space-x-3 pt-2">
        <button
          type="button"
          onClick={onClose}
          disabled={isProcessing}
          className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isProcessing || !stripe || !cardComplete || !amount}
          className="flex-1 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Processing...
            </>
          ) : (
            <>
              <CreditCard className="w-4 h-4 mr-2" />
              Charge ${amount ? parseFloat(amount).toFixed(2) : '0.00'}
            </>
          )}
        </button>
      </div>
    </form>
  );
}

// Stripe Tab Component
function StripeTab() {
  const [showPaymentLinkModal, setShowPaymentLinkModal] = useState(false);
  const [showTakePaymentModal, setShowTakePaymentModal] = useState(false);
  const [showCreatePlanModal, setShowCreatePlanModal] = useState(false);
  const [paymentLinkForm, setPaymentLinkForm] = useState({ amount: '', description: '', accountId: '', jobId: '', workOrderId: '' });
  const [paymentLinkAccountSearch, setPaymentLinkAccountSearch] = useState('');
  const [paymentLinkJobSearch, setPaymentLinkJobSearch] = useState('');
  const [takePaymentForm, setTakePaymentForm] = useState({ amount: '', description: '', customerEmail: '' });
  const [createPlanForm, setCreatePlanForm] = useState({ amount: '', interval: 'month', description: '', accountId: '', planName: '' });
  const [createdPaymentLink, setCreatedPaymentLink] = useState(null);
  const [createdSubscription, setCreatedSubscription] = useState(null);
  const [accountSearch, setAccountSearch] = useState('');
  const [stripePromise, setStripePromise] = useState(null);
  const queryClient = useQueryClient();

  // Load Stripe on component mount
  useEffect(() => {
    const initStripe = async () => {
      try {
        const config = await paymentsApi.getStripeConfig();
        if (config?.publishableKey) {
          setStripePromise(loadStripe(config.publishableKey));
        }
      } catch (error) {
        console.error('Failed to load Stripe config:', error);
      }
    };
    initStripe();
  }, []);

  // Create Payment Link mutation
  const createPaymentLinkMutation = useMutation({
    mutationFn: (data) => paymentsApi.createPaymentLink(data),
    onSuccess: (data) => {
      setCreatedPaymentLink(data);
      setPaymentLinkForm({ amount: '', description: '', accountId: '', jobId: '', workOrderId: '' });
      setPaymentLinkAccountSearch('');
      setPaymentLinkJobSearch('');
      queryClient.invalidateQueries(['payment-links']);
    },
  });

  // Create Payment Intent mutation (for Take Payment - legacy, kept for reference)
  const createPaymentIntentMutation = useMutation({
    mutationFn: (data) => paymentsApi.createPaymentIntent(data),
    onSuccess: () => {
      setShowTakePaymentModal(false);
      setTakePaymentForm({ amount: '', description: '', customerEmail: '' });
      queryClient.invalidateQueries(['payments']);
    },
  });

  // Create Subscription mutation
  const createSubscriptionMutation = useMutation({
    mutationFn: (data) => paymentsApi.createSubscription(data),
    onSuccess: (data) => {
      setCreatedSubscription(data);
      setCreatePlanForm({ amount: '', interval: 'month', description: '', accountId: '', planName: '' });
      setAccountSearch('');
      queryClient.invalidateQueries(['subscriptions']);
    },
  });

  // Account search query for subscription creation
  const { data: accountSearchResults } = useQuery({
    queryKey: ['accounts-search', accountSearch],
    queryFn: () => accountsApi.getAccounts({ search: accountSearch, limit: 10 }),
    enabled: accountSearch.length >= 2,
  });

  // Account search query for payment link creation
  const { data: paymentLinkAccountResults } = useQuery({
    queryKey: ['accounts-search-pl', paymentLinkAccountSearch],
    queryFn: () => accountsApi.getAccounts({ search: paymentLinkAccountSearch, limit: 10 }),
    enabled: paymentLinkAccountSearch.length >= 2,
  });

  // Job search query for payment link creation
  const { data: paymentLinkJobResults } = useQuery({
    queryKey: ['jobs-search-pl', paymentLinkJobSearch],
    queryFn: () => opportunitiesApi.getOpportunities({ search: paymentLinkJobSearch, limit: 10 }),
    enabled: paymentLinkJobSearch.length >= 2,
  });

  const handleCreatePaymentLink = (e) => {
    e.preventDefault();
    if (!paymentLinkForm.amount) return;
    createPaymentLinkMutation.mutate({
      amount: parseFloat(paymentLinkForm.amount),
      description: paymentLinkForm.description || 'Payment',
      accountId: paymentLinkForm.accountId || undefined,
      jobId: paymentLinkForm.jobId || undefined,
      workOrderId: paymentLinkForm.workOrderId || undefined,
    });
  };

  const handleTakePayment = (e) => {
    e.preventDefault();
    if (!takePaymentForm.amount) return;
    createPaymentIntentMutation.mutate({
      amount: Math.round(parseFloat(takePaymentForm.amount) * 100), // Convert to cents
      description: takePaymentForm.description,
      metadata: { customerEmail: takePaymentForm.customerEmail },
    });
  };

  const handleCreatePlan = (e) => {
    e.preventDefault();
    if (!createPlanForm.amount || !createPlanForm.accountId || !createPlanForm.planName) return;
    createSubscriptionMutation.mutate({
      accountId: createPlanForm.accountId,
      planName: createPlanForm.planName,
      planDescription: createPlanForm.description || '',
      amount: parseFloat(createPlanForm.amount),
      interval: createPlanForm.interval,
    });
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

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
          <button
            onClick={() => setShowPaymentLinkModal(true)}
            className="w-full px-4 py-2 bg-panda-primary text-white text-sm font-medium rounded-lg hover:bg-panda-primary/90 transition-colors"
          >
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
          <button
            onClick={() => setShowTakePaymentModal(true)}
            className="w-full px-4 py-2 bg-panda-primary text-white text-sm font-medium rounded-lg hover:bg-panda-primary/90 transition-colors"
          >
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
          <button
            onClick={() => setShowCreatePlanModal(true)}
            className="w-full px-4 py-2 bg-panda-primary text-white text-sm font-medium rounded-lg hover:bg-panda-primary/90 transition-colors"
          >
            Create Plan
          </button>
        </div>
      </div>

      {/* Create Payment Link Modal */}
      {showPaymentLinkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Create Payment Link</h3>
              <button
                onClick={() => {
                  setShowPaymentLinkModal(false);
                  setCreatedPaymentLink(null);
                  setPaymentLinkForm({ amount: '', description: '', accountId: '', jobId: '', workOrderId: '' });
                  setPaymentLinkAccountSearch('');
                  setPaymentLinkJobSearch('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              {createdPaymentLink ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-center w-12 h-12 mx-auto bg-green-100 rounded-full">
                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                  </div>
                  <p className="text-center text-gray-900 font-medium">Payment Link Created!</p>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-sm text-gray-500 mb-1">Share this link:</p>
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        readOnly
                        value={createdPaymentLink.url}
                        className="flex-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg"
                      />
                      <button
                        onClick={() => copyToClipboard(createdPaymentLink.url)}
                        className="px-3 py-2 bg-panda-primary text-white text-sm rounded-lg hover:bg-panda-primary/90"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowPaymentLinkModal(false);
                      setCreatedPaymentLink(null);
                    }}
                    className="w-full px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <form onSubmit={handleCreatePaymentLink} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.50"
                      value={paymentLinkForm.amount}
                      onChange={(e) => setPaymentLinkForm({ ...paymentLinkForm, amount: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                      placeholder="0.00"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <input
                      type="text"
                      value={paymentLinkForm.description}
                      onChange={(e) => setPaymentLinkForm({ ...paymentLinkForm, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                      placeholder="Payment for services"
                    />
                  </div>

                  {/* Account Selection (Optional) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Attach to Account <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={paymentLinkAccountSearch}
                        onChange={(e) => {
                          setPaymentLinkAccountSearch(e.target.value);
                          if (!e.target.value) {
                            setPaymentLinkForm({ ...paymentLinkForm, accountId: '', jobId: '', workOrderId: '' });
                            setPaymentLinkJobSearch('');
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                        placeholder="Search accounts..."
                      />
                      {paymentLinkAccountSearch.length >= 2 && paymentLinkAccountResults?.data?.length > 0 && !paymentLinkForm.accountId && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {paymentLinkAccountResults.data.map((account) => (
                            <button
                              key={account.id}
                              type="button"
                              onClick={() => {
                                setPaymentLinkForm({ ...paymentLinkForm, accountId: account.id, jobId: '', workOrderId: '' });
                                setPaymentLinkAccountSearch(account.name);
                                setPaymentLinkJobSearch('');
                              }}
                              className="w-full px-3 py-2 text-left hover:bg-gray-50 text-sm"
                            >
                              <span className="font-medium">{account.name}</span>
                              {account.billingCity && (
                                <span className="text-gray-500 ml-2">{account.billingCity}, {account.billingState}</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                      {paymentLinkForm.accountId && (
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentLinkForm({ ...paymentLinkForm, accountId: '', jobId: '', workOrderId: '' });
                            setPaymentLinkAccountSearch('');
                            setPaymentLinkJobSearch('');
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Job Selection (Optional - only shown when account is selected) */}
                  {paymentLinkForm.accountId && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Attach to Job <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={paymentLinkJobSearch}
                          onChange={(e) => {
                            setPaymentLinkJobSearch(e.target.value);
                            if (!e.target.value) {
                              setPaymentLinkForm({ ...paymentLinkForm, jobId: '', workOrderId: '' });
                            }
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                          placeholder="Search jobs..."
                        />
                        {paymentLinkJobSearch.length >= 2 && paymentLinkJobResults?.data?.length > 0 && !paymentLinkForm.jobId && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                            {paymentLinkJobResults.data
                              .filter((job) => job.accountId === paymentLinkForm.accountId)
                              .map((job) => (
                                <button
                                  key={job.id}
                                  type="button"
                                  onClick={() => {
                                    setPaymentLinkForm({ ...paymentLinkForm, jobId: job.id });
                                    setPaymentLinkJobSearch(job.name || job.jobId || `Job ${job.id.slice(0, 8)}`);
                                  }}
                                  className="w-full px-3 py-2 text-left hover:bg-gray-50 text-sm"
                                >
                                  <span className="font-medium">{job.name || job.jobId || `Job ${job.id.slice(0, 8)}`}</span>
                                  {job.stageName && (
                                    <span className="text-gray-500 ml-2">({job.stageName})</span>
                                  )}
                                </button>
                              ))}
                          </div>
                        )}
                        {paymentLinkForm.jobId && (
                          <button
                            type="button"
                            onClick={() => {
                              setPaymentLinkForm({ ...paymentLinkForm, jobId: '', workOrderId: '' });
                              setPaymentLinkJobSearch('');
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex space-x-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowPaymentLinkModal(false)}
                      className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={createPaymentLinkMutation.isPending}
                      className="flex-1 px-4 py-2 bg-panda-primary text-white text-sm font-medium rounded-lg hover:bg-panda-primary/90 disabled:opacity-50 flex items-center justify-center"
                    >
                      {createPaymentLinkMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Create Link'
                      )}
                    </button>
                  </div>
                  {createPaymentLinkMutation.isError && (
                    <p className="text-sm text-red-600">
                      {createPaymentLinkMutation.error?.message || 'Failed to create payment link'}
                    </p>
                  )}
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Take Payment Modal - Stripe Elements */}
      {showTakePaymentModal && stripePromise && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Take Payment</h3>
              <button
                onClick={() => setShowTakePaymentModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <Elements stripe={stripePromise}>
                <TakePaymentForm
                  onClose={() => setShowTakePaymentModal(false)}
                  onSuccess={() => {
                    queryClient.invalidateQueries(['payments']);
                    setShowTakePaymentModal(false);
                  }}
                />
              </Elements>
            </div>
          </div>
        </div>
      )}

      {/* Create Plan Modal */}
      {showCreatePlanModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Create Payment Plan</h3>
              <button
                onClick={() => {
                  setShowCreatePlanModal(false);
                  setCreatedSubscription(null);
                  setAccountSearch('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              {createdSubscription ? (
                <div className="text-center py-4">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                  </div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-2">Payment Plan Created!</h4>
                  <p className="text-gray-600 mb-4">
                    Subscription ID: {createdSubscription.data?.subscription?.id || createdSubscription.subscription?.id || 'Created'}
                  </p>
                  <button
                    onClick={() => {
                      setShowCreatePlanModal(false);
                      setCreatedSubscription(null);
                      setAccountSearch('');
                    }}
                    className="px-4 py-2 bg-panda-primary text-white text-sm font-medium rounded-lg hover:bg-panda-primary/90"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <form onSubmit={handleCreatePlan} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Customer Account *</label>
                    <input
                      type="text"
                      value={accountSearch}
                      onChange={(e) => setAccountSearch(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                      placeholder="Search for account..."
                    />
                    {accountSearch.length >= 2 && accountSearchResults?.data?.length > 0 && !createPlanForm.accountId && (
                      <div className="mt-1 border border-gray-200 rounded-lg max-h-32 overflow-y-auto">
                        {accountSearchResults.data.map((account) => (
                          <button
                            key={account.id}
                            type="button"
                            onClick={() => {
                              setCreatePlanForm({ ...createPlanForm, accountId: account.id });
                              setAccountSearch(account.name);
                            }}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                          >
                            {account.name}
                          </button>
                        ))}
                      </div>
                    )}
                    {createPlanForm.accountId && (
                      <p className="mt-1 text-xs text-green-600 flex items-center">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Account selected
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Plan Name *</label>
                    <input
                      type="text"
                      value={createPlanForm.planName}
                      onChange={(e) => setCreatePlanForm({ ...createPlanForm, planName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                      placeholder="e.g., Monthly Payment Plan"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount per Payment ($) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.50"
                      value={createPlanForm.amount}
                      onChange={(e) => setCreatePlanForm({ ...createPlanForm, amount: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                      placeholder="0.00"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Billing Interval</label>
                    <select
                      value={createPlanForm.interval}
                      onChange={(e) => setCreatePlanForm({ ...createPlanForm, interval: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                    >
                      <option value="week">Weekly</option>
                      <option value="month">Monthly</option>
                      <option value="year">Yearly</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
                    <input
                      type="text"
                      value={createPlanForm.description}
                      onChange={(e) => setCreatePlanForm({ ...createPlanForm, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                      placeholder="Payment plan description"
                    />
                  </div>
                  {createSubscriptionMutation.isError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-sm text-red-800">
                        <AlertCircle className="w-4 h-4 inline mr-1" />
                        {createSubscriptionMutation.error?.message || 'Failed to create payment plan'}
                      </p>
                    </div>
                  )}
                  <div className="flex space-x-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreatePlanModal(false);
                        setAccountSearch('');
                      }}
                      className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={createSubscriptionMutation.isPending || !createPlanForm.accountId || !createPlanForm.planName || !createPlanForm.amount}
                      className="flex-1 px-4 py-2 bg-panda-primary text-white text-sm font-medium rounded-lg hover:bg-panda-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                      {createSubscriptionMutation.isPending ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                          Creating...
                        </>
                      ) : (
                        'Create Plan'
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

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
  const [isConnectingQB, setIsConnectingQB] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const queryClient = useQueryClient();

  // Handler for QuickBooks OAuth connection
  // Navigate directly to the authorize endpoint - the backend will redirect to QuickBooks OAuth
  // This avoids CORS issues that occur when axios tries to follow the redirect
  const handleConnectQuickBooks = () => {
    setIsConnectingQB(true);
    // Direct navigation to the authorize endpoint - browser handles the redirect natively
    window.location.href = '/api/quickbooks/oauth/authorize';
  };

  // Fetch stats for overview with data transformation to match OverviewTab expectations
  const { data: invoiceStats } = useQuery({
    queryKey: ['invoice-stats'],
    queryFn: paymentsApi.getInvoiceStats,
    select: (response) => {
      // Transform backend response format to match OverviewTab expected fields
      // Backend returns: { total, overdue, byStatus, totals: { billed, paid, outstanding, average } }
      // OverviewTab expects: totalOutstanding, outstandingCount, overdueAmount, overdueCount, etc.
      const data = response?.data || response || {};
      const byStatus = data.byStatus || {};
      const totals = data.totals || {};

      return {
        totalOutstanding: totals.outstanding || 0,
        outstandingCount: Object.values(byStatus).reduce((sum, s) => sum + (s?.balanceDue > 0 ? s.count : 0), 0),
        overdueAmount: byStatus.OVERDUE?.balanceDue || byStatus.overdue?.balanceDue || 0,
        overdueCount: data.overdue || byStatus.OVERDUE?.count || 0,
        draftCount: byStatus.DRAFT?.count || byStatus.draft?.count || 0,
        syncedCount: data.syncedCount || 0,
        pendingSyncCount: data.pendingSyncCount || 0,
        failedSyncCount: data.failedSyncCount || 0,
        totalBilled: totals.billed || 0,
        totalPaid: totals.paid || 0,
        averageInvoice: totals.average || 0,
        total: data.total || 0,
        byStatus: byStatus,
      };
    },
  });

  const { data: paymentStats } = useQuery({
    queryKey: ['payment-stats'],
    queryFn: paymentsApi.getPaymentStats,
    select: (response) => {
      // Transform backend response format to match OverviewTab expected fields
      // Backend returns: { success, data: { total, byStatus, byMethod, last30Days } }
      // OverviewTab expects: thisMonth, pending, recentPayments
      const data = response?.data || response || {};
      const innerData = data.data || data;

      return {
        thisMonth: innerData.last30Days?.amount || innerData.thisMonth || 0,
        thisMonthCount: innerData.last30Days?.count || 0,
        pending: innerData.byStatus?.PENDING?.amount || innerData.byStatus?.pending?.amount || innerData.pending || 0,
        pendingCount: innerData.byStatus?.PENDING?.count || innerData.byStatus?.pending?.count || 0,
        recentPayments: innerData.recentPayments || [],
        totalAmount: innerData.total?.amount || 0,
        totalCount: innerData.total?.count || 0,
        byMethod: innerData.byMethod || {},
        byStatus: innerData.byStatus || {},
      };
    },
  });

  const { data: qbStatus } = useQuery({
    queryKey: ['quickbooks-status'],
    queryFn: paymentsApi.getQuickBooksStatus,
    select: (response) => {
      // Transform backend response format to match OverviewTab expected fields
      const data = response?.data || response || {};
      return {
        connected: data.connected || false,
        realmId: data.realmId || null,
        hasRefreshToken: data.hasRefreshToken || false,
        lastSync: data.lastSync || null,
        companyName: data.companyName || null,
      };
    },
  });

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Payment Center</h1>
          <p className="text-gray-500 mt-1">
            Manage invoices, payments, and accounting integrations
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowSettingsModal(true)}
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-2"
          >
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
        <OverviewTab
          invoiceStats={invoiceStats}
          paymentStats={paymentStats}
          qbStatus={qbStatus}
          onConnectQuickBooks={handleConnectQuickBooks}
          isConnecting={isConnectingQB}
        />
      )}
      {activeTab === 'invoices' && <InvoicesTab />}
      {activeTab === 'payments' && <PaymentsTab />}
      {activeTab === 'quickbooks' && (
        <QuickBooksTab
          onConnectQuickBooks={handleConnectQuickBooks}
          isConnecting={isConnectingQB}
        />
      )}
      {activeTab === 'stripe' && <StripeTab />}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Payment Center Settings</h2>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              {/* QuickBooks Settings */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-green-600" />
                  QuickBooks Integration
                </h3>
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">Connection Status</span>
                    {qbStatus?.connected ? (
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle className="w-4 h-4" />
                        Connected
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-red-600">
                        <XCircle className="w-4 h-4" />
                        Not Connected
                      </span>
                    )}
                  </div>
                  {qbStatus?.realmId && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-700">Company ID</span>
                      <span className="text-gray-500 font-mono text-sm">{qbStatus.realmId}</span>
                    </div>
                  )}
                  <div className="pt-2">
                    <button
                      onClick={() => {
                        setShowSettingsModal(false);
                        handleConnectQuickBooks();
                      }}
                      disabled={isConnectingQB}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      {isConnectingQB ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Connecting...
                        </>
                      ) : qbStatus?.connected ? (
                        <>
                          <RefreshCw className="w-4 h-4" />
                          Reconnect QuickBooks
                        </>
                      ) : (
                        <>
                          <Link2 className="w-4 h-4" />
                          Connect QuickBooks
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Stripe Settings */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-purple-600" />
                  Stripe Integration
                </h3>
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">Status</span>
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle className="w-4 h-4" />
                      Configured
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">Webhooks</span>
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle className="w-4 h-4" />
                      Active
                    </span>
                  </div>
                  <div className="pt-2">
                    <a
                      href="https://dashboard.stripe.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 inline-flex items-center gap-2"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Open Stripe Dashboard
                    </a>
                  </div>
                </div>
              </div>

              {/* Invoice Settings */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  Invoice Settings
                </h3>
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">Default Payment Terms</span>
                    <span className="text-gray-500">Net 7 (Due 7 days from invoice date)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">Auto-Sync with QuickBooks</span>
                    <span className="text-gray-500">Enabled</span>
                  </div>
                </div>
              </div>

              {/* Late Fee Configuration */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                  Late Fee Configuration
                </h3>
                <div className="bg-red-50 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">Default Late Fee Rate</span>
                    <span className="text-red-600 font-medium">1.5% of balance due</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">Late Fee Frequency</span>
                    <span className="text-gray-500">Every 30 days (30, 60, 90+ days overdue)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">Late Fee Trigger</span>
                    <span className="text-gray-500">When invoice is past due date</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">Grace Period</span>
                    <span className="text-gray-500">30 days after due date</span>
                  </div>
                  <div className="border-t border-red-200 pt-3 mt-3">
                    <p className="text-sm text-gray-600">
                      <strong>How it works:</strong> Late fees are automatically calculated as a percentage
                      of the outstanding balance. A new late fee is added every 30 days the invoice remains
                      unpaid (at 30, 60, 90 days overdue, etc.). Each account can have a custom late fee
                      percentage, or the default 1.5% is used.
                    </p>
                  </div>
                  <div className="pt-2">
                    <p className="text-xs text-gray-500">
                      Late fees are stored as Additional Charges on the invoice and reflected in the
                      total balance due. They sync to QuickBooks automatically.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </AdminLayout>
  );
}
