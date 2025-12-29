import { useState } from 'react';
import {
  Mail,
  MessageSquare,
  Plus,
  Search,
  Filter,
  Play,
  Pause,
  Trash2,
  Eye,
  Copy,
  MoreVertical,
  Users,
  CheckCircle,
  Clock,
  XCircle,
  Send,
  BarChart3,
  Calendar,
  Target,
} from 'lucide-react';

// Mock data for campaigns
const mockCampaigns = [
  {
    id: 1,
    name: 'Winter Roofing Special',
    type: 'email',
    status: 'active',
    sent: 1250,
    delivered: 1198,
    opened: 456,
    clicked: 89,
    audience: 'All Leads',
    createdAt: '2024-12-01',
    scheduledAt: '2024-12-15',
  },
  {
    id: 2,
    name: 'Follow-up Reminder',
    type: 'sms',
    status: 'draft',
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    audience: 'Recent Inquiries',
    createdAt: '2024-12-10',
    scheduledAt: null,
  },
  {
    id: 3,
    name: 'Holiday Discount Offer',
    type: 'email',
    status: 'completed',
    sent: 3500,
    delivered: 3412,
    opened: 1205,
    clicked: 287,
    audience: 'Past Customers',
    createdAt: '2024-11-20',
    scheduledAt: '2024-11-25',
  },
  {
    id: 4,
    name: 'Appointment Confirmation',
    type: 'sms',
    status: 'active',
    sent: 89,
    delivered: 87,
    opened: 87,
    clicked: 45,
    audience: 'Scheduled Appointments',
    createdAt: '2024-12-05',
    scheduledAt: '2024-12-05',
  },
  {
    id: 5,
    name: 'Insurance Claim Updates',
    type: 'email',
    status: 'paused',
    sent: 450,
    delivered: 442,
    opened: 189,
    clicked: 34,
    audience: 'Insurance Clients',
    createdAt: '2024-12-08',
    scheduledAt: '2024-12-10',
  },
];

const statusColors = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-green-100 text-green-700',
  paused: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-blue-100 text-blue-700',
  failed: 'bg-red-100 text-red-700',
};

const statusIcons = {
  draft: Clock,
  active: Play,
  paused: Pause,
  completed: CheckCircle,
  failed: XCircle,
};

export default function Campaigns() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [campaigns] = useState(mockCampaigns);

  const filteredCampaigns = campaigns.filter((campaign) => {
    const matchesSearch = campaign.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = selectedType === 'all' || campaign.type === selectedType;
    const matchesStatus = selectedStatus === 'all' || campaign.status === selectedStatus;
    return matchesSearch && matchesType && matchesStatus;
  });

  const stats = {
    total: campaigns.length,
    active: campaigns.filter(c => c.status === 'active').length,
    totalSent: campaigns.reduce((sum, c) => sum + c.sent, 0),
    avgOpenRate: Math.round(
      (campaigns.reduce((sum, c) => sum + (c.delivered > 0 ? c.opened / c.delivered : 0), 0) /
        campaigns.length) * 100
    ),
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const calculateOpenRate = (campaign) => {
    if (campaign.delivered === 0) return 0;
    return Math.round((campaign.opened / campaign.delivered) * 100);
  };

  const calculateClickRate = (campaign) => {
    if (campaign.opened === 0) return 0;
    return Math.round((campaign.clicked / campaign.opened) * 100);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
          <p className="text-gray-600 mt-1">Manage email and SMS marketing campaigns</p>
        </div>
        <button className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg font-medium hover:opacity-90 transition-opacity">
          <Plus className="w-5 h-5 mr-2" />
          New Campaign
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Campaigns</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
            </div>
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Target className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Active</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{stats.active}</p>
            </div>
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Play className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Sent</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalSent.toLocaleString()}</p>
            </div>
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Send className="w-5 h-5 text-purple-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Avg Open Rate</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.avgOpenRate}%</p>
            </div>
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-yellow-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search campaigns..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
            />
          </div>

          {/* Type Filter */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
          >
            <option value="all">All Types</option>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
          >
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      {/* Campaigns List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Campaign
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                  Status
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                  Audience
                </th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                  Sent
                </th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                  Open Rate
                </th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden xl:table-cell">
                  Click Rate
                </th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredCampaigns.map((campaign) => {
                const StatusIcon = statusIcons[campaign.status];
                return (
                  <tr key={campaign.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          campaign.type === 'email' ? 'bg-blue-100' : 'bg-green-100'
                        }`}>
                          {campaign.type === 'email' ? (
                            <Mail className={`w-5 h-5 ${campaign.type === 'email' ? 'text-blue-600' : 'text-green-600'}`} />
                          ) : (
                            <MessageSquare className="w-5 h-5 text-green-600" />
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{campaign.name}</div>
                          <div className="text-sm text-gray-500 flex items-center mt-0.5">
                            <Calendar className="w-3 h-3 mr-1" />
                            {formatDate(campaign.scheduledAt || campaign.createdAt)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 hidden sm:table-cell">
                      <span className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full ${statusColors[campaign.status]}`}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {campaign.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell">
                      <div className="flex items-center text-sm text-gray-600">
                        <Users className="w-4 h-4 mr-1 text-gray-400" />
                        {campaign.audience}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-900 hidden lg:table-cell">
                      {campaign.sent.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right hidden lg:table-cell">
                      <span className={`text-sm font-medium ${
                        calculateOpenRate(campaign) > 30 ? 'text-green-600' :
                        calculateOpenRate(campaign) > 15 ? 'text-yellow-600' : 'text-gray-600'
                      }`}>
                        {calculateOpenRate(campaign)}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right hidden xl:table-cell">
                      <span className={`text-sm font-medium ${
                        calculateClickRate(campaign) > 10 ? 'text-green-600' :
                        calculateClickRate(campaign) > 5 ? 'text-yellow-600' : 'text-gray-600'
                      }`}>
                        {calculateClickRate(campaign)}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="View">
                          <Eye className="w-4 h-4 text-gray-500" />
                        </button>
                        <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Duplicate">
                          <Copy className="w-4 h-4 text-gray-500" />
                        </button>
                        {campaign.status === 'active' ? (
                          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Pause">
                            <Pause className="w-4 h-4 text-yellow-500" />
                          </button>
                        ) : campaign.status === 'paused' ? (
                          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Resume">
                            <Play className="w-4 h-4 text-green-500" />
                          </button>
                        ) : null}
                        <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Delete">
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredCampaigns.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            <Mail className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p>No campaigns found</p>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Create Email Campaign</h3>
              <p className="text-blue-100 mt-1 text-sm">Send newsletters, promotions, or updates</p>
            </div>
            <Mail className="w-10 h-10 text-blue-200" />
          </div>
          <button className="mt-4 px-4 py-2 bg-white text-blue-600 rounded-lg font-medium hover:bg-blue-50 transition-colors">
            Get Started
          </button>
        </div>
        <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Create SMS Campaign</h3>
              <p className="text-green-100 mt-1 text-sm">Quick updates and appointment reminders</p>
            </div>
            <MessageSquare className="w-10 h-10 text-green-200" />
          </div>
          <button className="mt-4 px-4 py-2 bg-white text-green-600 rounded-lg font-medium hover:bg-green-50 transition-colors">
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
}
