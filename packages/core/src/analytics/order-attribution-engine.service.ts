import { Inject, Injectable } from '@nestjs/common';

import { AutomationRunsService } from '../automations/automation-runs.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { ContactsService } from '../contacts/contacts.service';
import { LinksService } from '../links/links.service';
import { OrderAttributionService } from '../orders/order-attribution.service';
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
  ) {}

  attribute(storeId: string, orderId: string) {
    return this.orders.record(
      storeId,
      orderId,
      async (order) => {
        // A replay keeps the live decision even if the buyer edited their phone since.
        if (order.isAttributed) return undefined;
        const [buyer] = await this.contacts.findRecipients(storeId, [order.buyerContactId]);
        if (!buyer?.phone || buyer.kind !== 'customer' || buyer.isBlocked) return null;
        if (order.isRecipientBuyer && order.recipientPhone !== buyer.phone) return null;
        const windowDays = await this.stores.attributionWindowDays(storeId);
        const selected = selectAttributionTouch(
          await this.taps(
            storeId,
            { id: buyer.id, phone: buyer.phone },
            order.createdAt,
            windowDays,
          ),
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
      },
      { kind: 'system' },
    );
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
          kind: 'tap',
          sourceType,
          sourceId: source.sourceId,
          channel: source.channel,
        },
      ];
    });
  }
}
