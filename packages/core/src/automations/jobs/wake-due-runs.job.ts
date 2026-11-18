import { InjectQueue } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { AutomationRunsService } from '../automation-runs.service';
import { continueRunJob } from './continue-automation-run.job';

export const WAKE_DUE_RUNS = 'wake-due-runs';

// A scheduled sweep over every store, so the payload has no store.
const payload = z.strictObject({});
@HandlesJob({ queue: QUEUES.workflow, name: WAKE_DUE_RUNS })
export class WakeDueRunsJob implements JobHandler {
  constructor(
    @Inject(AutomationRunsService) private readonly runs: AutomationRunsService,
    @InjectQueue(QUEUES.workflow) private readonly queue: Queue,
  ) {}

  async handle(data: unknown) {
    payload.parse(data);
    await this.runs.wakeDueRuns(await this.queue.getWaitingCount(), async (claims) => {
      await this.queue.addBulk(
        claims.map(({ storeId, ...claim }) => continueRunJob(storeId, claim)),
      );
    });
  }
}
