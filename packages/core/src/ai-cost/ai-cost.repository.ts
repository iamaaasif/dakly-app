import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import type { Database } from '@dakly/db/client';
import { aiCostAlerts } from '@dakly/db/schema/admin';

import { DATABASE } from '../platform/database/database.tokens';

export type StoreAiCost = {
  storeId: string;
  name: string;
  runs: number;
  failedRuns: number;
  costMicroUsd: number;
};

type CostRow = {
  store_id: string;
  name: string;
  runs: number;
  failed_runs: number;
  cost_micro_usd: string;
};

@Injectable()
export class AiCostRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  // Reads through a staff report function: ai_runs is under row security and spans every shop.
  async costByStore(
    range: { from: Date; to: Date },
    minimumCostMicroUsd: number,
    limit: number,
  ): Promise<StoreAiCost[]> {
    const result = await this.database.execute<CostRow>(
      sql`select * from admin_ai_cost_by_store(${range.from.toISOString()}::timestamptz, ${range.to.toISOString()}::timestamptz, ${minimumCostMicroUsd}::bigint, ${limit}::integer)`,
    );
    return result.rows.map((row) => ({
      storeId: row.store_id,
      name: row.name,
      runs: row.runs,
      failedRuns: row.failed_runs,
      costMicroUsd: Number(row.cost_micro_usd),
    }));
  }

  async hasAlerted(storeId: string, day: string): Promise<boolean> {
    const result = await this.database.execute(
      sql`select 1 from ${aiCostAlerts} where store_id = ${storeId} and day = ${day}::date`,
    );
    return result.rows.length > 0;
  }

  async recordAlert(storeId: string, day: string, costMicroUsd: number): Promise<void> {
    await this.database
      .insert(aiCostAlerts)
      .values({ storeId, day, costMicroUsd })
      .onConflictDoNothing();
  }
}
