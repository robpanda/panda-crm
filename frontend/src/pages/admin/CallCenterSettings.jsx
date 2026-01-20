import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AdminLayout from '../../components/AdminLayout';
import {
  Phone,
  Plus,
  Search,
  Edit,
  Trash2,
  Save,
  X,
  Settings,
  List,
  MessageSquare,
  Clock,
  Users,
  Filter,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  PlayCircle,
  PauseCircle,
  RefreshCw,
  Copy,
  MoreVertical,
  Zap,
  Target,
  ArrowRight,
  PhoneOff,
  Calendar,
  RotateCcw,
} from 'lucide-react';
import api, { callListsApi } from '../../services/api';

// Tab configuration
const TABS = [
  { id: 'lists', label: 'Call Lists', icon: List },
  { id: 'dispositions', label: 'Dispositions', icon: MessageSquare },
  { id: 'settings', label: 'General Settings', icon: Settings },
];

// Disposition categories for organization
const DISPOSITION_CATEGORIES = [
  { value: 'POSITIVE', label: 'Positive Outcome', color: 'green' },
  { value: 'NEGATIVE', label: 'Negative Outcome', color: 'red' },
  { value: 'CALLBACK', label: 'Callback', color: 'blue' },
  { value: 'NO_CONTACT', label: 'No Contact', color: 'yellow' },
  { value: 'QUALIFIED', label: 'Qualified', color: 'purple' },
  { value: 'DISQUALIFIED', label: 'Disqualified', color: 'gray' },
  { value: 'OTHER', label: 'Other', color: 'gray' },
];

// Cadence types
const CADENCE_TYPES = [
  { value: 'PREVIEW', label: 'Preview Dialer', description: 'Agent reviews contact before dialing' },
  { value: 'PROGRESSIVE', label: 'Progressive Dialer', description: 'Auto-dial after wrap-up' },
  { value: 'PREDICTIVE', label: 'Predictive Dialer', description: 'Predictive dialing for high volume' },
  { value: 'MANUAL', label: 'Manual', description: 'Agent clicks to dial each call' },
];

// List types
const LIST_TYPES = [
  { value: 'DYNAMIC', label: 'Dynamic', description: 'Auto-populated based on filters' },
  { value: 'STATIC', label: 'Static', description: 'Manually managed list' },
  { value: 'CALLBACK', label: 'Callback', description: 'Scheduled callbacks only' },
  { value: 'IMPORT', label: 'Import', description: 'Imported from external source' },
];

// State options
const STATE_OPTIONS = [
  'MD', 'DE', 'VA', 'NC', 'NJ', 'PA', 'TPA', 'CAT'
];

