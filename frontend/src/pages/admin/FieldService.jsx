import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MapPin,
  Clock,
  Wrench,
  Users,
  Settings,
  FileText,
  Award,
  Search,
  Plus,
  Edit2,
  Trash2,
  X,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Filter,
  Calendar,
  User,
  Building2,
  AlertCircle,
  CheckCircle,
  Eye,
  ToggleLeft,
  ToggleRight,
  Loader2,
  CloudOff,
  Download,
} from 'lucide-react';
import { fieldServiceApi } from '../../services/api';

// Tab Configuration
const TABS = [
  { id: 'territories', label: 'Territories', icon: MapPin, count: 'territoriesCount' },
  { id: 'operatingHours', label: 'Operating Hours', icon: Clock, count: 'operatingHoursCount' },
  { id: 'workTypes', label: 'Work Types', icon: Wrench, count: 'workTypesCount' },
  { id: 'resources', label: 'Service Resources', icon: Users, count: 'resourcesCount' },
  { id: 'policies', label: 'Scheduling Policies', icon: Settings, count: 'policiesCount' },
  { id: 'workRules', label: 'Work Rules', icon: FileText, count: 'workRulesCount' },
  { id: 'skills', label: 'Skills', icon: Award, count: 'skillsCount' },
];

// Resource Type Labels
const RESOURCE_TYPES = {
  T: { label: 'Technician', color: 'bg-blue-100 text-blue-700' },
  C: { label: 'Crew', color: 'bg-purple-100 text-purple-700' },
  D: { label: 'Dispatcher', color: 'bg-orange-100 text-orange-700' },
  A: { label: 'Agent', color: 'bg-green-100 text-green-700' },
};

