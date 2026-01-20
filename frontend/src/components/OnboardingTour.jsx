import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  Sparkles,
  Home,
  UserPlus,
  Target,
  AlertCircle,
  Search,
  HelpCircle
} from 'lucide-react';

const TOUR_STORAGE_KEY = 'panda-crm-onboarding-complete';
const TOUR_VIEW_COUNT_KEY = 'panda-crm-tour-view-count';
const MAX_TOUR_VIEWS = 2; // Only show tour the first 2 times user logs in
const TOUR_ELIGIBLE_DAYS = 14; // Only show tour within first 14 days of user creation
const API_URL = import.meta.env.VITE_API_URL || 'https://7paaginnvg.execute-api.us-east-2.amazonaws.com/prod';

// Tour steps with positioning and content
const tourSteps = [
  {
    id: 'welcome',
    title: "Welcome to Panda CRM!",
    content: "I'm your training assistant, and I'll give you a quick tour of the system. This will only take about a minute.",
    icon: Sparkles,
    position: 'center',
    showSkip: true
  },
  {
    id: 'navbar',
    title: "Top Navigation",
    content: "Your main navigation is at the top. You'll find Leads, Contacts, Accounts, Jobs, and more in the navigation bar.",
    icon: Home,
    position: 'center',
    highlight: false
  },
  {
    id: 'jobs',
    title: "Jobs - Your Central Hub",
    content: "Jobs (Opportunities) are the heart of Panda CRM. Everything connects to a job - contacts, quotes, work orders, and documents.",
    icon: Target,
    position: 'center',
    highlight: false
  },
  {
    id: 'search',
    title: "Search",
    content: "Use the search bar in the top navigation to quickly find any account, contact, lead, or job by name or phone number.",
    icon: Search,
    position: 'center',
    highlight: false
  },
  {
    id: 'help',
    title: "Need Help?",
    content: "Click the 'Need Help?' button in the bottom-left corner anytime you have questions. I can explain any feature or guide you through tasks.",
    icon: HelpCircle,
    target: '#training-bot-trigger',
    position: 'top',
    highlight: true
  },
  {
    id: 'complete',
    title: "You're All Set!",
    content: "That's the basics! You're ready to start using Panda CRM. Click 'Need Help?' anytime you have questions.",
    icon: Check,
    position: 'center',
    showComplete: true
  }
];

