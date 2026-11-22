import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import {
  BULK_EDIT_UNDO_HOURS,
  type ApplyProductBulkEditInput,
  type BulkEditField,
  type ProductBulkEditChange,
  type ProductBulkEditListResponse,
  type ProductBulkEditResponse,
  type ProductBulkEditUndoResponse,
} from '@dakly/contracts/product-bulk-edits';

import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { OutboxService } from '../platform/outbox/outbox.service';
import {
  ProductBulkEditsRepository,
  type BulkEditProduct,
  type BulkEditRecord,
  type ProductFieldChange,
} from './product-bulk-edits.repository';
import { ProductStockService } from './product-stock.service';
import { productError } from './products.errors';

type Actor = AuditEntry['actor'];
type WriteContext = {
  direction: 'apply' | 'undo';
  actor: Extract<Actor, { kind: 'user' }>;
  now: Date;
  reason: string;
};
const productFields = ['pricePoisha', 'compareAtPricePoisha', 'category', 'status'] as const;

@Injectable()
export class ProductBulkEditsService {
  constructor(
    @Inject(ProductBulkEditsRepository) private readonly repository: ProductBulkEditsRepository,
    @Inject(ProductStockService) private readonly stock: ProductStockService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  apply(
    storeId: string,
    input: ApplyProductBulkEditInput,
    actor: Extract<Actor, { kind: 'user' }>,
  ): Promise<ProductBulkEditResponse> {
    return this.transaction.run(storeId, async () => {
      const current = await this.repository.lockProducts(
        storeId,
        input.rows.map((row) => row.productId),
      );
      const byId = new Map(current.map((product) => [product.id, product]));
      const changes = input.rows.flatMap((row) => {
        const product = byId.get(row.productId);
        if (!product) throw productError('PRODUCT_BULK_EDIT_ROW_INVALID');
        return changesForRow(product, row);
      });
      if (!changes.length) throw productError('PRODUCT_BULK_EDIT_NO_CHANGE');

      const now = this.clock.now();
      await this.write(storeId, changes, {
        direction: 'apply',
        actor,
        now,
        reason: input.stockReason ?? '',
      });
      const record = await this.repository.insertRecord(storeId, {
        actorUserId: actor.userId,
        changes,
        stockReason: input.stockReason ?? null,
        createdAt: now,
        undoUntil: new Date(now.getTime() + BULK_EDIT_UNDO_HOURS * 3_600_000),
      });
      await this.publishUpdated(storeId, changes, now);
      return toResponse(record);
    });
  }

  async listUndoable(storeId: string): Promise<ProductBulkEditListResponse> {
    const records = await this.repository.listUndoable(storeId, this.clock.now());
    return { items: records.map(toResponse) };
  }

  // A value changed after the bulk edit (by hand or another edit) is left alone. Stock is
  // corrected by the opposite movement, so orders placed since keep their effect.
  undo(
    storeId: string,
    id: string,
    actor: Extract<Actor, { kind: 'user' }>,
  ): Promise<ProductBulkEditUndoResponse> {
    return this.transaction.run(storeId, async () => {
      const record = await this.repository.lockRecord(storeId, id);
      const now = this.clock.now();
      if (!record) throw productError('PRODUCT_BULK_EDIT_NOT_FOUND');
      if (record.undoneAt) throw productError('PRODUCT_BULK_EDIT_ALREADY_UNDONE');
      if (record.undoUntil <= now) throw productError('PRODUCT_BULK_EDIT_UNDO_EXPIRED');

      const current = await this.repository.lockProducts(storeId, [
        ...new Set(record.changes.map((change) => change.productId)),
      ]);
      const byId = new Map(current.map((product) => [product.id, product]));
      const restore: ProductBulkEditChange[] = [];
      let skipped = 0;
      for (const change of record.changes) {
        const product = byId.get(change.productId);
        if (product && isStillApplied(product, change)) restore.push(change);
        else skipped += 1;
      }
      const stockSkipped = await this.write(storeId, restore, {
        direction: 'undo',
        actor,
        now,
        reason: `Undo of bulk edit${record.stockReason ? `: ${record.stockReason}` : ''}`,
      });
      await this.repository.markUndone(storeId, id, now);
      await this.publishUpdated(storeId, restore, now);
      return { restored: restore.length - stockSkipped, skipped: skipped + stockSkipped };
    });
  }

  // Apply writes each change's new value; undo writes the old one. Returns the stock rows that
  // could not be corrected because the stock is reserved by now.
  private async write(storeId: string, changes: ProductBulkEditChange[], context: WriteContext) {
    let stockSkipped = 0;
    for (const [productId, own] of groupByProduct(changes)) {
      const side = context.direction === 'apply' ? 'after' : 'before';
      await this.repository.updateProduct(
        storeId,
        productId,
        productFieldChange(own, side),
        context.now,
      );
      for (const change of own)
        if (await this.writeVariantChange(storeId, change, context)) stockSkipped += 1;
    }
    return stockSkipped;
  }

  private async writeVariantChange(
    storeId: string,
    change: ProductBulkEditChange,
    context: WriteContext,
  ): Promise<boolean> {
    const { variantId } = change;
    if (!variantId) return false;
    const applying = context.direction === 'apply';
    if (change.field === 'costPoisha') {
      const cost = (applying ? change.after : change.before) as number | null;
      await this.repository.updateVariantCost(storeId, variantId, cost, context.now);
      return false;
    }
    if (change.field !== 'stock') return false;
    const difference = (change.after as number) - (change.before as number);
    try {
      await this.stock.moveStock(storeId, variantId, {
        kind: 'adjust',
        quantity: applying ? difference : -difference,
        reference: { actor: context.actor, reason: context.reason },
      });
    } catch (error) {
      if (applying || !(error instanceof AppError) || error.code !== 'STOCK_NOT_AVAILABLE')
        throw error;
      return true;
    }
    return false;
  }

  private async publishUpdated(storeId: string, changes: ProductBulkEditChange[], now: Date) {
    for (const productId of new Set(changes.map((change) => change.productId)))
      await this.outbox.publish({
        type: 'product.updated',
        storeId,
        occurredAt: now.toISOString(),
        payload: { productId },
      });
  }
}

function changesForRow(
  product: BulkEditProduct,
  row: ApplyProductBulkEditInput['rows'][number],
): ProductBulkEditChange[] {
  const [variant] = product.variants;
  assertRowAllowed(product, row);
  const candidates: [
    BulkEditField,
    string | null,
    number | string | null,
    number | string | undefined,
  ][] = [
    ['pricePoisha', null, product.pricePoisha, row.pricePoisha],
    ['compareAtPricePoisha', null, product.compareAtPricePoisha, row.compareAtPricePoisha],
    ['category', null, product.category, row.category],
    ['status', null, product.status, row.status],
    ['costPoisha', variant?.id ?? null, variant?.costPoisha ?? null, row.costPoisha],
    ['stock', variant?.id ?? null, variant?.onHand ?? null, row.stock],
  ];
  return candidates.flatMap(([field, variantId, before, after]) =>
    after !== undefined && after !== before
      ? [{ productId: product.id, variantId, field, before, after }]
      : [],
  );
}

// Cost and stock belong to a size, so only a product with one size takes them here.
function assertRowAllowed(
  product: BulkEditProduct,
  row: ApplyProductBulkEditInput['rows'][number],
) {
  const needsVariant = row.costPoisha !== undefined || row.stock !== undefined;
  const hasOneSize = product.variants.length === 1;
  const stockBlocked = row.stock !== undefined && !product.isStockTracked;
  // A size with its own price hides the product price from customers, so editing it would mislead.
  const priceHidden =
    row.pricePoisha !== undefined &&
    product.variants.some((variant) => variant.priceOverridePoisha !== null);
  if ((needsVariant && (!hasOneSize || stockBlocked)) || priceHidden)
    throw productError('PRODUCT_BULK_EDIT_ROW_INVALID');
}

function isStillApplied(product: BulkEditProduct, change: ProductBulkEditChange): boolean {
  // Stock is not compared: the opposite movement is correct whatever happened since.
  if (change.field === 'stock') return product.variants.some((v) => v.id === change.variantId);
  if (change.field === 'costPoisha')
    return product.variants.some((v) => v.id === change.variantId && v.costPoisha === change.after);
  return product[change.field] === change.after;
}

function groupByProduct(changes: ProductBulkEditChange[]) {
  const groups = new Map<string, ProductBulkEditChange[]>();
  for (const change of changes)
    groups.set(change.productId, [...(groups.get(change.productId) ?? []), change]);
  return groups;
}

function productFieldChange(changes: ProductBulkEditChange[], side: 'before' | 'after') {
  const result: Record<string, number | string | null> = {};
  for (const change of changes)
    if ((productFields as readonly string[]).includes(change.field))
      result[change.field] = change[side];
  return result as ProductFieldChange;
}

function toResponse(record: BulkEditRecord): ProductBulkEditResponse {
  return {
    id: record.id,
    changedProducts: new Set(record.changes.map((change) => change.productId)).size,
    changedValues: record.changes.length,
    createdAt: record.createdAt.toISOString(),
    undoUntil: record.undoUntil.toISOString(),
  };
}
