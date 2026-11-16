import {
  type BeforeApplicationShutdown,
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { Observable } from 'rxjs';
import { z } from 'zod';

import type { NotificationResponse } from '@dakly/contracts/notifications';

import { ValkeyClient } from '../platform/cache/valkey-client';
import { AccountTransaction } from '../platform/database/account-transaction';
import { SessionsService } from '../sessions/sessions.service';
import { TeamService } from '../team/team.service';
import { NotificationsService } from './notifications.service';

export const STREAM_HEARTBEAT_MS = 25_000;
// Ten times the replay limit, so a replayed row or a relay retry minutes later still finds its id.
export const STREAM_SENT_IDS_LIMIT = 1000;
const CHANNEL_PREFIX = 'notifications:';
const liveNotificationSchema = z.tuple([z.uuid(), z.uuid()]);

export type StreamSession = { storeId: string; userId: string; sessionId: string };
export type StreamMessage =
  { type: 'notification'; id: string; data: NotificationResponse } | { comment: string };
type Stream = { userId: string; deliver: (notificationId: string) => void; close: () => void };

// Each API process holds one subscriber connection, which Valkey keeps in subscribe mode, and
// fans each store channel out to that store's open streams.
@Injectable()
export class NotificationStreamService implements BeforeApplicationShutdown, OnApplicationShutdown {
  private readonly logger = new Logger(NotificationStreamService.name);
  private readonly streams = new Map<string, Set<Stream>>();
  private subscriber?: Redis;

  constructor(
    @Inject(ValkeyClient) private readonly valkey: ValkeyClient,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(TeamService) private readonly team: TeamService,
    @Inject(AccountTransaction) private readonly accountTransaction: AccountTransaction,
  ) {}

  async announce(storeId: string, notificationId: string, userId: string) {
    await this.valkey.connection.publish(CHANNEL_PREFIX + storeId, `${notificationId} ${userId}`);
  }

  open(session: StreamSession, lastEventId?: string): Observable<StreamMessage> {
    const { storeId, userId } = session;
    return new Observable<StreamMessage>((subscriber) => {
      const sent = new Set<string>();
      let isClosed = false;
      let work = Promise.resolve();
      // One step at a time, so replayed rows go out before live ones and a row goes out once.
      const enqueue = (step: () => Promise<void>) => {
        work = work
          .then(() => (isClosed ? undefined : step()))
          .catch((error: unknown) => subscriber.error(error));
      };
      const send = (notification?: NotificationResponse) => {
        if (!notification || sent.has(notification.id)) return;
        sent.add(notification.id);
        // A Set iterates in insertion order, so this forgets the oldest id.
        if (sent.size > STREAM_SENT_IDS_LIMIT) sent.delete(sent.values().next().value!);
        subscriber.next({ type: 'notification', id: notification.id, data: notification });
      };
      const stream: Stream = {
        userId,
        deliver: (id) =>
          enqueue(async () => send(await this.notifications.findForUser(storeId, userId, id))),
        close: () => subscriber.complete(),
      };
      enqueue(() => this.join(storeId, stream));
      if (lastEventId)
        enqueue(async () =>
          (await this.notifications.listCreatedAfter(storeId, userId, lastEventId)).forEach(send),
        );
      const heartbeat = setInterval(
        () =>
          enqueue(async () => {
            if (await this.isAllowed(session)) subscriber.next({ comment: 'heartbeat' });
            else subscriber.complete();
          }),
        STREAM_HEARTBEAT_MS,
      );
      return () => {
        isClosed = true;
        clearInterval(heartbeat);
        this.leave(storeId, stream);
      };
    });
  }

  // Open streams would otherwise keep the HTTP server from closing on deploy.
  beforeApplicationShutdown() {
    for (const stream of [...this.streams.values()].flatMap((streams) => [...streams]))
      stream.close();
  }

  onApplicationShutdown() {
    this.subscriber?.disconnect();
  }

  private async join(storeId: string, stream: Stream) {
    const streams = this.streams.get(storeId);
    if (streams) {
      streams.add(stream);
      return;
    }
    this.streams.set(storeId, new Set([stream]));
    await this.connection().subscribe(CHANNEL_PREFIX + storeId);
  }

  private leave(storeId: string, stream: Stream) {
    const streams = this.streams.get(storeId);
    if (!streams?.delete(stream) || streams.size) return;
    this.streams.delete(storeId);
    // A dropped connection forgets its channels anyway; nothing waits for this answer.
    void this.subscriber?.unsubscribe(CHANNEL_PREFIX + storeId).catch(() => undefined);
  }

  private connection(): Redis {
    if (this.subscriber) return this.subscriber;
    const subscriber = this.valkey.connection.duplicate();
    subscriber.on('error', () => this.logger.error('Valkey subscriber connection failed'));
    subscriber.on('message', (channel: string, message: string) => {
      const ids = liveNotificationSchema.safeParse(message.split(' '));
      if (!ids.success) return;
      const [notificationId, userId] = ids.data;
      for (const stream of this.streams.get(channel.slice(CHANNEL_PREFIX.length)) ?? [])
        if (stream.userId === userId) stream.deliver(notificationId);
    });
    this.subscriber = subscriber;
    return subscriber;
  }

  private async isAllowed({ storeId, userId, sessionId }: StreamSession) {
    const isActive = await this.accountTransaction.run(userId, () =>
      this.sessions.isActive(userId, sessionId),
    );
    return isActive && (await this.team.accessFor(storeId, userId)) !== undefined;
  }
}
