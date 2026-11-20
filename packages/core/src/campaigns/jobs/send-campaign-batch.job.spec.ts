import type { Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';

import type { CampaignSenderService } from '../campaign-sender.service';
import { SendCampaignBatchJob } from './send-campaign-batch.job';

const payload = {
  storeId: '019c01ea-cf15-7d31-a7f5-d73d66007ad7',
  campaignId: '019c01ea-cf15-7d31-a7f5-d73d66007ad8',
};

function buildJob(sender: { sendBatch: CampaignSenderService['sendBatch'] }) {
  const client = { runCommand: vi.fn().mockResolvedValueOnce('OK').mockResolvedValueOnce(1) };
  const queue = { client: Promise.resolve(client), toKey: (key: string) => `test:${key}` };
  return new SendCampaignBatchJob(
    sender as unknown as CampaignSenderService,
    queue as unknown as Queue,
  );
}

describe('campaign batch job', () => {
  it('delays the same job until the sender can continue', async () => {
    const next = new Date('2026-11-16T05:00:00Z');
    const sender = { sendBatch: vi.fn().mockResolvedValue(next) };
    const job = buildJob(sender);

    expect(await job.handle(payload)).toEqual({ delayUntil: next.getTime() });
    expect(sender.sendBatch).toHaveBeenCalledWith(
      payload.storeId,
      payload.campaignId,
      expect.any(Function),
    );
  });

  it('lets the batch finish when there is no continuation', async () => {
    const sender = { sendBatch: vi.fn().mockResolvedValue(null) };
    const job = buildJob(sender);

    expect(await job.handle(payload)).toBeUndefined();
  });
});
