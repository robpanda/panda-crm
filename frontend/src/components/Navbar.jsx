import { useState, useRef, useEffect } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRingCentral } from '../context/RingCentralContext';
import { usersApi } from '../services/api';
import {
  Bell,
  Search,
  LogOut,
  Settings,
  ChevronDown,
  Menu,
  X,
  LayoutDashboard,
  Building2,
  Users,
  UserPlus,
  Target,
  AlertCircle,
  Calendar,
  FileText,
  BarChart3,
  Mail,
  BookOpen,
  Package,
  Workflow,
  DollarSign,
  Camera,
  Shield,
  ClipboardList,
  MoreHorizontal,
  CreditCard,
  Cog,
  List,
  Plus,
  PenTool,
  MapPin,
  MessageSquare,
  Phone,
  PhoneCall,
  PhoneOff,
  Eye,
  EyeOff,
} from 'lucide-react';

const leadsNavItems = [
  { path: '/leads', icon: BarChart3, label: 'Lead Dashboard' },
  { path: '/leads/list', icon: List, label: 'Lead List' },
  { path: '/leads/new', icon: Plus, label: 'New Lead' },
];

const opportunitiesNavItems = [
  { path: '/jobs', icon: BarChart3, label: 'Jobs Dashboard' },
  { path: '/jobs/list', icon: List, label: 'Job List' },
  { path: '/jobs/new', icon: Plus, label: 'New Job' },
];

const accountsNavItems = [
  { path: '/accounts', icon: BarChart3, label: 'Accounts Dashboard' },
  { path: '/accounts/list', icon: List, label: 'Account List' },
  { path: '/accounts/new', icon: Plus, label: 'New Account' },
];

const contactsNavItems = [
  { path: '/contacts', icon: BarChart3, label: 'Contacts Dashboard' },
  { path: '/contacts/list', icon: List, label: 'Contact List' },
  { path: '/contacts/new', icon: Plus, label: 'New Contact' },
];

const moreNavItems = [
  { path: '/schedule', icon: Calendar, label: 'Schedule' },
  { path: '/documents', icon: FileText, label: 'Documents' },
  { path: '/pricebooks', icon: BookOpen, label: 'Price Books' },
  { path: '/products', icon: Package, label: 'Products' },
  { path: '/campaigns', icon: Mail, label: 'Campaigns' },
  { path: '/reports', icon: BarChart3, label: 'Reports' },
  { path: '/dashboards', icon: LayoutDashboard, label: 'Dashboards' },
];

const adminNavItems = [
  { path: '/admin/workflows', icon: Workflow, label: 'Workflows' },
  { path: '/admin/field-service', icon: Calendar, label: 'Schedule Admin' },
  { path: '/admin/commissions', icon: DollarSign, label: 'Commissions' },
  { path: '/admin/commission-engine', icon: Cog, label: 'Commission Engine' },
  { path: '/admin/payment-engine', icon: CreditCard, label: 'Payment Center' },
  { path: '/admin/pandasign', icon: PenTool, label: 'PandaSign' },
  { path: '/admin/bamboogli', icon: MessageSquare, label: 'Bamboogli' },
  { path: '/admin/templates', icon: FileText, label: 'Templates' },
  { path: '/admin/integrations', icon: Camera, label: 'Integrations' },
  { path: '/admin/users', icon: Users, label: 'User Management' },
  { path: '/admin/roles', icon: Shield, label: 'Roles & Permissions' },
  { path: '/admin/audit', icon: ClipboardList, label: 'Audit Logs' },
];

