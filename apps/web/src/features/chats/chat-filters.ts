import { z } from 'zod';

import { chatChannels } from '@dakly/contracts/channels';
import type { ConversationListQuery } from '@dakly/contracts/chats';

import { agentTabs } from './agent-tabs';

export const chatTabs = ['all', 'needs-you', 'ai-handling', 'follow-up'] as const;

export const chatTabLabels: Record<(typeof chatTabs)[number], string> = {
  all: 'All',
  'needs-you': 'Needs you',
  'ai-handling': 'AI handling',
  'follow-up': 'Follow up',
};

export const chatChannelLabels: Record<(typeof chatChannels)[number], string> = {
  messenger: 'Messenger',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
};

export const chatScreenQuerySchema = z.strictObject({
  tab: z.enum(chatTabs).default('all'),
  channel: z.enum(chatChannels).optional(),
  // The open AI agent drawer tab; absent when the drawer is closed.
  agent: z.enum(agentTabs).optional(),
});

export type ChatScreenQuery = z.infer<typeof chatScreenQuerySchema>;

const tabFilters: Record<ChatScreenQuery['tab'], Partial<ConversationListQuery>> = {
  all: {},
  'needs-you': { status: 'needs_you' },
  'ai-handling': { responder: 'ai' },
  'follow-up': { status: 'later' },
};

export function conversationFilters(query: ChatScreenQuery): Partial<ConversationListQuery> {
  return {
    ...tabFilters[query.tab],
    channel: query.channel,
  };
}

export function chatsHref(query: Partial<ChatScreenQuery>) {
  const params = new URLSearchParams();
  if (query.tab && query.tab !== 'all') params.set('tab', query.tab);
  if (query.channel) params.set('channel', query.channel);
  if (query.agent) params.set('agent', query.agent);
  const search = params.toString();
  return search ? `/chats?${search}` : '/chats';
}
