import type { CreateOrderInput } from '@dakly/contracts/orders';

import type { AuditService } from '../audit/audit.service';
import type { Clock } from '../platform/clock';
import type { OfferParty, PriceOffersService } from '../price-offers/price-offers.service';
import type { ProductsService } from '../products/products.service';
import { orderItemSnapshots } from './order-item-snapshots';
import { orderError } from './orders.errors';
import type { OrderItemWrite } from './orders.repository';

export async function draftItemSnapshots(
  storeId: string,
  input: CreateOrderInput['items'],
  party: Omit<OfferParty, 'conversationId'> & { conversationId?: string },
  {
    products,
    offers,
    clock,
  }: { products: ProductsService; offers: PriceOffersService; clock: Clock },
) {
  const rows = party.conversationId
    ? await offers.forOrder(
        storeId,
        { contactId: party.contactId, conversationId: party.conversationId },
        input.map(({ variantId }) => variantId),
      )
    : [];
  const items = await orderItemSnapshots(storeId, products, input);
  applyPriceOffers(items, rows, clock.now());
  return items;
}

function applyPriceOffers(
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
