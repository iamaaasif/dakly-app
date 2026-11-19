import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { FakeSmsDriver } from '@dakly/providers/sms/fake-sms-driver';
import { type SmsDriver, SmsSendRefused, SmsSendTimeout } from '@dakly/providers/sms/sms-driver';

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

  it('turns a provider refusal into SMS_SEND_REFUSED and passes other errors on', async () => {
    const driver = new FakeSmsDriver();
    const service = new SmsService(driver);
    const message = { to: '01712345678', text: 'অফার' };
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(driver, 'send').mockRejectedValueOnce(new SmsSendRefused());
    await expect(service.send(message)).rejects.toMatchObject({ code: 'SMS_SEND_REFUSED' });
    const timeout = new Error('timed out');
    vi.spyOn(driver, 'send').mockRejectedValueOnce(timeout);
    await expect(service.send(message)).rejects.toBe(timeout);
    vi.restoreAllMocks();
  });

  it.each([
    { label: 'never answers', refusesOnAbort: false },
    { label: 'rejects as refused when aborted', refusesOnAbort: true },
  ])(
    'reports an unknown outcome after 30 seconds when the provider $label',
    async ({ refusesOnAbort }) => {
      vi.useFakeTimers();
      const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      try {
        const cancelled = vi.fn();
        const driver: SmsDriver = {
          send: (_message, signal) =>
            new Promise((_resolve, reject) => {
              signal?.addEventListener(
                'abort',
                () => {
                  cancelled();
                  if (refusesOnAbort) reject(new SmsSendRefused());
                },
                { once: true },
              );
            }),
        };
        const sending = new SmsService(driver).send({ to: '01712345678', text: 'অর্ডার নিশ্চিত' });
        let settled = false;
        const outcome = sending.catch((error: unknown) => error).finally(() => (settled = true));
        await vi.advanceTimersByTimeAsync(29_999);
        expect(settled).toBe(false);
        expect(cancelled).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);
        const error = await outcome;
        expect(error).toBeInstanceOf(SmsSendTimeout);
        expect(error).toMatchObject({
          code: 'SMS_SEND_TIMEOUT',
          message: 'The SMS provider did not answer in time',
        });
        expect(cancelled).toHaveBeenCalledTimes(1);
      } finally {
        log.mockRestore();
        vi.useRealTimers();
      }
    },
  );
});
