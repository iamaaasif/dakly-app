import type { ExecutionContext } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetEnvForTests } from '../config/env';
import { AllowShortLinkOrigin, ProviderCallback, Public, RequireUser } from './access.decorators';
import { OriginGuard } from './origin.guard';

const context = (method: string, origin?: string, handler = function handler() {}) =>
  ({
    getHandler: () => handler,
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
  it('accepts the short link origin only where a route allows it', () => {
    vi.stubEnv('SHORT_LINK_BASE_URL', 'https://links.dakly.test/l');
    const originGuard = guard();
    const signIn = function requestCode() {};
    Public()(signIn, 'requestCode', { value: signIn });
    const optOut = function optOut() {};
    Public()(optOut, 'optOut', { value: optOut });
    AllowShortLinkOrigin()(optOut, 'optOut', { value: optOut });

    expect(() =>
      originGuard.canActivate(context('POST', 'https://links.dakly.test', signIn)),
    ).toThrow(expect.objectContaining({ code: 'ORIGIN_REJECTED' }));
    expect(originGuard.canActivate(context('POST', 'https://links.dakly.test', optOut))).toBe(true);
    expect(originGuard.canActivate(context('POST', 'https://dakly.test', optOut))).toBe(true);
  });
  it('allows an originless write only on a public provider callback', () => {
    const originGuard = guard();
    const callback = function receive() {};
    Public()(callback, 'receive', { value: callback });
    ProviderCallback()(callback, 'receive', { value: callback });
    expect(originGuard.canActivate(context('POST', undefined, callback))).toBe(true);

    RequireUser()(callback, 'receive', { value: callback });
    expect(() => originGuard.canActivate(context('POST', undefined, callback))).toThrow(
      expect.objectContaining({ code: 'ORIGIN_REJECTED' }),
    );
  });

  it('allows reads without an Origin', () => {
    expect(guard().canActivate(context('GET'))).toBe(true);
  });
});
