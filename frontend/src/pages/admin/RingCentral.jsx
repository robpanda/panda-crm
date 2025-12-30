import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Voicemail,
  Users,
  Clock,
  BarChart3,
  Brain,
  Mic,
  MessageSquare,
  TrendingUp,
  AlertTriangle,
  Check,
  X,
  RefreshCw,
  Settings,
  ChevronLeft,
  Play,
  Pause,
  Search,
  Filter,
  Download,
  ExternalLink,
  Zap,
  User,
  Calendar,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';
import { ringCentralApi } from '../../services/api';
import { useRingCentral } from '../../context/RingCentralContext';

// Tab options
const TABS = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'calls', label: 'Call Logs', icon: Phone },
  { id: 'ai', label: 'AI Analytics', icon: Brain },
  { id: 'queues', label: 'Call Queues', icon: Users },
  { id: 'voicemail', label: 'Voicemail', icon: Voicemail },
  { id: 'settings', label: 'Settings', icon: Settings },
];

// Call direction icons
const directionIcons = {
  Inbound: PhoneIncoming,
  Outbound: PhoneOutgoing,
  Missed: PhoneMissed,
};

// Status colors
const statusColors = {
  Available: 'bg-green-100 text-green-700',
  Busy: 'bg-red-100 text-red-700',
  DoNotDisturb: 'bg-red-100 text-red-700',
  Offline: 'bg-gray-100 text-gray-500',
  Away: 'bg-yellow-100 text-yellow-700',
};

// Sentiment colors
const sentimentColors = {
  positive: 'bg-green-100 text-green-700 border-green-200',
  neutral: 'bg-gray-100 text-gray-700 border-gray-200',
  negative: 'bg-red-100 text-red-700 border-red-200',
  mixed: 'bg-yellow-100 text-yellow-700 border-yellow-200',
};

