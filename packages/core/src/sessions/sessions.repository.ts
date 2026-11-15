import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, ne, sql, desc, lt } from 'drizzle-orm';
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

  async list(userId: string, now: Date, before?: string) {
    return this.account.forUser(userId, (tx) =>
      tx
        .select({ ...columns, ip: sessions.ip, userAgent: sessions.userAgent })
        .from(sessions)
        .where(
          and(
            eq(sessions.userId, userId),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, now),
            before ? lt(sessions.id, before) : undefined,
          ),
        )
        .orderBy(desc(sessions.id))
        .limit(100),
    );
  }
  async isActive(userId: string, sessionId: string, now: Date): Promise<boolean> {
    return this.account.inTransaction(userId, async (tx) => {
      const rows = await tx
        .select({ id: sessions.id })
        .from(sessions)
        .where(
          and(
            eq(sessions.userId, userId),
            eq(sessions.id, sessionId),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, now),
          ),
        )
        .limit(1);
      return rows.length === 1;
    });
  }

  async knownDevice(userId: string, ip: string, userAgent?: string): Promise<boolean> {
    const rows = await this.account.forUser(userId, (tx) =>
      tx
        .select({ id: sessions.id })
        .from(sessions)
        .where(
          and(
            eq(sessions.userId, userId),
            eq(sessions.ip, ip),
            userAgent ? eq(sessions.userAgent, userAgent) : isNull(sessions.userAgent),
          ),
        )
        .limit(1),
    );
    return rows.length > 0;
  }

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

  async touch(
    userId: string,
    id: string,
    lifetimeMilliseconds: number,
    touchInterval: number,
  ): Promise<void> {
    // Materialization keeps the clock read after FOR UPDATE acquires the current row.
    // A WHERE clock_timestamp() alone can run before a row-lock wait; now() is transaction time.
    await this.account.forUser(userId, (tx) =>
      tx.execute(sql`
      with locked_session as materialized (
        select id, expires_at, revoked_at, last_seen_at from ${sessions}
        where id = ${id} and user_id = ${userId}
        for update
      ), renewal as materialized (
        select id, expires_at, revoked_at, last_seen_at, clock_timestamp() as checked_at
        from locked_session
      )
      update ${sessions}
      set last_seen_at = renewal.checked_at,
          expires_at = renewal.checked_at + ${lifetimeMilliseconds}::double precision * interval '1 millisecond'
      from renewal
      where sessions.id = renewal.id and sessions.user_id = ${userId}
        and renewal.revoked_at is null
        and renewal.expires_at > renewal.checked_at
        and renewal.last_seen_at <= renewal.checked_at - ${touchInterval}::double precision * interval '1 millisecond'
    `),
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

  async revokeAll(userId: string, now: Date): Promise<void> {
    await this.account.forUser(userId, (tx) =>
      tx
        .update(sessions)
        .set({ revokedAt: now })
        .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt))),
    );
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
