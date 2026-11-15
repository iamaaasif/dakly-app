import type { ExecutionContext } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetEnvForTests } from '../config/env';
import { OriginGuard } from './origin.guard';

const context = (method: string, origin?: string) =>
  ({
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ method, headers: { origin } }) }),
  }) as ExecutionContext;

describe('OriginGuard', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvForTests();
  });
  const guard = () => {
    vi.stubEnv('DATABASE_URL', 'postgres://localhost/dakly');
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
    vi.stubEnv('WEB_ORIGINS', 'https://dakly.test,https://preview.dakly.test');
    return new OriginGuard();
  };
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'checks missing, foreign and approved origins on %s',
    (method) => {
      const originGuard = guard();
      for (const origin of [undefined, 'null', 'https://dakly.test.evil.test']) {
        expect(() => originGuard.canActivate(context(method, origin))).toThrow(
          expect.objectContaining({ code: 'ORIGIN_REJECTED', status: 403 }),
        );
      }
      expect(originGuard.canActivate(context(method, 'https://dakly.test'))).toBe(true);
      expect(originGuard.canActivate(context(method, 'https://preview.dakly.test'))).toBe(true);
    },
  );
  it('allows reads without an Origin', () => {
    expect(guard().canActivate(context('GET'))).toBe(true);
  });
});
