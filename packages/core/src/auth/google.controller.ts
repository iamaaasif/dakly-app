import { Body, Controller, Inject, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  googleSignInSchema,
  verifyGoogleEmailSchema,
  type GoogleSignInInput,
  type VerifyGoogleEmailInput,
} from '@dakly/contracts/auth';
import { Public } from '../platform/tenancy/access.decorators';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { setSessionCookie } from '../platform/http/session-cookie';
import { GoogleService } from './google.service';

@Controller('auth/google')
@Public()
export class GoogleController {
  constructor(@Inject(GoogleService) private readonly google: GoogleService) {}
  @Post()
  async signIn(
    @Body(new ZodValidationPipe(googleSignInSchema)) input: GoogleSignInInput,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.google.signIn(input, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      isRemembered: input.isRemembered,
    });
    if ('token' in result) {
      setSessionCookie(reply, result.token, input.isRemembered);
      reply.status(204);
      return;
    }
    reply.status(202);
    return result;
  }
  @Post('email/verify')
  async verifyEmail(
    @Body(new ZodValidationPipe(verifyGoogleEmailSchema)) input: VerifyGoogleEmailInput,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.google.verifyEmail(input, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      isRemembered: input.isRemembered,
    });
    if ('token' in result) {
      setSessionCookie(reply, result.token, input.isRemembered);
      reply.status(204);
      return;
    }
    reply.status(202);
    return result;
  }
}
