import type { ConversationResponse } from '@dakly/contracts/chats';

const channelLabels = {
  messenger: 'Messenger',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
} as const;

// Meta gives no name for some customers (test users, or before the app has profile access), so
// the chat names the channel instead of showing nothing.
export function contactDisplayName(
  conversation: Pick<ConversationResponse, 'contactName' | 'channel'>,
): string {
  return conversation.contactName ?? `${channelLabels[conversation.channel]} customer`;
}
