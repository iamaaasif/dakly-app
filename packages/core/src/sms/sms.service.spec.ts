import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { FakeSmsDriver } from '@dakly/providers/sms/fake-sms-driver';

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
});
