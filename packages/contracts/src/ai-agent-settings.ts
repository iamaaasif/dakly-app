import { z } from 'zod';

import { replyLanguages } from './ai';

export const followUpLevels = ['off', 'hot', 'hot_and_warm'] as const;
export const productCardStyles = ['buttons', 'text'] as const;

export const agentAbilitiesSchema = z.strictObject({
  answerQuestions: z.boolean(),
  showProducts: z.boolean(),
  takeOrders: z.boolean(),
  confirmOrders: z.boolean(),
  courierUpdates: z.boolean(),
  askForReview: z.boolean(),
  answerComments: z.boolean(),
  followUp: z.enum(followUpLevels),
  // Buttons send a card with Order now, See sizes and Talk to a person; text sends photo and text.
  productCardStyle: z.enum(productCardStyles),
});

export const handoverRulesSchema = z.strictObject({
  damagedOrWrong: z.boolean(),
  refundsAndExchanges: z.boolean(),
  specialRequests: z.boolean(),
});

export const defaultAgentAbilities = {
  answerQuestions: true,
  showProducts: true,
  takeOrders: true,
  confirmOrders: true,
  courierUpdates: true,
  askForReview: true,
  answerComments: true,
  followUp: 'hot',
  productCardStyle: 'text',
} satisfies AgentAbilities;

export const defaultHandoverRules = {
  damagedOrWrong: true,
  refundsAndExchanges: true,
  specialRequests: true,
} satisfies HandoverRules;

export const saveAgentSettingsSchema = z.strictObject({
  // The version the person loaded, so a save never overwrites a newer one.
  version: z.int().min(0),
  isAutoReplyOn: z.boolean(),
  replyLanguage: z.enum(replyLanguages),
  abilities: agentAbilitiesSchema,
  handoverRules: handoverRulesSchema,
  // Minutes until a chat a person replied in goes back to the AI; null means the person hands it back.
  returnToAiMinutes: z.union([z.literal(60), z.literal(1440), z.null()]),
  extraRules: z.string().trim().max(2000).nullable(),
});

export type AgentAbilities = z.infer<typeof agentAbilitiesSchema>;
export type HandoverRules = z.infer<typeof handoverRulesSchema>;
export type SaveAgentSettingsInput = z.infer<typeof saveAgentSettingsSchema>;
// Version 0 means the shop never saved: the response then holds the defaults and
// handoverRulesSaved is false, which Go live treats as "hand-over rules not set".
export type AgentSettingsResponse = SaveAgentSettingsInput & { handoverRulesSaved: boolean };
