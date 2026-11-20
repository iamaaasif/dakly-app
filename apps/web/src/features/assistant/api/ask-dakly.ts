import { useMutation } from '@tanstack/react-query';

import type { AskDaklyAnswer, AskDaklyRequest } from '@dakly/contracts/assistant';

import { useStoreRequest } from '@/lib/store-request';

export function useAskDakly() {
  const { request } = useStoreRequest();
  return useMutation({
    mutationFn: (body: AskDaklyRequest) =>
      request<AskDaklyAnswer>('/assistant/messages', { method: 'POST', body }),
  });
}
