import { useState, useEffect } from 'react';
import {
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Users,
  TrendingUp,
  BarChart3,
  Clock,
  Search,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Filter
} from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';

const TRAINING_BOT_API = 'https://7paaginnvg.execute-api.us-east-2.amazonaws.com/prod/training-bot';

export default function TrainingBotAnalytics() {
  const [analytics, setAnalytics] = useState(null);
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [expandedLog, setExpandedLog] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [feedbackFilter, setFeedbackFilter] = useState('all'); // all, helpful, unhelpful, none

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [analyticsRes, logsRes] = await Promise.all([
        fetch(`${TRAINING_BOT_API}/analytics`),
        fetch(`${TRAINING_BOT_API}/logs?limit=100`)
      ]);

      if (analyticsRes.ok) {
        const data = await analyticsRes.json();
        setAnalytics(data);
      }

      if (logsRes.ok) {
        const data = await logsRes.json();
        setLogs(data.logs || []);
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    }
    setIsLoading(false);
  };

  const filteredLogs = logs.filter(log => {
    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const matchesSearch =
        (log.message || '').toLowerCase().includes(search) ||
        (log.response || '').toLowerCase().includes(search) ||
        (log.userName || '').toLowerCase().includes(search);
      if (!matchesSearch) return false;
    }

    // Feedback filter
    if (feedbackFilter === 'helpful' && (!log.feedback || !log.feedback.helpful)) return false;
    if (feedbackFilter === 'unhelpful' && (!log.feedback || log.feedback.helpful !== false)) return false;
    if (feedbackFilter === 'none' && log.feedback) return false;

    return true;
  });

  const StatCard = ({ icon: Icon, label, value, subValue, color = 'blue' }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl bg-${color}-100 flex items-center justify-center`}>
          <Icon className={`w-6 h-6 text-${color}-600`} />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-sm text-gray-500">{label}</p>
          {subValue && <p className="text-xs text-gray-400 mt-1">{subValue}</p>}
        </div>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 animate-spin text-panda-primary" />
      </div>
    );
  }

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Training Bot Analytics</h1>
          <p className="text-gray-500 mt-1">Monitor help bot usage and improve responses</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {['overview', 'logs'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'text-panda-primary border-b-2 border-panda-primary'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && analytics && (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={MessageSquare}
              label="Total Conversations"
              value={analytics.summary.totalChats}
              color="blue"
            />
            <StatCard
              icon={Users}
              label="Unique Users"
              value={analytics.summary.uniqueUsers}
              color="purple"
            />
            <StatCard
              icon={ThumbsUp}
              label="Helpful Responses"
              value={analytics.summary.helpfulCount}
              subValue={`${analytics.summary.helpfulPercentage}% satisfaction`}
              color="green"
            />
            <StatCard
              icon={ThumbsDown}
              label="Needs Improvement"
              value={analytics.summary.unhelpfulCount}
              color="red"
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Usage by Day */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-panda-primary" />
                Usage (Last 7 Days)
              </h3>
              <div className="space-y-3">
                {analytics.chatsByDay.map(({ date, count }) => {
                  const maxCount = Math.max(...analytics.chatsByDay.map(d => d.count), 1);
                  const percentage = (count / maxCount) * 100;
                  return (
                    <div key={date} className="flex items-center gap-3">
                      <span className="text-sm text-gray-500 w-24">
                        {new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </span>
                      <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-panda-primary to-panda-secondary rounded-full transition-all duration-500"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-700 w-8 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Questions by Page */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-panda-primary" />
                Questions by Page
              </h3>
              <div className="space-y-3">
                {analytics.chatsByPage.slice(0, 7).map(({ page, count }) => {
                  const maxCount = Math.max(...analytics.chatsByPage.map(p => p.count), 1);
                  const percentage = (count / maxCount) * 100;
                  return (
                    <div key={page} className="flex items-center gap-3">
                      <span className="text-sm text-gray-600 w-32 truncate" title={page}>
                        {page === '/' ? 'Dashboard' : page.replace('/', '')}
                      </span>
                      <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <span className="text-sm text-gray-700 w-8 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Top Question Types */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Search className="w-5 h-5 text-panda-primary" />
              Common Question Types
            </h3>
            <div className="flex flex-wrap gap-3">
              {analytics.topQuestionTypes.map(({ type, count }) => (
                <div
                  key={type}
                  className="px-4 py-2 bg-gray-100 rounded-full flex items-center gap-2"
                >
                  <span className="text-sm font-medium text-gray-700">{type}</span>
                  <span className="text-xs bg-white px-2 py-0.5 rounded-full text-gray-500">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {activeTab === 'logs' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          {/* Filters */}
          <div className="p-4 border-b border-gray-200 flex flex-wrap gap-4 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search questions or responses..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={feedbackFilter}
                onChange={(e) => setFeedbackFilter(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
              >
                <option value="all">All Feedback</option>
                <option value="helpful">Helpful Only</option>
                <option value="unhelpful">Needs Improvement</option>
                <option value="none">No Feedback</option>
              </select>
            </div>
            <span className="text-sm text-gray-500">
              {filteredLogs.length} conversations
            </span>
          </div>

          {/* Log List */}
          <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
            {filteredLogs.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No conversations found matching your filters.
              </div>
            ) : (
              filteredLogs.map((log) => (
                <div
                  key={log.responseId}
                  className="p-4 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setExpandedLog(expandedLog === log.responseId ? null : log.responseId)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <MessageSquare className="w-4 h-4 text-gray-400" />
                        <span className="font-medium text-gray-900 truncate">{log.message}</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(log.timestamp).toLocaleString()}
                        </span>
                        {log.currentPath && (
                          <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">
                            {log.currentPath}
                          </span>
                        )}
                        {log.userName && (
                          <span className="text-xs">{log.userName}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {log.feedback ? (
                        log.feedback.helpful ? (
                          <span className="flex items-center gap-1 text-green-600 text-sm">
                            <ThumbsUp className="w-4 h-4" />
                            Helpful
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-red-600 text-sm">
                            <ThumbsDown className="w-4 h-4" />
                            Unhelpful
                          </span>
                        )
                      ) : (
                        <span className="text-gray-400 text-sm">No feedback</span>
                      )}
                      {expandedLog === log.responseId ? (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {/* Expanded View */}
                  {expandedLog === log.responseId && (
                    <div className="mt-4 pl-6 border-l-2 border-panda-primary/20">
                      <div className="text-sm text-gray-600 mb-3">
                        <strong>Bot Response:</strong>
                        <div className="mt-2 p-3 bg-gray-50 rounded-lg whitespace-pre-wrap text-gray-700">
                          {log.response}
                        </div>
                      </div>
                      {log.suggestions && log.suggestions.length > 0 && (
                        <div className="text-sm text-gray-600 mb-3">
                          <strong>Suggested Follow-ups:</strong>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {log.suggestions.map((s, i) => (
                              <span key={i} className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs">
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {log.feedback && log.feedback.feedback && (
                        <div className="text-sm text-gray-600">
                          <strong>User Feedback:</strong>
                          <div className="mt-2 p-3 bg-yellow-50 rounded-lg text-gray-700">
                            {log.feedback.feedback}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
      </div>
    </AdminLayout>
  );
}
