import { describe, expect, it, vi } from 'vitest';

import type { CampaignBatchService } from '../campaign-batch.service';
import { SendCampaignBatchJob } from './send-campaign-batch.job';

const storeId = '019c01ea-cf15-7d31-a7f5-d73d66007ad7';

function buildJob(sendStoreBatch: CampaignBatchService['sendStoreBatch']) {
  return new SendCampaignBatchJob({ sendStoreBatch } as CampaignBatchService);
}

describe('campaign batch job', () => {
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
