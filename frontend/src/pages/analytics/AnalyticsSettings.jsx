import { NavLink, Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Brain, Database, ExternalLink, Settings } from 'lucide-react';
import { metabaseApi } from '../../services/api';
import AnalyticsHealth from './AnalyticsHealth';
import AIInsightsFeed from '../AIInsightsFeed';

const settingsTabs = [
  { id: 'health', label: 'Data Health', icon: Database },
  { id: 'metabase', label: 'Metabase', icon: BarChart3 },
  { id: 'ai', label: 'AI Insights', icon: Brain },
];

function MetabaseSettingsPanel() {
  const { data: metabaseStatus } = useQuery({
    queryKey: ['metabase-status', 'settings'],
    queryFn: () => metabaseApi.getStatus(),
    retry: false,
  });

  const isConnected = Boolean(metabaseStatus?.data?.connected);

  const { data: metabaseDashboards } = useQuery({
    queryKey: ['metabase-dashboards', 'settings'],
    queryFn: () => metabaseApi.getDashboards(),
    enabled: isConnected,
  });

  const dashboards = Array.isArray(metabaseDashboards?.data) ? metabaseDashboards.data : [];

  return (
    <div className="space-y-6">
      <div className={`rounded-xl border p-5 ${isConnected ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
        <div className="flex items-start gap-3">
          <BarChart3 className={`mt-0.5 h-5 w-5 ${isConnected ? 'text-emerald-600' : 'text-amber-600'}`} />
          <div>
            <h3 className="font-semibold text-gray-900">
              {isConnected ? 'Metabase is connected' : 'Metabase needs configuration'}
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              {isConnected
                ? 'External dashboards are available from the Dashboards page under External Dashboards.'
                : 'Connect Metabase to surface external dashboards inside Analytics.'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="text-sm text-gray-500">Connection</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">
            {isConnected ? 'Connected' : 'Offline'}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="text-sm text-gray-500">External Dashboards</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{dashboards.length}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="text-sm text-gray-500">Destination</div>
          <div className="mt-2 text-sm font-medium text-gray-900">Dashboards → External Dashboards</div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-lg font-semibold text-gray-900">Metabase Actions</h3>
        <div className="mt-4 flex flex-wrap gap-3">
          <NavLink
            to="/analytics/dashboards?tab=external"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <ExternalLink className="h-4 w-4" />
            Open External Dashboards
          </NavLink>
          <NavLink
            to="/admin/metabase"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Settings className="h-4 w-4" />
            Configure Integration
          </NavLink>
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsSettings() {
  const { section = 'health' } = useParams();
  const activeSection = settingsTabs.some((tab) => tab.id === section) ? section : null;

  if (!activeSection) {
    return <Navigate to="/analytics/settings/health" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-gray-900">Analytics Settings</h1>
        <p className="text-sm text-gray-500">
          Manage analytics infrastructure, health, and AI tooling without cluttering primary reporting workflows.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl bg-gray-100 p-1">
        {settingsTabs.map((tab) => {
          const Icon = tab.icon;

          return (
            <NavLink
              key={tab.id}
              to={`/analytics/settings/${tab.id}`}
              className={({ isActive }) =>
                `inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </NavLink>
          );
        })}
      </div>

      {activeSection === 'health' && <AnalyticsHealth />}
      {activeSection === 'metabase' && <MetabaseSettingsPanel />}
      {activeSection === 'ai' && <AIInsightsFeed embedded />}
    </div>
  );
}