// Helper Components
const StatCard = ({ icon: Icon, label, value, color }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
    <div className="flex items-center space-x-3">
      <div className={`p-2.5 rounded-lg ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  </div>
);

const Badge = ({ children, color = 'bg-gray-100 text-gray-700' }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
    {children}
  </span>
);

const ActiveBadge = ({ isActive }) => (
  <Badge color={isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
    {isActive ? 'Active' : 'Inactive'}
  </Badge>
);

const LoadingSpinner = () => (
  <div className="flex items-center justify-center p-8">
    <Loader2 className="w-8 h-8 animate-spin text-panda-primary" />
  </div>
);

const EmptyState = ({ icon: Icon, title, description }) => (
  <div className="text-center py-12">
    <Icon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
    <h3 className="text-lg font-medium text-gray-900 mb-1">{title}</h3>
    <p className="text-gray-500">{description}</p>
  </div>
);

// Territories Tab
const TerritoriesTab = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedTerritories, setExpandedTerritories] = useState({});
  const [selectedTerritory, setSelectedTerritory] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['territories'],
    queryFn: () => fieldServiceApi.getTerritories(),
  });

  const territories = data?.data || [];

  // Build hierarchy
  const rootTerritories = territories.filter(t => !t.parentTerritoryId);
  const childrenMap = territories.reduce((acc, t) => {
    if (t.parentTerritoryId) {
      if (!acc[t.parentTerritoryId]) acc[t.parentTerritoryId] = [];
      acc[t.parentTerritoryId].push(t);
    }
    return acc;
  }, {});

  const filteredTerritories = searchTerm
    ? territories.filter(t => t.name?.toLowerCase().includes(searchTerm.toLowerCase()))
    : rootTerritories;

  const toggleExpand = (id) => {
    setExpandedTerritories(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const renderTerritory = (territory, depth = 0) => {
    const children = childrenMap[territory.id] || [];
    const hasChildren = children.length > 0;
    const isExpanded = expandedTerritories[territory.id];

    return (
      <div key={territory.id}>
        <div
          className={`flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100`}
          style={{ paddingLeft: `${1 + depth * 1.5}rem` }}
          onClick={() => setSelectedTerritory(territory)}
        >
          {hasChildren ? (
            <button
              onClick={(e) => { e.stopPropagation(); toggleExpand(territory.id); }}
              className="p-1 hover:bg-gray-200 rounded mr-2"
            >
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          ) : (
            <span className="w-6 mr-2" />
          )}
          <MapPin className="w-4 h-4 text-gray-400 mr-3" />
          <div className="flex-1">
            <p className="font-medium text-gray-900">{territory.name}</p>
            <p className="text-sm text-gray-500">{territory.operatingHoursName || 'No operating hours set'}</p>
          </div>
          <ActiveBadge isActive={territory.isActive} />
        </div>
        {isExpanded && children.map(child => renderTerritory(child, depth + 1))}
      </div>
    );
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex items-center space-x-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search territories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
          />
        </div>
        <button
          onClick={() => refetch()}
          className="p-2.5 border border-gray-200 rounded-lg hover:bg-gray-50"
          title="Refresh"
        >
          <RefreshCw className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Territory Tree */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
          <h3 className="font-medium text-gray-900">Territory Hierarchy</h3>
          <p className="text-sm text-gray-500">{territories.length} territories</p>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          {filteredTerritories.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title="No territories found"
              description="No territories match your search criteria."
            />
          ) : (
            filteredTerritories.map(t => renderTerritory(t))
          )}
        </div>
      </div>

      {/* Territory Detail Panel */}
      {selectedTerritory && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{selectedTerritory.name}</h3>
              <p className="text-sm text-gray-500">ID: {selectedTerritory.id}</p>
            </div>
            <button
              onClick={() => setSelectedTerritory(null)}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-500">Status</label>
              <p className="font-medium"><ActiveBadge isActive={selectedTerritory.isActive} /></p>
            </div>
            <div>
              <label className="text-sm text-gray-500">Operating Hours</label>
              <p className="font-medium">{selectedTerritory.operatingHoursName || '-'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">Address</label>
              <p className="font-medium">{selectedTerritory.address || '-'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">City, State</label>
              <p className="font-medium">
                {[selectedTerritory.city, selectedTerritory.state].filter(Boolean).join(', ') || '-'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Operating Hours Tab
const OperatingHoursTab = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['operatingHours'],
    queryFn: () => fieldServiceApi.getOperatingHours(),
  });

  const items = data?.data || [];
  const filtered = searchTerm
    ? items.filter(item => item.name?.toLowerCase().includes(searchTerm.toLowerCase()))
    : items;

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search operating hours..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
          />
        </div>
        <button
          onClick={() => refetch()}
          className="p-2.5 border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time Zone</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                  No operating hours found
                </td>
              </tr>
            ) : (
              filtered.map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center">
                      <Clock className="w-4 h-4 text-gray-400 mr-2" />
                      <span className="font-medium text-gray-900">{item.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{item.description || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{item.timeZone || 'America/New_York'}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelectedItem(item)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Work Types Tab
const WorkTypesTab = () => {
  const [searchTerm, setSearchTerm] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['workTypes'],
    queryFn: () => fieldServiceApi.getWorkTypes(),
  });

  const items = data?.data || [];
  const filtered = searchTerm
    ? items.filter(item => item.name?.toLowerCase().includes(searchTerm.toLowerCase()))
    : items;

  // Group by category (using first word or prefix)
  const grouped = filtered.reduce((acc, item) => {
    const category = item.name?.split(' ')[0] || 'Other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {});

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search work types..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
          />
        </div>
        <button
          onClick={() => refetch()}
          className="p-2.5 border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Work Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Operating Hours</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                  No work types found
                </td>
              </tr>
            ) : (
              filtered.map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center">
                      <Wrench className="w-4 h-4 text-gray-400 mr-2" />
                      <span className="font-medium text-gray-900">{item.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {item.estimatedDuration ? `${item.estimatedDuration} min` : '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {item.operatingHoursName || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <ActiveBadge isActive={item.isActive !== false} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Service Resources Tab
const ServiceResourcesTab = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [selectedResource, setSelectedResource] = useState(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['serviceResources', typeFilter, activeFilter],
    queryFn: () => fieldServiceApi.getServiceResources({
      resourceType: typeFilter || undefined,
      isActive: activeFilter === '' ? undefined : activeFilter === 'true',
    }),
  });

  const items = data?.data || [];
  const filtered = searchTerm
    ? items.filter(item => item.name?.toLowerCase().includes(searchTerm.toLowerCase()))
    : items;

  // Stats
  const activeCount = items.filter(r => r.isActive).length;
  const techCount = items.filter(r => r.resourceType === 'T').length;
  const crewCount = items.filter(r => r.resourceType === 'C').length;

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard icon={Users} label="Total Resources" value={items.length} color="bg-blue-100 text-blue-600" />
        <StatCard icon={CheckCircle} label="Active" value={activeCount} color="bg-green-100 text-green-600" />
        <StatCard icon={User} label="Technicians" value={techCount} color="bg-purple-100 text-purple-600" />
        <StatCard icon={Building2} label="Crews" value={crewCount} color="bg-orange-100 text-orange-600" />
      </div>

      {/* Filters */}
      <div className="flex items-center space-x-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search resources..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 outline-none bg-white"
        >
          <option value="">All Types</option>
          <option value="T">Technicians</option>
          <option value="C">Crews</option>
        </select>
        <select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value)}
          className="px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 outline-none bg-white"
        >
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        <button
          onClick={() => refetch()}
          className="p-2.5 border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Resource</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Related User</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    No resources found
                  </td>
                </tr>
              ) : (
                filtered.map(item => {
                  const typeConfig = RESOURCE_TYPES[item.resourceType] || RESOURCE_TYPES.T;
                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-panda-primary to-panda-secondary flex items-center justify-center text-white text-sm font-medium">
                            {item.name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?'}
                          </div>
                          <span className="ml-3 font-medium text-gray-900">{item.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge color={typeConfig.color}>{typeConfig.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{item.relatedUserName || '-'}</td>
                      <td className="px-4 py-3">
                        <ActiveBadge isActive={item.isActive} />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelectedResource(item)}
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedResource && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Resource Details</h2>
                <button onClick={() => setSelectedResource(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-r from-panda-primary to-panda-secondary flex items-center justify-center text-white text-xl font-bold">
                  {selectedResource.name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?'}
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{selectedResource.name}</h3>
                  <p className="text-gray-500">
                    <Badge color={RESOURCE_TYPES[selectedResource.resourceType]?.color}>
                      {RESOURCE_TYPES[selectedResource.resourceType]?.label}
                    </Badge>
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-500">Status</label>
                  <p className="font-medium"><ActiveBadge isActive={selectedResource.isActive} /></p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Related User</label>
                  <p className="font-medium">{selectedResource.relatedUserName || '-'}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Salesforce ID</label>
                  <p className="font-medium text-xs">{selectedResource.id}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Capacity-Based</label>
                  <p className="font-medium">{selectedResource.isCapacityBased ? 'Yes' : 'No'}</p>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setSelectedResource(null)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Scheduling Policies Tab
const SchedulingPoliciesTab = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPolicy, setSelectedPolicy] = useState(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['schedulingPolicies'],
    queryFn: () => fieldServiceApi.getSchedulingPolicies(),
  });

  const items = data?.data || [];
  const filtered = searchTerm
    ? items.filter(item => item.name?.toLowerCase().includes(searchTerm.toLowerCase()))
    : items;

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search policies..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
          />
        </div>
        <button
          onClick={() => refetch()}
          className="p-2.5 border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <div className="col-span-full">
            <EmptyState
              icon={Settings}
              title="No policies found"
              description="No scheduling policies match your search criteria."
            />
          </div>
        ) : (
          filtered.map(policy => (
            <div
              key={policy.id}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:border-panda-primary/30 cursor-pointer transition-colors"
              onClick={() => setSelectedPolicy(policy)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center">
                  <Settings className="w-5 h-5 text-panda-primary mr-2" />
                  <h3 className="font-semibold text-gray-900">{policy.name}</h3>
                </div>
                <ActiveBadge isActive={policy.isActive !== false} />
              </div>
              <p className="text-sm text-gray-500 mb-3 line-clamp-2">
                {policy.description || 'No description'}
              </p>
              <div className="flex items-center text-xs text-gray-400">
                <FileText className="w-3 h-3 mr-1" />
                {policy.workRuleCount || 0} work rules
              </div>
            </div>
          ))
        )}
      </div>

      {/* Policy Detail Modal */}
      {selectedPolicy && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">{selectedPolicy.name}</h2>
                <button onClick={() => setSelectedPolicy(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm text-gray-500">Description</label>
                <p className="text-gray-900">{selectedPolicy.description || 'No description'}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-500">Status</label>
                  <p><ActiveBadge isActive={selectedPolicy.isActive !== false} /></p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Respect Priorities</label>
                  <p className="font-medium">{selectedPolicy.respectPriorities ? 'Yes' : 'No'}</p>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setSelectedPolicy(null)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Work Rules Tab
const WorkRulesTab = () => {
  const [searchTerm, setSearchTerm] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['workRules'],
    queryFn: () => fieldServiceApi.getWorkRules(),
  });

  const items = data?.data || [];
  const filtered = searchTerm
    ? items.filter(item => item.name?.toLowerCase().includes(searchTerm.toLowerCase()))
    : items;

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search work rules..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
          />
        </div>
        <button
          onClick={() => refetch()}
          className="p-2.5 border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rule Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                  No work rules found
                </td>
              </tr>
            ) : (
              filtered.map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center">
                      <FileText className="w-4 h-4 text-gray-400 mr-2" />
                      <span className="font-medium text-gray-900">{item.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge>{item.ruleType || 'Standard'}</Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate">
                    {item.description || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <ActiveBadge isActive={item.isActive !== false} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Skills Tab
const SkillsTab = () => {
  const [searchTerm, setSearchTerm] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['skills'],
    queryFn: () => fieldServiceApi.getSkills(),
  });

  const items = data?.data || [];
  const filtered = searchTerm
    ? items.filter(item => item.name?.toLowerCase().includes(searchTerm.toLowerCase()))
    : items;

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search skills..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
          />
        </div>
        <button
          onClick={() => refetch()}
          className="p-2.5 border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filtered.length === 0 ? (
          <div className="col-span-full">
            <EmptyState
              icon={Award}
              title="No skills found"
              description="No skills match your search criteria."
            />
          </div>
        ) : (
          filtered.map(skill => (
            <div
              key={skill.id}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:border-panda-primary/30 transition-colors"
            >
              <div className="flex items-center mb-2">
                <Award className="w-5 h-5 text-yellow-500 mr-2" />
                <h3 className="font-medium text-gray-900 truncate">{skill.name}</h3>
              </div>
              <p className="text-sm text-gray-500 line-clamp-2">
                {skill.description || 'No description'}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Main Component
export default function FieldService() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('territories');
  const [syncing, setSyncing] = useState(false);

  // Fetch counts for tabs
  const { data: territoriesData } = useQuery({
    queryKey: ['territories'],
    queryFn: () => fieldServiceApi.getTerritories(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: operatingHoursData } = useQuery({
    queryKey: ['operatingHours'],
    queryFn: () => fieldServiceApi.getOperatingHours(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: workTypesData } = useQuery({
    queryKey: ['workTypes'],
    queryFn: () => fieldServiceApi.getWorkTypes(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: resourcesData } = useQuery({
    queryKey: ['serviceResources'],
    queryFn: () => fieldServiceApi.getServiceResources(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: policiesData } = useQuery({
    queryKey: ['schedulingPolicies'],
    queryFn: () => fieldServiceApi.getSchedulingPolicies(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: workRulesData } = useQuery({
    queryKey: ['workRules'],
    queryFn: () => fieldServiceApi.getWorkRules(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: skillsData } = useQuery({
    queryKey: ['skills'],
    queryFn: () => fieldServiceApi.getSkills(),
    staleTime: 5 * 60 * 1000,
  });

  const counts = {
    territoriesCount: territoriesData?.data?.length || 0,
    operatingHoursCount: operatingHoursData?.data?.length || 0,
    workTypesCount: workTypesData?.data?.length || 0,
    resourcesCount: resourcesData?.data?.length || 0,
    policiesCount: policiesData?.data?.length || 0,
    workRulesCount: workRulesData?.data?.length || 0,
    skillsCount: skillsData?.data?.length || 0,
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fieldServiceApi.syncFromSalesforce('all');
      // Invalidate all queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['territories'] });
      queryClient.invalidateQueries({ queryKey: ['operatingHours'] });
      queryClient.invalidateQueries({ queryKey: ['workTypes'] });
      queryClient.invalidateQueries({ queryKey: ['serviceResources'] });
      queryClient.invalidateQueries({ queryKey: ['schedulingPolicies'] });
      queryClient.invalidateQueries({ queryKey: ['workRules'] });
      queryClient.invalidateQueries({ queryKey: ['skills'] });
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setSyncing(false);
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'territories':
        return <TerritoriesTab />;
      case 'operatingHours':
        return <OperatingHoursTab />;
      case 'workTypes':
        return <WorkTypesTab />;
      case 'resources':
        return <ServiceResourcesTab />;
      case 'policies':
        return <SchedulingPoliciesTab />;
      case 'workRules':
        return <WorkRulesTab />;
      case 'skills':
        return <SkillsTab />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Schedule Admin</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage territories, resources, scheduling policies, and more
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {syncing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              Sync from Salesforce
            </>
          )}
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="border-b border-gray-100 overflow-x-auto">
          <nav className="flex min-w-max">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const count = counts[tab.count] || 0;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center px-4 py-3 border-b-2 text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'border-panda-primary text-panda-primary'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4 mr-2" />
                  {tab.label}
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                    isActive ? 'bg-panda-primary/10 text-panda-primary' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-4 sm:p-6">
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
}
