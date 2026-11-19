import { Inject, Injectable, Logger } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type {
  OrderCataloguePage,
  OrderCatalogueProduct,
  OrderCatalogueQuery,
  OrderCatalogueStock,
} from '@dakly/contracts/orders';
import type {
  CreateProductInput,
  ChangeProductInput,
  ProductListQuery,
  ProductListResponse,
  ProductResponse,
  ProductPhotoUploadInput,
  ProductPhotoUploadResponse,
  ConfirmProductPhotoInput,
  ReorderProductPhotosInput,
  ProductReadiness,
  StockMovementKind,
} from '@dakly/contracts/products';
import { MAX_PRODUCT_PHOTOS } from '@dakly/contracts/products';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { Clock } from '../platform/clock';
import { newId } from '../platform/database/new-id';
import { StoreTransaction } from '../platform/database/store-transaction';
import { FILE_STORAGE_DRIVER } from '../platform/file-storage/file-storage.provider';
import { measureVendorCall } from '../platform/logging/vendor-call-metric';
import { OutboxService } from '../platform/outbox/outbox.service';
import { StoresService } from '../stores/stores.service';
import { ProductOrderVariantsRepository } from './product-order-variants.repository';
import { productError } from './products.errors';
import {
  type CatalogueProduct,
  type Product,
  ProductsRepository,
  type Variant,
} from './products.repository';

type Actor = AuditEntry['actor'];
type StockReference = { actor: Actor } & (
  { orderId: string; reason?: string } | { reason: string; orderId?: string }
);

