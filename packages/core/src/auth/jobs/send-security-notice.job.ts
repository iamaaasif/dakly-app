import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { SecurityNoticesService } from '../security-notices.service';

export const SEND_SECURITY_NOTICE = 'send-security-notice';

// Notices belong to an account, not a store. A failed delivery is retried by the notice's own
// backoff and the scheduled sweep, so the job itself is not retried.
export function securityNoticeJob(noticeId: string) {
  return {
    name: SEND_SECURITY_NOTICE,
    data: { noticeId },
    opts: { jobId: noticeId, removeOnComplete: true, removeOnFail: 100 },
  };
}

const payload = z.strictObject({ noticeId: z.uuid() });
@HandlesJob({ queue: QUEUES.transactional, name: SEND_SECURITY_NOTICE })
export class SendSecurityNoticeJob implements JobHandler {
  constructor(@Inject(SecurityNoticesService) private readonly notices: SecurityNoticesService) {}

  async handle(data: unknown) {
    const { noticeId } = payload.parse(data);
    await this.notices.dispatchOne(noticeId);
  }
}
