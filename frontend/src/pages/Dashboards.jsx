import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Copy,
  FolderOpen,
  Globe,
  LayoutGrid,
  Lock,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Shield,
  Star,
  Trash2,
  Users,
} from 'lucide-react';
import { reportsApi } from '../services/api';
import DataSourceBadge from '../components/analytics/DataSourceBadge';
import VerifiedBadge from '../components/analytics/VerifiedBadge';
import { deriveDataSource } from '../utils/analyticsSource';
import { formatReportTimestamp } from '../utils/reporting';
import { useAnalyticsBadgeContext } from '../components/analytics/AnalyticsBadgeContext';

const DASHBOARD_TABS = [
  { id: 'all', label: 'All Dashboards', icon: LayoutGrid },
  { id: 'favorites', label: 'Favorites', icon: Star },
  { id: 'shared', label: 'Shared', icon: Users },
];

function DashboardCard({ dashboard, verification, onEdit, onDuplicate, onDelete }) {
  const [showMenu, setShowMenu] = useState(false);
  const visibility = dashboard.visibility || (dashboard.isPublic ? 'PUBLIC' : 'PRIVATE');
  const visibilityLabel = dashboard.visibilityLabel || (visibility === 'TEAM' ? 'Team' : visibility === 'PUBLIC' ? 'Shared' : 'Private');
  const VisibilityIcon = visibility === 'PRIVATE' ? Lock : visibility === 'TEAM' ? Users : Globe;
  const hasManagementActions = Boolean(
    dashboard?.capabilities?.canEdit
    || dashboard?.capabilities?.canDuplicate
    || dashboard?.capabilities?.canDelete
  );

  return (
    <div className="group rounded-2xl border border-gray-200 bg-white shadow-sm transition-all hover:border-gray-300 hover:shadow-md">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${dashboard.isDefault ? 'bg-amber-500' : 'bg-panda-primary'}`}>
                <LayoutGrid className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-lg font-semibold text-gray-900">{dashboard.name}</h3>
                  {dashboard.isDefault && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      Default
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                  {visibility !== 'PRIVATE' ? (
                    <span className="inline-flex items-center gap-1">
                      <VisibilityIcon className="h-3 w-3" />
                      {visibilityLabel}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <VisibilityIcon className="h-3 w-3" />
                      {visibilityLabel}
                    </span>
                  )}
                  <span>{formatReportTimestamp(dashboard.updatedAt || dashboard.createdAt)}</span>
                </div>
              </div>
            </div>
            {dashboard.description && (
              <p className="mt-3 text-sm text-gray-500">{dashboard.description}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <DataSourceBadge source={deriveDataSource(dashboard)} />
              <VerifiedBadge status={verification.status} reason={verification.reason} />
            </div>
          </div>

          {hasManagementActions && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMenu((value) => !value)}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-full z-10 mt-2 min-w-44 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                  {dashboard?.capabilities?.canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        onEdit();
                        setShowMenu(false);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </button>
                  )}
                  {dashboard?.capabilities?.canDuplicate && (
                    <button
                      type="button"
                      onClick={() => {
                        onDuplicate();
                        setShowMenu(false);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <Copy className="h-4 w-4" />
                      Duplicate
                    </button>
                  )}
                  {dashboard?.capabilities?.canDelete && !dashboard.isDefault && (
                    <button
                      type="button"
                      onClick={() => {
                        onDelete();
                        setShowMenu(false);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-rose-700 hover:bg-rose-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
        <div className="text-sm text-gray-500">
          {dashboard.widgetCount || dashboard.widgets?.length || dashboard._count?.widgets || 0} widgets
        </div>
        <Link
          to={`/analytics/dashboards/${dashboard.id}`}
          className="text-sm font-medium text-panda-primary hover:text-panda-secondary"
        >
          Open Dashboard
        </Link>
      </div>
    </div>
  );
}

export default function Dashboards({ embedded = false }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const analyticsBadges = useAnalyticsBadgeContext();
  const verification = analyticsBadges?.verification || { status: 'unknown', reason: 'Verification unavailable.' };
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const requestedTab = searchParams.get('tab') || 'all';
  const activeTab = DASHBOARD_TABS.some((tab) => tab.id === requestedTab) ? requestedTab : 'all';

  const { data: dashboardsData, isLoading } = useQuery({
    queryKey: ['dashboards', 'library'],
    queryFn: () => reportsApi.getDashboards({ includeWidgets: false }),
  });

  const dashboards = Array.isArray(dashboardsData?.data) ? dashboardsData.data : dashboardsData?.data || [];
  const canManageDashboards = dashboardsData?.meta?.canWrite !== false;

  const filteredDashboards = useMemo(() => {
    return dashboards.filter((dashboard) => {
      const matchesSearch = !searchQuery
        || dashboard.name?.toLowerCase().includes(searchQuery.toLowerCase())
        || dashboard.description?.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;
      if (activeTab === 'favorites') return Boolean(dashboard.isFavorite);
      if (activeTab === 'shared') return Boolean(dashboard.isPublic || dashboard.sharedWithRoles?.length > 0);
      return true;
    });
  }, [activeTab, dashboards, searchQuery]);

  const handleDuplicate = async (dashboard) => {
    try {
      await reportsApi.createDashboard({
        ...dashboard,
        name: `${dashboard.name} (Copy)`,
        isDefault: false,
      });
      await queryClient.invalidateQueries({ queryKey: ['dashboards'] });
    } catch (error) {
      console.error('Failed to duplicate dashboard:', error);
    }
  };

  const handleDelete = async (dashboardId) => {
    if (!window.confirm('Are you sure you want to delete this dashboard?')) return;

    try {
      await reportsApi.deleteDashboard(dashboardId);
      await queryClient.invalidateQueries({ queryKey: ['dashboards'] });
    } catch (error) {
      console.error('Failed to delete dashboard:', error);
    }
  };

  return (
    <div className="space-y-6">
      {!embedded && (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboards</h1>
            <p className="text-gray-500">
              Dashboards organize saved reports and executive analytics in one place.
            </p>
          </div>
          {canManageDashboards && (
            <button
              type="button"
              onClick={() => navigate('/analytics/dashboards/new')}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              New Dashboard
            </button>
          )}
        </div>
      )}

      {!embedded && !isLoading && !canManageDashboards && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h3 className="text-lg font-semibold text-gray-900">Legacy dashboards are available here</h3>
          <p className="mt-2 text-sm text-gray-600">
            Production dashboard viewing remains live in this unified library. Edit and create actions stay hidden until the dashboards backend is unified with the report-backed builder.
          </p>
        </div>
      )}

      {!embedded && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Link
            to="/analytics/dashboards/executive"
            className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-5 transition-all hover:border-amber-300 hover:shadow-md"
          >
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-amber-500 p-3 text-white">
                <FolderOpen className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Executive Dashboards</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Pre-built dashboards for Sales, Production, Insurance, Interiors, and CAT teams.
                </p>
              </div>
            </div>
          </Link>
          <Link
            to="/analytics/dashboards/claims-onboarding"
            className="rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50 to-cyan-50 p-5 transition-all hover:border-teal-300 hover:shadow-md"
          >
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-teal-600 p-3 text-white">
                <Shield className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Claims Operations</h3>
                <p className="mt-1 text-sm text-gray-500">
                  PandaClaims onboarding workflow, review queues, and claims pipeline tracking.
                </p>
              </div>
            </div>
          </Link>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {DASHBOARD_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSearchParams(tab.id === 'all' ? {} : { tab: tab.id }, { replace: true })}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === tab.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search dashboards..."
              className="w-full rounded-xl border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 lg:w-72"
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-500">Loading dashboards...</div>
      ) : filteredDashboards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center">
          <LayoutGrid className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-semibold text-gray-900">No dashboards found</h3>
          <p className="mt-2 text-sm text-gray-500">
            {searchQuery ? 'Try a different search term.' : 'Create your first dashboard to start organizing reports.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filteredDashboards.map((dashboard) => (
            <DashboardCard
              key={dashboard.id}
              dashboard={dashboard}
              verification={verification}
              onEdit={() => navigate(`/analytics/dashboards/${dashboard.id}/edit`)}
              onDuplicate={() => handleDuplicate(dashboard)}
              onDelete={() => handleDelete(dashboard.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