type StockMovement = { kind: StockMovementKind; quantity: number; reference: StockReference };
type ImportedStock = {
  kind: 'import';
  onHand: number;
  reference: { actor: Actor; reason: string };
};
type StockMovementInput = StockMovement | ImportedStock;
type UpdatedStock = {
  onHand: number;
  reserved: number;
  onHandDelta: number;
  reservedDelta: number;
};

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);
  constructor(
    @Inject(ProductsRepository) private readonly repository: ProductsRepository,
    @Inject(ProductOrderVariantsRepository)
    private readonly orderVariantRepository: ProductOrderVariantsRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(FILE_STORAGE_DRIVER) private readonly storage: FileStorageDriver,
  ) {}

  create(storeId: string, input: CreateProductInput, _actor: Actor): Promise<ProductResponse> {
    return this.transaction.run(storeId, async () => {
      const { variants, ...details } = input;
      const product = await this.repository.insert(storeId, details, this.clock.now());
      await this.saveVariants(storeId, product, variants, []);
      await this.publishUpdated(storeId, product.id);
      return this.getById(storeId, product.id);
    });
  }

  edit(
    storeId: string,
    id: string,
    input: ChangeProductInput,
    _actor: Actor,
  ): Promise<ProductResponse> {
    return this.transaction.run(storeId, async () => {
      const { variants, ...details } = input;
      const product = await this.repository.update(storeId, id, details, this.clock.now());
      if (!product) throw productError('PRODUCT_NOT_FOUND');
      if (variants) {
        const current = await this.repository.findVariants(storeId, [id]);
        await this.saveVariants(storeId, product, variants, current);
      }
      await this.publishUpdated(storeId, id);
      return this.getById(storeId, id);
    });
  }

  async getById(storeId: string, id: string): Promise<ProductResponse> {
    const product = await this.repository.findById(storeId, id);
    if (!product) throw productError('PRODUCT_NOT_FOUND');
    return toResponse(
      product,
      product.variants,
      (await this.stores.settings(storeId)).stock.lowStockThreshold,
      this.storage,
    );
  }

  async list(storeId: string, query: ProductListQuery): Promise<ProductListResponse> {
    const { stock } = await this.stores.settings(storeId);
    const rows = await this.repository.list(storeId, query, stock.lowStockThreshold);
    const page = rows.slice(0, query.limit);
    const items = page.map((product) =>
      toResponse(product, product.variants, stock.lowStockThreshold, this.storage),
    );
    return { items, nextCursor: rows.length > query.limit ? items.at(-1)!.id : null };
  }

  async listForOrders(storeId: string, query: OrderCatalogueQuery): Promise<OrderCataloguePage> {
    const { stock } = await this.stores.settings(storeId);
    const rows = await this.repository.list(storeId, query, stock.lowStockThreshold);
    const items = rows.slice(0, query.limit).map(orderCatalogueProduct);
    return { items, nextCursor: rows.length > query.limit ? (items.at(-1)?.id ?? null) : null };
  }

  async getForOrder(storeId: string, id: string): Promise<OrderCatalogueProduct> {
    const product = await this.repository.findById(storeId, id);
    if (!product) throw productError('PRODUCT_NOT_FOUND');
    return orderCatalogueProduct(product);
  }

  remove(storeId: string, id: string, _actor: Actor): Promise<void> {
    return this.transaction.run(storeId, async () => {
      if (!(await this.repository.archive(storeId, id, this.clock.now())))
        throw productError('PRODUCT_NOT_FOUND');
      await this.publishUpdated(storeId, id);
    });
  }

  async lockArchiveVariants(storeId: string, productId: string): Promise<string[]> {
    const ids = await this.orderVariantRepository.lockArchiveVariants(storeId, productId);
    if (!ids) throw productError('PRODUCT_NOT_FOUND');
    return ids;
  }

  orderVariants(storeId: string, variantIds: string[], existingIds: string[]) {
    return this.transaction.run(storeId, async () => {
      await this.orderVariantRepository.lockVariants(storeId, [...variantIds, ...existingIds]);
      if (!variantIds.length) return [];
      const variants = await this.orderVariantRepository.orderVariants(storeId, variantIds);
      if (variants.length !== variantIds.length) throw productError('PRODUCT_VARIANT_NOT_FOUND');
      return variants;
    });
  }

  async orderVariantStock(storeId: string, variantIds: string[]): Promise<OrderCatalogueStock> {
    const rows = await this.orderVariantRepository.stock(storeId, variantIds);
    return rows.map(({ variantId, onHand, reserved }) => ({
      variantId,
      available: onHand - reserved,
    }));
  }

  moveStock(storeId: string, variantId: string, input: StockMovementInput): Promise<void> {
    return this.transaction.run(storeId, async () => {
      const isAbsoluteImport = 'onHand' in input;
      const variant = await this.repository.findStockVariant(storeId, variantId, isAbsoluteImport);
      if (!variant) throw productError('PRODUCT_VARIANT_NOT_FOUND');
      if (isAbsoluteImport) {
        if (!variant.isStockTracked) return;
        return this.reconcileImportedStock(storeId, variantId, input);
      }
      // Order movements follow the tracking flag saved on the order item.
      if (!variant.isStockTracked && !input.reference.orderId) return;
      const { kind, quantity } = input;
      if (quantity === 0 || (quantity < 0 && kind !== 'adjust' && kind !== 'import'))
        throw productError('STOCK_QUANTITY_INVALID');
      const change = {
        reserve: { onHandDelta: 0, reservedDelta: quantity },
        release: { onHandDelta: 0, reservedDelta: -quantity },
        ship: { onHandDelta: -quantity, reservedDelta: -quantity },
        return: { onHandDelta: quantity, reservedDelta: 0 },
        adjust: { onHandDelta: quantity, reservedDelta: 0 },
        import: { onHandDelta: quantity, reservedDelta: 0 },
      }[kind];
      const now = this.clock.now();
      const updated = await this.repository.changeStock(storeId, variantId, change, now);
      if (!updated) throw productError('STOCK_NOT_AVAILABLE');
      await this.recordStockMovement(
        storeId,
        { ...input, variantId },
        { ...change, ...updated },
        now,
      );
    });
  }

  private async reconcileImportedStock(storeId: string, variantId: string, input: ImportedStock) {
    const now = this.clock.now();
    const stock = await this.repository.reconcileStock(storeId, variantId, input.onHand, now);
    if (!stock) throw productError('STOCK_NOT_AVAILABLE');
    if (stock.onHandDelta === 0) return;
    await this.recordStockMovement(
      storeId,
      { kind: 'import', quantity: stock.onHandDelta, reference: input.reference, variantId },
      { ...stock, reservedDelta: 0 },
      now,
    );
  }

  private async recordStockMovement(
    storeId: string,
    movement: StockMovement & { variantId: string },
    stock: UpdatedStock,
    now: Date,
  ) {
    const { variantId, kind, quantity, reference } = movement;
    await this.repository.insertStockMovement(storeId, {
      variantId,
      kind,
      quantity: stock.onHandDelta || quantity,
      onHandAfter: stock.onHand,
      reservedAfter: stock.reserved,
      orderId: reference.orderId ?? null,
      reason: reference.reason ?? null,
      actorUserId: reference.actor.kind === 'user' ? reference.actor.userId : null,
      createdAt: now,
    });
    await this.outbox.publish({
      type: 'stock.changed',
      storeId,
      occurredAt: now.toISOString(),
      payload: { variantId, kind },
    });
    const available = stock.onHand - stock.reserved;
    const before = available - stock.onHandDelta + stock.reservedDelta;
    if (before <= 0 && available > 0)
      await this.outbox.publish({
        type: 'variant.restocked',
        storeId,
        occurredAt: now.toISOString(),
        payload: { variantId },
      });
  }

  async requestPhotoUpload(
    storeId: string,
    productId: string,
    input: ProductPhotoUploadInput,
  ): Promise<ProductPhotoUploadResponse> {
    const product = await this.repository.findById(storeId, productId);
    if (!product) throw productError('PRODUCT_NOT_FOUND');
    if (product.imageFileIds.length >= MAX_PRODUCT_PHOTOS)
      throw productError('PRODUCT_PHOTO_LIMIT');
    const fileId = newId();
    return {
      fileId,
      uploadUrl: this.storage.createUploadUrl(`stores/${storeId}/products/${fileId}`, 300, input),
    };
  }

  async confirmPhoto(
    storeId: string,
    productId: string,
    input: ConfirmProductPhotoInput,
    actor: Actor,
  ): Promise<ProductResponse> {
    if (!(await this.repository.findById(storeId, productId)))
      throw productError('PRODUCT_NOT_FOUND');
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
      const product = await this.repository.findById(storeId, productId);
      if (!product) throw productError('PRODUCT_NOT_FOUND');
      if (product.imageFileIds.length >= MAX_PRODUCT_PHOTOS)
        throw productError('PRODUCT_PHOTO_LIMIT');
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
      if (
        !(await this.repository.updatePhotos(
          storeId,
          productId,
          [...product.imageFileIds, input.fileId],
          now,
        ))
      )
        throw productError('PRODUCT_NOT_FOUND');
      await this.publishUpdated(storeId, productId);
      return this.getById(storeId, productId);
    });
  }

  reorderPhotos(
    storeId: string,
    productId: string,
    input: ReorderProductPhotosInput,
    _actor: Actor,
  ): Promise<ProductResponse> {
    return this.transaction.runLocked(storeId, async () => {
      const product = await this.repository.findById(storeId, productId);
      if (!product) throw productError('PRODUCT_NOT_FOUND');
      if (
        input.fileIds.length !== product.imageFileIds.length ||
        input.fileIds.some((id) => !product.imageFileIds.includes(id))
      )
        throw productError('PRODUCT_PHOTO_ORDER_INVALID');
      if (
        !(await this.repository.updatePhotos(storeId, productId, input.fileIds, this.clock.now()))
      )
        throw productError('PRODUCT_NOT_FOUND');
      await this.publishUpdated(storeId, productId);
      return this.getById(storeId, productId);
    });
  }

  removePhoto(storeId: string, productId: string, fileId: string, _actor: Actor): Promise<void> {
    return this.transaction.runLocked(storeId, async () => {
      const product = await this.repository.findById(storeId, productId);
      if (!product) throw productError('PRODUCT_NOT_FOUND');
      if (!product.imageFileIds.includes(fileId)) throw productError('PRODUCT_PHOTO_NOT_FOUND');
      const now = this.clock.now();
      if (
        !(await this.repository.updatePhotos(
          storeId,
          productId,
          product.imageFileIds.filter((id) => id !== fileId),
          now,
        ))
      )
        throw productError('PRODUCT_NOT_FOUND');
      await this.repository.expirePhoto(storeId, fileId, now);
      await this.publishUpdated(storeId, productId);
    });
  }

  private async saveVariants(
    storeId: string,
    product: Product,
    input: NonNullable<ChangeProductInput['variants']>,
    current: Variant[],
  ) {
    const variants = input.length
      ? input
      : [
          {
            id: current.find((variant) => variant.isDefault)?.id,
            optionValues: {},
            sku: null,
            priceOverridePoisha: null,
            costPoisha: null,
          },
        ];
    if (variants.some((variant) => variant.id && !current.some((row) => row.id === variant.id)))
      throw productError('PRODUCT_VARIANT_NOT_FOUND');
    const saved = await this.repository.saveVariants(
      storeId,
      product.id,
      variants.map((variant, position) => ({
        ...variant,
        position,
        isDefault: product.options.length === 0,
        title: product.options.length
          ? product.options.map((option) => variant.optionValues[option.name]).join(' / ')
          : 'Default',
      })),
      this.clock.now(),
    );
    if (!saved) throw productError('PRODUCT_SKU_TAKEN');
  }

  private publishUpdated(storeId: string, productId: string) {
    return this.outbox.publish({
      type: 'product.updated',
      storeId,
      occurredAt: this.clock.now().toISOString(),
      payload: { productId },
    });
  }
}

