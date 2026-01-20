import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Users,
  Upload,
  Download,
  RefreshCw,
  Check,
  X,
  AlertCircle,
  Search,
  ChevronLeft,
  Edit2,
  Save,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  Mail,
  FileSpreadsheet,
} from 'lucide-react';
import api from '../../services/api';
import AdminLayout from '../../components/AdminLayout';

export default function GoogleCalendar() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editEmail, setEditEmail] = useState('');
  const [savingUser, setSavingUser] = useState(null);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkImportData, setBulkImportData] = useState([]);
  const [bulkImportPreview, setBulkImportPreview] = useState([]);
  const [importingBulk, setImportingBulk] = useState(false);
  const [importResults, setImportResults] = useState(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/integrations/google/users');
      setUsers(response.data.data || []);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setLoading(false);
    }
  };

  const testConnection = async (email) => {
    try {
      setTestingConnection(true);
      setTestResult(null);
      const response = await api.get(`/api/integrations/google/test?email=${encodeURIComponent(email)}`);
      setTestResult({ success: true, data: response.data.data });
    } catch (error) {
      setTestResult({ success: false, error: error.response?.data?.error?.message || error.message });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleEditStart = (user) => {
    setEditingUserId(user.id);
    setEditEmail(user.googleCalendarEmail || '');
  };

  const handleEditCancel = () => {
    setEditingUserId(null);
    setEditEmail('');
  };

  const handleSaveUser = async (userId) => {
    try {
      setSavingUser(userId);
      await api.post(`/api/integrations/google/users/${userId}/link`, {
        googleCalendarEmail: editEmail,
        enableSync: true,
      });
      setEditingUserId(null);
      setEditEmail('');
      await loadUsers();
    } catch (error) {
      console.error('Failed to save user:', error);
      alert(error.response?.data?.error?.message || 'Failed to save');
    } finally {
      setSavingUser(null);
    }
  };

  const handleUnlink = async (userId) => {
    if (!confirm('Are you sure you want to unlink this user from Google Calendar?')) return;
    try {
      await api.delete(`/api/integrations/google/users/${userId}`);
      await loadUsers();
    } catch (error) {
      console.error('Failed to unlink user:', error);
    }
  };

  const handleToggleSync = async (userId, enabled) => {
    try {
      await api.post(`/api/integrations/google/toggle/${userId}`, { enabled });
      await loadUsers();
    } catch (error) {
      console.error('Failed to toggle sync:', error);
    }
  };

  const handleSyncAll = async () => {
    try {
      setSyncing(true);
      await api.post('/api/integrations/google/sync-all');
      await loadUsers();
    } catch (error) {
      console.error('Failed to sync all:', error);
      alert(error.response?.data?.error?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split('\n').filter(l => l.trim());

      // Parse CSV headers
      const headers = lines[0].toLowerCase().split(',').map(h => h.trim());

      // Support multiple CSV formats:
      // Format 1: email, google_email (our standard format)
      // Format 2: First Name, Last Name, Email Address (Google Workspace export)
      // Format 3: Just email column (assumes same email for CRM and Google)

      const emailIndex = headers.findIndex(h =>
        h === 'email' || h === 'user_email' || h === 'crm_email' || h === 'email address'
      );
      const googleEmailIndex = headers.findIndex(h =>
        h === 'google_email' || h === 'google_calendar_email' || h === 'calendar_email'
      );
      const firstNameIndex = headers.findIndex(h => h === 'first name' || h === 'firstname');
      const lastNameIndex = headers.findIndex(h => h === 'last name' || h === 'lastname');

      // Determine CSV format
      const isGoogleWorkspaceExport = emailIndex !== -1 && firstNameIndex !== -1 && lastNameIndex !== -1;
      const isStandardFormat = emailIndex !== -1 && googleEmailIndex !== -1;
      const isSingleEmailFormat = emailIndex !== -1 && googleEmailIndex === -1;

      if (emailIndex === -1) {
        alert('CSV must have an email column (Email Address, email, user_email, or crm_email)');
        return;
      }

      const data = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
        const email = cols[emailIndex];

        if (email && email.includes('@')) {
          // For Google Workspace export or single email format: use the same email for both
          // For standard format: use the separate google_email column
          const googleEmail = isStandardFormat ? cols[googleEmailIndex] : email;

          data.push({
            userEmail: email,
            googleEmail: googleEmail,
            firstName: firstNameIndex !== -1 ? cols[firstNameIndex] : null,
            lastName: lastNameIndex !== -1 ? cols[lastNameIndex] : null,
          });
        }
      }

      // Match with existing users by email
      const preview = data.map(row => {
        const matchedUser = users.find(u =>
          u.email?.toLowerCase() === row.userEmail.toLowerCase()
        );
        return {
          ...row,
          userId: matchedUser?.id,
          userName: matchedUser
            ? `${matchedUser.firstName} ${matchedUser.lastName}`
            : (row.firstName && row.lastName ? `${row.firstName} ${row.lastName}` : null),
          currentGoogleEmail: matchedUser?.googleCalendarEmail,
          status: matchedUser ? 'ready' : 'no_match',
        };
      });

      setBulkImportData(data);
      setBulkImportPreview(preview);
      setShowBulkImport(true);
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleBulkImport = async () => {
    const toImport = bulkImportPreview.filter(r => r.status === 'ready');
    if (toImport.length === 0) {
      alert('No valid rows to import');
      return;
    }

    setImportingBulk(true);
    const results = { success: 0, failed: 0, errors: [] };

    for (const row of toImport) {
      try {
        await api.post(`/api/integrations/google/users/${row.userId}/link`, {
          googleCalendarEmail: row.googleEmail,
          enableSync: true,
        });
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(`${row.userEmail}: ${error.response?.data?.error?.message || error.message}`);
      }
    }

    setImportResults(results);
    setImportingBulk(false);
    await loadUsers();
  };

  const handleExportTemplate = () => {
    const csvContent = 'email,google_email\n' +
      users.map(u => `${u.email || ''},${u.googleCalendarEmail || ''}`).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'google-calendar-mapping.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredUsers = users.filter(u =>
    `${u.firstName} ${u.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.googleCalendarEmail?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const linkedCount = users.filter(u => u.googleCalendarEmail).length;
  const enabledCount = users.filter(u => u.googleCalendarSyncEnabled).length;

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => navigate('/admin/integrations')}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="p-3 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600">
            <Calendar className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Google Calendar Sync</h1>
            <p className="text-sm text-gray-500">Domain-Wide Delegation enabled</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleSyncAll}
            disabled={syncing || enabledCount === 0}
            className="px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 disabled:opacity-50 flex items-center space-x-2"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            <span>Sync All ({enabledCount})</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Users</p>
              <p className="text-2xl font-bold text-gray-900">{users.length}</p>
            </div>
            <div className="p-3 rounded-lg bg-gray-100">
              <Users className="w-5 h-5 text-gray-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Calendars Linked</p>
              <p className="text-2xl font-bold text-green-600">{linkedCount}</p>
            </div>
            <div className="p-3 rounded-lg bg-green-100">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Sync Enabled</p>
              <p className="text-2xl font-bold text-blue-600">{enabledCount}</p>
            </div>
            <div className="p-3 rounded-lg bg-blue-100">
              <RefreshCw className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Actions Bar */}
      <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
            />
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleExportTemplate}
              className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 flex items-center space-x-2"
            >
              <Upload className="w-4 h-4" />
              <span>Bulk Import</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
        </div>
      </div>

      {/* Connection Test */}
      <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
        <h3 className="font-medium text-gray-900 mb-3">Test Connection</h3>
        <div className="flex items-center gap-3">
          <input
            type="email"
            placeholder="Enter a Google Workspace email to test..."
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
            onKeyDown={(e) => e.key === 'Enter' && testConnection(e.target.value)}
          />
          <button
            onClick={(e) => testConnection(e.target.previousSibling.value)}
            disabled={testingConnection}
            className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
          >
            {testingConnection ? 'Testing...' : 'Test'}
          </button>
        </div>
        {testResult && (
          <div className={`mt-3 p-3 rounded-lg ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {testResult.success ? (
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4" />
                <span>Connection successful! Found {testResult.data?.events?.length || 0} events.</span>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <XCircle className="w-4 h-4" />
                <span>{testResult.error}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left py-3 px-4 font-medium text-gray-600">User</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">CRM Email</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Google Calendar Email</th>
                <th className="text-center py-3 px-4 font-medium text-gray-600">Sync Enabled</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Last Sync</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-gray-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Loading users...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-gray-500">
                    No users found
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="font-medium text-gray-900">
                        {user.firstName} {user.lastName}
                      </div>
                      <div className="text-sm text-gray-500">{user.title || user.department || ''}</div>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{user.email}</td>
                    <td className="py-3 px-4">
                      {editingUserId === user.id ? (
                        <input
                          type="email"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          placeholder="user@pandaexteriors.com"
                          className="w-full px-3 py-1.5 border border-gray-200 rounded focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                          autoFocus
                        />
                      ) : (
                        <span className={user.googleCalendarEmail ? 'text-gray-900' : 'text-gray-400 italic'}>
                          {user.googleCalendarEmail || 'Not linked'}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {user.googleCalendarEmail && (
                        <button
                          onClick={() => handleToggleSync(user.id, !user.googleCalendarSyncEnabled)}
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            user.googleCalendarSyncEnabled
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {user.googleCalendarSyncEnabled ? 'Enabled' : 'Disabled'}
                        </button>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500">
                      {user.googleCalendarLastSyncAt
                        ? new Date(user.googleCalendarLastSyncAt).toLocaleString()
                        : '-'
                      }
                    </td>
                    <td className="py-3 px-4 text-right">
                      {editingUserId === user.id ? (
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handleSaveUser(user.id)}
                            disabled={savingUser === user.id}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                          >
                            {savingUser === user.id ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <Save className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={handleEditCancel}
                            className="p-1.5 text-gray-400 hover:bg-gray-100 rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handleEditStart(user)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                            title="Edit Google Calendar email"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {user.googleCalendarEmail && (
                            <button
                              onClick={() => handleUnlink(user.id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                              title="Unlink calendar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bulk Import Modal */}
      {showBulkImport && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-blue-100">
                  <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Bulk Import Preview</h3>
                  <p className="text-sm text-gray-500">{bulkImportPreview.length} rows found</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowBulkImport(false);
                  setBulkImportData([]);
                  setBulkImportPreview([]);
                  setImportResults(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {importResults ? (
                <div className="space-y-4">
                  <div className={`p-4 rounded-lg ${importResults.failed === 0 ? 'bg-green-50' : 'bg-yellow-50'}`}>
                    <div className="flex items-center space-x-2">
                      {importResults.failed === 0 ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-yellow-600" />
                      )}
                      <span className="font-medium">
                        Import complete: {importResults.success} succeeded, {importResults.failed} failed
                      </span>
                    </div>
                    {importResults.errors.length > 0 && (
                      <ul className="mt-2 text-sm text-red-600 list-disc list-inside">
                        {importResults.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left py-2 px-3 font-medium text-gray-600">Status</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600">CRM User</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600">CSV Email</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600">Google Email</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600">Current</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkImportPreview.map((row, i) => (
                      <tr key={i} className={`border-b border-gray-50 ${row.status === 'no_match' ? 'bg-red-50' : ''}`}>
                        <td className="py-2 px-3">
                          {row.status === 'ready' ? (
                            <span className="text-green-600 flex items-center space-x-1">
                              <CheckCircle className="w-4 h-4" />
                              <span>Ready</span>
                            </span>
                          ) : (
                            <span className="text-red-600 flex items-center space-x-1">
                              <XCircle className="w-4 h-4" />
                              <span>No match</span>
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-medium">
                          {row.userName || <span className="text-gray-400">-</span>}
                        </td>
                        <td className="py-2 px-3 text-gray-600">{row.userEmail}</td>
                        <td className="py-2 px-3 text-gray-600">{row.googleEmail}</td>
                        <td className="py-2 px-3 text-gray-400">{row.currentGoogleEmail || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="p-4 border-t border-gray-100 flex items-center justify-between">
              <div className="text-sm text-gray-500">
                {bulkImportPreview.filter(r => r.status === 'ready').length} of {bulkImportPreview.length} rows ready to import
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => {
                    setShowBulkImport(false);
                    setBulkImportData([]);
                    setBulkImportPreview([]);
                    setImportResults(null);
                  }}
                  className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  {importResults ? 'Close' : 'Cancel'}
                </button>
                {!importResults && (
                  <button
                    onClick={handleBulkImport}
                    disabled={importingBulk || bulkImportPreview.filter(r => r.status === 'ready').length === 0}
                    className="px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 disabled:opacity-50 flex items-center space-x-2"
                  >
                    {importingBulk ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Importing...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        <span>Import {bulkImportPreview.filter(r => r.status === 'ready').length} Users</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </AdminLayout>
  );
}
