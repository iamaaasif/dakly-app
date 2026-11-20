import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import type { Database } from '@dakly/db/client';

import { DATABASE } from '../platform/database/database.tokens';
import { databaseErrorCode } from '../platform/database/error-code';
import { TenantDatabase } from '../platform/database/tenant-database';
import { maintenanceError } from './maintenance.errors';

export type AuditPageCursor = { createdAt: string; id: string };
type AuditPage = { lines: string[]; next: AuditPageCursor | null };

const CHECK_VIOLATION = '23514';

@Injectable()
export class AuditArchiveRepository {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(TenantDatabase) private readonly tenant: TenantDatabase,
  ) {}

  // First day of each audit month that ended at least 24 months ago.
  async expiredMonths(): Promise<string[]> {
    const { rows } = await this.database.execute<{ month: string }>(sql`
      select to_date(right(child.relname, 7), 'YYYY"m"MM')::text as month
      from pg_catalog.pg_inherits h
      join pg_catalog.pg_class parent on parent.oid = h.inhparent
      join pg_catalog.pg_namespace n on n.oid = parent.relnamespace and n.nspname = 'public'
      join pg_catalog.pg_class child on child.oid = h.inhrelid
      where parent.relname = 'audit_log' and child.relname ~ '_y[0-9]{4}m[0-9]{2}$'
        and to_date(right(child.relname, 7), 'YYYY"m"MM') + interval '1 month'
          <= now() at time zone 'UTC' - interval '24 months'
      order by 1`);
    return rows.map(({ month }) => month);
  }

  // One page of a store's rows for the month, oldest first. The month bounds let Postgres read
  // only that partition.
  storeRowsPage(
    storeId: string,
    month: string,
    after: AuditPageCursor | null,
    limit: number,
  ): Promise<AuditPage> {
    return this.tenant.forStore(storeId, async (tx) => {
      const { rows } = await tx.execute<{ line: string; createdAt: string; id: string }>(sql`
        select row_to_json(t)::text as line, t.created_at::text as "createdAt", t.id::text as id
        from audit_log t
        where t.store_id = ${storeId}
          and t.created_at >= (${month}::date::timestamp at time zone 'UTC')
          and t.created_at < ((${month}::date + interval '1 month')::timestamp at time zone 'UTC')
          and (${after === null}::boolean or (t.created_at, t.id) > (${after?.createdAt ?? null}::timestamptz, ${after?.id ?? null}::uuid))
        order by t.created_at, t.id
        limit ${limit}`);
      const last = rows.at(-1);
      return {
        lines: rows.map(({ line }) => line),
        next: rows.length === limit && last ? { createdAt: last.createdAt, id: last.id } : null,
      };
    });
  }

  // The function checks the age and the row count itself and drops nothing on a mismatch.
  async dropMonth(month: string, exportedRows: number) {
    try {
      await this.database.execute(sql`select drop_audit_month(${month}::date, ${exportedRows})`);
    } catch (error) {
      if (databaseErrorCode(error) === CHECK_VIOLATION)
        throw maintenanceError('MAINTENANCE_ARCHIVE_COUNT_CHANGED');
      throw error;
    }
  }
}
