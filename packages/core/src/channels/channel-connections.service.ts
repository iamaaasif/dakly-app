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
import { META_CHANNEL_DRIVER } from './meta-channel-driver';
import { MetaPageSubscriptionsService } from './meta-page-subscriptions.service';

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

// An image and buttons are Messenger only; Instagram text goes out as it was.
type MetaMessage = Omit<Extract<OutboundMessage, { channel: 'messenger' }>, 'channel'>;

function toOutbound(channel: OutboundMessage['channel'], message: MetaMessage): OutboundMessage {
  if (channel === 'messenger') return { ...message, channel };
  const { externalConversationId, text, operationKey, humanAgent } = message;
  return { channel, externalConversationId, text, operationKey, humanAgent };
}

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
    @Inject(MetaPageSubscriptionsService)
    private readonly pageSubscriptions: MetaPageSubscriptionsService,
    @Inject(META_CHANNEL_DRIVER)
    private readonly driver: Pick<ChannelDriver, 'send' | 'downloadMedia'> | null,
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

  async isAiLive(storeId: string, id: string) {
    return (await this.repository.aiState(storeId, id))?.isAiLive ?? false;
  }

  async requireActive(storeId: string, id: string): Promise<void> {
    const state = await this.repository.aiState(storeId, id);
    if (!state || state.status === 'disconnected')
      throw connectionError('CHANNEL_CONNECTION_NOT_FOUND');
    if (state.status !== 'active') throw connectionError('CHANNEL_NOT_CONNECTED');
  }

  // A Messenger campaign goes out from one connected Facebook Page.
  async requireFacebookPage(storeId: string, id: string): Promise<void> {
    await this.requireActive(storeId, id);
    if ((await this.repository.aiState(storeId, id))?.kind !== 'facebook_page')
      throw connectionError('CHANNEL_CONNECTION_NOT_FOUND');
  }

  // The caller checks the store's tests first; this only moves the channel out of practice.
  async goLive(storeId: string, id: string): Promise<void> {
    await this.requireActive(storeId, id);
    await this.repository.setAiLive(storeId, id, this.clock.now());
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

  async postingCredential(storeId: string, channelConnectionId: string) {
    const token = await this.repository.activeMetaToken(storeId, channelConnectionId);
    if (!token?.ciphertext || token.keyVersion === null) return undefined;
    const { kind, ciphertext, keyVersion, expiresAt, externalAccountId } = token;
    if (kind !== 'facebook_page' && kind !== 'instagram') return undefined;
    return { kind, ciphertext, keyVersion, expiresAt, externalAccountId };
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

  async sendMetaMessage(prepared: PreparedMetaSend, message: MetaMessage) {
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
          toOutbound(channel, message),
        ),
      );
    } catch (error) {
      await this.recordSendCredentialRejection(storeId, connectionId, ciphertext, error);
      throw error;
    } finally {
      token.fill(0);
    }
  }

  async downloadMetaMedia(prepared: PreparedMetaSend, url: string, maxBytes: number) {
    if (hasDatabaseTransactionScope()) throw connectionError('CHANNEL_SEND_INSIDE_TRANSACTION');
    if (!this.driver) throw connectionError('META_CHANNEL_NOT_CONFIGURED');
    const { storeId, ciphertext, keyVersion } = prepared;
    const token = this.encryption.decrypt(
      { owner: 'store', storeId, purpose: 'channel-access-token' },
      { ciphertext, keyVersion },
    );
    const driver = this.driver;
    try {
      return await measureVendorCall(this.logger, 'meta_media', 'Meta media measured', () =>
        driver.downloadMedia(token.toString(), url, maxBytes),
      );
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
    const disconnected = await this.transaction.runLocked(storeId, async () => {
      const previous = await this.repository.disconnect(storeId, channelConnectionId, now);
      if (!previous) throw connectionError('CHANNEL_CONNECTION_NOT_FOUND');
      await this.outbox.publish({
        type: 'channel.disconnected',
        storeId,
        occurredAt: now.toISOString(),
        payload: { channelConnectionId },
      });
      // An Instagram account messages through its linked Page, which stays subscribed while
      // either connection to that Page is live.
      const pageId =
        previous.kind === 'facebook_page'
          ? previous.externalAccountId
          : previous.linkedPageExternalId;
      if (pageId && previous.ciphertext && previous.keyVersion !== null)
        await this.pageSubscriptions.keepForDisconnect(storeId, pageId, {
          ciphertext: previous.ciphertext,
          keyVersion: previous.keyVersion,
        });
      return pageId;
    });
    if (!disconnected) return;
    try {
      await this.pageSubscriptions.unsubscribeDisconnectedPage(storeId, disconnected);
    } catch {
      // The disconnect is done; the daily reconciliation retries the unsubscribe.
      this.logger.error('Could not unsubscribe the Page after disconnect');
    }
  }
}
