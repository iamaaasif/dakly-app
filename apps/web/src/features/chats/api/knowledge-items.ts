import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  knowledgeFileBytes,
  knowledgeUploadSchema,
  type KnowledgeItemListResponse,
  type KnowledgeItemResponse,
  type KnowledgeSummaryResponse,
  type KnowledgeUploadResponse,
} from '@dakly/contracts/knowledge';

import { aiAgentKeys } from './ai-agent-keys';
import { useStoreRequest } from '@/lib/store-request';

// A shop holds a few dozen answers and files, so one page of 100 holds them all.
export function useKnowledgeItems() {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: aiAgentKeys.knowledge(contextTag),
    enabled: Boolean(contextTag),
    retry: false,
    queryFn: ({ signal }) =>
      request<KnowledgeItemListResponse>('/knowledge-items?limit=100', { signal }),
    // Reading a file takes a few seconds; look again only while something is still being read.
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => item.status === 'processing') ? 4000 : false,
  });
}

export function useKnowledgeSummary() {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: aiAgentKeys.knowledgeSummary(contextTag),
    enabled: Boolean(contextTag),
    retry: false,
    queryFn: ({ signal }) =>
      request<KnowledgeSummaryResponse>('/ai-agent/knowledge-summary', { signal }),
  });
}

function useRefreshKnowledge() {
  const { contextTag } = useStoreRequest();
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: aiAgentKeys.knowledge(contextTag) });
}

type KnowledgeAnswerFields = { question: string; answer: string; keywords: string[] };

export function useSaveKnowledgeAnswer() {
  const { request } = useStoreRequest();
  const refresh = useRefreshKnowledge();
  return useMutation({
    mutationFn: ({ id, ...fields }: KnowledgeAnswerFields & { id: string | null }) =>
      id
        ? request<KnowledgeItemResponse>(`/knowledge-items/${id}`, {
            method: 'PATCH',
            body: fields,
          })
        : request<KnowledgeItemResponse>('/knowledge-items', {
            method: 'POST',
            body: { kind: 'policy', ...fields },
          }),
    onSuccess: refresh,
  });
}

export function useDeleteKnowledgeItem() {
  const { request } = useStoreRequest();
  const refresh = useRefreshKnowledge();
  return useMutation({
    mutationFn: (id: string) => request<void>(`/knowledge-items/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
}

export function useUploadKnowledgeFile() {
  const { request } = useStoreRequest();
  const refresh = useRefreshKnowledge();
  return useMutation({
    gcTime: 0,
    mutationFn: async (file: File) => {
      const parsed = knowledgeUploadSchema.safeParse({
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      });
      if (!parsed.success)
        throw new Error(
          `Choose a PDF or text file up to ${knowledgeFileBytes / (1024 * 1024)} MB.`,
        );
      const issued = await request<KnowledgeUploadResponse>('/knowledge-items/uploads', {
        method: 'POST',
        body: parsed.data,
      });
      const uploaded = await fetch(issued.uploadUrl, {
        method: 'PUT',
        body: file,
        credentials: 'omit',
        headers: { 'Content-Type': parsed.data.contentType },
      }).catch(() => undefined);
      if (!uploaded?.ok) throw new Error('The file could not upload. Try again.');
      return request<KnowledgeItemResponse>('/knowledge-items', {
        method: 'POST',
        body: { kind: 'file', fileId: issued.fileId },
      });
    },
    onSuccess: refresh,
  });
}
