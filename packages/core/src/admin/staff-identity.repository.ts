import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '@dakly/db/client';
import { staffUserLinks } from '@dakly/db/schema/admin';
import { DATABASE } from '../platform/database/database.tokens';
import { AccountDatabase } from '../platform/database/account-database';
import { TenantDatabase } from '../platform/database/tenant-database';
@Injectable()
export class StaffIdentityRepository {
  constructor(
    @Inject(AccountDatabase) private readonly account: AccountDatabase,
    @Inject(TenantDatabase) private readonly tenant: TenantDatabase,
    @Inject(DATABASE) private readonly database: Database,
  ) {}
  async recoveryConflict(
    userId: string,
    staffUserId: string,
    storeIds: string[],
    contacts: { phone?: string | null; email?: string | null }[],
  ) {
    return this.account.forUser(userId, async (tx) => {
      const keys = [
        ...new Set(
          contacts.flatMap((contact) => [
            ...(contact.phone ? [`phone:${contact.phone}`] : []),
            ...(contact.email ? [`email:${contact.email.toLowerCase()}`] : []),
          ]),
        ),
      ];
      await tx.execute(
        sql`
          select pg_advisory_xact_lock(hashtextextended('staff-identity:' || value, 0))
          from unnest(${sql.param(keys)}::text[]) value
          order by split_part(value, ':', 1), substr(value, strpos(value, ':')+1)`,
      );
      return (
        await tx.execute<{ conflicts: boolean }>(sql`
          select
            exists(select 1 from staff_user_links where user_id=${userId}::uuid)
            or exists(
              select 1
              from unnest(${sql.param(keys)}::text[]) identity_key
              join staff_identity_contacts c
                on c.kind=split_part(identity_key, ':', 1)
                and c.value=substr(identity_key, strpos(identity_key, ':')+1)
            )
            or exists(
              select 1
              from unnest(${sql.param(storeIds)}::uuid[]) target
              where staff_conflicts_with_store(${staffUserId}::uuid, target)
            ) as conflicts`)
      ).rows[0]!.conflicts;
    });
  }
  async conflicts(storeId: string, staffUserId: string) {
    return this.tenant.forStore(
      storeId,
      async (tx) =>
        (
          await tx.execute<{ conflicts: boolean }>(
            sql`select staff_conflicts_with_store(${staffUserId}::uuid, ${storeId}::uuid) as conflicts`,
          )
        ).rows[0]!.conflicts,
    );
  }
  async linked(staffUserId: string, userId: string) {
    return (
      (
        await this.database
          .select({ id: staffUserLinks.id })
          .from(staffUserLinks)
          .where(
            and(eq(staffUserLinks.staffUserId, staffUserId), eq(staffUserLinks.userId, userId)),
          )
          .limit(1)
      ).length > 0
    );
  }
}
