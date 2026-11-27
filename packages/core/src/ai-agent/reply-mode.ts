import type { handoverReasons } from '@dakly/contracts/chats';

import { chatReplyV17 } from './prompts/chat-reply.v17';
import { suggestReplyV1 } from './prompts/suggest-reply.v1';
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

// A reply to send uses every tool the shop allows; a suggestion for the team only reads and is told
// why the chat was handed over.
export function replyMode(
  input: Pick<ToolScope, 'chat'> & { rules: ShopRules },
  { inChat, ad }: { inChat: object | undefined; ad: object | undefined },
  suggestionFor: Reason | undefined,
) {
  if (suggestionFor)
    return {
      purpose: 'suggest_reply' as const,
      prompt: suggestReplyV1,
      tools: suggestionTools,
      opening: `\n<handover_reason>${suggestionFor}</handover_reason>`,
      allows: (name: string) => SUGGESTION_TOOLS.has(name),
    };
  const canOffer = Boolean(input.chat?.discountAskMessageId && !input.rules.handover.discounts);
  return {
    purpose: 'chat_reply' as const,
    prompt: promptWith(chatReplyV17, inChat, ad),
    tools: salesAgentToolsFor(input.rules, canOffer),
    opening: '',
    allows: () => true,
  };
}
