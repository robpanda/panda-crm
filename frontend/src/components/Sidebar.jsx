import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  Users,
  UserPlus,
  Target,
  AlertCircle,
  BarChart3,
  Calendar,
  FileText,
  Settings,
} from 'lucide-react';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/accounts', icon: Building2, label: 'Accounts' },
  { path: '/contacts', icon: Users, label: 'Contacts' },
  { path: '/leads', icon: UserPlus, label: 'Leads' },
  { path: '/opportunities', icon: Target, label: 'Opportunities' },
  { path: '/attention', icon: AlertCircle, label: 'Attention Queue', badge: true },
  { divider: true },
  { path: '/schedule', icon: Calendar, label: 'Schedule' },
  { path: '/reports', icon: BarChart3, label: 'Reports' },
  { path: '/documents', icon: FileText, label: 'Documents' },
];

export default function Sidebar() {
  const location = useLocation();

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <aside className="fixed left-0 top-16 bottom-0 w-64 bg-white border-r border-gray-200 overflow-y-auto">
      <nav className="p-4 space-y-1">
        {navItems.map((item, index) => {
          if (item.divider) {
            return <div key={index} className="my-4 border-t border-gray-200" />;
          }

          const Icon = item.icon;
          const active = isActive(item.path);

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
                active
                  ? 'bg-gradient-to-r from-panda-primary/10 to-panda-secondary/10 text-panda-primary'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Icon className={`w-5 h-5 ${active ? 'text-panda-primary' : ''}`} />
              <span className={`font-medium ${active ? 'text-panda-primary' : ''}`}>
                {item.label}
              </span>
              {item.badge && (
                <span className="ml-auto bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  3
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 bg-white">
        <NavLink
          to="/settings"
          className="flex items-center space-x-3 px-3 py-2.5 text-gray-600 hover:bg-gray-100 rounded-lg"
        >
          <Settings className="w-5 h-5" />
          <span className="font-medium">Settings</span>
        </NavLink>
      </div>
    </aside>
  );
}
