import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ACCESS_RULE, type AccessRule } from '../platform/tenancy/access.decorators';
import type { TeamService } from '../team/team.service';
import type { SessionsService } from './sessions.service';
import { SessionGuard } from './session.guard';

describe('SessionGuard separate trust domains', () => {
  it.each(['staff', 'support', 'support-handoff'] as const)(
    'leaves %s writes to their own authentication even with a stale shop tag',
    async (kind) => {
      const handler = () => undefined;
      const rule: AccessRule =
        kind === 'staff' ? { kind, authenticated: true, roles: [] } : { kind };
      Reflect.defineMetadata(ACCESS_RULE, rule, handler);
      const request = {
        method: 'POST',
        cookies: { dakly_session: 'old-shop-cookie' },
        headers: { 'x-session-context': 'old-shop-context' },
      };
      const context = {
        getHandler: () => handler,
        getClass: () => Object,
        switchToHttp: () => ({
          getRequest: () => request,
          getResponse: () => ({
            header: () => {
              throw new Error('Shop state must not stamp another trust domain');
            },
          }),
        }),
      } as unknown as ExecutionContext;
      const sessions = {
        resolve: () => {
          throw new Error('Shop sessions must not govern staff or support writes');
        },
      } as unknown as SessionsService;
      const guard = new SessionGuard(new Reflector(), sessions, {} as TeamService);
      expect(await guard.canActivate(context)).toBe(true);
    },
  );
});
