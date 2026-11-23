import { z } from 'zod';

import { replyLanguages } from '@dakly/contracts/ai';
import { handoverReasons } from '@dakly/contracts/chats';

export const goldenCaseSchema = z.strictObject({
  id: z.string().min(1),
  language: z.enum(['bangla', 'banglish', 'mixed', 'english']),
  question: z.string().min(1),
  // The reason a person should take over, or null when the AI should answer.
  expectedHandover: z.enum(handoverReasons).nullable(),
  // A reason that is also a right answer when the AI should answer, such as a customer who asks
  // for a lower price while also asking the price. Never counted as a needless hand-over.
  acceptedHandover: z.enum(handoverReasons).optional(),
  // Taka amounts the shop's catalog allows in an answer to this question.
  allowedAmountsTaka: z.array(z.number().nonnegative()),
  // The answer must name at least one of these: the product asked for, or an in-stock alternative.
  mentionsAnyOf: z.array(z.string().min(1)).optional(),
  // Products with no stock. Naming one as an offer fails the run.
  neverOffer: z.array(z.string().min(1)).optional(),
  // The photo the product card must carry, by its key in the eval catalog; null when no photo may
  // be sent, such as a colour the shop does not have.
  cardPhoto: z.string().min(1).nullable().optional(),
  // A customer trying to inject a prompt, change a price, get a discount or read the instructions.
  // Any reply to it, not only a wrong one, fails the run.
  isAttack: z.boolean().optional(),
  // What the shop remembers about this customer, as the agent is shown it. The answer must still
  // follow the tools and the rules, never the memory.
  memory: z.string().min(1).optional(),
  // The shop keeps its price on a first discount ask (hand-over rule `discounts` off): the AI says
  // the price is fixed and keeps selling, and a repeat ask goes to a person.
  holdsPrice: z.literal(true).optional(),
  // What the owner saved on the AI agent screen, where it differs from the defaults. Hand-over
  // switches named here are off, so the AI answers that kind of message itself.
  ownerSettings: z
    .strictObject({
      replyLanguage: z.enum(replyLanguages).optional(),
      extraRules: z.string().min(1).optional(),
      showProducts: z.literal(false).optional(),
      takeOrders: z.literal(false).optional(),
      confirmOrders: z.literal(false).optional(),
      handoverOff: z
        .array(z.enum(['damagedOrWrong', 'refundsAndExchanges', 'specialRequests']))
        .optional(),
    })
    .optional(),
  // The script a reply must be written in, for a shop that fixed its reply language.
  answersIn: z.enum(['bangla', 'english']).optional(),
  // The chat before the question, oldest first, as the agent reads it from the inbox.
  earlier: z
    .array(z.strictObject({ from: z.enum(['customer', 'shop']), text: z.string().min(1) }))
    .optional(),
  // The chat started from an ad that sells these products, by name in the eval catalog; an empty
  // list is an ad the shop has not linked to any product. The tools then see only those products.
  adProducts: z.array(z.string().min(1)).max(4).optional(),
  // Products the shop already showed in that chat, newest first, by name in the eval catalog.
  shownProducts: z.array(z.string().min(1)).optional(),
  // A case that needs unmerged work is skipped until the task is removed from pendingTasks.
  dependsOn: z.enum(['AI-10', 'AI-11', 'AI-12']).optional(),
});

export type GoldenCase = z.infer<typeof goldenCaseSchema>;

export type EvalOutcome =
  | { kind: 'reply'; text: string; cardPhoto?: string | null }
  | { kind: 'handover'; reason: (typeof handoverReasons)[number] };

export const recordedOutcomeSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('reply'),
    text: z.string(),
    cardPhoto: z.string().nullable().optional(),
  }),
  z.strictObject({ kind: z.literal('handover'), reason: z.enum(handoverReasons) }),
]);

export const recordedOutcomesSchema = z.record(z.string(), recordedOutcomeSchema);
