import 'reflect-metadata';
import { Logger, Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger, LoggerModule } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { EmailService } from '../email/email.service';
import { jobLogBindings, runWithJobContext } from '../platform/logging/job-context';
import { requestLoggingOptions } from '../platform/logging/request-logging';
import { SmsService } from '../sms/sms.service';

describe('Job logging context', () => {
  const lines: string[] = [];
  let app: INestApplicationContext;
  beforeAll(async () => {
    class TestModule {}
    Module({
      imports: [
        LoggerModule.forRoot({
          pinoHttp: [
            { ...requestLoggingOptions(), mixin: jobLogBindings },
            { write: (line: string) => lines.push(line) },
          ],
        }),
      ],
    })(TestModule);
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    app.useLogger(app.get(PinoLogger));
    lines.length = 0;
  });
  afterAll(async () => {
    await app.close();
  });
  it('isolates concurrent jobs and adds IDs to nested vendor metrics without secrets', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sms = new SmsService({
      send: async () => {
        await gate;
        return { providerMessageId: 'private-provider' };
      },
    });
    const email = new EmailService({ send: async () => undefined });
    const first = runWithJobContext(() => sms.send({ to: '01712345678', text: 'private-code' }));
    await runWithJobContext(() =>
      email.send({ to: 'private@example.test', subject: 'private-subject', text: 'private-token' }),
    );
    release();
    await first;
    const records = lines
      .map((line) => JSON.parse(line))
      .filter((record) => record.event === 'metric');
    expect(records).toHaveLength(2);
    expect(records.map((record) => record.metric).sort()).toEqual([
      'email_delivery',
      'sms_delivery',
    ]);
    expect(records.every((record) => /^[a-f0-9-]{36}$/.test(record.jobId))).toBe(true);
    expect(new Set(records.map((record) => record.jobId)).size).toBe(2);
    expect(lines.join('')).not.toMatch(/private-|01712345678|private@example/);
    expect(jobLogBindings()).toEqual({});
    new Logger('Outside').log('Outside job');
    expect(JSON.parse(lines.at(-1)!)).not.toHaveProperty('jobId');
  });
});
