const TOUR_STORAGE_KEY = 'panda-crm-onboarding-complete';
const TOUR_VIEW_COUNT_KEY = 'panda-crm-tour-view-count';

export function triggerOnboardingTour() {
  localStorage.removeItem(TOUR_STORAGE_KEY);
  localStorage.removeItem(TOUR_VIEW_COUNT_KEY);
  window.location.reload();
}
