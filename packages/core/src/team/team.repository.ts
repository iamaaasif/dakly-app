import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '@dakly/db/client';
import { memberships, roles } from '@dakly/db/schema/team';
import type { UserStore } from '@dakly/contracts/sessions';
import { TenantDatabase } from '../platform/database/tenant-database';
import { DATABASE } from '../platform/database/database.tokens';

@Injectable()
export class TeamRepository {
  constructor(
    @Inject(TenantDatabase) private readonly tenant: TenantDatabase,
    @Inject(DATABASE) private readonly database: Database,
  ) {}

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

  async storesFor(userId: string): Promise<UserStore[]> {
    const result = await this.database.execute<{ storeId: string; name: string }>(
      sql`select store_id as "storeId", store_name as name from stores_for_user(${userId}::uuid)`,
    );
    return result.rows;
  }
}
