import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorReporter } from '../../platform/logging/error-reporter';
import type { StaffAlertsService } from '../staff-alerts.service';
import { StaffAlertRelayJob } from './staff-alert-relay.job';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe('Staff alert worker lifecycle', () => {
  it('awaits active relay work at shutdown, avoids overlap and uses bounded retry/deduplicated global IDs', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const waiting = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const id = randomUUID();
    const pending = vi.fn().mockResolvedValue([{ id }]);
    const added: unknown[][] = [];
    const queue = {
      getJob: async () => undefined,
      add: async (...args: unknown[]) => {
        added.push(args);
        await waiting;
      },
    };
    const relay = new StaffAlertRelayJob(
      { pending } as unknown as StaffAlertsService,
      queue as unknown as Queue,
      new ErrorReporter(undefined),
    );
    relay.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(90000);
    expect(pending).toHaveBeenCalledTimes(1);
    let stopped = false;
    const shutdown = relay.onApplicationShutdown().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    finish();
    await shutdown;
    expect(added).toEqual([
      [
        'staff-alert-delivery',
        { auditId: id },
        {
          jobId: id,
          attempts: 5,
          backoff: { type: 'exponential', delay: 30000 },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      ],
    ]);
    await vi.advanceTimersByTimeAsync(90000);
    expect(pending).toHaveBeenCalledTimes(1);
  });
  it('reports queue outages without leaking errors or leaving rejected shutdown work', async () => {
    vi.useFakeTimers();
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const reporter = new ErrorReporter(undefined);
    const report = vi.spyOn(reporter, 'reportJob').mockImplementation(() => undefined);
    const relay = new StaffAlertRelayJob(
      {
        pending: async () => {
          throw new Error('private-provider-token');
        },
      } as unknown as StaffAlertsService,
      {} as Queue,
      reporter,
    );
    relay.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    await relay.onApplicationShutdown();
    expect(report).toHaveBeenCalledOnce();
    expect(JSON.stringify(report.mock.calls)).not.toContain('private-provider-token');
  });
});
