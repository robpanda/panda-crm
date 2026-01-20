import React from 'react';
import {
  CalendarDays,
  DollarSign,
  FileText,
  Users,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Info,
  Camera,
} from 'lucide-react';

// Category definitions with their sub-tabs
export const CATEGORIES = {
  schedule: {
    id: 'schedule',
    label: 'Schedule',
    icon: CalendarDays,
    color: 'blue',
    subTabs: [
      { id: 'schedule', label: 'Appointments' },
      { id: 'tasks', label: 'Tasks' },
      { id: 'checklist', label: 'Checklist' },
    ],
  },
  financial: {
    id: 'financial',
    label: 'Financial',
    icon: DollarSign,
    color: 'green',
    subTabs: [
      { id: 'invoices', label: 'Invoices' },
      { id: 'payments', label: 'Payments' },
      { id: 'commissions', label: 'Commissions' },
      { id: 'quotes', label: 'Quotes' },
    ],
  },
  photos: {
    id: 'photos',
    label: 'Photos',
    icon: Camera,
    color: 'cyan',
    subTabs: [
      { id: 'photos', label: 'Gallery' },
      { id: 'checklists', label: 'Checklists' },
      { id: 'comparisons', label: 'Before/After' },
    ],
  },
  documents: {
    id: 'documents',
    label: 'Documents',
    icon: FileText,
    color: 'amber',
    subTabs: [
      { id: 'documents', label: 'Contracts' },
    ],
  },
  team: {
    id: 'team',
    label: 'Work Orders',
    icon: Users,
    color: 'purple',
    subTabs: [
      { id: 'workOrders', label: 'Work Orders' },
      { id: 'cases', label: 'Cases' },
      { id: 'approvals', label: 'Approvals' },
    ],
  },
  messages: {
    id: 'messages',
    label: 'Messages',
    icon: MessageSquare,
    color: 'rose',
    subTabs: [
      { id: 'conversations', label: 'Conversations' },
      { id: 'communications', label: 'Communications' },
      { id: 'notifications', label: 'Notifications' },
      { id: 'activity', label: 'Activity' },
    ],
  },
};

// Map old tab IDs to categories
export const TAB_TO_CATEGORY = {
  details: null, // Details stays as main content
  schedule: 'schedule',
  tasks: 'schedule',
  checklist: 'schedule',
  invoices: 'financial',
  payments: 'financial',
  commissions: 'financial',
  quotes: 'financial',
  photos: 'photos',
  checklists: 'photos',
  comparisons: 'photos',
  documents: 'documents',
  activity: 'messages',
  workOrders: 'team',
  cases: 'team',
  approvals: 'team',
  conversations: 'messages',
  communications: 'messages',
  notifications: 'messages',
};

export default function SuperTabNav({
  activeCategory,
  onCategoryChange,
  badgeCounts = {},
  className = '',
  showDetailsButton = false,
  isDetailsActive = false,
  onDetailsClick = () => {},
}) {
  const scrollRef = React.useRef(null);
  const [showLeftArrow, setShowLeftArrow] = React.useState(false);
  const [showRightArrow, setShowRightArrow] = React.useState(false);

  const checkScrollArrows = React.useCallback(() => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setShowLeftArrow(scrollLeft > 0);
      setShowRightArrow(scrollLeft + clientWidth < scrollWidth - 1);
    }
  }, []);

  React.useEffect(() => {
    checkScrollArrows();
    window.addEventListener('resize', checkScrollArrows);
    return () => window.removeEventListener('resize', checkScrollArrows);
  }, [checkScrollArrows]);

  const scroll = (direction) => {
    if (scrollRef.current) {
      const scrollAmount = 150;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
      setTimeout(checkScrollArrows, 300);
    }
  };

  const categories = Object.values(CATEGORIES);

  return (
    <div className={`relative ${className}`}>
      {/* Left scroll arrow */}
      {showLeftArrow && (
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 flex items-center justify-center bg-white shadow-md rounded-full border border-gray-200 hover:bg-gray-50"
        >
          <ChevronLeft className="w-4 h-4 text-gray-600" />
        </button>
      )}

      {/* Category tabs */}
      <div
        ref={scrollRef}
        onScroll={checkScrollArrows}
        className="flex gap-2 overflow-x-auto scrollbar-hide px-1 py-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {/* Optional Details button */}
        {showDetailsButton && (
          <button
            onClick={onDetailsClick}
            className={`
              flex items-center gap-2 px-4 py-2.5 rounded-full font-medium text-sm
              whitespace-nowrap transition-all duration-200 min-w-fit
              ${isDetailsActive
                ? 'bg-gradient-to-r from-panda-primary to-panda-secondary text-white shadow-md shadow-panda-primary/25'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800'
              }
            `}
          >
            <Info className="w-4 h-4 flex-shrink-0" />
            <span>Details</span>
          </button>
        )}

        {categories.map((category) => {
          const Icon = category.icon;
          // Don't highlight any category when Details is active
          const isActive = !isDetailsActive && activeCategory === category.id;
          const count = badgeCounts[category.id] || 0;

          return (
            <button
              key={category.id}
              onClick={() => onCategoryChange(category.id)}
              className={`
                flex items-center gap-2 px-4 py-2.5 rounded-full font-medium text-sm
                whitespace-nowrap transition-all duration-200 min-w-fit
                ${isActive
                  ? 'bg-gradient-to-r from-panda-primary to-panda-secondary text-white shadow-md shadow-panda-primary/25'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800'
                }
              `}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{category.label}</span>
              {count > 0 && (
                <span className={`
                  px-2 py-0.5 rounded-full text-xs font-semibold min-w-[1.5rem] text-center
                  ${isActive
                    ? 'bg-white/20 text-white'
                    : 'bg-gray-200 text-gray-700'
                  }
                `}>
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Right scroll arrow */}
      {showRightArrow && (
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 flex items-center justify-center bg-white shadow-md rounded-full border border-gray-200 hover:bg-gray-50"
        >
          <ChevronRight className="w-4 h-4 text-gray-600" />
        </button>
      )}
    </div>
  );
}

// Sub-tab navigation component
export function SubTabNav({
  category,
  activeSubTab,
  onSubTabChange,
  subTabCounts = {}
}) {
  const categoryConfig = CATEGORIES[category];
  if (!categoryConfig) return null;

  return (
    <div className="flex gap-1 border-b border-gray-200 mb-4">
      {categoryConfig.subTabs.map((subTab) => {
        const isActive = activeSubTab === subTab.id;
        const count = subTabCounts[subTab.id] || 0;

        return (
          <button
            key={subTab.id}
            onClick={() => onSubTabChange(subTab.id)}
            className={`
              flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px
              transition-colors duration-150
              ${isActive
                ? 'border-panda-primary text-panda-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }
            `}
          >
            <span>{subTab.label}</span>
            {count > 0 && (
              <span className={`
                px-1.5 py-0.5 rounded-full text-xs min-w-[1.25rem] text-center
                ${isActive
                  ? 'bg-panda-primary/10 text-panda-primary'
                  : 'bg-gray-100 text-gray-600'
                }
              `}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
