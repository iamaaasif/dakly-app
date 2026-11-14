import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '@dakly/db/client';
import { staffUserLinks } from '@dakly/db/schema/admin';
import { DATABASE } from '../platform/database/database.tokens';
import { TenantDatabase } from '../platform/database/tenant-database';
@Injectable()
export class StaffIdentityRepository {
  constructor(
    @Inject(TenantDatabase) private readonly tenant: TenantDatabase,
    @Inject(DATABASE) private readonly database: Database,
  ) {}
  async conflicts(storeId: string, staffUserId: string) {
    return this.tenant.forStore(
      storeId,
      async (tx) =>
        (
          await tx.execute<{ conflicts: boolean }>(
            sql`select staff_conflicts_with_store(${staffUserId}::uuid,${storeId}::uuid) as conflicts`,
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
