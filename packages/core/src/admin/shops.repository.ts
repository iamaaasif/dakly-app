import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import type {
  AdminShopDetail,
  AdminShopListQuery,
  AdminShopRow,
} from '@dakly/contracts/admin-shops';
import type { Database } from '@dakly/db/client';
import { staffAuditLog } from '@dakly/db/schema/admin';

import { DATABASE } from '../platform/database/database.tokens';
import { StaffDatabase } from '../platform/database/staff-database';

// Reads go through report functions (ADR 0005); nothing here touches shop tables directly.
@Injectable()
export class ShopsRepository {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(StaffDatabase) private readonly scope: StaffDatabase,
  ) {}

  async list(query: AdminShopListQuery, limit: number): Promise<AdminShopRow[]> {
    const [createdAt, id] = query.cursor?.split('|') ?? [null, null];
    const result = await this.database.execute<AdminShopRow>(sql`
      select
        store_id as "storeId",
        name,
        slug,
        owner_name as "ownerName",
        owner_phone_masked as "ownerPhoneMasked",
        plan_code as "planCode",
        plan_name as "planName",
        status,
        mrr_poisha::integer as "mrrPoisha",
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "createdAt",
        to_char(last_active_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "lastActiveAt"
      from admin_shop_list(
        ${query.search ?? null}, ${query.status ?? null}, ${query.plan ?? null},
        ${createdAt}::timestamptz, ${id}::uuid, ${limit})`);
    return result.rows;
  }

  async detail(storeId: string): Promise<AdminShopDetail | null> {
    const result = await this.database.execute<{ detail: AdminShopDetail | null }>(
      sql`select admin_shop_detail(${storeId}::uuid) as detail`,
    );
    return result.rows[0]?.detail ?? null;
  }

  async recordView(staffUserId: string, storeId: string, ip: string): Promise<void> {
    await this.scope.inTransaction(staffUserId, (tx) =>
      tx.insert(staffAuditLog).values({
        staffUserId,
        storeId,
        action: 'shop.viewed',
        targetType: 'store',
        targetId: storeId,
        reason: 'Opened shop detail',
        ip,
      }),
    );
  }
}
