import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';

import type { MetaTokenHealthDriver } from '@dakly/providers/channel/channel-driver';

import { NotificationsService } from '../notifications/notifications.service';
import { Clock } from '../platform/clock';
import { EnvelopeEncryption } from '../platform/crypto/envelope-encryption';
import { newId } from '../platform/database/new-id';
import { StoreTransaction } from '../platform/database/store-transaction';
import { measureVendorCall } from '../platform/logging/vendor-call-metric';
import { OutboxService } from '../platform/outbox/outbox.service';
import { QUEUES } from '../platform/queue/queues';
import { DAY_MS } from '../platform/time';
import { ChannelConnectionsRepository } from './channel-connections.repository';

export const CHECK_CHANNEL_TOKEN = 'check-channel-token';
export const META_TOKEN_HEALTH_DRIVER = Symbol('META_TOKEN_HEALTH_DRIVER');
const warningWindow = 7 * DAY_MS;

@Injectable()
export class ChannelTokenHealthService {
  private readonly logger = new Logger(ChannelTokenHealthService.name);

  constructor(
    @Inject(META_TOKEN_HEALTH_DRIVER) private readonly driver: MetaTokenHealthDriver | null,
    @Inject(ChannelConnectionsRepository) private readonly repository: ChannelConnectionsRepository,
    @Inject(EnvelopeEncryption) private readonly encryption: EnvelopeEncryption,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
    @InjectQueue(QUEUES.sync) private readonly queue: Queue,
  ) {}

  async enqueueDueChecks(): Promise<void> {
    if (!this.driver) return;
    const now = this.clock.now();
    const day = now.toISOString().slice(0, 10);
    const due = await this.repository.expiringBefore(new Date(now.getTime() + warningWindow));
    await this.queue.addBulk(
      due.map((data) => ({
        name: CHECK_CHANNEL_TOKEN,
        data,
        opts: {
          jobId: `${CHECK_CHANNEL_TOKEN}-${data.channelConnectionId}-${day}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: { age: DAY_MS / 1000 },
          removeOnFail: 100,
        },
      })),
    );
  }

  async check(storeId: string, channelConnectionId: string): Promise<void> {
    if (!this.driver) return;
    const token = await this.repository.activeMetaToken(storeId, channelConnectionId);
    if (!token?.ciphertext || token.keyVersion === null) return;
    const ciphertext = token.ciphertext;
    const plaintext = this.encryption.decrypt(
      { owner: 'store', storeId, purpose: 'channel-access-token' },
      {
        ciphertext: token.ciphertext,
        keyVersion: token.keyVersion,
      },
    );
    let valid: boolean;
    try {
      const driver = this.driver;
      valid = await measureVendorCall(
        this.logger,
        'meta_token_health',
        'Meta token check measured',
        () => driver.isTokenValid(plaintext.toString()),
      );
    } finally {
      plaintext.fill(0);
    }
    await this.transaction.runLocked(storeId, async () => {
      // A disconnect or credential rotation while Meta was responding invalidates this result.
      const current = await this.repository.activeMetaToken(storeId, channelConnectionId);
      if (!current?.ciphertext?.equals(ciphertext)) return;
      await this.recordHealth(storeId, channelConnectionId, valid, current.expiresAt);
    });
  }

  private async recordHealth(
    storeId: string,
    channelConnectionId: string,
    valid: boolean,
    expiresAt: Date | null,
  ) {
    const now = this.clock.now();
    if (!valid) {
      await this.repository.markNeedsReconnect(storeId, channelConnectionId, now);
      await this.outbox.publish({
        type: 'channel.needs_reconnect',
        storeId,
        occurredAt: now.toISOString(),
        payload: { channelConnectionId },
      });
    } else if (!expiresAt || expiresAt.getTime() > now.getTime() + warningWindow) return;
    const type = valid ? 'channel.token_expiring' : 'channel.needs_reconnect';
    await this.notifications.notify(storeId, {
      type,
      category: 'fix_now',
      recipientPermission: 'storeSettings.edit',
      title: valid ? 'A channel connection expires soon' : 'Reconnect a channel',
      dedupeKey: `${type}:${channelConnectionId}:${valid ? expiresAt?.toISOString() : newId()}`,
    });
  }
}