export default function CallCenterSettings() {
  const [activeTab, setActiveTab] = useState('lists');
  const [searchTerm, setSearchTerm] = useState('');
  const [showListModal, setShowListModal] = useState(false);
  const [showDispositionModal, setShowDispositionModal] = useState(false);
  const [selectedList, setSelectedList] = useState(null);
  const [selectedDisposition, setSelectedDisposition] = useState(null);
  const [expandedList, setExpandedList] = useState(null);

  const queryClient = useQueryClient();

  // Fetch call lists
  const { data: callListsData, isLoading: listsLoading } = useQuery({
    queryKey: ['callLists'],
    queryFn: () => callListsApi.getLists(),
  });

  // Fetch dispositions
  const { data: dispositionsData, isLoading: dispositionsLoading } = useQuery({
    queryKey: ['dispositions'],
    queryFn: () => callListsApi.getGlobalDispositions(),
  });

  // Initialize predefined lists and dispositions
  const initPredefinedMutation = useMutation({
    mutationFn: () => callListsApi.initPredefinedLists(),
    onSuccess: (data) => {
      console.log('Init predefined success:', data);
      queryClient.invalidateQueries(['callLists']);
      queryClient.invalidateQueries(['dispositions']);
    },
    onError: (error) => {
      console.error('Init predefined error:', error);
      alert(`Failed to initialize: ${error.message || 'Unknown error'}`);
    },
  });

  // Populate call lists with leads/opportunities
  const populateListsMutation = useMutation({
    mutationFn: () => callListsApi.populateLists({ dryRun: false, limit: 1000 }),
    onSuccess: (data) => {
      console.log('Populate lists success:', data);
      queryClient.invalidateQueries(['callLists']);
      const results = data.data || data;
      const totalAdded = Object.values(results).reduce((sum, r) => sum + (r.added || 0), 0);
      alert(`Successfully populated lists! ${totalAdded} items added across all lists.`);
    },
    onError: (error) => {
      console.error('Populate lists error:', error);
      alert(`Failed to populate lists: ${error.message || 'Unknown error'}`);
    },
  });

  // Create/Update call list
  const saveListMutation = useMutation({
    mutationFn: (data) => {
      if (data.id) {
        return callListsApi.updateList(data.id, data);
      }
      return callListsApi.createList(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['callLists']);
      setShowListModal(false);
      setSelectedList(null);
    },
  });

  // Delete call list
  const deleteListMutation = useMutation({
    mutationFn: (id) => callListsApi.deleteList(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['callLists']);
    },
  });

  // Refresh dynamic list
  const refreshListMutation = useMutation({
    mutationFn: (id) => callListsApi.refreshList(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['callLists']);
    },
  });

  // Create/Update disposition
  const saveDispositionMutation = useMutation({
    mutationFn: (data) => {
      if (data.id) {
        return callListsApi.updateDisposition(data.id, data);
      }
      return callListsApi.createDisposition(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['dispositions']);
      setShowDispositionModal(false);
      setSelectedDisposition(null);
    },
  });

  const callLists = callListsData?.data || [];
  const dispositions = dispositionsData?.data || [];

  // Filter lists by search term
  const filteredLists = callLists.filter(list =>
    list.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    list.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Filter dispositions by search term
  const filteredDispositions = dispositions.filter(disp =>
    disp.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    disp.code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group dispositions by category
  const groupedDispositions = DISPOSITION_CATEGORIES.reduce((acc, cat) => {
    acc[cat.value] = filteredDispositions.filter(d => d.category === cat.value);
    return acc;
  }, {});

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Call Center Settings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure call lists, dispositions, and dialing settings
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(callLists.length === 0 || dispositions.length === 0) && (
            <button
              onClick={() => initPredefinedMutation.mutate()}
              disabled={initPredefinedMutation.isPending}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {initPredefinedMutation.isPending ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Zap className="w-4 h-4 mr-2" />
              )}
              Initialize Predefined
            </button>
          )}
          {callLists.length > 0 && (
            <button
              onClick={() => populateListsMutation.mutate()}
              disabled={populateListsMutation.isPending}
              className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              title="Route leads and opportunities to appropriate call lists based on their status and criteria"
            >
              {populateListsMutation.isPending ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Target className="w-4 h-4 mr-2" />
              )}
              Populate Lists
            </button>
          )}
          <button
            onClick={() => {
              if (activeTab === 'lists') {
                setSelectedList(null);
                setShowListModal(true);
              } else if (activeTab === 'dispositions') {
                setSelectedDisposition(null);
                setShowDispositionModal(true);
              }
            }}
            className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90 transition-opacity"
          >
            <Plus className="w-5 h-5 mr-2" />
            <span>
              {activeTab === 'lists' ? 'New List' : activeTab === 'dispositions' ? 'New Disposition' : 'Add'}
            </span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px overflow-x-auto">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center px-4 py-3 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
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

        {/* Search Bar */}
        {(activeTab === 'lists' || activeTab === 'dispositions') && (
          <div className="p-4 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={activeTab === 'lists' ? 'Search call lists...' : 'Search dispositions...'}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
              />
            </div>
          </div>
        )}

        {/* Tab Content */}
        <div className="p-4">
          {activeTab === 'lists' && (
            <CallListsTab
              lists={filteredLists}
              loading={listsLoading}
              expandedList={expandedList}
              setExpandedList={setExpandedList}
              onEdit={(list) => {
                setSelectedList(list);
                setShowListModal(true);
              }}
              onDelete={(id) => {
                if (confirm('Are you sure you want to delete this call list?')) {
                  deleteListMutation.mutate(id);
                }
              }}
              onRefresh={(id) => refreshListMutation.mutate(id)}
              refreshing={refreshListMutation.isPending}
            />
          )}

          {activeTab === 'dispositions' && (
            <DispositionsTab
              groupedDispositions={groupedDispositions}
              loading={dispositionsLoading}
              onEdit={(disp) => {
                setSelectedDisposition(disp);
                setShowDispositionModal(true);
              }}
            />
          )}

          {activeTab === 'settings' && (
            <GeneralSettingsTab />
          )}
        </div>
      </div>

      {/* Call List Modal */}
      {showListModal && (
        <CallListModal
          list={selectedList}
          allLists={callLists}
          onSave={(data) => saveListMutation.mutate(data)}
          onClose={() => {
            setShowListModal(false);
            setSelectedList(null);
          }}
          saving={saveListMutation.isPending}
        />
      )}

      {/* Disposition Modal */}
      {showDispositionModal && (
        <DispositionModal
          disposition={selectedDisposition}
          allLists={callLists}
          onSave={(data) => saveDispositionMutation.mutate(data)}
          onClose={() => {
            setShowDispositionModal(false);
            setSelectedDisposition(null);
          }}
          saving={saveDispositionMutation.isPending}
        />
        )}
      </div>
    </AdminLayout>
  );
}

