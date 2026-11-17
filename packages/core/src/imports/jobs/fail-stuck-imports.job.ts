import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { ImportsService } from '../imports.service';

export const FAIL_STUCK_IMPORTS = 'fail-stuck-imports';

// A scheduled sweep over every store, so the payload has no store.
const payload = z.strictObject({});
@HandlesJob({ queue: QUEUES.bulk, name: FAIL_STUCK_IMPORTS })
export class FailStuckImportsJob implements JobHandler {
  constructor(@Inject(ImportsService) private readonly importsService: ImportsService) {}

  async handle(data: unknown) {
    payload.parse(data);
    await this.importsService.failStuckImports();
  }
}
