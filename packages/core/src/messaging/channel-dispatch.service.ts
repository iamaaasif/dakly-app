import { Inject, Injectable } from '@nestjs/common';

import { messageAttachmentsSchema } from '@dakly/contracts/chats';
import { productCarouselSchema } from '@dakly/contracts/product-card';
import { MetaRequestError, type OutboundCard } from '@dakly/providers/channel/channel-driver';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { ChannelConnectionsService } from '../channels/channel-connections.service';
import { ContactIdentitiesService } from '../contacts/contact-identities.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { FILE_STORAGE_DRIVER } from '../platform/file-storage/file-storage.provider';
import { OutboxService } from '../platform/outbox/outbox.service';
import { DAY_MS } from '../platform/time';
import { SendPolicyService } from '../sending/send-policy.service';
import { StoresService } from '../stores/stores.service';
import { messagingError } from './messaging.errors';
import { OutboundMessagingRepository } from './outbound-messaging.repository';
import type { OutgoingChannelMessage } from './outgoing-channel-message';

type ChannelMessage = {
  id: string;
  conversationId: string;
  contactId: string;
  channel: OutgoingChannelMessage['channel'];
};
type DispatchRow = Awaited<ReturnType<OutboundMessagingRepository['findForDispatch']>> &
  Pick<ChannelMessage, 'channel'>;
export type CampaignMessageContent = {
  imageUrl?: string;
  buttons?: { title: string; payload: string }[];
  card?: OutboundCard;
};
// A refused image does not stop the text, so a sent message can still report it.
export type CampaignSendResult =
  | { status: 'sent'; externalMessageId: string; imageRejected?: true }
  | { status: 'failed'; errorCode: string }
  | { status: 'unconfirmed' };

type PendingDispatch = ChannelMessage & {
  body: string;
  externalId: string;
  humanAgent: boolean;
  credential: Awaited<ReturnType<ChannelConnectionsService['prepareMetaSend']>>;
};

type DispatchIntent = DispatchRow &
  Pick<OutgoingChannelMessage, 'identityId' | 'category'> & { body: string };

// Meta's Human Agent tag gives staff seven days to reply.
const HUMAN_AGENT_WINDOW_MS = 7 * DAY_MS;

function humanAgentDeadline(
  message: Pick<DispatchRow, 'authorType' | 'category' | 'lastInboundAt'>,
) {
  const { authorType, category, lastInboundAt } = message;
  return authorType === 'user' && category === 'staff_reply' && lastInboundAt
    ? new Date(lastInboundAt.getTime() + HUMAN_AGENT_WINDOW_MS)
    : null;
}

@Injectable()
export class ChannelDispatchService {
  constructor(
    @Inject(ContactIdentitiesService) private readonly identities: ContactIdentitiesService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(ChannelConnectionsService) private readonly connections: ChannelConnectionsService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(OutboundMessagingRepository) private readonly outbound: OutboundMessagingRepository,
    @Inject(SendPolicyService) private readonly sendPolicy: SendPolicyService,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(FILE_STORAGE_DRIVER) private readonly storage: FileStorageDriver,
  ) {}

  async sendQueuedMessage(storeId: string, messageId: string): Promise<void> {
    if (this.transaction.isOpen()) throw messagingError('MESSAGING_INSIDE_TRANSACTION');
    const pending = await this.prepareChannelDispatch(storeId, messageId);
    if (pending)
      await this.submit(storeId, pending, {
        imageUrl: this.imageUrl(pending),
        card: this.outboundCard(pending),
      });
  }

  // The Meta servers fetch the photo, so the link outlives the send but not by long.
  private imageUrl({ attachments }: { attachments: unknown }) {
    const parsed = messageAttachmentsSchema.safeParse(attachments);
    const image = parsed.success
      ? parsed.data.find((item) => item.kind === 'image' && item.status === 'stored')
      : undefined;
    return image?.status === 'stored'
      ? this.storage.createDownloadUrl(image.objectKey, 600)
      : undefined;
  }

