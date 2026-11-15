import 'reflect-metadata';
import { performance } from 'node:perf_hooks';
import { Logger, Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger, LoggerModule } from 'nestjs-pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmailDriver } from '@dakly/providers/email/email-driver';
import { requestLoggingOptions } from '../platform/logging/request-logging';
import { EMAIL_DRIVER } from './email-provider';
import { EmailService } from './email.service';

const message = {
  to: 'private-recipient@example.test',
  subject: 'private-subject',
  text: 'private-code 123456',
  html: '<p>private-content</p>',
};

describe('EmailService delivery metrics', () => {
  let app: INestApplicationContext;
  let failure: Error | undefined;
  const lines: string[] = [];
  const driver: EmailDriver = {
    async send() {
      if (failure) throw failure;
    },
  };
  beforeAll(async () => {
    class EmailMetricsTestModule {}
    Module({
      imports: [
        LoggerModule.forRoot({
          pinoHttp: [requestLoggingOptions(), { write: (line: string) => lines.push(line) }],
        }),
      ],
      providers: [EmailService, { provide: EMAIL_DRIVER, useValue: driver }],
    })(EmailMetricsTestModule);
    app = await NestFactory.createApplicationContext(EmailMetricsTestModule, { logger: false });
    app.useLogger(app.get(PinoLogger));
  });
  beforeEach(() => {
    lines.length = 0;
    failure = undefined;
  });
  afterAll(async () => {
    await app.close();
    Logger.overrideLogger(false);
  });

  it.each(['success', 'failure'] as const)(
    'records one count and monotonic duration for %s without personal data',
    async (outcome) => {
      if (outcome === 'failure')
        failure = Object.assign(new Error('Email delivery failed'), { code: 'EMAIL_SEND_FAILED' });
      const clock = vi
        .spyOn(performance, 'now')
        .mockReturnValueOnce(100)
        .mockReturnValueOnce(142.5);
      try {
        const result = app.get(EmailService).send(message);
        if (failure) await expect(result).rejects.toBe(failure);
        else await expect(result).resolves.toBeUndefined();
      } finally {
        clock.mockRestore();
      }
      const records = lines.map((line) => JSON.parse(line));
      expect(records).toHaveLength(1);
      expect(records[0]).toEqual({
        level: 30,
        time: expect.any(Number),
        pid: expect.any(Number),
        hostname: expect.any(String),
        context: 'EmailService',
        event: 'metric',
        metric: 'email_delivery',
        count: 1,
        durationMilliseconds: 42.5,
        outcome,
        msg: 'Email delivery measured',
      });
      expect(lines.join('')).not.toContain('private-');
      expect(lines.join('')).not.toContain('123456');
      expect(lines.join('')).not.toContain('EMAIL_SEND_FAILED');
    },
  );
});
