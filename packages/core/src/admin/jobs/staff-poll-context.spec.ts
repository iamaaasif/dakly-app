import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';

import type { ErrorReporter } from '../../platform/logging/error-reporter';
import { jobLogBindings, runWithJobContext } from '../../platform/logging/job-context';
import type { StaffAlertsService } from '../staff-alerts.service';
import type { StaffHistoryService } from '../staff-history.service';
import { StaffAlertRelayJob } from './staff-alert-relay.job';
import { StaffAuditMaintenanceJob } from './staff-audit-maintenance.job';

describe('staff poll failure context', () => {
  it.each(['alerts', 'maintenance'])(
    'keeps %s rejection logs and reports in the failed poll',
    async (kind) => {
      const work: string[] = [];
      const logs: string[] = [];
      const reports: string[] = [];
      const fail = async () => {
        work.push(jobLogBindings().jobId!);
        throw new Error('poll failed');
      };
      const reporter = {
        reportJob: (_error: unknown, jobId: string) => reports.push(jobId),
      } as unknown as ErrorReporter;
      const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {
        logs.push(jobLogBindings().jobId!);
      });
      const job =
        kind === 'alerts'
          ? new StaffAlertRelayJob(
              { pending: fail } as unknown as StaffAlertsService,
              {} as Queue,
              reporter,
            )
          : new StaffAuditMaintenanceJob(
              { maintain: fail, pending: async () => [] } as unknown as StaffHistoryService,
              {} as Queue,
              reporter,
            );
      try {
        await runWithJobContext(async () => {
          job.onApplicationBootstrap();
          await job.onApplicationShutdown();
        }, 'bootstrap');
        expect(work).toHaveLength(1);
        expect(work[0]).not.toBe('bootstrap');
        expect(logs).toEqual(work);
        expect(reports).toEqual(work);
      } finally {
        log.mockRestore();
      }
    },
  );
});
