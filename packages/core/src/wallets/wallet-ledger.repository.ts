import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt, sql } from 'drizzle-orm';

import { walletLedger } from '@dakly/db/schema/billing';

import { isConstraintViolation } from '../platform/database/error-code';
import { TenantDatabase } from '../platform/database/tenant-database';

const entryColumns = {
  id: walletLedger.id,
  wallet: walletLedger.wallet,
  kind: walletLedger.kind,
  revision: walletLedger.revision,
  quantityDelta: walletLedger.quantityDelta,
  balanceQuantityAfter: walletLedger.balanceQuantityAfter,
};
export type WalletEntry = {
  [Key in keyof typeof entryColumns]: (typeof walletLedger.$inferSelect)[Key];
};
export type NewWalletEntry = Omit<typeof walletLedger.$inferInsert, 'storeId' | 'createdAt'>;

@Injectable()
export class WalletLedgerRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  // Joins the caller's transaction, so the lock lasts until that transaction ends.
  async lockWallet(storeId: string, wallet: WalletEntry['wallet']): Promise<void> {
    await this.database.inTransaction(storeId, (tx) =>
      tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`wallet:${storeId}:${wallet}`}, 0))`,
      ),
    );
  }

  async latest(storeId: string, wallet: WalletEntry['wallet']): Promise<WalletEntry | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select(entryColumns)
        .from(walletLedger)
        .where(and(eq(walletLedger.storeId, storeId), eq(walletLedger.wallet, wallet)))
        .orderBy(desc(walletLedger.revision))
        .limit(1),
    );
    return row;
  }

  async findById(storeId: string, id: string): Promise<WalletEntry | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select(entryColumns)
        .from(walletLedger)
        .where(and(eq(walletLedger.storeId, storeId), eq(walletLedger.id, id)))
        .limit(1),
    );
    return row;
  }

  async findByIdempotencyKey(storeId: string, key: string): Promise<WalletEntry | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select(entryColumns)
        .from(walletLedger)
        .where(and(eq(walletLedger.storeId, storeId), eq(walletLedger.idempotencyKey, key)))
        .limit(1),
    );
    return row;
  }

  // Settlements come after the reservation, so the (store, wallet, revision) index bounds the scan.
  async findRelease(storeId: string, reservation: WalletEntry): Promise<WalletEntry | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select(entryColumns)
        .from(walletLedger)
        .where(
          and(
            eq(walletLedger.storeId, storeId),
            eq(walletLedger.wallet, reservation.wallet),
            gt(walletLedger.revision, reservation.revision),
            eq(walletLedger.kind, 'release'),
            eq(walletLedger.referenceType, 'wallet_reservation'),
            eq(walletLedger.referenceId, reservation.id),
          ),
        )
        .limit(1),
    );
    return row;
  }

  // Returns when the rows were written, by the database's clock taken after the wallet lock, so a
  // credit is later than any write that held the lock before it. Returns 'balance_negative' when
  // the check constraint refuses a balance below zero.
  async insert(storeId: string, entries: NewWalletEntry[]): Promise<Date | 'balance_negative'> {
    try {
      const [written] = await this.database.inTransaction(storeId, (tx) =>
        tx
          .insert(walletLedger)
          .values(
            entries.map((entry) => ({ ...entry, storeId, createdAt: sql`clock_timestamp()` })),
          )
          .returning({ createdAt: walletLedger.createdAt }),
      );
      if (!written) throw new Error('The wallet insert returned no row');
      return written.createdAt;
    } catch (error) {
      if (isConstraintViolation(error, '23514', 'wallet_ledger_balance')) return 'balance_negative';
      throw error;
    }
  }
}
