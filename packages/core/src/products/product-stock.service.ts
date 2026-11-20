import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type { StockMovementKind } from '@dakly/contracts/products';

import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { ProductStockRepository } from './product-stock.repository';
import { productError } from './products.errors';

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
export type StockMovementInput = StockMovement | ImportedStock;
type UpdatedStock = {
  onHand: number;
  reserved: number;
  onHandDelta: number;
  reservedDelta: number;
  changedAt: Date;
};

@Injectable()
export class ProductStockService {
  constructor(
    @Inject(ProductStockRepository) private readonly repository: ProductStockRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  moveStock(storeId: string, variantId: string, input: StockMovementInput): Promise<void> {
    return this.transaction.run(storeId, async () => {
      if ('onHand' in input) return this.reconcileImportedStock(storeId, variantId, input);
      const variant = await this.repository.findStockVariant(storeId, variantId);
      if (!variant) throw productError('PRODUCT_VARIANT_NOT_FOUND');
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
        { ...change, ...updated, changedAt: now },
      );
    });
  }

  // An import reads the current tracking flag under the product lock, in product edit order.
  private async reconcileImportedStock(storeId: string, variantId: string, input: ImportedStock) {
    const variant = await this.repository.lockStockVariant(storeId, variantId);
    if (!variant) throw productError('PRODUCT_VARIANT_NOT_FOUND');
    if (!variant.isStockTracked) return;
    const now = this.clock.now();
    const stock = await this.repository.reconcileStock(storeId, variantId, input.onHand, now);
    if (!stock) throw productError('STOCK_NOT_AVAILABLE');
    if (stock.onHandDelta === 0) return;
    await this.recordStockMovement(
      storeId,
      { kind: 'import', quantity: stock.onHandDelta, reference: input.reference, variantId },
      { ...stock, reservedDelta: 0, changedAt: now },
    );
  }

  private async recordStockMovement(
    storeId: string,
    movement: StockMovement & { variantId: string },
    stock: UpdatedStock,
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
      createdAt: stock.changedAt,
    });
    await this.outbox.publish({
      type: 'stock.changed',
      storeId,
      occurredAt: stock.changedAt.toISOString(),
      payload: { variantId, kind },
    });
    const available = stock.onHand - stock.reserved;
    const before = available - stock.onHandDelta + stock.reservedDelta;
    if (before <= 0 && available > 0)
      await this.outbox.publish({
        type: 'variant.restocked',
        storeId,
        occurredAt: stock.changedAt.toISOString(),
        payload: { variantId },
      });
  }
}
