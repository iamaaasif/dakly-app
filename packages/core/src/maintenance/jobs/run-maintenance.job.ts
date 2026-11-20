import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { MaintenanceService } from '../maintenance.service';

export const RUN_MAINTENANCE = 'run-maintenance';

// A daily sweep over every store, so the payload has no store.
const payload = z.strictObject({});

@HandlesJob({ queue: QUEUES.bulk, name: RUN_MAINTENANCE })
export class RunMaintenanceJob implements JobHandler {
  constructor(@Inject(MaintenanceService) private readonly maintenance: MaintenanceService) {}

  async handle(data: unknown) {
    payload.parse(data);
    await this.maintenance.run();
  }
}
