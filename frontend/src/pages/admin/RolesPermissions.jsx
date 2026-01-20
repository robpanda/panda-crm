import { useState, useEffect } from 'react';
import AdminLayout from '../../components/AdminLayout';
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
  Save,
  AlertTriangle,
} from 'lucide-react';
import { rolesApi } from '../../services/api';

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
  mobile_app: 'Mobile App',
};

const actionLabels = {
  create: 'Create',
  read: 'View',
  update: 'Edit',
  delete: 'Delete',
  export: 'Export',
  approve: 'Approve',
  assign: 'Assign',
  access: 'Access',
  knocker_view: 'BDR View',
  sales_view: 'Sales View',
  manager_view: 'Manager View',
  team_stats: 'Team Stats',
};

// Page access labels for management pages
const pageAccessLabels = {
  cases: 'Cases',
  tasks: 'Tasks',
  commissions: 'Commissions',
  invoices: 'Invoices',
  contracts: 'Contracts',
  quotes: 'Quotes',
  appointments: 'Appointments',
  workOrders: 'Work Orders',
};

export default function RolesPermissions() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState(null);
  const [expandedResources, setExpandedResources] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editedPermissions, setEditedPermissions] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [newRoleForm, setNewRoleForm] = useState({ name: '', description: '' });
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadRoles();
  }, []);

  const loadRoles = async () => {
    try {
      const rolesData = await rolesApi.getRoles();
      // Transform the response to match expected format
      // rolesApi.getRoles() returns the array directly
      const transformedRoles = (Array.isArray(rolesData) ? rolesData : []).map(role => ({
        id: role.id,
        name: role.name,
        description: role.description || `${role.name} role`,
        userCount: role.userCount || role._count?.users || 0,
        permissions: role.permissions || role.permissionsJson || {},
      }));
      setRoles(transformedRoles);
    } catch (error) {
      console.error('Failed to load roles:', error);
      // Show error state but don't crash
      setRoles([]);
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

  const handleCreateRole = async () => {
    if (!newRoleForm.name.trim()) {
      setActionError('Role name is required');
      return;
    }
    setIsCreating(true);
    setActionError('');
    try {
      // Initialize with empty permissions for all resources
      const initialPermissions = {};
      Object.keys(resourceLabels).forEach(resource => {
        initialPermissions[resource] = [];
      });
      await rolesApi.createRole({
        name: newRoleForm.name.trim(),
        description: newRoleForm.description.trim(),
        permissions: initialPermissions,
      });
      await loadRoles();
      setShowCreateModal(false);
      setNewRoleForm({ name: '', description: '' });
    } catch (error) {
      setActionError(error.response?.data?.error?.message || error.message || 'Failed to create role');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteRole = async () => {
    if (!roleToDelete) return;
    setIsDeleting(true);
    setActionError('');
    try {
      await rolesApi.deleteRole(roleToDelete.id);
      await loadRoles();
      if (selectedRole?.id === roleToDelete.id) {
        setSelectedRole(null);
      }
      setShowDeleteConfirm(false);
      setRoleToDelete(null);
    } catch (error) {
      setActionError(error.response?.data?.error?.message || error.message || 'Failed to delete role');
    } finally {
      setIsDeleting(false);
    }
  };

  const [editedPageAccess, setEditedPageAccess] = useState({});

  const startEditing = () => {
    if (selectedRole) {
      setEditedPermissions({ ...selectedRole.permissions });
      // Extract page access from permissions.pages or initialize empty
      setEditedPageAccess({ ...(selectedRole.permissions?.pages || {}) });
      setIsEditing(true);
    }
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditedPermissions({});
    setEditedPageAccess({});
    setActionError('');
  };

  const togglePageAccess = (pageId) => {
    setEditedPageAccess(prev => ({
      ...prev,
      [pageId]: !prev[pageId],
    }));
  };

  const togglePermission = (resource, action) => {
    setEditedPermissions(prev => {
      const currentPerms = prev[resource] || [];
      if (currentPerms.includes(action)) {
        return {
          ...prev,
          [resource]: currentPerms.filter(a => a !== action),
        };
      } else {
        return {
          ...prev,
          [resource]: [...currentPerms, action],
        };
      }
    });
  };

  const savePermissions = async () => {
    if (!selectedRole) return;
    setIsSaving(true);
    setActionError('');
    try {
      // Include page access in the permissions object
      const permissionsToSave = {
        ...editedPermissions,
        pages: editedPageAccess,
      };
      await rolesApi.updateRole(selectedRole.id, {
        permissions: permissionsToSave,
      });
      await loadRoles();
      // Update the selected role with new permissions
      setSelectedRole(prev => prev ? { ...prev, permissions: permissionsToSave } : null);
      setIsEditing(false);
      setEditedPermissions({});
      setEditedPageAccess({});
    } catch (error) {
      setActionError(error.response?.data?.error?.message || error.message || 'Failed to save permissions');
    } finally {
      setIsSaving(false);
    }
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
                setSelectedRole(role);
                startEditing();
              }}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
              title="Edit permissions"
            >
              <Edit className="w-4 h-4" />
            </button>
            {role.name !== 'Super Admin' && role.name !== 'super_admin' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setRoleToDelete(role);
                  setShowDeleteConfirm(true);
                  setActionError('');
                }}
                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                title="Delete role"
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

    const permissions = isEditing ? editedPermissions : (role.permissions || {});
    const isProtectedRole = role.name === 'Super Admin' || role.name === 'super_admin';

    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900">Permissions for {role.name}</h3>
              <p className="text-sm text-gray-500 mt-1">{role.description}</p>
            </div>
            {!isProtectedRole && (
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <>
                    <button
                      onClick={cancelEditing}
                      className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={savePermissions}
                      disabled={isSaving}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90 disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={startEditing}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-panda-primary hover:bg-panda-primary/10 rounded-lg"
                  >
                    <Edit className="w-4 h-4" />
                    Edit
                  </button>
                )}
              </div>
            )}
          </div>
          {actionError && isEditing && (
            <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
              <AlertTriangle className="w-4 h-4" />
              {actionError}
            </div>
          )}
        </div>
        <div className="max-h-[calc(100vh-20rem)] overflow-y-auto">
          {/* Page Access Section */}
          <div className="border-b border-gray-100">
            <button
              onClick={() => toggleResource('_pageAccess')}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors bg-blue-50/50"
            >
              <div className="flex items-center space-x-2">
                {expandedResources['_pageAccess'] ? (
                  <ChevronDown className="w-4 h-4 text-blue-500" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-blue-500" />
                )}
                <span className="font-medium text-blue-900">Page Access</span>
                <span className="text-xs text-blue-600 ml-2">(Management Pages)</span>
              </div>
              <div className="flex items-center space-x-1">
                {Object.values(isEditing ? editedPageAccess : (permissions.pages || {})).filter(Boolean).length > 0 ? (
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                    {Object.values(isEditing ? editedPageAccess : (permissions.pages || {})).filter(Boolean).length} pages
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs font-medium rounded-full">
                    No pages
                  </span>
                )}
              </div>
            </button>
            {expandedResources['_pageAccess'] && (
              <div className="px-4 pb-3 pl-10 bg-blue-50/30">
                <p className="text-xs text-gray-500 mb-3">
                  Grant access to management pages. Admins automatically have access to all pages.
                </p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(pageAccessLabels).map(([pageId, pageLabel]) => {
                    const pageAccess = isEditing ? editedPageAccess : (permissions.pages || {});
                    const hasAccess = pageAccess[pageId] === true;
                    return (
                      <label
                        key={pageId}
                        className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border transition-colors ${
                          isEditing && !isProtectedRole ? 'cursor-pointer' : 'cursor-default'
                        } ${
                          hasAccess
                            ? 'bg-blue-50 border-blue-200 text-blue-700'
                            : 'bg-gray-50 border-gray-200 text-gray-500'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={hasAccess}
                          onChange={() => isEditing && !isProtectedRole && togglePageAccess(pageId)}
                          disabled={!isEditing || isProtectedRole}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                        />
                        <span className="text-sm">{pageLabel}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Resource Permissions */}
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
                          className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border transition-colors ${
                            isEditing && !isProtectedRole ? 'cursor-pointer' : 'cursor-default'
                          } ${
                            hasPermission
                              ? 'bg-green-50 border-green-200 text-green-700'
                              : 'bg-gray-50 border-gray-200 text-gray-500'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={hasPermission}
                            onChange={() => isEditing && !isProtectedRole && togglePermission(resource, action)}
                            disabled={!isEditing || isProtectedRole}
                            className="rounded border-gray-300 text-panda-primary focus:ring-panda-primary disabled:opacity-50"
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
    <AdminLayout>
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
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

      {/* Create Role Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">Create New Role</h2>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewRoleForm({ name: '', description: '' });
                    setActionError('');
                  }}
                  className="p-2 hover:bg-gray-100 rounded-full"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              {actionError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  {actionError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role Name *</label>
                <input
                  type="text"
                  value={newRoleForm.name}
                  onChange={(e) => setNewRoleForm({ ...newRoleForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                  placeholder="e.g., Project Manager"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={newRoleForm.description}
                  onChange={(e) => setNewRoleForm({ ...newRoleForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                  placeholder="Describe what this role is for..."
                  rows={3}
                />
              </div>
              <p className="text-sm text-gray-500">
                After creating the role, you can configure its permissions by selecting it and clicking Edit.
              </p>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewRoleForm({ name: '', description: '' });
                  setActionError('');
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateRole}
                disabled={isCreating}
                className="px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
              >
                {isCreating ? 'Creating...' : 'Create Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Role Confirmation Modal */}
      {showDeleteConfirm && roleToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-red-100 rounded-full">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Delete Role</h2>
                  <p className="text-sm text-gray-500">This action cannot be undone</p>
                </div>
              </div>
              {actionError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  {actionError}
                </div>
              )}
              <p className="text-gray-600 mb-2">
                Are you sure you want to delete the role <span className="font-semibold">{roleToDelete.name}</span>?
              </p>
              {roleToDelete.userCount > 0 && (
                <p className="text-amber-600 text-sm mb-4">
                  Warning: This role is currently assigned to {roleToDelete.userCount} user(s). They will need to be reassigned to another role.
                </p>
              )}
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setRoleToDelete(null);
                    setActionError('');
                  }}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteRole}
                  disabled={isDeleting}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  {isDeleting ? 'Deleting...' : 'Delete Role'}
                </button>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
    </AdminLayout>
  );
}
