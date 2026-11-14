import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '@dakly/db/client';
import { supportGrants, supportSessions, staffUsers, staffSessions } from '@dakly/db/schema/admin';
import { sessions, users } from '@dakly/db/schema/auth';
import { memberships } from '@dakly/db/schema/team';
import { stores } from '@dakly/db/schema/stores';
import { DATABASE } from '../platform/database/database.tokens';
import { TenantDatabase } from '../platform/database/tenant-database';
import type { SupportRequestInput, SupportPrincipal } from '@dakly/contracts/support';
const grantColumns = {
  id: supportGrants.id,
  storeId: supportGrants.storeId,
  staffUserId: supportGrants.staffUserId,
  staffSessionId: supportGrants.staffSessionId,
  staffName: staffUsers.name,
  scopes: supportGrants.scopes,
  access: supportGrants.access,
  status: supportGrants.status,
  reason: supportGrants.reason,
  durationMinutes: supportGrants.durationMinutes,
  requestedAt: supportGrants.requestedAt,
  expiresAt: supportGrants.expiresAt,
};
export type SupportGrant = typeof supportGrants.$inferSelect;
@Injectable()
export class SupportRepository {
  constructor(
    @Inject(TenantDatabase) private readonly tenant: TenantDatabase,
    @Inject(DATABASE) private readonly database: Database,
  ) {}
  async ownerSession(storeId: string, userId: string, sessionId: string, now: Date) {
    return this.tenant.forStore(storeId, async (tx) =>
      Boolean(
        (
          await tx
            .select({ id: sessions.id })
            .from(sessions)
            .innerJoin(users, eq(users.id, sessions.userId))
            .where(
              and(
                eq(sessions.id, sessionId),
                eq(sessions.userId, userId),
                eq(sessions.activeStoreId, storeId),
                eq(users.isDisabled, false),
                sql`${sessions.revokedAt} is null`,
                sql`${sessions.expiresAt}>${now}`,
              ),
            )
            .for('share')
        )[0],
      ),
    );
  }
  async targets(query: string) {
    return (
      await this.database.execute<{ id: string; name: string }>(
        sql`select * from support_store_targets(${query})`,
      )
    ).rows;
  }
  async staffGrants(staffUserId: string, before?: string) {
    return (
      await this.database.execute<import('@dakly/contracts/support').SupportGrantResponse>(
        sql`select * from support_request_metadata(${staffUserId}::uuid,${before ?? null}::uuid)`,
      )
    ).rows;
  }
  async grantStore(staffUserId: string, id: string) {
    return (
      await this.database.execute<{ store_id: string }>(
        sql`select support_grant_store(${staffUserId}::uuid,${id}::uuid) as store_id`,
      )
    ).rows.filter((row) => row.store_id)[0];
  }
  async list(storeId: string, before?: string) {
    return this.tenant.forStore(storeId, (tx) =>
      tx
        .select(grantColumns)
        .from(supportGrants)
        .innerJoin(staffUsers, eq(staffUsers.id, supportGrants.staffUserId))
        .where(
          and(
            eq(supportGrants.storeId, storeId),
            before ? sql`${supportGrants.id}<${before}::uuid` : undefined,
          ),
        )
        .orderBy(sql`${supportGrants.id} desc`)
        .limit(50),
    );
  }
  async find(storeId: string, id: string) {
    return this.tenant.forStore(
      storeId,
      async (tx) =>
        (
          await tx
            .select(grantColumns)
            .from(supportGrants)
            .innerJoin(staffUsers, eq(staffUsers.id, supportGrants.staffUserId))
            .where(and(eq(supportGrants.storeId, storeId), eq(supportGrants.id, id)))
            .limit(1)
        )[0],
    );
  }
  async owner(storeId: string) {
    return this.tenant.forStore(
      storeId,
      async (tx) =>
        (
          await tx
            .select({ userId: memberships.userId })
            .from(memberships)
            .where(
              and(
                eq(memberships.storeId, storeId),
                eq(memberships.builtInRole, 'owner'),
                eq(memberships.status, 'active'),
              ),
            )
            .limit(1)
        )[0]?.userId,
    );
  }
  async insert(
    storeId: string,
    id: string,
    staffUserId: string,
    staffSessionId: string,
    input: SupportRequestInput,
    now: Date,
  ) {
    await this.tenant.inTransaction(storeId, (tx) =>
      tx.insert(supportGrants).values({
        id,
        storeId,
        staffUserId,
        staffSessionId,
        scopes: input.scopes,
        reason: input.reason,
        access: input.access,
        durationMinutes: input.durationMinutes,
        requestedAt: now,
      }),
    );
  }
  async change(
    storeId: string,
    id: string,
    values: Partial<
      Pick<SupportGrant, 'status' | 'approvedByUserId' | 'approvedAt' | 'expiresAt' | 'endedAt'>
    >,
  ) {
    await this.tenant.inTransaction(storeId, (tx) =>
      tx
        .update(supportGrants)
        .set(values)
        .where(and(eq(supportGrants.storeId, storeId), eq(supportGrants.id, id))),
    );
  }
  async staff(storeId: string, staffUserId: string, sessionId: string) {
    return this.tenant.forStore(
      storeId,
      async (tx) =>
        (
          await tx
            .select({
              id: staffUsers.id,
              name: staffUsers.name,
              role: staffUsers.role,
              status: staffUsers.status,
              enrolledAt: staffUsers.enrolledAt,
              expiresAt: staffSessions.expiresAt,
              revokedAt: staffSessions.revokedAt,
              lastSeenAt: staffSessions.lastSeenAt,
            })
            .from(staffUsers)
            .innerJoin(
              staffSessions,
              and(eq(staffSessions.staffUserId, staffUsers.id), eq(staffSessions.id, sessionId)),
            )
            .where(eq(staffUsers.id, staffUserId))
            .for('share')
        )[0],
    );
  }
  async handoff(storeId: string, principal: SupportPrincipal, hash: Buffer, expiresAt: Date) {
    await this.tenant.inTransaction(storeId, (tx) =>
      tx
        .insert(supportSessions)
        .values({ ...principal, handoffHash: hash, handoffExpiresAt: expiresAt }),
    );
  }
  async locate(hash: Buffer, handoff: boolean) {
    return (
      await this.database.execute<{ store_id: string | null }>(
        sql`select support_session_store(${hash},${handoff}) as store_id`,
      )
    ).rows[0]?.store_id;
  }
  async session(storeId: string, hash: Buffer, handoff: boolean) {
    return this.tenant.forStore(
      storeId,
      async (tx) =>
        (
          await tx
            .select({
              storeId: supportSessions.storeId,
              grantId: supportSessions.grantId,
              staffUserId: supportSessions.staffUserId,
              staffSessionId: supportSessions.staffSessionId,
              consumedAt: supportSessions.consumedAt,
              handoffExpiresAt: supportSessions.handoffExpiresAt,
            })
            .from(supportSessions)
            .where(
              and(
                eq(supportSessions.storeId, storeId),
                handoff
                  ? eq(supportSessions.handoffHash, hash)
                  : eq(supportSessions.tokenHash, hash),
              ),
            )
            .for('update')
        )[0],
    );
  }
  async consume(storeId: string, hash: Buffer, tokenHash: Buffer, now: Date) {
    await this.tenant.inTransaction(storeId, (tx) =>
      tx
        .update(supportSessions)
        .set({ tokenHash, consumedAt: now })
        .where(and(eq(supportSessions.storeId, storeId), eq(supportSessions.handoffHash, hash))),
    );
  }
  async storeName(storeId: string) {
    return this.tenant.forStore(
      storeId,
      async (tx) =>
        (
          await tx.select({ name: stores.name }).from(stores).where(eq(stores.id, storeId)).limit(1)
        )[0]!.name,
    );
  }
}
