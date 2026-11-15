import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { StaffHistoryService } from '../staff-history.service';

export const STAFF_AUDIT_EXPORT = 'staff-audit-export';

const payload = z.strictObject({ exportId: z.uuid() });
@HandlesJob({ queue: QUEUES.bulk, name: STAFF_AUDIT_EXPORT })
export class StaffAuditExportJob implements JobHandler {
  constructor(@Inject(StaffHistoryService) private readonly history: StaffHistoryService) {}

  async handle(data: unknown) {
    const { exportId } = payload.parse(data);
    await this.history.build(exportId);
  }
}
