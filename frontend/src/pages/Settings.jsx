import { useState } from 'react';
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
  Phone,
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
} from 'lucide-react';

const tabs = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'preferences', label: 'Preferences', icon: Palette },
];

export default function Settings() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
                  <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
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
