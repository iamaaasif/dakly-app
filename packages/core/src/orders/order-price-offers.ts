import type { AuditService } from '../audit/audit.service';
import type { PriceOffersService } from '../price-offers/price-offers.service';
import { orderError } from './orders.errors';
import type { OrderItemWrite } from './orders.repository';

export function applyPriceOffers(
  items: OrderItemWrite[],
  rows: Awaited<ReturnType<PriceOffersService['forOrder']>>,
  now: Date,
) {
  const byVariant = new Map(rows.map((row) => [row.variantId, row]));
  for (const item of items) {
    const offer = byVariant.get(item.variantId);
    if (!offer || offer.expiresAt <= now || offer.pricePoisha !== item.unitPricePoisha) continue;
    const discount =
      BigInt(item.unitPricePoisha - offer.offeredPricePoisha) * BigInt(item.quantity);
    if (discount > Number.MAX_SAFE_INTEGER) throw orderError('ORDER_TOTAL_INVALID');
    item.lineDiscountPoisha = Number(discount);
  }
}

export async function recordPriceOffer(
  storeId: string,
  orderId: string,
  items: OrderItemWrite[],
  audit: AuditService,
) {
  if (!items.some(({ lineDiscountPoisha }) => (lineDiscountPoisha ?? 0) > 0)) return;
  await audit.record(storeId, {
    action: 'order.ai_price_offer',
    entityType: 'order',
    entityId: orderId,
    actor: { kind: 'system' },
    reason: 'AI price offer',
    after: { changedFields: ['lineDiscountPoisha'] },
  });
}
