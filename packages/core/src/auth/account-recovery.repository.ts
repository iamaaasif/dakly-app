import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';

import type { Database } from '@dakly/db/client';
import { accountRecoveries, accountSecurityNotices } from '@dakly/db/schema/account-recovery';

import { AccountDatabase } from '../platform/database/account-database';
import { DATABASE } from '../platform/database/database.tokens';

const columns = {
  id: accountRecoveries.id,
  userId: accountRecoveries.userId,
  credentialState: accountRecoveries.credentialState,
  cancelHash: accountRecoveries.cancelHash,
  completionHash: accountRecoveries.completionHash,
  status: accountRecoveries.status,
  eligibleAt: accountRecoveries.eligibleAt,
};
@Injectable()
export class AccountRecoveryRepository {
  constructor(
    @Inject(AccountDatabase) private readonly account: AccountDatabase,
    @Inject(DATABASE) private readonly database: Database,
  ) {}
  async identify(recoveryId: string) {
    const [row] = await this.database
      .select({ userId: accountRecoveries.userId })
      .from(accountRecoveries)
      .where(eq(accountRecoveries.id, recoveryId))
      .limit(1);
    return row?.userId;
  }
  async read(userId: string, recoveryId: string) {
    const [row] = await this.account.forUser(userId, (tx) =>
      tx
        .select(columns)
        .from(accountRecoveries)
        .where(and(eq(accountRecoveries.userId, userId), eq(accountRecoveries.id, recoveryId)))
        .limit(1),
    );
    return row;
  }
  async start(
    userId: string,
    input: { credentialState: string; cancelHash: string; completionHash: string },
  ) {
    const [row] = await this.account.forUser(userId, (tx) =>
      tx
        .insert(accountRecoveries)
        .values({ userId, ...input })
        .returning({ id: accountRecoveries.id }),
    );
    return row!.id;
  }
  async cancelPending(userId: string) {
    return this.account.forUser(userId, (tx) =>
      tx
        .update(accountRecoveries)
        .set({ status: 'cancelled' })
        .where(and(eq(accountRecoveries.userId, userId), eq(accountRecoveries.status, 'pending')))
        .returning({ id: accountRecoveries.id }),
    );
  }
  async finish(userId: string, recoveryId: string) {
    await this.account.forUser(userId, (tx) =>
      tx
        .update(accountRecoveries)
        .set({ status: 'completed' })
        .where(
          and(
            eq(accountRecoveries.userId, userId),
            eq(accountRecoveries.id, recoveryId),
            eq(accountRecoveries.status, 'pending'),
          ),
        ),
    );
  }
  async allowAfterNotices(userId: string, recoveryId: string, state: string, eligibleAt: Date) {
    await this.account.forUser(userId, (tx) =>
      tx
        .update(accountRecoveries)
        .set({ eligibleAt })
        .where(
          and(
            eq(accountRecoveries.id, recoveryId),
            eq(accountRecoveries.userId, userId),
            eq(accountRecoveries.status, 'pending'),
            eq(accountRecoveries.credentialState, state),
            isNull(accountRecoveries.eligibleAt),
            sql`not exists (select 1 from ${accountSecurityNotices} n where n.recovery_id = ${recoveryId} and n.delivered_at is null)`,
          ),
        ),
    );
  }
}