function orderCatalogueProduct(product: CatalogueProduct): OrderCatalogueProduct {
  return {
    id: product.id,
    name: product.name,
    isStockTracked: product.isStockTracked,
    variants: product.variants.map((variant) => ({
      id: variant.id,
      title: variant.title,
      isDefault: variant.isDefault,
      pricePoisha: variant.priceOverridePoisha ?? product.pricePoisha,
      available: variant.onHand - variant.reserved,
    })),
  };
}

function toResponse(
  product: CatalogueProduct,
  rows: Variant[],
  lowStockThreshold: number,
  storage: FileStorageDriver,
): ProductResponse {
  const variants = rows.map(({ productId: _productId, ...variant }) => ({
    ...variant,
    pricePoisha: variant.priceOverridePoisha ?? product.pricePoisha,
    available: variant.onHand - variant.reserved,
  }));
  const readiness: ProductReadiness[] = [];
  if (variants.some((variant) => variant.pricePoisha === 0)) readiness.push('needs_price');
  if (!product.imageFileIds.length) readiness.push('needs_photo');
  if (product.status === 'hidden') readiness.push('hidden');
  if (product.isStockTracked && variants.some((variant) => variant.available <= lowStockThreshold))
    readiness.push('running_low');
  return {
    ...product,
    status: product.status,
    photos: product.photos.map((photo) => ({
      id: photo.id,
      url: storage.createDownloadUrl(photo.objectKey, 15 * 60),
    })),
    variants,
    readiness,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}
