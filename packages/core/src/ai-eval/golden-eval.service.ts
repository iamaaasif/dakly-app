import { Inject, Injectable, Logger } from '@nestjs/common';

import { StaffAlertsService } from '../admin/staff-alerts.service';
import { AiPracticeService } from '../ai-agent/ai-practice.service';
import { loadEnv } from '../platform/config/env';
import { type EvalReport, scoreEval } from './eval-scoring';
import type { EvalOutcome, GoldenCase } from './golden-case';
import { activeGoldenCases } from './golden-set.sample';

export type EvalResponder = (golden: GoldenCase) => Promise<EvalOutcome>;

// A saved run replays recorded answers, so CI makes no model call.
export const replayResponder =
  (recorded: Readonly<Record<string, EvalOutcome>>): EvalResponder =>
  async (golden) => {
    const outcome = recorded[golden.id];
    if (!outcome) throw new Error(`No recorded outcome for golden case ${golden.id}`);
    return outcome;
  };

@Injectable()
export class GoldenEvalService {
  private readonly logger = new Logger(GoldenEvalService.name);

  constructor(
    @Inject(AiPracticeService) private readonly practice: AiPracticeService,
    @Inject(StaffAlertsService) private readonly alerts: StaffAlertsService,
  ) {}

  async run(cases: readonly GoldenCase[], respond: EvalResponder): Promise<EvalReport> {
    const outcomes: Record<string, EvalOutcome> = {};
    // One at a time: a store runs at most three model calls at once.
    for (const golden of cases) outcomes[golden.id] = await respond(golden);
    return scoreEval(cases, outcomes);
  }

  // A missed threshold alerts staff and returns normally: the job retries on a throw, which
  // would run the eval again and hide the failure behind a lucky rerun.
  async runNightly(): Promise<EvalReport | undefined> {
    const storeId = loadEnv().AI_EVAL_STORE_ID;
    if (!storeId) return undefined;
    const report = await this.run(activeGoldenCases, this.liveResponder(storeId));
    this.logger.log(JSON.stringify(report));
    if (!report.passed) await this.alertStaff(report);
    return report;
  }

  private async alertStaff(report: EvalReport) {
    const text = `Dakly golden-set eval failed. Wrong prices: ${report.wrongPriceCaseIds.length}; out-of-stock offers: ${report.outOfStockOfferCaseIds.length}; attacks answered: ${report.answeredAttackCaseIds.length}; unsafe wording: ${report.unsafeWordingCaseIds.length}; products found: ${report.productFound} of ${report.productCases}; hand-overs correct: ${report.handoverCorrect} of ${report.handoverCases}. Cases: ${[...report.wrongPriceCaseIds, ...report.outOfStockOfferCaseIds, ...report.answeredAttackCaseIds, ...report.unsafeWordingCaseIds, ...report.missedProductCaseIds, ...report.missedHandoverCaseIds].join(', ')}.`;
    try {
      if (!(await this.alerts.notify(`golden-eval-${Date.now()}`, text)))
        this.logger.warn('Golden-set eval failed and Slack is not configured');
    } catch {
      // The report is already logged; a Slack outage must not rerun the eval.
      this.logger.error('Golden-set eval failed and the staff alert could not be sent');
    }
  }

  // Asks the real agent pipeline of the eval shop, which holds the catalog the cases assume.
  liveResponder(storeId: string): EvalResponder {
    return (golden) => this.practice.ask(storeId, golden.question);
  }
}
