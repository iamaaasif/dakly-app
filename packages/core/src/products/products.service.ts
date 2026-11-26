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
} from '@dakly/contracts/products';
import { MAX_PRODUCT_PHOTOS, productNegotiationIssue } from '@dakly/contracts/products';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { OrderProductSalesService } from '../orders/order-product-sales.service';
import { Clock } from '../platform/clock';
import { newId } from '../platform/database/new-id';
import { StoreTransaction } from '../platform/database/store-transaction';
import { FILE_STORAGE_DRIVER } from '../platform/file-storage/file-storage.provider';
import { measureVendorCall } from '../platform/logging/vendor-call-metric';
import { OutboxService } from '../platform/outbox/outbox.service';
import { StoresService } from '../stores/stores.service';
import { ProductBrandsService } from './product-brands.service';
import {
  chatProduct,
  orderCatalogueProduct,
  productResponse,
  type ChatProduct,
} from './product-catalogue-views';
import { ProductCategoriesService } from './product-categories.service';
import { ProductOrderVariantsRepository } from './product-order-variants.repository';
import { productError } from './products.errors';
import { type Product, ProductsRepository, type Variant } from './products.repository';

export type { ChatProduct };
type Actor = AuditEntry['actor'];

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
    @Inject(ProductCategoriesService) private readonly categories: ProductCategoriesService,
    @Inject(ProductBrandsService) private readonly brands: ProductBrandsService,
    @Inject(OrderProductSalesService) private readonly sales: OrderProductSalesService,
  ) {}

  create(
    storeId: string,
    input: CreateProductInput,
    _actor: Actor,
    showNegotiationPrices = false,
  ): Promise<ProductResponse> {
    return this.transaction.run(storeId, async () => {
      const { variants, ...details } = input;
      const issue = productNegotiationIssue(input);
      if (issue) throw productError(issue);
      await this.assertListsExist(storeId, details);
      const product = await this.repository.insert(storeId, details, this.clock.now());
      await this.saveVariants(storeId, product, variants, []);
      await this.publishUpdated(storeId, product.id);
      return this.getById(storeId, product.id, showNegotiationPrices);
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
      await this.assertListsExist(storeId, details);
      const [current] = await this.orderVariantRepository.lockProducts(storeId, [id]);
      if (!current) throw productError('PRODUCT_NOT_FOUND');
      const settings = { ...current, ...details };
      const currentVariants =
        variants || settings.negotiationEnabled
          ? await this.repository.findVariants(storeId, [id])
          : [];
      const issue = productNegotiationIssue({ ...settings, variants: variants ?? currentVariants });
      if (issue) throw productError(issue);
      const product = await this.repository.update(storeId, id, details, this.clock.now());
      if (!product) throw productError('PRODUCT_NOT_FOUND');
      if (variants) await this.saveVariants(storeId, product, variants, currentVariants);
      await this.publishUpdated(storeId, id);
      return this.getById(storeId, id, true);
    });
  }

  private async assertListsExist(
    storeId: string,
    { categoryId, brandId }: { categoryId?: string | null; brandId?: string | null },
  ): Promise<void> {
    if (categoryId) await this.categories.assertExists(storeId, categoryId);
    if (brandId) await this.brands.assertExists(storeId, brandId);
  }

  async getById(
    storeId: string,
    id: string,
    showNegotiationPrices = false,
  ): Promise<ProductResponse> {
    const product = await this.repository.findById(storeId, id);
    if (!product) throw productError('PRODUCT_NOT_FOUND');
    return productResponse(
      product,
      (await this.stores.settings(storeId)).stock.lowStockThreshold,
      this.storage,
      showNegotiationPrices,
    );
  }

  async list(
    storeId: string,
    query: ProductListQuery,
    showNegotiationPrices = false,
  ): Promise<ProductListResponse> {
    const { stock } = await this.stores.settings(storeId);
    const sales = query.sort === 'best_selling' ? await this.sales.recentUnits(storeId) : undefined;
    const rows = await this.repository.list(storeId, query, stock.lowStockThreshold, sales);
    const page = rows.slice(0, query.limit);
    const items = page.map((product) =>
      productResponse(product, stock.lowStockThreshold, this.storage, showNegotiationPrices),
    );
    const last = page.at(-1);
    const nextCursor = last?.rankCreatedAt
      ? `${last.unitsSold}_${last.rankCreatedAt}_${last.id}`
      : (last?.id ?? null);
    return { items, nextCursor: rows.length > query.limit ? nextCursor : null };
  }

  async listForOrders(storeId: string, query: OrderCatalogueQuery): Promise<OrderCataloguePage> {
    const { stock } = await this.stores.settings(storeId);
    const rows = await this.repository.list(storeId, query, stock.lowStockThreshold);
    const items = rows
      .slice(0, query.limit)
      .map((product) => orderCatalogueProduct(product, this.storage));
    return { items, nextCursor: rows.length > query.limit ? (items.at(-1)?.id ?? null) : null };
  }

  async getForOrder(storeId: string, id: string): Promise<OrderCatalogueProduct> {
    const product = await this.repository.findById(storeId, id);
    if (!product) throw productError('PRODUCT_NOT_FOUND');
    return orderCatalogueProduct(product, this.storage);
  }

  // Only an active product with its order link switched on; anything else looks like it does not exist.
  async getForOrderLink(storeId: string, id: string): Promise<OrderCatalogueProduct> {
    const product = await this.repository.findForOrderLink(storeId, id);
    if (!product) throw productError('PRODUCT_NOT_FOUND');
    return orderCatalogueProduct(product, this.storage);
  }

  // Keeps the order of `ids`; an id that is no longer offerable is left out.
  async getManyForChat(storeId: string, ids: string[]): Promise<ChatProduct[]> {
    if (!ids.length) return [];
    const found = new Map(
      (await this.repository.findManyForChat(storeId, ids)).map((row) => [row.id, row]),
    );
    return ids.flatMap((id) => {
      const product = found.get(id);
      return product ? [chatProduct(product, this.storage)] : [];
    });
  }

  hasChatProduct(storeId: string) {
    return this.repository.hasForChat(storeId);
  }

  countForChat(storeId: string): Promise<number> {
    return this.repository.countForChat(storeId);
  }

  // The stored file behind a photo the AI chose, only if it belongs to a product shown in chats.
  async chatPhotoFile(storeId: string, productId: string, fileId: string) {
    const product = await this.repository.findForChat(storeId, productId);
    const photos = [product?.photos, ...(product?.variants.map(({ photos }) => photos) ?? [])];
    const photo = photos.flat().find((candidate) => candidate?.id === fileId);
    return (
      photo && {
        objectKey: photo.objectKey,
        contentType: photo.contentType,
        sizeBytes: photo.sizeBytes,
      }
    );
  }

  async getForChat(storeId: string, id: string): Promise<ChatProduct> {
    const product = await this.repository.findForChat(storeId, id);
    if (!product) throw productError('PRODUCT_NOT_FOUND');
    return chatProduct(product, this.storage);
  }

  remove(storeId: string, id: string, _actor: Actor): Promise<void> {
    return this.transaction.run(storeId, async () => {
      if (!(await this.repository.archive(storeId, id, this.clock.now())))
        throw productError('PRODUCT_NOT_FOUND');
      await this.publishUpdated(storeId, id);
    });
  }

  lockNegotiationTerms(storeId: string, productIds: string[]) {
    return this.transaction.run(storeId, async () => {
      const products = await this.orderVariantRepository.lockProducts(storeId, productIds);
      const visible = products.filter(
        ({ status, isVisibleInChats }) => status === 'active' && isVisibleInChats,
      );
      if (!visible.length) return [];
      const variants = await this.repository.findVariants(
        storeId,
        visible.map(({ id }) => id),
      );
      return visible.map((product) => ({
        ...product,
        variants: variants.filter(({ productId }) => productId === product.id),
      }));
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

  async productIdsOfVariants(storeId: string, variantIds: string[]): Promise<string[]> {
    if (!variantIds.length) return [];
    const rows = await this.orderVariantRepository.productIds(storeId, variantIds);
    return rows.map(({ productId }) => productId);
  }

  async variantWeights(storeId: string, variantIds: string[]) {
    if (!variantIds.length) return new Map<string, number | null>();
    const rows = await this.orderVariantRepository.weights(storeId, variantIds);
    return new Map(rows.map(({ variantId, weightGrams }) => [variantId, weightGrams]));
  }

  async orderVariantStock(storeId: string, variantIds: string[]): Promise<OrderCatalogueStock> {
    const rows = await this.orderVariantRepository.stock(storeId, variantIds);
    return rows.map(({ variantId, onHand, reserved }) => ({
      variantId,
      available: onHand - reserved,
    }));
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
      await this.outbox.publish({
        type: 'product.photo_added',
        storeId,
        occurredAt: now.toISOString(),
        payload: { productId, fileId: input.fileId },
      });
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
      const imageFileIds = product.imageFileIds.filter((id) => id !== fileId);
      if (!(await this.repository.updatePhotos(storeId, productId, imageFileIds, now)))
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
            lowStockThreshold: null,
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
    const occurredAt = this.clock.now().toISOString();
    return this.outbox.publish({
      type: 'product.updated',
      storeId,
      occurredAt,
      payload: { productId },
    });
  }
}
