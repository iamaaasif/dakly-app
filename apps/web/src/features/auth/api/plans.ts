import { useQuery } from '@tanstack/react-query';
import type { PlansResponse } from '@dakly/contracts/billing';
import { apiRequest } from '@/lib/api-client';
const plansKey = ['public-plans'] as const;
export function usePlans() {
  return useQuery({
    queryKey: plansKey,
    queryFn: ({ signal }) => apiRequest<PlansResponse>('/plans', { signal }),
  });
}