export default function RingCentral() {
  const navigate = useNavigate();
  const ringCentral = useRingCentral();

  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);

  // Data states
  const [status, setStatus] = useState(null);
  const [stats, setStats] = useState(null);
  const [callLogs, setCallLogs] = useState([]);
  const [selectedCall, setSelectedCall] = useState(null);
  const [callQueues, setCallQueues] = useState([]);
  const [voicemails, setVoicemails] = useState([]);
  const [aiFeatures, setAiFeatures] = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState(null);

  // Filters
  const [dateRange, setDateRange] = useState('7d');
  const [directionFilter, setDirectionFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, statsRes, aiRes] = await Promise.all([
        ringCentralApi.getStatus().catch(() => ({ data: { connected: false } })),
        ringCentralApi.getCallStats({ dateRange }).catch(() => ({ data: {} })),
        ringCentralApi.getAiFeatures().catch(() => ({ data: null })),
      ]);

      setStatus(statusRes.data);
      setStats(statsRes.data);
      setAiFeatures(aiRes.data);
    } catch (err) {
      console.error('Failed to load RingCentral data:', err);
      setError('Failed to load RingCentral data');
    } finally {
      setLoading(false);
    }
  };

  // Load call logs when tab changes
  useEffect(() => {
    if (activeTab === 'calls') {
      loadCallLogs();
    } else if (activeTab === 'queues') {
      loadCallQueues();
    } else if (activeTab === 'voicemail') {
      loadVoicemails();
    }
  }, [activeTab, dateRange, directionFilter]);

  const loadCallLogs = async () => {
    try {
      const response = await ringCentralApi.getCallLogs({
        dateRange,
        direction: directionFilter !== 'all' ? directionFilter : undefined,
        limit: 50,
      });
      setCallLogs(response.data || []);
    } catch (err) {
      console.error('Failed to load call logs:', err);
    }
  };

  const loadCallQueues = async () => {
    try {
      const response = await ringCentralApi.getCallQueues();
      setCallQueues(response.data || []);
    } catch (err) {
      console.error('Failed to load call queues:', err);
    }
  };

  const loadVoicemails = async () => {
    try {
      const response = await ringCentralApi.getVoicemails();
      setVoicemails(response.data || []);
    } catch (err) {
      console.error('Failed to load voicemails:', err);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await ringCentralApi.syncCalls({ dateRange });
      await loadCallLogs();
    } catch (err) {
      console.error('Sync failed:', err);
      setError('Failed to sync calls');
    } finally {
      setSyncing(false);
    }
  };

  const handleAnalyzeCall = async (callId) => {
    try {
      const response = await ringCentralApi.analyzeCall(callId);
      setAiAnalysis(response.data);
      setSelectedCall(callLogs.find(c => c.id === callId));
    } catch (err) {
      console.error('Failed to analyze call:', err);
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  // Overview Tab Component
  const OverviewTab = () => (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <PhoneCall className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats?.totalCalls || 0}</p>
              <p className="text-sm text-gray-500">Total Calls</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-green-100">
              <PhoneIncoming className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats?.inboundCalls || 0}</p>
              <p className="text-sm text-gray-500">Inbound</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-purple-100">
              <PhoneOutgoing className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats?.outboundCalls || 0}</p>
              <p className="text-sm text-gray-500">Outbound</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-yellow-100">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{formatDuration(stats?.avgDuration)}</p>
              <p className="text-sm text-gray-500">Avg Duration</p>
            </div>
          </div>
        </div>
      </div>

      {/* AI Features Overview */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2 rounded-lg bg-purple-100">
            <Brain className="w-5 h-5 text-purple-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">AI Features</h3>
        </div>

        {aiFeatures ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Object.entries(aiFeatures).map(([key, feature]) => (
              <div
                key={key}
                className={`p-4 rounded-lg border ${
                  feature.enabled
                    ? 'bg-purple-50 border-purple-200'
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-900">{feature.name}</span>
                  {feature.enabled ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <X className="w-4 h-4 text-gray-400" />
                  )}
                </div>
                <p className="text-sm text-gray-500">{feature.description}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">Loading AI features...</p>
        )}
      </div>

      {/* Recent Calls */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Recent Calls</h3>
          <button
            onClick={() => setActiveTab('calls')}
            className="text-sm text-panda-primary hover:underline"
          >
            View All
          </button>
        </div>

        <div className="space-y-3">
          {callLogs.slice(0, 5).map((call) => {
            const DirIcon = directionIcons[call.direction] || Phone;
            return (
              <div
                key={call.id}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50"
              >
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-lg ${
                    call.direction === 'Inbound' ? 'bg-green-100' :
                    call.direction === 'Outbound' ? 'bg-blue-100' : 'bg-red-100'
                  }`}>
                    <DirIcon className={`w-4 h-4 ${
                      call.direction === 'Inbound' ? 'text-green-600' :
                      call.direction === 'Outbound' ? 'text-blue-600' : 'text-red-600'
                    }`} />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{call.phoneNumber || call.from || 'Unknown'}</p>
                    <p className="text-sm text-gray-500">{formatDate(call.startTime)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium text-gray-700">{formatDuration(call.duration)}</p>
                  {call.aiAnalyzed && (
                    <span className="inline-flex items-center text-xs text-purple-600">
                      <Brain className="w-3 h-3 mr-1" />
                      Analyzed
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // Call Logs Tab Component
  const CallLogsTab = () => (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search calls..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20"
          />
        </div>

        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20"
        >
          <option value="1d">Today</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="90d">Last 90 Days</option>
        </select>

        <select
          value={directionFilter}
          onChange={(e) => setDirectionFilter(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20"
        >
          <option value="all">All Directions</option>
          <option value="Inbound">Inbound</option>
          <option value="Outbound">Outbound</option>
        </select>

        <button
          onClick={handleSync}
          disabled={syncing}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
          Sync
        </button>
      </div>

      {/* Call List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Direction</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">AI</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {callLogs
              .filter(call =>
                !searchTerm ||
                call.phoneNumber?.includes(searchTerm) ||
                call.from?.includes(searchTerm) ||
                call.to?.includes(searchTerm)
              )
              .map((call) => {
                const DirIcon = directionIcons[call.direction] || Phone;
                return (
                  <tr key={call.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        call.direction === 'Inbound' ? 'bg-green-100 text-green-700' :
                        call.direction === 'Outbound' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
                      }`}>
                        <DirIcon className="w-3 h-3 mr-1" />
                        {call.direction}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{call.phoneNumber || call.from || 'Unknown'}</p>
                      {call.contactName && (
                        <p className="text-sm text-gray-500">{call.contactName}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatDate(call.startTime)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{formatDuration(call.duration)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{call.agentName || 'N/A'}</td>
                    <td className="px-4 py-3">
                      {call.aiAnalyzed ? (
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          sentimentColors[call.sentiment] || sentimentColors.neutral
                        }`}>
                          {call.sentiment || 'analyzed'}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-sm">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        {call.recordingUrl && (
                          <button className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded">
                            <Play className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleAnalyzeCall(call.id)}
                          className="p-1.5 text-purple-400 hover:text-purple-600 hover:bg-purple-50 rounded"
                          title="AI Analysis"
                        >
                          <Brain className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>

        {callLogs.length === 0 && (
          <div className="text-center py-12">
            <Phone className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No call logs found</p>
          </div>
        )}
      </div>
    </div>
  );

  // AI Analytics Tab Component
  const AIAnalyticsTab = () => (
    <div className="space-y-6">
      {/* AI Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-green-100">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats?.positiveCallsPercent || 0}%</p>
              <p className="text-sm text-gray-500">Positive Calls</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-purple-100">
              <Mic className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats?.transcribedCalls || 0}</p>
              <p className="text-sm text-gray-500">Transcribed</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <Brain className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats?.aiAnalyzedCalls || 0}</p>
              <p className="text-sm text-gray-500">AI Analyzed</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-yellow-100">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats?.coachingOpportunities || 0}</p>
              <p className="text-sm text-gray-500">Coaching Needed</p>
            </div>
          </div>
        </div>
      </div>

      {/* AI Features Description */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">AI Capabilities</h3>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <div className="p-2 rounded-lg bg-purple-100">
                <Mic className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h4 className="font-medium text-gray-900">Automatic Transcription</h4>
                <p className="text-sm text-gray-500">
                  AI-powered speech-to-text converts call recordings to searchable text.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="p-2 rounded-lg bg-green-100">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h4 className="font-medium text-gray-900">Sentiment Analysis</h4>
                <p className="text-sm text-gray-500">
                  Detect customer emotions and satisfaction levels from call content.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <MessageSquare className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h4 className="font-medium text-gray-900">Key Topics Extraction</h4>
                <p className="text-sm text-gray-500">
                  Automatically identify main discussion points and action items.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <div className="p-2 rounded-lg bg-yellow-100">
                <Brain className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <h4 className="font-medium text-gray-900">Coaching Insights</h4>
                <p className="text-sm text-gray-500">
                  Get AI recommendations for improving sales techniques and customer service.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="p-2 rounded-lg bg-red-100">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h4 className="font-medium text-gray-900">Compliance Monitoring</h4>
                <p className="text-sm text-gray-500">
                  Automatically check calls against required scripts and disclosures.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="p-2 rounded-lg bg-indigo-100">
                <BarChart3 className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h4 className="font-medium text-gray-900">Call Summarization</h4>
                <p className="text-sm text-gray-500">
                  Generate concise summaries of call content and outcomes.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Selected Call Analysis */}
      {selectedCall && aiAnalysis && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Call Analysis</h3>
            <button
              onClick={() => {
                setSelectedCall(null);
                setAiAnalysis(null);
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-2">Call Details</h4>
              <div className="space-y-2">
                <p><span className="text-gray-500">From:</span> {selectedCall.from}</p>
                <p><span className="text-gray-500">To:</span> {selectedCall.to}</p>
                <p><span className="text-gray-500">Duration:</span> {formatDuration(selectedCall.duration)}</p>
                <p><span className="text-gray-500">Time:</span> {formatDate(selectedCall.startTime)}</p>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-2">AI Analysis</h4>
              <div className="space-y-3">
                <div className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium ${
                  sentimentColors[aiAnalysis.sentiment] || sentimentColors.neutral
                }`}>
                  Sentiment: {aiAnalysis.sentiment}
                </div>

                {aiAnalysis.summary && (
                  <div>
                    <p className="text-sm font-medium text-gray-700">Summary</p>
                    <p className="text-sm text-gray-600">{aiAnalysis.summary}</p>
                  </div>
                )}

                {aiAnalysis.keyPoints?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-gray-700">Key Points</p>
                    <ul className="list-disc list-inside text-sm text-gray-600">
                      {aiAnalysis.keyPoints.map((point, i) => (
                        <li key={i}>{point}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {aiAnalysis.nextActions?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-gray-700">Recommended Actions</p>
                    <ul className="list-disc list-inside text-sm text-gray-600">
                      {aiAnalysis.nextActions.map((action, i) => (
                        <li key={i}>{action}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Call Queues Tab Component
  const CallQueuesTab = () => (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {callQueues.map((queue) => (
          <div
            key={queue.id}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-4"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">{queue.name}</h3>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                queue.membersAvailable > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {queue.membersAvailable > 0 ? 'Active' : 'No Agents'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Waiting</p>
                <p className="text-xl font-bold text-gray-900">{queue.callsWaiting || 0}</p>
              </div>
              <div>
                <p className="text-gray-500">Agents</p>
                <p className="text-xl font-bold text-gray-900">{queue.membersAvailable || 0}/{queue.totalMembers || 0}</p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-500">Avg Wait Time</p>
              <p className="font-medium text-gray-900">{formatDuration(queue.avgWaitTime)}</p>
            </div>
          </div>
        ))}
      </div>

      {callQueues.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No call queues configured</p>
        </div>
      )}
    </div>
  );

  // Voicemail Tab Component
  const VoicemailTab = () => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="divide-y divide-gray-100">
        {voicemails.map((vm) => (
          <div
            key={vm.id}
            className="p-4 hover:bg-gray-50 flex items-center justify-between"
          >
            <div className="flex items-center space-x-4">
              <div className="p-2 rounded-lg bg-purple-100">
                <Voicemail className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">{vm.from || 'Unknown'}</p>
                <p className="text-sm text-gray-500">{formatDate(vm.createdAt)}</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">{formatDuration(vm.duration)}</span>
              <div className="flex space-x-2">
                <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                  <Play className="w-4 h-4" />
                </button>
                <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {voicemails.length === 0 && (
        <div className="p-12 text-center">
          <Voicemail className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No voicemails</p>
        </div>
      )}
    </div>
  );

  // Settings Tab Component
  const SettingsTab = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Connection Status</h3>

        <div className="flex items-center space-x-4 mb-6">
          <div className={`w-3 h-3 rounded-full ${
            status?.connected ? 'bg-green-500' : 'bg-red-500'
          }`} />
          <span className="font-medium text-gray-900">
            {status?.connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        {status?.connected ? (
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Account</span>
              <span className="text-gray-900">{status.accountName || 'N/A'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Extension</span>
              <span className="text-gray-900">{status.extensionName || 'N/A'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Last Sync</span>
              <span className="text-gray-900">{formatDate(status.lastSync)}</span>
            </div>
          </div>
        ) : (
          <button
            onClick={() => {
              ringCentralApi.getAuthUrl().then(res => {
                if (res.data?.url) {
                  window.location.href = res.data.url;
                }
              });
            }}
            className="w-full px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg font-medium hover:opacity-90"
          >
            <Zap className="w-4 h-4 inline mr-2" />
            Connect RingCentral
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Sync Settings</h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Auto Sync Calls</p>
              <p className="text-sm text-gray-500">Automatically sync call logs every 15 minutes</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" defaultChecked className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-panda-primary/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-panda-primary"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">AI Analysis</p>
              <p className="text-sm text-gray-500">Automatically analyze calls with AI</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" defaultChecked className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-panda-primary/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-panda-primary"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Call Recording Transcription</p>
              <p className="text-sm text-gray-500">Transcribe call recordings automatically</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" defaultChecked className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-panda-primary/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-panda-primary"></div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );

  // Render active tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewTab />;
      case 'calls':
        return <CallLogsTab />;
      case 'ai':
        return <AIAnalyticsTab />;
      case 'queues':
        return <CallQueuesTab />;
      case 'voicemail':
        return <VoicemailTab />;
      case 'settings':
        return <SettingsTab />;
      default:
        return <OverviewTab />;
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/admin/integrations')}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex items-center space-x-3">
            <div className="p-3 rounded-xl bg-orange-100">
              <PhoneCall className="w-8 h-8 text-orange-600" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">RingCentral</h1>
              <p className="text-sm text-gray-500">Phone system and AI call analytics</p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium ${
            status?.connected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            <span className={`w-2 h-2 rounded-full mr-2 ${
              status?.connected ? 'bg-green-500' : 'bg-red-500'
            }`} />
            {status?.connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-1 overflow-x-auto pb-px">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-panda-primary text-panda-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4 mr-2" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-red-700">{error}</p>
            <button
              onClick={loadData}
              className="text-sm text-red-600 hover:underline mt-1"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* Tab Content */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-2 border-panda-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        renderTabContent()
      )}
    </div>
  );
}
