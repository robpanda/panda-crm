import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { reportsApi } from '../services/api';
import {
  Plus,
  LayoutGrid,
  Star,
  Clock,
  MoreVertical,
  Edit,
  Trash2,
  Copy,
  ExternalLink,
  ChevronRight,
  BarChart3,
  FileText,
  Search,
  Filter,
  Users,
  Lock,
  Globe,
  FolderOpen,
  TrendingUp,
  Shield,
} from 'lucide-react';

export default function Dashboards() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showMenu, setShowMenu] = useState(null);

  // Fetch dashboards
  const { data: dashboardsData, isLoading, refetch } = useQuery({
    queryKey: ['dashboards', activeTab],
    queryFn: () => reportsApi.getDashboards({ includeWidgets: false }),
  });

  const dashboards = dashboardsData?.data || [];

  // Filter dashboards based on tab and search
  const filteredDashboards = dashboards.filter(dashboard => {
    const matchesSearch = !searchQuery ||
      dashboard.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      dashboard.description?.toLowerCase().includes(searchQuery.toLowerCase());

    if (activeTab === 'favorites') {
      return matchesSearch && dashboard.isFavorite;
    }
    if (activeTab === 'shared') {
      return matchesSearch && (dashboard.isPublic || dashboard.sharedWithRoles?.length > 0);
    }
    return matchesSearch;
  });

  // Placeholder dashboards for demo
  const placeholderDashboards = [
    {
      id: 'default',
      name: 'Sales Overview',
      description: 'Track pipeline, revenue, and team performance',
      widgetCount: 8,
      isDefault: true,
      isPublic: true,
      updatedAt: new Date().toISOString(),
      createdBy: { name: 'System' },
    },
    {
      id: 'executive',
      name: 'Executive Summary',
      description: 'High-level KPIs and business metrics',
      widgetCount: 6,
      isDefault: false,
      isPublic: true,
      updatedAt: new Date(Date.now() - 86400000).toISOString(),
      createdBy: { name: 'Admin' },
    },
    {
      id: 'ops',
      name: 'Operations Dashboard',
      description: 'Jobs in progress, scheduling, and resource allocation',
      widgetCount: 10,
      isDefault: false,
      isPublic: false,
      updatedAt: new Date(Date.now() - 172800000).toISOString(),
      createdBy: { name: 'Operations Manager' },
    },
    {
      id: 'marketing',
      name: 'Marketing Performance',
      description: 'Lead sources, campaign effectiveness, and ROI',
      widgetCount: 5,
      isDefault: false,
      isPublic: false,
      updatedAt: new Date(Date.now() - 259200000).toISOString(),
      createdBy: { name: 'Marketing Team' },
    },
  ];

  const displayDashboards = dashboards.length > 0 ? filteredDashboards : placeholderDashboards;

  const handleDelete = async (dashboardId) => {
    if (window.confirm('Are you sure you want to delete this dashboard?')) {
      try {
        await reportsApi.deleteDashboard(dashboardId);
        refetch();
      } catch (error) {
        console.error('Failed to delete dashboard:', error);
      }
    }
    setShowMenu(null);
  };

  const handleDuplicate = async (dashboard) => {
    try {
      await reportsApi.createDashboard({
        ...dashboard,
        name: `${dashboard.name} (Copy)`,
        isDefault: false,
      });
      refetch();
    } catch (error) {
      console.error('Failed to duplicate dashboard:', error);
    }
    setShowMenu(null);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboards</h1>
          <p className="text-gray-500">Create and manage custom dashboards</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboards/builder')}
            className="flex items-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90 transition-opacity shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Create Dashboard</span>
          </button>
        </div>
      </div>

      {/* Executive Dashboards Banner */}
      <Link
        to="/dashboards/executive"
        className="block bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 hover:border-amber-300 hover:shadow-md transition-all group"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
              <FolderOpen className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 group-hover:text-amber-700 transition-colors">
                Executive Dashboards
              </h3>
              <p className="text-sm text-gray-500">
                Pre-built dashboards for Sales, Production, Insurance, Interiors, and CAT teams
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-amber-600 bg-amber-100 px-2 py-1 rounded-full">
              6 Dashboards
            </span>
            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" />
          </div>
        </div>
      </Link>

      {/* Claims Operations Dashboard Banner */}
      <Link
        to="/dashboards/claims-onboarding"
        className="block bg-gradient-to-r from-teal-50 to-cyan-50 border border-teal-200 rounded-xl p-4 hover:border-teal-300 hover:shadow-md transition-all group"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-lg">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 group-hover:text-teal-700 transition-colors">
                Claims Operations
              </h3>
              <p className="text-sm text-gray-500">
                PandaClaims onboarding workflow, photo review queue, and claims pipeline tracking
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-teal-600 bg-teal-100 px-2 py-1 rounded-full">
              3 Dashboards
            </span>
            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-teal-600 group-hover:translate-x-1 transition-all" />
          </div>
        </div>
      </Link>

      {/* Tab Navigation + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-xl w-fit">
          {[
            { id: 'all', label: 'All Dashboards', icon: LayoutGrid },
            { id: 'favorites', label: 'Favorites', icon: Star },
            { id: 'shared', label: 'Shared', icon: Users },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all ${
                  activeTab === tab.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm font-medium">{tab.label}</span>
              </button>
            );
          })}
          {/* Link back to Reports */}
          <Link
            to="/reports"
            className="flex items-center space-x-2 px-4 py-2 rounded-lg transition-all text-gray-600 hover:text-gray-900"
          >
            <BarChart3 className="w-4 h-4" />
            <span className="text-sm font-medium">Reports</span>
          </Link>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search dashboards..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none text-sm w-64"
          />
        </div>
      </div>

      {/* Dashboards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-2/3 mb-3"></div>
              <div className="h-4 bg-gray-100 rounded w-full mb-4"></div>
              <div className="h-4 bg-gray-100 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      ) : displayDashboards.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <LayoutGrid className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-900">No dashboards found</h3>
          <p className="text-sm text-gray-500 mt-2">
            {searchQuery
              ? 'Try a different search term'
              : 'Create your first dashboard to get started'}
          </p>
          <button
            onClick={() => navigate('/dashboards/builder')}
            className="mt-4 px-6 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90"
          >
            Create Dashboard
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayDashboards.map((dashboard) => (
            <div
              key={dashboard.id}
              className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-200 transition-all group"
            >
              {/* Card Header */}
              <div className="p-5 pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      dashboard.isDefault
                        ? 'bg-gradient-to-br from-amber-400 to-orange-500'
                        : 'bg-gradient-to-br from-panda-primary to-panda-secondary'
                    }`}>
                      <LayoutGrid className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{dashboard.name}</h3>
                        {dashboard.isDefault && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                            Default
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {dashboard.isPublic ? (
                          <span className="flex items-center text-xs text-gray-500">
                            <Globe className="w-3 h-3 mr-1" />
                            Public
                          </span>
                        ) : (
                          <span className="flex items-center text-xs text-gray-500">
                            <Lock className="w-3 h-3 mr-1" />
                            Private
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Menu */}
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(showMenu === dashboard.id ? null : dashboard.id);
                      }}
                      className="p-1.5 rounded-lg hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <MoreVertical className="w-4 h-4 text-gray-500" />
                    </button>

                    {showMenu === dashboard.id && (
                      <div className="absolute right-0 top-8 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                        <button
                          onClick={() => {
                            navigate(`/dashboards/builder/${dashboard.id}`);
                            setShowMenu(null);
                          }}
                          className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <Edit className="w-4 h-4 mr-3" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDuplicate(dashboard)}
                          className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <Copy className="w-4 h-4 mr-3" />
                          Duplicate
                        </button>
                        {!dashboard.isDefault && (
                          <button
                            onClick={() => handleDelete(dashboard.id)}
                            className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4 mr-3" />
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Description */}
                {dashboard.description && (
                  <p className="text-sm text-gray-500 mt-3 line-clamp-2">
                    {dashboard.description}
                  </p>
                )}
              </div>

              {/* Card Footer */}
              <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <LayoutGrid className="w-3.5 h-3.5" />
                    {dashboard.widgetCount || dashboard.widgets?.length || 0} widgets
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {formatDate(dashboard.updatedAt)}
                  </span>
                </div>

                <Link
                  to={`/dashboards/${dashboard.id}`}
                  className="flex items-center text-sm font-medium text-panda-primary hover:text-panda-secondary"
                >
                  View
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick Create Section */}
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Quick Start Templates</h3>
            <p className="text-sm text-gray-500 mt-1">
              Start with a pre-built dashboard template
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {[
              { name: 'Sales Overview', icon: BarChart3 },
              { name: 'Pipeline Tracker', icon: FileText },
              { name: 'Team Performance', icon: Users },
            ].map((template) => {
              const Icon = template.icon;
              return (
                <button
                  key={template.name}
                  onClick={() => navigate('/dashboards/builder', { state: { template: template.name } })}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:border-panda-primary hover:shadow-sm transition-all text-sm"
                >
                  <Icon className="w-4 h-4 text-panda-primary" />
                  {template.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
