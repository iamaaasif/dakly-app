'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import { ToastProvider } from '@dakly/ui/toast';

import { shouldRetryQuery } from '@/lib/should-retry-query';

export function Providers({ children }: { children: ReactNode }) {
  // Without a default stale time every mount and window focus refetches and screens flash.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: shouldRetryQuery } },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
