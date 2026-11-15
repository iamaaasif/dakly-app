import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '@dakly/db/client';
import { memberships, roles } from '@dakly/db/schema/team';
import type { UserStore, UserStorePageQuery } from '@dakly/contracts/sessions';
import { AccountDatabase } from '../platform/database/account-database';
import { TenantDatabase } from '../platform/database/tenant-database';
import { DATABASE } from '../platform/database/database.tokens';

@Injectable()
export class TeamRepository {
  constructor(
    @Inject(TenantDatabase) private readonly tenant: TenantDatabase,
    @Inject(DATABASE) private readonly database: Database,
    @Inject(AccountDatabase) private readonly account: AccountDatabase,
  ) {}

  async lockAndFindOwnedStore(storeId: string, userId: string): Promise<string | undefined> {
    return this.tenant.forStore(storeId, async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);
      const result = await tx.execute<{ storeId: string }>(
        sql`select store_id as "storeId" from stores_for_user(${userId}::uuid) where built_in_role = 'owner' limit 1`,
      );
      return result.rows[0]?.storeId;
    });
  }

  async addOwner(storeId: string, userId: string): Promise<void> {
    await this.tenant.forStore(storeId, (tx) =>
      tx
        .insert(memberships)
        .values({ storeId, userId, builtInRole: 'owner', status: 'active', joinedAt: sql`now()` }),
    );
  }

  async findAccess(storeId: string, userId: string) {
    const rows = await this.tenant.forStore(storeId, (tx) =>
      tx
        .select({
          builtInRole: memberships.builtInRole,
          roleId: roles.id,
          areas: roles.permissions,
          seeFullPhone: roles.canSeeFullPhone,
          exportLists: roles.canExportLists,
          refund: roles.canRefund,
        })
        .from(memberships)
        .leftJoin(
          roles,
          and(eq(roles.storeId, memberships.storeId), eq(roles.id, memberships.roleId)),
        )
        .where(
          and(
            eq(memberships.storeId, storeId),
            eq(memberships.userId, userId),
            eq(memberships.status, 'active'),
          ),
        )
        .limit(1),
    );
    return rows[0];
  }

  async accountOwnerContacts(userId: string) {
    const result = await this.account.inTransaction(userId, (tx) =>
      tx.execute<{
        userId: string;
        phone: string | null;
        email: string | null;
      }>(
        sql`select user_id as "userId",phone,email from locked_account_store_owner_contacts(${userId}::uuid)`,
      ),
    );
    return result.rows;
  }
  async storeContext(userId: string, storeId?: string) {
    const result = await this.database.execute<{
      hasMemberships: boolean;
      storeId: string | null;
      name: string | null;
    }>(
      sql`select has_memberships as "hasMemberships",store_id as "storeId",store_name as name from user_store_context(${userId}::uuid,${storeId ?? null}::uuid)`,
    );
    return result.rows[0]!;
  }
  async storesFor(userId: string, query: UserStorePageQuery): Promise<UserStore[]> {
    const result = await this.database.execute<UserStore>(
      sql`select store_id as "storeId", store_name as name from user_store_page(${userId}::uuid,${query.after ?? null}::uuid,${query.limit + 1})`,
    );
    return result.rows;
  }
}
