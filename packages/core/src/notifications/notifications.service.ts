import { Inject, Injectable } from '@nestjs/common';

import type {
  NotificationCategory,
  NotificationListQuery,
  NotificationListResponse,
  NotificationResponse,
  NotificationStatus,
  SnoozeNotificationInput,
} from '@dakly/contracts/notifications';
import type { Permission } from '@dakly/contracts/team';

import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { TeamService } from '../team/team.service';
import { notificationError } from './notifications.errors';
import { type Notification, NotificationsRepository } from './notifications.repository';

export type NotifyInput = {
  type: string;
  category: NotificationCategory;
  dedupeKey: string;
  recipientPermission: Permission;
  title: string;
  body?: string;
  actionUrl?: string;
  priority?: number;
};

type StatusChange = 'seen' | 'done' | 'snoozed';

// A reconnecting stream gets at most this many missed rows; the list has the rest.
const REPLAY_LIMIT = 100;

// Seen is a read receipt, so it only moves a new card. A done card stays done.
const movesFrom: Record<StatusChange, NotificationStatus[]> = {
  seen: ['new'],
  done: ['new', 'seen', 'snoozed'],
  snoozed: ['new', 'seen', 'snoozed'],
};

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(NotificationsRepository) private readonly repository: NotificationsRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(TeamService) private readonly team: TeamService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async notify(storeId: string, { recipientPermission, ...notification }: NotifyInput) {
    await this.transaction.run(storeId, async () => {
      const userIds = await this.team.userIdsWithPermission(storeId, recipientPermission);
      if (!userIds.length) return;
      const created = await this.repository.insertForUsers(storeId, userIds, notification);
      const occurredAt = this.clock.now().toISOString();
      await this.outbox.publishAll(
        created.map(({ id, userId, category }) => ({
          type: 'notification.created' as const,
          storeId,
          occurredAt,
          payload: { notificationId: id, userId, category },
        })),
      );
    });
  }

  async list(
    storeId: string,
    userId: string,
    query: NotificationListQuery,
  ): Promise<NotificationListResponse> {
    const rows = await this.repository.list(storeId, userId, query);
    const items = rows.slice(0, query.limit).map(toNotificationResponse);
    return { items, nextCursor: rows.length > query.limit ? items.at(-1)!.id : null };
  }

  async findForUser(storeId: string, userId: string, notificationId: string) {
    const row = await this.repository.findForUser(storeId, userId, notificationId);
    return row && toNotificationResponse(row);
  }

  async listCreatedAfter(storeId: string, userId: string, notificationId: string) {
    const rows = await this.repository.listCreatedAfter(
      storeId,
      userId,
      notificationId,
      REPLAY_LIMIT,
    );
    return rows.map(toNotificationResponse);
  }

  markSeen(storeId: string, userId: string, notificationId: string) {
    return this.changeStatus(storeId, userId, notificationId, { to: 'seen', snoozedUntil: null });
  }

  markDone(storeId: string, userId: string, notificationId: string) {
    return this.changeStatus(storeId, userId, notificationId, { to: 'done', snoozedUntil: null });
  }

  async snooze(
    storeId: string,
    userId: string,
    notificationId: string,
    { until }: SnoozeNotificationInput,
  ) {
    const snoozedUntil = new Date(until);
    if (snoozedUntil <= this.clock.now()) throw notificationError('SNOOZE_NOT_IN_FUTURE');
    await this.changeStatus(storeId, userId, notificationId, { to: 'snoozed', snoozedUntil });
  }

  // Two sweeps can overlap; the update moves only cards still snoozed, so the second does nothing.
  async wakeSnoozed() {
    const now = this.clock.now();
    for (const storeId of await this.repository.storesWithSnoozesDue(now))
      await this.repository.wakeSnoozed(storeId, now);
  }

  private async changeStatus(
    storeId: string,
    userId: string,
    notificationId: string,
    { to, snoozedUntil }: { to: StatusChange; snoozedUntil: Date | null },
  ) {
    const change = { from: movesFrom[to], to, snoozedUntil };
    if (await this.repository.changeStatus(storeId, userId, notificationId, change)) return;
    // The guarded update moved nothing: the card is missing, done, or already past this change.
    const current = await this.repository.findForUser(storeId, userId, notificationId);
    if (!current) throw notificationError('NOTIFICATION_NOT_FOUND');
    if (to === 'snoozed' && current.status === 'done') throw notificationError('NOTIFICATION_DONE');
  }
}

function toNotificationResponse(row: Notification): NotificationResponse {
  return {
    ...row,
    snoozedUntil: row.snoozedUntil?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