// Call Lists Tab Component
function CallListsTab({ lists, loading, expandedList, setExpandedList, onEdit, onDelete, onRefresh, refreshing }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary"></div>
      </div>
    );
  }

  if (lists.length === 0) {
    return (
      <div className="text-center py-12">
        <List className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-1">No Call Lists</h3>
        <p className="text-gray-500 mb-4">Create your first call list to start organizing leads for calling.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {lists.map((list) => (
        <div key={list.id} className="border border-gray-200 rounded-lg overflow-hidden">
          {/* List Header */}
          <div
            className="flex items-center justify-between p-4 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
            onClick={() => setExpandedList(expandedList === list.id ? null : list.id)}
          >
            <div className="flex items-center space-x-3">
              {expandedList === list.id ? (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronRight className="w-5 h-5 text-gray-400" />
              )}
              <div className={`w-3 h-3 rounded-full ${list.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
              <div>
                <h4 className="font-medium text-gray-900">{list.name}</h4>
                <p className="text-sm text-gray-500">{list.description || 'No description'}</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{list._count?.items || 0} items</p>
                <p className="text-xs text-gray-500">{list.listType} • {list.cadenceType}</p>
              </div>
              <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                {list.listType === 'DYNAMIC' && (
                  <button
                    onClick={() => onRefresh(list.id)}
                    disabled={refreshing}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                    title="Refresh List"
                  >
                    <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                  </button>
                )}
                <button
                  onClick={() => onEdit(list)}
                  className="p-1.5 text-gray-400 hover:text-panda-primary hover:bg-panda-primary/10 rounded"
                  title="Edit List"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onDelete(list.id)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                  title="Delete List"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Expanded Details */}
          {expandedList === list.id && (
            <div className="p-4 border-t border-gray-200 bg-white">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase">Cadence</p>
                  <p className="font-medium">{list.cadenceHours ? `${list.cadenceHours} hours` : 'No cadence'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Max Attempts</p>
                  <p className="font-medium">{list.maxAttempts}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Cooldown</p>
                  <p className="font-medium">{list.cooldownDays} days</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Priority</p>
                  <p className="font-medium">{list.priority}</p>
                </div>
              </div>
              {list.states && list.states.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs text-gray-500 uppercase mb-2">States</p>
                  <div className="flex flex-wrap gap-1">
                    {list.states.map((state) => (
                      <span key={state} className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">
                        {state}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {list.filterCriteria && (
                <div className="mt-4">
                  <p className="text-xs text-gray-500 uppercase mb-2">Filter Criteria</p>
                  <pre className="text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                    {JSON.stringify(list.filterCriteria, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Dispositions Tab Component
function DispositionsTab({ groupedDispositions, loading, onEdit }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary"></div>
      </div>
    );
  }

  const hasDispositions = Object.values(groupedDispositions).some(arr => arr.length > 0);

  if (!hasDispositions) {
    return (
      <div className="text-center py-12">
        <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-1">No Dispositions</h3>
        <p className="text-gray-500 mb-4">Create dispositions to track call outcomes.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {DISPOSITION_CATEGORIES.map((category) => {
        const categoryDispositions = groupedDispositions[category.value] || [];
        if (categoryDispositions.length === 0) return null;

        return (
          <div key={category.value}>
            <h4 className={`text-sm font-medium mb-3 flex items-center`}>
              <span className={`w-2 h-2 rounded-full mr-2 bg-${category.color}-500`} />
              {category.label}
              <span className="ml-2 text-gray-400 font-normal">({categoryDispositions.length})</span>
            </h4>
            <div className="grid gap-2">
              {categoryDispositions.map((disp) => (
                <div
                  key={disp.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className={`w-8 h-8 rounded-lg bg-${category.color}-100 flex items-center justify-center`}>
                      <span className={`text-${category.color}-600 text-xs font-bold`}>
                        {disp.code?.slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{disp.name}</p>
                      <p className="text-xs text-gray-500">Code: {disp.code}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    {/* Action indicators */}
                    <div className="flex items-center space-x-1">
                      {disp.removeFromList && (
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded" title="Removes from list">
                          Remove
                        </span>
                      )}
                      {disp.moveToListId && (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded" title="Moves to another list">
                          Move
                        </span>
                      )}
                      {disp.scheduleCallback && (
                        <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded" title="Schedules callback">
                          Callback
                        </span>
                      )}
                      {disp.addToDNC && (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded" title="Adds to DNC">
                          DNC
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => onEdit(disp)}
                      className="p-1.5 text-gray-400 hover:text-panda-primary hover:bg-panda-primary/10 rounded"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// General Settings Tab
function GeneralSettingsTab() {
  const [settings, setSettings] = useState({
    defaultCadenceType: 'PREVIEW',
    defaultMaxAttempts: 6,
    defaultCooldownDays: 7,
    autoRefreshInterval: 60,
    enablePredictiveDialing: false,
    wrapUpTime: 30,
    afterCallWorkTime: 60,
  });

  const handleSave = () => {
    // TODO: Save settings via API
    alert('Settings saved!');
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Dialing Defaults</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Default Dialer Mode</label>
            <select
              value={settings.defaultCadenceType}
              onChange={(e) => setSettings({ ...settings, defaultCadenceType: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
            >
              {CADENCE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Default Max Attempts</label>
              <input
                type="number"
                value={settings.defaultMaxAttempts}
                onChange={(e) => setSettings({ ...settings, defaultMaxAttempts: parseInt(e.target.value) })}
                min="1"
                max="20"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Default Cooldown (Days)</label>
              <input
                type="number"
                value={settings.defaultCooldownDays}
                onChange={(e) => setSettings({ ...settings, defaultCooldownDays: parseInt(e.target.value) })}
                min="1"
                max="90"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200 pt-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Agent Settings</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Wrap-Up Time (seconds)</label>
              <input
                type="number"
                value={settings.wrapUpTime}
                onChange={(e) => setSettings({ ...settings, wrapUpTime: parseInt(e.target.value) })}
                min="0"
                max="300"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">Time allowed for disposition after call ends</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">After-Call Work Time (seconds)</label>
              <input
                type="number"
                value={settings.afterCallWorkTime}
                onChange={(e) => setSettings({ ...settings, afterCallWorkTime: parseInt(e.target.value) })}
                min="0"
                max="600"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">Maximum time for notes/actions after disposition</p>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200 pt-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">List Refresh Settings</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Auto-Refresh Interval (minutes)</label>
            <select
              value={settings.autoRefreshInterval}
              onChange={(e) => setSettings({ ...settings, autoRefreshInterval: parseInt(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
            >
              <option value="0">Disabled</option>
              <option value="15">Every 15 minutes</option>
              <option value="30">Every 30 minutes</option>
              <option value="60">Every hour</option>
              <option value="120">Every 2 hours</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">How often dynamic lists are automatically refreshed</p>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <button
          onClick={handleSave}
          className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90 transition-opacity"
        >
          <Save className="w-4 h-4 mr-2" />
          Save Settings
        </button>
      </div>
    </div>
  );
}

// Filter field options based on target object
const LEAD_FILTER_FIELDS = [
  { field: 'status', label: 'Lead Status', type: 'select', options: ['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'NURTURING'] },
  { field: 'source', label: 'Lead Source', type: 'select', options: ['Web', 'Phone', 'Referral', 'Marketing Campaign', 'Self-Gen', 'Door Knock'] },
  { field: 'workType', label: 'Work Type', type: 'select', options: ['Insurance', 'Retail', 'Commercial'] },
  { field: 'disposition', label: 'Disposition', type: 'select', options: ['NOT_CONTACTED', 'NO_ANSWER', 'LEFT_VOICEMAIL', 'CALLBACK_REQUESTED', 'NOT_INTERESTED', 'APPOINTMENT_SET'] },
  { field: 'leadScore', label: 'Lead Score', type: 'range', min: 0, max: 100 },
  { field: 'leadRank', label: 'Lead Rank', type: 'select', options: ['A', 'B', 'C', 'D', 'F'] },
  { field: 'leadAge', label: 'Lead Age (Days)', type: 'range', min: 0, max: 365 },
  { field: 'attemptCount', label: 'Call Attempts', type: 'range', min: 0, max: 20 },
  { field: 'hasPhone', label: 'Has Phone Number', type: 'boolean' },
  { field: 'hasEmail', label: 'Has Email', type: 'boolean' },
  { field: 'isSelfGen', label: 'Self-Gen Lead', type: 'boolean' },
];

const JOB_FILTER_FIELDS = [
  { field: 'stage', label: 'Stage', type: 'select', options: ['LEAD_UNASSIGNED', 'LEAD_ASSIGNED', 'SCHEDULED', 'INSPECTED', 'CLAIM_FILED', 'ADJUSTER_MEETING_COMPLETE', 'APPROVED', 'CONTRACT_SIGNED', 'IN_PRODUCTION', 'COMPLETED', 'CLOSED_WON', 'CLOSED_LOST'] },
  { field: 'status', label: 'Status', type: 'text' },
  { field: 'workType', label: 'Work Type', type: 'select', options: ['Insurance', 'Retail', 'Commercial'] },
  { field: 'amount', label: 'Amount ($)', type: 'range', min: 0, max: 100000 },
  { field: 'isPandaClaims', label: 'Panda Claims', type: 'boolean' },
  { field: 'specsPrepped', label: 'Specs Prepared', type: 'boolean' },
  { field: 'daysInStage', label: 'Days in Stage', type: 'range', min: 0, max: 90 },
  { field: 'hasAppointment', label: 'Has Appointment', type: 'boolean' },
];

const CONTACT_FILTER_FIELDS = [
  { field: 'hasPhone', label: 'Has Phone', type: 'boolean' },
  { field: 'hasEmail', label: 'Has Email', type: 'boolean' },
  { field: 'contactType', label: 'Contact Type', type: 'select', options: ['Primary', 'Secondary', 'Billing', 'Technical'] },
];

// Operator options
const OPERATORS = {
  equals: { label: 'equals', jsonKey: 'equals' },
  notEquals: { label: 'does not equal', jsonKey: 'not' },
  in: { label: 'is any of', jsonKey: 'in' },
  notIn: { label: 'is not any of', jsonKey: 'notIn' },
  gt: { label: 'greater than', jsonKey: 'gt' },
  gte: { label: 'greater than or equal', jsonKey: 'gte' },
  lt: { label: 'less than', jsonKey: 'lt' },
  lte: { label: 'less than or equal', jsonKey: 'lte' },
  contains: { label: 'contains', jsonKey: 'contains' },
  startsWith: { label: 'starts with', jsonKey: 'startsWith' },
};

// Parse JSON filter criteria into wizard rules
function parseFilterToRules(filterCriteria, targetObject) {
  const rules = [];
  if (!filterCriteria || typeof filterCriteria !== 'object') return rules;

  const fieldDefs = targetObject === 'Opportunity' ? JOB_FILTER_FIELDS :
                    targetObject === 'Contact' ? CONTACT_FILTER_FIELDS : LEAD_FILTER_FIELDS;

  const parseCondition = (obj, isNot = false) => {
    Object.entries(obj).forEach(([key, value]) => {
      if (key === 'NOT' && typeof value === 'object') {
        parseCondition(value, true);
      } else if (key === 'AND' || key === 'OR') {
        // Skip compound operators for now, parse their contents
        if (Array.isArray(value)) {
          value.forEach(item => parseCondition(item, isNot));
        }
      } else {
        const fieldDef = fieldDefs.find(f => f.field === key);
        if (fieldDef) {
          if (typeof value === 'object' && value !== null) {
            // Has operator
            Object.entries(value).forEach(([op, val]) => {
              rules.push({
                id: Date.now() + Math.random(),
                field: key,
                operator: isNot && op === 'in' ? 'notIn' : op,
                value: Array.isArray(val) ? val : val,
                isNot,
              });
            });
          } else {
            // Direct value (equals)
            rules.push({
              id: Date.now() + Math.random(),
              field: key,
              operator: isNot ? 'notEquals' : 'equals',
              value: value,
              isNot: false,
            });
          }
        }
      }
    });
  };

  parseCondition(filterCriteria);
  return rules;
}

// Convert wizard rules back to JSON filter criteria
function rulesToFilterJson(rules) {
  if (!rules || rules.length === 0) return {};

  const result = {};
  const notConditions = {};

  rules.forEach(rule => {
    if (!rule.field || rule.value === '' || rule.value === null || rule.value === undefined) return;

    let condition;
    if (rule.operator === 'equals') {
      condition = rule.value;
    } else if (rule.operator === 'notEquals') {
      condition = { not: rule.value };
    } else if (rule.operator === 'in') {
      condition = { in: Array.isArray(rule.value) ? rule.value : [rule.value] };
    } else if (rule.operator === 'notIn') {
      // notIn goes inside NOT block
      if (!notConditions[rule.field]) {
        notConditions[rule.field] = { in: [] };
      }
      const values = Array.isArray(rule.value) ? rule.value : [rule.value];
      notConditions[rule.field].in.push(...values);
      return;
    } else {
      condition = { [rule.operator]: rule.value };
    }

    result[rule.field] = condition;
  });

  // Add NOT conditions if any
  if (Object.keys(notConditions).length > 0) {
    result.NOT = notConditions;
  }

  return result;
}

// Call List Modal
function CallListModal({ list, allLists, onSave, onClose, saving }) {
  const [filterMode, setFilterMode] = useState('wizard'); // 'wizard' or 'json'
  const [filterRules, setFilterRules] = useState(() => {
    if (list?.filterCriteria) {
      return parseFilterToRules(list.filterCriteria, list.targetObject || 'Lead');
    }
    return [];
  });

  const [form, setForm] = useState({
    name: list?.name || '',
    description: list?.description || '',
    listType: list?.listType || 'DYNAMIC',
    targetObject: list?.targetObject || 'Lead',
    cadenceType: list?.cadenceType || 'PREVIEW',
    cadenceHours: list?.cadenceHours || 4,
    maxAttempts: list?.maxAttempts || 6,
    cooldownDays: list?.cooldownDays || 7,
    priority: list?.priority || 50,
    states: list?.states || [],
    isActive: list?.isActive ?? true,
    filterCriteria: list?.filterCriteria ? JSON.stringify(list.filterCriteria, null, 2) : '{}',
  });

  const [errors, setErrors] = useState({});

  // Get filter fields based on target object
  const getFilterFields = () => {
    if (form.targetObject === 'Opportunity') return JOB_FILTER_FIELDS;
    if (form.targetObject === 'Contact') return CONTACT_FILTER_FIELDS;
    return LEAD_FILTER_FIELDS;
  };

  // Sync wizard rules to JSON when rules change
  useEffect(() => {
    if (filterMode === 'wizard') {
      const json = rulesToFilterJson(filterRules);
      setForm(f => ({ ...f, filterCriteria: JSON.stringify(json, null, 2) }));
    }
  }, [filterRules, filterMode]);

  // Add a new filter rule
  const addFilterRule = () => {
    const fields = getFilterFields();
    setFilterRules([...filterRules, {
      id: Date.now(),
      field: fields[0]?.field || '',
      operator: 'equals',
      value: '',
    }]);
  };

  // Update a filter rule
  const updateFilterRule = (id, updates) => {
    setFilterRules(filterRules.map(rule =>
      rule.id === id ? { ...rule, ...updates } : rule
    ));
  };

  // Remove a filter rule
  const removeFilterRule = (id) => {
    setFilterRules(filterRules.filter(rule => rule.id !== id));
  };

  // Handle target object change - reset filter rules
  const handleTargetObjectChange = (newTarget) => {
    setForm({ ...form, targetObject: newTarget });
    setFilterRules([]);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // Validate
    const newErrors = {};
    if (!form.name.trim()) newErrors.name = 'Name is required';

    try {
      JSON.parse(form.filterCriteria);
    } catch (err) {
      newErrors.filterCriteria = 'Invalid JSON';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const data = {
      ...form,
      filterCriteria: JSON.parse(form.filterCriteria),
      cadenceHours: parseInt(form.cadenceHours),
      maxAttempts: parseInt(form.maxAttempts),
      cooldownDays: parseInt(form.cooldownDays),
      priority: parseInt(form.priority),
    };

    if (list?.id) {
      data.id = list.id;
    }

    onSave(data);
  };

  const toggleState = (state) => {
    setForm({
      ...form,
      states: form.states.includes(state)
        ? form.states.filter(s => s !== state)
        : [...form.states, state]
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />

        <div className="relative bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                {list ? 'Edit Call List' : 'New Call List'}
              </h2>
              <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">List Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent ${
                    errors.name ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="e.g., Hot Leads"
                />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows="2"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  placeholder="Describe this list..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">List Type</label>
                  <select
                    value={form.listType}
                    onChange={(e) => setForm({ ...form, listType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  >
                    {LIST_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target Module</label>
                  <select
                    value={form.targetObject}
                    onChange={(e) => handleTargetObjectChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  >
                    <option value="Lead">Lead</option>
                    <option value="Opportunity">Job</option>
                    <option value="Contact">Contact</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Cadence Settings */}
            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">Cadence Settings</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dialer Mode</label>
                  <select
                    value={form.cadenceType}
                    onChange={(e) => setForm({ ...form, cadenceType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  >
                    {CADENCE_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cadence (Hours)</label>
                  <input
                    type="number"
                    value={form.cadenceHours}
                    onChange={(e) => setForm({ ...form, cadenceHours: e.target.value })}
                    min="1"
                    max="168"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Attempts</label>
                  <input
                    type="number"
                    value={form.maxAttempts}
                    onChange={(e) => setForm({ ...form, maxAttempts: e.target.value })}
                    min="1"
                    max="20"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cooldown (Days)</label>
                  <input
                    type="number"
                    value={form.cooldownDays}
                    onChange={(e) => setForm({ ...form, cooldownDays: e.target.value })}
                    min="1"
                    max="90"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* States */}
            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">States (Optional)</h3>
              <div className="flex flex-wrap gap-2">
                {STATE_OPTIONS.map((state) => (
                  <button
                    key={state}
                    type="button"
                    onClick={() => toggleState(state)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      form.states.includes(state)
                        ? 'bg-panda-primary text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {state}
                  </button>
                ))}
              </div>
            </div>

            {/* Filter Criteria (for Dynamic lists) */}
            {form.listType === 'DYNAMIC' && (
              <div className="border-t border-gray-200 pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-gray-900">Filter Criteria</h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFilterMode('wizard')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        filterMode === 'wizard'
                          ? 'bg-panda-primary text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Wizard
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterMode('json')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        filterMode === 'json'
                          ? 'bg-panda-primary text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      JSON
                    </button>
                  </div>
                </div>

                {filterMode === 'wizard' ? (
                  <div className="space-y-3">
                    {filterRules.length === 0 ? (
                      <div className="text-center py-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                        <Filter className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-gray-500 mb-3">No filters defined</p>
                        <button
                          type="button"
                          onClick={addFilterRule}
                          className="inline-flex items-center px-3 py-1.5 bg-panda-primary text-white text-sm rounded-lg hover:bg-panda-secondary transition-colors"
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Add Filter Rule
                        </button>
                      </div>
                    ) : (
                      <>
                        {filterRules.map((rule, index) => {
                          const fields = getFilterFields();
                          const fieldDef = fields.find(f => f.field === rule.field);

                          return (
                            <div key={rule.id} className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg">
                              <span className="text-xs text-gray-500 pt-2 min-w-[40px]">
                                {index === 0 ? 'Where' : 'AND'}
                              </span>

                              {/* Field Select */}
                              <select
                                value={rule.field}
                                onChange={(e) => updateFilterRule(rule.id, { field: e.target.value, value: '' })}
                                className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                              >
                                {fields.map(f => (
                                  <option key={f.field} value={f.field}>{f.label}</option>
                                ))}
                              </select>

                              {/* Operator Select */}
                              <select
                                value={rule.operator}
                                onChange={(e) => updateFilterRule(rule.id, { operator: e.target.value })}
                                className="w-36 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                              >
                                {fieldDef?.type === 'boolean' ? (
                                  <>
                                    <option value="equals">is</option>
                                  </>
                                ) : fieldDef?.type === 'range' ? (
                                  <>
                                    <option value="equals">equals</option>
                                    <option value="gt">greater than</option>
                                    <option value="gte">at least</option>
                                    <option value="lt">less than</option>
                                    <option value="lte">at most</option>
                                  </>
                                ) : fieldDef?.type === 'select' ? (
                                  <>
                                    <option value="equals">equals</option>
                                    <option value="notEquals">does not equal</option>
                                    <option value="in">is any of</option>
                                    <option value="notIn">is not any of</option>
                                  </>
                                ) : (
                                  <>
                                    <option value="equals">equals</option>
                                    <option value="notEquals">does not equal</option>
                                    <option value="contains">contains</option>
                                    <option value="startsWith">starts with</option>
                                  </>
                                )}
                              </select>

                              {/* Value Input */}
                              {fieldDef?.type === 'boolean' ? (
                                <select
                                  value={rule.value === true || rule.value === 'true' ? 'true' : 'false'}
                                  onChange={(e) => updateFilterRule(rule.id, { value: e.target.value === 'true' })}
                                  className="w-24 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                                >
                                  <option value="true">Yes</option>
                                  <option value="false">No</option>
                                </select>
                              ) : fieldDef?.type === 'select' && (rule.operator === 'in' || rule.operator === 'notIn') ? (
                                <div className="flex-1">
                                  <div className="flex flex-wrap gap-1">
                                    {fieldDef.options.map(opt => {
                                      const selected = Array.isArray(rule.value) ? rule.value.includes(opt) : rule.value === opt;
                                      return (
                                        <button
                                          key={opt}
                                          type="button"
                                          onClick={() => {
                                            const currentValues = Array.isArray(rule.value) ? rule.value : (rule.value ? [rule.value] : []);
                                            const newValues = selected
                                              ? currentValues.filter(v => v !== opt)
                                              : [...currentValues, opt];
                                            updateFilterRule(rule.id, { value: newValues });
                                          }}
                                          className={`px-2 py-0.5 text-xs rounded ${
                                            selected
                                              ? 'bg-panda-primary text-white'
                                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                          }`}
                                        >
                                          {opt}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : fieldDef?.type === 'select' ? (
                                <select
                                  value={rule.value || ''}
                                  onChange={(e) => updateFilterRule(rule.id, { value: e.target.value })}
                                  className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                                >
                                  <option value="">Select...</option>
                                  {fieldDef.options.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                  ))}
                                </select>
                              ) : fieldDef?.type === 'range' ? (
                                <input
                                  type="number"
                                  value={rule.value || ''}
                                  onChange={(e) => updateFilterRule(rule.id, { value: parseInt(e.target.value) || '' })}
                                  min={fieldDef.min}
                                  max={fieldDef.max}
                                  placeholder={`${fieldDef.min}-${fieldDef.max}`}
                                  className="w-24 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                                />
                              ) : (
                                <input
                                  type="text"
                                  value={rule.value || ''}
                                  onChange={(e) => updateFilterRule(rule.id, { value: e.target.value })}
                                  placeholder="Value..."
                                  className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                                />
                              )}

                              {/* Remove Button */}
                              <button
                                type="button"
                                onClick={() => removeFilterRule(rule.id)}
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          );
                        })}
                        <button
                          type="button"
                          onClick={addFilterRule}
                          className="inline-flex items-center px-3 py-1.5 text-sm text-panda-primary hover:bg-panda-primary/10 rounded-lg transition-colors"
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Add Another Filter
                        </button>
                      </>
                    )}

                    {/* Preview of generated JSON */}
                    <div className="mt-4 p-3 bg-gray-100 rounded-lg">
                      <p className="text-xs text-gray-500 mb-1">Generated Filter (Preview)</p>
                      <pre className="text-xs text-gray-600 overflow-x-auto">
                        {form.filterCriteria || '{}'}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <>
                    <textarea
                      value={form.filterCriteria}
                      onChange={(e) => setForm({ ...form, filterCriteria: e.target.value })}
                      rows="8"
                      className={`w-full px-3 py-2 border rounded-lg font-mono text-sm focus:ring-2 focus:ring-panda-primary focus:border-transparent ${
                        errors.filterCriteria ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder='{"status": "NEW", "leadAge": {"max": 4}}'
                    />
                    {errors.filterCriteria && <p className="text-red-500 text-xs mt-1">{errors.filterCriteria}</p>}
                    <p className="text-xs text-gray-500 mt-2">
                      Enter Prisma-compatible filter JSON. Use the Wizard mode for a guided experience.
                    </p>
                  </>
                )}
              </div>
            )}

            {/* Priority & Active */}
            <div className="border-t border-gray-200 pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority (1-100)</label>
                    <input
                      type="number"
                      value={form.priority}
                      onChange={(e) => setForm({ ...form, priority: e.target.value })}
                      min="1"
                      max="100"
                      className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                    />
                  </div>
                </div>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                    className="w-4 h-4 text-panda-primary rounded focus:ring-panda-primary"
                  />
                  <span className="text-sm font-medium text-gray-700">Active</span>
                </label>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    {list ? 'Update List' : 'Create List'}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// Disposition Modal
function DispositionModal({ disposition, allLists, onSave, onClose, saving }) {
  const [form, setForm] = useState({
    code: disposition?.code || '',
    name: disposition?.name || '',
    category: disposition?.category || 'OTHER',
    displayOrder: disposition?.displayOrder || 0,
    isActive: disposition?.isActive ?? true,
    removeFromList: disposition?.removeFromList || false,
    moveToListId: disposition?.moveToListId || '',
    updateLeadStatus: disposition?.updateLeadStatus || '',
    scheduleCallback: disposition?.scheduleCallback || false,
    addToDNC: disposition?.addToDNC || false,
  });

  const [errors, setErrors] = useState({});

  const handleSubmit = (e) => {
    e.preventDefault();

    const newErrors = {};
    if (!form.code.trim()) newErrors.code = 'Code is required';
    if (!form.name.trim()) newErrors.name = 'Name is required';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const data = {
      ...form,
      displayOrder: parseInt(form.displayOrder),
    };

    if (disposition?.id) {
      data.id = disposition.id;
    }

    onSave(data);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />

        <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                {disposition ? 'Edit Disposition' : 'New Disposition'}
              </h2>
              <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/\s/g, '_') })}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent ${
                      errors.code ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="APPT_SET"
                  />
                  {errors.code && <p className="text-red-500 text-xs mt-1">{errors.code}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  >
                    {DISPOSITION_CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent ${
                    errors.name ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="Appointment Set"
                />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
              </div>
            </div>

            {/* Automated Actions */}
            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">Automated Actions</h3>
              <div className="space-y-4">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.removeFromList}
                    onChange={(e) => setForm({ ...form, removeFromList: e.target.checked })}
                    className="w-4 h-4 text-panda-primary rounded focus:ring-panda-primary"
                  />
                  <span className="text-sm text-gray-700">Remove from current list after disposition</span>
                </label>

                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.scheduleCallback}
                    onChange={(e) => setForm({ ...form, scheduleCallback: e.target.checked })}
                    className="w-4 h-4 text-panda-primary rounded focus:ring-panda-primary"
                  />
                  <span className="text-sm text-gray-700">Prompt to schedule callback</span>
                </label>

                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.addToDNC}
                    onChange={(e) => setForm({ ...form, addToDNC: e.target.checked })}
                    className="w-4 h-4 text-panda-primary rounded focus:ring-panda-primary"
                  />
                  <span className="text-sm text-gray-700">Add to Do Not Call list</span>
                </label>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Move to List</label>
                  <select
                    value={form.moveToListId}
                    onChange={(e) => setForm({ ...form, moveToListId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  >
                    <option value="">Don't move</option>
                    {allLists.map((list) => (
                      <option key={list.id} value={list.id}>{list.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Update Lead Status</label>
                  <select
                    value={form.updateLeadStatus}
                    onChange={(e) => setForm({ ...form, updateLeadStatus: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  >
                    <option value="">Don't change</option>
                    <option value="CONTACTED">Contacted</option>
                    <option value="QUALIFIED">Qualified</option>
                    <option value="UNQUALIFIED">Unqualified</option>
                    <option value="NURTURING">Nurturing</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Display Order & Active */}
            <div className="border-t border-gray-200 pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Display Order</label>
                  <input
                    type="number"
                    value={form.displayOrder}
                    onChange={(e) => setForm({ ...form, displayOrder: e.target.value })}
                    min="0"
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  />
                </div>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                    className="w-4 h-4 text-panda-primary rounded focus:ring-panda-primary"
                  />
                  <span className="text-sm font-medium text-gray-700">Active</span>
                </label>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    {disposition ? 'Update Disposition' : 'Create Disposition'}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
