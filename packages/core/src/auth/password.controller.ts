import { Body, Controller, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  passwordSignInSchema,
  passwordIdentifierSchema,
  confirmPasswordResetSchema,
  type PasswordSignInInput,
  type PasswordIdentifierInput,
  type ConfirmPasswordResetInput,
} from '@dakly/contracts/auth';
import { Public } from '../platform/tenancy/access.decorators';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { setSessionCookie } from '../platform/http/session-cookie';
import { PasswordService } from './password.service';

@Controller('auth')
@Public()
export class PasswordController {
  constructor(@Inject(PasswordService) private readonly passwords: PasswordService) {}

  @Post('password')
  @HttpCode(204)
  async signIn(
    @Body(new ZodValidationPipe(passwordSignInSchema)) input: PasswordSignInInput,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const result = await this.passwords.signIn(input, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      isRemembered: input.isRemembered,
    });
    setSessionCookie(reply, result.token, input.isRemembered);
  }

  @Post('password-reset')
  @HttpCode(204)
  requestReset(
    @Body(new ZodValidationPipe(passwordIdentifierSchema)) input: PasswordIdentifierInput,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.passwords.requestReset(input, request.ip);
  }

  @Post('password-reset/confirm')
  @HttpCode(204)
  async confirmReset(
    @Body(new ZodValidationPipe(confirmPasswordResetSchema)) input: ConfirmPasswordResetInput,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const result = await this.passwords.confirmReset(input, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      isRemembered: input.isRemembered,
    });
    setSessionCookie(reply, result.token, input.isRemembered);
  }
}
