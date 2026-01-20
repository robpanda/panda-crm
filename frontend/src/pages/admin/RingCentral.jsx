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
  AlertCircle,
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
  Headphones,
  Radio,
  Megaphone,
  ListChecks,
  UserCog,
  PhoneForwarded,
  PhoneOff,
  Volume2,
  VolumeX,
  Ear,
  Upload,
  Trash2,
  Edit,
  Plus,
  Eye,
  MoreVertical,
  Link2,
} from 'lucide-react';
import { ringCentralApi } from '../../services/api';
import { useRingCentral } from '../../context/RingCentralContext';
import AdminLayout from '../../components/AdminLayout';

// Tab options - RingCX Contact Center focused
const TABS = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'calls', label: 'Call Logs', icon: Phone },
  { id: 'ai', label: 'AI Analytics', icon: Brain },
  { id: 'voicemail', label: 'Voicemail', icon: Voicemail },
  // RingCX Contact Center tabs
  { id: 'agents', label: 'Agents', icon: Headphones, ringcx: true },
  { id: 'inbound', label: 'Inbound Queues', icon: PhoneIncoming, ringcx: true },
  { id: 'campaigns', label: 'Campaigns', icon: Megaphone, ringcx: true },
  { id: 'active', label: 'Active Calls', icon: Radio, ringcx: true },
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

// RingCX Agent status colors
const agentStatusColors = {
  AVAILABLE: 'bg-green-100 text-green-700',
  ON_CALL: 'bg-blue-100 text-blue-700',
  BREAK: 'bg-yellow-100 text-yellow-700',
  LUNCH: 'bg-orange-100 text-orange-700',
  TRAINING: 'bg-purple-100 text-purple-700',
  MEETING: 'bg-indigo-100 text-indigo-700',
  AFTER_CALL_WORK: 'bg-cyan-100 text-cyan-700',
  OFFLINE: 'bg-gray-100 text-gray-500',
  LOGGED_OUT: 'bg-gray-100 text-gray-400',
};

// Campaign/Dial Group status colors
const campaignStatusColors = {
  ACTIVE: 'bg-green-100 text-green-700',
  PAUSED: 'bg-yellow-100 text-yellow-700',
  INACTIVE: 'bg-gray-100 text-gray-500',
  COMPLETED: 'bg-blue-100 text-blue-700',
};

