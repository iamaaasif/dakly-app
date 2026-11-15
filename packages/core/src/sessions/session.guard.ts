import { sessionContextTag } from './session-context';
import { sessionError } from './sessions.errors';
import { Reflector } from '@nestjs/core';
import { ACCESS_RULE, type AccessRule } from '../platform/tenancy/access.decorators';
import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { StoreRequest } from '../platform/tenancy/store-request';
import { TeamService } from '../team/team.service';
import { SessionsService } from './sessions.service';
import { SESSION_COOKIE, setSessionCookie } from '../platform/http/session-cookie';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(TeamService) private readonly team: TeamService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest & StoreRequest>();
    delete request.userId;
    delete request.sessionId;
    delete request.storeId;
    delete request.access;
    const rule = this.reflector.getAllAndOverride<AccessRule>(ACCESS_RULE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (['support', 'support-handoff', 'staff'].includes(rule?.kind ?? '')) return true;
    const token = request.cookies[SESSION_COOKIE];
    if (!token) return true;
    const session = await this.sessions.resolve(token);
    if (!session) return true;
    const access = session.activeStoreId
      ? await this.team.accessFor(session.activeStoreId, session.userId)
      : undefined;
    request.userId = session.userId;
    request.sessionId = session.id;
    if (session.activeStoreId && access) {
      request.storeId = session.activeStoreId;
      request.access = access;
    }
    stampContext(context, request, rule);
    if (session.isRemembered)
      setSessionCookie(context.switchToHttp().getResponse<FastifyReply>(), token, true);
    return true;
  }
}

function stampContext(
  context: ExecutionContext,
  request: FastifyRequest & StoreRequest,
  rule?: AccessRule,
): void {
  const reply = context.switchToHttp().getResponse<FastifyReply>();
  reply.header('Cache-Control', 'no-store');
  const tag = sessionContextTag(request.sessionId!, request.storeId, request.access);
  reply.header('X-Session-Context', tag);

  if (
    requiresContext(request, rule) &&
    request.headers['x-session-context'] !== undefined &&
    request.headers['x-session-context'] !== tag
  )
    throw sessionError('SESSION_CONTEXT_CHANGED');
}

function requiresContext(request: FastifyRequest, rule?: AccessRule): boolean {
  return (
    (rule?.kind === 'user' &&
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      request.routeOptions.url !== '/auth/sign-out') ||
    rule?.kind === 'permission' ||
    rule?.kind === 'member' ||
    request.routeOptions.url === '/me/active-store'
  );
}
