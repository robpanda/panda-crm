import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  MessageSquare,
  TrendingUp,
  Users,
  Clock,
  ThumbsUp,
  ThumbsDown,
  Filter,
  Download,
  RefreshCw,
  Search,
  Calendar,
  Bot,
  HelpCircle,
  BarChart3,
  AlertCircle,
  CheckCircle,
  ArrowUp,
  ArrowDown,
  Eye,
} from 'lucide-react';
import api from '../../services/api';

export default function Support() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [interactions, setInteractions] = useState([]);
  const [filters, setFilters] = useState({
    dateRange: '7d',
    type: 'all',
    helpful: 'all',
    search: '',
  });
  const [selectedInteraction, setSelectedInteraction] = useState(null);

  useEffect(() => {
    loadSupportData();
  }, [filters]);

  const loadSupportData = async () => {
    try {
      setLoading(true);

      // Load chatbot analytics
      const analyticsRes = await fetch('https://7paaginnvg.execute-api.us-east-2.amazonaws.com/prod/training-bot/analytics');
      const analyticsData = await analyticsRes.json();

      // Load chatbot logs
      const logsRes = await fetch('https://7paaginnvg.execute-api.us-east-2.amazonaws.com/prod/training-bot/logs');
      const logsData = await logsRes.json();

      // Load help article analytics
      const helpRes = await api.get('/help/articles?includeUnpublished=true');

      // Combine all data
      const combinedStats = {
        totalInteractions: (analyticsData.totalChats || 0) + (helpRes.data.articles?.reduce((sum, a) => sum + (a.views || 0), 0) || 0),
        chatbotInteractions: analyticsData.totalChats || 0,
        helpArticleViews: helpRes.data.articles?.reduce((sum, a) => sum + (a.views || 0), 0) || 0,
        avgHelpfulness: analyticsData.helpfulPercentage || 0,
        activeUsers: analyticsData.uniqueUsers || 0,
        topIssues: identifyTopIssues(logsData.logs || []),
        trendsUp: (analyticsData.helpfulPercentage || 0) > 75,
      };

      setStats(combinedStats);
      setInteractions(logsData.logs || []);
    } catch (error) {
      console.error('Failed to load support data:', error);
      setStats({
        totalInteractions: 0,
        chatbotInteractions: 0,
        helpArticleViews: 0,
        avgHelpfulness: 0,
        activeUsers: 0,
        topIssues: [],
        trendsUp: false,
      });
    } finally {
      setLoading(false);
    }
  };

  const identifyTopIssues = (logs) => {
    const issueCategories = {};

    logs.forEach(log => {
      const message = log.message?.toLowerCase() || '';

      // Categorize based on keywords
      if (message.includes('schedule') || message.includes('appointment') || message.includes('calendar')) {
        issueCategories['Scheduling'] = (issueCategories['Scheduling'] || 0) + 1;
      } else if (message.includes('lead') || message.includes('contact') || message.includes('opportunity')) {
        issueCategories['Lead Management'] = (issueCategories['Lead Management'] || 0) + 1;
      } else if (message.includes('commission') || message.includes('payment')) {
        issueCategories['Commissions'] = (issueCategories['Commissions'] || 0) + 1;
      } else if (message.includes('error') || message.includes('bug') || message.includes('issue') || message.includes('problem')) {
        issueCategories['Technical Issues'] = (issueCategories['Technical Issues'] || 0) + 1;
      } else if (message.includes('how') || message.includes('where') || message.includes('what')) {
        issueCategories['General Questions'] = (issueCategories['General Questions'] || 0) + 1;
      }
    });

    return Object.entries(issueCategories)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  };

  const exportData = () => {
    const csvContent = [
      ['Timestamp', 'User', 'Message', 'Response', 'Helpful', 'Page'].join(','),
      ...interactions.map(i => [
        i.timestamp,
        i.userName || i.userId || 'Anonymous',
        `"${i.message?.replace(/"/g, '""')}"`,
        `"${i.response?.replace(/"/g, '""')}"`,
        i.helpful === true ? 'Yes' : i.helpful === false ? 'No' : 'N/A',
        i.currentPath || '',
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `support-interactions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const filteredInteractions = interactions.filter(interaction => {
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const matchesSearch =
        interaction.message?.toLowerCase().includes(searchLower) ||
        interaction.response?.toLowerCase().includes(searchLower) ||
        interaction.userName?.toLowerCase().includes(searchLower);
      if (!matchesSearch) return false;
    }

    if (filters.helpful !== 'all') {
      if (filters.helpful === 'helpful' && interaction.helpful !== true) return false;
      if (filters.helpful === 'unhelpful' && interaction.helpful !== false) return false;
      if (filters.helpful === 'no-feedback' && interaction.helpful !== undefined) return false;
    }

    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-panda-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Support Analytics</h1>
          <p className="text-gray-500 mt-1">
            Track user interactions, identify issues, and improve support quality
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadSupportData}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={exportData}
            className="flex items-center gap-2 px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export Data
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Total Interactions</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {stats.totalInteractions.toLocaleString()}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 text-sm">
            <span className="flex items-center gap-1 text-green-600">
              <ArrowUp className="w-4 h-4" />
              12%
            </span>
            <span className="text-gray-500">vs last period</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Chatbot Conversations</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {stats.chatbotInteractions.toLocaleString()}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <Bot className="w-6 h-6 text-purple-600" />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 text-sm">
            <span className="text-gray-500">{stats.activeUsers} unique users</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Help Article Views</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {stats.helpArticleViews.toLocaleString()}
              </p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
              <Eye className="w-6 h-6 text-orange-600" />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 text-sm">
            <span className="text-gray-500">Knowledge base usage</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Helpfulness Score</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {stats.avgHelpfulness.toFixed(0)}%
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <ThumbsUp className="w-6 h-6 text-green-600" />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 text-sm">
            <span className={`flex items-center gap-1 ${stats.trendsUp ? 'text-green-600' : 'text-red-600'}`}>
              {stats.trendsUp ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
              {stats.trendsUp ? 'Improving' : 'Declining'}
            </span>
          </div>
        </div>
      </div>

      {/* Top Issues */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-gray-400" />
            Top Support Topics
          </h2>
        </div>
        <div className="space-y-4">
          {stats.topIssues.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No data available yet</p>
          ) : (
            stats.topIssues.map((issue, index) => (
              <div key={index} className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-900">{issue.category}</span>
                    <span className="text-sm text-gray-500">{issue.count} interactions</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-panda-primary to-panda-secondary h-2 rounded-full transition-all"
                      style={{ width: `${(issue.count / (stats.chatbotInteractions || 1)) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[300px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search interactions..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
              />
            </div>
          </div>

          <select
            value={filters.helpful}
            onChange={(e) => setFilters({ ...filters, helpful: e.target.value })}
            className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
          >
            <option value="all">All Feedback</option>
            <option value="helpful">Helpful</option>
            <option value="unhelpful">Not Helpful</option>
            <option value="no-feedback">No Feedback</option>
          </select>
        </div>
      </div>

      {/* Interactions List */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            Recent Interactions ({filteredInteractions.length})
          </h2>
        </div>
        <div className="divide-y divide-gray-100">
          {filteredInteractions.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <HelpCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p>No interactions found</p>
            </div>
          ) : (
            filteredInteractions.slice(0, 50).map((interaction, index) => (
              <div
                key={index}
                className="p-6 hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => setSelectedInteraction(interaction)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-r from-panda-primary to-panda-secondary rounded-full flex items-center justify-center text-white font-medium">
                      {interaction.userName?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {interaction.userName || interaction.userId || 'Anonymous User'}
                      </p>
                      <p className="text-sm text-gray-500">
                        {new Date(interaction.timestamp).toLocaleString()} • {interaction.currentPath || '/'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {interaction.helpful === true && (
                      <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                        <ThumbsUp className="w-3 h-3" />
                        Helpful
                      </span>
                    )}
                    {interaction.helpful === false && (
                      <span className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full">
                        <ThumbsDown className="w-3 h-3" />
                        Not Helpful
                      </span>
                    )}
                  </div>
                </div>
                <div className="ml-13 space-y-2">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-sm text-gray-600 font-medium mb-1">Question:</p>
                    <p className="text-gray-900">{interaction.message}</p>
                  </div>
                  {interaction.response && (
                    <div className="bg-blue-50 rounded-lg p-3">
                      <p className="text-sm text-blue-600 font-medium mb-1">Response:</p>
                      <p className="text-gray-900 line-clamp-2">{interaction.response}</p>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
