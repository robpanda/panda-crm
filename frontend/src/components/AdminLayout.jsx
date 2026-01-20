import { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Settings,
  Search,
  ChevronRight,
  ClipboardList,
  Workflow,
  MessageSquare,
  Phone,
  DollarSign,
  Trash2,
  HelpCircle,
  Link2,
  Layers,
  FileSignature,
  PhoneCall,
  FileText,
  Users,
  Shield,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';

// Setup categories with their routes - alphabetized
const SETUP_CATEGORIES = [
  { id: 'audit', name: 'Audit Logs', icon: ClipboardList, description: 'System activity and change tracking', path: '/admin/audit' },
  { id: 'workflows', name: 'Workflows', icon: Workflow, description: 'Automated business processes and triggers', path: '/admin/workflows' },
  { id: 'bamboogli', name: 'Bamboogli', icon: MessageSquare, description: 'SMS and email messaging', path: '/admin/bamboogli' },
  { id: 'callcenter', name: 'Call Center', icon: Phone, description: 'Call center configuration', path: '/admin/call-center' },
  { id: 'commissions', name: 'Commission Engine', icon: DollarSign, description: 'Commission rules and calculations', path: '/admin/commissions' },
  { id: 'deleted', name: 'Deleted Records', icon: Trash2, description: 'Restore deleted records', path: '/admin/deleted' },
  { id: 'help', name: 'Help Admin', icon: HelpCircle, description: 'Help articles and documentation', path: '/admin/help' },
  { id: 'integrations', name: 'Integrations', icon: Link2, description: 'Third-party integrations', path: '/admin/integrations' },
  { id: 'modules', name: 'Module Manager', icon: Layers, description: 'Configure system modules', path: '/admin/setup' },
  { id: 'pandasign', name: 'PandaSign', icon: FileSignature, description: 'E-signature settings', path: '/admin/pandasign' },
  { id: 'ringcentral', name: 'RingCentral', icon: PhoneCall, description: 'Phone system integration', path: '/admin/ringcentral' },
  { id: 'templates', name: 'Templates', icon: FileText, description: 'Email and SMS templates', path: '/admin/templates' },
  { id: 'users', name: 'Users & Permissions', icon: Users, description: 'User management and roles', path: '/admin/users' },
];


export default function AdminLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Determine active category based on current path
  const activeCategory = useMemo(() => {
    const path = location.pathname;
    const category = SETUP_CATEGORIES.find(cat => path.startsWith(cat.path));
    return category?.id || null;
  }, [location.pathname]);

  // Filter categories based on search
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return SETUP_CATEGORIES;
    const query = searchQuery.toLowerCase();
    return SETUP_CATEGORIES.filter(
      cat => cat.name.toLowerCase().includes(query) || cat.description.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  const handleCategoryClick = (category) => {
    navigate(category.path);
  };

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Left Sidebar */}
      <div className={`${isCollapsed ? 'w-16' : 'w-64'} bg-white border-r border-gray-200 flex flex-col h-full flex-shrink-0 hidden lg:flex transition-all duration-300`}>
        {/* Setup Header */}
        <div className={`${isCollapsed ? 'p-2' : 'p-4'} border-b border-gray-200`}>
          <div className="flex items-center justify-between">
            <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'space-x-2'}`}>
              <Settings className="w-5 h-5 text-panda-primary" />
              {!isCollapsed && <h1 className="text-lg font-semibold text-gray-900">Setup</h1>}
            </div>
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? (
                <PanelLeft className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Quick Find Search - Hidden when collapsed */}
        {!isCollapsed && (
          <div className="p-3 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Quick Find..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
              />
            </div>
          </div>
        )}

        {/* Navigation Categories */}
        <nav className={`flex-1 overflow-y-auto ${isCollapsed ? 'p-1' : 'p-2'}`}>
          {filteredCategories.map((category) => {
            const isActive = activeCategory === category.id;
            const Icon = category.icon;

            return (
              <div key={category.id}>
                {isCollapsed ? (
                  /* Collapsed view - icon only with tooltip */
                  <button
                    onClick={() => handleCategoryClick(category)}
                    title={category.name}
                    className={`w-full flex items-center justify-center p-3 rounded-lg transition-colors mb-1 group relative ${
                      isActive
                        ? 'bg-gradient-to-r from-panda-primary/10 to-panda-secondary/10 text-panda-primary'
                        : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? 'text-panda-primary' : 'text-gray-400'}`} />
                    {/* Tooltip on hover */}
                    <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                      {category.name}
                    </div>
                  </button>
                ) : (
                  /* Expanded view */
                  <button
                    onClick={() => handleCategoryClick(category)}
                    className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-left transition-colors mb-1 ${
                      isActive
                        ? 'bg-gradient-to-r from-panda-primary/10 to-panda-secondary/10 text-panda-primary'
                        : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-panda-primary' : 'text-gray-400'}`} />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium block truncate">{category.name}</span>
                      <span className="text-xs text-gray-400 truncate block">{category.description}</span>
                    </div>
                    <ChevronRight className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-panda-primary' : 'text-gray-400'}`} />
                  </button>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className={`${isCollapsed ? 'p-2' : 'p-3'} border-t border-gray-200`}>
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-start'}`}>
            {!isCollapsed && (
              <div className="flex items-center space-x-2 text-xs text-gray-400">
                <Shield className="w-4 h-4" />
                <span>Admin Access</span>
              </div>
            )}
            {isCollapsed && (
              <Shield className="w-4 h-4 text-gray-400" />
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto bg-gray-50">
        {children}
      </div>
    </div>
  );
}
