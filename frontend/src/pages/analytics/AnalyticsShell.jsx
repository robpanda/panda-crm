import { NavLink, Outlet } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { analyticsHealthApi } from '../../services/api';
import { formatDateMDY } from '../../utils/formatters';
import { AnalyticsBadgeProvider } from '../../components/analytics/AnalyticsBadgeContext';
import {
  BarChart3,
  FileText,
  PieChart,
  Calendar,
  Brain,
  Activity,
  Settings,
  RefreshCw,
} from 'lucide-react';

const navItems = [
  { to: '/analytics/overview', label: 'Overview', icon: Activity },
  { to: '/analytics/reports', label: 'Reports', icon: FileText },
  { to: '/analytics/dashboards', label: 'Dashboards', icon: PieChart },
  { to: '/analytics/schedules', label: 'Schedules', icon: Calendar },
  { to: '/analytics/ai', label: 'AI Insights', icon: Brain },
  { to: '/analytics/health', label: 'Data Health', icon: BarChart3 },
  { to: '/analytics/metabase', label: 'Metabase', icon: BarChart3 },
];

export default function AnalyticsShell() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: analyticsHealth } = useQuery({
    queryKey: ['analytics-health'],
    queryFn: () => analyticsHealthApi.getHealth(),
    staleTime: 5 * 60 * 1000,
  });

  const healthData = analyticsHealth?.data || analyticsHealth || {};
  const checks = Array.isArray(healthData?.checks) ? healthData.checks : [];
  const tablesCheck = checks.find((check) => check.id === 'analytics_tables');
  const missingTables = tablesCheck?.details?.missingTables || healthData?.missingTables || [];
  const legacyStatus = healthData?.ok === false ? 'warning' : (healthData?.ok === true ? 'healthy' : 'unknown');
  const status = healthData?.status || legacyStatus || 'unknown';
  const summary = healthData?.summary || {};
  const lastRunAt = summary?.lastRunAt || healthData?.lastRunAt || null;
  const lastRunLabel = lastRunAt ? formatDateMDY(lastRunAt) : 'Unknown';

  const bannerConfig = {
    healthy: {
      border: 'border-emerald-200',
      bg: 'bg-emerald-50',
      text: 'text-emerald-900',
      icon: 'text-emerald-600',
      title: 'All systems healthy',
      message: 'Analytics checks passed.',
    },
    warning: {
      border: 'border-amber-200',
      bg: 'bg-amber-50',
      text: 'text-amber-900',
      icon: 'text-amber-600',
      title: 'Data issues detected',
      message: 'Some analytics checks need attention.',
    },
    critical: {
      border: 'border-red-200',
      bg: 'bg-red-50',
      text: 'text-red-900',
      icon: 'text-red-600',
      title: 'Reporting data may be incorrect',
      message: 'Critical analytics checks failed.',
    },
    unknown: {
      border: 'border-gray-200',
      bg: 'bg-gray-50',
      text: 'text-gray-700',
      icon: 'text-gray-500',
      title: 'Health status unavailable',
      message: 'Fix storage/config to enable data health checks.',
    },
  };

  const banner = bannerConfig[status] || bannerConfig.unknown;

  const isAdmin =
    user?.role?.roleType?.toLowerCase?.() === 'admin' ||
    user?.role?.roleType?.toLowerCase?.() === 'super_admin' ||
    user?.roleType?.toLowerCase?.() === 'admin' ||
    user?.roleType?.toLowerCase?.() === 'super_admin';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                <BarChart3 className="w-8 h-8 text-indigo-600" />
                Analytics Hub
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Unified reporting, dashboards, schedules, and AI insights
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => queryClient.invalidateQueries()}
                className="flex items-center gap-2 px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
              {isAdmin && (
                <NavLink
                  to="/admin/metabase"
                  className="flex items-center gap-2 px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </NavLink>
              )}
              <NavLink
                to="/analytics/reports/new"
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                New Report
              </NavLink>
              <NavLink
                to="/analytics/reports/advanced/new"
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Advanced Report
              </NavLink>
              <NavLink
                to="/analytics/dashboards/new"
                className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100"
              >
                New Dashboard
              </NavLink>
            </div>
          </div>

          <div className="flex items-center gap-1 mt-6 border-b border-gray-200 dark:border-gray-700 -mb-px overflow-x-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    isActive
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                  }`
                }
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className={`mb-6 rounded-xl border px-4 py-3 ${banner.border} ${banner.bg} ${banner.text}`}>
          <div className="flex items-start gap-3">
            <BarChart3 className={`mt-0.5 h-5 w-5 ${banner.icon}`} />
            <div className="flex-1">
              <p className="font-semibold">{banner.title}</p>
              <p className="text-sm">{banner.message}</p>
              {missingTables.length > 0 && (
                <p className="text-sm">
                  Missing tables: {missingTables.join(', ')}
                </p>
              )}
              <p className="text-xs text-gray-500 mt-1">Last checked: {lastRunLabel}</p>
            </div>
            {status !== 'healthy' && (
              <NavLink
                to="/analytics/health"
                className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
              >
                View details
              </NavLink>
            )}
          </div>
        </div>
        <AnalyticsBadgeProvider>
          <Outlet />
        </AnalyticsBadgeProvider>
      </div>
    </div>
  );
}
