import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, type OnApplicationBootstrap, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { STAFF_ALERT_RELAY } from '@dakly/core/admin/jobs/staff-alert-relay.job';
import { STAFF_AUDIT_MAINTENANCE } from '@dakly/core/admin/jobs/staff-audit-maintenance.job';
import { RUN_GOLDEN_EVAL } from '@dakly/core/ai-eval/jobs/run-golden-eval.job';
import { SWEEP_ANALYTICS } from '@dakly/core/analytics/jobs/sweep-analytics.job';
import { SEND_DUE_SECURITY_NOTICES } from '@dakly/core/auth/jobs/send-due-security-notices.job';
import { SWEEP_AUTOMATION_BIRTHDAYS } from '@dakly/core/automations/jobs/sweep-automation-birthdays.job';
import { WAKE_DUE_RUNS } from '@dakly/core/automations/jobs/wake-due-runs.job';
import { START_DUE_CAMPAIGNS } from '@dakly/core/campaigns/jobs/start-due-campaigns.job';
import { PURGE_WEBHOOK_EVENTS } from '@dakly/core/channels/jobs/purge-webhook-events.job';
import { QUEUE_CHANNEL_TOKEN_CHECKS } from '@dakly/core/channels/jobs/queue-channel-token-checks.job';
import { RECONCILE_META_PAGE_SUBSCRIPTIONS } from '@dakly/core/channels/jobs/reconcile-meta-page-subscriptions.job';
import { RECOVER_WEBHOOK_EVENTS } from '@dakly/core/channels/jobs/recover-webhook-events.job';
import { ERASE_DELETED_CONTACTS } from '@dakly/core/contacts/jobs/erase-deleted-contacts.job';
import { SWEEP_CONTACT_STATS } from '@dakly/core/contacts/jobs/sweep-contact-stats.job';
import { FAIL_STUCK_IMPORTS } from '@dakly/core/imports/jobs/fail-stuck-imports.job';
import { RUN_MAINTENANCE } from '@dakly/core/maintenance/jobs/run-maintenance.job';
import { QUEUE_CONVERSATION_RETURNS } from '@dakly/core/messaging/jobs/queue-conversation-returns.job';
import { WAKE_SNOOZED_NOTIFICATIONS } from '@dakly/core/notifications/jobs/wake-snoozed-notifications.job';
import { RECOVER_PAYMENT_CALLBACKS } from '@dakly/core/payments/jobs/recover-payment-callbacks.job';
import { SWEEP_PAYMENT_CHECKS } from '@dakly/core/payments/jobs/sweep-payment-checks.job';
import { SWEEP_PAYMENT_SETTLEMENTS } from '@dakly/core/payments/jobs/sweep-payment-settlements.job';
import { loadEnv } from '@dakly/core/platform/config/env';
import {
  RELAY_OUTBOX,
  RELAY_OUTBOX_INTERVAL_MS,
} from '@dakly/core/platform/outbox/jobs/relay-outbox.job';
import { scheduleJob } from '@dakly/core/platform/queue/job-schedule';
import { QUEUES } from '@dakly/core/platform/queue/queues';
import { DAY_MS, MINUTE_MS } from '@dakly/core/platform/time';
import { QUEUE_POST_METRICS_REFRESHES } from '@dakly/core/social/jobs/queue-post-metrics-refreshes.job';
import { RECOVER_POST_TARGETS } from '@dakly/core/social/jobs/recover-post-targets.job';

@Injectable()
export class JobSchedulers implements OnModuleInit, OnApplicationBootstrap {
  constructor(
    @InjectQueue(QUEUES.transactional) private readonly transactional: Queue,
    @InjectQueue(QUEUES.bulk) private readonly bulk: Queue,
    @InjectQueue(QUEUES.sync) private readonly sync: Queue,
    @InjectQueue(QUEUES.payments) private readonly payments: Queue,
    @InjectQueue(QUEUES.workflow) private readonly workflow: Queue,
    @InjectQueue(QUEUES.campaign) private readonly campaign: Queue,
  ) {}

  async onModuleInit() {
    // A persisted scheduler could otherwise enqueue jobs with no handler after Meta is disabled.
    if (!loadEnv().metaChannel) {
      await this.sync.removeJobScheduler(RECOVER_POST_TARGETS);
      await this.sync.removeJobScheduler(QUEUE_POST_METRICS_REFRESHES);
    }
  }

  async onApplicationBootstrap() {
    await Promise.all([
      scheduleJob(this.transactional, SEND_DUE_SECURITY_NOTICES),
      scheduleJob(this.transactional, STAFF_ALERT_RELAY),
      scheduleJob(this.transactional, RELAY_OUTBOX, RELAY_OUTBOX_INTERVAL_MS),
      scheduleJob(this.transactional, WAKE_SNOOZED_NOTIFICATIONS),
      scheduleJob(this.transactional, RECOVER_WEBHOOK_EVENTS, MINUTE_MS),
      scheduleJob(this.bulk, STAFF_AUDIT_MAINTENANCE),
      scheduleJob(this.workflow, WAKE_DUE_RUNS, MINUTE_MS),
      scheduleJob(this.campaign, START_DUE_CAMPAIGNS, MINUTE_MS),
      scheduleJob(this.bulk, FAIL_STUCK_IMPORTS),
      scheduleJob(this.bulk, ERASE_DELETED_CONTACTS, { pattern: '30 1 * * *', tz: 'UTC' }),
      scheduleJob(this.bulk, SWEEP_CONTACT_STATS, { pattern: '0 0 * * *', tz: 'UTC' }),
      scheduleJob(this.bulk, SWEEP_AUTOMATION_BIRTHDAYS, { pattern: '0 * * * *', tz: 'UTC' }),
      scheduleJob(this.sync, QUEUE_CHANNEL_TOKEN_CHECKS, DAY_MS),
      scheduleJob(this.sync, RECONCILE_META_PAGE_SUBSCRIPTIONS, DAY_MS),
      scheduleJob(this.sync, QUEUE_CONVERSATION_RETURNS, MINUTE_MS),
      scheduleJob(this.payments, RECOVER_PAYMENT_CALLBACKS, MINUTE_MS),
      scheduleJob(this.payments, SWEEP_PAYMENT_CHECKS),
      scheduleJob(this.payments, SWEEP_PAYMENT_SETTLEMENTS, {
        pattern: '0 0 * * *',
        tz: 'Asia/Dhaka',
      }),
      scheduleJob(this.bulk, SWEEP_ANALYTICS, { pattern: '0 0 * * *', tz: 'UTC' }),
      scheduleJob(this.bulk, PURGE_WEBHOOK_EVENTS, { pattern: '0 0 * * *', tz: 'UTC' }),
      scheduleJob(this.bulk, RUN_GOLDEN_EVAL, { pattern: '0 20 * * *', tz: 'UTC' }),
      // 19:00 UTC is 01:00 in Dhaka, after the Dhaka day the rollups need has finished.
      scheduleJob(this.bulk, RUN_MAINTENANCE, { pattern: '0 19 * * *', tz: 'UTC' }),
    ]);
  }
}
