import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { STAFF_ALERT_RELAY } from '@dakly/core/admin/jobs/staff-alert-relay.job';
import { STAFF_AUDIT_MAINTENANCE } from '@dakly/core/admin/jobs/staff-audit-maintenance.job';
import { SEND_DUE_SECURITY_NOTICES } from '@dakly/core/auth/jobs/send-due-security-notices.job';
import { scheduleJob } from '@dakly/core/platform/queue/job-schedule';
import { QUEUES } from '@dakly/core/platform/queue/queues';

@Injectable()
export class JobSchedulers implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(QUEUES.transactional) private readonly transactional: Queue,
    @InjectQueue(QUEUES.bulk) private readonly bulk: Queue,
  ) {}

  async onApplicationBootstrap() {
    await Promise.all([
      scheduleJob(this.transactional, SEND_DUE_SECURITY_NOTICES),
      scheduleJob(this.transactional, STAFF_ALERT_RELAY),
      scheduleJob(this.bulk, STAFF_AUDIT_MAINTENANCE),
    ]);
  }
}
