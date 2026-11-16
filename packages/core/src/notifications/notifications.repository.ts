import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, sql } from 'drizzle-orm';

import type {
  NotificationCategory,
  NotificationListQuery,
  NotificationStatus,
} from '@dakly/contracts/notifications';
import { notifications } from '@dakly/db/schema/platform';

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
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

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
    change: { from: NotificationStatus; to: NotificationStatus; snoozedUntil: Date | null },
  ): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(notifications)
        .set({ status: change.to, snoozedUntil: change.snoozedUntil })
        .where(
          and(
            ofUser(storeId, userId),
            eq(notifications.id, notificationId),
            eq(notifications.status, change.from),
          ),
        ),
    );
  }
}
