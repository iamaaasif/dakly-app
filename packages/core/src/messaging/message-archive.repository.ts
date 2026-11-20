import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { TenantDatabase } from '../platform/database/tenant-database';
import { messagingError } from './messaging.errors';

export type ArchiveGroup = { conversationId: string; month: string };
export type MessagePageCursor = { createdAt: string; id: string };
type MessagePage = { lines: string[]; next: MessagePageCursor | null };

const monthStart = (month: string) => sql`(${`${month}-01`}::date::timestamp at time zone 'UTC')`;
const monthEnd = (month: string) =>
  sql`((${`${month}-01`}::date + interval '1 month')::timestamp at time zone 'UTC')`;

@Injectable()
export class MessageArchiveRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  // Conversation months that ended at least 12 months ago, oldest first. Only whole months are
  // listed, so one archive object holds every message of its conversation and month.
  expiredGroups(storeId: string, limit: number): Promise<ArchiveGroup[]> {
    return this.database.forStore(storeId, async (tx) => {
      const { rows } = await tx.execute<ArchiveGroup>(sql`
        select conversation_id::text as "conversationId",
          to_char(created_at at time zone 'UTC', 'YYYY-MM') as month
        from messages
        where store_id = ${storeId}
          and created_at < (date_trunc('month', now() at time zone 'UTC' - interval '12 months') at time zone 'UTC')
        group by 1, 2
        order by 2, 1
        limit ${limit}`);
      return rows;
    });
  }

  // One page of a conversation month, oldest first.
  page(
    storeId: string,
    group: ArchiveGroup,
    after: MessagePageCursor | null,
    limit: number,
  ): Promise<MessagePage> {
    return this.database.forStore(storeId, async (tx) => {
      const { rows } = await tx.execute<{ line: string; createdAt: string; id: string }>(sql`
        select row_to_json(t)::text as line, t.created_at::text as "createdAt", t.id::text as id
        from messages t
        where t.store_id = ${storeId} and t.conversation_id = ${group.conversationId}
          and t.created_at >= ${monthStart(group.month)} and t.created_at < ${monthEnd(group.month)}
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

  // One statement in one transaction. If the count differs from what was exported, the whole
  // delete rolls back, so a retry never writes a smaller archive over a complete one.
  deleteGroup(storeId: string, group: ArchiveGroup, exportedRows: number): Promise<void> {
    return this.database.forStore(storeId, async (tx) => {
      const { rows } = await tx.execute<{ count: number }>(sql`
        with removed as (
          delete from messages
          where store_id = ${storeId} and conversation_id = ${group.conversationId}
            and created_at >= ${monthStart(group.month)} and created_at < ${monthEnd(group.month)}
          returning 1)
        select count(*)::int as count from removed`);
      if (rows[0]?.count !== exportedRows) throw messagingError('MESSAGE_ARCHIVE_COUNT_CHANGED');
    });
  }
}
