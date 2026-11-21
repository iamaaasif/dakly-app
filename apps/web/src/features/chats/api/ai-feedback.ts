import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  AiFeedbackQuery,
  AiFeedbackResponse,
  FixAiReplyInput,
} from '@dakly/contracts/ai-feedback';

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

export function useFixAiReply() {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, ...input }: FixAiReplyInput & { messageId: string }) =>
      request<void>(`/ai-replies/${messageId}/fix`, { method: 'POST', body: input }),
    // The taught answer shows in Knowledge, and the reply moves out of Needs fixing.
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: aiAgentKeys.feedback(contextTag) }),
        client.invalidateQueries({ queryKey: aiAgentKeys.knowledge(contextTag) }),
        client.invalidateQueries({ queryKey: aiAgentKeys.knowledgeSummary(contextTag) }),
      ]),
  });
}