export default function RingCentral() {
  const navigate = useNavigate();
  const ringCentral = useRingCentral();

  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  // Data states
  const [status, setStatus] = useState(null);
  const [stats, setStats] = useState(null);
  const [callLogs, setCallLogs] = useState([]);
  const [selectedCall, setSelectedCall] = useState(null);
  const [voicemails, setVoicemails] = useState([]);
  const [aiFeatures, setAiFeatures] = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState(null);

  // RingCX Contact Center states
  const [ringCxStatus, setRingCxStatus] = useState(null);
  const [agentGroups, setAgentGroups] = useState([]);
  const [selectedAgentGroup, setSelectedAgentGroup] = useState(null);
  const [agents, setAgents] = useState([]);
  const [gateGroups, setGateGroups] = useState([]);
  const [selectedGateGroup, setSelectedGateGroup] = useState(null);
  const [gates, setGates] = useState([]);
  const [dialGroups, setDialGroups] = useState([]);
  const [selectedDialGroup, setSelectedDialGroup] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [campaignLeads, setCampaignLeads] = useState([]);
  const [activeCalls, setActiveCalls] = useState([]);
  const [refreshingActiveCalls, setRefreshingActiveCalls] = useState(false);
  const [activeCallsRefresh, setActiveCallsRefresh] = useState(true);

  // Create Campaign Modal state
  const [showCreateCampaignModal, setShowCreateCampaignModal] = useState(false);
  const [createCampaignLoading, setCreateCampaignLoading] = useState(false);
  const [createCampaignError, setCreateCampaignError] = useState(null);
  const [newCampaign, setNewCampaign] = useState({
    campaignName: '',
    campaignDesc: '',
    isActive: true,
    maxRingTime: 25,
    maxAttempts: 3,
    minRetryTime: 60,
    scrubDisconnects: true,
  });

  // Edit Campaign Modal state
  const [showEditCampaignModal, setShowEditCampaignModal] = useState(false);
  const [editCampaignLoading, setEditCampaignLoading] = useState(false);
  const [editCampaignError, setEditCampaignError] = useState(null);
  const [editingCampaign, setEditingCampaign] = useState(null);

  // Upload Leads Modal state
  const [showUploadLeadsModal, setShowUploadLeadsModal] = useState(false);
  const [uploadLeadsLoading, setUploadLeadsLoading] = useState(false);
  const [uploadLeadsError, setUploadLeadsError] = useState(null);
  const [uploadCampaignId, setUploadCampaignId] = useState(null);
  const [callListsForUpload, setCallListsForUpload] = useState([]);
  const [selectedCallListId, setSelectedCallListId] = useState('');

  // Campaign Control state
  const [campaignControlLoading, setCampaignControlLoading] = useState({});

  // Filters
  const [dateRange, setDateRange] = useState('7d');
  const [directionFilter, setDirectionFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [agentSearchTerm, setAgentSearchTerm] = useState('');
  const [leadSearchTerm, setLeadSearchTerm] = useState('');

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

  // Load data when tab changes
  useEffect(() => {
    if (activeTab === 'calls') {
      loadCallLogs();
    } else if (activeTab === 'voicemail') {
      loadVoicemails();
    } else if (activeTab === 'agents') {
      loadRingCxStatus(); // Load RingCX status for the banner
      loadAgentGroups();
    } else if (activeTab === 'inbound') {
      loadRingCxStatus(); // Load RingCX status for the banner
      loadGateGroups();
    } else if (activeTab === 'campaigns') {
      loadRingCxStatus(); // Load RingCX status for the banner
      loadDialGroups();
    } else if (activeTab === 'active') {
      loadRingCxStatus(); // Load RingCX status for the banner
      loadActiveCalls();
    }
  }, [activeTab, dateRange, directionFilter]);

  const loadCallLogs = async () => {
    try {
      const response = await ringCentralApi.getCallLogs({
        dateRange,
        direction: directionFilter !== 'all' ? directionFilter : undefined,
        limit: 50,
      });
      // Ensure we get an array - response.data might be an object with calls property
      const logs = Array.isArray(response.data) ? response.data :
                   Array.isArray(response.data?.calls) ? response.data.calls :
                   Array.isArray(response.data?.records) ? response.data.records : [];
      setCallLogs(logs);
    } catch (err) {
      console.error('Failed to load call logs:', err);
    }
  };

  const loadVoicemails = async () => {
    try {
      const response = await ringCentralApi.getVoicemails();
      const vms = Array.isArray(response.data) ? response.data :
                  Array.isArray(response.data?.voicemails) ? response.data.voicemails :
                  Array.isArray(response.data?.records) ? response.data.records : [];
      setVoicemails(vms);
    } catch (err) {
      console.error('Failed to load voicemails:', err);
    }
  };

  // ============================================================================
  // RingCX Contact Center Data Loading Functions
  // ============================================================================

  const loadRingCxStatus = async () => {
    try {
      const response = await ringCentralApi.getRingCxStatus();
      setRingCxStatus(response.data || response);
    } catch (err) {
      console.error('Failed to load RingCX status:', err);
      // Set a minimal status object so UI knows we tried
      setRingCxStatus({ connected: false, error: err.message });
    }
  };

  const loadAgentGroups = async () => {
    try {
      const response = await ringCentralApi.getRingCxAgentGroups();
      const groups = Array.isArray(response.data) ? response.data :
                     Array.isArray(response.data?.agentGroups) ? response.data.agentGroups : [];
      setAgentGroups(groups);
      // Auto-select first group
      if (groups.length > 0 && !selectedAgentGroup) {
        setSelectedAgentGroup(groups[0]);
        loadAgents(groups[0].agentGroupId || groups[0].id);
      }
    } catch (err) {
      console.error('Failed to load agent groups:', err);
    }
  };

  const loadAgents = async (groupId) => {
    if (!groupId) return;
    try {
      const response = await ringCentralApi.getRingCxAgents(groupId);
      const agentList = Array.isArray(response.data) ? response.data :
                        Array.isArray(response.data?.agents) ? response.data.agents : [];
      setAgents(agentList);
    } catch (err) {
      console.error('Failed to load agents:', err);
    }
  };

  const handleAgentStatusChange = async (agentId, newStatus) => {
    try {
      await ringCentralApi.updateRingCxAgentStatus(agentId, newStatus);
      // Refresh agents list
      if (selectedAgentGroup) {
        loadAgents(selectedAgentGroup.agentGroupId || selectedAgentGroup.id);
      }
    } catch (err) {
      console.error('Failed to update agent status:', err);
      setError('Failed to update agent status');
    }
  };

  const loadGateGroups = async () => {
    try {
      const response = await ringCentralApi.getRingCxGateGroups();
      const groups = Array.isArray(response.data) ? response.data :
                     Array.isArray(response.data?.gateGroups) ? response.data.gateGroups : [];
      setGateGroups(groups);
      // Load gates from all groups
      const allGates = [];
      for (const group of groups) {
        try {
          const gatesRes = await ringCentralApi.getRingCxGates(group.gateGroupId || group.id);
          const gateList = Array.isArray(gatesRes.data) ? gatesRes.data :
                          Array.isArray(gatesRes.data?.gates) ? gatesRes.data.gates : [];
          allGates.push(...gateList.map(g => ({ ...g, groupName: group.groupName || group.name })));
        } catch (e) {
          console.error('Failed to load gates for group:', group.id, e);
        }
      }
      setGates(allGates);
    } catch (err) {
      console.error('Failed to load gate groups:', err);
    }
  };

  const loadDialGroups = async () => {
    try {
      const response = await ringCentralApi.getRingCxDialGroups();
      const groups = Array.isArray(response.data) ? response.data :
                     Array.isArray(response.data?.dialGroups) ? response.data.dialGroups : [];
      setDialGroups(groups);
      // Auto-select first group
      if (groups.length > 0 && !selectedDialGroup) {
        setSelectedDialGroup(groups[0]);
        loadCampaigns(groups[0].dialGroupId || groups[0].id);
      }
    } catch (err) {
      // RingCX may not be configured - this is expected if not using contact center features
      const status = err?.response?.status;
      if (status === 403 || status === 401) {
        console.debug('RingCX dial groups not available (auth/config issue):', status);
      } else {
        console.error('Failed to load dial groups:', err?.response?.data || err.message);
      }
      setDialGroups([]); // Ensure empty array on error
    }
  };

  const loadCampaigns = async (dialGroupId) => {
    if (!dialGroupId) return;
    try {
      const response = await ringCentralApi.getRingCxCampaigns(dialGroupId);
      const campaignList = Array.isArray(response.data) ? response.data :
                          Array.isArray(response.data?.campaigns) ? response.data.campaigns : [];
      setCampaigns(campaignList);
    } catch (err) {
      console.error('Failed to load campaigns:', err);
    }
  };

  const loadCampaignLeads = async (campaignId) => {
    if (!campaignId) return;
    try {
      const response = await ringCentralApi.getRingCxCampaignLeads(campaignId);
      const leads = Array.isArray(response.data) ? response.data :
                    Array.isArray(response.data?.leads) ? response.data.leads : [];
      setCampaignLeads(leads);
    } catch (err) {
      console.error('Failed to load campaign leads:', err);
    }
  };

  const loadActiveCalls = async () => {
    setRefreshingActiveCalls(true);
    try {
      const response = await ringCentralApi.getRingCxActiveCalls();
      const calls = Array.isArray(response.data) ? response.data :
                    Array.isArray(response.data?.calls) ? response.data.calls :
                    Array.isArray(response.data?.sessions) ? response.data.sessions : [];
      setActiveCalls(calls);
    } catch (err) {
      console.error('Failed to load active calls:', err);
    } finally {
      setRefreshingActiveCalls(false);
    }
  };

  // Auto-refresh active calls every 10 seconds when on that tab
  useEffect(() => {
    if (activeTab === 'active') {
      const interval = setInterval(loadActiveCalls, 10000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  // Supervisor call control functions
  const handleBargeCall = async (sessionId, mode = 'FULL') => {
    try {
      await ringCentralApi.bargeRingCxCall(sessionId, { bargeType: mode });
      loadActiveCalls();
    } catch (err) {
      console.error('Failed to barge call:', err);
      setError('Failed to barge into call');
    }
  };

  const handleCoachCall = async (sessionId) => {
    try {
      await ringCentralApi.coachRingCxCall(sessionId, {});
      loadActiveCalls();
    } catch (err) {
      console.error('Failed to coach call:', err);
      setError('Failed to start coaching');
    }
  };

  const handleMonitorCall = async (sessionId) => {
    try {
      await ringCentralApi.monitorRingCxCall(sessionId);
      loadActiveCalls();
    } catch (err) {
      console.error('Failed to monitor call:', err);
      setError('Failed to start monitoring');
    }
  };

  const handleTransferCall = async (sessionId, destination) => {
    try {
      await ringCentralApi.transferRingCxCall(sessionId, { destination });
      loadActiveCalls();
    } catch (err) {
      console.error('Failed to transfer call:', err);
      setError('Failed to transfer call');
    }
  };

  const handleHoldCall = async (sessionId, hold = true) => {
    try {
      await ringCentralApi.holdRingCxCall(sessionId, hold);
      loadActiveCalls();
    } catch (err) {
      console.error('Failed to hold/unhold call:', err);
      setError(`Failed to ${hold ? 'hold' : 'unhold'} call`);
    }
  };

  const handleHangupCall = async (sessionId) => {
    if (!confirm('Are you sure you want to end this call?')) return;
    try {
      await ringCentralApi.hangupRingCxCall(sessionId);
      loadActiveCalls();
    } catch (err) {
      console.error('Failed to hangup call:', err);
      setError('Failed to end call');
    }
  };

  const handleRecordCall = async (sessionId, record = true) => {
    try {
      await ringCentralApi.recordRingCxCall(sessionId, record);
      loadActiveCalls();
    } catch (err) {
      console.error('Failed to toggle recording:', err);
      setError(`Failed to ${record ? 'start' : 'stop'} recording`);
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

  // Create Campaign Handler
  const handleCreateCampaign = async () => {
    if (!selectedDialGroup) {
      setCreateCampaignError('Please select a dial group first');
      return;
    }
    if (!newCampaign.campaignName.trim()) {
      setCreateCampaignError('Campaign name is required');
      return;
    }

    setCreateCampaignLoading(true);
    setCreateCampaignError(null);

    try {
      const dialGroupId = selectedDialGroup.dialGroupId || selectedDialGroup;
      await ringCentralApi.createRingCxCampaign(dialGroupId, newCampaign);

      // Reset form and close modal
      setNewCampaign({
        campaignName: '',
        campaignDesc: '',
        isActive: true,
        maxRingTime: 25,
        maxAttempts: 3,
        minRetryTime: 60,
        scrubDisconnects: true,
      });
      setShowCreateCampaignModal(false);

      // Reload campaigns for this dial group
      loadCampaigns(dialGroupId);
    } catch (err) {
      console.error('Failed to create campaign:', err);
      setCreateCampaignError(err.response?.data?.message || err.message || 'Failed to create campaign');
    } finally {
      setCreateCampaignLoading(false);
    }
  };

  // Edit Campaign Handler
  const handleEditCampaign = async () => {
    if (!editingCampaign) return;

    setEditCampaignLoading(true);
    setEditCampaignError(null);

    try {
      const dialGroupId = selectedDialGroup?.dialGroupId || selectedDialGroup;
      await ringCentralApi.updateRingCxCampaign(dialGroupId, editingCampaign.campaignId, {
        campaignName: editingCampaign.campaignName,
        campaignDesc: editingCampaign.campaignDesc,
        isActive: editingCampaign.isActive,
        maxRingTime: editingCampaign.maxRingTime,
        maxAttempts: editingCampaign.maxAttempts,
        minRetryTime: editingCampaign.minRetryTime,
        scrubDisconnects: editingCampaign.scrubDisconnects,
      });

      setShowEditCampaignModal(false);
      setEditingCampaign(null);
      setActionSuccess('Campaign updated successfully');

      // Reload campaigns
      if (dialGroupId) {
        loadCampaigns(dialGroupId);
      }
    } catch (err) {
      console.error('Failed to update campaign:', err);
      setEditCampaignError(err.response?.data?.message || err.message || 'Failed to update campaign');
    } finally {
      setEditCampaignLoading(false);
    }
  };

  // Open Edit Campaign Modal
  const openEditCampaign = (campaign) => {
    setEditingCampaign({
      ...campaign,
      campaignName: campaign.campaignName || '',
      campaignDesc: campaign.campaignDesc || '',
      isActive: campaign.isActive ?? campaign.campaignState === 'ACTIVE',
      maxRingTime: campaign.maxRingTime || 25,
      maxAttempts: campaign.maxAttempts || 3,
      minRetryTime: campaign.minRetryTime || 60,
      scrubDisconnects: campaign.scrubDisconnects ?? true,
    });
    setEditCampaignError(null);
    setShowEditCampaignModal(true);
  };

  // Campaign Control Handlers (Start, Pause, Stop)
  const handleCampaignControl = async (campaign, action) => {
    const campaignId = campaign.campaignId;
    const dialGroupId = selectedDialGroup?.dialGroupId || selectedDialGroup;

    setCampaignControlLoading(prev => ({ ...prev, [campaignId]: action }));

    try {
      let result;
      switch (action) {
        case 'start':
          result = await ringCentralApi.startRingCxCampaign(dialGroupId, campaignId);
          setActionSuccess(`Campaign "${campaign.campaignName}" started`);
          break;
        case 'pause':
          result = await ringCentralApi.pauseRingCxCampaign(dialGroupId, campaignId);
          setActionSuccess(`Campaign "${campaign.campaignName}" paused`);
          break;
        case 'stop':
          result = await ringCentralApi.stopRingCxCampaign(dialGroupId, campaignId);
          setActionSuccess(`Campaign "${campaign.campaignName}" stopped`);
          break;
        default:
          return;
      }

      // Reload campaigns
      if (dialGroupId) {
        loadCampaigns(dialGroupId);
      }
    } catch (err) {
      console.error(`Failed to ${action} campaign:`, err);
      setActionSuccess(null);
      alert(`Failed to ${action} campaign: ${err.response?.data?.message || err.message}`);
    } finally {
      setCampaignControlLoading(prev => ({ ...prev, [campaignId]: null }));
    }
  };

  // Delete Campaign Handler
  const handleDeleteCampaign = async (campaign) => {
    if (!confirm(`Are you sure you want to delete campaign "${campaign.campaignName}"? This cannot be undone.`)) {
      return;
    }

    const campaignId = campaign.campaignId;
    const dialGroupId = selectedDialGroup?.dialGroupId || selectedDialGroup;

    setCampaignControlLoading(prev => ({ ...prev, [campaignId]: 'delete' }));

    try {
      await ringCentralApi.deleteRingCxCampaign(dialGroupId, campaignId);
      setActionSuccess(`Campaign "${campaign.campaignName}" deleted`);

      // Reload campaigns
      if (dialGroupId) {
        loadCampaigns(dialGroupId);
      }
    } catch (err) {
      console.error('Failed to delete campaign:', err);
      alert(`Failed to delete campaign: ${err.response?.data?.message || err.message}`);
    } finally {
      setCampaignControlLoading(prev => ({ ...prev, [campaignId]: null }));
    }
  };

  // Upload Leads to Campaign
  const openUploadLeadsModal = async (campaign) => {
    setUploadCampaignId(campaign.campaignId);
    setUploadLeadsError(null);
    setSelectedCallListId('');
    setShowUploadLeadsModal(true);

    // Load available call lists
    try {
      const response = await fetch('/api/leads/call-lists', {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setCallListsForUpload(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load call lists:', err);
    }
  };

  const handleUploadLeads = async () => {
    if (!selectedCallListId || !uploadCampaignId) {
      setUploadLeadsError('Please select a call list');
      return;
    }

    setUploadLeadsLoading(true);
    setUploadLeadsError(null);

    try {
      const result = await ringCentralApi.syncCallListToRingCxCampaign(uploadCampaignId, {
        callListId: selectedCallListId,
      });

      setShowUploadLeadsModal(false);
      setUploadCampaignId(null);
      setSelectedCallListId('');
      setActionSuccess(`Synced ${result.data?.synced || 0} leads to campaign`);

      // Reload campaign leads if viewing this campaign
      if (selectedCampaign === uploadCampaignId) {
        loadCampaignLeads(uploadCampaignId);
      }
    } catch (err) {
      console.error('Failed to upload leads:', err);
      setUploadLeadsError(err.response?.data?.message || err.message || 'Failed to upload leads');
    } finally {
      setUploadLeadsLoading(false);
    }
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
            {(Array.isArray(callLogs) ? callLogs : [])
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

        {(!Array.isArray(callLogs) || callLogs.length === 0) && (
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

  // Voicemail Tab Component
  const VoicemailTab = () => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="divide-y divide-gray-100">
        {(Array.isArray(voicemails) ? voicemails : []).map((vm) => (
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

      {(!Array.isArray(voicemails) || voicemails.length === 0) && (
        <div className="p-12 text-center">
          <Voicemail className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No voicemails</p>
        </div>
      )}
    </div>
  );

  // ============================================================================
  // RINGCX CONTACT CENTER TAB COMPONENTS
  // ============================================================================

  // Agents Tab - Agent Management with Status Controls
  const AgentsTab = () => (
    <div className="space-y-6">
      {/* RingCX Status Banner */}
      <div className={`rounded-xl p-4 ${ringCxStatus?.connected ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${ringCxStatus?.connected ? 'bg-green-500' : 'bg-yellow-500'}`} />
            <span className={`font-medium ${ringCxStatus?.connected ? 'text-green-900' : 'text-yellow-900'}`}>
              RingCX Contact Center: {ringCxStatus?.connected ? 'Connected' : 'Not Configured'}
            </span>
          </div>
          <button
            onClick={() => loadAgentGroups()}
            disabled={loading}
            className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Agent Groups */}
      {agentGroups.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-panda-primary" />
              Agent Groups ({agentGroups.length})
            </h3>
          </div>
          <div className="divide-y divide-gray-100">
            {agentGroups.map((group) => (
              <div key={group.agentGroupId} className="p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{group.groupName}</p>
                    <p className="text-sm text-gray-500">ID: {group.agentGroupId}</p>
                  </div>
                  <button
                    onClick={() => loadAgents(group.agentGroupId)}
                    className="text-sm text-panda-primary hover:text-panda-secondary"
                  >
                    View Agents →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Agents List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Headphones className="w-5 h-5 text-panda-primary" />
            Agents ({agents.length})
          </h3>
        </div>

        {agents.length === 0 ? (
          <div className="p-12 text-center">
            <UserCog className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No agents loaded. Select an agent group above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">State</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {agents.map((agent) => (
                  <tr key={agent.agentId} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-panda-primary/10 flex items-center justify-center">
                          <User className="w-4 h-4 text-panda-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{agent.firstName} {agent.lastName}</p>
                          <p className="text-xs text-gray-500">ID: {agent.agentId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{agent.username}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${agentStatusColors[agent.agentState] || 'bg-gray-100 text-gray-700'}`}>
                        {agent.agentState || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{agent.agentAuxState || '-'}</td>
                    <td className="px-6 py-4 text-right">
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            ringCentralApi.updateRingCxAgentStatus(agent.agentId, e.target.value)
                              .then(() => {
                                setActionSuccess(`Agent status updated to ${e.target.value}`);
                                loadAgents(selectedAgentGroup);
                              })
                              .catch(err => setActionError(err.message));
                          }
                        }}
                        className="text-sm border border-gray-300 rounded-lg px-2 py-1"
                        defaultValue=""
                      >
                        <option value="">Change Status</option>
                        <option value="AVAILABLE">Available</option>
                        <option value="ON_BREAK">On Break</option>
                        <option value="TRAINING">Training</option>
                        <option value="AWAY">Away</option>
                        <option value="OFFLINE">Offline</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  // Inbound Queues Tab - Gate Groups and Gates with Statistics
  const InboundQueuesTab = () => (
    <div className="space-y-6">
      {/* Queue Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <PhoneIncoming className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{gates.length}</p>
              <p className="text-sm text-gray-500">Total Queues</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Users className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{gateGroups.length}</p>
              <p className="text-sm text-gray-500">Queue Groups</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Clock className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">--</p>
              <p className="text-sm text-gray-500">Avg Wait Time</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
              <ListChecks className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">--</p>
              <p className="text-sm text-gray-500">Calls in Queue</p>
            </div>
          </div>
        </div>
      </div>

      {/* Gate Groups */}
      {gateGroups.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-panda-primary" />
              Queue Groups
            </h3>
            <button
              onClick={() => loadGateGroups()}
              disabled={loading}
              className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {gateGroups.map((group) => (
              <div key={group.gateGroupId} className="border border-gray-200 rounded-lg p-4 hover:border-panda-primary transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-gray-900">{group.groupName}</h4>
                  <span className="text-xs text-gray-500">ID: {group.gateGroupId}</span>
                </div>
                <p className="text-sm text-gray-500 mb-3">{group.billingCode || 'No billing code'}</p>
                <button
                  onClick={() => {
                    setSelectedGateGroup(group.gateGroupId);
                    loadGates(group.gateGroupId);
                  }}
                  className="text-sm text-panda-primary hover:text-panda-secondary"
                >
                  View Queues →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gates (Queues) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <PhoneIncoming className="w-5 h-5 text-panda-primary" />
            Inbound Queues ({gates.length})
          </h3>
        </div>

        {gates.length === 0 ? (
          <div className="p-12 text-center">
            <PhoneIncoming className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No queues loaded. Select a queue group above or refresh.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Queue Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gate ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {gates.map((gate) => (
                  <tr key={gate.gateId} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{gate.gateName}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{gate.gateId}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{gate.gateDesc || '-'}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${gate.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                        {gate.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => {
                          ringCentralApi.getRingCxGateStats(gate.gateId)
                            .then(res => {
                              console.log('Gate stats:', res);
                              setActionSuccess(`Stats loaded for ${gate.gateName}`);
                            })
                            .catch(err => setActionError(err.message));
                        }}
                        className="text-sm text-panda-primary hover:text-panda-secondary"
                      >
                        View Stats
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  // Campaigns Tab - Outbound Dial Groups, Campaigns, and Leads
  const CampaignsTab = () => (
    <div className="space-y-6">
      {/* Campaign Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Megaphone className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{dialGroups.length}</p>
              <p className="text-sm text-gray-500">Dial Groups</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <ListChecks className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{campaigns.length}</p>
              <p className="text-sm text-gray-500">Campaigns</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Users className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{campaignLeads.length}</p>
              <p className="text-sm text-gray-500">Leads Loaded</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
              <PhoneOutgoing className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">--</p>
              <p className="text-sm text-gray-500">Calls Today</p>
            </div>
          </div>
        </div>
      </div>

      {/* Dial Groups */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-panda-primary" />
            Dial Groups
          </h3>
          <button
            onClick={() => loadDialGroups()}
            disabled={loading}
            className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {dialGroups.length === 0 ? (
          <div className="p-12 text-center">
            <Megaphone className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No dial groups configured yet.</p>
            <p className="text-sm text-gray-400 mt-2">Contact RingCentral to set up outbound campaigns.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {dialGroups.map((group) => (
              <div key={group.dialGroupId} className="border border-gray-200 rounded-lg p-4 hover:border-panda-primary transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-gray-900">{group.dialGroupName}</h4>
                  <span className={`text-xs px-2 py-1 rounded-full ${group.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                    {group.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mb-3">ID: {group.dialGroupId}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setSelectedDialGroup(group);
                      loadCampaigns(group.dialGroupId);
                    }}
                    className="text-sm text-panda-primary hover:text-panda-secondary"
                  >
                    View Campaigns
                  </button>
                  <button
                    onClick={() => {
                      setSelectedDialGroup(group);
                      setShowCreateCampaignModal(true);
                    }}
                    className="text-sm text-green-600 hover:text-green-700 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    New
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Campaigns */}
      {selectedDialGroup && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <ListChecks className="w-5 h-5 text-panda-primary" />
              Campaigns ({campaigns.length})
            </h3>
            <button
              onClick={() => setShowCreateCampaignModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-panda-primary text-white text-sm rounded-lg hover:bg-panda-secondary"
            >
              <Plus className="w-4 h-4" />
              New Campaign
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Campaign</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {campaigns.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <ListChecks className="w-12 h-12 text-gray-300" />
                        <p className="text-gray-500">No campaigns in this dial group yet</p>
                        <button
                          onClick={() => setShowCreateCampaignModal(true)}
                          className="flex items-center gap-2 px-4 py-2 bg-panda-primary text-white text-sm rounded-lg hover:bg-panda-secondary"
                        >
                          <Plus className="w-4 h-4" />
                          Create First Campaign
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  campaigns.map((campaign) => (
                    <tr key={campaign.campaignId} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <p className="font-medium text-gray-900">{campaign.campaignName}</p>
                        <p className="text-xs text-gray-500">ID: {campaign.campaignId}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${campaignStatusColors[campaign.campaignState] || 'bg-gray-100 text-gray-700'}`}>
                          {campaign.campaignState || 'Unknown'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{campaign.campaignDesc || '-'}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* View Leads */}
                          <button
                            onClick={() => {
                              setSelectedCampaign(campaign.campaignId);
                              loadCampaignLeads(campaign.campaignId);
                            }}
                            className="p-1.5 text-gray-500 hover:text-panda-primary hover:bg-gray-100 rounded"
                            title="View Leads"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Edit Campaign */}
                          <button
                            onClick={() => openEditCampaign(campaign)}
                            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-gray-100 rounded"
                            title="Edit Campaign"
                          >
                            <Edit className="w-4 h-4" />
                          </button>

                          {/* Upload Leads */}
                          <button
                            onClick={() => openUploadLeadsModal(campaign)}
                            className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-gray-100 rounded"
                            title="Upload Leads"
                          >
                            <Upload className="w-4 h-4" />
                          </button>

                          {/* Campaign Controls - Start/Pause/Stop */}
                          {campaign.campaignState !== 'ACTIVE' && (
                            <button
                              onClick={() => handleCampaignControl(campaign, 'start')}
                              disabled={campaignControlLoading[campaign.campaignId] === 'start'}
                              className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-gray-100 rounded disabled:opacity-50"
                              title="Start Campaign"
                            >
                              {campaignControlLoading[campaign.campaignId] === 'start' ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                              ) : (
                                <Play className="w-4 h-4" />
                              )}
                            </button>
                          )}
                          {campaign.campaignState === 'ACTIVE' && (
                            <button
                              onClick={() => handleCampaignControl(campaign, 'pause')}
                              disabled={campaignControlLoading[campaign.campaignId] === 'pause'}
                              className="p-1.5 text-gray-500 hover:text-yellow-600 hover:bg-gray-100 rounded disabled:opacity-50"
                              title="Pause Campaign"
                            >
                              {campaignControlLoading[campaign.campaignId] === 'pause' ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                              ) : (
                                <Pause className="w-4 h-4" />
                              )}
                            </button>
                          )}
                          {(campaign.campaignState === 'ACTIVE' || campaign.campaignState === 'PAUSED') && (
                            <button
                              onClick={() => handleCampaignControl(campaign, 'stop')}
                              disabled={campaignControlLoading[campaign.campaignId] === 'stop'}
                              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-gray-100 rounded disabled:opacity-50"
                              title="Stop Campaign"
                            >
                              {campaignControlLoading[campaign.campaignId] === 'stop' ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                              ) : (
                                <PhoneOff className="w-4 h-4" />
                              )}
                            </button>
                          )}

                          {/* Delete Campaign */}
                          <button
                            onClick={() => handleDeleteCampaign(campaign)}
                            disabled={campaignControlLoading[campaign.campaignId] === 'delete'}
                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-gray-100 rounded disabled:opacity-50"
                            title="Delete Campaign"
                          >
                            {campaignControlLoading[campaign.campaignId] === 'delete' ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Campaign Leads */}
      {campaignLeads.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-panda-primary" />
              Campaign Leads ({campaignLeads.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lead</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Called</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Attempts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {campaignLeads.slice(0, 50).map((lead, idx) => (
                  <tr key={lead.leadId || idx} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{lead.firstName} {lead.lastName}</p>
                      <p className="text-xs text-gray-500">{lead.email || 'No email'}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{lead.leadPhone || '-'}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${lead.leadState === 'READY' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                        {lead.leadState || 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{lead.lastDialed ? formatDate(lead.lastDialed) : 'Never'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{lead.callCount || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {campaignLeads.length > 50 && (
            <div className="px-6 py-4 text-center text-sm text-gray-500 border-t border-gray-100">
              Showing first 50 of {campaignLeads.length} leads
            </div>
          )}
        </div>
      )}
    </div>
  );

  // Active Calls Tab - Real-time Call Monitoring with Supervisor Controls
  const ActiveCallsTab = () => (
    <div className="space-y-6">
      {/* Active Calls Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Active Calls Monitor</h2>
          <p className="text-sm text-gray-500">Real-time call monitoring with supervisor controls</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            Auto-refresh: {activeCallsRefresh ? 'On (10s)' : 'Off'}
          </span>
          <button
            onClick={() => setActiveCallsRefresh(!activeCallsRefresh)}
            className={`px-3 py-1.5 text-sm rounded-lg ${activeCallsRefresh ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}
          >
            {activeCallsRefresh ? 'Pause' : 'Resume'}
          </button>
          <button
            onClick={() => loadActiveCalls()}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 bg-panda-primary text-white text-sm rounded-lg hover:bg-panda-secondary"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh Now
          </button>
        </div>
      </div>

      {/* Active Calls Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Radio className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{activeCalls.length}</p>
              <p className="text-sm text-gray-500">Active Calls</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <PhoneIncoming className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {activeCalls.filter(c => c.direction === 'INBOUND').length}
              </p>
              <p className="text-sm text-gray-500">Inbound</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
              <PhoneOutgoing className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {activeCalls.filter(c => c.direction === 'OUTBOUND').length}
              </p>
              <p className="text-sm text-gray-500">Outbound</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Clock className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {activeCalls.length > 0 ? '--' : '0:00'}
              </p>
              <p className="text-sm text-gray-500">Avg Duration</p>
            </div>
          </div>
        </div>
      </div>

      {/* Active Calls Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Radio className="w-5 h-5 text-green-500 animate-pulse" />
            Live Calls
          </h3>
        </div>

        {activeCalls.length === 0 ? (
          <div className="p-12 text-center">
            <Radio className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No active calls at the moment</p>
            <p className="text-sm text-gray-400 mt-2">Calls will appear here in real-time when agents are on calls</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Direction</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Supervisor Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activeCalls.map((call) => (
                  <tr key={call.sessionId} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                          <Headphones className="w-4 h-4 text-green-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{call.agentName || 'Unknown Agent'}</p>
                          <p className="text-xs text-gray-500">Ext: {call.agentExtension || '-'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{call.ani || call.customerNumber || 'Unknown'}</p>
                      <p className="text-xs text-gray-500">{call.dnis || '-'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${
                        call.direction === 'INBOUND' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                        {call.direction === 'INBOUND' ? <PhoneIncoming className="w-3 h-3" /> : <PhoneOutgoing className="w-3 h-3" />}
                        {call.direction || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {call.duration || call.callDuration || '--:--'}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">
                        {call.callState || call.status || 'Active'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleMonitorCall(call.sessionId)}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                          title="Monitor (Silent Listen)"
                        >
                          <Ear className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleCoachCall(call.sessionId)}
                          className="p-1.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded"
                          title="Coach (Whisper to Agent)"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleBargeCall(call.sessionId)}
                          className="p-1.5 text-gray-500 hover:text-orange-600 hover:bg-orange-50 rounded"
                          title="Barge (Join Call)"
                        >
                          <PhoneForwarded className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleHoldCall(call.sessionId, !call.isOnHold)}
                          className={`p-1.5 rounded ${call.isOnHold ? 'text-yellow-600 bg-yellow-50' : 'text-gray-500 hover:text-yellow-600 hover:bg-yellow-50'}`}
                          title={call.isOnHold ? 'Resume Call' : 'Hold Call'}
                        >
                          <VolumeX className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleRecordCall(call.sessionId, !call.isRecording)}
                          className={`p-1.5 rounded ${call.isRecording ? 'text-red-600 bg-red-50' : 'text-gray-500 hover:text-red-600 hover:bg-red-50'}`}
                          title={call.isRecording ? 'Stop Recording' : 'Start Recording'}
                        >
                          <div className={`w-3 h-3 rounded-full ${call.isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-400'}`} />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm('Are you sure you want to end this call?')) {
                              handleHangupCall(call.sessionId);
                            }
                          }}
                          className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                          title="End Call"
                        >
                          <PhoneOff className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Supervisor Controls Legend */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h4 className="font-medium text-gray-900 mb-3">Supervisor Controls Legend</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Ear className="w-4 h-4 text-blue-600" />
            <span className="text-gray-600">Monitor - Silent listen to call</span>
          </div>
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-purple-600" />
            <span className="text-gray-600">Coach - Whisper to agent only</span>
          </div>
          <div className="flex items-center gap-2">
            <PhoneForwarded className="w-4 h-4 text-orange-600" />
            <span className="text-gray-600">Barge - Join the call</span>
          </div>
          <div className="flex items-center gap-2">
            <VolumeX className="w-4 h-4 text-yellow-600" />
            <span className="text-gray-600">Hold - Put call on hold</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-gray-600">Record - Toggle recording</span>
          </div>
          <div className="flex items-center gap-2">
            <PhoneOff className="w-4 h-4 text-red-600" />
            <span className="text-gray-600">Hangup - End the call</span>
          </div>
        </div>
      </div>
    </div>
  );

  // Settings Tab Component
  const SettingsTab = () => (
    <div className="space-y-6">
      {/* Organization Connection Status */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Organization Connection</h3>
        <p className="text-sm text-gray-500 mb-4">
          This is the company-wide RingCentral integration that syncs all call logs, enables AI analysis, and links calls to CRM records.
        </p>

        <div className="flex items-center space-x-4 mb-6">
          <div className={`w-3 h-3 rounded-full ${
            status?.connected ? 'bg-green-500' : status?.configured ? 'bg-red-500' : 'bg-yellow-500'
          }`} />
          <span className="font-medium text-gray-900">
            {status?.connected ? 'Backend Connected' : status?.configured ? 'Connection Failed' : 'Backend Not Configured'}
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
        ) : status?.configured ? (
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-900">Authentication Failed</p>
                  <p className="text-sm text-red-700 mt-1">
                    Backend is configured but RingCentral authentication failed:
                  </p>
                  <p className="text-sm text-red-800 mt-2 font-mono bg-red-100 p-2 rounded">
                    {status?.error || 'Unknown error'}
                  </p>
                  <p className="text-sm text-red-700 mt-3">
                    <strong>Common fixes:</strong>
                  </p>
                  <ul className="text-sm text-red-700 mt-1 list-disc list-inside space-y-1">
                    <li>Ensure your RingCentral app has <strong>JWT Bearer</strong> grant type enabled in the Developer Portal</li>
                    <li>Verify the JWT token was generated for this specific app (Client ID must match)</li>
                    <li>Check that the JWT token hasn't expired</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Settings className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-900">Backend Configuration Required</p>
                  <p className="text-sm text-yellow-700 mt-1">
                    To enable full RingCentral integration with call syncing, AI analysis, and CRM record linking,
                    the following environment variables need to be set in the ECS integrations service:
                  </p>
                  <ul className="text-sm text-yellow-700 mt-2 list-disc list-inside space-y-1">
                    <li><code className="bg-yellow-100 px-1 rounded">RINGCENTRAL_CLIENT_ID</code></li>
                    <li><code className="bg-yellow-100 px-1 rounded">RINGCENTRAL_CLIENT_SECRET</code></li>
                    <li><code className="bg-yellow-100 px-1 rounded">RINGCENTRAL_JWT_TOKEN</code> (for server-to-server auth)</li>
                  </ul>
                  <p className="text-sm text-yellow-700 mt-2">
                    Get these from your RingCentral Developer Portal app.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* User OAuth Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Connect to RingCentral</h3>
        <p className="text-sm text-gray-500 mb-4">
          Connect your RingCentral account to enable click-to-call, call logging, and sync features.
        </p>

        <button
          onClick={() => {
            ringCentralApi.getAuthUrl().then(res => {
              const authUrl = res.data?.authUrl || res.data?.url;
              if (authUrl) {
                window.location.href = authUrl;
              } else {
                alert('OAuth authorization URL not available. Please ensure RINGCENTRAL_CLIENT_ID, RINGCENTRAL_CLIENT_SECRET, and RINGCENTRAL_REDIRECT_URI are configured in the integrations service.');
              }
            }).catch(err => {
              console.error('Failed to get auth URL:', err);
              alert('Failed to get RingCentral authorization URL. Check the integrations service logs.');
            });
          }}
          className="w-full px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg font-medium hover:opacity-90"
        >
          <Link2 className="w-4 h-4 inline mr-2" />
          {status?.connected ? 'Reconnect RingCentral' : 'Connect RingCentral Account'}
        </button>

        {status?.connected && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center space-x-2">
              <Check className="w-4 h-4 text-green-600" />
              <span className="text-sm text-green-700">RingCentral is connected and active</span>
            </div>
          </div>
        )}
      </div>

      {/* Embeddable Widget Status */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Embeddable Phone Widget</h3>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <Phone className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-green-900">Widget Active</p>
              <p className="text-sm text-green-700 mt-1">
                The RingCentral phone widget is available in the bottom-right corner of the screen.
                Users can make and receive calls, view call history, and access voicemail through the widget.
              </p>
              <p className="text-xs text-green-600 mt-2">
                Widget Client ID: 9SphzQfJPE1fyyeZUL0eIr
              </p>
            </div>
          </div>
        </div>
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
      case 'voicemail':
        return <VoicemailTab />;
      // RingCX Contact Center tabs
      case 'agents':
        return <AgentsTab />;
      case 'inbound':
        return <InboundQueuesTab />;
      case 'campaigns':
        return <CampaignsTab />;
      case 'active':
        return <ActiveCallsTab />;
      case 'settings':
        return <SettingsTab />;
      default:
        return <OverviewTab />;
    }
  };

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
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

      {/* Create Campaign Modal */}
      {showCreateCampaignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-panda-primary" />
                Create New Campaign
              </h3>
              <button
                onClick={() => {
                  setShowCreateCampaignModal(false);
                  setCreateCampaignError(null);
                }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Dial Group Display */}
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500">Creating campaign in dial group:</p>
                <p className="font-medium text-gray-900">
                  {selectedDialGroup?.dialGroupName || selectedDialGroup?.name || 'No dial group selected'}
                </p>
              </div>

              {/* Error Message */}
              {createCampaignError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{createCampaignError}</p>
                </div>
              )}

              {/* Campaign Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Campaign Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newCampaign.campaignName}
                  onChange={(e) => setNewCampaign({ ...newCampaign, campaignName: e.target.value })}
                  placeholder="e.g., January Hot Leads"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                />
              </div>

              {/* Campaign Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={newCampaign.campaignDesc}
                  onChange={(e) => setNewCampaign({ ...newCampaign, campaignDesc: e.target.value })}
                  placeholder="Optional description for this campaign"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                />
              </div>

              {/* Dialer Settings */}
              <div className="pt-2 border-t border-gray-100">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Dialer Settings</h4>

                <div className="grid grid-cols-2 gap-4">
                  {/* Max Ring Time */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Max Ring Time (seconds)</label>
                    <input
                      type="number"
                      value={newCampaign.maxRingTime}
                      onChange={(e) => setNewCampaign({ ...newCampaign, maxRingTime: parseInt(e.target.value) || 25 })}
                      min={10}
                      max={60}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20"
                    />
                  </div>

                  {/* Max Attempts */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Max Dial Attempts</label>
                    <input
                      type="number"
                      value={newCampaign.maxAttempts}
                      onChange={(e) => setNewCampaign({ ...newCampaign, maxAttempts: parseInt(e.target.value) || 3 })}
                      min={1}
                      max={10}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20"
                    />
                  </div>

                  {/* Min Retry Time */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Min Retry Time (minutes)</label>
                    <input
                      type="number"
                      value={newCampaign.minRetryTime}
                      onChange={(e) => setNewCampaign({ ...newCampaign, minRetryTime: parseInt(e.target.value) || 60 })}
                      min={15}
                      max={1440}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20"
                    />
                  </div>

                  {/* Active Status */}
                  <div className="flex items-center gap-2 pt-5">
                    <input
                      type="checkbox"
                      id="isActive"
                      checked={newCampaign.isActive}
                      onChange={(e) => setNewCampaign({ ...newCampaign, isActive: e.target.checked })}
                      className="w-4 h-4 text-panda-primary rounded focus:ring-panda-primary"
                    />
                    <label htmlFor="isActive" className="text-sm text-gray-700">
                      Start Active
                    </label>
                  </div>
                </div>

                {/* Scrub Disconnects */}
                <div className="flex items-center gap-2 mt-3">
                  <input
                    type="checkbox"
                    id="scrubDisconnects"
                    checked={newCampaign.scrubDisconnects}
                    onChange={(e) => setNewCampaign({ ...newCampaign, scrubDisconnects: e.target.checked })}
                    className="w-4 h-4 text-panda-primary rounded focus:ring-panda-primary"
                  />
                  <label htmlFor="scrubDisconnects" className="text-sm text-gray-700">
                    Remove disconnected numbers
                  </label>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCreateCampaignModal(false);
                  setCreateCampaignError(null);
                }}
                disabled={createCampaignLoading}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCampaign}
                disabled={createCampaignLoading || !newCampaign.campaignName.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createCampaignLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Create Campaign
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Campaign Modal */}
      {showEditCampaignModal && editingCampaign && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Edit className="w-5 h-5 text-panda-primary" />
                Edit Campaign
              </h3>
              <button
                onClick={() => {
                  setShowEditCampaignModal(false);
                  setEditingCampaign(null);
                  setEditCampaignError(null);
                }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Error Message */}
              {editCampaignError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{editCampaignError}</p>
                </div>
              )}

              {/* Campaign Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Campaign Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editingCampaign.campaignName}
                  onChange={(e) => setEditingCampaign({ ...editingCampaign, campaignName: e.target.value })}
                  placeholder="e.g., January Hot Leads"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                />
              </div>

              {/* Campaign Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={editingCampaign.campaignDesc}
                  onChange={(e) => setEditingCampaign({ ...editingCampaign, campaignDesc: e.target.value })}
                  placeholder="Optional description for this campaign"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                />
              </div>

              {/* Dialer Settings */}
              <div className="pt-2 border-t border-gray-100">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Dialer Settings</h4>

                <div className="grid grid-cols-2 gap-4">
                  {/* Max Ring Time */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Max Ring Time (seconds)</label>
                    <input
                      type="number"
                      value={editingCampaign.maxRingTime}
                      onChange={(e) => setEditingCampaign({ ...editingCampaign, maxRingTime: parseInt(e.target.value) || 25 })}
                      min={10}
                      max={60}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20"
                    />
                  </div>

                  {/* Max Attempts */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Max Dial Attempts</label>
                    <input
                      type="number"
                      value={editingCampaign.maxAttempts}
                      onChange={(e) => setEditingCampaign({ ...editingCampaign, maxAttempts: parseInt(e.target.value) || 3 })}
                      min={1}
                      max={10}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20"
                    />
                  </div>

                  {/* Min Retry Time */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Min Retry Time (minutes)</label>
                    <input
                      type="number"
                      value={editingCampaign.minRetryTime}
                      onChange={(e) => setEditingCampaign({ ...editingCampaign, minRetryTime: parseInt(e.target.value) || 60 })}
                      min={15}
                      max={1440}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20"
                    />
                  </div>

                  {/* Active Status */}
                  <div className="flex items-center gap-2 pt-5">
                    <input
                      type="checkbox"
                      id="editIsActive"
                      checked={editingCampaign.isActive}
                      onChange={(e) => setEditingCampaign({ ...editingCampaign, isActive: e.target.checked })}
                      className="w-4 h-4 text-panda-primary rounded focus:ring-panda-primary"
                    />
                    <label htmlFor="editIsActive" className="text-sm text-gray-700">
                      Active
                    </label>
                  </div>
                </div>

                {/* Scrub Disconnects */}
                <div className="flex items-center gap-2 mt-3">
                  <input
                    type="checkbox"
                    id="editScrubDisconnects"
                    checked={editingCampaign.scrubDisconnects}
                    onChange={(e) => setEditingCampaign({ ...editingCampaign, scrubDisconnects: e.target.checked })}
                    className="w-4 h-4 text-panda-primary rounded focus:ring-panda-primary"
                  />
                  <label htmlFor="editScrubDisconnects" className="text-sm text-gray-700">
                    Remove disconnected numbers
                  </label>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowEditCampaignModal(false);
                  setEditingCampaign(null);
                  setEditCampaignError(null);
                }}
                disabled={editCampaignLoading}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleEditCampaign}
                disabled={editCampaignLoading || !editingCampaign.campaignName?.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editCampaignLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Leads Modal */}
      {showUploadLeadsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Upload className="w-5 h-5 text-green-600" />
                Upload Leads to Campaign
              </h3>
              <button
                onClick={() => {
                  setShowUploadLeadsModal(false);
                  setUploadCampaignId(null);
                  setSelectedCallListId('');
                  setUploadLeadsError(null);
                }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-4 space-y-4">
              {/* Error Message */}
              {uploadLeadsError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{uploadLeadsError}</p>
                </div>
              )}

              {/* Instructions */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-700">
                  Select a call list from your CRM to sync its leads to this RingCX campaign.
                  Leads will be matched by phone number.
                </p>
              </div>

              {/* Call List Selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Call List <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedCallListId}
                  onChange={(e) => setSelectedCallListId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                >
                  <option value="">-- Select a call list --</option>
                  {callListsForUpload.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name} ({list.totalItems || 0} leads)
                    </option>
                  ))}
                </select>
                {callListsForUpload.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    No call lists found. Create one in the Call Center Dashboard first.
                  </p>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowUploadLeadsModal(false);
                  setUploadCampaignId(null);
                  setSelectedCallListId('');
                  setUploadLeadsError(null);
                }}
                disabled={uploadLeadsLoading}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleUploadLeads}
                disabled={uploadLeadsLoading || !selectedCallListId}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploadLeadsLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Sync Leads
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </AdminLayout>
  );
}
