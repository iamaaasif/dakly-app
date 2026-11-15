import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { StaffAlertsService } from '../staff-alerts.service';

export const STAFF_ALERT_DELIVERY = 'staff-alert-delivery';

const payload = z.strictObject({ auditId: z.uuid() });
@HandlesJob({ queue: QUEUES.transactional, name: STAFF_ALERT_DELIVERY })
export class StaffAlertDeliveryJob implements JobHandler {
  constructor(@Inject(StaffAlertsService) private readonly alerts: StaffAlertsService) {}

  async handle(data: unknown) {
    const { auditId } = payload.parse(data);
    await this.alerts.deliver(auditId);
  }
}
