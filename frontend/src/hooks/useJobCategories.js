import { useState, useCallback, useMemo } from 'react';
import { CATEGORIES, TAB_TO_CATEGORY } from '../components/SuperTabNav';

/**
 * Custom hook for managing category-based navigation in OpportunityDetail
 * Replaces the single activeTab state with category + subTab structure
 */
export default function useJobCategories(initialCategory = 'schedule') {
  // Track if we're showing the details view (separate from categories)
  // Default to true so Details tab opens by default
  const [showDetails, setShowDetails] = useState(true);

  // Track active category
  const [activeCategory, setActiveCategory] = useState(initialCategory);

  // Track active sub-tab per category (remembers last selection)
  const [subTabByCategory, setSubTabByCategory] = useState(() => {
    // Initialize with first sub-tab of each category
    const initial = {};
    Object.values(CATEGORIES).forEach(cat => {
      initial[cat.id] = cat.subTabs[0]?.id;
    });
    return initial;
  });

  // Get current active sub-tab
  const activeSubTab = useMemo(() => {
    if (showDetails) return 'details';
    return subTabByCategory[activeCategory] || CATEGORIES[activeCategory]?.subTabs[0]?.id;
  }, [activeCategory, subTabByCategory, showDetails]);

  // Change category (remembers last sub-tab for that category)
  const changeCategory = useCallback((categoryId) => {
    if (CATEGORIES[categoryId]) {
      setShowDetails(false); // Exit details mode
      setActiveCategory(categoryId);
    }
  }, []);

  // Toggle details view
  const toggleDetails = useCallback(() => {
    setShowDetails(true);
  }, []);

  // Change sub-tab within current category
  const changeSubTab = useCallback((subTabId) => {
    setSubTabByCategory(prev => ({
      ...prev,
      [activeCategory]: subTabId
    }));
  }, [activeCategory]);

  // Navigate to a specific legacy tab (maps to category + sub-tab)
  const navigateToTab = useCallback((tabId) => {
    if (tabId === 'details') {
      setShowDetails(true);
      return;
    }
    const categoryId = TAB_TO_CATEGORY[tabId];
    if (categoryId) {
      setShowDetails(false);
      setActiveCategory(categoryId);
      setSubTabByCategory(prev => ({
        ...prev,
        [categoryId]: tabId
      }));
    }
  }, []);

  // Get the legacy tab ID for backward compatibility
  const legacyTabId = activeSubTab;

  // Calculate badge counts for categories
  const calculateBadgeCounts = useCallback((data) => {
    const counts = {};

    // Schedule category
    counts.schedule = (data.appointments?.length || 0) +
                      (data.tasks?.length || 0);

    // Financial category
    counts.financial = (data.invoices?.length || 0) +
                       (data.commissions?.length || 0) +
                       (data.quotes?.length || 0);

    // Documents category
    counts.documents = (data.documents?.length || 0);

    // Team category (Work Orders)
    counts.team = (data.workOrders?.length || 0) +
                  (data.cases?.length || 0);

    // Messages category
    counts.messages = (data.conversations?.length || 0) +
                      (data.communications?.length || 0) +
                      (data.notifications?.length || 0) +
                      (data.activities?.length || 0);

    return counts;
  }, []);

  // Calculate sub-tab counts for current category
  const calculateSubTabCounts = useCallback((data) => {
    const counts = {};

    switch (activeCategory) {
      case 'schedule':
        counts.schedule = data.appointments?.length || 0;
        counts.tasks = data.tasks?.length || 0;
        counts.checklist = 0; // Checklist doesn't have a count
        break;
      case 'financial':
        counts.invoices = data.invoices?.length || 0;
        counts.commissions = data.commissions?.length || 0;
        counts.quotes = data.quotes?.length || 0;
        break;
      case 'documents':
        counts.documents = data.documents?.length || 0;
        break;
      case 'team':
        counts.workOrders = data.workOrders?.length || 0;
        counts.cases = data.cases?.length || 0;
        counts.approvals = 0; // Calculate if needed
        break;
      case 'messages':
        counts.conversations = data.conversations?.length || 0;
        counts.communications = data.communications?.length || 0;
        counts.notifications = data.notifications?.length || 0;
        counts.activity = data.activities?.length || 0;
        break;
    }

    return counts;
  }, [activeCategory]);

  return {
    activeCategory,
    activeSubTab,
    legacyTabId,
    showDetails,
    toggleDetails,
    changeCategory,
    changeSubTab,
    navigateToTab,
    calculateBadgeCounts,
    calculateSubTabCounts,
    categories: CATEGORIES,
  };
}
