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
      const selection = await this.select(storeId, order, windowDays);
      const current = await this.transaction.run(storeId, async () => {
        if ((await this.stores.attributionWindowDays(storeId, 'share')) !== windowDays)
          return false;
        if (selection) await this.orders.record(storeId, orderId, { ...selection, buyer: order });
        return true;
      });
      if (current) return;
    }
  }

  async select(
    storeId: string,
    order: NonNullable<Awaited<ReturnType<OrderAttributionService['find']>>>,
    windowDays: AttributionWindow,
  ) {
    if (!order.buyerContactId || order.stage === 'cancelled') return null;
    const buyer = await this.buyer(storeId, order.buyerContactId);
    if (!buyer || (order.isRecipientBuyer && order.recipientPhone !== buyer.phone)) return null;
    const selected = selectAttributionTouch(
      await this.taps(storeId, buyer, order.createdAt, windowDays),
      order.createdAt,
      windowDays,
    );
    if (!selected) return null;
    return {
      sourceType: selected.sourceType,
      sourceId: selected.sourceId,
      channel: selected.channel,
      touchId: selected.id,
      touchAt: selected.eligibleAt,
      windowDays,
    };
  }

  private async buyer(storeId: string, contactId: string) {
    const [buyer] = await this.contacts.findRecipients(storeId, [contactId]);
    if (!buyer?.phone || buyer.kind !== 'customer' || buyer.isBlocked) return;
    return { id: buyer.id, phone: buyer.phone };
  }

  private async taps(
    storeId: string,
    buyer: { id: string; phone: string },
    through: Date,
    windowDays: number,
  ): Promise<AttributionTouch[]> {
    const taps = await this.links.attributionTaps(
      storeId,
      buyer.id,
      new Date(through.getTime() - windowDays * DAY_MS),
      through,
    );
    const campaignIds: string[] = [];
    const stepIds: string[] = [];
    for (const { sourceType, sourceId } of taps) {
      if (!sourceId) continue;
      if (sourceType === 'campaign') campaignIds.push(sourceId);
      if (sourceType === 'automation') stepIds.push(sourceId);
    }
    const campaigns = await this.campaigns.attributionSources(storeId, buyer, campaignIds);
    const workflows = await this.automations.attributionSources(storeId, buyer.id, stepIds);
    const campaignById = new Map(campaigns.map((source) => [source.id, source]));
    const stepById = new Map(workflows.map((source) => [source.id, source]));
    return taps.flatMap(({ sourceType, sourceId, id, eligibleAt }) => {
      if (!sourceId || (sourceType !== 'campaign' && sourceType !== 'automation')) return [];
      const source = (sourceType === 'campaign' ? campaignById : stepById).get(sourceId);
      if (!source?.channel || !source.sentAt || eligibleAt < source.sentAt) return [];
      return [
        {
          id,
          eligibleAt,
          sourceType,
          sourceId: source.sourceId,
          channel: source.channel,
        },
      ];
    });
  }
}
