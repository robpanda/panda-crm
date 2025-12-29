import { Link, useLocation } from 'react-router-dom';
import { Plus, List, Grid, Filter, Search } from 'lucide-react';

/**
 * SubNav - Sub-navigation component for list pages
 * Provides tabs for different views and a New button
 *
 * @param {Object} props
 * @param {string} props.entity - The entity name (e.g., 'Lead', 'Account', 'Opportunity')
 * @param {string} props.basePath - Base path for routes (e.g., '/leads', '/accounts')
 * @param {Array} props.tabs - Array of tab objects { id, label, path?, count? }
 * @param {string} props.activeTab - Currently active tab id
 * @param {Function} props.onTabChange - Callback when tab changes
 * @param {boolean} props.showNewButton - Whether to show the New button (default: true)
 * @param {string} props.newButtonPath - Path for New button (default: basePath/new)
 * @param {Function} props.onSearch - Callback for search input
 * @param {string} props.searchValue - Current search value
 * @param {boolean} props.showSearch - Whether to show search input (default: true)
 * @param {Function} props.onFilterClick - Callback for filter button click
 * @param {boolean} props.showFilter - Whether to show filter button (default: false)
 * @param {string} props.viewMode - Current view mode ('list' or 'grid')
 * @param {Function} props.onViewModeChange - Callback for view mode change
 * @param {boolean} props.showViewToggle - Whether to show view toggle (default: false)
 */
export default function SubNav({
  entity,
  basePath,
  tabs = [],
  activeTab,
  onTabChange,
  showNewButton = true,
  newButtonPath,
  onSearch,
  searchValue = '',
  showSearch = true,
  onFilterClick,
  showFilter = false,
  viewMode = 'list',
  onViewModeChange,
  showViewToggle = false,
}) {
  const location = useLocation();
  const newPath = newButtonPath || `${basePath}/new`;

  // Default tabs if none provided
  const defaultTabs = [
    { id: 'all', label: 'All', count: null },
    { id: 'recent', label: 'Recent', count: null },
    { id: 'my', label: `My ${entity}s`, count: null },
  ];

  const displayTabs = tabs.length > 0 ? tabs : defaultTabs;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6">
      {/* Top Row: Tabs and Actions */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        {/* Tabs */}
        <div className="flex items-center space-x-1">
          {displayTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange?.(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-panda-primary text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
              {tab.count !== null && tab.count !== undefined && (
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                  activeTab === tab.id
                    ? 'bg-white/20 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Right Side Actions */}
        <div className="flex items-center space-x-3">
          {/* View Toggle */}
          {showViewToggle && (
            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => onViewModeChange?.('list')}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === 'list'
                    ? 'bg-white text-panda-primary shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => onViewModeChange?.('grid')}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-white text-panda-primary shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Grid className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Filter Button */}
          {showFilter && (
            <button
              onClick={onFilterClick}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Filter className="w-5 h-5" />
            </button>
          )}

          {/* New Button */}
          {showNewButton && (
            <Link
              to={newPath}
              className="inline-flex items-center px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              New {entity}
            </Link>
          )}
        </div>
      </div>

      {/* Bottom Row: Search */}
      {showSearch && (
        <div className="px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchValue}
              onChange={(e) => onSearch?.(e.target.value)}
              placeholder={`Search ${entity.toLowerCase()}s...`}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent transition-all"
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * SubNavSimple - Simplified sub-navigation for pages that just need New button
 */
export function SubNavSimple({ entity, basePath, newButtonPath, title, subtitle }) {
  const newPath = newButtonPath || `${basePath}/new`;

  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title || `${entity}s`}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>
      <Link
        to={newPath}
        className="inline-flex items-center px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 transition-colors shadow-sm"
      >
        <Plus className="w-4 h-4 mr-2" />
        New {entity}
      </Link>
    </div>
  );
}
