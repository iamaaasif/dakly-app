import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { TenantDatabase } from '../platform/database/tenant-database';

export type ExpiredFile = { id: string; objectKey: string };

@Injectable()
export class FilePurgeRepository {
  constructor(@Inject(TenantDatabase) private readonly tenant: TenantDatabase) {}

  // Files an import, knowledge item, sender request or data request still points at stay: their
  // owner clears the reference first, and deleting the row now would break the foreign key. Leaving
  // them out also keeps one such file from filling every batch.
  expiredUnreferenced(storeId: string, limit: number): Promise<ExpiredFile[]> {
    return this.tenant.forStore(storeId, async (tx) => {
      const { rows } = await tx.execute<ExpiredFile>(sql`
        select f.id, f.object_key as "objectKey" from files f
        where f.store_id = ${storeId} and f.expires_at < now()
          and not exists (select 1 from imports i where i.file_id = f.id or i.report_file_id = f.id)
          and not exists (select 1 from knowledge_items k where k.file_id = f.id)
          and not exists (select 1 from sms_sender_ids s
            where s.trade_licence_file_id = f.id or s.nid_file_id = f.id)
          and not exists (select 1 from data_requests d where d.file_id = f.id)
        order by f.expires_at, f.id
        limit ${limit}`);
      return rows;
    });
  }

  async deleteRows(storeId: string, ids: string[]) {
    await this.tenant.forStore(storeId, (tx) =>
      tx.execute(
        sql`delete from files where store_id = ${storeId} and id = any(${sql.param(ids)}::uuid[])`,
      ),
    );
  }

  async knownKeys(storeId: string, keys: string[]): Promise<Set<string>> {
    const rows = await this.tenant.forStore(storeId, async (tx) => {
      const { rows } = await tx.execute<{ objectKey: string }>(sql`
        select object_key as "objectKey" from files
        where store_id = ${storeId} and object_key = any(${sql.param(keys)}::text[])`);
      return rows;
    });
    return new Set(rows.map(({ objectKey }) => objectKey));
  }
}
