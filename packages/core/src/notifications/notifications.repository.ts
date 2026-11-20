import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, inArray, lte, sql } from 'drizzle-orm';

import type {
  NotificationCategory,
  NotificationListQuery,
  NotificationStatus,
} from '@dakly/contracts/notifications';
import type { Database } from '@dakly/db/client';
import { notifications } from '@dakly/db/schema/platform';

import { DATABASE } from '../platform/database/database.tokens';
import { TenantDatabase } from '../platform/database/tenant-database';

export type Notification = {
  id: string;
  type: string;
  category: NotificationCategory;
  priority: number;
  title: string;
  body: string | null;
  actionUrl: string | null;
  status: NotificationStatus;
  snoozedUntil: Date | null;
  createdAt: Date;
};
export type NewNotification = Pick<Notification, 'type' | 'category' | 'title'> &
  Partial<Pick<Notification, 'priority' | 'body' | 'actionUrl'>> & { dedupeKey: string };

const notificationColumns = {
  id: notifications.id,
  type: notifications.type,
  category: notifications.category,
  priority: notifications.priority,
  title: notifications.title,
  body: notifications.body,
  actionUrl: notifications.actionUrl,
  status: notifications.status,
  snoozedUntil: notifications.snoozedUntil,
  createdAt: notifications.createdAt,
};
const ofUser = (storeId: string, userId: string) =>
  and(eq(notifications.storeId, storeId), eq(notifications.userId, userId));

@Injectable()
export class NotificationsRepository {
  constructor(
    @Inject(TenantDatabase) private readonly database: TenantDatabase,
    @Inject(DATABASE) private readonly global: Database,
  ) {}

  // Returns only the rows this call created; a user who already has the dedupe key is skipped.
  insertForUsers(storeId: string, userIds: string[], notification: NewNotification) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .insert(notifications)
        .values(userIds.map((userId) => ({ ...notification, storeId, userId })))
        .onConflictDoNothing({
          target: [notifications.storeId, notifications.userId, notifications.dedupeKey],
        })
        .returning({
          id: notifications.id,
          userId: notifications.userId,
          category: notifications.category,
        }),
    );
  }

  list(storeId: string, userId: string, query: NotificationListQuery): Promise<Notification[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select(notificationColumns)
        .from(notifications)
        .where(
          and(
            ofUser(storeId, userId),
            query.category ? eq(notifications.category, query.category) : undefined,
            query.status ? eq(notifications.status, query.status) : undefined,
            query.cursor
              ? sql`(${notifications.createdAt}, ${notifications.id}) <
              (select created_at, id from notifications
               where store_id = ${storeId} and user_id = ${userId} and id = ${query.cursor})`
              : undefined,
          ),
        )
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(query.limit + 1),
    );
  }

  async findForUser(
    storeId: string,
    userId: string,
    notificationId: string,
  ): Promise<Notification | undefined> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select(notificationColumns)
        .from(notifications)
        .where(and(ofUser(storeId, userId), eq(notifications.id, notificationId)))
        .limit(1),
    );
    return rows[0];
  }

  // Ids are UUID v7 made at insert time, so a greater id is a later row.
  listCreatedAfter(
    storeId: string,
    userId: string,
    notificationId: string,
    limit: number,
  ): Promise<Notification[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select(notificationColumns)
        .from(notifications)
        .where(and(ofUser(storeId, userId), gt(notifications.id, notificationId)))
        .orderBy(asc(notifications.id))
        .limit(limit),
    );
  }

  async changeStatus(
    storeId: string,
    userId: string,
    notificationId: string,
    change: { from: NotificationStatus[]; to: NotificationStatus; snoozedUntil: Date | null },
  ): Promise<boolean> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .update(notifications)
        .set({ status: change.to, snoozedUntil: change.snoozedUntil })
        .where(
          and(
            ofUser(storeId, userId),
            eq(notifications.id, notificationId),
            inArray(notifications.status, change.from),
          ),
        )
        .returning({ id: notifications.id }),
    );
    return rows.length > 0;
  }

  async storesWithSnoozesDue(asOf: Date): Promise<string[]> {
    const result = await this.global.execute<{ storeId: string }>(
      sql`select store_id as "storeId" from stores_with_snoozes_due(${asOf.toISOString()}::timestamptz)`,
    );
    return result.rows.map((row) => row.storeId);
  }

  async wakeSnoozed(storeId: string, asOf: Date) {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(notifications)
        .set({ status: 'new', snoozedUntil: null })
        .where(
          and(
            eq(notifications.storeId, storeId),
            eq(notifications.status, 'snoozed'),
            lte(notifications.snoozedUntil, asOf),
          ),
        ),
    );
  }

  // Deletes one batch of notifications older than 90 days and says whether the batch was full.
  // array() makes the row picker run once; with `in (select ... limit)` Postgres may re-run it per row.
  async purgeExpiredBatch(storeId: string, limit: number): Promise<boolean> {
    const { rows } = await this.database.forStore(storeId, (tx) =>
      tx.execute<{ count: number }>(sql`
        with removed as (
          delete from notifications where ctid = any(array(
            select ctid from notifications
            where store_id = ${storeId} and created_at < now() - interval '90 days'
            limit ${limit} for update skip locked))
          returning 1)
        select count(*)::int as count from removed`),
    );
    return rows[0]?.count === limit;
  }
}
