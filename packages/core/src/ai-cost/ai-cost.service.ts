import { Inject, Injectable, Logger } from '@nestjs/common';

import type { AiCostResponse } from '@dakly/contracts/ops-reports';

import { StaffAlertsService } from '../admin/staff-alerts.service';
import { Clock } from '../platform/clock';
import { AiCostRepository } from './ai-cost.repository';

export const AI_DAILY_COST_CEILING = Symbol('AI_DAILY_COST_CEILING');
const SHOP_LIMIT = 20;
const ALERT_LIMIT = 200;
const DAY_MS = 86_400_000;
// Bangladesh has no daylight saving, so a fixed offset gives the shop's calendar day.
const DHAKA_OFFSET_MS = 6 * 3_600_000;

@Injectable()
export class AiCostService {
  private readonly logger = new Logger(AiCostService.name);

  constructor(
    @Inject(AiCostRepository) private readonly repository: AiCostRepository,
    @Inject(StaffAlertsService) private readonly alerts: StaffAlertsService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(AI_DAILY_COST_CEILING) private readonly ceiling: number | null,
  ) {}

  async report(day = this.today()): Promise<AiCostResponse> {
    const shops = await this.repository.costByStore(dayRange(day), 0, SHOP_LIMIT);
    return {
      day,
      ceilingMicroUsd: this.ceiling,
      totalMicroUsd: shops.reduce((total, shop) => total + shop.costMicroUsd, 0),
      shops: shops.map((shop) => ({
        ...shop,
        overCeiling: this.ceiling !== null && shop.costMicroUsd >= this.ceiling,
      })),
    };
  }

  // Tells staff once per shop and day. The row is written after the message, so a crash in between
  // repeats the alert instead of losing it.
  async alertOverCeiling(): Promise<void> {
    const ceiling = this.ceiling;
    if (!ceiling) return;
    const day = this.today();
    for (const shop of await this.repository.costByStore(dayRange(day), ceiling, ALERT_LIMIT)) {
      if (await this.repository.hasAlerted(shop.storeId, day)) continue;
      const text = `AI cost ceiling passed. Shop ${shop.name} (${shop.storeId}) has spent ${shop.costMicroUsd} micro USD on ${day}, ceiling ${ceiling}.`;
      if (!(await this.alerts.notify(`ai-cost-${shop.storeId}-${day}`, text)))
        this.logger.warn(`AI cost ceiling passed for ${shop.storeId}; Slack is not configured`);
      else await this.repository.recordAlert(shop.storeId, day, shop.costMicroUsd);
    }
  }

  private today(): string {
    return new Date(this.clock.now().getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
  }
}

function dayRange(day: string): { from: Date; to: Date } {
  const from = new Date(Date.parse(`${day}T00:00:00Z`) - DHAKA_OFFSET_MS);
  return { from, to: new Date(from.getTime() + DAY_MS) };
}
