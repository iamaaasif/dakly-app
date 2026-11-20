import { Inject, Injectable } from '@nestjs/common';

import type { AttributionWindow } from '@dakly/contracts/stores';

import { AutomationRunsService } from '../automations/automation-runs.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { ContactsService } from '../contacts/contacts.service';
import { LinksService } from '../links/links.service';
import { OrderAttributionService } from '../orders/order-attribution.service';
import { StoreTransaction } from '../platform/database/store-transaction';
import { DAY_MS } from '../platform/time';
import { StoresService } from '../stores/stores.service';
import { selectAttributionTouch, type AttributionTouch } from './attribution-touch';

type AttributionOrder = NonNullable<Awaited<ReturnType<OrderAttributionService['find']>>>;

@Injectable()
export class OrderAttributionEngine {
  constructor(
    @Inject(AutomationRunsService) private readonly automations: AutomationRunsService,
    @Inject(CampaignsService) private readonly campaigns: CampaignsService,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(LinksService) private readonly links: LinksService,
    @Inject(OrderAttributionService) private readonly orders: OrderAttributionService,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
  ) {}

  async attribute(storeId: string, orderId: string) {
    const order = await this.orders.find(storeId, orderId);
    if (!order?.buyerContactId || order.stage === 'cancelled' || order.sourceType) return;
    for (;;) {
      const windowDays = await this.stores.attributionWindowDays(storeId);
      const [selection] = await this.selectForOrders(
        storeId,
        [{ ...order, id: orderId }],
        windowDays,
      );
      const current = await this.transaction.run(storeId, async () => {
        if ((await this.stores.attributionWindowDays(storeId, 'share')) !== windowDays)
          return false;
        if (selection?.reference)
          await this.orders.record(storeId, orderId, { ...selection.reference, buyer: order });
        return true;
      });
      if (current) return;
    }
  }

  async selectForOrders<T extends AttributionOrder & { id: string }>(
    storeId: string,
    orders: T[],
    windowDays: AttributionWindow,
  ) {
    const ids = [
      ...new Set(orders.flatMap(({ buyerContactId }) => (buyerContactId ? [buyerContactId] : []))),
    ];
    const contacts = ids.length ? await this.contacts.findRecipients(storeId, ids) : [];
    const buyers = new Map(
      contacts.flatMap(({ id, phone, kind, isBlocked }) =>
        phone && kind === 'customer' && !isBlocked ? [[id, { id, phone }] as const] : [],
      ),
    );
    const requests = orders.flatMap((order) => {
      const buyer = buyers.get(order.buyerContactId ?? '');
      if (!buyer || order.stage === 'cancelled') return [];
      if (order.isRecipientBuyer && order.recipientPhone !== buyer.phone) return [];
      return [
        {
          orderId: order.id,
          contactId: buyer.id,
          fromAt: new Date(order.createdAt.getTime() - windowDays * DAY_MS),
          throughAt: order.createdAt,
        },
      ];
    });
    const taps = await this.links.attributionTaps(storeId, requests);
    const tapsByBuyer = new Map<string, Tap[]>();
    for (const tap of taps) {
      const buyerTaps = tapsByBuyer.get(tap.contactId);
      if (buyerTaps) buyerTaps.push(tap);
      else tapsByBuyer.set(tap.contactId, [tap]);
    }
    const touches = new Map<string, AttributionTouch[]>();
    for (const buyer of buyers.values()) {
      const buyerTaps = tapsByBuyer.get(buyer.id);
      if (buyerTaps) await this.readTouches(storeId, buyer, buyerTaps, touches);
    }
    return orders.map((order) => {
      const touch = selectAttributionTouch(
        touches.get(order.id) ?? [],
        order.createdAt,
        windowDays,
      );
      const reference = touch
        ? {
            sourceType: touch.sourceType,
            sourceId: touch.sourceId,
            channel: touch.channel,
            touchId: touch.id,
            touchAt: touch.eligibleAt,
            windowDays,
          }
        : null;
      return { order, reference };
    });
  }

  private async readTouches(
    storeId: string,
    buyer: { id: string; phone: string },
    taps: Tap[],
    touches: Map<string, AttributionTouch[]>,
  ) {
    const campaigns = await this.campaigns.attributionSources(
      storeId,
      buyer,
      sourceIds(taps, 'campaign'),
    );
    const workflows = await this.automations.attributionSources(
      storeId,
      buyer.id,
      sourceIds(taps, 'automation'),
    );
    const campaignById = new Map(campaigns.map((source) => [source.id, source]));
    const stepById = new Map(workflows.map((source) => [source.id, source]));
    for (const tap of taps) {
      const touch = toTouch(tap, campaignById, stepById);
      if (!touch) continue;
      const prior = touches.get(tap.orderId);
      if (prior) prior.push(touch);
      else touches.set(tap.orderId, [touch]);
    }
  }
}

type Tap = Awaited<ReturnType<LinksService['attributionTaps']>>[number];
type Source = { sourceId: string; channel: string | null; sentAt: Date | null };

function sourceIds(taps: Tap[], type: AttributionTouch['sourceType']) {
  return [
    ...new Set(
      taps.flatMap(({ sourceType, sourceId }) =>
        sourceType === type && sourceId ? [sourceId] : [],
      ),
    ),
  ];
}

function toTouch(
  { id, eligibleAt, sourceType, sourceId }: Tap,
  campaigns: Map<string, Source>,
  steps: Map<string, Source>,
): AttributionTouch | undefined {
  if (!sourceId || (sourceType !== 'campaign' && sourceType !== 'automation')) return;
  const source = (sourceType === 'campaign' ? campaigns : steps).get(sourceId);
  if (!source?.channel || !source.sentAt || eligibleAt < source.sentAt) return;
  return { id, eligibleAt, sourceType, sourceId: source.sourceId, channel: source.channel };
}
