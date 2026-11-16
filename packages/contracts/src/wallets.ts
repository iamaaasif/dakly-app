import type { wallets } from './billing';

// AI top-ups stay with the usage allowance (P2); WalletService serves the messaging balances.
export type MessagingWallet = Extract<(typeof wallets)[number], 'sms_credits' | 'whatsapp_poisha'>;

export type WalletBalancesResponse = { smsCredits: number; whatsappPoisha: number };
