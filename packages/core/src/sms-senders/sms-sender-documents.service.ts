import { Inject, Injectable, Logger } from '@nestjs/common';

import type {
  ConfirmSmsSenderDocumentInput,
  SmsSenderDocumentUploadInput,
  SmsSenderDocumentUploadResponse,
} from '@dakly/contracts/sms-senders';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { Clock } from '../platform/clock';
import { newId } from '../platform/database/new-id';
import { FILE_STORAGE_DRIVER } from '../platform/file-storage/file-storage.provider';
import { measureVendorCall } from '../platform/logging/vendor-call-metric';
import { smsSenderError } from './sms-senders.errors';
import { SmsSendersRepository } from './sms-senders.repository';

const objectKeyOf = (storeId: string, fileId: string) =>
  `stores/${storeId}/sms_sender_document/${fileId}`;
// A document nobody attaches to a request is purged after a day.
const UNATTACHED_LIFETIME_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SmsSenderDocumentsService {
  private readonly logger = new Logger(SmsSenderDocumentsService.name);

  constructor(
    @Inject(SmsSendersRepository) private readonly repository: SmsSendersRepository,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(FILE_STORAGE_DRIVER) private readonly storage: FileStorageDriver,
  ) {}

  requestUpload(
    storeId: string,
    input: SmsSenderDocumentUploadInput,
  ): SmsSenderDocumentUploadResponse {
    const fileId = newId();
    return {
      fileId,
      uploadUrl: this.storage.createUploadUrl(objectKeyOf(storeId, fileId), 300, input),
    };
  }

  // The file row is written only after the stored object matches what the browser said it sent.
  async confirm(
    storeId: string,
    userId: string,
    input: ConfirmSmsSenderDocumentInput,
  ): Promise<{ id: string }> {
    const objectKey = objectKeyOf(storeId, input.fileId);
    const metadata = await measureVendorCall(
      this.logger,
      'sms_sender_document_metadata',
      'SMS sender document metadata request measured',
      () => this.storage.getObjectMetadata(objectKey),
    );
    if (
      !metadata ||
      metadata.sizeBytes !== input.sizeBytes ||
      metadata.contentType !== input.contentType
    )
      throw smsSenderError('SMS_SENDER_DOCUMENT_INVALID');
    const stored = await this.repository.insertDocument(storeId, {
      id: input.fileId,
      objectKey,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      uploadedByUserId: userId,
      expiresAt: new Date(this.clock.now().getTime() + UNATTACHED_LIFETIME_MS),
    });
    if (!stored) throw smsSenderError('SMS_SENDER_DOCUMENT_INVALID');
    return { id: input.fileId };
  }
}
