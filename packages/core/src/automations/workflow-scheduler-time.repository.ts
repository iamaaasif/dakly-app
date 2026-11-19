import { sql } from 'drizzle-orm';

import type { Transaction } from '../platform/database/scoped-transactions';

// Workflow leases, wake times and balance transitions share the sweep's Postgres clock.
export async function workflowSchedulerTime(tx: Transaction): Promise<Date> {
  const { rows } = await tx.execute<{ milliseconds: string }>(
    sql`select floor(extract(epoch from clock_timestamp()) * 1000)::bigint as milliseconds`,
  );
  const [time] = rows;
  if (!time) throw new Error('Postgres did not return the workflow scheduler time');
  return new Date(Number(time.milliseconds));
}
