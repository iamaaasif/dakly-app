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
