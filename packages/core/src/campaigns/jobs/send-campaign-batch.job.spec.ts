import { describe, expect, it, vi } from 'vitest';

import type { BillingService } from '../../billing/billing.service';
import type { KillSwitchesService } from '../../kill-switches/kill-switches.service';
import type { CampaignBatchService } from '../campaign-batch.service';
import { SendCampaignBatchJob } from './send-campaign-batch.job';

const storeId = '019c01ea-cf15-7d31-a7f5-d73d66007ad7';

function buildJob(
  sendStoreBatch: CampaignBatchService['sendStoreBatch'],
  deferIfPaused: KillSwitchesService['deferIfPaused'] = async () => undefined,
  deferIfReadOnly: BillingService['deferIfReadOnly'] = async () => undefined,
) {
  return new SendCampaignBatchJob(
    { sendStoreBatch } as CampaignBatchService,
    {
      deferIfPaused,
    } as KillSwitchesService,
    { deferIfReadOnly } as BillingService,
  );
}

describe('campaign batch job', () => {
  it('waits instead of sending while the store is read-only', async () => {
    const sendStoreBatch = vi.fn();
    const delayUntil = Date.now() + 300_000;
    const job = buildJob(sendStoreBatch, undefined, async () => ({ delayUntil }));

    expect(await job.handle({ storeId })).toEqual({ delayUntil });
    expect(sendStoreBatch).not.toHaveBeenCalled();
  });

  it('waits instead of sending while campaign sending is paused', async () => {
    const sendStoreBatch = vi.fn();
    const delayUntil = Date.now() + 60_000;
    const job = buildJob(sendStoreBatch, async () => ({ delayUntil }));

    expect(await job.handle({ storeId })).toEqual({ delayUntil });
    expect(sendStoreBatch).not.toHaveBeenCalled();
  });

  it('delays the same job until the sender can continue', async () => {
    const next = new Date('2026-11-16T05:00:00Z');
    const sendStoreBatch = vi.fn().mockResolvedValue({ delayUntil: next.getTime() });
    const job = buildJob(sendStoreBatch);

    expect(await job.handle({ storeId })).toEqual({ delayUntil: next.getTime() });
    expect(sendStoreBatch).toHaveBeenCalledWith(storeId);
  });

  it('lets the batch finish when there is no continuation', async () => {
    const sendStoreBatch = vi.fn().mockResolvedValue(undefined);
    const job = buildJob(sendStoreBatch);

    expect(await job.handle({ storeId })).toBeUndefined();
  });
});
