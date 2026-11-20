import type { AuditEntry } from '@dakly/contracts/audit';

import type { ProductStockService } from '../products/product-stock.service';
import type { OrderItemWrite } from './orders.repository';

export async function moveOrderReservations(
  storeId: string,
  stock: ProductStockService,
  { orderId, actor, reason }: { orderId: string; actor: AuditEntry['actor']; reason?: string },
  { before, after }: { before: OrderItemWrite[]; after: OrderItemWrite[] },
): Promise<void> {
  const deltas = new Map<string, number>();
  for (const item of before)
    if (item.isStockTracked)
      deltas.set(item.variantId, (deltas.get(item.variantId) ?? 0) - item.quantity);
  for (const item of after)
    if (item.isStockTracked)
      deltas.set(item.variantId, (deltas.get(item.variantId) ?? 0) + item.quantity);
  for (const [variantId, delta] of [...deltas].sort(([a], [b]) => a.localeCompare(b))) {
    if (delta === 0) continue;
    await stock.moveStock(storeId, variantId, {
      kind: delta > 0 ? 'reserve' : 'release',
      quantity: Math.abs(delta),
      reference: { orderId, actor, reason },
    });
  }
}
