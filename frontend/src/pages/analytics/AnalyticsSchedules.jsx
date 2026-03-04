import { useQuery } from '@tanstack/react-query';
import { insightSchedulesApi } from '../../services/api';
import { Calendar, Clock, Play } from 'lucide-react';

function ScheduleCard({ schedule }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-500" />
            <h3 className="font-medium text-gray-900 dark:text-white">
              {schedule.name || schedule.title || 'Untitled Schedule'}
            </h3>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {schedule.description || 'Scheduled report delivery'}
          </p>
          <div className="flex items-center gap-3 text-xs text-gray-400 mt-2">
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" /> {schedule.cronExpression || schedule.interval || 'On demand'}
            </span>
            {schedule.enabled === false && (
              <span className="text-amber-600">Paused</span>
            )}
          </div>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full ${schedule.enabled === false ? 'bg-gray-100 text-gray-500' : 'bg-emerald-100 text-emerald-700'}`}>
          {schedule.enabled === false ? 'Disabled' : 'Active'}
        </span>
      </div>
      {schedule.lastRunAt && (
        <div className="mt-3 text-xs text-gray-400">
          Last run: {new Date(schedule.lastRunAt).toLocaleString('en-US')}
        </div>
      )}
    </div>
  );
}

export default function AnalyticsSchedules() {
  const { data, isLoading } = useQuery({
    queryKey: ['insight-schedules'],
    queryFn: () => insightSchedulesApi.getSchedules(),
  });

  const schedules = Array.isArray(data) ? data : (data?.data || []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-gray-500 dark:text-gray-400">Manage your scheduled report deliveries</p>
        <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
          <Play className="w-4 h-4" />
          New Schedule
        </button>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-500">Loading schedules...</div>
      ) : schedules.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-xl">
          <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No Schedules Yet</h3>
          <p className="text-gray-500 dark:text-gray-400">Set up automated report delivery to receive insights in your inbox.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {schedules.map((schedule) => (
            <ScheduleCard key={schedule.id || schedule.signalCode} schedule={schedule} />
          ))}
        </div>
      )}
    </div>
  );
}
