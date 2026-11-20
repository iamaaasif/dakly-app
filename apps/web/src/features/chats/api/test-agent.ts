import { useMutation } from '@tanstack/react-query';

import type { AskTestInput, TestAnswerResponse } from '@dakly/contracts/ai-practice';

import { useStoreRequest } from '@/lib/store-request';

// Nothing is saved by a test, so there is no cache to update.
export function useAskTestQuestion() {
  const { request } = useStoreRequest();
  return useMutation({
    gcTime: 0,
    mutationFn: (input: AskTestInput) =>
      request<TestAnswerResponse>('/ai-agent/test', { method: 'POST', body: input }),
  });
}
