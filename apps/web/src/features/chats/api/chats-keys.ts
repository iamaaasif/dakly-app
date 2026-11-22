import type { ConversationListQuery } from '@dakly/contracts/chats';

export const chatsKeys = {
  all: ['chats'] as const,
  list: (tag: string | undefined, filters: Partial<ConversationListQuery>) =>
    ['chats', tag, 'list', filters] as const,
  comments: (tag: string | undefined) => ['chats', tag, 'comments'] as const,
  assignees: (tag: string | undefined) => ['chats', tag, 'assignees'] as const,
  conversation: (tag: string | undefined, id: string) =>
    ['chats', tag, 'conversation', id] as const,
  messages: (tag: string | undefined, id: string) => ['chats', tag, 'messages', id] as const,
  savedReplies: (tag: string | undefined) => ['chats', tag, 'saved-replies'] as const,
  counts: (tag: string | undefined) => ['chats', tag, 'counts'] as const,
};
