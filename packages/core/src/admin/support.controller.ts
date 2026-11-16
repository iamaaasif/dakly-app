import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { createContactSchema, type CreateContactInput } from '@dakly/contracts/contacts';
import { supportHandoffSchema, type SupportHandoffInput } from '@dakly/contracts/support';

import { loadEnv } from '../platform/config/env';
import { SupportAccess, SupportHandoff } from '../platform/tenancy/access.decorators';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { SupportService } from './support.service';

const cookie = 'dakly_support';
@Controller('support')
@SupportAccess()
export class SupportController {
  constructor(@Inject(SupportService) private readonly support: SupportService) {}
  @Post('exchange')
  @SupportHandoff()
  async exchange(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
    @Body(new ZodValidationPipe(supportHandoffSchema)) input: SupportHandoffInput,
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
    @Body(new ZodValidationPipe(createContactSchema)) input: CreateContactInput,
  ) {
    return this.support.createCustomer(
      request.cookies[cookie],
      input,
      request.ip,
      request.headers['x-support-context'],
    );
  }
}
