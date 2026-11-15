import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { Database } from '@dakly/db/client';
import { sql } from 'drizzle-orm';
import { accountSecurityNotices } from '@dakly/db/schema/account-recovery';
import { AccountDatabase } from '../platform/database/account-database';
import { DATABASE } from '../platform/database/database.tokens';
import type { EncryptedSecret } from '../platform/crypto/envelope-encryption';

export type ClaimedNotice = {
  id: string;
  userId: string;
  recoveryId: string | null;
  ciphertext: Buffer;
  keyVersion: number;
  leaseId: string;
  attempts: number;
};
@Injectable()
export class SecurityNoticesRepository {
  constructor(
    @Inject(AccountDatabase) private readonly account: AccountDatabase,
    @Inject(DATABASE) private readonly database: Database,
  ) {}
  async enqueue(userId: string, envelopes: EncryptedSecret[], recoveryId?: string) {
    if (!envelopes.length) return;
    await this.account.forUser(userId, (tx) =>
      tx
        .insert(accountSecurityNotices)
        .values(envelopes.map((envelope) => ({ userId, recoveryId, ...envelope }))),
    );
  }
  async claim(userId?: string): Promise<ClaimedNotice[]> {
    const result = await this.database.execute<ClaimedNotice>(sql`
      with due as (
        select id
        from account_security_notices
        where delivered_at is null
          and retry_at <= clock_timestamp()
          and (lease_until is null or lease_until < clock_timestamp())
          and (${userId ?? null}::uuid is null or user_id = ${userId ?? null}::uuid)
        order by retry_at, id
        limit 20
        for update skip locked
      )
      update account_security_notices n
      set
        lease_id = gen_random_uuid(),
        lease_until = clock_timestamp() + interval '2 minutes',
        attempts = attempts + 1
      from due
      where n.id=due.id
      returning
        n.id,
        n.user_id as "userId",
        n.recovery_id as "recoveryId",
        n.ciphertext,
        n.key_version as "keyVersion",
        n.lease_id as "leaseId",
        n.attempts
    `);
    return result.rows;
  }
  async delivered(notice: ClaimedNotice, now: Date): Promise<boolean> {
    const rows = await this.account.forUser(notice.userId, (tx) =>
      tx
        .update(accountSecurityNotices)
        .set({ deliveredAt: now, leaseId: null, leaseUntil: null })
        .where(
          and(
            eq(accountSecurityNotices.id, notice.id),
            eq(accountSecurityNotices.userId, notice.userId),
            eq(accountSecurityNotices.leaseId, notice.leaseId),
          ),
        )
        .returning({ id: accountSecurityNotices.id }),
    );
    return rows.length === 1;
  }
  async failed(notice: ClaimedNotice, retryAt: Date) {
    await this.account.forUser(notice.userId, (tx) =>
      tx
        .update(accountSecurityNotices)
        .set({ retryAt, leaseId: null, leaseUntil: null })
        .where(
          and(
            eq(accountSecurityNotices.id, notice.id),
            eq(accountSecurityNotices.userId, notice.userId),
            eq(accountSecurityNotices.leaseId, notice.leaseId),
          ),
        ),
    );
  }
}
