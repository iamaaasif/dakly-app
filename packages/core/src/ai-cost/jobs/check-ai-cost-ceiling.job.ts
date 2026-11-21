import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { AiCostService } from '../ai-cost.service';

export const CHECK_AI_COST_CEILING = 'check-ai-cost-ceiling';

// A scheduled sweep over every store, so the payload has no store.
const payload = z.strictObject({});

@HandlesJob({ queue: QUEUES.bulk, name: CHECK_AI_COST_CEILING })
export class CheckAiCostCeilingJob implements JobHandler {
  constructor(@Inject(AiCostService) private readonly cost: AiCostService) {}

  async handle(data: unknown) {
    payload.parse(data);
    await this.cost.alertOverCeiling();
  }
}
