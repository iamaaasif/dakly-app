import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  ChangeKillSwitchInput,
  KillSwitchChangeResponse,
  KillSwitchFeature,
  KillSwitchListResponse,
} from '@dakly/contracts/kill-switches';
import type { AiCostResponse, ProviderHealthResponse } from '@dakly/contracts/ops-reports';

import { adminApi, adminPut } from '@/lib/api-client';

const keys = {
  switches: ['kill-switches'] as const,
  health: ['provider-health'] as const,
  cost: (day: string) => ['ai-cost', day] as const,
};

export const useKillSwitches = () =>
  useQuery({
    queryKey: keys.switches,
    queryFn: () => adminApi<KillSwitchListResponse>('kill-switches'),
  });

export const useProviderHealth = () =>
  useQuery({
    queryKey: keys.health,
    queryFn: () => adminApi<ProviderHealthResponse>('provider-health'),
  });

export const useAiCost = (day: string) =>
  useQuery({
    queryKey: keys.cost(day),
    queryFn: () => adminApi<AiCostResponse>(`ai-cost${day ? `?day=${day}` : ''}`),
  });

export function useChangeKillSwitch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      feature: KillSwitchFeature;
      storeId: string | null;
      change: ChangeKillSwitchInput;
    }) =>
      adminPut<KillSwitchChangeResponse>(
        input.storeId
          ? `stores/${input.storeId}/kill-switches/${input.feature}`
          : `kill-switches/${input.feature}`,
        input.change,
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.switches }),
  });
}
