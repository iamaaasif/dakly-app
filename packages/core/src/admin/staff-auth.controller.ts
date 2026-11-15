import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import {
  staffSignInSchema,
  staffEnrollmentSchema,
  staffTotpSchema,
  staffRegistrationSchema,
  staffAuthenticationSchema,
  type StaffSignInInput,
  type StaffEnrollmentInput,
  type StaffTotpInput,
  type StaffRegistrationInput,
  type StaffAuthenticationInput,
} from '@dakly/contracts/staff-auth';

import { StaffAccess } from '../platform/tenancy/access.decorators';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { StaffAuthService } from './staff-auth.service';
import { staffCookie, clearStaffCookie } from './staff-cookie';
import { StaffFactorsService } from './staff-factors.service';
import { StaffSessionsService } from './staff-sessions.service';
import { type StaffRequest } from './staff.guard';

@Controller('admin/auth')
@StaffAccess(false)
export class StaffAuthController {
  constructor(
    @Inject(StaffAuthService) private readonly auth: StaffAuthService,
    @Inject(StaffFactorsService) private readonly factors: StaffFactorsService,
    @Inject(StaffSessionsService) private readonly sessions: StaffSessionsService,
  ) {}

  @Post('sign-in')
  @HttpCode(200)
  signIn(
    @Body(new ZodValidationPipe(staffSignInSchema)) input: StaffSignInInput,
    @Req() request: StaffRequest,
  ) {
    return this.auth.signIn(input, request.staffAccess, request.ip);
  }

  @Post('enroll')
  @HttpCode(200)
  enroll(
    @Body(new ZodValidationPipe(staffEnrollmentSchema)) input: StaffEnrollmentInput,
    @Req() request: StaffRequest,
  ) {
    return this.auth.enroll(input, request.staffAccess, request.ip);
  }

  @Post('totp')
  @HttpCode(204)
  async totp(
    @Body(new ZodValidationPipe(staffTotpSchema)) input: StaffTotpInput,
    @Req() request: StaffRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    staffCookie(reply, await this.factors.verifyTotp(input, request.staffAccess, request.ip));
  }

  @Post('passkey/register')
  @HttpCode(204)
  async register(
    @Body(new ZodValidationPipe(staffRegistrationSchema)) input: StaffRegistrationInput,
    @Req() request: StaffRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    staffCookie(reply, await this.factors.registerPasskey(input, request.staffAccess, request.ip));
  }

  @Post('passkey/authenticate')
  @HttpCode(204)
  async authenticate(
    @Body(new ZodValidationPipe(staffAuthenticationSchema)) input: StaffAuthenticationInput,
    @Req() request: StaffRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    staffCookie(
      reply,
      await this.factors.authenticatePasskey(input, request.staffAccess, request.ip),
    );
  }

  @Get('session')
  @StaffAccess()
  session(@Req() request: StaffRequest) {
    return request.staff;
  }

  @Post('sign-out')
  @StaffAccess()
  @HttpCode(204)
  async signOut(@Req() request: StaffRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.sessions.signOut(request.staff.id, request.ip);
    clearStaffCookie(reply);
  }
}