export default function OnboardingTour() {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipStyle, setTooltipStyle] = useState({});
  const [highlightStyle, setHighlightStyle] = useState({});
  const { user } = useAuth();
  const navigate = useNavigate();

  // Check if user has completed the tour or exceeded max views
  useEffect(() => {
    const checkTourStatus = () => {
      const userId = user?.id || user?.email;
      if (!userId) return;

      // Check if user has explicitly completed/skipped the tour
      const completed = localStorage.getItem(TOUR_STORAGE_KEY);
      if (completed) {
        try {
          const completedUsers = JSON.parse(completed);
          if (completedUsers.includes(userId)) {
            return; // User completed tour, don't show
          }
        } catch {
          // Invalid data, reset
          localStorage.removeItem(TOUR_STORAGE_KEY);
        }
      }

      // Check if user is within the eligible window (first 14 days since account creation)
      const userCreatedAt = user?.createdAt;
      if (userCreatedAt) {
        const createdDate = new Date(userCreatedAt);
        const now = new Date();
        const daysSinceCreation = (now - createdDate) / (1000 * 60 * 60 * 24);

        // If user was created more than 14 days ago, don't show the tour
        if (daysSinceCreation > TOUR_ELIGIBLE_DAYS) {
          return;
        }
      }

      // Check view count for this user
      let viewCounts = {};
      try {
        const stored = localStorage.getItem(TOUR_VIEW_COUNT_KEY);
        if (stored) {
          viewCounts = JSON.parse(stored);
        }
      } catch {
        // Invalid data, start fresh
        localStorage.removeItem(TOUR_VIEW_COUNT_KEY);
      }

      const userViewCount = viewCounts[userId] || 0;

      // If user has seen the tour MAX_TOUR_VIEWS times, don't show again
      if (userViewCount >= MAX_TOUR_VIEWS) {
        return;
      }

      // Increment view count for this user
      viewCounts[userId] = userViewCount + 1;
      localStorage.setItem(TOUR_VIEW_COUNT_KEY, JSON.stringify(viewCounts));

      // Show tour for new users after a brief delay
      setTimeout(() => {
        setIsActive(true);
      }, 1500);
    };

    if (user) {
      checkTourStatus();
    }
  }, [user]);

  // Position the tooltip based on target element
  const positionTooltip = useCallback(() => {
    const step = tourSteps[currentStep];
    if (!step) return;

    if (step.position === 'center') {
      setTooltipStyle({
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)'
      });
      setHighlightStyle({});
      return;
    }

    const target = step.target ? document.querySelector(step.target) : null;
    if (!target) {
      // Fallback to center if target not found
      setTooltipStyle({
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)'
      });
      setHighlightStyle({});
      return;
    }

    const rect = target.getBoundingClientRect();
    const padding = 12;
    const tooltipWidth = 340;
    const tooltipHeight = 200;

    // Calculate highlight position
    setHighlightStyle({
      top: rect.top - 4,
      left: rect.left - 4,
      width: rect.width + 8,
      height: rect.height + 8,
      borderRadius: '8px'
    });

    // Calculate tooltip position based on specified position
    let top, left, transform = '';

    switch (step.position) {
      case 'right':
        top = rect.top + rect.height / 2;
        left = rect.right + padding;
        transform = 'translateY(-50%)';
        // Check if it goes off screen
        if (left + tooltipWidth > window.innerWidth) {
          left = rect.left - tooltipWidth - padding;
        }
        break;
      case 'left':
        top = rect.top + rect.height / 2;
        left = rect.left - tooltipWidth - padding;
        transform = 'translateY(-50%)';
        // Check if it goes off screen
        if (left < 0) {
          left = rect.right + padding;
        }
        break;
      case 'bottom':
        top = rect.bottom + padding;
        left = rect.left + rect.width / 2;
        transform = 'translateX(-50%)';
        // Check if it goes off screen
        if (top + tooltipHeight > window.innerHeight) {
          top = rect.top - tooltipHeight - padding;
        }
        break;
      case 'top':
        top = rect.top - tooltipHeight - padding;
        left = rect.left + rect.width / 2;
        transform = 'translateX(-50%)';
        // Ensure tooltip doesn't go off left edge
        if (left - tooltipWidth / 2 < padding) {
          left = padding + tooltipWidth / 2;
        }
        // Ensure tooltip doesn't go off right edge
        if (left + tooltipWidth / 2 > window.innerWidth - padding) {
          left = window.innerWidth - padding - tooltipWidth / 2;
        }
        break;
      default:
        top = rect.top + rect.height / 2;
        left = rect.right + padding;
        transform = 'translateY(-50%)';
    }

    // Final bounds check for all positions
    if (top < padding) top = padding;
    if (top + tooltipHeight > window.innerHeight - padding) {
      top = window.innerHeight - padding - tooltipHeight;
    }

    setTooltipStyle({ top, left, transform });
  }, [currentStep]);

  // Reposition on step change and window resize
  useEffect(() => {
    if (!isActive) return;

    positionTooltip();
    window.addEventListener('resize', positionTooltip);

    return () => {
      window.removeEventListener('resize', positionTooltip);
    };
  }, [isActive, currentStep, positionTooltip]);

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    completeTour();
  };

  const handleComplete = () => {
    completeTour();
  };

  const completeTour = () => {
    const userId = user?.id || user?.email;
    let completedUsers = [];

    try {
      const stored = localStorage.getItem(TOUR_STORAGE_KEY);
      if (stored) {
        completedUsers = JSON.parse(stored);
      }
    } catch {
      // Start fresh
    }

    if (!completedUsers.includes(userId)) {
      completedUsers.push(userId);
    }

    localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(completedUsers));
    setIsActive(false);
    setCurrentStep(0);
  };

  // Reset tour (for testing or if user wants to see it again)
  const resetTour = () => {
    const userId = user?.id || user?.email;

    // Remove from completed list
    localStorage.removeItem(TOUR_STORAGE_KEY);

    // Reset view count for this user
    try {
      const stored = localStorage.getItem(TOUR_VIEW_COUNT_KEY);
      if (stored) {
        const viewCounts = JSON.parse(stored);
        delete viewCounts[userId];
        localStorage.setItem(TOUR_VIEW_COUNT_KEY, JSON.stringify(viewCounts));
      }
    } catch {
      localStorage.removeItem(TOUR_VIEW_COUNT_KEY);
    }

    setCurrentStep(0);
    setIsActive(true);
  };

  if (!isActive) return null;

  const step = tourSteps[currentStep];
  const Icon = step.icon;
  const isFirst = currentStep === 0;
  const isLast = currentStep === tourSteps.length - 1;

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-[9998] bg-black/50 transition-opacity" />

      {/* Highlight box */}
      {step.highlight && highlightStyle.top !== undefined && (
        <div
          className="fixed z-[9999] border-2 border-panda-primary bg-transparent pointer-events-none transition-all duration-300"
          style={{
            ...highlightStyle,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5), 0 0 20px 4px rgba(102, 126, 234, 0.5)'
          }}
        />
      )}

      {/* Tooltip */}
      <div
        className="fixed z-[10000] w-[340px] bg-white rounded-xl shadow-2xl overflow-hidden transition-all duration-300"
        style={tooltipStyle}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-panda-primary to-panda-secondary p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-white">{step.title}</h3>
            <p className="text-xs text-white/80">
              Step {currentStep + 1} of {tourSteps.length}
            </p>
          </div>
          {step.showSkip && (
            <button
              onClick={handleSkip}
              className="p-2 text-white/70 hover:text-white transition-colors"
              title="Skip tour"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-4">
          <p className="text-gray-600 text-sm leading-relaxed">{step.content}</p>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-gray-100">
          <div
            className="h-full bg-gradient-to-r from-panda-primary to-panda-secondary transition-all duration-300"
            style={{ width: `${((currentStep + 1) / tourSteps.length) * 100}%` }}
          />
        </div>

        {/* Actions */}
        <div className="p-4 bg-gray-50 flex items-center justify-between">
          {!isFirst ? (
            <button
              onClick={handlePrev}
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
          ) : step.showSkip ? (
            <button
              onClick={handleSkip}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Skip tour
            </button>
          ) : (
            <div />
          )}

          {step.showComplete ? (
            <button
              onClick={handleComplete}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg font-medium hover:shadow-lg transition-shadow"
            >
              <Check className="w-4 h-4" />
              Get Started
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="flex items-center gap-1 px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg font-medium hover:shadow-lg transition-shadow"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// Export a function to manually trigger the tour (e.g., from settings)
export const triggerOnboardingTour = () => {
  localStorage.removeItem(TOUR_STORAGE_KEY);
  localStorage.removeItem(TOUR_VIEW_COUNT_KEY);
  window.location.reload();
};
