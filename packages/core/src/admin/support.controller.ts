import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { createCustomerSchema, type CreateCustomerInput } from '@dakly/contracts/customers';
import {
  supportRequestSchema,
  supportPageSchema,
  supportDecisionSchema,
  supportTargetSchema,
  supportHandoffSchema,
  type SupportRequestInput,
} from '@dakly/contracts/support';

import { loadEnv } from '../platform/config/env';
import {
  StaffAccess,
  AnyMember,
  SupportAccess,
  SupportHandoff,
} from '../platform/tenancy/access.decorators';
import { CurrentSession } from '../platform/tenancy/current-session.decorator';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import type { StaffRequest } from './staff.guard';
import { SupportOwnerService } from './support-owner.service';
import { supportRoles } from './support-roles';
import { SupportService } from './support.service';

const cookie = 'dakly_support';
@Controller('admin/support')
@StaffAccess(true, supportRoles)
export class StaffSupportController {
  constructor(@Inject(SupportService) private readonly support: SupportService) {}
  @Get('targets')
  targets(
    @Req() request: StaffRequest,
    @Query(new ZodValidationPipe(supportTargetSchema)) input: { query: string },
  ) {
    return this.support.targets(request.staff, input.query);
  }

  @Get()
  list(
    @Req() request: StaffRequest,
    @Query(new ZodValidationPipe(supportPageSchema)) query: { before?: string },
  ) {
    return this.support.requested(request.staff, query.before);
  }

  @Post()
  request(
    @Req() request: StaffRequest,
    @Body(new ZodValidationPipe(supportRequestSchema)) input: SupportRequestInput,
  ) {
    return this.support.request(request.staff, input, request.ip);
  }

  @Post(':id/handoff')
  async handoff(@Req() request: StaffRequest, @Param('id', ParseUUIDPipe) id: string) {
    return {
      ...(await this.support.issueHandoff(request.staff, id, request.ip)),
      destination: `${loadEnv().WEB_ORIGINS[0]}/support/exchange`,
    };
  }
}
@Controller('support-access')
@AnyMember()
export class OwnerSupportController {
  constructor(@Inject(SupportOwnerService) private readonly support: SupportOwnerService) {}
  @Get()
  list(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentSession() sessionId: string,
    @Query(new ZodValidationPipe(supportPageSchema)) query: { before?: string },
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
    @Body(new ZodValidationPipe(supportDecisionSchema)) input: { code: string },
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
@Controller('support')
@SupportAccess()
export class SupportController {
  constructor(@Inject(SupportService) private readonly support: SupportService) {}
  @Post('exchange')
  @SupportHandoff()
  async exchange(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
    @Body(new ZodValidationPipe(supportHandoffSchema)) input: { token: string },
  ) {
    const token = await this.support.exchange(input.token, request.ip);
    reply.header('Cache-Control', 'no-store').header('Referrer-Policy', 'no-referrer');
    reply.setCookie(cookie, token, {
      httpOnly: true,
      secure: loadEnv().NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/support',
      maxAge: 86400,
    });
    return reply.code(303).redirect('/support');
  }

  @Get('session')
  session(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    reply.header('Cache-Control', 'no-store');
    return this.support.session(request.cookies[cookie]);
  }

  @Get('customers/:id')
  @Header('Cache-Control', 'no-store')
  customer(@Req() request: FastifyRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.support.customer(
      request.cookies[cookie],
      id,
      request.ip,
      request.headers['x-support-context'],
    );
  }

  @Post('customers')
  @Header('Cache-Control', 'no-store')
  create(
    @Req() request: FastifyRequest,
    @Body(new ZodValidationPipe(createCustomerSchema)) input: CreateCustomerInput,
  ) {
    return this.support.createCustomer(
      request.cookies[cookie],
      input,
      request.ip,
      request.headers['x-support-context'],
    );
  }
}
