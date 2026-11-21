import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { TenantDatabase } from '../platform/database/tenant-database';

export type AiChatReportRange = { from: string; through: string; timeZone: string };

export type AiChatReportRows = {
  aiChats: number;
  inProgress: number;
  answeredByPerson: number;
  resolved: number;
  handedOver: { reason: string; chats: number }[];
};

// Written once here so the glossary definition and the numbers cannot drift apart: one row per chat
// the AI replied in during the period, put in the first bucket that fits (handed over, answered by
// a person, still inside 24 hours, resolved).
@Injectable()
export class AiChatReportRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async read(storeId: string, { from, through, timeZone }: AiChatReportRange, now: Date) {
    const { rows } = await this.database.forStore(storeId, (tx) =>
      tx.execute<{ bucket: string; reason: string | null; chats: number }>(sql`
        with bounds as (
          select (${from}::date)::timestamp at time zone ${timeZone} as starts,
            (${through}::date + 1)::timestamp at time zone ${timeZone} as ends
        ),
        ai_chats as (
          select m.conversation_id, max(m.created_at) as last_ai_at
          from messages m, bounds b
          where m.store_id = ${storeId} and m.author_type = 'ai' and m.kind <> 'note'
            and m.created_at >= b.starts and m.created_at < b.ends
          group by m.conversation_id
        )
        select bucket, reason, count(*)::int as chats
        from (
          select
            case
              when c.handed_over_at >= b.starts and c.handed_over_at < b.ends then 'handed_over'
              when exists (
                select 1 from messages p
                where p.store_id = ${storeId} and p.conversation_id = a.conversation_id
                  and p.author_type = 'user' and p.kind <> 'note'
                  and p.created_at >= b.starts and p.created_at < b.ends
              ) then 'answered_by_person'
              when a.last_ai_at > ${now.toISOString()}::timestamptz - interval '24 hours'
                then 'in_progress'
              else 'resolved'
            end as bucket,
            case when c.handed_over_at >= b.starts and c.handed_over_at < b.ends
              then coalesce(c.handover_reason, 'other') end as reason
          from ai_chats a
          join conversations c on c.store_id = ${storeId} and c.id = a.conversation_id
          cross join bounds b
        ) classified
        group by bucket, reason`),
    );
    const count = (bucket: string) =>
      rows.filter((row) => row.bucket === bucket).reduce((total, row) => total + row.chats, 0);
    const handedOver = rows
      .filter((row) => row.bucket === 'handed_over')
      .map((row) => ({ reason: row.reason ?? 'other', chats: row.chats }));
    const result: AiChatReportRows = {
      aiChats: rows.reduce((total, row) => total + row.chats, 0),
      inProgress: count('in_progress'),
      answeredByPerson: count('answered_by_person'),
      resolved: count('resolved'),
      handedOver,
    };
    return result;
  }
}
