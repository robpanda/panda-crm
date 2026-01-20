import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { usersApi, rolesApi } from '../../services/api';
import {
  Search,
  Users as UsersIcon,
  UserPlus,
  Edit,
  Mail,
  Phone,
  Check,
  X,
  Calendar,
  Building,
  Key,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  MapPin,
  Save,
  Shield,
  Trash2,
  AlertTriangle,
  Settings,
} from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';

const statusColors = {
  ACTIVE: 'bg-green-100 text-green-700',
  INACTIVE: 'bg-gray-100 text-gray-700',
  TERMINATED: 'bg-red-100 text-red-700',
};

const roleTypeColors = {
  admin: 'bg-red-100 text-red-700',
  executive: 'bg-purple-100 text-purple-700',
  office_manager: 'bg-blue-100 text-blue-700',
  sales_manager: 'bg-indigo-100 text-indigo-700',
  sales_rep: 'bg-green-100 text-green-700',
  project_manager: 'bg-yellow-100 text-yellow-700',
  call_center: 'bg-orange-100 text-orange-700',
  call_center_manager: 'bg-teal-100 text-teal-700',
  viewer: 'bg-gray-100 text-gray-700',
};

const roleTypeLabels = {
  admin: 'Admin',
  executive: 'Executive',
  office_manager: 'Office Manager',
  sales_manager: 'Sales Manager',
  sales_rep: 'Sales Rep',
  project_manager: 'Project Manager',
  call_center: 'Call Center',
  call_center_manager: 'Call Center Manager',
  viewer: 'Viewer',
};

