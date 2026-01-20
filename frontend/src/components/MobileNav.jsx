import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  UserPlus,
  Briefcase,
  AlertCircle,
  MoreHorizontal,
} from 'lucide-react';

const mobileNavItems = [
  { path: '/', icon: LayoutDashboard, label: 'Home' },
  { path: '/leads', icon: UserPlus, label: 'Leads' },
  { path: '/jobs', icon: Briefcase, label: 'Jobs' },
  { path: '/attention', icon: AlertCircle, label: 'Attention', badge: true },
];

export default function MobileNav() {
  const location = useLocation();

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 pb-safe">
      <div className="flex items-center justify-around h-16">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center justify-center w-full h-full relative ${
                active ? 'text-panda-primary' : 'text-gray-500'
              }`}
            >
              <div className="relative">
                <Icon className="w-6 h-6" />
                {item.badge && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold w-4 h-4 rounded-full flex items-center justify-center">
                    3
                  </span>
                )}
              </div>
              <span className="text-xs mt-1 font-medium">{item.label}</span>
              {active && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-gradient-to-r from-panda-primary to-panda-secondary rounded-b-full" />
              )}
            </NavLink>
          );
        })}

        {/* More button that triggers sidebar */}
        <NavLink
          to="/more"
          className={`flex flex-col items-center justify-center w-full h-full ${
            location.pathname.startsWith('/more') ||
            location.pathname.startsWith('/admin') ||
            location.pathname.startsWith('/settings')
              ? 'text-panda-primary'
              : 'text-gray-500'
          }`}
        >
          <MoreHorizontal className="w-6 h-6" />
          <span className="text-xs mt-1 font-medium">More</span>
        </NavLink>
      </div>
    </nav>
  );
}
