import type { handoverReasons } from '@dakly/contracts/chats';

import { chatReplyV18 } from './prompts/chat-reply.v18';
import { suggestReplyV2 } from './prompts/suggest-reply.v2';
import { promptWith } from './reply-prompt-version';
import { salesAgentLlmTools, salesAgentToolsFor } from './sales-agent-tool-definitions';
import type { ToolScope } from './sales-agent-tools.service';
import type { ShopRules } from './shop-rules';

type Reason = (typeof handoverReasons)[number];

// A suggested reply only reads: it sends no card, takes no order and makes no offer.
const SUGGESTION_TOOLS = new Set([
  'search_products',
  'browse_products',
  'get_product',
  'get_delivery_charge',
  'search_knowledge',
  'get_my_orders',
  'get_order_status',
  'find_alternatives',
]);
export const suggestionTools = salesAgentLlmTools.filter(({ name }) => SUGGESTION_TOOLS.has(name));

// A draft is written for the reason the AI handed the chat over, or with none when a person asked.
export type Suggestion = { reason: Reason | null };

export function suggestionOpening({ reason }: Suggestion) {
  return reason
    ? `\n<handover_reason>${reason}</handover_reason>`
    : '\n<draft_request>A team member asked for a reply to send.</draft_request>';
}

// A reply to send uses every tool the shop allows; a suggestion for the team only reads and is told
// why the chat was handed over.
export function replyMode(
  input: Pick<ToolScope, 'chat'> & { rules: ShopRules },
  { inChat, ad }: { inChat: object | undefined; ad: object | undefined },
  suggestion: Suggestion | undefined,
) {
  if (suggestion)
    return {
      purpose: 'suggest_reply' as const,
      prompt: suggestReplyV2,
      tools: suggestionTools,
      opening: suggestionOpening(suggestion),
      allows: (name: string) => SUGGESTION_TOOLS.has(name),
    };
  const canOffer = Boolean(input.chat?.discountAskMessageId && !input.rules.handover.discounts);
  return {
    purpose: 'chat_reply' as const,
    prompt: promptWith(chatReplyV18, inChat, ad),
    tools: salesAgentToolsFor(input.rules, canOffer),
    opening: '',
    allows: () => true,
  };
}
