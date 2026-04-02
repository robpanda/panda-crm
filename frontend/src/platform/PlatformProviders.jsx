import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../context/AuthContext';
import { RingCentralProvider } from '../context/RingCentralContext';
import { createPlatformQueryClient } from './platformQueryClient';

export default function PlatformProviders({ children }) {
  const [queryClient] = useState(() => createPlatformQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RingCentralProvider>
          {children}
        </RingCentralProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
