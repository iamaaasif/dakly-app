import {
  Body,
  Controller,
  Delete,
  Param,
  Query,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import {
  userStorePageSchema,
  type UserStorePageQuery,
  sessionListSchema,
  sessionIdSchema,
  activeStoreSchema,
  type ActiveStoreInput,
  type SessionContext,
} from '@dakly/contracts/sessions';

import { UsersService } from '../auth/users.service';
import { clearSessionCookie } from '../platform/http/session-cookie';
import { RequireUser } from '../platform/tenancy/access.decorators';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import type { StoreRequest } from '../platform/tenancy/store-request';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { TeamService } from '../team/team.service';
import { SessionsService } from './sessions.service';

@Controller()
@RequireUser()
export class SessionsController {
  constructor(
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(TeamService) private readonly team: TeamService,
  ) {}

  @Get('me/sessions')
  devices(
    @CurrentUser() userId: string,
    @Req() request: StoreRequest,
    @Query(new ZodValidationPipe(sessionListSchema)) query: { before?: string },
  ) {
    return this.sessions.list(userId, request.sessionId!, query.before);
  }
  @Delete('me/sessions/:sessionId')
  @HttpCode(204)
  async revoke(
    @CurrentUser() userId: string,
    @Param('sessionId', new ZodValidationPipe(sessionIdSchema)) sessionId: string,
    @Req() request: StoreRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    await this.sessions.revoke(userId, sessionId);
    if (request.sessionId === sessionId) clearSessionCookie(reply);
  }
  @Post('me/sessions/sign-out-others')
  @HttpCode(204)
  revokeOthers(@CurrentUser() userId: string, @Req() request: StoreRequest) {
    return this.sessions.revokeOthers(userId, request.sessionId!);
  }

  @Get('me')
  me(@CurrentUser() userId: string) {
    return this.users.profile(userId);
  }

  @Get('me/context')
  context(@CurrentUser() userId: string, @Req() request: StoreRequest): Promise<SessionContext> {
    return this.sessions.context(userId, request.sessionId!, request.storeId, request.access);
  }

  @Get('me/stores')
  stores(
    @CurrentUser() userId: string,
    @Query(new ZodValidationPipe(userStorePageSchema)) query: UserStorePageQuery,
  ) {
    return this.team.storesFor(userId, query);
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
