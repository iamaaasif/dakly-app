import { inspect } from 'node:util';
import { type ArgumentsHost, ConsoleLogger, Logger, type LoggerService } from '@nestjs/common';
import { afterEach, describe, expect, it } from 'vitest';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { AppErrorFilter } from './app-error.filter';
import { ErrorReporter } from '../logging/error-reporter';

// Capturing the logger sink preserves the real filter and Nest logger boundary.
describe('AppErrorFilter', () => {
  afterEach(() => Logger.overrideLogger(new ConsoleLogger()));

  it('keeps failed query parameters, nested causes and messages out of logs and Sentry', async () => {
    const envelopes: unknown[] = [];
    const reporter = new ErrorReporter('https://public@example.invalid/1', () => ({
      send: async (envelope) => {
        envelopes.push(envelope);
        return { statusCode: 200 };
      },
      flush: async () => true,
    }));
    const logs: string[] = [];
    const sink: LoggerService = {
      log() {},
      warn() {},
      error(value: unknown) {
        logs.push(inspect(value, { depth: 8 }));
      },
    };
    Logger.overrideLogger(sink);
    const failure = new DrizzleQueryError(
      'insert into customers values ($1, $2, $3)',
      [
        '01712345678',
        'Synthetic Customer',
        'private-secret-marker\nprivate otp:123456:12\n    at private otp:654321:12',
      ],
      new Error('private-secret-marker'),
    );
    let status = 0;
    let body: unknown;
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ raw: { id: 'c61f9f3a-fdde-4ff9-ae94-1b41bcd2cd66' } }),
        getResponse: () => ({
          status(value: number) {
            status = value;
            return { send: (value: unknown) => (body = value) };
          },
        }),
      }),
    } as unknown as ArgumentsHost;
    new AppErrorFilter(reporter).catch(failure, host);
    await reporter.onApplicationShutdown();
    expect(status).toBe(500);
    expect(body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
    expect(logs).toHaveLength(1);
    expect(envelopes).toHaveLength(1);
    expect(JSON.stringify(envelopes)).toContain('c61f9f3a-fdde-4ff9-ae94-1b41bcd2cd66');
    for (const marker of [
      '01712345678',
      'Synthetic Customer',
      'private-secret-marker',
      'insert into',
      '123456',
      '654321',
    ]) {
      expect(logs.join('\n')).not.toContain(marker);
      expect(JSON.stringify(envelopes)).not.toContain(marker);
    }
    expect(logs[0]).toContain('DrizzleQueryError');
  });
});
