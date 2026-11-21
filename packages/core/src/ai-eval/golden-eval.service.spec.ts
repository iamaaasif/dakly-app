import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StaffAlertsService } from '../admin/staff-alerts.service';
import type { AiPracticeService } from '../ai-agent/ai-practice.service';
import { GoldenEvalService } from './golden-eval.service';
import { activeGoldenCases, allRecordedOutcomes } from './golden-set.sample';

const env = vi.hoisted(() => ({ AI_EVAL_STORE_ID: undefined as string | undefined }));
vi.mock('../platform/config/env', () => ({ loadEnv: () => env }));

const answerFrom = (outcomes: typeof allRecordedOutcomes) => {
  const ask = vi.fn(async (_storeId: string, question: string) => {
    const golden = activeGoldenCases.find((item) => item.question === question)!;
    return outcomes[golden.id]!;
  });
  return { ask } as unknown as AiPracticeService;
};

describe('GoldenEvalService.runNightly', () => {
  const notify = vi.fn<StaffAlertsService['notify']>();
  const alerts = { notify } as unknown as StaffAlertsService;

  beforeEach(() => {
    env.AI_EVAL_STORE_ID = '0198f2b0-0000-7000-8000-000000000001';
    notify.mockReset().mockResolvedValue(true);
  });

  it('does nothing without an eval shop', async () => {
    env.AI_EVAL_STORE_ID = undefined;
    const service = new GoldenEvalService(answerFrom(allRecordedOutcomes), alerts);
    await expect(service.runNightly()).resolves.toBeUndefined();
    expect(notify).not.toHaveBeenCalled();
  });

  it('returns a passing report without an alert', async () => {
    const service = new GoldenEvalService(answerFrom(allRecordedOutcomes), alerts);
    await expect(service.runNightly()).resolves.toMatchObject({ passed: true });
    expect(notify).not.toHaveBeenCalled();
  });

  it('alerts staff and returns normally when a price is wrong', async () => {
    const service = new GoldenEvalService(
      answerFrom({ ...allRecordedOutcomes, 'price-bn': { kind: 'reply', text: '৳999' } }),
      alerts,
    );
    await expect(service.runNightly()).resolves.toMatchObject({ passed: false });
    expect(notify).toHaveBeenCalledOnce();
    expect(notify.mock.calls[0]![1]).toContain('price-bn');
  });

  it('still returns normally when the alert cannot be sent', async () => {
    notify.mockRejectedValue(new Error('slack down'));
    const service = new GoldenEvalService(
      answerFrom({ ...allRecordedOutcomes, 'price-bn': { kind: 'reply', text: '৳999' } }),
      alerts,
    );
    await expect(service.runNightly()).resolves.toMatchObject({ passed: false });
  });
});
