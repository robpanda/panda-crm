import { createContext, useContext } from 'react';
import { useAnalyticsVerification } from '../../hooks/useAnalyticsVerification';

const AnalyticsBadgeContext = createContext(null);

export function AnalyticsBadgeProvider({ children, defaultSource = 'native' }) {
  const verification = useAnalyticsVerification();

  return (
    <AnalyticsBadgeContext.Provider value={{ enabled: true, defaultSource, verification }}>
      {children}
    </AnalyticsBadgeContext.Provider>
  );
}

export function useAnalyticsBadgeContext() {
  return useContext(AnalyticsBadgeContext);
}

export default AnalyticsBadgeContext;
