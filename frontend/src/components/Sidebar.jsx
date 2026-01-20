import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Building2,
  Users,
  UserPlus,
  Briefcase,
  AlertCircle,
  BarChart3,
  Calendar,
  FileText,
  Settings,
  DollarSign,
  Mail,
  X,
  BookOpen,
  Package,
  Bot,
  Wrench,
  HelpCircle,
  Gift,
  Phone,
  CreditCard,
  LifeBuoy,
} from 'lucide-react';

const mainNavItems = [
  { path: '/', icon: LayoutDashboard, label: 'Home' },
  { path: '/leads', icon: UserPlus, label: 'Leads' },
  { path: '/contacts', icon: Users, label: 'Contacts' },
  { path: '/accounts', icon: Building2, label: 'Accounts' },
  { path: '/jobs', icon: Briefcase, label: 'Jobs' },
  { path: '/attention', icon: AlertCircle, label: 'Attention Queue', badge: true },
];

const secondaryNavItems = [
  { path: '/schedule', icon: Calendar, label: 'Schedule' },
  { path: '/my-commissions', icon: DollarSign, label: 'My Commissions' },
  { path: '/documents', icon: FileText, label: 'Documents' },
  { path: '/pricebooks', icon: BookOpen, label: 'Price Books' },
  { path: '/products', icon: Package, label: 'Products' },
  { path: '/campaigns', icon: Mail, label: 'Campaigns' },
  { path: '/reports', icon: BarChart3, label: 'Reports' },
  { path: '/support', icon: LifeBuoy, label: 'Support' },
  { path: '/help', icon: HelpCircle, label: 'Help & Support' },
];

// Admin dropdown items - alphabetized
// NOTE: Audit Logs, Bamboogli, Call Center, Commission Engine, Help Admin, PandaSign, Templates
// have been moved to Setup sidebar (Admin > Setup)
const adminNavItems = [
  { path: '/admin/payment-engine', icon: CreditCard, label: 'Payment Center' },
  { path: '/admin/referral', icon: Gift, label: 'Referral Program' },
  { path: '/admin/ringcentral', icon: Phone, label: 'RingCentral' },
  { path: '/admin/service-admin', icon: Wrench, label: 'Service Admin' },
  { path: '/admin/setup', icon: Settings, label: 'Setup' },
  { path: '/admin/training-bot', icon: Bot, label: 'Training Bot' },
];

export default function Sidebar({ isOpen, onClose, isMobile }) {
  const location = useLocation();
  const { user } = useAuth();

  // Check if user has admin access
  // Handle both object role (role.name) and string role formats
  const roleName = typeof user?.role === 'object' ? user?.role?.name : user?.role;
  const roleType = user?.roleType?.toLowerCase() || '';
  const isAdmin = roleName?.toLowerCase()?.includes('admin') ||
                  roleType === 'admin' || roleType === 'executive';

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const NavItem = ({ item }) => {
    const Icon = item.icon;
    const active = isActive(item.path);

    return (
      <NavLink
        to={item.path}
        className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
          active
            ? 'bg-gradient-to-r from-panda-primary/10 to-panda-secondary/10 text-panda-primary'
            : 'text-gray-600 hover:bg-gray-100 active:bg-gray-200'
        }`}
        onClick={isMobile ? onClose : undefined}
      >
        <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-panda-primary' : ''}`} />
        <span className={`font-medium truncate ${active ? 'text-panda-primary' : ''}`}>
          {item.label}
        </span>
        {item.badge && (
          <span className="ml-auto bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            3
          </span>
        )}
      </NavLink>
    );
  };

  return (
    <aside
      className={`fixed top-0 bottom-0 w-64 bg-white border-r border-gray-200 overflow-y-auto transition-transform duration-300 z-50 ${
        isMobile
          ? isOpen
            ? 'translate-x-0'
            : '-translate-x-full'
          : 'translate-x-0 top-16'
      }`}
    >
      {/* Mobile Header */}
      {isMobile && (
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-r from-panda-primary to-panda-secondary rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">P</span>
            </div>
            <span className="font-semibold text-gray-800">Panda CRM</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 active:bg-gray-200"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
      )}

      <nav className="p-4 space-y-1">
        {/* Main Navigation */}
        {mainNavItems.map((item) => (
          <NavItem key={item.path} item={item} />
        ))}

        <div className="my-4 border-t border-gray-200" />

        {/* Secondary Navigation */}
        {secondaryNavItems.map((item) => (
          <NavItem key={item.path} item={item} />
        ))}

        {/* Admin Section */}
        {isAdmin && (
          <>
            <div className="my-4 border-t border-gray-200" />
            <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Administration
            </div>
            {adminNavItems.map((item) => (
              <NavItem key={item.path} item={item} />
            ))}
          </>
        )}
      </nav>

      {/* Bottom section */}
      <div className={`absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 bg-white ${isMobile ? 'pb-safe' : ''}`}>
        <NavLink
          to="/settings"
          className="flex items-center space-x-3 px-3 py-2.5 text-gray-600 hover:bg-gray-100 active:bg-gray-200 rounded-lg"
          onClick={isMobile ? onClose : undefined}
        >
          <Settings className="w-5 h-5" />
          <span className="font-medium">Settings</span>
        </NavLink>
      </div>
    </aside>
  );
}
