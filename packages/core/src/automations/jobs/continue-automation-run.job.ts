import { InjectQueue } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { JobsOptions, Queue } from 'bullmq';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import type { RunClaim } from '../automation-runs.repository';
import { AutomationRunsService } from '../automation-runs.service';

export const CONTINUE_AUTOMATION_RUN = 'continue-automation-run';

const payload = z.strictObject({
  storeId: z.uuid(),
  automationRunId: z.uuid(),
  stepKey: z.string(),
  claimedAt: z.iso.datetime(),
});

// Deduplication on the run, step and claim drops a second job for the same claim. A new claim of
// the step gets its own key, so a job kept after failing never blocks it.
const stepJobOptions = {
  // The lease and the sweep are the retry: a retried job no longer holds the claim startWork renewed.
  attempts: 1,
  removeOnComplete: true,
  removeOnFail: 100,
} satisfies JobsOptions;

export function continueRunJob(storeId: string, { runId, stepKey, claimedAt }: RunClaim) {
  return {
    name: CONTINUE_AUTOMATION_RUN,
    data: { storeId, automationRunId: runId, stepKey, claimedAt: claimedAt.toISOString() },
    opts: {
      ...stepJobOptions,
      deduplication: { id: `${runId}-${stepKey}-${claimedAt.getTime()}` },
    },
  };
}

@HandlesJob({ queue: QUEUES.workflow, name: CONTINUE_AUTOMATION_RUN })
export class ContinueAutomationRunJob implements JobHandler {
  constructor(
    @Inject(AutomationRunsService) private readonly runs: AutomationRunsService,
    @InjectQueue(QUEUES.workflow) private readonly queue: Queue,
  ) {}

  // A run that goes straight on queues its next step here, after the step committed.
  async handle(data: unknown) {
    const { storeId, automationRunId, stepKey, claimedAt } = payload.parse(data);
    const claim = { runId: automationRunId, stepKey, claimedAt: new Date(claimedAt) };
    const next = await this.runs.continueRun(storeId, claim);
    if (!next) return;
    const job = continueRunJob(storeId, next);
    await this.queue.add(job.name, job.data, job.opts);
  }
}
