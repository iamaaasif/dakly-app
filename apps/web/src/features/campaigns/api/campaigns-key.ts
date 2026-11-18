const root = ['campaigns'] as const;

export const campaignKeys = {
  detail: (contextTag: string | undefined, campaignId: string) =>
    [...root, contextTag, 'detail', campaignId] as const,
  list: (contextTag: string | undefined) => [...root, contextTag, 'list'] as const,
};
