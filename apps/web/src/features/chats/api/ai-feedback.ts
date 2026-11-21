import { useQuery } from '@tanstack/react-query';

import type { AiFeedbackQuery, AiFeedbackResponse } from '@dakly/contracts/ai-feedback';

import { aiAgentKeys } from './ai-agent-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useAiFeedback(filter: AiFeedbackQuery['filter']) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: [...aiAgentKeys.feedback(contextTag), filter],
    enabled: Boolean(contextTag),
    retry: false,
    queryFn: ({ signal }) =>
      request<AiFeedbackResponse>(`/ai-replies/feedback?filter=${filter}`, { signal }),
  });
}
