import { Inject, Injectable } from '@nestjs/common';

import type { ContactSource } from '@dakly/contracts/contacts';

import { OrderReportingService } from '../orders/order-reporting.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { DAY_MS } from '../platform/time';
import { StoresService } from '../stores/stores.service';
import { ContactStatsRepository, type ContactStatsWrite } from './contact-stats.repository';

const BEST_SPEND_POISHA = 2_000_000n;
const INTENTIONAL_SOURCES: readonly ContactSource[] = [
  'manual',
  'voice',
  'import',
  'shopify',
  'woocommerce',
  'pos',
];

@Injectable()
export class ContactStatsService {
  constructor(
    @Inject(ContactStatsRepository) private readonly repository: ContactStatsRepository,
    @Inject(OrderReportingService) private readonly orders: OrderReportingService,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async refreshOrder(storeId: string, orderId: string) {
    const contactId = await this.orders.buyerContactId(storeId, orderId);
    if (contactId) await this.refresh(storeId, contactId);
  }

  async refresh(storeId: string, contactId: string) {
    await this.transaction.run(storeId, async () => {
      const contact = await this.repository.lockContact(storeId, contactId);
      if (!contact) return;
      const timeZone = await this.stores.timeZone(storeId);
      const totals = await this.orders.contactOrderTotals(storeId, contactId, timeZone);
      const now = this.clock.now();
      const lifecycleStage = await this.lifecycleStage(storeId, contactId, {
        contact,
        totals,
        now,
        timeZone,
      });
      await this.repository.save(storeId, contactId, {
        ...totals,
        usualGapDays: totals.usualGapDays === null ? null : Math.round(totals.usualGapDays),
        lifecycleStage,
        updatedAt: now,
      });
    });
  }

  private async lifecycleStage(
    storeId: string,
    contactId: string,
    {
      contact,
      totals,
      now,
      timeZone,
    }: {
      contact: NonNullable<Awaited<ReturnType<ContactStatsRepository['lockContact']>>>;
      totals: Awaited<ReturnType<OrderReportingService['contactOrderTotals']>>;
      now: Date;
      timeZone: string;
    },
  ): Promise<ContactStatsWrite['lifecycleStage']> {
    if (!isCustomer(contact, totals.ordersCount)) return 'none';
    const day = new Intl.DateTimeFormat('en-CA', { timeZone });
    const daysSince = (date: Date) =>
      (Date.parse(day.format(now)) - Date.parse(day.format(date))) / DAY_MS;
    const sinceLast = daysSince(totals.lastOrderAt ?? contact.createdAt);
    if (sinceLast > (await this.stores.customerInactivityDays(storeId))) return 'stopped_buying';
    if (
      totals.netSpendPoisha > BEST_SPEND_POISHA &&
      (await this.repository.lifecycleStage(storeId, contactId)) === 'best'
    )
      return 'best';
    return purchaseStage(totals, sinceLast, daysSince);
  }
}

function isCustomer(
  contact: NonNullable<Awaited<ReturnType<ContactStatsRepository['lockContact']>>>,
  ordersCount: number,
): boolean {
  if (contact.isBlocked || contact.deletedAt || contact.kind === 'not_customer') return false;
  return (
    ordersCount > 0 || (contact.kind === 'customer' && INTENTIONAL_SOURCES.includes(contact.source))
  );
}

function purchaseStage(
  totals: Awaited<ReturnType<OrderReportingService['contactOrderTotals']>>,
  sinceLast: number,
  daysSince: (date: Date) => number,
): ContactStatsWrite['lifecycleStage'] {
  if (totals.usualGapDays !== null && sinceLast > 1.5 * totals.usualGapDays) return 'slipping_away';
  if (totals.firstOrderAt && daysSince(totals.firstOrderAt) < 30) return 'new';
  return totals.ordersCount >= 2 ? 'regulars' : 'bought_once';
}
