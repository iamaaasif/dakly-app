import { Inject, Logger } from '@nestjs/common';
import { z } from 'zod';

import { loadEnv } from '../../platform/config/env';
import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { GoldenEvalService } from '../golden-eval.service';
import { sampleGoldenCases } from '../golden-set.sample';

export const RUN_GOLDEN_EVAL = 'run-golden-eval';

// A nightly check of one eval shop, so the payload has no store.
const payload = z.strictObject({});

@HandlesJob({ queue: QUEUES.bulk, name: RUN_GOLDEN_EVAL })
export class RunGoldenEvalJob implements JobHandler {
  private readonly logger = new Logger(RunGoldenEvalJob.name);

  constructor(@Inject(GoldenEvalService) private readonly evals: GoldenEvalService) {}

  async handle(data: unknown) {
    payload.parse(data);
    const storeId = loadEnv().AI_EVAL_STORE_ID;
    if (!storeId) return;
    const report = await this.evals.run(sampleGoldenCases, this.evals.liveResponder(storeId));
    this.logger.log(JSON.stringify(report));
    // A failed job reaches error reporting, so staff learn that a prompt or model got worse.
    if (!report.passed) throw new Error('Golden-set eval failed');
  }
}
