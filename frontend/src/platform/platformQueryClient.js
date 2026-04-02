import { QueryClient } from '@tanstack/react-query';

export function createPlatformQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        retry: 1,
      },
    },
  });
}

export default createPlatformQueryClient;
