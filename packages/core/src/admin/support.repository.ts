import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import type { BreakGlassEffect } from '@dakly/contracts/break-glass';
import type {
  SupportGrantResponse,
  SupportRequestInput,
  SupportPrincipal,
} from '@dakly/contracts/support';
import type { Database } from '@dakly/db/client';
import { supportGrants, supportSessions, staffUsers, staffSessions } from '@dakly/db/schema/admin';
import { sessions, users } from '@dakly/db/schema/auth';
import { stores } from '@dakly/db/schema/stores';
import { memberships } from '@dakly/db/schema/team';

import { DATABASE } from '../platform/database/database.tokens';
import { TenantDatabase } from '../platform/database/tenant-database';
import { STAFF_IDLE_MS } from './staff-session-policy';

const staffColumns = {
  id: staffUsers.id,
  name: staffUsers.name,
  role: staffUsers.role,
  status: staffUsers.status,
  enrolledAt: staffUsers.enrolledAt,
};
const parentColumns = {
  expiresAt: staffSessions.expiresAt,
  revokedAt: staffSessions.revokedAt,
  lastSeenAt: staffSessions.lastSeenAt,
};
const sessionColumns = {
  storeId: supportSessions.storeId,
  grantId: supportSessions.grantId,
  staffUserId: supportSessions.staffUserId,
  staffSessionId: supportSessions.staffSessionId,
  consumedAt: supportSessions.consumedAt,
  handoffExpiresAt: supportSessions.handoffExpiresAt,
};
const grantColumns = {
  id: supportGrants.id,
  storeId: supportGrants.storeId,
  staffUserId: supportGrants.staffUserId,
  staffName: staffUsers.name,
  isBreakGlass: supportGrants.isBreakGlass,
  scopes: supportGrants.scopes,
  access: supportGrants.access,
  status: supportGrants.status,
  reason: supportGrants.reason,
  durationMinutes: supportGrants.durationMinutes,
  requestedAt: supportGrants.requestedAt,
  expiresAt: supportGrants.expiresAt,
};
export type SupportGrant = typeof supportGrants.$inferSelect;
export type SupportGrantRow = Pick<
  SupportGrant,
  Exclude<keyof typeof grantColumns, 'staffName'>
> & {
  staffName: string;
};
export type SupportStaff = Pick<typeof staffUsers.$inferSelect, keyof typeof staffColumns>;
export type StaffParentSession = Pick<
  typeof staffSessions.$inferSelect,
  keyof typeof parentColumns
