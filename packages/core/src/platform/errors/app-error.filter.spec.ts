import { inspect } from 'node:util';

import { type ArgumentsHost, ConsoleLogger, Logger, type LoggerService } from '@nestjs/common';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { afterEach, describe, expect, it } from 'vitest';

import { CRYPTO_ERRORS } from '../crypto/crypto.errors';
import { ErrorReporter } from '../logging/error-reporter';
import { AppError, PLATFORM_ERRORS } from './app-error';
import { AppErrorFilter } from './app-error.filter';

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

  it('logs and reports an AppError with a 5xx status, and keeps its response body', async () => {
    const { reporter, envelopes, logs, host, sent } = captureFilterOutput();
    new AppErrorFilter(reporter).catch(
      new AppError('DECRYPTION_FAILED', CRYPTO_ERRORS.DECRYPTION_FAILED),
      host,
    );
    await reporter.onApplicationShutdown();
    expect(sent).toEqual({
      status: 500,
      body: { error: { code: 'DECRYPTION_FAILED', message: 'Unable to decrypt secret' } },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('Request failed');
    expect(envelopes).toHaveLength(1);
    expect(JSON.stringify(envelopes)).toContain('c61f9f3a-fdde-4ff9-ae94-1b41bcd2cd66');
  });

  it('neither logs nor reports an AppError with a 4xx status', async () => {
    const { reporter, envelopes, logs, host, sent } = captureFilterOutput();
    new AppErrorFilter(reporter).catch(
      new AppError('PERMISSION_DENIED', PLATFORM_ERRORS.PERMISSION_DENIED),
      host,
    );
    await reporter.onApplicationShutdown();
    expect(sent).toEqual({
      status: 403,
      body: {
        error: { code: 'PERMISSION_DENIED', message: 'You do not have permission to do this' },
      },
    });
    expect(logs).toHaveLength(0);
    expect(envelopes).toHaveLength(0);
  });
});

function captureFilterOutput() {
  const envelopes: unknown[] = [];
  const reporter = new ErrorReporter('https://public@example.invalid/1', () => ({
    send: async (envelope) => {
      envelopes.push(envelope);
      return { statusCode: 200 };
    },
    flush: async () => true,
  }));
  const logs: string[] = [];
  Logger.overrideLogger({
    log() {},
    warn() {},
    error(...values: unknown[]) {
      logs.push(inspect(values, { depth: 8 }));
    },
  });
  const sent: { status?: number; body?: unknown } = {};
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ raw: { id: 'c61f9f3a-fdde-4ff9-ae94-1b41bcd2cd66' } }),
      getResponse: () => ({
        status(value: number) {
          sent.status = value;
          return { send: (value: unknown) => (sent.body = value) };
        },
      }),
    }),
  } as unknown as ArgumentsHost;
  return { reporter, envelopes, logs, host, sent };
}
