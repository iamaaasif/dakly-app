import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { SecurityNoticesService } from '../security-notices.service';

export const SEND_DUE_SECURITY_NOTICES = 'send-due-security-notices';

// A scheduled sweep over every account, so the payload has no store.
const payload = z.strictObject({});
@HandlesJob({ queue: QUEUES.transactional, name: SEND_DUE_SECURITY_NOTICES })
export class SendDueSecurityNoticesJob implements JobHandler {
  constructor(@Inject(SecurityNoticesService) private readonly notices: SecurityNoticesService) {}

  async handle(data: unknown) {
    payload.parse(data);
    await this.notices.dispatch();
  }
}
