import { useQuery } from '@tanstack/react-query';
import { analyticsHealthApi } from '../services/api';
import { mapHealthToVerification } from '../utils/analyticsVerification';

const DEFAULT_UNKNOWN = mapHealthToVerification(null);

export function useAnalyticsVerification() {
  const { data, isError } = useQuery({
    queryKey: ['analytics-health', 'verification'],
    queryFn: () => analyticsHealthApi.getHealth(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (isError || !data) {
    return DEFAULT_UNKNOWN;
  }

  const healthData = data?.data || data;
  return mapHealthToVerification(healthData);
}

export default useAnalyticsVerification;
