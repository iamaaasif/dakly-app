import 'reflect-metadata';
import { Controller, Get, Logger, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { Logger as PinoLogger, LoggerModule } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppError, PLATFORM_ERRORS } from '../errors/app-error';
import { AppErrorFilter } from '../errors/app-error.filter';
import { ErrorReporter } from './error-reporter';
import { requestLoggingOptions } from './request-logging';

class LoggingController {
  read() {
    new Logger('LoggingController').log(
      {
        event: 'read',
        phone: '01712345678',
        email: 'private@example.test',
        password: 'private-password',
        code: 'private-code',
        token: 'private-token',
        completionToken: 'private-completion-token',
        cancelToken: 'private-cancel-token',
        backupCodes: ['private-backup'],
        uri: 'private-uri',
        nested: { token: 'private-nested-token' },
      },
      'Read completed',
    );
    return { ok: true };
  }
  create() {
    return this.read();
  }
  fail() {
    throw new DrizzleQueryError(
      'insert into customers values ($1, $2)',
      ['01712345678', 'Synthetic Customer'],
      new Error('private-error-message'),
    );
  }
  business() {
    throw new AppError('STORE_REQUIRED', PLATFORM_ERRORS.STORE_REQUIRED);
  }
}
Controller()(LoggingController);
for (const [path, method] of [
  ['read', 'read'],
  ['failure', 'fail'],
  ['business', 'business'],
] as const) {
  Get(path)(
    LoggingController.prototype,
    method,
    Object.getOwnPropertyDescriptor(LoggingController.prototype, method)!,
  );
}

Post('read')(
  LoggingController.prototype,
  'create',
  Object.getOwnPropertyDescriptor(LoggingController.prototype, 'create')!,
);

describe('request logging over Fastify', () => {
  let app: NestFastifyApplication;
  const lines: string[] = [];
  const events: unknown[] = [];
  const reporter = new ErrorReporter('https://public@example.invalid/1', () => ({
    send: async (event) => {
      events.push(event);
      return { statusCode: 200 };
    },
    flush: async () => true,
  }));
  beforeAll(async () => {
    class LoggingTestModule {}
    Module({
      imports: [
        LoggerModule.forRoot({
          pinoHttp: [requestLoggingOptions(), { write: (line: string) => lines.push(line) }],
        }),
      ],
      controllers: [LoggingController],
    })(LoggingTestModule);
    app = await NestFactory.create<NestFastifyApplication>(
      LoggingTestModule,
      new FastifyAdapter(),
      { logger: false },
    );
    app.useLogger(app.get(PinoLogger));
    app.useGlobalFilters(new AppErrorFilter(reporter));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    lines.length = 0;
  });
  afterAll(async () => {
    await app?.close();
  });

  it('generates correlated request ids without trusting incoming headers or logging request data', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/read?email=private-query@example.test',
      headers: {
        'x-request-id': 'private-client-id',
        authorization: 'Bearer private-auth',
        cookie: 'session=private-cookie',
        'x-person': 'private-header',
      },
    });
    const id = response.headers['x-request-id'];
    expect(id).toMatch(/^[a-f0-9-]{36}$/);
    const records = lines.map((line) => JSON.parse(line));
    expect(
      records.some((record) => record.msg === 'Read completed' && record.requestId === id),
    ).toBe(true);
    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ res: { statusCode: 200 }, requestId: id }),
      ]),
    );
    for (const marker of ['01712345678', 'private-', 'private@example.test'])
      expect(lines.join('')).not.toContain(marker);
    const next = await app.inject('/read');
    expect(next.headers['x-request-id']).not.toBe(id);
    await app.inject('/private-path?token=private-query');
    await app.inject({
      method: 'POST',
      url: '/read',
      payload: { name: 'private-body', address: 'private-address', phone: '01712345678' },
    });
    const malformed = await app.inject({
      method: 'POST',
      url: '/read',
      headers: { 'content-type': 'application/json' },
      payload: '{private-malformed',
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.headers['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);
    expect(lines.join('')).not.toContain('private-');
  });

  it('logs unknown errors once and keeps business errors below error level', async () => {
    lines.length = 0;
    const failure = await app.inject('/failure');
    expect(failure.statusCode).toBe(500);
    expect(failure.json()).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
    });
    const errors = lines.map((line) => JSON.parse(line)).filter((record) => record.level === 50);
    expect(errors).toHaveLength(1);
    expect(
      lines.map((line) => JSON.parse(line)).filter((record) => record.err || record.error),
    ).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      requestId: failure.headers['x-request-id'],
      error: { errorClass: 'DrizzleQueryError', errorCode: 'INTERNAL_ERROR' },
    });
    for (const marker of [
      '01712345678',
      'Synthetic Customer',
      'private-error-message',
      'insert into',
    ]) {
      expect(lines.join('')).not.toContain(marker);
      expect(JSON.stringify(events)).not.toContain(marker);
    }
    await expect.poll(() => events.length).toBe(1);
    expect(JSON.stringify(events)).toContain(failure.headers['x-request-id']);
    lines.length = 0;
    const business = await app.inject('/business');
    expect(business.statusCode).toBe(401);
    expect(
      lines.map((line) => JSON.parse(line)).filter((record) => record.level === 50),
    ).toHaveLength(0);
    await reporter.onApplicationShutdown();
    expect(events).toHaveLength(1);
  });
});
