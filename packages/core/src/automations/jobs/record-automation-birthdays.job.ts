import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { AutomationBirthdaysService } from '../automation-birthdays.service';

export const RECORD_AUTOMATION_BIRTHDAYS = 'record-automation-birthdays';

const payload = z.strictObject({
  storeId: z.uuid(),
  day: z.iso.date(),
  occurredAt: z.iso.datetime(),
});

@HandlesJob({ queue: QUEUES.bulk, name: RECORD_AUTOMATION_BIRTHDAYS })
export class RecordAutomationBirthdaysJob implements JobHandler {
  constructor(
    @Inject(AutomationBirthdaysService) private readonly birthdays: AutomationBirthdaysService,
  ) {}

  async handle(data: unknown) {
    const { storeId, ...date } = payload.parse(data);
    await this.birthdays.recordBirthdays(storeId, date);
  }
}
