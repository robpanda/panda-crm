import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { contactsApi } from '../services/api';
import {
  Users,
  UserPlus,
  Mail,
  Phone,
  TrendingUp,
  ArrowRight,
  CheckCircle,
  Clock,
  Building2,
  Calendar,
  MessageSquare,
  Star,
  UserCheck,
  Activity,
  PhoneCall,
  MailOpen,
} from 'lucide-react';

export default function ContactsDashboard() {
  const { user } = useAuth();

  // Fetch contact statistics
  const { data: contactStats } = useQuery({
    queryKey: ['contactStats'],
    queryFn: async () => {
      // Get all contacts with type counts
      const response = await contactsApi.getContacts({ limit: 1000 });
      const contacts = response.data || [];

      const stats = {
        total: contacts.length,
        PRIMARY: 0,
        SECONDARY: 0,
        BILLING: 0,
        HOMEOWNER: 0,
        OTHER: 0,
        withEmail: 0,
        withPhone: 0,
        pastCustomers: 0,
        recentlyActive: 0,
        mine: 0,
      };

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      contacts.forEach(contact => {
        // Count by type
        if (contact.type && stats[contact.type] !== undefined) {
          stats[contact.type]++;
        }

        // Count with email/phone
        if (contact.email) stats.withEmail++;
        if (contact.phone || contact.mobilePhone) stats.withPhone++;

        // Past customers
        if (contact.isPastCustomer) stats.pastCustomers++;

        // Recently active
        if (contact.lastActivityDate && new Date(contact.lastActivityDate) > thirtyDaysAgo) {
          stats.recentlyActive++;
        }

        // My contacts
        if (contact.ownerId === user?.id) {
          stats.mine++;
        }
      });

      return stats;
    },
  });

  // Fetch recent contacts
  const { data: recentContacts } = useQuery({
    queryKey: ['recentContacts'],
    queryFn: () => contactsApi.getContacts({ limit: 5, sort: 'createdAt', order: 'desc' }),
  });

  // Fetch contacts with recent activity
  const { data: activeContacts } = useQuery({
    queryKey: ['activeContacts'],
    queryFn: () => contactsApi.getContacts({ limit: 5, sort: 'lastActivityDate', order: 'desc' }),
  });

  // Stats cards
  const stats = [
    {
      label: 'Total Contacts',
      value: contactStats?.total || 0,
      icon: Users,
      color: 'from-blue-500 to-blue-600',
      link: '/contacts/list',
    },
    {
      label: 'Homeowners',
      value: contactStats?.HOMEOWNER || 0,
      icon: UserCheck,
      color: 'from-green-500 to-green-600',
      link: '/contacts/list?type=HOMEOWNER',
    },
    {
      label: 'Past Customers',
      value: contactStats?.pastCustomers || 0,
      icon: Star,
      color: 'from-yellow-500 to-yellow-600',
      link: '/contacts/list?isPastCustomer=true',
    },
    {
      label: 'Recently Active',
      value: contactStats?.recentlyActive || 0,
      icon: Activity,
      color: 'from-purple-500 to-purple-600',
      link: '/contacts/list?recentActivity=true',
    },
  ];

  // Contact type distribution
  const typeDistribution = [
    { type: 'Homeowner', count: contactStats?.HOMEOWNER || 0, color: 'bg-green-400' },
    { type: 'Primary', count: contactStats?.PRIMARY || 0, color: 'bg-blue-400' },
    { type: 'Secondary', count: contactStats?.SECONDARY || 0, color: 'bg-indigo-400' },
    { type: 'Billing', count: contactStats?.BILLING || 0, color: 'bg-yellow-400' },
    { type: 'Other', count: contactStats?.OTHER || 0, color: 'bg-gray-400' },
  ];

  // Communication stats
  const commStats = [
    { label: 'With Email', value: contactStats?.withEmail || 0, icon: Mail, color: 'text-blue-600', bg: 'bg-blue-100' },
    { label: 'With Phone', value: contactStats?.withPhone || 0, icon: Phone, color: 'text-green-600', bg: 'bg-green-100' },
    { label: 'Past Customers', value: contactStats?.pastCustomers || 0, icon: Star, color: 'text-yellow-600', bg: 'bg-yellow-100' },
    { label: 'Active (30d)', value: contactStats?.recentlyActive || 0, icon: Activity, color: 'text-purple-600', bg: 'bg-purple-100' },
  ];

  const getTypeColor = (type) => {
    const colors = {
      'PRIMARY': 'bg-blue-100 text-blue-700',
      'SECONDARY': 'bg-indigo-100 text-indigo-700',
      'BILLING': 'bg-yellow-100 text-yellow-700',
      'HOMEOWNER': 'bg-green-100 text-green-700',
      'OTHER': 'bg-gray-100 text-gray-700',
    };
    return colors[type] || 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts Dashboard</h1>
          <p className="text-gray-500">Manage your customer contacts and communication</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/contacts/list"
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            View All Contacts
          </Link>
          <Link
            to="/contacts/new"
            className="px-4 py-2 text-sm font-medium text-white bg-panda-primary rounded-lg hover:bg-panda-primary/90 transition-colors"
          >
            + New Contact
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link
              key={stat.label}
              to={stat.link}
              className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 card-hover"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
                </div>
                <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Communication Stats */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Communication Overview</h2>
            <span className="text-sm text-gray-500">Contact Quality</span>
          </div>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {commStats.map((metric) => {
              const Icon = metric.icon;
              const percentage = contactStats?.total > 0
                ? Math.round((metric.value / contactStats.total) * 100)
                : 0;
              return (
                <div key={metric.label} className="text-center p-4 rounded-lg bg-gray-50">
                  <div className={`w-10 h-10 mx-auto rounded-full ${metric.bg} flex items-center justify-center mb-2`}>
                    <Icon className={`w-5 h-5 ${metric.color}`} />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{metric.value}</p>
                  <p className="text-xs text-gray-500 mt-1">{metric.label}</p>
                  <p className="text-xs text-gray-400 mt-1">{percentage}% of total</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contact Type Distribution */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Contact Type Distribution</h2>
              <Link to="/contacts/list" className="text-panda-primary text-sm hover:underline flex items-center">
                View All <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </div>
          </div>
          <div className="p-5">
            <div className="space-y-4">
              {typeDistribution.map((item) => {
                const maxCount = Math.max(...typeDistribution.map(s => s.count), 1);
                return (
                  <div key={item.type} className="flex items-center">
                    <div className="w-24 text-sm text-gray-600">{item.type}</div>
                    <div className="flex-1 mx-4">
                      <div className="h-6 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${item.color} rounded-full transition-all duration-500`}
                          style={{
                            width: `${Math.min(100, (item.count / maxCount) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="w-12 text-right font-semibold text-gray-900">{item.count}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Recently Active Contacts */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Recently Active</h2>
              <span className="bg-green-100 text-green-600 text-xs font-bold px-2 py-1 rounded-full">
                Last 30 Days
              </span>
            </div>
          </div>
          <div className="p-2">
            {(activeContacts?.data || []).slice(0, 5).map((contact) => (
              <Link
                key={contact.id}
                to={`/contacts/${contact.id}`}
                className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                  <span className="text-white text-xs font-medium">
                    {contact.firstName?.charAt(0)}{contact.lastName?.charAt(0)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {contact.firstName} {contact.lastName}
                  </p>
                  <p className="text-xs text-gray-500">{contact.type || 'Contact'}</p>
                </div>
                {contact.lastActivityDate && (
                  <span className="text-xs text-gray-400">
                    {new Date(contact.lastActivityDate).toLocaleDateString()}
                  </span>
                )}
              </Link>
            ))}
            {(!activeContacts?.data || activeContacts.data.length === 0) && (
              <div className="p-4 text-center text-sm text-gray-500">
                No recent activity
              </div>
            )}
          </div>
          <div className="p-3 border-t border-gray-100">
            <Link
              to="/contacts/list?recentActivity=true"
              className="block text-center text-sm text-panda-primary hover:underline"
            >
              View All Active Contacts
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Contacts & Engagement Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Contacts */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Recently Added</h2>
              <Link to="/contacts/list" className="text-panda-primary text-sm hover:underline flex items-center">
                View All <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </div>
          </div>
          <div className="p-2 max-h-80 overflow-y-auto">
            {(recentContacts?.data || []).map((contact) => (
              <Link
                key={contact.id}
                to={`/contacts/${contact.id}`}
                className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-500 to-teal-500 flex items-center justify-center">
                  <UserPlus className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {contact.firstName} {contact.lastName}
                  </p>
                  <div className="flex items-center space-x-2 text-xs text-gray-500">
                    {contact.account && (
                      <span className="flex items-center">
                        <Building2 className="w-3 h-3 mr-1" />
                        {contact.account.name}
                      </span>
                    )}
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${getTypeColor(contact.type)}`}>
                  {contact.type || 'Contact'}
                </span>
              </Link>
            ))}
            {(!recentContacts?.data || recentContacts.data.length === 0) && (
              <div className="p-4 text-center text-sm text-gray-500">
                No recent contacts
              </div>
            )}
          </div>
        </div>

        {/* Contact Engagement */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Engagement Metrics</h2>
              <span className="text-sm text-gray-500">All Contacts</span>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Email Reachable</p>
                  <p className="text-xs text-gray-500">Contacts with valid email</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-gray-900">
                {contactStats?.total > 0
                  ? Math.round((contactStats?.withEmail / contactStats.total) * 100)
                  : 0}%
              </span>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Phone Reachable</p>
                  <p className="text-xs text-gray-500">Contacts with phone number</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-gray-900">
                {contactStats?.total > 0
                  ? Math.round((contactStats?.withPhone / contactStats.total) * 100)
                  : 0}%
              </span>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                  <Star className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Past Customer Rate</p>
                  <p className="text-xs text-gray-500">Previous purchasers</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-gray-900">
                {contactStats?.total > 0
                  ? Math.round((contactStats?.pastCustomers / contactStats.total) * 100)
                  : 0}%
              </span>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Active Rate</p>
                  <p className="text-xs text-gray-500">Activity in last 30 days</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-gray-900">
                {contactStats?.total > 0
                  ? Math.round((contactStats?.recentlyActive / contactStats.total) * 100)
                  : 0}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
