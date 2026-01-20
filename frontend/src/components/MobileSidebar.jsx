import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  X,
  LayoutDashboard,
  UserPlus,
  Target,
  AlertCircle,
  Building2,
  Users,
  Mail,
  FileText,
  HelpCircle,
  BookOpen,
  Package,
  BarChart3,
  Calendar,
  Settings,
  Calculator,
  CreditCard,
  Phone,
  Cog,
  Briefcase,
  ListTodo,
  DollarSign,
  Receipt,
  FileSignature,
  CalendarDays,
  ClipboardCheck,
  ChevronDown,
  LogOut,
  Ticket,
} from 'lucide-react';
import { useState } from 'react';

// Main navigation items
const mainNavItems = [
  { path: '/', icon: LayoutDashboard, label: 'Home' },
  { path: '/leads', icon: UserPlus, label: 'Leads' },
  { path: '/jobs', icon: Target, label: 'Jobs' },
  { path: '/attention', icon: AlertCircle, label: 'Attention' },
];

// More navigation items
const moreNavItems = [
  { path: '/accounts', icon: Building2, label: 'Accounts' },
  { path: '/campaigns', icon: Mail, label: 'Campaigns' },
  { path: '/contacts', icon: Users, label: 'Contacts' },
  { path: '/dashboards', icon: LayoutDashboard, label: 'Dashboards' },
  { path: '/documents', icon: FileText, label: 'Documents' },
  { path: '/help', icon: HelpCircle, label: 'Help & Support' },
  { path: '/pricebooks', icon: BookOpen, label: 'Price Books' },
  { path: '/products', icon: Package, label: 'Products' },
  { path: '/reports', icon: BarChart3, label: 'Reports' },
  { path: '/schedule', icon: Calendar, label: 'Schedule' },
  { path: '/support', icon: Ticket, label: 'Support Tickets' },
];

// Management pages
const managementNavItems = [
  { path: '/management/cases', icon: Briefcase, label: 'Cases', pageId: 'cases' },
  { path: '/management/tasks', icon: ListTodo, label: 'Tasks', pageId: 'tasks' },
  { path: '/management/commissions', icon: DollarSign, label: 'Commissions', pageId: 'commissions' },
  { path: '/management/invoices', icon: Receipt, label: 'Invoices', pageId: 'invoices' },
  { path: '/management/contracts', icon: FileSignature, label: 'Contracts', pageId: 'contracts' },
  { path: '/management/quotes', icon: FileText, label: 'Quotes', pageId: 'quotes' },
  { path: '/management/appointments', icon: CalendarDays, label: 'Appointments', pageId: 'appointments' },
  { path: '/management/work-orders', icon: ClipboardCheck, label: 'Work Orders', pageId: 'workOrders' },
];

// Admin items
const adminNavItems = [
  { path: '/admin/commissions', icon: Calculator, label: 'Commission Engine' },
  { path: '/admin/payment-engine', icon: CreditCard, label: 'Payment Center' },
  { path: '/admin/ringcentral', icon: Phone, label: 'RingCentral' },
  { path: '/admin/service-admin', icon: Calendar, label: 'Service Admin' },
  { path: '/admin/setup', icon: Cog, label: 'Setup' },
];

function NavItem({ path, icon: Icon, label, onClose }) {
  return (
    <NavLink
      to={path}
      onClick={onClose}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${
          isActive
            ? 'bg-panda-primary/10 text-panda-primary border-l-4 border-panda-primary'
            : 'text-gray-700 hover:bg-gray-100 border-l-4 border-transparent'
        }`
      }
    >
      <Icon className="w-5 h-5" />
      <span>{label}</span>
    </NavLink>
  );
}

function CollapsibleSection({ title, items, onClose, hasPageAccess, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  // Filter items by page access if needed
  const visibleItems = items.filter(item => !item.pageId || hasPageAccess(item.pageId));

  if (visibleItems.length === 0) return null;

  return (
    <div className="border-t border-gray-100">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:bg-gray-50"
      >
        <span>{title}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="pb-2">
          {visibleItems.map((item) => (
            <NavItem key={item.path} {...item} onClose={onClose} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function MobileSidebar({ isOpen, onClose }) {
  const { user, logout, isActualUserAdmin, hasPageAccess } = useAuth();
  const isAdmin = isActualUserAdmin();

  const handleLogout = () => {
    onClose();
    logout();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 z-50 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Sidebar Panel */}
      <div
        className={`fixed top-0 left-0 h-full w-80 max-w-[85vw] bg-white z-50 shadow-xl transform transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}>
          <img
            src="/logo-gradient.png"
            alt="Panda CRM"
            className="h-8 w-auto"
          />
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 active:bg-gray-200"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* User Info */}
        <div className="p-4 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-panda-primary to-panda-secondary flex items-center justify-center flex-shrink-0">
              <span className="text-white text-lg font-semibold">
                {(user?.firstName || user?.email || 'U').charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 truncate">
                {user?.firstName && user?.lastName
                  ? `${user.firstName} ${user.lastName}`
                  : user?.name || user?.email || 'User'}
              </p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            </div>
          </div>
        </div>

        {/* Scrollable Navigation */}
        <div className="overflow-y-auto h-[calc(100vh-12rem)]" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          {/* Main Navigation */}
          <div className="py-2">
            {mainNavItems.map((item) => (
              <NavItem key={item.path} {...item} onClose={onClose} />
            ))}
          </div>

          {/* More Section */}
          <CollapsibleSection
            title="More"
            items={moreNavItems}
            onClose={onClose}
            hasPageAccess={hasPageAccess}
            defaultOpen={false}
          />

          {/* Management Section */}
          <CollapsibleSection
            title="Management"
            items={managementNavItems}
            onClose={onClose}
            hasPageAccess={hasPageAccess}
            defaultOpen={false}
          />

          {/* Admin Section */}
          {isAdmin && (
            <CollapsibleSection
              title="Admin"
              items={adminNavItems}
              onClose={onClose}
              hasPageAccess={hasPageAccess}
              defaultOpen={false}
            />
          )}

          {/* Settings & Logout */}
          <div className="border-t border-gray-100 py-2">
            <NavItem path="/settings" icon={Settings} label="Settings" onClose={onClose} />
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 border-l-4 border-transparent"
            >
              <LogOut className="w-5 h-5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
