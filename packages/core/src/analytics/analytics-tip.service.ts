import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import {
  analyticsTipSteps,
  type AnalyticsQuery,
  type AnalyticsTipResponse,
  type AnalyticsTipStep,
} from '@dakly/contracts/analytics';

import { AiService } from '../ai/ai.service';
import { AutomationsService } from '../automations/automations.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { funnel } from './analytics-funnel';
import { emptyTotals, readMessageTotals, sumTotals } from './analytics-message-totals';
import { AnalyticsService } from './analytics.service';
import { analyticsTip } from './prompts/analytics-tip.v1';
import { shiftReportDay, type ReportPeriod } from './report-period';

const BASELINE_WEEKS = 13;
const MINIMUM_WEEKS = 4;
// Smaller drops are normal week to week and not worth a tip.
const MINIMUM_DROP_POINTS = 5;

const suggestionSchema = z.object({ suggestion: z.string().min(1).max(240) });

type Rates = Record<AnalyticsTipStep, number | null>;

@Injectable()
export class AnalyticsTipService {
  constructor(
    @Inject(AnalyticsService) private readonly reports: AnalyticsService,
    @Inject(CampaignsService) private readonly campaigns: CampaignsService,
    @Inject(AutomationsService) private readonly automations: AutomationsService,
    @Inject(AiService) private readonly ai: AiService,
  ) {}

  async tip(storeId: string, { period }: AnalyticsQuery): Promise<AnalyticsTipResponse> {
    const { timeZone, current } = await this.reports.periods(storeId, period);
    const now = await this.rates(storeId, current, timeZone);
    const weeks: Rates[] = [];
    for (let index = 0; index < BASELINE_WEEKS; index += 1) {
      const through = shiftReportDay(current.through, -7 * index);
      weeks.push(
        await this.rates(storeId, { from: shiftReportDay(through, -6), through }, timeZone),
      );
    }
    const found = biggestDrop(now, weeks);
    if (!found) return { tip: null };
    return { tip: { ...found, suggestion: await this.suggest(storeId, found) } };
  }

  private async rates(storeId: string, period: ReportPeriod, timeZone: string): Promise<Rates> {
    const [totals, people, orders] = await Promise.all([
      readMessageTotals(this.campaigns, this.automations, storeId, { ...period, timeZone }),
      this.reports.messagePeople(storeId, period, timeZone),
      this.reports.marketingOrders(storeId, period),
    ]);
    const readable = sumTotals(
      (['whatsapp', 'messenger'] as const).map((channel) => totals.get(channel) ?? emptyTotals()),
    );
    const steps = funnel(sumTotals([...totals.values()]), readable, people, Number(orders.total));
    return {
      delivered: steps.delivered.percentOfPrevious,
      read: steps.read.percentOfPrevious,
      tapped: steps.tapped.percentOfPrevious,
      ordered: steps.ordered.percentOfPrevious,
    };
  }

  private async suggest(
    storeId: string,
    drop: { step: AnalyticsTipStep; currentPercent: number; usualPercent: number },
  ): Promise<string | null> {
    const result = await this.ai.run(storeId, {
      tier: 'fast',
      purpose: 'summary',
      prompt: analyticsTip,
      input: JSON.stringify({
        step: drop.step,
        this_period_percent: drop.currentPercent,
        usual_percent: drop.usualPercent,
      }),
      output: suggestionSchema,
    });
    return result.kind === 'output' ? result.output.suggestion : null;
  }
}

function biggestDrop(now: Rates, weeks: Rates[]) {
  let best: { step: AnalyticsTipStep; currentPercent: number; usualPercent: number } | null = null;
  let bestDrop = MINIMUM_DROP_POINTS;
  for (const step of analyticsTipSteps) {
    const current = now[step];
    const usual = median(weeks.flatMap((week) => (week[step] === null ? [] : [week[step]])));
    if (current === null || usual === null) continue;
    if (usual - current >= bestDrop) {
      bestDrop = usual - current;
      best = { step, currentPercent: current, usualPercent: usual };
    }
  }
  return best;
}

function median(values: number[]): number | null {
  if (values.length < MINIMUM_WEEKS) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 ? sorted[middle] : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
  return Math.round((value ?? 0) * 10) / 10;
}
