import { Inject, Injectable } from '@nestjs/common';

import type { CreateConversationReplyInput } from '@dakly/contracts/chats';
import type {
  ConfirmProductPhotoInput,
  ProductPhotoUploadInput,
  ProductPhotoUploadResponse,
} from '@dakly/contracts/products';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { ContactIdentitiesService } from '../contacts/contact-identities.service';
import { Clock } from '../platform/clock';
import { newId } from '../platform/database/new-id';
import { FILE_STORAGE_DRIVER } from '../platform/file-storage/file-storage.provider';
import { DAY_MS } from '../platform/time';
import { SendPolicyService } from '../sending/send-policy.service';
import { StoresService } from '../stores/stores.service';
import { InboxRepository } from './inbox.repository';
import { messagingError } from './messaging.errors';
import { MessagingService } from './messaging.service';
import type { OutgoingChannelMessage } from './outgoing-channel-message';

const photoKey = (storeId: string, fileId: string) => `stores/${storeId}/chat_photos/${fileId}`;

@Injectable()
export class ConversationReplyService {
  constructor(
    @Inject(InboxRepository) private readonly repository: InboxRepository,
    @Inject(MessagingService) private readonly messaging: MessagingService,
    @Inject(ContactIdentitiesService) private readonly identities: ContactIdentitiesService,
    @Inject(SendPolicyService) private readonly sendPolicy: SendPolicyService,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(FILE_STORAGE_DRIVER) private readonly storage: FileStorageDriver,
  ) {}

  // The browser puts the photo straight into storage; the reply then names it by its file id.
  async requestPhotoUpload(
    storeId: string,
    conversationId: string,
    input: ProductPhotoUploadInput,
  ): Promise<ProductPhotoUploadResponse> {
    if (!(await this.repository.replyRoute(storeId, conversationId)))
      throw messagingError('CONVERSATION_NOT_FOUND');
    const fileId = newId();
    return {
      fileId,
      uploadUrl: this.storage.createUploadUrl(photoKey(storeId, fileId), 300, input),
    };
  }

  async reply(
    storeId: string,
    conversationId: string,
    userId: string,
    { body, operationKey, photo }: CreateConversationReplyInput,
  ) {
    const image = photo && (await this.uploadedPhoto(storeId, photo));
    return this.send(storeId, conversationId, userId, { content: body, operationKey, image });
  }

  private async uploadedPhoto(storeId: string, { fileId, ...declared }: ConfirmProductPhotoInput) {
    const objectKey = photoKey(storeId, fileId);
    const stored = await this.storage.getObjectMetadata(objectKey);
    if (stored?.sizeBytes !== declared.sizeBytes || stored.contentType !== declared.contentType)
      throw messagingError('CONVERSATION_PHOTO_INVALID');
    return { objectKey, ...stored };
  }

  // A person's message to the customer: typed text, or a product card with its photo.
  async send(
    storeId: string,
    conversationId: string,
    userId: string,
    message: Pick<OutgoingChannelMessage, 'content' | 'operationKey' | 'image' | 'card'>,
  ) {
    const { extensions } = await this.stores.settings(storeId);
    if (!extensions.includes('chats')) throw messagingError('CHATS_DISABLED');
    const route = await this.repository.replyRoute(storeId, conversationId);
    if (!route) throw messagingError('CONVERSATION_NOT_FOUND');
    const { channel, contactId, connectionId } = route;
    if (channel === 'whatsapp' || !connectionId)
      throw messagingError('CONVERSATION_REPLY_UNSUPPORTED');
    const [identity] = await this.identities.findOnConnection(storeId, connectionId, [contactId]);
    if (!identity) throw messagingError('CONVERSATION_NOT_FOUND');
    // The window is 24 hours from the customer's last message; Meta's Human Agent tag gives staff
    // seven days, which the send job applies too.
    const deadline =
      route.windowExpiresAt && new Date(route.windowExpiresAt.getTime() + 6 * DAY_MS);
    const [checked] = await this.sendPolicy.checkAudience(storeId, {
      contactIds: [contactId],
      channel,
      category: 'staff_reply',
      at: this.clock.now(),
      windowClosesAtOf: new Map(deadline ? [[contactId, deadline]] : []),
    });
    if (checked?.decision.action !== 'send') throw messagingError('CONVERSATION_REPLY_BLOCKED');
    return this.messaging.queueChannelMessage(storeId, {
      channel,
      contactId,
      connectionId,
      identityId: identity.id,
      category: 'staff_reply',
      ...message,
      operationKey: `staff-reply:${conversationId}:${message.operationKey}`,
      actor: { kind: 'user', userId },
    });
  }
}
