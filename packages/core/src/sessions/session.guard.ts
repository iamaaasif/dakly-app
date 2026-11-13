import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { StoreRequest } from '../platform/tenancy/store-request';
import { TeamService } from '../team/team.service';
import { SessionsService } from './sessions.service';
import { SESSION_COOKIE, setSessionCookie } from '../platform/http/session-cookie';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(TeamService) private readonly team: TeamService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest & StoreRequest>();
    delete request.userId;
    delete request.sessionId;
    delete request.storeId;
    delete request.access;
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
    if (session.isRemembered)
      setSessionCookie(context.switchToHttp().getResponse<FastifyReply>(), token, true);
    return true;
  }
}
