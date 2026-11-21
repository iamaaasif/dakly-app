import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  ReconciliationLine,
  ReconciliationQueueResponse,
  SettlementLineActionInput,
} from '@dakly/contracts/admin-reconciliation';

import { adminApi } from '@/lib/api-client';

const queueKey = ['reconciliation-queue'] as const;

export const useReconciliationQueue = () =>
  useQuery({
    queryKey: queueKey,
    queryFn: () => adminApi<ReconciliationQueueResponse>('reconciliation'),
  });

export function useCloseLine(lineId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (change: SettlementLineActionInput) =>
      adminApi<ReconciliationLine>(`reconciliation/lines/${lineId}`, change),
    onSuccess: () => client.invalidateQueries({ queryKey: queueKey }),
  });
}