export default function Users() {
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [officeFilter, setOfficeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('lastName');
  const [sortOrder, setSortOrder] = useState('asc');
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newUserForm, setNewUserForm] = useState({ email: '', firstName: '', lastName: '', password: '', roleId: '' });
  const [passwordForm, setPasswordForm] = useState({ newPassword: '', confirmPassword: '' });
  const [actionError, setActionError] = useState('');

  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const queryParams = useMemo(() => {
    const params = { page, limit: 25, sortBy, sortOrder };
    if (search) params.search = search;
    if (departmentFilter) params.department = departmentFilter;
    if (officeFilter) params.officeAssignment = officeFilter;
    if (statusFilter) params.status = statusFilter;
    return params;
  }, [search, departmentFilter, officeFilter, statusFilter, sortBy, sortOrder, page]);

  const { data, isLoading } = useQuery({
    queryKey: ['users', queryParams],
    queryFn: () => usersApi.getUsers(queryParams),
  });

  const { data: statsData } = useQuery({
    queryKey: ['userStats'],
    queryFn: () => usersApi.getUserStats(),
  });

  // Fetch dropdown users for hierarchy selection
  const { data: dropdownUsers } = useQuery({
    queryKey: ['usersDropdown'],
    queryFn: () => usersApi.getUsersForDropdown({ isActive: true }),
  });

  // Fetch roles for role assignment
  const { data: rolesData } = useQuery({
    queryKey: ['roles'],
    queryFn: () => rolesApi.getRoles(),
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }) => usersApi.updateUser(id, data),
    onSuccess: (updatedUser) => {
      queryClient.invalidateQueries(['users']);
      queryClient.invalidateQueries(['userStats']);
      setSelectedUser(updatedUser);
      setIsEditing(false);
    },
  });

  const createUserMutation = useMutation({
    mutationFn: (data) => usersApi.createUser(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['users']);
      queryClient.invalidateQueries(['userStats']);
      setShowAddUserModal(false);
      setNewUserForm({ email: '', firstName: '', lastName: '', password: '', roleId: '' });
      setActionError('');
    },
    onError: (error) => {
      setActionError(error.response?.data?.error?.message || error.message || 'Failed to create user');
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id) => usersApi.deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['users']);
      queryClient.invalidateQueries(['userStats']);
      setShowDeleteConfirm(false);
      setShowUserModal(false);
      setSelectedUser(null);
      setActionError('');
    },
    onError: (error) => {
      setActionError(error.response?.data?.error?.message || error.message || 'Failed to delete user');
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ email, newPassword }) => usersApi.resetUserPassword(email, newPassword),
    onSuccess: () => {
      setShowPasswordModal(false);
      setPasswordForm({ newPassword: '', confirmPassword: '' });
      setActionError('');
    },
    onError: (error) => {
      setActionError(error.response?.data?.error?.message || error.message || 'Failed to reset password');
    },
  });

  const users = data?.data || [];
  const pagination = data?.pagination || {};
  const stats = statsData || { total: 0, active: 0, inactive: 0, byDepartment: {}, byOffice: {} };
  const userOptions = dropdownUsers || [];
  // Ensure roles is always an array (API may return error object on 403)
  const roles = Array.isArray(rolesData) ? rolesData : [];

  const departments = Object.keys(stats.byDepartment || {}).sort();
  const offices = Object.keys(stats.byOffice || {}).sort();

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const SortIcon = ({ field }) => {
    if (sortBy !== field) return null;
    return sortOrder === 'asc' ?
      <ChevronUp className="w-4 h-4 inline ml-1" /> :
      <ChevronDown className="w-4 h-4 inline ml-1" />;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString();
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return '-';
    return `${Number(value).toFixed(1)}%`;
  };

  const clearFilters = () => {
    setSearch('');
    setDepartmentFilter('');
    setOfficeFilter('');
    setStatusFilter('');
    setPage(1);
  };

  const hasActiveFilters = search || departmentFilter || officeFilter || statusFilter;

  const startEditing = (user) => {
    setEditForm({
      title: user.title || '',
      department: user.department || '',
      officeAssignment: user.officeAssignment || '',
      roleId: user.roleId || '',
      managerId: user.managerId || '',
      directorId: user.directorId || '',
      regionalManagerId: user.regionalManagerId || '',
      executiveId: user.executiveId || '',
      companyLeadRate: user.companyLeadRate ?? '',
      selfGenRate: user.selfGenRate ?? '',
      preCommissionRate: user.preCommissionRate ?? '',
      commissionRate: user.commissionRate ?? '',
      overridePercent: user.overridePercent ?? '',
      supplementsCommissionable: user.supplementsCommissionable ?? false,
      x5050CommissionSplit: user.x5050CommissionSplit ?? false,
      isActive: user.isActive ?? true,
    });
    setIsEditing(true);
  };

  const handleSave = () => {
    // Convert empty strings to null for numeric fields
    const cleanedForm = {
      ...editForm,
      companyLeadRate: editForm.companyLeadRate === '' ? null : Number(editForm.companyLeadRate),
      selfGenRate: editForm.selfGenRate === '' ? null : Number(editForm.selfGenRate),
      preCommissionRate: editForm.preCommissionRate === '' ? null : Number(editForm.preCommissionRate),
      commissionRate: editForm.commissionRate === '' ? null : Number(editForm.commissionRate),
      overridePercent: editForm.overridePercent === '' ? null : Number(editForm.overridePercent),
      managerId: editForm.managerId || null,
      directorId: editForm.directorId || null,
      regionalManagerId: editForm.regionalManagerId || null,
      executiveId: editForm.executiveId || null,
      roleId: editForm.roleId || null,
      x5050CommissionSplit: editForm.x5050CommissionSplit,
    };
    updateUserMutation.mutate({ id: selectedUser.id, data: cleanedForm });
  };

  const UserModal = ({ user, onClose }) => {
    if (!user) return null;

    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-r from-panda-primary to-panda-secondary flex items-center justify-center text-white text-xl font-bold">
                  {user.firstName?.[0]}{user.lastName?.[0]}
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">
                    {user.fullName || `${user.firstName} ${user.lastName}`}
                  </h3>
                  <p className="text-gray-500">{user.title || 'No title'}</p>
                  <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[user.status] || 'bg-gray-100 text-gray-700'}`}>
                    {user.status || 'Unknown'}
                  </span>
                </div>
              </div>
              {!isEditing && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      setShowPasswordModal(true);
                      setPasswordForm({ newPassword: '', confirmPassword: '' });
                      setActionError('');
                    }}
                    className="flex items-center space-x-2 px-3 py-2 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
                    title="Reset Password"
                  >
                    <Key className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => startEditing(user)}
                    className="flex items-center space-x-2 px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90"
                  >
                    <Edit className="w-4 h-4" />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(true);
                      setActionError('');
                    }}
                    className="flex items-center space-x-2 px-3 py-2 border border-red-200 rounded-lg text-red-600 hover:bg-red-50"
                    title="Delete User"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="p-6 space-y-6 overflow-y-auto max-h-[60vh]">
            {/* Contact Info - Read Only */}
            <div>
              <h4 className="font-medium text-gray-900 mb-3">Contact Information</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Email</label>
                  <div className="flex items-center">
                    <Mail className="w-4 h-4 text-gray-400 mr-2" />
                    <span className="text-gray-900">{user.email}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Phone</label>
                  <div className="flex items-center">
                    <Phone className="w-4 h-4 text-gray-400 mr-2" />
                    <span className="text-gray-900">{user.phone || user.mobilePhone || 'Not set'}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Department</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editForm.department}
                      onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                    />
                  ) : (
                    <div className="flex items-center">
                      <Building className="w-4 h-4 text-gray-400 mr-2" />
                      <span className="text-gray-900">{user.department || 'Not assigned'}</span>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Office</label>
                  {isEditing ? (
                    <select
                      value={editForm.officeAssignment}
                      onChange={(e) => setEditForm({ ...editForm, officeAssignment: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                    >
                      <option value="">Not assigned</option>
                      {offices.map(office => (
                        <option key={office} value={office}>{office}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex items-center">
                      <MapPin className="w-4 h-4 text-gray-400 mr-2" />
                      <span className="text-gray-900">{user.officeAssignment || 'Not assigned'}</span>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Title</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editForm.title}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                    />
                  ) : (
                    <span className="text-gray-900">{user.title || '-'}</span>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Active Status</label>
                  {isEditing ? (
                    <select
                      value={editForm.isActive ? 'true' : 'false'}
                      onChange={(e) => setEditForm({ ...editForm, isActive: e.target.value === 'true' })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                    >
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  ) : (
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      user.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Employee #</label>
                  <span className="text-gray-900">{user.employeeNumber || '-'}</span>
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Start Date</label>
                  <div className="flex items-center">
                    <Calendar className="w-4 h-4 text-gray-400 mr-2" />
                    <span className="text-gray-900">{formatDate(user.startDate)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Role & Permissions */}
            <div>
              <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                <Shield className="w-4 h-4 mr-2 text-panda-primary" />
                Role & Permissions
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Role</label>
                  {isEditing ? (
                    <select
                      value={editForm.roleId || ''}
                      onChange={(e) => setEditForm({ ...editForm, roleId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                    >
                      <option value="">No Role Assigned</option>
                      {(Array.isArray(roles) ? roles : []).map(role => (
                        <option key={role.id} value={role.id}>
                          {role.name} ({roleTypeLabels[role.roleType] || role.roleType || 'Unknown'})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <span className="text-gray-900 font-medium">{user.role?.name || 'No Role'}</span>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Role Type (View Scope)</label>
                  <div className="flex items-center space-x-2">
                    {user.role?.roleType ? (
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${roleTypeColors[user.role.roleType] || 'bg-gray-100 text-gray-700'}`}>
                        {roleTypeLabels[user.role.roleType] || user.role.roleType}
                      </span>
                    ) : (
                      <span className="text-gray-400">Not set</span>
                    )}
                  </div>
                </div>
              </div>
              {user.role?.roleType && (
                <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-600">
                    {user.role.roleType === 'admin' && 'Can view and edit all data across the organization.'}
                    {user.role.roleType === 'executive' && 'Can view all data across the organization (read-only for most).'}
                    {user.role.roleType === 'office_manager' && 'Can view and manage data for their assigned office.'}
                    {user.role.roleType === 'sales_manager' && 'Can view and manage their team\'s leads, jobs, and accounts.'}
                    {user.role.roleType === 'sales_rep' && 'Can view and manage only their own assigned records.'}
                    {user.role.roleType === 'project_manager' && 'Can view and manage work orders and production data.'}
                    {user.role.roleType === 'call_center' && 'Can view and manage leads and contacts for scheduling.'}
                    {user.role.roleType === 'viewer' && 'Read-only access to assigned records.'}
                  </p>
                </div>
              )}
            </div>

            {/* Hierarchy */}
            <div>
              <h4 className="font-medium text-gray-900 mb-3">Reporting Hierarchy</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Manager</label>
                  {isEditing ? (
                    <select
                      value={editForm.managerId || ''}
                      onChange={(e) => setEditForm({ ...editForm, managerId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                    >
                      <option value="">No Manager</option>
                      {userOptions.map(u => (
                        <option key={u.id} value={u.id}>{u.fullName}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-gray-900">{user.manager?.fullName || '-'}</span>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Director</label>
                  {isEditing ? (
                    <select
                      value={editForm.directorId || ''}
                      onChange={(e) => setEditForm({ ...editForm, directorId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                    >
                      <option value="">No Director</option>
                      {userOptions.map(u => (
                        <option key={u.id} value={u.id}>{u.fullName}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-gray-900">{user.director?.fullName || '-'}</span>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Regional Manager</label>
                  {isEditing ? (
                    <select
                      value={editForm.regionalManagerId || ''}
                      onChange={(e) => setEditForm({ ...editForm, regionalManagerId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                    >
                      <option value="">No Regional Manager</option>
                      {userOptions.map(u => (
                        <option key={u.id} value={u.id}>{u.fullName}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-gray-900">{user.regionalManager?.fullName || '-'}</span>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Executive</label>
                  {isEditing ? (
                    <select
                      value={editForm.executiveId || ''}
                      onChange={(e) => setEditForm({ ...editForm, executiveId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                    >
                      <option value="">No Executive</option>
                      {userOptions.map(u => (
                        <option key={u.id} value={u.id}>{u.fullName}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-gray-900">{user.executive?.fullName || '-'}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Commission Rates */}
            <div>
              <h4 className="font-medium text-gray-900 mb-3">Commission Rates</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <label className="block text-xs text-gray-500 mb-1">Company Lead Rate</label>
                  {isEditing ? (
                    <div className="flex items-center">
                      <input
                        type="number"
                        step="0.1"
                        value={editForm.companyLeadRate}
                        onChange={(e) => setEditForm({ ...editForm, companyLeadRate: e.target.value })}
                        className="w-full px-2 py-1 border border-gray-200 rounded focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none text-lg font-semibold"
                        placeholder="0"
                      />
                      <span className="ml-1 text-gray-500">%</span>
                    </div>
                  ) : (
                    <span className="text-lg font-semibold text-gray-900">{formatPercent(user.companyLeadRate)}</span>
                  )}
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <label className="block text-xs text-gray-500 mb-1">Self-Gen Rate</label>
                  {isEditing ? (
                    <div className="flex items-center">
                      <input
                        type="number"
                        step="0.1"
                        value={editForm.selfGenRate}
                        onChange={(e) => setEditForm({ ...editForm, selfGenRate: e.target.value })}
                        className="w-full px-2 py-1 border border-gray-200 rounded focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none text-lg font-semibold"
                        placeholder="0"
                      />
                      <span className="ml-1 text-gray-500">%</span>
                    </div>
                  ) : (
                    <span className="text-lg font-semibold text-gray-900">{formatPercent(user.selfGenRate)}</span>
                  )}
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <label className="block text-xs text-gray-500 mb-1">Pre-Commission Rate</label>
                  {isEditing ? (
                    <div className="flex items-center">
                      <input
                        type="number"
                        step="0.1"
                        value={editForm.preCommissionRate}
                        onChange={(e) => setEditForm({ ...editForm, preCommissionRate: e.target.value })}
                        className="w-full px-2 py-1 border border-gray-200 rounded focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none text-lg font-semibold"
                        placeholder="0"
                      />
                      <span className="ml-1 text-gray-500">%</span>
                    </div>
                  ) : (
                    <span className="text-lg font-semibold text-gray-900">{formatPercent(user.preCommissionRate)}</span>
                  )}
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <label className="block text-xs text-gray-500 mb-1">Commission Rate</label>
                  {isEditing ? (
                    <div className="flex items-center">
                      <input
                        type="number"
                        step="0.1"
                        value={editForm.commissionRate}
                        onChange={(e) => setEditForm({ ...editForm, commissionRate: e.target.value })}
                        className="w-full px-2 py-1 border border-gray-200 rounded focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none text-lg font-semibold"
                        placeholder="0"
                      />
                      <span className="ml-1 text-gray-500">%</span>
                    </div>
                  ) : (
                    <span className="text-lg font-semibold text-gray-900">{formatPercent(user.commissionRate)}</span>
                  )}
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <label className="block text-xs text-gray-500 mb-1">Override %</label>
                  {isEditing ? (
                    <div className="flex items-center">
                      <input
                        type="number"
                        step="0.1"
                        value={editForm.overridePercent}
                        onChange={(e) => setEditForm({ ...editForm, overridePercent: e.target.value })}
                        className="w-full px-2 py-1 border border-gray-200 rounded focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none text-lg font-semibold"
                        placeholder="0"
                      />
                      <span className="ml-1 text-gray-500">%</span>
                    </div>
                  ) : (
                    <span className="text-lg font-semibold text-gray-900">{formatPercent(user.overridePercent)}</span>
                  )}
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <label className="block text-xs text-gray-500 mb-1">Supplements Comm.</label>
                  {isEditing ? (
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editForm.supplementsCommissionable}
                        onChange={(e) => setEditForm({ ...editForm, supplementsCommissionable: e.target.checked })}
                        className="w-5 h-5 text-panda-primary border-gray-300 rounded focus:ring-panda-primary"
                      />
                      <span className="text-lg font-semibold">{editForm.supplementsCommissionable ? 'Yes' : 'No'}</span>
                    </label>
                  ) : (
                    <span className={`text-lg font-semibold ${user.supplementsCommissionable ? 'text-green-600' : 'text-gray-400'}`}>
                      {user.supplementsCommissionable ? 'Yes' : 'No'}
                    </span>
                  )}
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <label className="block text-xs text-gray-500 mb-1">50/50 Split</label>
                  {isEditing ? (
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editForm.x5050CommissionSplit}
                        onChange={(e) => setEditForm({ ...editForm, x5050CommissionSplit: e.target.checked })}
                        className="w-5 h-5 text-panda-primary border-gray-300 rounded focus:ring-panda-primary"
                      />
                      <span className="text-lg font-semibold">{editForm.x5050CommissionSplit ? 'Yes' : 'No'}</span>
                    </label>
                  ) : (
                    <span className={`text-lg font-semibold ${user.x5050CommissionSplit ? 'text-green-600' : 'text-gray-400'}`}>
                      {user.x5050CommissionSplit ? 'Yes' : 'No'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={updateUserMutation.isLoading}
                  className="flex items-center space-x-2 px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{updateUserMutation.isLoading ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </>
            ) : (
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            )}
          </div>
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
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-sm text-gray-500 mt-1">
            {pagination.total || 0} users
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/admin/roles')}
            className="inline-flex items-center justify-center px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            <Settings className="w-5 h-5 mr-2" />
            <span>Manage Roles</span>
          </button>
          <button
            onClick={() => {
              setShowAddUserModal(true);
              setActionError('');
            }}
            className="inline-flex items-center justify-center px-4 py-2.5 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            <UserPlus className="w-5 h-5 mr-2" />
            <span>Add User</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <UsersIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-sm text-gray-500">Total Users</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-green-100">
              <Check className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.active}</p>
              <p className="text-sm text-gray-500">Active</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-gray-100">
              <X className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.inactive}</p>
              <p className="text-sm text-gray-500">Inactive</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-purple-100">
              <Building className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{departments.length}</p>
              <p className="text-sm text-gray-500">Departments</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, email..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
            />
          </div>
          <select
            value={departmentFilter}
            onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }}
            className="px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
          >
            <option value="">All Departments</option>
            {departments.map(dept => (
              <option key={dept} value={dept}>{dept} ({stats.byDepartment[dept]})</option>
            ))}
          </select>
          <select
            value={officeFilter}
            onChange={(e) => { setOfficeFilter(e.target.value); setPage(1); }}
            className="px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
          >
            <option value="">All Offices</option>
            {offices.map(office => (
              <option key={office} value={office}>{office} ({stats.byOffice[office]})</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
          >
            <option value="">All Status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center space-x-1 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
            >
              <X className="w-4 h-4" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* User Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary"></div>
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <UsersIcon className="w-12 h-12 mb-2 text-gray-300" />
            <p>No users found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('lastName')}
                  >
                    User <SortIcon field="lastName" />
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('title')}
                  >
                    Title <SortIcon field="title" />
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('department')}
                  >
                    Department <SortIcon field="department" />
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('officeAssignment')}
                  >
                    Office <SortIcon field="officeAssignment" />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Manager
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Comm. Rates
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <div className="flex items-center">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-panda-primary to-panda-secondary flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                          {user.firstName?.[0]}{user.lastName?.[0]}
                        </div>
                        <div className="ml-3">
                          <p className="font-medium text-gray-900">{user.fullName || `${user.firstName} ${user.lastName}`}</p>
                          <p className="text-sm text-gray-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700">
                      {user.title || '-'}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700">
                      {user.department || '-'}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700">
                      {user.officeAssignment || '-'}
                    </td>
                    <td className="px-4 py-4">
                      {user.role ? (
                        <div className="flex flex-col">
                          <span className="text-sm text-gray-900">{user.role.name}</span>
                          {user.role.roleType && (
                            <span className={`inline-block mt-0.5 w-fit px-2 py-0.5 rounded-full text-xs font-medium ${roleTypeColors[user.role.roleType] || 'bg-gray-100 text-gray-700'}`}>
                              {roleTypeLabels[user.role.roleType] || user.role.roleType}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700">
                      {user.manager?.fullName || user.manager?.firstName ? `${user.manager.firstName} ${user.manager.lastName}` : '-'}
                    </td>
                    <td className="px-4 py-4">
                      {(user.companyLeadRate || user.selfGenRate || user.commissionRate) ? (
                        <div className="flex items-center space-x-2 text-xs">
                          {user.companyLeadRate && (
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded" title="Company Lead Rate">
                              CL: {formatPercent(user.companyLeadRate)}
                            </span>
                          )}
                          {user.selfGenRate && (
                            <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded" title="Self-Gen Rate">
                              SG: {formatPercent(user.selfGenRate)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button
                        onClick={() => {
                          setSelectedUser(user);
                          setShowUserModal(true);
                          setIsEditing(false);
                        }}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              Showing {((page - 1) * 25) + 1} to {Math.min(page * 25, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 text-sm"
              >
                Previous
              </button>
              <span className="px-4 py-2 text-sm text-gray-600">
                Page {page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page >= pagination.totalPages}
                className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 text-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* User Detail Modal */}
      {showUserModal && selectedUser && (
        <UserModal
          user={selectedUser}
          onClose={() => {
            setShowUserModal(false);
            setSelectedUser(null);
            setIsEditing(false);
          }}
        />
      )}

      {/* Add User Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">Add New User</h2>
                <button
                  onClick={() => {
                    setShowAddUserModal(false);
                    setNewUserForm({ email: '', firstName: '', lastName: '', password: '', roleId: '' });
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  value={newUserForm.email}
                  onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                  placeholder="user@pandaexteriors.com"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    value={newUserForm.firstName}
                    onChange={(e) => setNewUserForm({ ...newUserForm, firstName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                  <input
                    type="text"
                    value={newUserForm.lastName}
                    onChange={(e) => setNewUserForm({ ...newUserForm, lastName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Temporary Password *</label>
                <input
                  type="password"
                  value={newUserForm.password}
                  onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                  placeholder="Min 8 characters"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={newUserForm.roleId}
                  onChange={(e) => setNewUserForm({ ...newUserForm, roleId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                >
                  <option value="">Select a role...</option>
                  {roles?.map((role) => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddUserModal(false);
                  setNewUserForm({ email: '', firstName: '', lastName: '', password: '', roleId: '' });
                  setActionError('');
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!newUserForm.email || !newUserForm.firstName || !newUserForm.lastName || !newUserForm.password) {
                    setActionError('Please fill in all required fields');
                    return;
                  }
                  if (newUserForm.password.length < 8) {
                    setActionError('Password must be at least 8 characters');
                    return;
                  }
                  createUserMutation.mutate(newUserForm);
                }}
                disabled={createUserMutation.isPending}
                className="px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
              >
                {createUserMutation.isPending ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-red-100 rounded-full">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Delete User</h2>
                  <p className="text-sm text-gray-500">This action cannot be undone</p>
                </div>
              </div>
              {actionError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  {actionError}
                </div>
              )}
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete <span className="font-semibold">{selectedUser.firstName} {selectedUser.lastName}</span> ({selectedUser.email})?
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setActionError('');
                  }}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteUserMutation.mutate(selectedUser.id)}
                  disabled={deleteUserMutation.isPending}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  {deleteUserMutation.isPending ? 'Deleting...' : 'Delete User'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showPasswordModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Reset Password</h2>
                  <p className="text-sm text-gray-500 mt-1">For {selectedUser.firstName} {selectedUser.lastName}</p>
                </div>
                <button
                  onClick={() => {
                    setShowPasswordModal(false);
                    setPasswordForm({ newPassword: '', confirmPassword: '' });
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
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password *</label>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                  placeholder="Min 8 characters"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password *</label>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                  placeholder="Re-enter password"
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordForm({ newPassword: '', confirmPassword: '' });
                  setActionError('');
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!passwordForm.newPassword || !passwordForm.confirmPassword) {
                    setActionError('Please fill in all fields');
                    return;
                  }
                  if (passwordForm.newPassword.length < 8) {
                    setActionError('Password must be at least 8 characters');
                    return;
                  }
                  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
                    setActionError('Passwords do not match');
                    return;
                  }
                  resetPasswordMutation.mutate({ email: selectedUser.email, newPassword: passwordForm.newPassword });
                }}
                disabled={resetPasswordMutation.isPending}
                className="px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
              >
                {resetPasswordMutation.isPending ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          </div>
        </div>
        )}
      </div>
    </AdminLayout>
  );
}
