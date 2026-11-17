import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type {
  CreateProductInput,
  ChangeProductInput,
  ProductListQuery,
  ProductListResponse,
  ProductResponse,
  ProductReadiness,
  StockMovementKind,
} from '@dakly/contracts/products';

import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { StoresService } from '../stores/stores.service';
import { productError } from './products.errors';
import { type Product, ProductsRepository, type Variant } from './products.repository';

type Actor = AuditEntry['actor'];
type StockReference = { actor: Actor } & (
  { orderId: string; reason?: string } | { reason: string; orderId?: string }
);

type StockMovementInput = { kind: StockMovementKind; quantity: number; reference: StockReference };
type UpdatedStock = {
  onHand: number;
  reserved: number;
  onHandDelta: number;
  reservedDelta: number;
};

@Injectable()
export class ProductsService {
  constructor(
    @Inject(ProductsRepository) private readonly repository: ProductsRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(StoresService) private readonly stores: StoresService,
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
    );
  }

  async list(storeId: string, query: ProductListQuery): Promise<ProductListResponse> {
    const { stock } = await this.stores.settings(storeId);
    const rows = await this.repository.list(storeId, query, stock.lowStockThreshold);
    const page = rows.slice(0, query.limit);
    const items = page.map((product) =>
      toResponse(product, product.variants, stock.lowStockThreshold),
    );
    return { items, nextCursor: rows.length > query.limit ? items.at(-1)!.id : null };
  }

  remove(storeId: string, id: string, _actor: Actor): Promise<void> {
    return this.transaction.run(storeId, async () => {
      if (!(await this.repository.archive(storeId, id, this.clock.now())))
        throw productError('PRODUCT_NOT_FOUND');
      await this.publishUpdated(storeId, id);
    });
  }

  moveStock(storeId: string, variantId: string, input: StockMovementInput): Promise<void> {
    return this.transaction.run(storeId, async () => {
      const variant = await this.repository.findStockVariant(storeId, variantId);
      if (!variant) throw productError('PRODUCT_VARIANT_NOT_FOUND');
      if (!variant.isStockTracked) return;
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

  private async recordStockMovement(
    storeId: string,
    movement: StockMovementInput & { variantId: string },
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

function toResponse(product: Product, rows: Variant[], lowStockThreshold: number): ProductResponse {
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
    variants,
    readiness,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}
