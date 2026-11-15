import { getGlobalScope } from '@sentry/core';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { afterEach, describe, expect, it } from 'vitest';

import { ErrorReporter } from './error-reporter';
import { serializeError } from './safe-error';

describe('ErrorReporter', () => {
  afterEach(() => getGlobalScope().clear());
  it.each(['request', 'job'] as const)(
    'sends only the safe error and %s context through Sentry',
    async (kind) => {
      getGlobalScope().setUser({ email: 'private-global-email' });
      getGlobalScope().addBreadcrumb({ message: 'private-global-breadcrumb' });
      const envelopes: unknown[] = [];
      const reporter = new ErrorReporter('https://public@example.invalid/1', () => ({
        send: async (envelope) => {
          envelopes.push(envelope);
          return { statusCode: 200 };
        },
        flush: async () => true,
      }));
      const failure = new DrizzleQueryError(
        'insert into customers values ($1, $2)',
        ['01712345678', 'Synthetic Customer'],
        new Error('private-secret-marker'),
      );
      if (kind === 'request')
        reporter.report(serializeError(failure), '2b59ea1c-40f5-4f30-a84b-b60ae6ec31a3');
      else reporter.reportJob(serializeError(failure), '2b59ea1c-40f5-4f30-a84b-b60ae6ec31a3');
      await reporter.onApplicationShutdown();
      expect(envelopes).toHaveLength(1);
      const event = JSON.stringify(envelopes);
      for (const marker of [
        '01712345678',
        'Synthetic Customer',
        'private-secret-marker',
        'insert into',
        'private-global-email',
        'private-global-breadcrumb',
      ])
        expect(event).not.toContain(marker);
      expect(event).toContain(kind === 'request' ? 'requestId' : 'jobId');
      expect(event).toContain('DrizzleQueryError');
      expect(event).toContain('INTERNAL_ERROR');
      expect(event).toContain('2b59ea1c-40f5-4f30-a84b-b60ae6ec31a3');
      expect(event).toContain('platform/logging/error-reporter.spec.ts:');
    },
  );

  it('does not create a transport without SENTRY_DSN', async () => {
    let transports = 0;
    const reporter = new ErrorReporter(undefined, () => {
      transports++;
      return { send: async () => ({ statusCode: 200 }), flush: async () => true };
    });
    reporter.report(serializeError(new Error('private-secret-marker')), 'request-id');
    await reporter.onApplicationShutdown();
    expect(transports).toBe(0);
  });
});
