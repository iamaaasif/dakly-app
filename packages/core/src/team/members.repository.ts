import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, gt, inArray, or, sql } from 'drizzle-orm';

import type { InviteMemberInput, MemberListQuery, MemberRoleInput } from '@dakly/contracts/team';
import type { Database } from '@dakly/db/client';
import { memberships, roles } from '@dakly/db/schema/team';

import { DATABASE } from '../platform/database/database.tokens';
import { TenantDatabase } from '../platform/database/tenant-database';

const memberColumns = {
  id: memberships.id,
  userId: memberships.userId,
  builtInRole: memberships.builtInRole,
  roleId: memberships.roleId,
  status: memberships.status,
  invitePhone: memberships.invitePhone,
  inviteEmail: memberships.inviteEmail,
  inviteExpiresAt: memberships.inviteExpiresAt,
  lastActiveAt: memberships.lastActiveAt,
  createdAt: memberships.createdAt,
};
export type Member = Pick<typeof memberships.$inferSelect, keyof typeof memberColumns>;
type MemberChange = Partial<
  Pick<
    typeof memberships.$inferInsert,
    | 'userId'
    | 'builtInRole'
    | 'roleId'
    | 'status'
    | 'inviteTokenHash'
    | 'inviteExpiresAt'
    | 'joinedAt'
    | 'removedAt'
  >
>;
type NewInvite = { input: InviteMemberInput; userId: string; hash: Buffer; expiresAt: Date };

@Injectable()
export class MembersRepository {
  constructor(
    @Inject(TenantDatabase) private readonly tenant: TenantDatabase,
    @Inject(DATABASE) private readonly database: Database,
  ) {}

  async find(storeId: string, membershipId: string): Promise<Member | undefined> {
    const [row] = await this.tenant.forStore(storeId, (tx) =>
      tx
        .select(memberColumns)
        .from(memberships)
        .where(and(eq(memberships.storeId, storeId), eq(memberships.id, membershipId)))
        .limit(1),
    );
    return row;
  }

  async findRecipient(
    storeId: string,
    input: Pick<InviteMemberInput, 'phone' | 'email'>,
  ): Promise<Member | undefined> {
    const [row] = await this.tenant.forStore(storeId, (tx) =>
      tx
        .select(memberColumns)
        .from(memberships)
        .where(
          and(
            eq(memberships.storeId, storeId),
            eq(memberships.status, 'invited'),
            input.phone
              ? eq(memberships.invitePhone, input.phone)
              : eq(memberships.inviteEmail, input.email!),
          ),
        )
        .limit(1),
    );
    return row;
  }

  async forUser(storeId: string, userId: string): Promise<Member | undefined> {
    const [row] = await this.tenant.forStore(storeId, (tx) =>
      tx
        .select(memberColumns)
        .from(memberships)
        .where(and(eq(memberships.storeId, storeId), eq(memberships.userId, userId)))
        .limit(1),
    );
    return row;
  }

  async list(storeId: string, query: MemberListQuery): Promise<Member[]> {
    return this.tenant.forStore(storeId, (tx) =>
      tx
        .select(memberColumns)
        .from(memberships)
        .where(
          and(
            eq(memberships.storeId, storeId),
            inArray(memberships.status, ['active', 'invited']),
            query.cursor
              ? sql`(${memberships.createdAt}, ${memberships.id}) >
              (select created_at, id from memberships where store_id = ${storeId} and id = ${query.cursor})`
              : undefined,
          ),
        )
        .orderBy(asc(memberships.createdAt), asc(memberships.id))
        .limit(query.limit + 1),
    );
  }

  async countSeats(storeId: string, now: Date): Promise<number> {
    const [row] = await this.tenant.forStore(storeId, (tx) =>
      tx
        .select({ total: count() })
        .from(memberships)
        .where(
          and(
            eq(memberships.storeId, storeId),
            or(
              eq(memberships.status, 'active'),
              and(eq(memberships.status, 'invited'), gt(memberships.inviteExpiresAt, now)),
            ),
          ),
        ),
    );
    return row!.total;
  }

  async findRole(storeId: string, roleId: string) {
    const [row] = await this.tenant.forStore(storeId, (tx) =>
      tx
        .select({
          areas: roles.permissions,
          seeFullPhone: roles.canSeeFullPhone,
          exportLists: roles.canExportLists,
          refund: roles.canRefund,
        })
        .from(roles)
        .where(and(eq(roles.storeId, storeId), eq(roles.id, roleId)))
        .limit(1),
    );
    return row;
  }

  async insertInvite(
    storeId: string,
    { input, userId, hash, expiresAt }: NewInvite,
  ): Promise<Member> {
    const [row] = await this.tenant.forStore(storeId, (tx) =>
      tx
        .insert(memberships)
        .values({
          storeId,
          ...roleValues(input),
          status: 'invited',
          invitePhone: input.phone,
          inviteEmail: input.email,
          invitedByUserId: userId,
          inviteTokenHash: hash,
          inviteExpiresAt: expiresAt,
        })
        .returning(memberColumns),
    );
    return row!;
  }

  async change(
    storeId: string,
    membershipId: string,
    values: MemberChange,
    now: Date,
  ): Promise<Member> {
    const [row] = await this.tenant.forStore(storeId, (tx) =>
      tx
        .update(memberships)
        .set({ ...values, updatedAt: now })
        .where(and(eq(memberships.storeId, storeId), eq(memberships.id, membershipId)))
        .returning(memberColumns),
    );
    return row!;
  }

  async locateInvite(hash: Buffer): Promise<{ storeId: string; membershipId: string } | undefined> {
    const result = await this.database.execute<{ storeId: string; membershipId: string }>(
      sql`select store_id as "storeId", membership_id as "membershipId" from membership_for_invite(${hash})`,
    );
    return result.rows[0];
  }

  async matchesToken(storeId: string, membershipId: string, hash: Buffer): Promise<boolean> {
    const [row] = await this.tenant.forStore(storeId, (tx) =>
      tx
        .select({ id: memberships.id })
        .from(memberships)
        .where(
          and(
            eq(memberships.storeId, storeId),
            eq(memberships.id, membershipId),
            eq(memberships.inviteTokenHash, hash),
          ),
        )
        .limit(1),
    );
    return Boolean(row);
  }
}
export function roleValues(input: MemberRoleInput) {
  return { builtInRole: input.builtInRole ?? null, roleId: input.roleId ?? null };
}
