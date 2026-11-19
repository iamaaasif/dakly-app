import { z } from 'zod';

import { messagingWallets } from '../wallets';

export const walletCreditedEventSchema = z.strictObject({
  type: z.literal('wallet.credited'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ wallet: z.enum(messagingWallets), entryId: z.uuid() }),
});
