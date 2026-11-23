import type { replyLanguages } from '@dakly/contracts/ai';
import {
  agentAbilitiesSchema,
  defaultAgentAbilities,
  defaultHandoverRules,
  handoverRulesSchema,
  type AgentAbilities,
  type HandoverRules,
} from '@dakly/contracts/ai-agent-settings';
import type { handoverReasons } from '@dakly/contracts/chats';

type Reason = (typeof handoverReasons)[number];

// What the owner saved on the AI agent screen that changes how a chat reply is written.
export type ShopRules = {
  replyLanguage: (typeof replyLanguages)[number];
  extraRules: string | null;
  handover: HandoverRules;
  showProducts: AgentAbilities['showProducts'];
  takeOrders: AgentAbilities['takeOrders'];
  confirmOrders: AgentAbilities['confirmOrders'];
};

export const defaultShopRules: ShopRules = {
  replyLanguage: 'match_customer',
  extraRules: null,
  handover: defaultHandoverRules,
  showProducts: defaultAgentAbilities.showProducts,
  takeOrders: defaultAgentAbilities.takeOrders,
  confirmOrders: defaultAgentAbilities.confirmOrders,
};

// A shop that never saved a switch gets its default, so a new switch never changes an old shop.
export function shopRulesFrom(settings: {
  abilities: unknown;
  handoverRules: unknown;
  replyLanguage?: ShopRules['replyLanguage'];
  extraRules?: string | null;
}): ShopRules {
  const abilities = agentAbilitiesSchema.partial().parse(settings.abilities);
  return {
    replyLanguage: settings.replyLanguage ?? defaultShopRules.replyLanguage,
    extraRules: settings.extraRules?.trim() || null,
    handover: {
      ...defaultHandoverRules,
      ...handoverRulesSchema.partial().parse(settings.handoverRules),
    },
    showProducts: abilities.showProducts ?? defaultShopRules.showProducts,
    takeOrders: abilities.takeOrders ?? defaultShopRules.takeOrders,
    confirmOrders: abilities.confirmOrders ?? defaultShopRules.confirmOrders,
  };
}

// Goes right after the shop block, which is stable per shop, so the prompt cache still holds.
// The owner's text is JSON, with "<" escaped so it cannot close the block.
export function shopRulesBlock(rules: ShopRules) {
  const { replyLanguage, extraRules, showProducts, takeOrders, confirmOrders } = rules;
  const json = JSON.stringify({
    replyLanguage,
    extraRules,
    showProducts,
    takeOrders,
    confirmOrders,
    handsOverRefunds: rules.handover.refundsAndExchanges,
    handsOverDamaged: rules.handover.damagedOrWrong,
  }).replace(/</g, '\\u003c');
  return `<shop_rules>${json}</shop_rules>`;
}

// A tool the owner switched off is refused here, whatever the model asks for.
export type ToolRefusal =
  { kind: 'handover'; reason: Reason } | { kind: 'error'; result: { error: string; note: string } };

export function refuseToolCall(
  rules: ShopRules,
  call: { name: string; argumentsJson: string },
): ToolRefusal | undefined {
  if (call.name === 'send_product_card' && !rules.showProducts)
    return error('SHOW_PRODUCTS_OFF', 'Do not send a card. Describe the product in words.');
  if (isOrderToolOff(rules, call.name)) return { kind: 'handover', reason: 'ready_to_buy' };
  return call.name === 'hand_over' && answersItself(rules, call.argumentsJson)
    ? error(
        'HANDOVER_OFF',
        'This shop answers this itself. Call search_knowledge for its policy and answer from that.',
      )
    : undefined;
}

function isOrderToolOff(rules: ShopRules, tool: string) {
  if (tool === 'draft_order') return !rules.takeOrders;
  return tool === 'confirm_order' && !(rules.takeOrders && rules.confirmOrders);
}

function answersItself(rules: ShopRules, argumentsJson: string) {
  const reason = handOverReasonOf(argumentsJson);
  return (
    (reason === 'refund' && !rules.handover.refundsAndExchanges) ||
    (reason === 'complaint' && !rules.handover.damagedOrWrong)
  );
}

const error = (code: string, note: string): ToolRefusal => ({
  kind: 'error',
  result: { error: code, note },
});

function handOverReasonOf(argumentsJson: string) {
  try {
    return (JSON.parse(argumentsJson) as { reason?: unknown }).reason;
  } catch {
    return undefined;
  }
}
