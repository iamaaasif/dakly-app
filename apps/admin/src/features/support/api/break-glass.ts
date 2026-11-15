import { useMutation, useQueryClient } from '@tanstack/react-query';

import type {
  BreakGlassRequest,
  BreakGlassPreview,
  BreakGlassConfirmation,
} from '@dakly/contracts/break-glass';

import { adminApi } from '@/lib/api-client';

export function useBreakGlassPreview() {
  return useMutation({
    mutationFn: (input: BreakGlassRequest) =>
      adminApi<BreakGlassPreview>('support/break-glass/preview', input),
  });
}
export function useConfirmBreakGlass() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: BreakGlassConfirmation) =>
      adminApi<{ id: string }>('support/break-glass', input),
    onSuccess: () => client.invalidateQueries({ queryKey: ['support-requests'] }),
  });
}
