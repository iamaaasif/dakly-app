import { Inject, Injectable } from '@nestjs/common';

import type { ContactSource } from '@dakly/contracts/contacts';

import { OrdersService } from '../orders/orders.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { DAY_MS } from '../platform/time';
import { StoresService } from '../stores/stores.service';
import {
  type BestSpendCutoff,
  ContactStatsRepository,
  type ContactStatsWrite,
} from './contact-stats.repository';

type RepairPhase = { kind: 'totals' } | { kind: 'rank'; cutoff: BestSpendCutoff | null };

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
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async refreshOrder(storeId: string, orderId: string) {
    const contactId = await this.orders.buyerContactId(storeId, orderId);
    if (contactId) await this.refresh(storeId, contactId);
  }

  refresh(storeId: string, contactId: string) {
    return this.refreshFromOrders(storeId, contactId);
  }

  async reconcilePage(storeId: string, after: string | null, phase: RepairPhase, day: string) {
    const batch =
      phase.kind === 'totals'
        ? await this.repository.contactIds(storeId, after, BATCH_SIZE)
        : await this.repository.contactsWithChangedRank(storeId, after, {
            cutoff: phase.cutoff,
            minimum: BEST_SPEND_POISHA,
            limit: BATCH_SIZE,
          });
    for (const { id } of batch) {
      await this.refreshFromOrders(
        storeId,
        id,
        phase.kind === 'rank' ? { cutoff: phase.cutoff, day } : undefined,
      );
    }
    return batch.length === BATCH_SIZE ? (batch.at(-1)?.id ?? null) : null;
  }

  lifecycleCounts(storeId: string) {
    return this.repository.countLifecycleStages(storeId);
  }

  bestSpendCutoff(storeId: string) {
    return this.repository.bestSpendCutoff(storeId);
  }

  private async refreshFromOrders(
    storeId: string,
    contactId: string,
    rank?: { cutoff: BestSpendCutoff | null; day: string },
  ) {
    await this.transaction.run(storeId, async () => {
      const contact = await this.repository.lockContact(storeId, contactId);
      const now = this.clock.now();
      if (!contact || (rank && rank.day !== now.toISOString().slice(0, 10))) return;
      const timeZone = await this.stores.timeZone(storeId);
      const totals = await this.orders.contactOrderTotals(storeId, contactId, timeZone);
      const previous = (await this.repository.lifecycleStage(storeId, contactId)) ?? 'none';
      const lifecycleStage = await this.lifecycleStage(storeId, contactId, {
        contact,
        totals,
        now,
        timeZone,
        cutoff: rank?.cutoff,
        previous,
      });
      await this.repository.save(storeId, contactId, {
        ...totals,
        usualGapDays: totals.usualGapDays === null ? null : Math.round(totals.usualGapDays),
        lifecycleStage,
        updatedAt: now,
      });
      if (previous !== lifecycleStage) {
        await this.outbox.publish({
          type: 'contact.lifecycle_changed',
          storeId,
          occurredAt: now.toISOString(),
          payload: { contactId },
        });
      }
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
      cutoff,
      previous,
    }: {
      contact: NonNullable<Awaited<ReturnType<ContactStatsRepository['lockContact']>>>;
      totals: Awaited<ReturnType<OrdersService['contactOrderTotals']>>;
      now: Date;
      timeZone: string;
      cutoff?: BestSpendCutoff | null;
      previous: NonNullable<ContactStatsWrite['lifecycleStage']>;
    },
  ): Promise<NonNullable<ContactStatsWrite['lifecycleStage']>> {
    if (!isCustomer(contact, totals.ordersCount)) return 'none';
    const day = new Intl.DateTimeFormat('en-CA', { timeZone });
    const daysSince = (date: Date) =>
      (Date.parse(day.format(now)) - Date.parse(day.format(date))) / DAY_MS;
    const sinceLast = daysSince(totals.lastOrderAt ?? contact.createdAt);
    if (sinceLast > (await this.stores.customerInactivityDays(storeId))) return 'stopped_buying';
    if (
      totals.netSpendPoisha > BEST_SPEND_POISHA &&
      (await bestStageApplies(contactId, totals.netSpendPoisha, { cutoff, previous }))
    )
      return 'best';
    return purchaseStage(totals, sinceLast, daysSince);
  }
}

function bestStageApplies(
  contactId: string,
  spend: bigint,
  {
    cutoff,
    previous,
  }: {
    cutoff?: BestSpendCutoff | null;
    previous: NonNullable<ContactStatsWrite['lifecycleStage']>;
  },
) {
  if (cutoff === undefined) return previous === 'best';
  if (cutoff === null) return false;
  const amount = BigInt(cutoff.netSpendPoisha);
  return spend > amount || (spend === amount && contactId >= cutoff.contactId);
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
): NonNullable<ContactStatsWrite['lifecycleStage']> {
  if (totals.usualGapDays !== null && sinceLast > 1.5 * totals.usualGapDays) return 'slipping_away';
  if (totals.firstOrderAt && daysSince(totals.firstOrderAt) < 30) return 'new';
  return totals.ordersCount >= 2 ? 'regulars' : 'bought_once';
}
