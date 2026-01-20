import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import {
  Plus,
  Search,
  Camera,
  Calendar,
  CreditCard,
  Phone,
  PhoneCall,
  Mail,
  Cloud,
  Check,
  X,
  RefreshCw,
  Settings,
  ExternalLink,
  AlertTriangle,
  Zap,
  Activity,
  Brain,
} from 'lucide-react';
import api, { companyCamApi, googleCalendarApi, ringCentralApi } from '../../services/api';

const integrationIcons = {
  companycam: Camera,
  google_calendar: Calendar,
  quickbooks: CreditCard,
  twilio: Phone,
  ringcentral: PhoneCall,
  sendgrid: Mail,
  salesforce: Cloud,
};

const statusColors = {
  connected: 'bg-green-100 text-green-700',
  disconnected: 'bg-gray-100 text-gray-500',
  error: 'bg-red-100 text-red-700',
  syncing: 'bg-blue-100 text-blue-700',
};

export default function Integrations() {
  const navigate = useNavigate();
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIntegration, setSelectedIntegration] = useState(null);
  const [showConfigModal, setShowConfigModal] = useState(false);

  useEffect(() => {
    loadIntegrations();
  }, []);

  const loadIntegrations = async () => {
    try {
      // Fetch real integration status from backend
      let integrationStatus = {};
      try {
        const statusResponse = await api.get('/api/integrations/status');
        integrationStatus = statusResponse.data.data || {};
      } catch (e) {
        console.warn('Could not fetch integration status:', e);
      }

      // Build integrations list with real data where available
      const integrationsList = [
        {
          id: 'companycam',
          name: 'CompanyCam',
          description: 'Photo documentation and project galleries',
          status: integrationStatus.companyCam?.connected ? 'connected' : 'disconnected',
          icon: 'companycam',
          lastSync: null,
          syncFrequency: '15 minutes',
          config: {
            apiKey: '••••••••••••••••',
            companyId: 'panda-exteriors',
            autoSync: true,
          },
          stats: {
            projectsLinked: integrationStatus.companyCam?.projectCount || 0,
            lastError: integrationStatus.companyCam?.error || null,
          },
          webhooks: ['project.created', 'photo.uploaded', 'project.completed'],
        },
        {
          id: 'google_calendar',
          name: 'Google Calendar',
          description: 'Calendar sync for appointments and scheduling (Domain-Wide Delegation)',
          status: integrationStatus.googleCalendar?.usersEnabled > 0 ? 'connected' : 'disconnected',
          icon: 'google_calendar',
          lastSync: null,
          syncFrequency: 'Real-time',
          hasDetailPage: true,
          detailPath: '/admin/google-calendar',
          config: {
            authType: 'Service Account (Domain-Wide Delegation)',
            serviceAccount: 'panda-crm-calendar-sync@panda-crm-staff-calendars.iam.gserviceaccount.com',
          },
          stats: {
            usersLinked: integrationStatus.googleCalendar?.usersLinked || 0,
            usersEnabled: integrationStatus.googleCalendar?.usersEnabled || 0,
            lastError: null,
          },
          webhooks: ['calendar.event.created', 'calendar.event.updated'],
        },
        {
          id: 'quickbooks',
          name: 'QuickBooks Online',
          description: 'Accounting and invoice synchronization',
          status: 'connected',
          icon: 'quickbooks',
          lastSync: new Date().toISOString(),
          syncFrequency: 'Hourly',
          config: {
            realmId: '••••••••••',
            environment: 'production',
            autoCreateInvoices: true,
          },
          stats: {
            invoicesCreated: 0,
            paymentsRecorded: 0,
            lastError: null,
          },
          webhooks: ['invoice.paid', 'payment.received'],
        },
        {
          id: 'twilio',
          name: 'Twilio',
          description: 'SMS messaging and voice communications',
          status: 'connected',
          icon: 'twilio',
          lastSync: null,
          syncFrequency: 'Real-time',
          config: {
            accountSid: '••••••••••••••••',
            messagingServiceSid: 'MG••••••••••',
            fromNumber: '+12408028059',
          },
          stats: {
            messagesSent: 0,
            messagesReceived: 0,
            lastError: null,
          },
          webhooks: ['message.received', 'message.status'],
        },
        {
          id: 'ringcentral',
          name: 'RingCentral',
          description: 'Phone system, call logging, and AI call analytics',
          status: integrationStatus.ringCentral?.connected ? 'connected' : 'disconnected',
          icon: 'ringcentral',
          lastSync: integrationStatus.ringCentral?.lastSync || null,
          syncFrequency: 'Real-time',
          hasDetailPage: true,
          config: {
            clientId: '••••••••••••••••',
            environment: 'production',
            aiEnabled: true,
          },
          stats: {
            callsToday: integrationStatus.ringCentral?.callsToday || 0,
            avgCallDuration: integrationStatus.ringCentral?.avgCallDuration || '0:00',
            aiAnalysisEnabled: true,
            lastError: integrationStatus.ringCentral?.error || null,
          },
          features: [
            { name: 'Click-to-Call', enabled: true },
            { name: 'Call Logging', enabled: true },
            { name: 'AI Transcription', enabled: true },
            { name: 'Sentiment Analysis', enabled: true },
            { name: 'Coaching Insights', enabled: true },
          ],
          webhooks: ['call.completed', 'voicemail.received', 'presence.changed'],
        },
        {
          id: 'sendgrid',
          name: 'SendGrid',
          description: 'Email delivery and marketing campaigns',
          status: 'connected',
          icon: 'sendgrid',
          lastSync: null,
          syncFrequency: 'Real-time',
          config: {
            apiKey: '••••••••••••••••',
            fromEmail: 'info@pandaexteriors.com',
            fromName: 'Panda Exteriors',
          },
          stats: {
            emailsSent: 0,
            emailsDelivered: 0,
            lastError: null,
          },
          webhooks: ['email.delivered', 'email.opened', 'email.clicked'],
        },
        {
          id: 'salesforce',
          name: 'Salesforce',
          description: 'Legacy CRM data migration (read-only)',
          status: 'disconnected',
          icon: 'salesforce',
          lastSync: '2025-12-10T08:00:00Z',
          syncFrequency: 'Manual',
          config: {
            instanceUrl: 'https://ability-saas-2460.my.salesforce.com',
            environment: 'production',
            syncMode: 'read-only',
          },
          stats: {
            recordsImported: 156789,
            lastMigration: '2025-12-10',
            lastError: null,
          },
          webhooks: [],
        },
      ];

      setIntegrations(integrationsList);
    } catch (error) {
      console.error('Failed to load integrations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async (integrationId) => {
    setIntegrations(prev =>
      prev.map(i => i.id === integrationId ? { ...i, status: 'syncing' } : i)
    );

    try {
      if (integrationId === 'companycam') {
        // Sync all local CompanyCam projects
        const projects = await companyCamApi.getLocalProjects();
        for (const project of projects.slice(0, 10)) {
          await companyCamApi.syncProject(project.id);
        }
      }
      // For other integrations, just simulate
      await new Promise(resolve => setTimeout(resolve, 1000));

      setIntegrations(prev =>
        prev.map(i => i.id === integrationId ? { ...i, status: 'connected', lastSync: new Date().toISOString() } : i)
      );
    } catch (error) {
      console.error('Sync failed:', error);
      setIntegrations(prev =>
        prev.map(i => i.id === integrationId ? { ...i, status: 'error', stats: { ...i.stats, lastError: error.message } } : i)
      );
    }
  };

  const handleConnect = async (integrationId) => {
    // Redirect to OAuth flow or show config modal
    setSelectedIntegration(integrations.find(i => i.id === integrationId));
    setShowConfigModal(true);
  };

  const handleDisconnect = async (integrationId) => {
    if (!confirm('Are you sure you want to disconnect this integration?')) return;
    // await api.post(`/integrations/${integrationId}/disconnect`);
    setIntegrations(prev =>
      prev.map(i => i.id === integrationId ? { ...i, status: 'disconnected' } : i)
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  const filteredIntegrations = integrations.filter(i =>
    i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    i.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const connectedCount = integrations.filter(i => i.status === 'connected').length;
  const errorCount = integrations.filter(i => i.status === 'error').length;

  const ConfigModal = ({ integration, onClose }) => {
    if (!integration) return null;
    const Icon = integrationIcons[integration.icon] || Cloud;

    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-gray-100">
                <Icon className="w-6 h-6 text-gray-700" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{integration.name}</h3>
                <p className="text-sm text-gray-500">Configuration</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg text-xl">
              ×
            </button>
          </div>
          <div className="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
            {Object.entries(integration.config).map(([key, value]) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                </label>
                <input
                  type={key.toLowerCase().includes('key') || key.toLowerCase().includes('secret') ? 'password' : 'text'}
                  value={value}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700"
                />
              </div>
            ))}

            {integration.webhooks?.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Active Webhooks
                </label>
                <div className="space-y-2">
                  {integration.webhooks.map((webhook, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                      <span className="text-sm text-gray-700">{webhook}</span>
                      <Check className="w-4 h-4 text-green-500" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-gray-100">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Statistics</h4>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(integration.stats).map(([key, value]) => (
                  <div key={key} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">
                      {key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                    </p>
                    <p className={`text-lg font-semibold ${key === 'lastError' && value ? 'text-red-600' : 'text-gray-900'}`}>
                      {value || 'None'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="p-4 border-t border-gray-100 flex justify-between">
            <button
              onClick={() => handleDisconnect(integration.id)}
              className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg"
            >
              Disconnect
            </button>
            <div className="flex space-x-2">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
              <button className="px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90">
                Save Changes
              </button>
            </div>
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
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Integrations</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage third-party service connections
          </p>
        </div>
        <button className="inline-flex items-center justify-center px-4 py-2.5 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg font-medium hover:opacity-90 transition-opacity">
          <Plus className="w-5 h-5 mr-2" />
          <span>Add Integration</span>
        </button>
      </div>

      {/* Status Summary */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-green-100">
              <Check className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{connectedCount}</p>
              <p className="text-sm text-gray-500">Connected</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-red-100">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{errorCount}</p>
              <p className="text-sm text-gray-500">Errors</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <Activity className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{integrations.length}</p>
              <p className="text-sm text-gray-500">Total</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search integrations..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
        />
      </div>

      {/* Integration Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading ? (
          <div className="col-span-full flex justify-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-panda-primary border-t-transparent rounded-full" />
          </div>
        ) : filteredIntegrations.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <Cloud className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No integrations found</p>
          </div>
        ) : (
          filteredIntegrations.map((integration) => {
            const Icon = integrationIcons[integration.icon] || Cloud;
            return (
              <div
                key={integration.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="p-3 rounded-xl bg-gray-100">
                      <Icon className="w-8 h-8 text-gray-700" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{integration.name}</h3>
                      <p className="text-sm text-gray-500">{integration.description}</p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[integration.status]}`}>
                    {integration.status === 'syncing' && (
                      <RefreshCw className="w-3 h-3 inline mr-1 animate-spin" />
                    )}
                    {integration.status.charAt(0).toUpperCase() + integration.status.slice(1)}
                  </span>
                </div>

                {integration.status !== 'disconnected' && (
                  <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">Last Sync</p>
                      <p className="font-medium text-gray-900">{formatDate(integration.lastSync)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Sync Frequency</p>
                      <p className="font-medium text-gray-900">{integration.syncFrequency}</p>
                    </div>
                  </div>
                )}

                {integration.status === 'error' && integration.stats.lastError && (
                  <div className="mt-4 p-3 bg-red-50 rounded-lg flex items-start space-x-2">
                    <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{integration.stats.lastError}</p>
                  </div>
                )}

                {/* AI Features Badge for RingCentral */}
                {integration.id === 'ringcentral' && integration.features && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {integration.features.map((feature, idx) => (
                      <span
                        key={idx}
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          feature.enabled ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {feature.name === 'AI Transcription' || feature.name === 'Sentiment Analysis' || feature.name === 'Coaching Insights' ? (
                          <Brain className="w-3 h-3 mr-1" />
                        ) : null}
                        {feature.name}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-2">
                  {/* Always show View Details for integrations with detail pages */}
                  {integration.hasDetailPage && (
                    <button
                      onClick={() => navigate(integration.detailPath || `/admin/${integration.id}`)}
                      className="flex-1 sm:flex-none px-3 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg text-sm font-medium hover:opacity-90 flex items-center justify-center"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      {integration.status === 'disconnected' ? 'Setup' : 'Manage'}
                    </button>
                  )}
                  {integration.status === 'connected' && (
                    <>
                      <button
                        onClick={() => handleSync(integration.id)}
                        disabled={integration.status === 'syncing'}
                        className="flex-1 sm:flex-none px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 flex items-center justify-center"
                      >
                        <RefreshCw className={`w-4 h-4 mr-2 ${integration.status === 'syncing' ? 'animate-spin' : ''}`} />
                        Sync Now
                      </button>
                      <button
                        onClick={() => {
                          setSelectedIntegration(integration);
                          setShowConfigModal(true);
                        }}
                        className="flex-1 sm:flex-none px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-center"
                      >
                        <Settings className="w-4 h-4 mr-2" />
                        Configure
                      </button>
                    </>
                  )}
                  {integration.status === 'error' && (
                    <>
                      <button
                        onClick={() => handleSync(integration.id)}
                        className="flex-1 sm:flex-none px-3 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 flex items-center justify-center"
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Retry
                      </button>
                      <button
                        onClick={() => {
                          setSelectedIntegration(integration);
                          setShowConfigModal(true);
                        }}
                        className="flex-1 sm:flex-none px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-center"
                      >
                        <Settings className="w-4 h-4 mr-2" />
                        Configure
                      </button>
                    </>
                  )}
                  {integration.status === 'disconnected' && !integration.hasDetailPage && (
                    <button
                      onClick={() => handleConnect(integration.id)}
                      className="flex-1 px-3 py-2 bg-panda-primary text-white rounded-lg text-sm font-medium hover:bg-panda-primary/90 flex items-center justify-center"
                    >
                      <Zap className="w-4 h-4 mr-2" />
                      Connect
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Config Modal */}
      {showConfigModal && selectedIntegration && (
        <ConfigModal
          integration={selectedIntegration}
          onClose={() => {
            setShowConfigModal(false);
            setSelectedIntegration(null);
          }}
        />
      )}
    </div>
  </AdminLayout>
  );
}
