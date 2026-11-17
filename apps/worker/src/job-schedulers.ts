import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { STAFF_ALERT_RELAY } from '@dakly/core/admin/jobs/staff-alert-relay.job';
import { STAFF_AUDIT_MAINTENANCE } from '@dakly/core/admin/jobs/staff-audit-maintenance.job';
import { SEND_DUE_SECURITY_NOTICES } from '@dakly/core/auth/jobs/send-due-security-notices.job';
import { FAIL_STUCK_IMPORTS } from '@dakly/core/imports/jobs/fail-stuck-imports.job';
import { WAKE_SNOOZED_NOTIFICATIONS } from '@dakly/core/notifications/jobs/wake-snoozed-notifications.job';
import {
  RELAY_OUTBOX,
  RELAY_OUTBOX_INTERVAL_MS,
} from '@dakly/core/platform/outbox/jobs/relay-outbox.job';
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
      scheduleJob(this.transactional, RELAY_OUTBOX, RELAY_OUTBOX_INTERVAL_MS),
      scheduleJob(this.transactional, WAKE_SNOOZED_NOTIFICATIONS),
      scheduleJob(this.bulk, STAFF_AUDIT_MAINTENANCE),
      scheduleJob(this.bulk, FAIL_STUCK_IMPORTS),
    ]);
  }
}
