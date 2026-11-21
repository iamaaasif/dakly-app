import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import type { Database } from '@dakly/db/client';

import { DATABASE } from '../platform/database/database.tokens';

export type ProviderSpanRow = {
  provider: string;
  span: 'hour' | 'day';
  attempts: number;
  failures: number;
  averageLatencyMs: number | null;
};

type HealthRow = {
  provider: string;
  span: 'hour' | 'day';
  attempts: number;
  failures: number;
  average_latency_ms: number | null;
};

@Injectable()
export class ProviderHealthRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  // A staff report function counts outcomes across shops without exposing any shop's rows.
  async spans(now: Date): Promise<ProviderSpanRow[]> {
    const result = await this.database.execute<HealthRow>(
      sql`select * from admin_provider_health(${now.toISOString()}::timestamptz)`,
    );
    return result.rows.map((row) => ({
      provider: row.provider,
      span: row.span,
      attempts: row.attempts,
      failures: row.failures,
      averageLatencyMs: row.average_latency_ms,
    }));
  }
}
