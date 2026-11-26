import type { AuditService } from '../audit/audit.service';
import type { OfferParty, PriceOffersService } from '../price-offers/price-offers.service';
import { orderError } from './orders.errors';
import type { OrderItemWrite } from './orders.repository';

export async function applyPriceOffers(
  storeId: string,
  party: Omit<OfferParty, 'conversationId'> & { conversationId: string | undefined },
  items: OrderItemWrite[],
  offers: PriceOffersService,
) {
  if (!party.conversationId) return;
  const rows = await offers.forOrder(
    storeId,
    { ...party, conversationId: party.conversationId },
    items.map(({ variantId }) => variantId),
  );
  const byVariant = new Map(rows.map((row) => [row.variantId, row]));
  for (const item of items) {
    const offer = byVariant.get(item.variantId);
    if (!offer || offer.pricePoisha !== item.unitPricePoisha) continue;
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
