import { Inject, Injectable } from '@nestjs/common';

import type { UsageUnit } from '@dakly/contracts/billing';

import { BillingService } from '../billing/billing.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StoreTransaction } from '../platform/database/store-transaction';
import { usageError } from './usage.errors';
import { type UsageEvent, UsageRepository } from './usage.repository';

export type ConsumeUsageInput = { unit: UsageUnit; quantity: number; reference: string };

const unitNames: Record<UsageUnit, string> = {
  ai_conversation: 'AI conversations',
  ai_content: 'AI content drafts',
  ai_ask: 'Ask Dakly AI answers',
};
const thresholdPercents = [80, 100] as const;

@Injectable()
export class UsageService {
  constructor(
    @Inject(UsageRepository) private readonly repository: UsageRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(BillingService) private readonly billing: BillingService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  async remaining(storeId: string, unit: UsageUnit): Promise<number> {
    const { allowance, periodStart } = await this.billing.currentAllowance(storeId, unit);
    const used = await this.repository.periodTotal(
      storeId,
      unit,
      periodStart.toISOString().slice(0, 10),
    );
    return Math.max(0, allowance - used);
  }

  async hasAllowance(storeId: string, unit: UsageUnit): Promise<boolean> {
    const { allowance, used } = await this.currentUsage(storeId, unit);
    return used < allowance;
  }

  consume(storeId: string, { unit, quantity, reference }: ConsumeUsageInput): Promise<UsageEvent> {
    return this.transaction.run(storeId, async () => {
      await this.repository.lockUnit(storeId, unit);
      const earlier = await this.repository.findByReference(storeId, unit, reference);
      if (earlier) return earlier;
      const { allowance, period, used } = await this.currentUsage(storeId, unit);
      if (used + quantity > allowance) throw usageError('USAGE_ALLOWANCE_EXCEEDED');
      const event = await this.repository.insert(storeId, {
        unit,
        quantity,
        source: 'allowance',
        reference,
        periodStart: period,
      });
      for (const percent of thresholdPercents) {
        const line = allowance * percent;
        if (used * 100 < line && (used + quantity) * 100 >= line)
          await this.notifyThreshold(storeId, unit, period, percent);
      }
      return event;
    });
  }

  private async currentUsage(storeId: string, unit: UsageUnit) {
    const { allowance, periodStart } = await this.billing.currentAllowance(storeId, unit);
    // Billing counts periods in UTC calendar days, so the UTC date names the period.
    const period = periodStart.toISOString().slice(0, 10);
    const used = await this.repository.periodTotal(storeId, unit, period);
    return { allowance, period, used };
  }

  private notifyThreshold(storeId: string, unit: UsageUnit, period: string, percent: number) {
    const name = unitNames[unit];
    return this.notifications.notify(storeId, {
      type: 'usage.threshold_reached',
      category: 'billing',
      dedupeKey: `usage-${percent}:${unit}:${period}`,
      recipientPermission: 'billing.view',
      title:
        percent === 100
          ? `You have used all your ${name} for this plan period`
          : `You have used ${percent}% of your ${name} for this plan period`,
      body: 'Top up or change your plan to keep using them.',
    });
  }
}
