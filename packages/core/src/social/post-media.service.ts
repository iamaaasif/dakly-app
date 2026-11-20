import { Inject, Injectable, Logger } from '@nestjs/common';

import type {
  ConfirmPostPhotoInput,
  PostPhotoResponse,
  PostPhotoUploadInput,
  PostPhotoUploadResponse,
} from '@dakly/contracts/social';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { Clock } from '../platform/clock';
import { newId } from '../platform/database/new-id';
import { FILE_STORAGE_DRIVER } from '../platform/file-storage/file-storage.provider';
import { measureVendorCall } from '../platform/logging/vendor-call-metric';
import { socialError } from './social.errors';
import { SocialRepository } from './social.repository';

const objectKeyOf = (storeId: string, fileId: string) => `stores/${storeId}/post_media/${fileId}`;

@Injectable()
export class PostMediaService {
  private readonly logger = new Logger(PostMediaService.name);

  constructor(
    @Inject(SocialRepository) private readonly repository: SocialRepository,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(FILE_STORAGE_DRIVER) private readonly storage: FileStorageDriver,
  ) {}

  requestUpload(storeId: string, input: PostPhotoUploadInput): PostPhotoUploadResponse {
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
    input: ConfirmPostPhotoInput,
  ): Promise<PostPhotoResponse> {
    const objectKey = objectKeyOf(storeId, input.fileId);
    const metadata = await measureVendorCall(
      this.logger,
      'post_photo_metadata',
      'Post photo metadata request measured',
      () => this.storage.getObjectMetadata(objectKey),
    );
    if (
      !metadata ||
      metadata.sizeBytes !== input.sizeBytes ||
      metadata.contentType !== input.contentType
    )
      throw socialError('POST_MEDIA_UPLOAD_INVALID');
    const file = await this.repository.insertPostMedia(storeId, {
      ...input,
      objectKey,
      uploadedByUserId: userId,
      createdAt: this.clock.now(),
    });
    if (!file) throw socialError('POST_MEDIA_ALREADY_ADDED');
    return { id: file.id, url: this.storage.createDownloadUrl(file.objectKey, 15 * 60) };
  }
}