export default function Navbar({ onMenuClick, showMenuButton }) {
  const {
    user,
    logout,
    actualUser,
    isImpersonating,
    startImpersonation,
    stopImpersonation,
    isActualUserAdmin
  } = useAuth();
  const { isReady, isLoggedIn, currentCall, setMinimized } = useRingCentral();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showLeadsMenu, setShowLeadsMenu] = useState(false);
  const [showOpportunitiesMenu, setShowOpportunitiesMenu] = useState(false);
  const [showAccountsMenu, setShowAccountsMenu] = useState(false);
  const [showContactsMenu, setShowContactsMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showViewAsMenu, setShowViewAsMenu] = useState(false);
  const [viewAsSearch, setViewAsSearch] = useState('');
  const [viewAsUsers, setViewAsUsers] = useState([]);
  const [viewAsLoading, setViewAsLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const leadsMenuRef = useRef(null);
  const opportunitiesMenuRef = useRef(null);
  const accountsMenuRef = useRef(null);
  const contactsMenuRef = useRef(null);
  const moreMenuRef = useRef(null);
  const adminMenuRef = useRef(null);
  const userMenuRef = useRef(null);
  const viewAsMenuRef = useRef(null);

  // Check if the actual logged-in user (not impersonated) is admin
  const canImpersonate = isActualUserAdmin();

  // Show admin for Super Admin or Admin roles only (checks actual user, not impersonated)
  const isAdmin = canImpersonate;

  // Build display name - show just first name in navbar
  const displayName = user?.firstName || user?.name?.split(' ')[0] || 'User';
  const displayInitial = displayName.charAt(0).toUpperCase();

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
      setShowSearch(false);
    }
  };

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const isLeadsActive = location.pathname.startsWith('/leads');
  const isOpportunitiesActive = location.pathname.startsWith('/jobs') || location.pathname.startsWith('/opportunities');
  const isAccountsActive = location.pathname.startsWith('/accounts');
  const isContactsActive = location.pathname.startsWith('/contacts');
  const isMoreActive = moreNavItems.some(item => isActive(item.path));
  const isAdminActive = adminNavItems.some(item => isActive(item.path));

  // Load users for View As dropdown when opened
  useEffect(() => {
    if (showViewAsMenu && canImpersonate && viewAsUsers.length === 0) {
      setViewAsLoading(true);
      usersApi.getUsersForDropdown({ limit: 100 })
        .then(users => {
          setViewAsUsers(users || []);
        })
        .catch(err => {
          console.error('Failed to load users for View As:', err);
        })
        .finally(() => {
          setViewAsLoading(false);
        });
    }
  }, [showViewAsMenu, canImpersonate, viewAsUsers.length]);

  // Filter users based on search
  const filteredViewAsUsers = viewAsUsers.filter(u => {
    if (!viewAsSearch) return true;
    const search = viewAsSearch.toLowerCase();
    const name = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
    const email = (u.email || '').toLowerCase();
    return name.includes(search) || email.includes(search);
  });

  // Handle selecting a user to impersonate
  const handleViewAsUser = async (targetUser) => {
    try {
      await startImpersonation(targetUser);
      setShowViewAsMenu(false);
      setViewAsSearch('');
      // Navigate to home to see the view as that user
      navigate('/');
    } catch (err) {
      console.error('Failed to impersonate user:', err);
    }
  };

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (leadsMenuRef.current && !leadsMenuRef.current.contains(event.target)) {
        setShowLeadsMenu(false);
      }
      if (opportunitiesMenuRef.current && !opportunitiesMenuRef.current.contains(event.target)) {
        setShowOpportunitiesMenu(false);
      }
      if (accountsMenuRef.current && !accountsMenuRef.current.contains(event.target)) {
        setShowAccountsMenu(false);
      }
      if (contactsMenuRef.current && !contactsMenuRef.current.contains(event.target)) {
        setShowContactsMenu(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target)) {
        setShowMoreMenu(false);
      }
      if (adminMenuRef.current && !adminMenuRef.current.contains(event.target)) {
        setShowAdminMenu(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
      if (viewAsMenuRef.current && !viewAsMenuRef.current.contains(event.target)) {
        setShowViewAsMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close menus on route change
  useEffect(() => {
    setShowLeadsMenu(false);
    setShowOpportunitiesMenu(false);
    setShowAccountsMenu(false);
    setShowContactsMenu(false);
    setShowMoreMenu(false);
    setShowAdminMenu(false);
    setShowUserMenu(false);
    setShowViewAsMenu(false);
  }, [location.pathname]);

  return (
    <nav className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-gray-200 z-50 shadow-sm">
      <div className="flex items-center justify-between h-full px-4 max-w-[1920px] mx-auto">
        {/* Left side - Logo and Navigation */}
        <div className="flex items-center space-x-1">
          {/* Mobile menu button */}
          {showMenuButton && (
            <button
              onClick={onMenuClick}
              className="p-2 -ml-2 rounded-lg hover:bg-gray-100 active:bg-gray-200 lg:hidden"
            >
              <Menu className="w-6 h-6 text-gray-600" />
            </button>
          )}

          {/* Logo */}
          <Link to="/" className="flex items-center mr-6">
            <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-orange-500 bg-clip-text text-transparent">
              Bamboo 2.0
            </span>
          </Link>

          {/* Main Navigation - Desktop */}
          <div className="hidden lg:flex items-center space-x-1">
            {/* Home Link */}
            <NavLink
              to="/"
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === '/'
                  ? 'bg-gradient-to-r from-panda-primary/10 to-panda-secondary/10 text-panda-primary'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Home</span>
            </NavLink>

            {/* Leads Dropdown */}
            <div className="relative" ref={leadsMenuRef}>
              <button
                onClick={() => setShowLeadsMenu(!showLeadsMenu)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isLeadsActive || showLeadsMenu
                    ? 'bg-gradient-to-r from-panda-primary/10 to-panda-secondary/10 text-panda-primary'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <UserPlus className="w-4 h-4" />
                <span>Leads</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${showLeadsMenu ? 'rotate-180' : ''}`} />
              </button>

              {showLeadsMenu && (
                <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                  {leadsNavItems.map((item) => {
                    const Icon = item.icon;
                    const active = location.pathname === item.path;
                    return (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        className={`flex items-center space-x-3 px-4 py-2.5 text-sm transition-colors ${
                          active
                            ? 'bg-panda-primary/10 text-panda-primary'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Jobs Dropdown */}
            <div className="relative" ref={opportunitiesMenuRef}>
              <button
                onClick={() => setShowOpportunitiesMenu(!showOpportunitiesMenu)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isOpportunitiesActive || showOpportunitiesMenu
                    ? 'bg-gradient-to-r from-panda-primary/10 to-panda-secondary/10 text-panda-primary'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Target className="w-4 h-4" />
                <span>Jobs</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${showOpportunitiesMenu ? 'rotate-180' : ''}`} />
              </button>

              {showOpportunitiesMenu && (
                <div className="absolute top-full left-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                  {opportunitiesNavItems.map((item) => {
                    const Icon = item.icon;
                    const active = location.pathname === item.path;
                    return (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        className={`flex items-center space-x-3 px-4 py-2.5 text-sm transition-colors ${
                          active
                            ? 'bg-panda-primary/10 text-panda-primary'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Accounts Dropdown */}
            <div className="relative" ref={accountsMenuRef}>
              <button
                onClick={() => setShowAccountsMenu(!showAccountsMenu)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isAccountsActive || showAccountsMenu
                    ? 'bg-gradient-to-r from-panda-primary/10 to-panda-secondary/10 text-panda-primary'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Building2 className="w-4 h-4" />
                <span>Accounts</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${showAccountsMenu ? 'rotate-180' : ''}`} />
              </button>

              {showAccountsMenu && (
                <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                  {accountsNavItems.map((item) => {
                    const Icon = item.icon;
                    const active = location.pathname === item.path;
                    return (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        className={`flex items-center space-x-3 px-4 py-2.5 text-sm transition-colors ${
                          active
                            ? 'bg-panda-primary/10 text-panda-primary'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Contacts Dropdown */}
            <div className="relative" ref={contactsMenuRef}>
              <button
                onClick={() => setShowContactsMenu(!showContactsMenu)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isContactsActive || showContactsMenu
                    ? 'bg-gradient-to-r from-panda-primary/10 to-panda-secondary/10 text-panda-primary'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Contacts</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${showContactsMenu ? 'rotate-180' : ''}`} />
              </button>

              {showContactsMenu && (
                <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                  {contactsNavItems.map((item) => {
                    const Icon = item.icon;
                    const active = location.pathname === item.path;
                    return (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        className={`flex items-center space-x-3 px-4 py-2.5 text-sm transition-colors ${
                          active
                            ? 'bg-panda-primary/10 text-panda-primary'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Attention Queue Link */}
            <NavLink
              to="/attention"
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors relative ${
                isActive('/attention')
                  ? 'bg-gradient-to-r from-panda-primary/10 to-panda-secondary/10 text-panda-primary'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <AlertCircle className="w-4 h-4" />
              <span>Attention</span>
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full">
                3
              </span>
            </NavLink>

            {/* More Dropdown */}
            <div className="relative" ref={moreMenuRef}>
              <button
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isMoreActive || showMoreMenu
                    ? 'bg-gradient-to-r from-panda-primary/10 to-panda-secondary/10 text-panda-primary'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <MoreHorizontal className="w-4 h-4" />
                <span>More</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${showMoreMenu ? 'rotate-180' : ''}`} />
              </button>

              {showMoreMenu && (
                <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                  {moreNavItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.path);
                    return (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        className={`flex items-center space-x-3 px-4 py-2.5 text-sm transition-colors ${
                          active
                            ? 'bg-panda-primary/10 text-panda-primary'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Admin Dropdown */}
            {isAdmin && (
              <div className="relative" ref={adminMenuRef}>
                <button
                  onClick={() => setShowAdminMenu(!showAdminMenu)}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isAdminActive || showAdminMenu
                      ? 'bg-gradient-to-r from-panda-primary/10 to-panda-secondary/10 text-panda-primary'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Settings className="w-4 h-4" />
                  <span>Admin</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${showAdminMenu ? 'rotate-180' : ''}`} />
                </button>

                {showAdminMenu && (
                  <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                    {adminNavItems.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(item.path);
                      return (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          className={`flex items-center space-x-3 px-4 py-2.5 text-sm transition-colors whitespace-nowrap ${
                            active
                              ? 'bg-panda-primary/10 text-panda-primary'
                              : 'text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          <Icon className="w-4 h-4 flex-shrink-0" />
                          <span>{item.label}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Center - Search */}
        <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-md mx-4">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search accounts, contacts, opportunities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none transition-shadow bg-gray-50 focus:bg-white"
            />
          </div>
        </form>

        {/* Right side */}
        <div className="flex items-center space-x-2">
          {/* Mobile search toggle */}
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="p-2 text-gray-600 hover:bg-gray-100 active:bg-gray-200 rounded-lg md:hidden"
          >
            {showSearch ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
          </button>

          {/* RingCentral Phone Status */}
          <button
            onClick={() => setMinimized(false)}
            className={`relative p-2 rounded-lg transition-colors ${
              currentCall
                ? 'bg-green-100 text-green-600 hover:bg-green-200 animate-pulse'
                : isLoggedIn
                ? 'text-green-600 hover:bg-gray-100'
                : isReady
                ? 'text-yellow-600 hover:bg-gray-100'
                : 'text-gray-400 hover:bg-gray-100'
            }`}
            title={
              currentCall
                ? 'On call - Click to open dialer'
                : isLoggedIn
                ? 'Phone ready - Click to open dialer'
                : isReady
                ? 'Click to login to RingCentral'
                : 'Phone connecting...'
            }
          >
            {currentCall ? (
              <PhoneCall className="w-5 h-5" />
            ) : isLoggedIn ? (
              <Phone className="w-5 h-5" />
            ) : (
              <PhoneOff className="w-5 h-5" />
            )}
            {currentCall && (
              <span className="absolute top-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></span>
            )}
          </button>

          {/* View As dropdown - Admin only */}
          {canImpersonate && (
            <div className="relative hidden lg:block" ref={viewAsMenuRef}>
              <button
                onClick={() => setShowViewAsMenu(!showViewAsMenu)}
                className={`flex items-center space-x-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isImpersonating
                    ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
                title={isImpersonating ? `Viewing as ${user?.firstName || user?.email}` : 'View system as another user'}
              >
                <Eye className="w-4 h-4" />
                <span className="hidden xl:inline">View As</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${showViewAsMenu ? 'rotate-180' : ''}`} />
              </button>

              {showViewAsMenu && (
                <div className="absolute right-0 mt-1 w-72 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                  <div className="px-3 pb-2 border-b border-gray-100">
                    <input
                      type="text"
                      placeholder="Search users..."
                      value={viewAsSearch}
                      onChange={(e) => setViewAsSearch(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none"
                      autoFocus
                    />
                  </div>

                  {isImpersonating && (
                    <button
                      onClick={() => {
                        stopImpersonation();
                        setShowViewAsMenu(false);
                      }}
                      className="flex items-center w-full px-4 py-2.5 text-sm text-amber-700 hover:bg-amber-50 border-b border-gray-100"
                    >
                      <EyeOff className="w-4 h-4 mr-3" />
                      <span>Stop Viewing As</span>
                      <span className="ml-auto text-xs text-gray-500">
                        Back to {actualUser?.firstName || 'you'}
                      </span>
                    </button>
                  )}

                  <div className="max-h-64 overflow-y-auto">
                    {viewAsLoading ? (
                      <div className="px-4 py-3 text-sm text-gray-500 text-center">
                        Loading users...
                      </div>
                    ) : filteredViewAsUsers.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-gray-500 text-center">
                        {viewAsSearch ? 'No users found' : 'No users available'}
                      </div>
                    ) : (
                      filteredViewAsUsers.slice(0, 20).map((u) => (
                        <button
                          key={u.id}
                          onClick={() => handleViewAsUser(u)}
                          className={`flex items-center w-full px-4 py-2 text-sm hover:bg-gray-100 ${
                            user?.id === u.id ? 'bg-panda-primary/5' : ''
                          }`}
                        >
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center mr-3 flex-shrink-0">
                            <span className="text-white text-xs font-medium">
                              {(u.firstName || u.email || '?').charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0 text-left">
                            <p className="font-medium text-gray-900 truncate">
                              {u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.email}
                            </p>
                            <p className="text-xs text-gray-500 truncate">{u.role?.name || u.department || ''}</p>
                          </div>
                          {user?.id === u.id && (
                            <span className="ml-2 text-xs bg-panda-primary/10 text-panda-primary px-2 py-0.5 rounded">
                              Current
                            </span>
                          )}
                        </button>
                      ))
                    )}
                    {filteredViewAsUsers.length > 20 && (
                      <div className="px-4 py-2 text-xs text-gray-500 text-center border-t border-gray-100">
                        Showing first 20 results. Type to search more.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Notifications */}
          <button className="relative p-2 text-gray-600 hover:bg-gray-100 active:bg-gray-200 rounded-lg">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>

          {/* User menu */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center space-x-2 p-2 hover:bg-gray-100 active:bg-gray-200 rounded-lg"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-panda-primary to-panda-secondary flex items-center justify-center flex-shrink-0">
                <span className="text-white text-sm font-medium">
                  {displayInitial}
                </span>
              </div>
              <span className="text-sm font-medium text-gray-700 hidden lg:block max-w-[120px] truncate">
                {displayName}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-500 hidden lg:block" />
            </button>

            {showUserMenu && (
              <div className="absolute right-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.name || displayName}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                  <p className="text-xs text-panda-primary capitalize mt-1">{user?.role?.name || user?.roleType}</p>
                </div>

                <Link
                  to="/settings"
                  className="flex items-center px-4 py-3 text-sm text-gray-700 hover:bg-gray-100"
                  onClick={() => setShowUserMenu(false)}
                >
                  <Settings className="w-4 h-4 mr-3" />
                  Settings
                </Link>

                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    logout();
                  }}
                  className="flex items-center w-full px-4 py-3 text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut className="w-4 h-4 mr-3" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile search overlay */}
      {showSearch && (
        <div className="absolute top-16 left-0 right-0 bg-white border-b border-gray-200 p-4 md:hidden shadow-lg">
          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search accounts, contacts, opportunities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none text-base"
            />
          </form>
        </div>
      )}
    </nav>
  );
}
