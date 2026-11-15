import { Body, Controller, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import {
  requestCodeSchema,
  requestEmailCodeSchema,
  verifyEmailCodeSchema,
  type RequestEmailCodeInput,
  type VerifyEmailCodeInput,
  verifyCodeSchema,
  type RequestCodeInput,
  type VerifyCodeInput,
} from '@dakly/contracts/auth';

import { setSessionCookie } from '../platform/http/session-cookie';
import { Public } from '../platform/tenancy/access.decorators';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { SignInCodeFlowService } from './sign-in-code-flow.service';

@Controller('auth')
@Public()
export class AuthController {
  constructor(@Inject(SignInCodeFlowService) private readonly codeFlow: SignInCodeFlowService) {}

  @Post('code')
  @HttpCode(204)
  requestCode(
    @Body(new ZodValidationPipe(requestCodeSchema)) input: RequestCodeInput,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.codeFlow.requestCode(input, request.ip);
  }

  @Post('code/verify')
  @HttpCode(204)
  async verifyCode(
    @Body(new ZodValidationPipe(verifyCodeSchema)) input: VerifyCodeInput,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.codeFlow.verifyCode(input, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      isRemembered: input.isRemembered,
    });
    if ('challengeId' in result) {
      reply.status(202);
      return result;
    }
    setSessionCookie(reply, result.token, input.isRemembered);
  }

  @Post('email/code')
  @HttpCode(204)
  requestEmailCode(
    @Body(new ZodValidationPipe(requestEmailCodeSchema)) input: RequestEmailCodeInput,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.codeFlow.requestEmailCode(input, request.ip);
  }

  @Post('email/code/verify')
  @HttpCode(204)
  async verifyEmailCode(
    @Body(new ZodValidationPipe(verifyEmailCodeSchema)) input: VerifyEmailCodeInput,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.codeFlow.verifyEmailCode(input, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      isRemembered: input.isRemembered,
    });
    if ('challengeId' in result) {
      reply.status(202);
      return result;
    }
    setSessionCookie(reply, result.token, input.isRemembered);
  }
}
