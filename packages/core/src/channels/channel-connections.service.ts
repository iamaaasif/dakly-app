import { Inject, Injectable, Logger } from '@nestjs/common';

import type { ChannelConnection, ChannelConnectionListQuery } from '@dakly/contracts/channels';
import { postingSlotsSchema, type PostingSlot } from '@dakly/contracts/social';
import type { StoreAccess } from '@dakly/contracts/team';
import {
  MetaRequestError,
  type ChannelDriver,
  type OutboundMessage,
} from '@dakly/providers/channel/channel-driver';

import { NotificationsService } from '../notifications/notifications.service';
import { Clock } from '../platform/clock';
import { EnvelopeEncryption } from '../platform/crypto/envelope-encryption';
import { hasDatabaseTransactionScope } from '../platform/database/scoped-transactions';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { measureVendorCall } from '../platform/logging/vendor-call-metric';
import { OutboxService } from '../platform/outbox/outbox.service';
import { TeamService } from '../team/team.service';
import { CHANNEL_CONNECTION_ERRORS } from './channel-connections.errors';
import { ChannelConnectionsRepository } from './channel-connections.repository';
import { META_CHANNEL_DRIVER } from './meta-authorization.service';

function connectionError(code: keyof typeof CHANNEL_CONNECTION_ERRORS) {
  return new AppError(code, CHANNEL_CONNECTION_ERRORS[code]);
}

type PreparedMetaSend = {
  storeId: string;
  connectionId: string;
  channel: OutboundMessage['channel'];
  ciphertext: Buffer;
  keyVersion: number;
  externalAccountId: string;
};

@Injectable()
export class ChannelConnectionsService {
  private readonly logger = new Logger(ChannelConnectionsService.name);

  constructor(
    @Inject(ChannelConnectionsRepository) private readonly repository: ChannelConnectionsRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(TeamService) private readonly team: TeamService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(EnvelopeEncryption) private readonly encryption: EnvelopeEncryption,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(META_CHANNEL_DRIVER) private readonly driver: Pick<ChannelDriver, 'send'> | null,
  ) {}

  async list(
    storeId: string,
    query: ChannelConnectionListQuery,
  ): Promise<{ items: ChannelConnection[]; nextCursor: string | null }> {
    const rows = await this.repository.list(storeId, query);
    const page = rows.slice(0, query.limit);
    return {
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
      items: page.map((row) => ({
        ...row,
        tokenExpiresAt: row.tokenExpiresAt?.toISOString() ?? null,
        connectedAt: row.connectedAt.toISOString(),
        disconnectedAt: row.disconnectedAt?.toISOString() ?? null,
      })),
    };
  }

  async postingConnections(storeId: string, ids: string[]) {
    if (!ids.length) return [];
    const rows = await this.repository.findPostingConnections(storeId, ids);
    return rows.map(({ postingSlots, ...connection }) => ({
      ...connection,
      postingSlots: postingSlotsSchema.safeParse(postingSlots).data ?? null,
    }));
  }

  async savePostingSlots(
    storeId: string,
    input: { channelConnectionId: string; slots: PostingSlot[] },
  ) {
    const [saved] = await this.repository.savePostingSlots(storeId, {
      ...input,
      now: this.clock.now(),
    });
    if (!saved) return undefined;
    return { ...saved, postingSlots: input.slots };
  }

  async findInbound(
    storeId: string,
    lookup: Parameters<ChannelConnectionsRepository['findInbound']>[1],
  ) {
    const connection = await this.repository.findInbound(storeId, lookup);
    if (!connection) return null;
    const channel = connection.kind === 'facebook_page' ? 'messenger' : connection.kind;
    return { id: connection.id, channel, connectedAt: connection.connectedAt } as const;
  }

  async prepareMetaSend(
    storeId: string,
    connectionId: string,
    channel: OutboundMessage['channel'],
  ): Promise<PreparedMetaSend> {
    if (!this.driver) throw connectionError('META_CHANNEL_NOT_CONFIGURED');
    const credential = await this.repository.activeMetaToken(storeId, connectionId);
    const kind = channel === 'messenger' ? 'facebook_page' : 'instagram';
    if (!credential?.ciphertext || credential.keyVersion === null || credential.kind !== kind)
      throw connectionError('CHANNEL_NOT_CONNECTED');
    const { ciphertext, externalAccountId, keyVersion } = credential;
    return { storeId, connectionId, channel, ciphertext, externalAccountId, keyVersion };
  }

  async sendMetaMessage(prepared: PreparedMetaSend, message: Omit<OutboundMessage, 'channel'>) {
    if (hasDatabaseTransactionScope()) throw connectionError('CHANNEL_SEND_INSIDE_TRANSACTION');
    if (!this.driver) throw connectionError('META_CHANNEL_NOT_CONFIGURED');
    const { storeId, connectionId, channel, ciphertext, externalAccountId, keyVersion } = prepared;
    const token = this.encryption.decrypt(
      { owner: 'store', storeId, purpose: 'channel-access-token' },
      { ciphertext, keyVersion },
    );
    const driver = this.driver;
    try {
      return await measureVendorCall(this.logger, 'meta_send', 'Meta send measured', () =>
        driver.send(
          { accountExternalId: externalAccountId, accessToken: token.toString() },
          { ...message, channel },
        ),
      );
    } catch (error) {
      await this.recordSendCredentialRejection(storeId, connectionId, ciphertext, error);
      throw error;
    } finally {
      token.fill(0);
    }
  }

  private async recordSendCredentialRejection(
    storeId: string,
    connectionId: string,
    ciphertext: Buffer,
    error: unknown,
  ) {
    if (!(error instanceof MetaRequestError) || error.code !== 'auth_error') return;
    try {
      await this.recordRejectedToken(storeId, connectionId, ciphertext);
    } catch {
      // A bookkeeping failure must not turn a confirmed provider rejection into a pending send.
      this.logger.error('Could not record the rejected Meta credential');
    }
  }

  async recordRejectedToken(storeId: string, channelConnectionId: string, ciphertext: Buffer) {
    await this.transaction.runLocked(storeId, async () => {
      const current = await this.repository.activeMetaToken(storeId, channelConnectionId);
      if (!current?.ciphertext?.equals(ciphertext)) return;
      const now = this.clock.now();
      await this.repository.markNeedsReconnect(storeId, channelConnectionId, now);
      await this.outbox.publish({
        type: 'channel.needs_reconnect',
        storeId,
        occurredAt: now.toISOString(),
        payload: { channelConnectionId },
      });
      await this.notifications.notify(storeId, {
        type: 'channel.needs_reconnect',
        category: 'fix_now',
        recipientPermission: 'storeSettings.edit',
        title: 'Reconnect a channel',
        dedupeKey: `channel.needs_reconnect:${channelConnectionId}:${now.toISOString().slice(0, 10)}`,
      });
    });
  }

  async disconnect(
    storeId: string,
    channelConnectionId: string,
    access: StoreAccess,
  ): Promise<void> {
    if (!this.team.canManageChannelConnections(access))
      throw connectionError('CHANNEL_CONNECTION_ROLE_REQUIRED');
    const now = this.clock.now();
    await this.transaction.runLocked(storeId, async () => {
      const disconnected = await this.repository.disconnect(storeId, channelConnectionId, now);
      if (!disconnected) throw connectionError('CHANNEL_CONNECTION_NOT_FOUND');
      await this.outbox.publish({
        type: 'channel.disconnected',
        storeId,
        occurredAt: now.toISOString(),
        payload: { channelConnectionId },
      });
    });
  }
}