>;
type SupportRequest = { id: string; staffUserId: string; input: SupportRequestInput; now: Date };

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

  async readOwnerSession(storeId: string, userId: string, sessionId: string, now: Date) {
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
      await this.database.execute<SupportGrantResponse>(
        sql`select * from support_request_metadata(${staffUserId}::uuid,${before ?? null}::uuid)`,
      )
    ).rows;
  }

  async grantStore(staffUserId: string, id: string) {
    return (
      await this.database.execute<{ store_id: string | null }>(
        sql`select support_grant_store(${staffUserId}::uuid,${id}::uuid) as store_id`,
      )
    ).rows[0]?.store_id;
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

  async find(storeId: string, id: string): Promise<SupportGrantRow | undefined> {
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

  async insert(storeId: string, { id, staffUserId, input, now }: SupportRequest) {
    await this.tenant.inTransaction(storeId, (tx) =>
      tx.insert(supportGrants).values({
        id,
        storeId,
        staffUserId,
        scopes: input.scopes,
        reason: input.reason,
        access: input.access,
        durationMinutes: input.durationMinutes,
        requestedAt: now,
      }),
    );
  }

  async insertBreakGlass(storeId: string, effect: BreakGlassEffect, now: Date) {
    await this.tenant.inTransaction(storeId, (tx) =>
      tx.insert(supportGrants).values({
        id: effect.id,
        storeId,
        staffUserId: effect.staffUserId,
        scopes: effect.scopes,
        access: 'read',
        status: 'approved',
        reason: effect.reason,
        isBreakGlass: true,
        durationMinutes: 30,
        requestedAt: now,
        expiresAt: new Date(effect.expiresAt),
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

  async staff(storeId: string, staffUserId: string): Promise<SupportStaff | undefined> {
    return this.tenant.forStore(
      storeId,
      async (tx) =>
        (
          await tx
            .select(staffColumns)
            .from(staffUsers)
            .where(eq(staffUsers.id, staffUserId))
            .for('update')
        )[0],
    );
  }

  async readStaff(storeId: string, staffUserId: string): Promise<SupportStaff | undefined> {
    return this.tenant.forStore(
      storeId,
      async (tx) =>
        (await tx.select(staffColumns).from(staffUsers).where(eq(staffUsers.id, staffUserId)))[0],
    );
  }

  async parent(
    storeId: string,
    staffUserId: string,
    sessionId: string,
  ): Promise<StaffParentSession | undefined> {
    return this.tenant.forStore(
      storeId,
      async (tx) =>
        (
          await tx
            .select(parentColumns)
            .from(staffSessions)
            .where(and(eq(staffSessions.staffUserId, staffUserId), eq(staffSessions.id, sessionId)))
            .for('update')
        )[0],
    );
  }

  async readParent(
    storeId: string,
    staffUserId: string,
    sessionId: string,
  ): Promise<StaffParentSession | undefined> {
    return this.tenant.forStore(
      storeId,
      async (tx) =>
        (
          await tx
            .select(parentColumns)
            .from(staffSessions)
            .where(and(eq(staffSessions.staffUserId, staffUserId), eq(staffSessions.id, sessionId)))
        )[0],
    );
  }

  async touchParent(storeId: string, principal: SupportPrincipal, now: Date) {
    return this.tenant.inTransaction(
      storeId,
      async (tx) =>
        (
          await tx
            .update(staffSessions)
            .set({ lastSeenAt: sql`greatest(${staffSessions.lastSeenAt}, ${now}::timestamptz)` })
            .where(
              and(
                eq(staffSessions.staffUserId, principal.staffUserId),
                eq(staffSessions.id, principal.staffSessionId),
                sql`${staffSessions.revokedAt} is null`,
                sql`${staffSessions.expiresAt} > ${now}`,
                sql`${staffSessions.lastSeenAt} > ${now}::timestamptz - (${STAFF_IDLE_MS} * interval '1 millisecond')`,
              ),
            )
            .returning({ id: staffSessions.id })
        ).length > 0,
    );
  }

  async handoff(storeId: string, principal: SupportPrincipal, hash: Buffer, expiresAt: Date) {
    await this.tenant.inTransaction(storeId, (tx) =>
      tx
        .insert(supportSessions)
        .values({ ...principal, handoffHash: hash, handoffExpiresAt: expiresAt }),
    );
  }

  async locateSession(hash: Buffer) {
    return (
      await this.database.execute<{ store_id: string | null }>(
        sql`select support_session_store(${hash},false) as store_id`,
      )
    ).rows[0]?.store_id;
  }

  async locateHandoff(hash: Buffer) {
    return (
      await this.database.execute<{ store_id: string | null }>(
        sql`select support_session_store(${hash},true) as store_id`,
      )
    ).rows[0]?.store_id;
  }

  async session(storeId: string, hash: Buffer) {
    return this.tenant.forStore(
      storeId,
      async (tx) =>
        (
          await tx
            .select(sessionColumns)
            .from(supportSessions)
            .where(and(eq(supportSessions.storeId, storeId), eq(supportSessions.tokenHash, hash)))
            .for('update')
        )[0],
    );
  }

  async handoffSession(storeId: string, hash: Buffer) {
    return this.tenant.forStore(
      storeId,
      async (tx) =>
        (
          await tx
            .select(sessionColumns)
            .from(supportSessions)
            .where(and(eq(supportSessions.storeId, storeId), eq(supportSessions.handoffHash, hash)))
            .for('update')
        )[0],
    );
  }

  async readSession(storeId: string, hash: Buffer) {
    return this.tenant.forStore(
      storeId,
      async (tx) =>
        (
          await tx
            .select(sessionColumns)
            .from(supportSessions)
            .where(and(eq(supportSessions.storeId, storeId), eq(supportSessions.tokenHash, hash)))
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
