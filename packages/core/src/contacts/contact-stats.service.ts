import { Inject, Injectable } from '@nestjs/common';

import type { ContactSource } from '@dakly/contracts/contacts';

import { OrdersService } from '../orders/orders.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { DAY_MS } from '../platform/time';
import { StoresService } from '../stores/stores.service';
import {
  type BestSpendCutoff,
  ContactStatsRepository,
  type ContactStatsWrite,
} from './contact-stats.repository';

type SpendRanking =
  | { kind: 'live' }
  | { kind: 'keep' }
  | { kind: 'cutoff'; asOf: string; cutoff: BestSpendCutoff | null };

const BATCH_SIZE = 100;
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
    @Inject(OrdersService) private readonly orders: OrdersService,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async refreshOrder(storeId: string, orderId: string) {
    const contactId = await this.orders.buyerContactId(storeId, orderId);
    if (contactId) await this.refresh(storeId, contactId);
  }

  async refresh(storeId: string, contactId: string, ranking: SpendRanking = { kind: 'live' }) {
    await this.transaction.run(storeId, async () => {
      const contact = await this.repository.lockContact(storeId, contactId);
      if (!contact || (await this.rankIsOutdated(storeId, contactId, ranking))) return;
      const timeZone = await this.stores.timeZone(storeId);
      const totals = await this.orders.contactOrderTotals(storeId, contactId, timeZone);
      const now = this.clock.now();
      const lifecycleStage = await this.lifecycleStage(storeId, contactId, {
        contact,
        totals,
        now,
        timeZone,
        ranking,
      });
      await this.repository.save(storeId, contactId, {
        ...totals,
        usualGapDays: totals.usualGapDays === null ? null : Math.round(totals.usualGapDays),
        lifecycleStage,
        updatedAt: now,
      });
    });
  }

  async reconcilePage(
    storeId: string,
    after: string | null,
    ranking: Exclude<SpendRanking, { kind: 'live' }>,
  ) {
    const batch =
      ranking.kind === 'keep'
        ? await this.repository.contactIds(storeId, after, BATCH_SIZE)
        : await this.repository.contactsWithChangedRank(storeId, after, {
            cutoff: ranking.cutoff,
            minimum: BEST_SPEND_POISHA,
            limit: BATCH_SIZE,
          });
    for (const { id } of batch) await this.refresh(storeId, id, ranking);
    return batch.length === BATCH_SIZE ? (batch.at(-1)?.id ?? null) : null;
  }

  bestSpendCutoff(storeId: string) {
    return this.repository.bestSpendCutoff(storeId);
  }

  private async rankIsOutdated(storeId: string, contactId: string, ranking: SpendRanking) {
    if (ranking.kind !== 'cutoff') return false;
    const state = await this.repository.rankingState(storeId, contactId);
    return !state || state.updatedAt.toISOString() > ranking.asOf;
  }

  private async lifecycleStage(
    storeId: string,
    contactId: string,
    {
      contact,
      totals,
      now,
      timeZone,
      ranking,
    }: {
      contact: NonNullable<Awaited<ReturnType<ContactStatsRepository['lockContact']>>>;
      totals: Awaited<ReturnType<OrdersService['contactOrderTotals']>>;
      now: Date;
      timeZone: string;
      ranking: SpendRanking;
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
      (await this.isBest(storeId, contactId, totals.netSpendPoisha, ranking))
    )
      return 'best';
    return purchaseStage(totals, sinceLast, daysSince);
  }

  private async isBest(storeId: string, contactId: string, spend: bigint, ranking: SpendRanking) {
    if (ranking.kind === 'keep')
      return (await this.repository.rankingState(storeId, contactId))?.stage === 'best';
    if (ranking.kind === 'live')
      return this.repository.bestBySpend(storeId, contactId, spend, INTENTIONAL_SOURCES);
    const { cutoff } = ranking;
    if (cutoff === null) return false;
    const amount = BigInt(cutoff.netSpendPoisha);
    return spend > amount || (spend === amount && contactId >= cutoff.contactId);
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
  totals: Awaited<ReturnType<OrdersService['contactOrderTotals']>>,
  sinceLast: number,
  daysSince: (date: Date) => number,
): ContactStatsWrite['lifecycleStage'] {
  if (totals.usualGapDays !== null && sinceLast > 1.5 * totals.usualGapDays) return 'slipping_away';
  if (totals.firstOrderAt && daysSince(totals.firstOrderAt) < 30) return 'new';
  return totals.ordersCount >= 2 ? 'regulars' : 'bought_once';
}
