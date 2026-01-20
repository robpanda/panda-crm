import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  FileText,
  Settings,
  Workflow,
  DollarSign,
  FileCheck,
  Camera,
  Users,
  Shield,
  ClipboardList,
  LogOut,
  ChevronRight,
  User,
  Bell,
  HelpCircle,
  MessageSquare,
  Calendar,
  PhoneCall,
  PenTool,
  Wrench,
  Bot,
  Briefcase,
  ListTodo,
  FileSignature,
  CalendarDays,
  Receipt,
  ClipboardCheck,
} from 'lucide-react';

export default function More() {
  const { user, logout, hasPageAccess, isActualUserAdmin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const menuSections = [
    {
      title: 'Quick Access',
      items: [
        { path: '/reports', icon: FileText, label: 'Reports & Analytics' },
        { path: '/calendar', icon: Calendar, label: 'Calendar' },
        { path: '/messages', icon: MessageSquare, label: 'Messages' },
      ],
    },
    {
      title: 'Management',
      requiresPageAccess: true,
      items: [
        { path: '/management/cases', icon: Briefcase, label: 'Cases', pageId: 'cases' },
        { path: '/management/tasks', icon: ListTodo, label: 'Tasks', pageId: 'tasks' },
        { path: '/management/commissions', icon: DollarSign, label: 'Commissions', pageId: 'commissions' },
        { path: '/management/invoices', icon: Receipt, label: 'Invoices', pageId: 'invoices' },
        { path: '/management/contracts', icon: FileSignature, label: 'Contracts', pageId: 'contracts' },
        { path: '/management/quotes', icon: FileText, label: 'Quotes', pageId: 'quotes' },
        { path: '/management/appointments', icon: CalendarDays, label: 'Appointments', pageId: 'appointments' },
        { path: '/management/work-orders', icon: ClipboardCheck, label: 'Work Orders', pageId: 'workOrders' },
      ],
    },
    {
      title: 'Admin',
      requiresAdmin: true,
      items: [
        { path: '/admin/audit', icon: ClipboardList, label: 'Audit Logs' },
        { path: '/admin/bamboogli', icon: MessageSquare, label: 'Bamboogli' },
        { path: '/admin/commissions', icon: DollarSign, label: 'Commissions' },
        { path: '/admin/service-admin', icon: Wrench, label: 'Service Admin' },
        { path: '/admin/integrations', icon: Camera, label: 'Integrations' },
        { path: '/admin/pandasign', icon: PenTool, label: 'PandaSign' },
        { path: '/admin/ringcentral', icon: PhoneCall, label: 'RingCentral' },
        { path: '/admin/roles', icon: Shield, label: 'Roles & Permissions' },
        { path: '/admin/templates', icon: FileCheck, label: 'Templates' },
        { path: '/admin/training-bot', icon: Bot, label: 'Training Bot' },
        { path: '/admin/users', icon: Users, label: 'User Management' },
        { path: '/admin/workflows', icon: Workflow, label: 'Workflows' },
        { path: '/admin/help', icon: HelpCircle, label: 'Help Center Admin' },
      ],
    },
    {
      title: 'Settings',
      items: [
        { path: '/settings/profile', icon: User, label: 'My Profile' },
        { path: '/settings/notifications', icon: Bell, label: 'Notifications' },
        { path: '/settings', icon: Settings, label: 'Settings' },
      ],
    },
    {
      title: 'Help',
      items: [
        { path: '/help', icon: HelpCircle, label: 'Help & Support' },
      ],
    },
  ];

  // Check if user is admin
  // Handle both object role (role.name) and string role formats
  const roleName = typeof user?.role === 'object' ? user?.role?.name : user?.role;
  const roleType = user?.roleType?.toLowerCase() || '';
  const isAdmin = roleName?.toLowerCase()?.includes('admin') ||
                  roleType === 'admin' || roleType === 'executive';

  return (
    <div className="space-y-6 pb-8">
      {/* User Profile Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-r from-panda-primary to-panda-secondary flex items-center justify-center text-white text-xl font-bold">
            {user?.firstName?.[0] || 'U'}{user?.lastName?.[0] || ''}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {user?.firstName} {user?.lastName}
            </h2>
            <p className="text-sm text-gray-500">{user?.email}</p>
            <span className="inline-block mt-1 px-2 py-0.5 bg-panda-primary/10 text-panda-primary text-xs font-medium rounded">
              {user?.role?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'User'}
            </span>
          </div>
        </div>
      </div>

      {/* Menu Sections */}
      {menuSections.map((section) => {
        // Skip admin sections for non-admin users
        if (section.requiresAdmin && !isAdmin) return null;

        // Filter items based on page access for management sections
        let visibleItems = section.items;
        if (section.requiresPageAccess) {
          visibleItems = section.items.filter(item =>
            !item.pageId || hasPageAccess(item.pageId)
          );
          // Skip the entire section if no items are visible
          if (visibleItems.length === 0) return null;
        }

        return (
          <div key={section.title}>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1 mb-2">
              {section.title}
            </h3>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              {visibleItems.map((item, index) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors ${
                    index > 0 ? 'border-t border-gray-100' : ''
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-gray-100">
                      <item.icon className="w-5 h-5 text-gray-600" />
                    </div>
                    <span className="font-medium text-gray-900">{item.label}</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </Link>
              ))}
            </div>
          </div>
        );
      })}

      {/* Logout Button */}
      <button
        onClick={handleLogout}
        className="w-full flex items-center justify-center space-x-2 px-4 py-3.5 bg-red-50 text-red-600 rounded-xl font-medium hover:bg-red-100 transition-colors"
      >
        <LogOut className="w-5 h-5" />
        <span>Sign Out</span>
      </button>

      {/* App Version */}
      <p className="text-center text-xs text-gray-400">
        Panda CRM v1.0.0
      </p>
    </div>
  );
}
