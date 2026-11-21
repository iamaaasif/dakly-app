import { Inject, Injectable, Logger } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type {
  ConfirmProductPhotoInput,
  ProductPhotoUploadInput,
  ProductPhotoUploadResponse,
  ProductResponse,
  ReorderProductPhotosInput,
} from '@dakly/contracts/products';
import { MAX_PRODUCT_PHOTOS } from '@dakly/contracts/products';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { Clock } from '../platform/clock';
import { newId } from '../platform/database/new-id';
import { StoreTransaction } from '../platform/database/store-transaction';
import { FILE_STORAGE_DRIVER } from '../platform/file-storage/file-storage.provider';
import { measureVendorCall } from '../platform/logging/vendor-call-metric';
import { OutboxService } from '../platform/outbox/outbox.service';
import { ProductVariantPhotosRepository } from './product-variant-photos.repository';
import { productError } from './products.errors';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';

type Actor = AuditEntry['actor'];
type VariantIds = { productId: string; variantId: string };

// A variant's photos are optional; the product's photos stand in when it has none.
@Injectable()
export class ProductVariantPhotosService {
  private readonly logger = new Logger(ProductVariantPhotosService.name);
  constructor(
    @Inject(ProductsRepository) private readonly repository: ProductsRepository,
    @Inject(ProductVariantPhotosRepository)
    private readonly variantPhotos: ProductVariantPhotosRepository,
    @Inject(ProductsService) private readonly products: ProductsService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(FILE_STORAGE_DRIVER) private readonly storage: FileStorageDriver,
  ) {}

  async requestUpload(
    storeId: string,
    ids: VariantIds,
    input: ProductPhotoUploadInput,
  ): Promise<ProductPhotoUploadResponse> {
    const variant = await this.findVariant(storeId, ids);
    if (variant.imageFileIds.length >= MAX_PRODUCT_PHOTOS)
      throw productError('PRODUCT_VARIANT_PHOTO_LIMIT');
    const fileId = newId();
    return {
      fileId,
      uploadUrl: this.storage.createUploadUrl(`stores/${storeId}/products/${fileId}`, 300, input),
    };
  }

  async confirm(
    storeId: string,
    ids: VariantIds,
    input: ConfirmProductPhotoInput,
    actor: Actor,
  ): Promise<ProductResponse> {
    await this.findVariant(storeId, ids);
    const objectKey = `stores/${storeId}/products/${input.fileId}`;
    const metadata = await measureVendorCall(
      this.logger,
      'product_photo_metadata',
      'Product photo metadata request measured',
      () => this.storage.getObjectMetadata(objectKey),
    );
    if (
      !metadata ||
      metadata.sizeBytes !== input.sizeBytes ||
      metadata.contentType !== input.contentType
    )
      throw productError('PRODUCT_PHOTO_UPLOAD_INVALID');
    return this.transaction.runLocked(storeId, async () => {
      const variant = await this.findVariant(storeId, ids);
      if (variant.imageFileIds.length >= MAX_PRODUCT_PHOTOS)
        throw productError('PRODUCT_VARIANT_PHOTO_LIMIT');
      const now = this.clock.now();
      if (
        !(await this.repository.insertPhoto(storeId, {
          ...input,
          objectKey,
          uploadedByUserId: actor.kind === 'user' ? actor.userId : null,
          createdAt: now,
        }))
      )
        throw productError('PRODUCT_PHOTO_ALREADY_ADDED');
      await this.save(storeId, ids, [...variant.imageFileIds, input.fileId]);
      return this.products.getById(storeId, ids.productId);
    });
  }

  reorder(
    storeId: string,
    ids: VariantIds,
    input: ReorderProductPhotosInput,
  ): Promise<ProductResponse> {
    return this.transaction.runLocked(storeId, async () => {
      const variant = await this.findVariant(storeId, ids);
      if (
        input.fileIds.length !== variant.imageFileIds.length ||
        input.fileIds.some((id) => !variant.imageFileIds.includes(id))
      )
        throw productError('PRODUCT_PHOTO_ORDER_INVALID');
      await this.save(storeId, ids, input.fileIds);
      return this.products.getById(storeId, ids.productId);
    });
  }

  remove(storeId: string, ids: VariantIds, fileId: string): Promise<void> {
    return this.transaction.runLocked(storeId, async () => {
      const variant = await this.findVariant(storeId, ids);
      if (!variant.imageFileIds.includes(fileId)) throw productError('PRODUCT_PHOTO_NOT_FOUND');
      await this.save(
        storeId,
        ids,
        variant.imageFileIds.filter((id) => id !== fileId),
      );
      await this.repository.expirePhoto(storeId, fileId, this.clock.now());
    });
  }

  private async findVariant(storeId: string, { productId, variantId }: VariantIds) {
    const product = await this.repository.findById(storeId, productId);
    if (!product) throw productError('PRODUCT_NOT_FOUND');
    const variant = product.variants.find((row) => row.id === variantId);
    if (!variant) throw productError('PRODUCT_VARIANT_NOT_FOUND');
    return variant;
  }

  private async save(storeId: string, ids: VariantIds, fileIds: string[]) {
    const now = this.clock.now();
    if (!(await this.variantPhotos.update(storeId, ids, fileIds, now)))
      throw productError('PRODUCT_VARIANT_NOT_FOUND');
    await this.outbox.publish({
      type: 'product.updated',
      storeId,
      occurredAt: now.toISOString(),
      payload: { productId: ids.productId },
    });
  }
}
