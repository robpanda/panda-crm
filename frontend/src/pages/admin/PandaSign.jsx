import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AdminLayout from '../../components/AdminLayout';
import {
  PenTool,
  FileText,
  Send,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  Download,
  Plus,
  Search,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Copy,
  Mail,
  Phone,
  User,
  Building2,
  Calendar,
  AlertCircle,
} from 'lucide-react';

// PandaSign API base URL
const PANDASIGN_API = 'https://7paaginnvg.execute-api.us-east-2.amazonaws.com/prod/pandasign';

const STATUS_CONFIG = {
  draft: { color: 'bg-gray-100 text-gray-700', icon: FileText, label: 'Draft' },
  sent: { color: 'bg-blue-100 text-blue-700', icon: Send, label: 'Sent' },
  viewed: { color: 'bg-yellow-100 text-yellow-700', icon: Eye, label: 'Viewed' },
  signed: { color: 'bg-green-100 text-green-700', icon: CheckCircle, label: 'Signed' },
  declined: { color: 'bg-red-100 text-red-700', icon: XCircle, label: 'Declined' },
  expired: { color: 'bg-orange-100 text-orange-700', icon: Clock, label: 'Expired' },
};

export default function PandaSign() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('agreements');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedAgreement, setSelectedAgreement] = useState(null);
  const limit = 20;

  // Fetch agreements
  const { data: agreementsData, isLoading: loadingAgreements, refetch: refetchAgreements } = useQuery({
    queryKey: ['pandasign-agreements', page, statusFilter, searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        ...(statusFilter && { status: statusFilter }),
        ...(searchTerm && { search: searchTerm }),
      });
      const response = await fetch(`${PANDASIGN_API}/agreements?${params}`);
      if (!response.ok) throw new Error('Failed to fetch agreements');
      return response.json();
    },
  });

  // Fetch templates
  const { data: templatesData, isLoading: loadingTemplates, refetch: refetchTemplates } = useQuery({
    queryKey: ['pandasign-templates'],
    queryFn: async () => {
      const response = await fetch(`${PANDASIGN_API}/templates`);
      if (!response.ok) throw new Error('Failed to fetch templates');
      return response.json();
    },
    enabled: activeTab === 'templates',
  });

  // Fetch stats
  const { data: statsData } = useQuery({
    queryKey: ['pandasign-stats'],
    queryFn: async () => {
      const response = await fetch(`${PANDASIGN_API}/stats`);
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json();
    },
  });

  const agreements = agreementsData?.agreements || [];
  const templates = templatesData?.templates || [];
  const stats = statsData?.stats || { total: 0, sent: 0, signed: 0, pending: 0 };
  const pagination = agreementsData?.pagination || { total: 0, totalPages: 1 };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const StatusBadge = ({ status }) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
    const Icon = config.icon;
    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${config.color}`}>
        <Icon className="w-3 h-3 mr-1" />
        {config.label}
      </span>
    );
  };

  const StatCard = ({ icon: Icon, label, value, color }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center">
              <PenTool className="w-7 h-7 mr-3 text-panda-primary" />
              PandaSign
            </h1>
          <p className="text-gray-500 mt-1">Electronic signature management for contracts and agreements</p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => activeTab === 'agreements' ? refetchAgreements() : refetchTemplates()}
            className="inline-flex items-center px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </button>
          <button className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white text-sm font-medium rounded-lg hover:opacity-90">
            <Plus className="w-4 h-4 mr-2" />
            New Agreement
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          icon={FileText}
          label="Total Agreements"
          value={stats.total}
          color="bg-gray-100 text-gray-600"
        />
        <StatCard
          icon={Send}
          label="Sent"
          value={stats.sent}
          color="bg-blue-100 text-blue-600"
        />
        <StatCard
          icon={Clock}
          label="Pending"
          value={stats.pending}
          color="bg-yellow-100 text-yellow-600"
        />
        <StatCard
          icon={CheckCircle}
          label="Signed"
          value={stats.signed}
          color="bg-green-100 text-green-600"
        />
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="border-b border-gray-100">
          <div className="flex space-x-1 p-1">
            <button
              onClick={() => setActiveTab('agreements')}
              className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'agreements'
                  ? 'bg-gradient-to-r from-panda-primary to-panda-secondary text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <FileText className="w-4 h-4 inline mr-2" />
              Agreements
            </button>
            <button
              onClick={() => setActiveTab('templates')}
              className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'templates'
                  ? 'bg-gradient-to-r from-panda-primary to-panda-secondary text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Copy className="w-4 h-4 inline mr-2" />
              Templates ({templates.length})
            </button>
          </div>
        </div>

        {/* Agreements Tab */}
        {activeTab === 'agreements' && (
          <>
            {/* Filters */}
            <div className="p-4 border-b border-gray-100">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search agreements..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setPage(1);
                    }}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                >
                  <option value="">All Status</option>
                  {Object.entries(STATUS_CONFIG).map(([key, val]) => (
                    <option key={key} value={key}>{val.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Agreements List */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Agreement
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Signer
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sent
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loadingAgreements ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center">
                        <div className="animate-spin w-8 h-8 border-2 border-panda-primary border-t-transparent rounded-full mx-auto" />
                      </td>
                    </tr>
                  ) : agreements.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p>No agreements found</p>
                      </td>
                    </tr>
                  ) : (
                    agreements.map((agreement) => (
                      <tr key={agreement.id} className="hover:bg-gray-50">
                        <td className="px-4 py-4">
                          <div>
                            <p className="font-medium text-gray-900">{agreement.name || 'Untitled Agreement'}</p>
                            <p className="text-sm text-gray-500">{agreement.templateName}</p>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-panda-primary to-panda-secondary flex items-center justify-center text-white text-sm font-medium">
                              {agreement.signerName?.charAt(0) || '?'}
                            </div>
                            <div className="ml-3">
                              <p className="font-medium text-gray-900">{agreement.signerName || 'Unknown'}</p>
                              <p className="text-sm text-gray-500">{agreement.signerEmail}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge status={agreement.status} />
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-500">
                          {formatDate(agreement.sentAt)}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center space-x-1">
                            <button
                              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                              title="View"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {agreement.status === 'signed' && (
                              <button
                                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                                title="Download"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            )}
                            {agreement.status === 'sent' && (
                              <button
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                title="Resend"
                              >
                                <Send className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, pagination.total)} of {pagination.total} results
                </p>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-gray-700">
                    Page {page} of {pagination.totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                    disabled={page === pagination.totalPages}
                    className="p-2 border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Templates Tab */}
        {activeTab === 'templates' && (
          <div className="p-6">
            {loadingTemplates ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin w-8 h-8 border-2 border-panda-primary border-t-transparent rounded-full" />
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-8">
                <Copy className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 mb-4">No templates available</p>
                <button className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200">
                  Create Template
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className="border border-gray-200 rounded-xl p-4 hover:border-panda-primary hover:shadow-md transition-all cursor-pointer"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-panda-primary to-panda-secondary flex items-center justify-center">
                        <FileText className="w-5 h-5 text-white" />
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        template.isActive
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {template.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-1">{template.name}</h3>
                    <p className="text-sm text-gray-500 mb-3 line-clamp-2">
                      {template.description || 'No description'}
                    </p>
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>{template.category || 'General'}</span>
                      <span>{template.usageCount || 0} uses</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </AdminLayout>
  );
}
