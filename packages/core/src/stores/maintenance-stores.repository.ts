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
}
