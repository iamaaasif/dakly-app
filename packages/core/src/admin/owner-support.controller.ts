import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import {
  supportPageSchema,
  supportDecisionSchema,
  type SupportDecisionInput,
  type SupportPageQuery,
} from '@dakly/contracts/support';

import { AnyMember } from '../platform/tenancy/access.decorators';
import { CurrentSession } from '../platform/tenancy/current-session.decorator';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { SupportOwnerService } from './support-owner.service';

@Controller('support-access')
@AnyMember()
export class OwnerSupportController {
  constructor(@Inject(SupportOwnerService) private readonly support: SupportOwnerService) {}
  @Get()
  list(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentSession() sessionId: string,
    @Query(new ZodValidationPipe(supportPageSchema)) query: SupportPageQuery,
  ) {
    return this.support.ownerRequests(storeId, userId, sessionId, query.before);
  }

  @Post(':id/code')
  code(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentSession() sessionId: string,
    @Req() request: FastifyRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.support.requestCode(storeId, { id, userId, sessionId, ip: request.ip });
  }

  @Post(':id/approve')
  approve(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentSession() sessionId: string,
    @Req() request: FastifyRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(supportDecisionSchema)) input: SupportDecisionInput,
  ) {
    return this.support.approve(storeId, {
      id,
      userId,
      sessionId,
      code: input.code,
      ip: request.ip,
    });
  }

  @Post(':id/deny')
  deny(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentSession() sessionId: string,
    @Req() request: FastifyRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.support.end(storeId, {
      id,
      userId,
      sessionId,
      decision: 'denied',
      ip: request.ip,
    });
  }

  @Post(':id/end')
  end(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentSession() sessionId: string,
    @Req() request: FastifyRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.support.end(storeId, {
      id,
      userId,
      sessionId,
      decision: 'ended',
      ip: request.ip,
    });
  }
}
