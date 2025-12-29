import { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  Shield,
  Users,
  Edit,
  Trash2,
  ChevronDown,
  ChevronRight,
  Check,
  X,
} from 'lucide-react';
import api from '../../services/api';

const resourceLabels = {
  accounts: 'Accounts',
  contacts: 'Contacts',
  leads: 'Leads',
  opportunities: 'Opportunities',
  quotes: 'Quotes',
  orders: 'Orders',
  invoices: 'Invoices',
  payments: 'Payments',
  workorders: 'Work Orders',
  appointments: 'Appointments',
  commissions: 'Commissions',
  workflows: 'Workflows',
  templates: 'Templates',
  agreements: 'Agreements',
  campaigns: 'Campaigns',
  users: 'Users',
  roles: 'Roles',
  settings: 'Settings',
  reports: 'Reports',
  audit_logs: 'Audit Logs',
  integrations: 'Integrations',
};

const actionLabels = {
  create: 'Create',
  read: 'View',
  update: 'Edit',
  delete: 'Delete',
  export: 'Export',
  approve: 'Approve',
  assign: 'Assign',
};

export default function RolesPermissions() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [expandedResources, setExpandedResources] = useState({});
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadRoles();
  }, []);

  const loadRoles = async () => {
    try {
      // const response = await api.get('/permissions/roles');
      // setRoles(response.data);
      // Mock data
      setRoles([
        {
          id: '1',
          name: 'Super Admin',
          description: 'Full access to all features',
          userCount: 2,
          permissions: {
            accounts: ['create', 'read', 'update', 'delete', 'export', 'assign'],
            contacts: ['create', 'read', 'update', 'delete', 'export'],
            leads: ['create', 'read', 'update', 'delete', 'export', 'assign'],
            opportunities: ['create', 'read', 'update', 'delete', 'export', 'assign'],
            commissions: ['create', 'read', 'update', 'delete', 'approve'],
            workflows: ['create', 'read', 'update', 'delete'],
            users: ['create', 'read', 'update', 'delete'],
            roles: ['create', 'read', 'update', 'delete'],
          },
        },
        {
          id: '2',
          name: 'Sales Manager',
          description: 'Manage sales team and view reports',
          userCount: 5,
          permissions: {
            accounts: ['create', 'read', 'update', 'export', 'assign'],
            contacts: ['create', 'read', 'update', 'export'],
            leads: ['create', 'read', 'update', 'export', 'assign'],
            opportunities: ['create', 'read', 'update', 'export', 'assign'],
            commissions: ['read'],
          },
        },
        {
          id: '3',
          name: 'Sales Rep',
          description: 'Access to own accounts and opportunities',
          userCount: 24,
          permissions: {
            accounts: ['create', 'read', 'update'],
            contacts: ['create', 'read', 'update'],
            leads: ['create', 'read', 'update'],
            opportunities: ['create', 'read', 'update'],
            commissions: ['read'],
          },
        },
        {
          id: '4',
          name: 'Project Manager',
          description: 'Manage projects and field operations',
          userCount: 8,
          permissions: {
            accounts: ['read', 'update'],
            opportunities: ['read', 'update'],
            workorders: ['create', 'read', 'update', 'assign'],
            appointments: ['create', 'read', 'update', 'assign'],
          },
        },
      ]);
    } catch (error) {
      console.error('Failed to load roles:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleResource = (resource) => {
    setExpandedResources(prev => ({
      ...prev,
      [resource]: !prev[resource],
    }));
  };

  const filteredRoles = roles.filter(role =>
    role.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    role.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const RoleCard = ({ role }) => (
    <div
      className={`bg-white rounded-xl shadow-sm border transition-all cursor-pointer ${
        selectedRole?.id === role.id
          ? 'border-panda-primary ring-2 ring-panda-primary/20'
          : 'border-gray-100 hover:border-gray-200'
      }`}
      onClick={() => setSelectedRole(role)}
    >
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-lg ${
              role.name === 'Super Admin' ? 'bg-purple-100' :
              role.name === 'Admin' ? 'bg-blue-100' :
              'bg-gray-100'
            }`}>
              <Shield className={`w-5 h-5 ${
                role.name === 'Super Admin' ? 'text-purple-600' :
                role.name === 'Admin' ? 'text-blue-600' :
                'text-gray-600'
              }`} />
            </div>
            <div>
              <h3 className="font-medium text-gray-900">{role.name}</h3>
              <p className="text-sm text-gray-500">{role.description}</p>
            </div>
          </div>
          <div className="flex items-center space-x-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                // Edit role
              }}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <Edit className="w-4 h-4" />
            </button>
            {role.name !== 'Super Admin' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  // Delete role
                }}
                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        <div className="mt-3 flex items-center text-sm text-gray-500">
          <Users className="w-4 h-4 mr-1" />
          {role.userCount} users
          <span className="mx-2">•</span>
          {Object.keys(role.permissions || {}).length} resources
        </div>
      </div>
    </div>
  );

  const PermissionMatrix = ({ role }) => {
    if (!role) {
      return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <Shield className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Select a role to view permissions</p>
        </div>
      );
    }

    const permissions = role.permissions || {};

    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <h3 className="font-medium text-gray-900">Permissions for {role.name}</h3>
          <p className="text-sm text-gray-500 mt-1">{role.description}</p>
        </div>
        <div className="max-h-[calc(100vh-20rem)] overflow-y-auto">
          {Object.entries(resourceLabels).map(([resource, label]) => (
            <div key={resource} className="border-b border-gray-100 last:border-b-0">
              <button
                onClick={() => toggleResource(resource)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center space-x-2">
                  {expandedResources[resource] ? (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  )}
                  <span className="font-medium text-gray-900">{label}</span>
                </div>
                <div className="flex items-center space-x-1">
                  {(permissions[resource] || []).length > 0 ? (
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                      {(permissions[resource] || []).length} permissions
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs font-medium rounded-full">
                      No access
                    </span>
                  )}
                </div>
              </button>
              {expandedResources[resource] && (
                <div className="px-4 pb-3 pl-10">
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(actionLabels).map(([action, actionLabel]) => {
                      const hasPermission = (permissions[resource] || []).includes(action);
                      return (
                        <label
                          key={action}
                          className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                            hasPermission
                              ? 'bg-green-50 border-green-200 text-green-700'
                              : 'bg-gray-50 border-gray-200 text-gray-500'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={hasPermission}
                            onChange={() => {}}
                            className="rounded border-gray-300 text-panda-primary focus:ring-panda-primary"
                          />
                          <span className="text-sm">{actionLabel}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Roles & Permissions</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage user roles and access permissions
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center justify-center px-4 py-2.5 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-5 h-5 mr-2" />
          <span>Create Role</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search roles..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
        />
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Roles List */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Roles</h2>
          {loading ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
              <div className="animate-spin w-8 h-8 border-2 border-panda-primary border-t-transparent rounded-full mx-auto" />
            </div>
          ) : filteredRoles.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
              <Shield className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No roles found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRoles.map((role) => (
                <RoleCard key={role.id} role={role} />
              ))}
            </div>
          )}
        </div>

        {/* Permissions Matrix */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Permissions</h2>
          <PermissionMatrix role={selectedRole} />
        </div>
      </div>
    </div>
  );
}
