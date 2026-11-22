import { useMutation, useQueryClient } from '@tanstack/react-query';

import type {
  ChangeConversationLabelInput,
  ConversationResponse,
  UpdateConversationInput,
} from '@dakly/contracts/chats';

import { useStoreRequest } from '@/lib/store-request';

// Each action changes the row, the counts and the tabs, so every chats query is refreshed.
function useChatAction<Input>(
  send: (request: ReturnType<typeof useStoreRequest>['request'], input: Input) => Promise<unknown>,
) {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Input) => send(request, input),
    onSuccess: () => client.invalidateQueries({ queryKey: ['chats', contextTag] }),
  });
}

export function useUpdateConversation(id: string) {
  return useChatAction<UpdateConversationInput>((request, body) =>
    request<ConversationResponse>(`/conversations/${id}`, { method: 'PATCH', body }),
  );
}

export function useChangeLabel(id: string) {
  return useChatAction<ChangeConversationLabelInput>((request, body) =>
    request<ConversationResponse>(`/conversations/${id}/labels`, { method: 'POST', body }),
  );
}

export function useTakeOverConversation(id: string) {
  return useChatAction<void>((request) =>
    request<ConversationResponse>(`/conversations/${id}/take-over`, { method: 'POST', body: {} }),
  );
}

export function useReturnToAi(id: string) {
  return useChatAction<void>((request) =>
    request<ConversationResponse>(`/conversations/${id}/return-to-ai`, { method: 'POST' }),
  );
}
