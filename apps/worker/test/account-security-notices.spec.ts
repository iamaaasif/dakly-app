import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SecurityNoticesService } from '@dakly/core/auth/security-notices.service';
import { jobLogBindings } from '@dakly/core/platform/logging/job-context';
import { AccountSecurityNoticesJob } from '../src/account-security-notices.job';

describe('Account security notice polling', () => {
  afterEach(() => vi.useRealTimers());
  it('prevents overlap and waits for active delivery during shutdown', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    let calls = 0;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const job = new AccountSecurityNoticesJob({
      dispatch: () => {
        calls++;
        return pending;
      },
    } as SecurityNoticesService);
    job.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(60000);
    expect(calls).toBe(1);
    let stopped = false;
    const shutdown = job.onApplicationShutdown().then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(60000);
    expect(stopped).toBe(false);
    expect(calls).toBe(1);
    finish();
    await shutdown;
    expect(stopped).toBe(true);
    await vi.advanceTimersByTimeAsync(60000);
    expect(calls).toBe(1);
  });
  it('starts each completed polling batch with a distinct job context', async () => {
    vi.useFakeTimers();
    const jobIds: Array<string | undefined> = [];
    const job = new AccountSecurityNoticesJob({
      dispatch: async () => {
        jobIds.push(jobLogBindings().jobId);
      },
    } as SecurityNoticesService);
    job.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(30000);
    await job.onApplicationShutdown();
    expect(jobIds).toHaveLength(2);
    expect(jobIds.every((id) => Boolean(id))).toBe(true);
    expect(jobIds[0]).not.toBe(jobIds[1]);
    expect(jobLogBindings()).toEqual({});
  });
});
