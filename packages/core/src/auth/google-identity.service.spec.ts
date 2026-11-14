import 'reflect-metadata';
import { performance } from 'node:perf_hooks';
import { Logger, Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger, LoggerModule } from 'nestjs-pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoogleIdentityDriver } from '@dakly/providers/google/google-identity-driver';
import { requestLoggingOptions } from '../platform/logging/request-logging';
import { GOOGLE_IDENTITY_DRIVER } from './google-provider';
import { GoogleIdentityService } from './google-identity.service';

const idToken = 'private-token';

describe('GoogleIdentityService verification metrics', () => {
  let app: INestApplicationContext;
  let failure: Error | undefined;
  const lines: string[] = [];
  const driver: GoogleIdentityDriver = {
    async verify() {
      if (failure) throw failure;
      return {
        subject: 'private-subject',
        email: 'private-email@example.test',
        emailIsAuthoritative: true,
      };
    },
  };
  beforeAll(async () => {
    class GoogleMetricsTestModule {}
    Module({
      imports: [
        LoggerModule.forRoot({
          pinoHttp: [requestLoggingOptions(), { write: (line: string) => lines.push(line) }],
        }),
      ],
      providers: [GoogleIdentityService, { provide: GOOGLE_IDENTITY_DRIVER, useValue: driver }],
    })(GoogleMetricsTestModule);
    app = await NestFactory.createApplicationContext(GoogleMetricsTestModule, { logger: false });
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
        failure = Object.assign(new Error('private-token and private-provider-content'), {
          code: 'GOOGLE_PROVIDER_PRIVATE',
        });
      const clock = vi
        .spyOn(performance, 'now')
        .mockReturnValueOnce(100)
        .mockReturnValueOnce(142.5);
      try {
        const result = app.get(GoogleIdentityService).verify(idToken);
        if (failure)
          await expect(result).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
        else await expect(result).resolves.toMatchObject({ subject: 'private-subject' });
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
        context: 'GoogleIdentityService',
        event: 'metric',
        metric: 'google_identity_verification',
        count: 1,
        durationMilliseconds: 42.5,
        outcome,
        msg: 'Google identity verification measured',
      });
      expect(lines.join('')).not.toContain('private-');
      expect(lines.join('')).not.toContain('GOOGLE_PROVIDER_PRIVATE');
    },
  );
});
