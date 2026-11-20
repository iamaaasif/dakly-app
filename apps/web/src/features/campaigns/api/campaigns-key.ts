const root = ['campaigns'] as const;

export const campaignKeys = {
  detail: (contextTag: string | undefined, campaignId: string) =>
    [...root, contextTag, 'detail', campaignId] as const,
  estimate: (contextTag: string | undefined, campaignId: string) =>
    [...root, contextTag, 'estimate', campaignId] as const,
  list: (contextTag: string | undefined) => [...root, contextTag, 'list'] as const,
  segments: (contextTag: string | undefined) => [...root, contextTag, 'segments'] as const,
  pages: (contextTag: string | undefined) => [...root, contextTag, 'pages'] as const,
};
