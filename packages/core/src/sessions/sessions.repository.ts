import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, lte, ne } from 'drizzle-orm';
import type { Database } from '@dakly/db/client';
import { sessions, users } from '@dakly/db/schema/auth';
import type { CreateSessionInput, Session } from '@dakly/contracts/sessions';
import { DATABASE } from '../platform/database/database.tokens';
import { AccountDatabase } from '../platform/database/account-database';

const columns = {
  id: sessions.id,
  userId: sessions.userId,
  activeStoreId: sessions.activeStoreId,
  isRemembered: sessions.isRemembered,
  lastSeenAt: sessions.lastSeenAt,
  expiresAt: sessions.expiresAt,
};

@Injectable()
export class SessionsRepository {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(AccountDatabase) private readonly account: AccountDatabase,
  ) {}

  async findByTokenHash(tokenHash: Buffer, now: Date): Promise<Session | undefined> {
    // The identity is unknown until this indexed read; no account or tenant scope exists yet.
    const rows = await this.database
      .select(columns)
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.tokenHash, tokenHash),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, now),
          eq(users.isDisabled, false),
        ),
      )
      .limit(1);
    return rows[0];
  }

  async insert(
    userId: string,
    tokenHash: Buffer,
    input: CreateSessionInput,
    now: Date,
    expiresAt: Date,
  ): Promise<Session> {
    const rows = await this.account.forUser(userId, (tx) =>
      tx
        .insert(sessions)
        .values({
          userId,
          tokenHash,
          ...input,
          lastSeenAt: now,
          expiresAt,
        })
        .returning(columns),
    );
    return rows[0]!;
  }

  async touch(userId: string, id: string, now: Date, cutoff: Date, expiresAt: Date): Promise<void> {
    await this.account.forUser(userId, (tx) =>
      tx
        .update(sessions)
        .set({ lastSeenAt: now, expiresAt })
        .where(
          and(
            eq(sessions.userId, userId),
            eq(sessions.id, id),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, now),
            lte(sessions.lastSeenAt, cutoff),
          ),
        ),
    );
  }

  async revoke(userId: string, id: string, now: Date, others: boolean): Promise<boolean> {
    const rows = await this.account.forUser(userId, (tx) =>
      tx
        .update(sessions)
        .set({ revokedAt: now })
        .where(
          and(
            eq(sessions.userId, userId),
            others ? ne(sessions.id, id) : eq(sessions.id, id),
            isNull(sessions.revokedAt),
          ),
        )
        .returning({ id: sessions.id }),
    );
    return rows.length > 0;
  }

  async setActiveStore(userId: string, id: string, storeId: string, now: Date): Promise<boolean> {
    const rows = await this.account.forUser(userId, (tx) =>
      tx
        .update(sessions)
        .set({ activeStoreId: storeId })
        .where(
          and(
            eq(sessions.userId, userId),
            eq(sessions.id, id),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, now),
          ),
        )
        .returning({ id: sessions.id }),
    );
    return rows.length > 0;
  }
}
