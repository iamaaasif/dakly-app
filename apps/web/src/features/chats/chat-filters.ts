import { z } from 'zod';

import { aiFeedbackFilters } from '@dakly/contracts/ai-feedback';
import { chatChannels, type ChannelConnection } from '@dakly/contracts/channels';
import type { ConversationListQuery } from '@dakly/contracts/chats';

import { agentTabs } from './agent-tabs';

export const chatTabs = [
  'all',
  'needs-you',
  'ai-handling',
  'follow-up',
  'done',
  'not-customers',
] as const;

export const chatSorts = ['needs_you', 'unread', 'waiting'] as const;
export const chatSortLabels: Record<(typeof chatSorts)[number], string> = {
  needs_you: 'Needs you first',
  unread: 'Unread first',
  waiting: 'Waiting longest',
};

export const chatTabLabels: Record<(typeof chatTabs)[number], string> = {
  all: 'All',
  'needs-you': 'Needs you',
  'ai-handling': 'AI handling',
  'follow-up': 'Follow up',
  done: 'Done',
  'not-customers': 'Not customers',
};

// Comments are not a conversation channel: they have their own list, so the filter adds them here.
export const chatScreenChannels = [...chatChannels, 'comments'] as const;

export const chatChannelLabels: Record<(typeof chatScreenChannels)[number], string> = {
  messenger: 'Messenger',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  comments: 'Comments',
};

const channelOfKind = {
  facebook_page: 'messenger',
  instagram: 'instagram',
  whatsapp: 'whatsapp',
} as const;

// Only channels the shop has connected get a chip. Comments exist only for a Page or Instagram.
export function connectedScreenChannels(
  connections: Pick<ChannelConnection, 'kind' | 'status'>[],
): (typeof chatScreenChannels)[number][] {
  const live = connections.filter((connection) => connection.status !== 'disconnected');
  const channels = new Set(live.map((connection) => channelOfKind[connection.kind]));
  const hasComments = channels.has('messenger') || channels.has('instagram');
  return chatScreenChannels.filter((channel) =>
    channel === 'comments' ? hasComments : channels.has(channel),
  );
}

export const chatScreenQuerySchema = z.strictObject({
  tab: z.enum(chatTabs).default('all'),
  channel: z.enum(chatScreenChannels).optional(),
  sort: z.enum(chatSorts).default('needs_you'),
  // The list's search words; a name, a phone number or the start of one.
  q: z.string().trim().min(1).max(120).optional(),
  assignee: z.uuid().optional(),
  // A label is a contact tag.
  label: z.string().trim().min(1).max(50).optional(),
  // The conversation open beside the list.
  chat: z.uuid().optional(),
  // On a narrow screen the customer panel takes the place of the thread.
  panel: z.literal('customer').optional(),
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
  done: { status: 'done' },
  'not-customers': { contactKind: 'not_customer' },
};

export function conversationFilters(query: ChatScreenQuery): Partial<ConversationListQuery> {
  return {
    ...tabFilters[query.tab],
    channel: query.channel === 'comments' ? undefined : query.channel,
    sort: query.sort,
    q: canSearch(query.q) ? query.q : undefined,
    assigneeUserId: query.assignee,
    label: query.label,
  };
}

// The API refuses a name search under three letters; digits search by phone from the first one.
export function canSearch(words: string | undefined): words is string {
  return Boolean(words && (words.length >= 3 || /^\d+$/.test(words)));
}

export function chatsHref(query: Partial<ChatScreenQuery>) {
  const entries: [string, string | undefined][] = [
    ['tab', query.tab === 'all' ? undefined : query.tab],
    ['channel', query.channel],
    ['sort', query.sort === 'needs_you' ? undefined : query.sort],
    ['q', query.q],
    ['assignee', query.assignee],
    ['label', query.label],
    ['chat', query.channel === 'comments' ? undefined : query.chat],
    ['panel', query.chat ? query.panel : undefined],
    ['post', query.channel === 'comments' ? query.post : undefined],
    ['agent', query.agent],
    ['feedback', query.agent ? query.feedback : undefined],
  ];
  const params = new URLSearchParams();
  for (const [name, value] of entries) if (value) params.set(name, value);
  const search = params.toString();
  return search ? `/chats?${search}` : '/chats';
}
