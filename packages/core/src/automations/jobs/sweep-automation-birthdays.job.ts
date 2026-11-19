import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { AutomationBirthdaySweepService } from '../automation-birthday-sweep.service';

export const SWEEP_AUTOMATION_BIRTHDAYS = 'sweep-automation-birthdays';
// The scheduled sweep visits all stores using their own calendar day.
const payload = z.strictObject({});

@HandlesJob({ queue: QUEUES.bulk, name: SWEEP_AUTOMATION_BIRTHDAYS })
export class SweepAutomationBirthdaysJob implements JobHandler {
  constructor(
    @Inject(AutomationBirthdaySweepService)
    private readonly birthdays: AutomationBirthdaySweepService,
  ) {}

  async handle(data: unknown) {
    payload.parse(data);
    await this.birthdays.sweep();
  }
}
