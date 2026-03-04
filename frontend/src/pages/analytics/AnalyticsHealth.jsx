import { useQuery } from '@tanstack/react-query';
import { analyticsHealthApi } from '../../services/api';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function AnalyticsHealth() {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics-health-page'],
    queryFn: () => analyticsHealthApi.getHealth(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const healthData = data?.data || data;
  const requiredTables = healthData?.requiredTables || [];
  const missingTables = healthData?.missingTables || [];
  const ok = healthData?.ok !== false && missingTables.length === 0;

  if (isLoading) {
    return <div className="text-sm text-gray-500">Loading health checks...</div>;
  }

  return (
    <div className="space-y-6">
      <div className={`rounded-xl border px-4 py-3 ${ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
        <div className="flex items-center gap-3">
          {ok ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          <div>
            <p className="font-semibold">{ok ? 'Analytics health OK' : 'Analytics health issues detected'}</p>
            <p className="text-sm">{ok ? 'All required analytics tables are present.' : 'One or more required tables are missing.'}</p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Required Tables</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {requiredTables.map((table) => {
            const missing = missingTables.includes(table);
            return (
              <div key={table} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${missing ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
                <span>{table}</span>
                <span className="text-xs font-medium">{missing ? 'Missing' : 'OK'}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
