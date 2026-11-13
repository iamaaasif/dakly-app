import { Body, Controller, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  requestCodeSchema,
  verifyCodeSchema,
  type RequestCodeInput,
  type VerifyCodeInput,
} from '@dakly/contracts/auth';
import { Public } from '../platform/tenancy/access.decorators';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { setSessionCookie } from '../platform/http/session-cookie';
import { AuthService } from './auth.service';

@Controller('auth')
@Public()
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('code')
  @HttpCode(204)
  requestCode(
    @Body(new ZodValidationPipe(requestCodeSchema)) input: RequestCodeInput,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.auth.requestCode(input, request.ip);
  }

  @Post('code/verify')
  @HttpCode(204)
  async verifyCode(
    @Body(new ZodValidationPipe(verifyCodeSchema)) input: VerifyCodeInput,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const result = await this.auth.verifyCode(input, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      isRemembered: input.isRemembered,
    });
    setSessionCookie(reply, result.token, input.isRemembered);
  }
}