  // A card that no longer parses goes out as the plain text it was saved with.
  private outboundCard({ card }: { card: unknown }): OutboundCard | undefined {
    const parsed = productCarouselSchema.safeParse(card);
    if (!parsed.success) return undefined;
    return {
      elements: parsed.data.elements.map(({ imageObjectKey, ...element }) => ({
        ...element,
        ...(imageObjectKey
          ? { imageUrl: this.storage.createDownloadUrl(imageObjectKey, 600) }
          : {}),
      })),
    };
  }

  // A campaign recipient's message was checked by the campaign's own claim just before this, so
  // the gate does not run again; the rest of the transport is the same as for a chat reply.
  async sendCampaignMessage(
    storeId: string,
    messageId: string,
    content: CampaignMessageContent,
  ): Promise<CampaignSendResult> {
    if (this.transaction.isOpen()) throw messagingError('MESSAGING_INSIDE_TRANSACTION');
    const pending = await this.prepareCampaignDispatch(storeId, messageId);
    // Nothing was prepared: the message was already attempted, so its outcome is not known here.
    return pending ? this.submit(storeId, pending, content) : { status: 'unconfirmed' };
  }

  private async submit(
    storeId: string,
    pending: PendingDispatch,
    content: CampaignMessageContent,
  ): Promise<CampaignSendResult> {
    let sent;
    try {
      sent = await this.connections.sendMetaMessage(pending.credential, {
        externalConversationId: pending.externalId,
        text: pending.body,
        operationKey: pending.id,
        humanAgent: pending.humanAgent,
        ...content,
      });
    } catch (error) {
      if (error instanceof AppError && error.code === 'DECRYPTION_FAILED')
        return this.failed(storeId, pending, 'connection_unavailable');
      if (!(error instanceof MetaRequestError)) throw error;
      if (error.code === 'auth_error' || error.code === 'rejected')
        return this.failed(storeId, pending, error.code);
      // Without acceptance or rejection, the stored attempt stays pending for reconciliation.
      return { status: 'unconfirmed' };
    }
    await this.recordChannelOutcome(
      storeId,
      pending,
      { ...sent, sentAt: this.clock.now(), preview: pending.body.slice(0, 160) },
      'attempted',
    );
    return { status: 'sent', ...sent };
  }

  private async failed(storeId: string, pending: PendingDispatch, errorCode: string) {
    await this.recordChannelOutcome(storeId, pending, errorCode, 'attempted');
    return { status: 'failed', errorCode } as const;
  }

  private prepareCampaignDispatch(storeId: string, messageId: string) {
    return this.transaction.runLocked(storeId, async () => {
      const row = await this.outbound.findForDispatch(storeId, messageId);
      if (!row || row.channel === 'whatsapp') return;
      const { identityId, body, channel } = row;
      if (!identityId || body === null) return;
      const message = { ...row, channel };
      const identity = await this.identities.findOutboundIdentity(storeId, {
        ...message,
        identityId,
      });
      if (!identity) return this.recordChannelOutcome(storeId, message, 'no_address');
      let credential;
      try {
        credential = await this.connections.prepareMetaSend(storeId, row.connectionId, channel);
      } catch (error) {
        if (error instanceof AppError && error.code === 'CHANNEL_NOT_CONNECTED')
          return this.recordChannelOutcome(storeId, message, 'channel_not_connected');
        throw error;
      }
      if (!(await this.outbound.markAttempt(storeId, messageId))) return;
      return { ...message, body, externalId: identity.externalId, humanAgent: false, credential };
    });
  }

