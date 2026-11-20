import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { TenantDatabase } from '../platform/database/tenant-database';

export type MessageTotalsRow = {
  channel: string;
  sent: number;
  delivered: number;
  read: number;
  costPoisha: string;
};

@Injectable()
export class CampaignMessageTotalsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  // One row per channel for messages handed to the provider in the shop-local day range.
  async messageTotals(
    storeId: string,
    { from, through, timeZone }: { from: string; through: string; timeZone: string },
  ) {
    const { rows } = await this.database.forStore(storeId, (tx) =>
      tx.execute<MessageTotalsRow>(sql`
        select c.channel, count(*)::int as sent,
          (count(*) filter (where coalesce(r.delivered_at, r.read_at) is not null))::int as delivered,
          (count(*) filter (where r.read_at is not null))::int as read,
          coalesce(sum(r.cost_poisha), 0)::text as "costPoisha"
        from campaign_recipients r
        join campaigns c on c.store_id = r.store_id and c.id = r.campaign_id
        where r.store_id = ${storeId} and r.sent_at is not null
          and r.sent_at >= (${from}::date)::timestamp at time zone ${timeZone}
          and r.sent_at < (${through}::date + 1)::timestamp at time zone ${timeZone}
        group by c.channel`),
    );
    return rows;
  }
}
