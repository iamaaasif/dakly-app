import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { SSE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { PinoLogger } from 'nestjs-pino';

import { SESSION_COOKIE, setSessionCookie } from '../platform/http/session-cookie';
import { bindVerifiedStore } from '../platform/logging/request-logging';
import { ACCESS_RULE, type AccessRule } from '../platform/tenancy/access.decorators';
import type { StoreRequest } from '../platform/tenancy/store-request';
import { TeamService } from '../team/team.service';
import { sessionContextTag } from './session-context';
import { SKIP_SESSION_CONTEXT_CHECK } from './session-context-check.decorator';
import { sessionError } from './sessions.errors';
import { SessionsService } from './sessions.service';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(TeamService) private readonly team: TeamService,
    @Optional() @Inject(PinoLogger) private readonly logger?: PinoLogger,
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
      bindVerifiedStore(this.logger, session.activeStoreId);
    }
    const isStream =
      this.reflector.get<true | undefined>(SSE_METADATA, context.getHandler()) === true;
    stampContext(context, request, this.checksContext(context, request, rule), isStream);
    if (session.isRemembered)
      setSessionCookie(context.switchToHttp().getResponse<FastifyReply>(), token, true);
    return true;
  }

  private checksContext(
    context: ExecutionContext,
    request: FastifyRequest,
    rule?: AccessRule,
  ): boolean {
    const skips = this.reflector.getAllAndOverride<boolean>(SKIP_SESSION_CONTEXT_CHECK, [
      context.getHandler(),
      context.getClass(),
    ]);
    return !skips && requiresContext(request, rule);
  }
}

function stampContext(
  context: ExecutionContext,
  request: FastifyRequest & StoreRequest,
  checksContext: boolean,
  isStream: boolean,
): void {
  const reply = context.switchToHttp().getResponse<FastifyReply>();
  // Nest sends its own no-store Cache-Control on a stream and keeps the reply's beside it.
  if (!isStream) reply.header('Cache-Control', 'no-store');
  const tag = sessionContextTag(request.sessionId!, request.storeId, request.access);
  reply.header('X-Session-Context', tag);

  if (
    checksContext &&
    request.headers['x-session-context'] !== undefined &&
    request.headers['x-session-context'] !== tag
  )
    throw sessionError('SESSION_CONTEXT_CHANGED');
}

function requiresContext(request: FastifyRequest, rule?: AccessRule): boolean {
  return (
    (rule?.kind === 'user' && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) ||
    rule?.kind === 'permission' ||
    rule?.kind === 'member'
  );
}
