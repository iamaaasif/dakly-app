import {
  confirmOrderTool,
  draftOrderTool,
  offerLowerPriceTool,
  salesAgentTools,
  sendProductCardTool,
} from '@dakly/contracts/ai-agent-tools';
import type { LlmTool } from '@dakly/providers/llm/llm-driver';

import type { ShopRules } from './shop-rules';

const ALIAS_LIMIT = 3;

// The field names already say taka, so only the units that add something go to the model.
export const salesAgentLlmTools: readonly LlmTool[] = salesAgentTools.map((tool) => ({
  name: tool.name,
  input: tool.input,
  description: [
    tool.description,
    `Words customers use: ${tool.aliases.slice(0, ALIAS_LIMIT).join(', ')}.`,
    ...Object.entries(tool.units)
      .filter(([, unit]) => !unit.endsWith('converted from poisha'))
      .map(([field, unit]) => `${field}: ${unit}.`),
  ].join(' '),
}));

export function salesAgentToolsFor(
  rules: Pick<ShopRules, 'showProducts' | 'takeOrders'>,
  canOffer = false,
): readonly LlmTool[] {
  return salesAgentLlmTools.filter((tool) => {
    if (!canOffer && tool.name === offerLowerPriceTool.name) return false;
    if (!rules.showProducts && tool.name === sendProductCardTool.name) return false;
    if (
      !rules.takeOrders &&
      (tool.name === draftOrderTool.name || tool.name === confirmOrderTool.name)
    )
      return false;
    return true;
  });
}
