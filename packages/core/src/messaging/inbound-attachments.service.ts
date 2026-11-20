import { Inject, Injectable } from '@nestjs/common';

import {
  inboundAttachmentLimits,
  type MessageAttachment,
  type messageAttachmentFailures,
} from '@dakly/contracts/chats';
import { MetaRequestError } from '@dakly/providers/channel/channel-driver';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { ChannelConnectionsService } from '../channels/channel-connections.service';
import { AppError } from '../platform/errors/app-error';
import { FILE_STORAGE_DRIVER } from '../platform/file-storage/file-storage.provider';
import { InboundAttachmentsRepository } from './inbound-attachments.repository';
import { messagingError } from './messaging.errors';

type Failure = (typeof messageAttachmentFailures)[number];
type Pending = Extract<MessageAttachment, { status: 'pending' }>;
type Target = { storeId: string; messageId: string; index: number; attachment: Pending };
type Credential = Awaited<ReturnType<ChannelConnectionsService['prepareMetaSend']>>;

@Injectable()
export class InboundAttachmentsService {
  constructor(
    @Inject(InboundAttachmentsRepository) private readonly repository: InboundAttachmentsRepository,
    @Inject(ChannelConnectionsService) private readonly connections: ChannelConnectionsService,
    @Inject(FILE_STORAGE_DRIVER) private readonly storage: FileStorageDriver,
  ) {}

  // Meta links expire, so a link that no longer works is recorded as failed instead of retried.
  // A Meta outage throws so the queue retries; the last attempt gives up and records it.
  async copy(storeId: string, messageId: string, finalAttempt: boolean): Promise<void> {
    const message = await this.repository.find(storeId, messageId);
    if (!message || message.channel === 'whatsapp') return;
    const pending = message.attachments.flatMap((attachment, index) =>
      attachment.status === 'pending' ? [{ storeId, messageId, index, attachment }] : [],
    );
    if (!pending.length) return;
    const credential = await this.credential(storeId, message.connectionId, message.channel);
    let retry = false;
    for (const target of pending) {
      const outcome = credential
        ? await this.copyOne(target, credential)
        : ('connection_unavailable' as const);
      if (outcome === 'settled') continue;
      if (outcome === 'unavailable' && !finalAttempt) retry = true;
      else await this.fail(target, outcome);
    }
    if (retry) throw messagingError('ATTACHMENT_COPY_UNAVAILABLE');
  }

  private async credential(
    storeId: string,
    connectionId: string,
    channel: 'messenger' | 'instagram',
  ) {
    try {
      return await this.connections.prepareMetaSend(storeId, connectionId, channel);
    } catch (error) {
      if (error instanceof AppError && error.code === 'CHANNEL_NOT_CONNECTED') return undefined;
      throw error;
    }
  }

  private async copyOne(
    target: Target,
    credential: Credential,
  ): Promise<'settled' | 'unavailable' | Failure> {
    const { storeId, messageId, index } = target;
    const { kind, sourceUrl } = target.attachment;
    const limits = inboundAttachmentLimits[kind];
    let download;
    try {
      download = await this.connections.downloadMetaMedia(credential, sourceUrl, limits.maxBytes);
    } catch (error) {
      if (!(error instanceof MetaRequestError)) throw error;
      return error.code === 'unavailable' || error.code === 'invalid_response'
        ? 'unavailable'
        : 'rejected';
    }
    if (download.kind !== 'downloaded') return download.kind;
    const contentTypes: readonly string[] = limits.contentTypes;
    if (!contentTypes.includes(download.contentType)) return 'type_not_allowed';
    // One fixed key per attachment: a retry after a crash writes the same object again.
    const objectKey = `stores/${storeId}/messages/${messageId}/${index}`;
    await this.storage.writeBytes(objectKey, download.bytes, download.contentType);
    await this.repository.settle(storeId, messageId, index, {
      kind,
      status: 'stored',
      objectKey,
      contentType: download.contentType,
      sizeBytes: download.bytes.byteLength,
    });
    return 'settled';
  }

  private async fail({ storeId, messageId, index, attachment }: Target, reason: Failure) {
    await this.repository.settle(storeId, messageId, index, {
      kind: attachment.kind,
      status: 'failed',
      reason,
    });
  }
}
