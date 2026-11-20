import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import type { Database } from '@dakly/db/client';

import { DATABASE } from '../platform/database/database.tokens';

@Injectable()
export class SocialPublishRecoveryRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async dueStoreIds(before: Date, after: string | null, limit: number) {
    const { rows } = await this.database.execute<{ store_id: string }>(
      sql`select store_id from post_publish_due_stores(${before.toISOString()}, ${after}, ${limit}) order by store_id`,
    );
    return rows.map(({ store_id }) => store_id);
  }

  async dueMetricsTargets(limit: number) {
    const { rows } = await this.database.execute<{ store_id: string; post_target_id: string }>(
      sql`select store_id, post_target_id from due_post_metrics(${limit})`,
    );
    return rows.map((row) => ({ storeId: row.store_id, postTargetId: row.post_target_id }));
  }
}
