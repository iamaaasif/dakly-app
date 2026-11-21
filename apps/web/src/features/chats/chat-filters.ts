import { z } from 'zod';

import { aiFeedbackFilters } from '@dakly/contracts/ai-feedback';
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

// Comments are not a conversation channel: they have their own list, so the filter adds them here.
export const chatScreenChannels = [...chatChannels, 'comments'] as const;

export const chatChannelLabels: Record<(typeof chatScreenChannels)[number], string> = {
  messenger: 'Messenger',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  comments: 'Comments',
};

export const chatScreenQuerySchema = z.strictObject({
  tab: z.enum(chatTabs).default('all'),
  channel: z.enum(chatScreenChannels).optional(),
  // The post open in the Comments view: its id on Meta.
  post: z.string().min(1).max(200).optional(),
  // The open AI agent drawer tab; absent when the drawer is closed.
  agent: z.enum(agentTabs).optional(),
  // The Feedback tab's filter; the tab shows the bad answers when it is absent.
  feedback: z.enum(aiFeedbackFilters).optional(),
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
    channel: query.channel === 'comments' ? undefined : query.channel,
  };
}

export function chatsHref(query: Partial<ChatScreenQuery>) {
  const params = new URLSearchParams();
  if (query.tab && query.tab !== 'all') params.set('tab', query.tab);
  if (query.channel) params.set('channel', query.channel);
  if (query.channel === 'comments' && query.post) params.set('post', query.post);
  if (query.agent) params.set('agent', query.agent);
  if (query.agent && query.feedback) params.set('feedback', query.feedback);
  const search = params.toString();
  return search ? `/chats?${search}` : '/chats';
}
