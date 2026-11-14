import { z } from 'zod';

export const billingCycles = ['monthly', 'yearly'] as const;
export const subscriptionStatuses = [
  'trialing',
  'active',
  'past_due',
  'read_only',
  'cancelled',
] as const;
export const renewalMethods = ['bkash_agreement', 'pay_link'] as const;
export const invoiceKinds = ['invoice', 'credit_note'] as const;
export const invoiceStatuses = ['open', 'paid', 'void'] as const;
export const couponKinds = ['percent', 'amount'] as const;
export const couponDurations = ['once', 'months', 'forever'] as const;
export const planTrialDaysSchema = z.number().int().min(0).max(90);
export const couponDurationSchema = z.discriminatedUnion('duration', [
  z.strictObject({ duration: z.literal('once'), durationMonths: z.null() }),
  z.strictObject({
    duration: z.literal('months'),
    durationMonths: z.number().int().min(1).max(36),
  }),
  z.strictObject({ duration: z.literal('forever'), durationMonths: z.null() }),
]);
// Prepaid balances. WhatsApp is in poisha; SMS and AI top-ups are counts.
export const wallets = ['whatsapp_poisha', 'sms_credits', 'ai_conversations'] as const;
export const walletEntryKinds = [
  'top_up',
  'charge',
  'reserve',
  'release',
  'refund',
  'adjustment',
  'expiry',
] as const;
// Plan allowances consumed through UsageService.consume.
export const usageUnits = ['ai_conversation', 'ai_content', 'ai_ask'] as const;
export const usageSources = ['allowance', 'top_up'] as const;
// A plan is the base subscription; an add-on (Chats AI tiers) is bought on top of one.
export const planKinds = ['plan', 'add_on'] as const;
export const subscriptionItemStatuses = ['active', 'cancelled'] as const;
