import type { AuditEntry } from '@dakly/contracts/audit';
import type { StockMovementKind } from '@dakly/contracts/products';

import type { Clock } from '../platform/clock';
import type { StoreTransaction } from '../platform/database/store-transaction';
import type { OutboxService } from '../platform/outbox/outbox.service';
import { productError } from './products.errors';
import type { ProductsRepository } from './products.repository';

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

type StockDependencies = {
  repository: ProductsRepository;
  transaction: StoreTransaction;
  clock: Clock;
  outbox: OutboxService;
};

export function moveProductStock(
  storeId: string,
  variantId: string,
  input: StockMovementInput,
  dependencies: StockDependencies,
): Promise<void> {
  const { repository, transaction, clock } = dependencies;
  return transaction.run(storeId, async () => {
    const isAbsoluteImport = 'onHand' in input;
    const variant = await repository.findStockVariant(storeId, variantId, isAbsoluteImport);
    if (!variant) throw productError('PRODUCT_VARIANT_NOT_FOUND');
    if (isAbsoluteImport)
      return reconcileImportedStock(
        storeId,
        variantId,
        { ...input, isStockTracked: variant.isStockTracked },
        dependencies,
      );
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
    const now = clock.now();
    const updated = await repository.changeStock(storeId, variantId, change, now);
    if (!updated) throw productError('STOCK_NOT_AVAILABLE');
    await recordStockMovement(
      storeId,
      { ...input, variantId },
      { ...change, ...updated, changedAt: now },
      dependencies,
    );
  });
}

async function reconcileImportedStock(
  storeId: string,
  variantId: string,
  input: ImportedStock & { isStockTracked: boolean },
  dependencies: StockDependencies,
) {
  if (!input.isStockTracked) return;
  const { repository, clock } = dependencies;
  const now = clock.now();
  const stock = await repository.reconcileStock(storeId, variantId, input.onHand, now);
  if (!stock) throw productError('STOCK_NOT_AVAILABLE');
  if (stock.onHandDelta === 0) return;
  await recordStockMovement(
    storeId,
    { kind: 'import', quantity: stock.onHandDelta, reference: input.reference, variantId },
    { ...stock, reservedDelta: 0, changedAt: now },
    dependencies,
  );
}

async function recordStockMovement(
  storeId: string,
  movement: StockMovement & { variantId: string },
  stock: UpdatedStock,
  { repository, outbox }: StockDependencies,
) {
  const { variantId, kind, quantity, reference } = movement;
  await repository.insertStockMovement(storeId, {
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
  await outbox.publish({
    type: 'stock.changed',
    storeId,
    occurredAt: stock.changedAt.toISOString(),
    payload: { variantId, kind },
  });
  const available = stock.onHand - stock.reserved;
  const before = available - stock.onHandDelta + stock.reservedDelta;
  if (before <= 0 && available > 0)
    await outbox.publish({
      type: 'variant.restocked',
      storeId,
      occurredAt: stock.changedAt.toISOString(),
      payload: { variantId },
    });
}
