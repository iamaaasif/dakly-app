import { useMutation } from '@tanstack/react-query';

import { useStoreRequest } from '@/lib/store-request';

// The test goes to the signed-in member's own verified phone; the API decides the destination.
export function useSendCampaignTest() {
  const { request } = useStoreRequest();
  return useMutation({
    mutationFn: (campaignId: string) =>
      request<void>(`/campaigns/${campaignId}/test-send`, { method: 'POST' }),
  });
}
