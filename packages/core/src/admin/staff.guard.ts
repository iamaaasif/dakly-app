import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AccessIdentity } from '@dakly/providers/cloudflare/access-driver';
import type { StaffIdentity } from '@dakly/contracts/staff-auth';
import { ACCESS_RULE, type AccessRule } from '../platform/tenancy/access.decorators';
import { StaffAccessService } from './staff-access.service';
import { StaffSessionsService } from './staff-sessions.service';
import { STAFF_COOKIE } from './staff-cookie';
export type StaffRequest = FastifyRequest & { staffAccess: AccessIdentity; staff: StaffIdentity };
@Injectable()
export class StaffGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(StaffAccessService) private readonly access: StaffAccessService,
    @Inject(StaffSessionsService) private readonly sessions: StaffSessionsService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.getAllAndOverride<AccessRule>(ACCESS_RULE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (rule?.kind !== 'staff') return true;
    context.switchToHttp().getResponse<FastifyReply>().header('Cache-Control', 'no-store');
    const request = context.switchToHttp().getRequest<StaffRequest>();
    const assertion = request.headers['cf-access-jwt-assertion'];
    request.staffAccess = await this.access.verify(
      typeof assertion === 'string' ? assertion : undefined,
      request.hostname,
      request.headers.origin,
      request.method,
    );
    if (rule.authenticated) {
      request.staff = await this.sessions.resolve(
        request.cookies[STAFF_COOKIE],
        request.staffAccess,
      );
      if (rule.roles.length) this.access.assertRole(request.staff, rule.roles);
    }
    return true;
  }
}
