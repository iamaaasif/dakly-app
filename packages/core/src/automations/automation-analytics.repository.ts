import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { TenantDatabase } from '../platform/database/tenant-database';

export type AutomationAnalyticsRow = {
  id: string;
  name: string;
  status: string;
  // Comma separated: the driver hands arrays back unparsed.
  channels: string;
  entered: number;
  sent: number;
  costPoisha: string;
};

@Injectable()
export class AutomationAnalyticsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  // Every automation that was live or sent in the range, with its entries and marketing sends.
  async inRange(
    storeId: string,
    { from, through, timeZone }: { from: string; through: string; timeZone: string },
  ) {
    const { rows } = await this.database.forStore(storeId, (tx) =>
      tx.execute<AutomationAnalyticsRow>(sql`
        with bounds as (
          select (${from}::date)::timestamp at time zone ${timeZone} as starts,
                 (${through}::date + 1)::timestamp at time zone ${timeZone} as ends
        ),
        entries as (
          select r.automation_id, count(*)::int as entered
          from automation_runs r, bounds b
          where r.store_id = ${storeId} and r.entered_at >= b.starts and r.entered_at < b.ends
          group by r.automation_id
        ),
        sends as (
          select r.automation_id, count(*)::int as sent,
            coalesce(sum(s.cost_poisha), 0)::text as cost,
            string_agg(distinct s.channel, ',') as channels
          from automation_run_steps s
          join automation_runs r on r.store_id = s.store_id and r.id = s.run_id, bounds b
          where s.store_id = ${storeId} and s.kind = 'send' and s.category = 'marketing'
            and s.channel is not null and s.sent_at >= b.starts and s.sent_at < b.ends
          group by r.automation_id
        )
        select a.id, a.name, a.status, coalesce(sends.channels, '') as channels,
          coalesce(entries.entered, 0) as entered, coalesce(sends.sent, 0) as sent,
          coalesce(sends.cost, '0') as "costPoisha"
        from automations a
        left join entries on entries.automation_id = a.id
        left join sends on sends.automation_id = a.id
        where a.store_id = ${storeId} and a.status in ('active', 'paused')
          and (a.status = 'active' or entries.entered > 0 or sends.sent > 0)
        order by a.name`),
    );
    return rows;
  }
}
