import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { GoldenEvalService } from '../golden-eval.service';

export const RUN_GOLDEN_EVAL = 'run-golden-eval';

// A nightly check of one eval shop, so the payload has no store.
const payload = z.strictObject({});

@HandlesJob({ queue: QUEUES.bulk, name: RUN_GOLDEN_EVAL })
export class RunGoldenEvalJob implements JobHandler {
  constructor(@Inject(GoldenEvalService) private readonly evals: GoldenEvalService) {}

  async handle(data: unknown) {
    payload.parse(data);
    await this.evals.runNightly();
  }
}
