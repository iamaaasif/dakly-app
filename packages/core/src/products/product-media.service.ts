import { Inject, Injectable, Logger } from '@nestjs/common';

import type {
  ConfirmProductPhotoInput,
  ProductPhotoResponse,
  ProductPhotoUploadInput,
  ProductPhotoUploadResponse,
} from '@dakly/contracts/products';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { Clock } from '../platform/clock';
import { newId } from '../platform/database/new-id';
import { FILE_STORAGE_DRIVER } from '../platform/file-storage/file-storage.provider';
import { measureVendorCall } from '../platform/logging/vendor-call-metric';
import { OutboxService } from '../platform/outbox/outbox.service';
import { ProductMediaRepository } from './product-media.repository';
import { productError } from './products.errors';
import { ProductsRepository } from './products.repository';

// A photo uploaded before its product exists. The nightly file purge deletes it once this
// expiry passes; creating the product clears the expiry.
const UNATTACHED_PHOTO_HOURS = 24;
const MAX_UNATTACHED_PHOTOS = 50;

@Injectable()
export class ProductMediaService {
  private readonly logger = new Logger(ProductMediaService.name);

  constructor(
    @Inject(ProductsRepository) private readonly repository: ProductsRepository,
    @Inject(ProductMediaRepository) private readonly pending: ProductMediaRepository,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(FILE_STORAGE_DRIVER) private readonly storage: FileStorageDriver,
  ) {}

  async requestUpload(
    storeId: string,
    input: ProductPhotoUploadInput,
  ): Promise<ProductPhotoUploadResponse> {
    await this.assertRoomForPhoto(storeId);
    const fileId = newId();
    return {
      fileId,
      uploadUrl: this.storage.createUploadUrl(`stores/${storeId}/products/${fileId}`, 300, input),
    };
  }

  async confirm(
    storeId: string,
    userId: string,
    input: ConfirmProductPhotoInput,
  ): Promise<ProductPhotoResponse> {
    await this.assertRoomForPhoto(storeId);
    const objectKey = `stores/${storeId}/products/${input.fileId}`;
    const metadata = await measureVendorCall(
      this.logger,
      'product_media_metadata',
      'Product media metadata request measured',
      () => this.storage.getObjectMetadata(objectKey),
    );
    if (
      !metadata ||
      metadata.sizeBytes !== input.sizeBytes ||
      metadata.contentType !== input.contentType
    )
      throw productError('PRODUCT_PHOTO_UPLOAD_INVALID');
    const now = this.clock.now();
    const added = await this.repository.insertPhoto(storeId, {
      ...input,
      objectKey,
      uploadedByUserId: userId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + UNATTACHED_PHOTO_HOURS * 3_600_000),
    });
    if (!added) throw productError('PRODUCT_PHOTO_ALREADY_ADDED');
    return { id: input.fileId, url: this.storage.createDownloadUrl(objectKey, 15 * 60) };
  }

  // Runs inside the create transaction, so a missing or already used photo cancels the product.
  async attach(storeId: string, productId: string, fileIds: string[]): Promise<void> {
    if (fileIds.length === 0) return;
    const now = this.clock.now();
    if ((await this.pending.attachPendingPhotos(storeId, fileIds, now)) !== fileIds.length)
      throw productError('PRODUCT_PHOTO_NOT_FOUND');
    for (const fileId of fileIds)
      await this.outbox.publish({
        type: 'product.photo_added',
        storeId,
        occurredAt: now.toISOString(),
        payload: { productId, fileId },
      });
  }

  private async assertRoomForPhoto(storeId: string): Promise<void> {
    if ((await this.pending.countPendingPhotos(storeId, this.clock.now())) >= MAX_UNATTACHED_PHOTOS)
      throw productError('PRODUCT_MEDIA_PENDING_LIMIT');
  }
}
