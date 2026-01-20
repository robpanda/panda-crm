import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { triggerOnboardingTour } from '../components/OnboardingTour';
import {
  User,
  Bell,
  Shield,
  Key,
  Palette,
  Globe,
  Mail,
  Phone as PhoneIcon,
  Building2,
  Camera,
  Save,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  Moon,
  Sun,
  Monitor,
  HelpCircle,
  RotateCcw,
  Link2,
  PhoneCall,
  ExternalLink,
  Calendar,
  RefreshCw,
} from 'lucide-react';
import { useRingCentral } from '../context/RingCentralContext';
import { ringCentralApi, googleCalendarApi, paymentsApi } from '../services/api';
import { CreditCard, FileText, Database } from 'lucide-react';

const tabs = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'integrations', label: 'Integrations', icon: Link2 },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'preferences', label: 'Preferences', icon: Palette },
];

export default function Settings() {
  const { user } = useAuth();
  const { isLoggedIn: rcLoggedIn, loadWidget, logout: rcLogout } = useRingCentral();
  const [activeTab, setActiveTab] = useState('profile');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [rcConnecting, setRcConnecting] = useState(false);

  // Google Calendar state
  const [calendarStatus, setCalendarStatus] = useState({
    connected: false,
    googleCalendarEmail: null,
    syncEnabled: false,
    lastSyncAt: null,
    loading: true,
    error: null,
  });
  const [calendarConnecting, setCalendarConnecting] = useState(false);
  const [calendarSyncing, setCalendarSyncing] = useState(false);
  const [calendarEmail, setCalendarEmail] = useState('');
  const [showCalendarSetup, setShowCalendarSetup] = useState(false);

  // Data sync state
  const [stripeSyncing, setStripeSyncing] = useState(false);
  const [stripeSyncResult, setStripeSyncResult] = useState(null);
  const [qbInvoiceSyncing, setQbInvoiceSyncing] = useState(false);
  const [qbInvoiceSyncResult, setQbInvoiceSyncResult] = useState(null);

  // Fetch calendar connection status on mount
  useEffect(() => {
    const fetchCalendarStatus = async () => {
      // Ensure user.id is a valid string before making API call
      if (!user?.id || typeof user.id !== 'string') {
        console.warn('Calendar status: Invalid or missing user id', { userId: user?.id, type: typeof user?.id });
        setCalendarStatus(prev => ({ ...prev, loading: false }));
        return;
      }
      try {
        const status = await googleCalendarApi.getUserConnectionStatus(user.id);
        setCalendarStatus({
          connected: status.connected || false,
          googleCalendarEmail: status.googleCalendarEmail || null,
          syncEnabled: status.syncEnabled || false,
          lastSyncAt: status.lastSyncAt || null,
          loading: false,
          error: null,
        });
        if (status.googleCalendarEmail) {
          setCalendarEmail(status.googleCalendarEmail);
        }
      } catch (error) {
        console.error('Error fetching calendar status:', error);
        setCalendarStatus({
          connected: false,
          googleCalendarEmail: null,
          syncEnabled: false,
          lastSyncAt: null,
          loading: false,
          error: 'Failed to load calendar status',
        });
      }
    };
    fetchCalendarStatus();
  }, [user?.id]);

  // Profile state
  const [profile, setProfile] = useState({
    firstName: user?.name?.split(' ')[0] || '',
    lastName: user?.name?.split(' ').slice(1).join(' ') || '',
    email: user?.email || '',
    phone: '',
    department: user?.department || '',
    title: '',
  });

  // Notification preferences
  const [notifications, setNotifications] = useState({
    emailNewLead: true,
    emailAppointment: true,
    emailTaskAssigned: true,
    emailWeeklyReport: false,
    smsAppointment: true,
    smsUrgentOnly: false,
    pushEnabled: true,
    pushNewMessages: true,
    pushMentions: true,
  });

  // Security state
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwords, setPasswords] = useState({
    current: '',
    new: '',
    confirm: '',
  });

  // Preferences
  const [preferences, setPreferences] = useState({
    theme: 'system',
    language: 'en',
    timezone: 'America/New_York',
    dateFormat: 'MM/DD/YYYY',
    startPage: 'dashboard',
  });

  const handleSave = async () => {
    setSaving(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleProfileChange = (field, value) => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };

  const handleNotificationChange = (field) => {
    setNotifications(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handlePasswordChange = (field, value) => {
    setPasswords(prev => ({ ...prev, [field]: value }));
  };

  const handlePreferenceChange = (field, value) => {
    setPreferences(prev => ({ ...prev, [field]: value }));
  };

  // Google Calendar handlers
  const handleConnectCalendar = async () => {
    if (!user?.id || typeof user.id !== 'string') {
      alert('User session error. Please refresh and try again.');
      return;
    }
    if (!calendarEmail || !calendarEmail.includes('@')) {
      alert('Please enter a valid Google Workspace email address');
      return;
    }
    setCalendarConnecting(true);
    try {
      const result = await googleCalendarApi.linkUserCalendar(user.id, calendarEmail, true);
      setCalendarStatus({
        connected: true,
        googleCalendarEmail: calendarEmail,
        syncEnabled: true,
        lastSyncAt: null,
        loading: false,
        error: null,
      });
      setShowCalendarSetup(false);
      // Trigger initial sync
      handleSyncCalendar();
    } catch (error) {
      console.error('Error connecting calendar:', error);
      alert(error.response?.data?.error?.message || 'Failed to connect calendar. Make sure you entered a valid @panda-exteriors.com email.');
    } finally {
      setCalendarConnecting(false);
    }
  };

  const handleSyncCalendar = async () => {
    if (!user?.id || typeof user.id !== 'string') {
      alert('User session error. Please refresh and try again.');
      return;
    }
    setCalendarSyncing(true);
    try {
      const result = await googleCalendarApi.syncUserCalendar(user.id);
      setCalendarStatus(prev => ({
        ...prev,
        lastSyncAt: new Date().toISOString(),
      }));
    } catch (error) {
      console.error('Error syncing calendar:', error);
      alert('Failed to sync calendar. Please try again.');
    } finally {
      setCalendarSyncing(false);
    }
  };

  const handleDisconnectCalendar = async () => {
    if (!user?.id || typeof user.id !== 'string') {
      alert('User session error. Please refresh and try again.');
      return;
    }
    if (!confirm('Are you sure you want to disconnect Google Calendar sync?')) return;
    try {
      // Link with empty email to disconnect
      await googleCalendarApi.linkUserCalendar(user.id, '', false);
      setCalendarStatus({
        connected: false,
        googleCalendarEmail: null,
        syncEnabled: false,
        lastSyncAt: null,
        loading: false,
        error: null,
      });
      setCalendarEmail('');
    } catch (error) {
      console.error('Error disconnecting calendar:', error);
      alert('Failed to disconnect calendar.');
    }
  };

  // Data sync handlers
  const handleSyncStripePayments = async () => {
    setStripeSyncing(true);
    setStripeSyncResult(null);
    try {
      const result = await paymentsApi.syncStripePayments({ daysBack: 90, limit: 500 });
      setStripeSyncResult({
        success: true,
        message: `Synced ${result.created || 0} new payments, ${result.updated || 0} updated, ${result.skipped || 0} skipped`,
      });
    } catch (error) {
      console.error('Error syncing Stripe payments:', error);
      setStripeSyncResult({
        success: false,
        message: error.response?.data?.error?.message || 'Failed to sync Stripe payments',
      });
    } finally {
      setStripeSyncing(false);
    }
  };

  const handleSyncQuickBooksInvoices = async () => {
    setQbInvoiceSyncing(true);
    setQbInvoiceSyncResult(null);
    try {
      const result = await paymentsApi.syncQuickBooksInvoices({ daysBack: 90, limit: 500 });
      setQbInvoiceSyncResult({
        success: true,
        message: `Synced ${result.created || 0} new invoices, ${result.updated || 0} updated, ${result.skipped || 0} skipped`,
      });
    } catch (error) {
      console.error('Error syncing QuickBooks invoices:', error);
      setQbInvoiceSyncResult({
        success: false,
        message: error.response?.data?.error?.message || 'Failed to sync QuickBooks invoices',
      });
    } finally {
      setQbInvoiceSyncing(false);
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <div className="space-y-6">
            {/* Avatar Section */}
            <div className="flex items-center space-x-6">
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-gradient-to-r from-panda-primary to-panda-secondary flex items-center justify-center">
                  <span className="text-3xl font-bold text-white">
                    {profile.firstName.charAt(0)}{profile.lastName.charAt(0)}
                  </span>
                </div>
                <button className="absolute bottom-0 right-0 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50">
                  <Camera className="w-4 h-4 text-gray-600" />
                </button>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Profile Photo</h3>
                <p className="text-sm text-gray-500">JPG, PNG or GIF. Max size 2MB.</p>
              </div>
            </div>

            {/* Profile Form */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                <input
                  type="text"
                  value={profile.firstName}
                  onChange={(e) => handleProfileChange('firstName', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                <input
                  type="text"
                  value={profile.lastName}
                  onChange={(e) => handleProfileChange('lastName', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={profile.email}
                    onChange={(e) => handleProfileChange('email', e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary bg-gray-50"
                    disabled
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <div className="relative">
                  <PhoneIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="tel"
                    value={profile.phone}
                    onChange={(e) => handleProfileChange('phone', e.target.value)}
                    placeholder="(555) 555-5555"
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={profile.department}
                    onChange={(e) => handleProfileChange('department', e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
                <input
                  type="text"
                  value={profile.title}
                  onChange={(e) => handleProfileChange('title', e.target.value)}
                  placeholder="Sales Representative"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                />
              </div>
            </div>
          </div>
        );

      case 'notifications':
        return (
          <div className="space-y-6">
            {/* Email Notifications */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Email Notifications</h3>
              <div className="space-y-4">
                {[
                  { key: 'emailNewLead', label: 'New Lead Assigned', description: 'Get notified when a new lead is assigned to you' },
                  { key: 'emailAppointment', label: 'Appointment Reminders', description: 'Receive reminders before scheduled appointments' },
                  { key: 'emailTaskAssigned', label: 'Task Assignments', description: 'Get notified when tasks are assigned to you' },
                  { key: 'emailWeeklyReport', label: 'Weekly Summary', description: 'Receive a weekly performance summary' },
                ].map((item) => (
                  <label key={item.key} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                    <div>
                      <div className="font-medium text-gray-900">{item.label}</div>
                      <div className="text-sm text-gray-500">{item.description}</div>
                    </div>
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={notifications[item.key]}
                        onChange={() => handleNotificationChange(item.key)}
                        className="sr-only"
                      />
                      <div className={`w-11 h-6 rounded-full transition-colors ${
                        notifications[item.key] ? 'bg-panda-primary' : 'bg-gray-300'
                      }`}>
                        <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                          notifications[item.key] ? 'translate-x-5' : 'translate-x-0.5'
                        } mt-0.5`} />
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* SMS Notifications */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">SMS Notifications</h3>
              <div className="space-y-4">
                {[
                  { key: 'smsAppointment', label: 'Appointment Alerts', description: 'Receive SMS reminders for upcoming appointments' },
                  { key: 'smsUrgentOnly', label: 'Urgent Only', description: 'Only receive SMS for urgent matters' },
                ].map((item) => (
                  <label key={item.key} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                    <div>
                      <div className="font-medium text-gray-900">{item.label}</div>
                      <div className="text-sm text-gray-500">{item.description}</div>
                    </div>
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={notifications[item.key]}
                        onChange={() => handleNotificationChange(item.key)}
                        className="sr-only"
                      />
                      <div className={`w-11 h-6 rounded-full transition-colors ${
                        notifications[item.key] ? 'bg-panda-primary' : 'bg-gray-300'
                      }`}>
                        <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                          notifications[item.key] ? 'translate-x-5' : 'translate-x-0.5'
                        } mt-0.5`} />
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Push Notifications */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Push Notifications</h3>
              <div className="space-y-4">
                {[
                  { key: 'pushEnabled', label: 'Enable Push Notifications', description: 'Receive push notifications in browser' },
                  { key: 'pushNewMessages', label: 'New Messages', description: 'Get notified of new messages' },
                  { key: 'pushMentions', label: 'Mentions & Tags', description: 'Get notified when you\'re mentioned' },
                ].map((item) => (
                  <label key={item.key} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                    <div>
                      <div className="font-medium text-gray-900">{item.label}</div>
                      <div className="text-sm text-gray-500">{item.description}</div>
                    </div>
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={notifications[item.key]}
                        onChange={() => handleNotificationChange(item.key)}
                        className="sr-only"
                      />
                      <div className={`w-11 h-6 rounded-full transition-colors ${
                        notifications[item.key] ? 'bg-panda-primary' : 'bg-gray-300'
                      }`}>
                        <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                          notifications[item.key] ? 'translate-x-5' : 'translate-x-0.5'
                        } mt-0.5`} />
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        );

      case 'integrations':
        return (
          <div className="space-y-6">
            {/* RingCentral Integration */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Phone Integration</h3>
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                      <PhoneCall className="w-6 h-6 text-orange-600" />
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">RingCentral</div>
                      <div className="text-sm text-gray-500">
                        {rcLoggedIn
                          ? 'Connected - Click-to-call enabled'
                          : 'Connect to enable click-to-call from CRM records'
                        }
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    {rcLoggedIn ? (
                      <>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          <Check className="w-3 h-3 mr-1" />
                          Connected
                        </span>
                        <button
                          onClick={() => {
                            rcLogout();
                          }}
                          className="px-4 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          Disconnect
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={async () => {
                          setRcConnecting(true);
                          try {
                            await loadWidget();
                          } catch (err) {
                            console.error('Failed to load RingCentral:', err);
                          } finally {
                            setRcConnecting(false);
                          }
                        }}
                        disabled={rcConnecting}
                        className="px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        {rcConnecting ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white inline-block mr-2" />
                            Connecting...
                          </>
                        ) : (
                          <>
                            <PhoneIcon className="w-4 h-4 inline mr-2" />
                            Connect RingCentral
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
                {!rcLoggedIn && (
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-700">
                      <strong>How it works:</strong> Clicking "Connect RingCentral" will open the phone widget.
                      Sign in with your RingCentral credentials to enable click-to-call on any phone number in the CRM.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Future integrations placeholder */}
            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Other Integrations</h3>
              <div className="space-y-3">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center">
                        <Mail className="w-6 h-6 text-gray-400" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">Email Sync</div>
                        <div className="text-sm text-gray-500">Sync emails from Gmail or Outlook</div>
                      </div>
                    </div>
                    <span className="text-sm text-gray-400">Coming soon</span>
                  </div>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className={`w-12 h-12 ${calendarStatus.connected ? 'bg-blue-100' : 'bg-gray-200'} rounded-lg flex items-center justify-center`}>
                        <Calendar className={`w-6 h-6 ${calendarStatus.connected ? 'text-blue-600' : 'text-gray-400'}`} />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">Google Calendar Sync</div>
                        <div className="text-sm text-gray-500">
                          {calendarStatus.loading ? (
                            'Loading...'
                          ) : calendarStatus.connected ? (
                            <>Connected to {calendarStatus.googleCalendarEmail}</>
                          ) : (
                            'Sync appointments with Google Calendar'
                          )}
                        </div>
                        {calendarStatus.lastSyncAt && (
                          <div className="text-xs text-gray-400 mt-1">
                            Last synced: {new Date(calendarStatus.lastSyncAt).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      {calendarStatus.loading ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-400" />
                      ) : calendarStatus.connected ? (
                        <>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <Check className="w-3 h-3 mr-1" />
                            Connected
                          </span>
                          <button
                            onClick={handleSyncCalendar}
                            disabled={calendarSyncing}
                            className="px-3 py-1.5 text-sm bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {calendarSyncing ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={handleDisconnectCalendar}
                            className="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            Disconnect
                          </button>
                        </>
                      ) : showCalendarSetup ? (
                        <div className="flex items-center space-x-2">
                          <input
                            type="email"
                            value={calendarEmail}
                            onChange={(e) => setCalendarEmail(e.target.value)}
                            placeholder="your.email@panda-exteriors.com"
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-64"
                          />
                          <button
                            onClick={handleConnectCalendar}
                            disabled={calendarConnecting}
                            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                          >
                            {calendarConnecting ? 'Connecting...' : 'Connect'}
                          </button>
                          <button
                            onClick={() => setShowCalendarSetup(false)}
                            className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowCalendarSetup(true)}
                          className="px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
                        >
                          <Calendar className="w-4 h-4 inline mr-2" />
                          Connect Calendar
                        </button>
                      )}
                    </div>
                  </div>
                  {!calendarStatus.connected && !showCalendarSetup && (
                    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-700">
                        <strong>How it works:</strong> Enter your @panda-exteriors.com Google Workspace email to sync your CRM appointments with Google Calendar automatically.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Data Sync Section */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-lg flex items-center justify-center">
                    <Database className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Data Sync</h3>
                    <p className="text-sm text-gray-500">Sync data from external systems into Panda CRM</p>
                  </div>
                </div>
              </div>
              <div className="p-6 space-y-6">
                {/* Stripe Payments Sync */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                      <CreditCard className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900">Stripe Payments</h4>
                      <p className="text-sm text-gray-500">Pull payments from Stripe into CRM</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    {stripeSyncResult && (
                      <span className={`text-sm ${stripeSyncResult.success ? 'text-green-600' : 'text-red-600'}`}>
                        {stripeSyncResult.message}
                      </span>
                    )}
                    <button
                      onClick={handleSyncStripePayments}
                      disabled={stripeSyncing}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
                    >
                      <RefreshCw className={`w-4 h-4 ${stripeSyncing ? 'animate-spin' : ''}`} />
                      <span>{stripeSyncing ? 'Syncing...' : 'Sync Payments'}</span>
                    </button>
                  </div>
                </div>

                {/* QuickBooks Invoices Sync */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <FileText className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900">QuickBooks Invoices</h4>
                      <p className="text-sm text-gray-500">Pull invoices from QuickBooks into CRM</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    {qbInvoiceSyncResult && (
                      <span className={`text-sm ${qbInvoiceSyncResult.success ? 'text-green-600' : 'text-red-600'}`}>
                        {qbInvoiceSyncResult.message}
                      </span>
                    )}
                    <button
                      onClick={handleSyncQuickBooksInvoices}
                      disabled={qbInvoiceSyncing}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
                    >
                      <RefreshCw className={`w-4 h-4 ${qbInvoiceSyncing ? 'animate-spin' : ''}`} />
                      <span>{qbInvoiceSyncing ? 'Syncing...' : 'Sync Invoices'}</span>
                    </button>
                  </div>
                </div>

                {/* Info note */}
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-700">
                    <strong>Note:</strong> Syncing will pull records from the last 90 days. Duplicates are automatically skipped based on external IDs. Background sync runs automatically every few hours.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );

      case 'security':
        return (
          <div className="space-y-6">
            {/* Change Password */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Change Password</h3>
              <div className="space-y-4 max-w-md">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={passwords.current}
                      onChange={(e) => handlePasswordChange('current', e.target.value)}
                      className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={passwords.new}
                      onChange={(e) => handlePasswordChange('new', e.target.value)}
                      className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="password"
                      value={passwords.confirm}
                      onChange={(e) => handlePasswordChange('confirm', e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                    />
                  </div>
                </div>
                <button className="px-4 py-2 bg-panda-primary text-white rounded-lg font-medium hover:opacity-90 transition-opacity">
                  Update Password
                </button>
              </div>
            </div>

            {/* Two-Factor Authentication */}
            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Two-Factor Authentication</h3>
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">Authenticator App</div>
                    <div className="text-sm text-gray-500">Use an authenticator app for additional security</div>
                  </div>
                  <button className="px-4 py-2 border border-panda-primary text-panda-primary rounded-lg font-medium hover:bg-panda-primary/5 transition-colors">
                    Enable
                  </button>
                </div>
              </div>
            </div>

            {/* Active Sessions */}
            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Active Sessions</h3>
              <div className="space-y-3">
                <div className="p-4 bg-gray-50 rounded-lg flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <Monitor className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">Current Session</div>
                      <div className="text-sm text-gray-500">Chrome on macOS • Now</div>
                    </div>
                  </div>
                  <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">Active</span>
                </div>
              </div>
            </div>
          </div>
        );

      case 'preferences':
        return (
          <div className="space-y-6">
            {/* Theme */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Appearance</h3>
              <div className="grid grid-cols-3 gap-4 max-w-md">
                {[
                  { value: 'light', label: 'Light', icon: Sun },
                  { value: 'dark', label: 'Dark', icon: Moon },
                  { value: 'system', label: 'System', icon: Monitor },
                ].map((theme) => {
                  const Icon = theme.icon;
                  return (
                    <button
                      key={theme.value}
                      onClick={() => handlePreferenceChange('theme', theme.value)}
                      className={`p-4 rounded-lg border-2 transition-colors ${
                        preferences.theme === theme.value
                          ? 'border-panda-primary bg-panda-primary/5'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <Icon className={`w-6 h-6 mx-auto mb-2 ${
                        preferences.theme === theme.value ? 'text-panda-primary' : 'text-gray-400'
                      }`} />
                      <div className={`text-sm font-medium ${
                        preferences.theme === theme.value ? 'text-panda-primary' : 'text-gray-600'
                      }`}>{theme.label}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Language & Region */}
            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Language & Region</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
                  <select
                    value={preferences.language}
                    onChange={(e) => handlePreferenceChange('language', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                  >
                    <option value="en">English (US)</option>
                    <option value="es">Español</option>
                    <option value="fr">Français</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
                  <select
                    value={preferences.timezone}
                    onChange={(e) => handlePreferenceChange('timezone', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                  >
                    <option value="America/New_York">Eastern Time (ET)</option>
                    <option value="America/Chicago">Central Time (CT)</option>
                    <option value="America/Denver">Mountain Time (MT)</option>
                    <option value="America/Los_Angeles">Pacific Time (PT)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date Format</label>
                  <select
                    value={preferences.dateFormat}
                    onChange={(e) => handlePreferenceChange('dateFormat', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                  >
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Page</label>
                  <select
                    value={preferences.startPage}
                    onChange={(e) => handlePreferenceChange('startPage', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                  >
                    <option value="dashboard">Dashboard</option>
                    <option value="leads">Leads</option>
                    <option value="opportunities">Opportunities</option>
                    <option value="accounts">Accounts</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Help & Training */}
            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Help & Training</h3>
              <div className="space-y-4 max-w-2xl">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-panda-primary/10 rounded-lg flex items-center justify-center">
                        <RotateCcw className="w-5 h-5 text-panda-primary" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">Restart Onboarding Tour</div>
                        <div className="text-sm text-gray-500">Take the guided tour of Panda CRM again</div>
                      </div>
                    </div>
                    <button
                      onClick={triggerOnboardingTour}
                      className="px-4 py-2 border border-panda-primary text-panda-primary rounded-lg font-medium hover:bg-panda-primary/5 transition-colors"
                    >
                      Start Tour
                    </button>
                  </div>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-panda-primary/10 rounded-lg flex items-center justify-center">
                        <HelpCircle className="w-5 h-5 text-panda-primary" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">Training Assistant</div>
                        <div className="text-sm text-gray-500">Click the "Need Help?" button anytime for assistance</div>
                      </div>
                    </div>
                    <span className="text-sm text-gray-500">Always available</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600 mt-1">Manage your account settings and preferences</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
              Saving...
            </>
          ) : saved ? (
            <>
              <Check className="w-5 h-5 mr-2" />
              Saved!
            </>
          ) : (
            <>
              <Save className="w-5 h-5 mr-2" />
              Save Changes
            </>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar Tabs */}
        <div className="lg:w-64 flex-shrink-0">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <nav className="p-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                      activeTab === tab.id
                        ? 'bg-gradient-to-r from-panda-primary/10 to-panda-secondary/10 text-panda-primary'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${activeTab === tab.id ? 'text-panda-primary' : ''}`} />
                    <span className="font-medium">{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            {renderTabContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
