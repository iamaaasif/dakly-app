import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { TestQuestion, TestQuestionsResponse } from '@dakly/contracts/ai-practice';

import { aiAgentKeys } from './ai-agent-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useTestQuestions() {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: aiAgentKeys.testQuestions(contextTag),
    enabled: Boolean(contextTag),
    retry: false,
    queryFn: ({ signal }) => request<TestQuestionsResponse>('/ai-agent/test-questions', { signal }),
  });
}

export function useSaveTestQuestions() {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (questions: TestQuestion[]) =>
      request<TestQuestionsResponse>('/ai-agent/test-questions', {
        method: 'PUT',
        body: { questions },
      }),
    onSuccess: async (saved) => {
      client.setQueryData(aiAgentKeys.testQuestions(contextTag), saved);
      // Test questions share the settings version, so the settings form must pick up the new one.
      await client.invalidateQueries({ queryKey: aiAgentKeys.settings(contextTag) });
    },
  });
}
