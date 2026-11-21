import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { TenantDatabase } from '../platform/database/tenant-database';

// Every column that points at files.id for a store's files. A test reads the foreign keys from the
// catalogue and fails when a table is missing here. Settlement reports belong to no store, so the
// per-store pass never sees them.
export const FILE_REFERENCES = [
  { table: 'imports', columns: ['file_id', 'report_file_id'] },
  { table: 'knowledge_items', columns: ['file_id'] },
  { table: 'sms_sender_ids', columns: ['trade_licence_file_id', 'nid_file_id'] },
  { table: 'data_requests', columns: ['file_id'] },
  { table: 'khata_pages', columns: ['file_id'] },
];

const unreferenced = sql.join(
  FILE_REFERENCES.map(({ table, columns }) => {
    const alias = sql.identifier(table);
    const matches = sql.join(
      columns.map((column) => sql`${alias}.${sql.identifier(column)} = f.id`),
      sql` or `,
    );
    return sql`not exists (select 1 from ${alias} where ${matches})`;
  }),
  sql` and `,
);

@Injectable()
export class FilePurgeRepository {
  constructor(@Inject(TenantDatabase) private readonly tenant: TenantDatabase) {}

  // Returns the object keys of the rows it deleted. Files that something still points at stay:
  // their owner clears the reference first. Leaving them out also keeps one such file from filling
  // every batch.
  deleteExpiredBatch(storeId: string, limit: number): Promise<string[]> {
    return this.tenant.forStore(storeId, async (tx) => {
      const { rows } = await tx.execute<{ objectKey: string }>(sql`
        delete from files where id in (
          select f.id from files f
          where f.store_id = ${storeId} and f.expires_at < now() and ${unreferenced}
          order by f.expires_at, f.id
          limit ${limit}
          for update skip locked)
        returning object_key as "objectKey"`);
      return rows.map(({ objectKey }) => objectKey);
    });
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
