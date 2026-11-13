import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { activeStoreSchema, type ActiveStoreInput } from '@dakly/contracts/sessions';
import { UsersService } from '../auth/users.service';
import { TeamService } from '../team/team.service';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { RequireUser } from '../platform/tenancy/access.decorators';
import type { StoreRequest } from '../platform/tenancy/store-request';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { SessionsService } from './sessions.service';
import { clearSessionCookie } from './session-cookie';

@Controller()
@RequireUser()
export class SessionsController {
  constructor(
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(TeamService) private readonly team: TeamService,
  ) {}

  @Get('me')
  me(@CurrentUser() userId: string) {
    return this.users.profile(userId);
  }

  @Get('me/stores')
  stores(@CurrentUser() userId: string) {
    return this.team.storesFor(userId);
  }

  @Post('me/active-store')
  @HttpCode(204)
  async activeStore(
    @CurrentUser() userId: string,
    @Req() request: StoreRequest,
    @Body(new ZodValidationPipe(activeStoreSchema)) input: ActiveStoreInput,
  ): Promise<void> {
    await this.sessions.setActiveStore(userId, request.sessionId!, input.storeId);
  }

  @Post('auth/sign-out')
  @HttpCode(204)
  async signOut(
    @CurrentUser() userId: string,
    @Req() request: StoreRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.sessions.revoke(userId, request.sessionId!);
    clearSessionCookie(reply);
  }
}
