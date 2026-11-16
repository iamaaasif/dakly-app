import { z } from 'zod';

import type { wallets } from './billing';
import { supportReasonSchema } from './support';

// AI top-ups stay with the usage allowance (P2); WalletService serves the messaging balances.
export const messagingWallets = [
  'sms_credits',
  'whatsapp_poisha',
] as const satisfies readonly (typeof wallets)[number][];
export type MessagingWallet = (typeof messagingWallets)[number];

export const walletCreditRequestSchema = z.strictObject({
  wallet: z.enum(messagingWallets),
  quantity: z.number().int().min(1).max(1_000_000_000),
  reason: supportReasonSchema,
});
export const walletCreditEffectSchema = walletCreditRequestSchema.extend({
  action: z.literal('wallet.credited'),
  id: z.uuid(),
  storeId: z.uuid(),
  staffUserId: z.uuid(),
  staffSessionId: z.uuid(),
  shopName: z.string().min(1).max(200),
  confirmBy: z.iso.datetime(),
});
export const walletCreditConfirmationSchema = z.strictObject({
  effect: walletCreditEffectSchema,
  proof: z.string().regex(/^[a-f0-9]{64}$/),
  confirmed: z.literal(true),
});
export type WalletCreditRequest = z.infer<typeof walletCreditRequestSchema>;
export type WalletCreditEffect = z.infer<typeof walletCreditEffectSchema>;
export type WalletCreditPreview = { effect: WalletCreditEffect; proof: string };
export type WalletCreditConfirmation = z.infer<typeof walletCreditConfirmationSchema>;
export type WalletCreditResponse = { id: string; wallet: MessagingWallet; balanceQuantity: number };
export type WalletBalancesResponse = { smsCredits: number; whatsappPoisha: number };
