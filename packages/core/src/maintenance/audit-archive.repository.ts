import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { OwnerDatabase } from '../platform/database/owner-database';

export type AuditMonth = { partition: string; month: string };

// Partition names come from the catalogue and match this pattern, so they are safe to use as
// identifiers; the check is here so a future caller cannot pass anything else.
const PARTITION_NAME = /^audit_log_y\d{4}m\d{2}$/;
const table = (partition: string) => {
  if (!PARTITION_NAME.test(partition)) throw new Error('Not an audit_log partition');
  return sql.identifier(partition);
};

@Injectable()
export class AuditArchiveRepository {
  constructor(@Inject(OwnerDatabase) private readonly owner: OwnerDatabase) {}

  // Months that ended at least 24 months ago.
  async expiredMonths(): Promise<AuditMonth[]> {
    const { rows } = await this.owner.db.execute<AuditMonth>(sql`
      select child.relname as partition,
        to_char(to_date(right(child.relname, 7), 'YYYY"m"MM'), 'YYYY-MM') as month
      from pg_catalog.pg_inherits h
      join pg_catalog.pg_class parent on parent.oid = h.inhparent
      join pg_catalog.pg_namespace n on n.oid = parent.relnamespace and n.nspname = 'public'
      join pg_catalog.pg_class child on child.oid = h.inhrelid
      where parent.relname = 'audit_log' and child.relname ~ '_y[0-9]{4}m[0-9]{2}$'
        and to_date(right(child.relname, 7), 'YYYY"m"MM') + interval '1 month'
          <= now() at time zone 'UTC' - interval '24 months'
      order by child.relname`);
    return rows;
  }

  async storeIds(partition: string, after: string | null, limit: number): Promise<string[]> {
    const { rows } = await this.owner.db.execute<{ store_id: string }>(sql`
      select distinct store_id from public.${table(partition)}
      where ${after}::uuid is null or store_id > ${after}::uuid
      order by store_id limit ${limit}`);
    return rows.map(({ store_id }) => store_id);
  }

  async storeRows(partition: string, storeId: string): Promise<string[]> {
    const { rows } = await this.owner.db.execute<{ line: string }>(sql`
      select row_to_json(t)::text as line from public.${table(partition)} t
      where store_id = ${storeId} order by created_at, id`);
    return rows.map(({ line }) => line);
  }

  async rowCount(partition: string): Promise<number> {
    const { rows } = await this.owner.db.execute<{ total: number }>(
      sql`select count(*)::int as total from public.${table(partition)}`,
    );
    return rows[0]?.total ?? 0;
  }

  async dropPartition(partition: string) {
    await this.owner.db.execute(sql`drop table public.${table(partition)}`);
  }
}
