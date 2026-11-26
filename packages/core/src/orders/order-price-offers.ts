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

type LiveOffers = Awaited<ReturnType<PriceOffersService['forOrder']>>;

export function offerChanges(
  previous: OrderItemWrite[],
  rows: LiveOffers,
  now: Date,
  discountRoomPoisha: number,
): CreateOrderInput['items'] | undefined {
  const byVariant = new Map(rows.map((row) => [row.variantId, row]));
  let extraDiscount = 0;
  const items = previous.map((item) => {
    const offer = byVariant.get(item.variantId);
    const applied =
      offer && offer.expiresAt > now ? lineDiscount(item, offer.offeredPricePoisha) : 0;
    const saved = item.lineDiscountPoisha ?? 0;
    const lineDiscountPoisha = Math.max(saved, applied);
    extraDiscount += lineDiscountPoisha - saved;
    return {
      variantId: item.variantId,
      quantity: item.quantity,
      lineDiscountPoisha,
    };
  });
  return extraDiscount > 0 && extraDiscount <= discountRoomPoisha ? items : undefined;
}

function applyPriceOffers(items: OrderItemWrite[], rows: LiveOffers, now: Date) {
  const byVariant = new Map(rows.map((row) => [row.variantId, row]));
  for (const item of items) {
    const offer = byVariant.get(item.variantId);
    if (!offer || offer.expiresAt <= now || offer.pricePoisha !== item.unitPricePoisha) continue;
    item.lineDiscountPoisha = lineDiscount(item, offer.offeredPricePoisha);
  }
}

function lineDiscount(item: OrderItemWrite, offeredPricePoisha: number) {
  const discount =
    BigInt(Math.max(0, item.unitPricePoisha - offeredPricePoisha)) * BigInt(item.quantity);
  if (discount > Number.MAX_SAFE_INTEGER) throw orderError('ORDER_TOTAL_INVALID');
  return Number(discount);
}

export async function recordPriceOffer(storeId: string, orderId: string, audit: AuditService) {
  await audit.record(storeId, {
    action: 'order.ai_price_offer',
    entityType: 'order',
    entityId: orderId,
    actor: { kind: 'system' },
    reason: 'AI price offer',
    after: { changedFields: ['lineDiscountPoisha'] },
  });
}
