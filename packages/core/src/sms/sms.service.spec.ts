import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { FakeSmsDriver } from '@dakly/providers/sms/fake-sms-driver';
import type { SmsDriver } from '@dakly/providers/sms/sms-driver';

import { SmsService } from './sms.service';

describe('shared SMS delivery', () => {
  it.each(['success', 'failure'] as const)(
    'measures %s without recipient or vendor details',
    async (outcome) => {
      const records: object[] = [];
      const log = vi.spyOn(Logger.prototype, 'log').mockImplementation((entry: object) => {
        records.push(entry);
      });
      const driver = new FakeSmsDriver();
      const failure = new Error('private vendor detail');
      if (outcome === 'failure') vi.spyOn(driver, 'send').mockRejectedValue(failure);
      const service = new SmsService(driver);
      const message = { to: '01712345678', text: 'private link' };
      try {
        if (outcome === 'failure') await expect(service.send(message)).rejects.toBe(failure);
        else {
          await service.send(message);
          expect(driver.messages).toEqual([message]);
        }
        expect(records).toEqual([
          {
            event: 'metric',
            metric: 'sms_delivery',
            count: 1,
            durationMilliseconds: expect.any(Number),
            outcome,
          },
        ]);
        expect(JSON.stringify(records)).not.toContain('private');
        expect(JSON.stringify(records)).not.toContain(message.to);
      } finally {
        log.mockRestore();
      }
    },
  );

  it('gives up on a provider that does not answer within 30 seconds', async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    try {
      const cancelled = vi.fn();
      const driver: SmsDriver = {
        send: (_message, signal) => {
          signal?.addEventListener('abort', cancelled, { once: true });
          return new Promise(() => {});
        },
      };
      const sending = new SmsService(driver).send({ to: '01712345678', text: 'অর্ডার নিশ্চিত' });
      const outcome = expect(sending).rejects.toMatchObject({
        code: 'SMS_SEND_TIMEOUT',
        message: 'The SMS provider did not answer in time',
      });
      await vi.advanceTimersByTimeAsync(30_000);
      await outcome;
      expect(cancelled).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
      vi.useRealTimers();
    }
  });
});
