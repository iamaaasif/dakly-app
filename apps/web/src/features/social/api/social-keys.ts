const root = ['social'] as const;

export const socialKeys = {
  all: (contextTag: string | undefined) => [...root, contextTag] as const,
  productPhotos: (contextTag: string | undefined) =>
    [...root, contextTag, 'product-photos'] as const,
  accounts: (contextTag: string | undefined) => [...root, contextTag, 'accounts'] as const,
  drafts: (contextTag: string | undefined) => [...root, contextTag, 'drafts'] as const,
  posts: (contextTag: string | undefined) => [...root, contextTag, 'posts'] as const,
  slots: (contextTag: string | undefined, channelConnectionId: string) =>
    [...root, contextTag, 'slots', channelConnectionId] as const,
};
