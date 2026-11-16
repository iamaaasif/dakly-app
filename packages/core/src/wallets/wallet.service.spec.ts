import { describe, expect, it } from 'vitest';

import type { StoreTransaction } from '../platform/database/store-transaction';
import type { WalletEntry, WalletLedgerRepository } from './wallet-ledger.repository';
import { WalletService } from './wallet.service';

const latest: WalletEntry = {
  id: '01890000-0000-7000-8000-000000000001',
  wallet: 'sms_credits',
  kind: 'top_up',
  revision: 1,
  quantityDelta: 5,
  balanceQuantityAfter: 5,
};

describe('WalletService', () => {
  it('refuses the write when the database check finds a negative balance', async () => {
    // A writer that skipped the lock moved the balance after this read.
    const ledger = {
      lockWallet: async () => {},
      findByIdempotencyKey: async () => undefined,
      latest: async () => latest,
      insert: async () => 'balance_negative' as const,
    };
    const wallets = new WalletService(
      ledger as unknown as WalletLedgerRepository,
      { run: (_storeId: string, work: () => Promise<unknown>) => work() } as StoreTransaction,
    );

    await expect(
      wallets.reserve('store-id', {
        wallet: 'sms_credits',
        quantity: 2,
        idempotencyKey: 'campaign-1',
        actor: { kind: 'system' },
      }),
    ).rejects.toMatchObject({ code: 'WALLET_BALANCE_TOO_LOW' });
  });
});