  private prepareChannelDispatch(storeId: string, messageId: string) {
    return this.transaction.runLocked(storeId, async () => {
      const row = await this.outbound.findForDispatch(storeId, messageId);
      if (!row || row.channel === 'whatsapp') return;
      const { identityId, category, body, channel } = row;
      const message = { ...row, channel };
      if (!identityId || !category || body === null)
        return this.recordChannelOutcome(storeId, message, 'send_intent_missing');
      if (category === 'marketing')
        return this.recordChannelOutcome(storeId, message, 'send_category_unsupported');
      const intent = { ...message, identityId, category, body };
      if (
        category === 'staff_reply' &&
        !(await this.stores.settings(storeId)).extensions.includes('chats')
      )
        return this.recordChannelOutcome(storeId, intent, 'chats_disabled');
      return this.claimChannelDispatch(storeId, intent);
    });
  }

  private async claimChannelDispatch(storeId: string, message: DispatchIntent) {
    const { category, connectionId, channel } = message;
    const gate = await this.checkChannelDispatch(storeId, message, category);
    if (!gate) return;
    if (gate.decision.action !== 'send')
      return this.recordChannelOutcome(
        storeId,
        message,
        gate.decision.action === 'skip' ? gate.decision.reason : 'quiet_hours',
      );
    const identity = await this.identities.findOutboundIdentity(storeId, message);
    if (!identity) return this.recordChannelOutcome(storeId, message, 'no_address');
    let credential;
    try {
      credential = await this.connections.prepareMetaSend(storeId, connectionId, channel);
    } catch (error) {
      if (
        error instanceof AppError &&
        ['CHANNEL_NOT_CONNECTED', 'META_CHANNEL_NOT_CONFIGURED'].includes(error.code)
      )
        return this.recordChannelOutcome(storeId, message, error.code.toLowerCase());
      throw error;
    }
    if (!(await this.outbound.markAttempt(storeId, message.id))) return;
    return {
      ...message,
      externalId: identity.externalId,
      humanAgent: gate.humanAgent,
      credential,
    };
  }

  private async checkChannelDispatch(
    storeId: string,
    message: DispatchRow,
    category: OutgoingChannelMessage['category'],
  ) {
    const request = { channel: message.channel, category, contactId: message.contactId };
    const deadline = humanAgentDeadline(message) ?? message.windowExpiresAt;
    const initial = await this.sendPolicy.checkForSend(storeId, {
      ...request,
      windowClosesAt: deadline,
    });
    // Inbound messages can advance the window while the gate waits for the contact lock.
    const current = await this.outbound.findForDispatch(storeId, message.id);
    if (!current) return;
    const humanDeadline = humanAgentDeadline(current);
    const windowClosesAt = humanDeadline ?? current.windowExpiresAt;
    const checked =
      deadline?.getTime() === windowClosesAt?.getTime()
        ? initial
        : await this.sendPolicy.checkForSend(storeId, { ...request, windowClosesAt });
    const humanAgent =
      humanDeadline !== null && (!current.windowExpiresAt || checked.at >= current.windowExpiresAt);
    return { decision: checked.decision, humanAgent };
  }

  private async recordChannelOutcome(
    storeId: string,
    message: ChannelMessage,
    outcome: { externalMessageId: string; sentAt: Date; preview: string } | string,
    stage: 'unclaimed' | 'attempted' = 'unclaimed',
  ) {
    // Serialize confirmation with receipts that may arrive before Meta returns.
    await this.transaction.runLocked(storeId, async () => {
      const sent = typeof outcome !== 'string';
      const updated = await this.outbound.finish(
        storeId,
        message.id,
        sent
          ? {
              status: 'sent',
              externalId: outcome.externalMessageId,
              sentAt: outcome.sentAt,
              errorCode: null,
            }
          : { status: 'failed', errorCode: outcome },
        stage,
      );
      if (!updated) return;
      if (sent)
        await this.outbound.advanceConversation(storeId, message.conversationId, {
          at: outcome.sentAt,
          preview: outcome.preview,
        });
      await this.outbox.publish({
        type: sent ? 'message.sent' : 'message.failed',
        storeId,
        occurredAt: this.clock.now().toISOString(),
        payload: {
          messageId: message.id,
          conversationId: message.conversationId,
          contactId: message.contactId,
          channel: message.channel,
        },
      });
    });
  }
}
