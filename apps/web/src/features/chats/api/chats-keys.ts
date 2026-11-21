import type { ConversationListQuery } from '@dakly/contracts/chats';

export const chatsKeys = {
  all: ['chats'] as const,
  list: (tag: string | undefined, filters: Partial<ConversationListQuery>) =>
    ['chats', tag, 'list', filters] as const,
  comments: (tag: string | undefined) => ['chats', tag, 'comments'] as const,
  counts: (tag: string | undefined) => ['chats', tag, 'counts'] as const,
};
