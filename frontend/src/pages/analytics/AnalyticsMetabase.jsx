import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { metabaseApi } from '../../services/api';
import MetabaseWidget from '../../components/metabase/MetabaseWidget';
import { BarChart3, Settings } from 'lucide-react';

export default function AnalyticsMetabase() {
  const [selectedDashboard, setSelectedDashboard] = useState(null);
  const { data: metabaseStatus } = useQuery({
    queryKey: ['metabase-status'],
    queryFn: () => metabaseApi.getStatus(),
    retry: false,
  });
  const { data: metabaseDashboards } = useQuery({
    queryKey: ['metabase-dashboards'],
    queryFn: () => metabaseApi.getDashboards(),
    enabled: metabaseStatus?.data?.connected,
  });

  const dashboards = metabaseDashboards?.data || [];

  return (
    <div>
      {metabaseStatus?.data?.connected ? (
        <div className="space-y-6">
          <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800 flex items-center gap-3">
            <BarChart3 className="w-5 h-5 text-green-600 dark:text-green-400" />
            <span className="text-green-700 dark:text-green-300">Metabase is connected and ready to use</span>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Available Dashboards</h3>
            {dashboards.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {dashboards.map((dashboard) => (
                  <button
                    key={dashboard.id}
                    type="button"
                    className={`text-left bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-5 hover:shadow-md transition-all ${
                      selectedDashboard === dashboard.id
                        ? 'border-teal-500 ring-2 ring-teal-200 dark:ring-teal-800'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                    onClick={() => setSelectedDashboard(dashboard.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-teal-100 dark:bg-teal-900/30 rounded-lg">
                        <BarChart3 className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white">{dashboard.name || dashboard.title}</h4>
                        {dashboard.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                            {dashboard.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">No Metabase dashboards available.</p>
            )}
          </div>

          {selectedDashboard && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Embedded Dashboard</h3>
                <button
                  onClick={() => setSelectedDashboard(null)}
                  className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  Close
                </button>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <MetabaseWidget type="dashboard" id={selectedDashboard} height={700} mode="interactive" />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-xl">
          <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Metabase Not Connected</h3>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            Metabase integration is not configured or the service is unavailable.
          </p>
          <Link
            to="/admin/metabase"
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            <Settings className="w-4 h-4" />
            Configure Integration
          </Link>
        </div>
      )}
    </div>
  );
}
