import type { ConversationResponse } from '@dakly/contracts/chats';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// Meta's Human Agent tag lets staff reply for seven days after the customer's last message.
const HUMAN_AGENT_MS = 6 * 24 * HOUR_MS;

export type ReplyWindow =
  | { state: 'open'; label: string }
  | { state: 'human-agent'; label: string }
  | { state: 'closed'; label: string }
  | { state: 'unsupported'; label: string };

export function replyWindow(
  conversation: Pick<ConversationResponse, 'channel' | 'windowExpiresAt'>,
  now = Date.now(),
): ReplyWindow {
  if (conversation.channel === 'whatsapp')
    return { state: 'unsupported', label: 'WhatsApp replies are not available yet' };
  const expires = conversation.windowExpiresAt ? Date.parse(conversation.windowExpiresAt) : null;
  if (expires === null) return { state: 'closed', label: 'Reply window closed' };
  const left = expires - now;
  if (left > 0) {
    const hours = Math.ceil(left / HOUR_MS);
    return { state: 'open', label: `Reply within ${hours} h` };
  }
  if (-left < HUMAN_AGENT_MS) {
    const days = Math.ceil((HUMAN_AGENT_MS + left) / DAY_MS);
    return {
      state: 'human-agent',
      label: `Human-agent reply window: ${days}d left`,
    };
  }
  return {
    state: 'closed',
    label: 'Reply window closed. The customer must write again before you can reply',
  };
}
