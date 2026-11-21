import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import type { Database } from '@dakly/db/client';

import { DATABASE } from '../platform/database/database.tokens';

@Injectable()
export class MaintenanceStoresRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async maintenanceStoreIds(after: string | null, limit: number) {
    const { rows } = await this.database.execute<{ store_id: string }>(
      sql`select store_id from maintenance_store_ids(${after}, ${limit}) order by store_id`,
    );
    return rows.map(({ store_id }) => store_id);
  }

  async maintenanceStores(after: string | null, limit: number) {
    const { rows } = await this.database.execute<{ storeId: string; timeZone: string }>(
      sql`select store_id as "storeId", time_zone as "timeZone"
          from maintenance_stores(${after}, ${limit}) order by store_id`,
    );
    return rows;
  }

  // A public link names no store, so a SECURITY DEFINER function finds an active shop by slug.
  async findPublicBySlug(slug: string) {
    const { rows } = await this.database.execute<{ id: string; name: string }>(
      sql`select store_id as id, store_name as name from public_store_for_slug(${slug})`,
    );
    return rows[0];
  }
}
