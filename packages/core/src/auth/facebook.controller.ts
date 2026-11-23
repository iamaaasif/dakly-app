import { Controller, Get, Inject, Query, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { facebookStartSchema, type FacebookStartInput } from '@dakly/contracts/auth';

import { loadEnv } from '../platform/config/env';
import { AppError } from '../platform/errors/app-error';
import { setSessionCookie } from '../platform/http/session-cookie';
import { Public } from '../platform/tenancy/access.decorators';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { FacebookService } from './facebook.service';

const STATE_COOKIE = 'dakly_facebook_state';
// Where the browser lands when Facebook sign-in cannot finish; the sign-in page shows the reason.
const failureReasons: Record<string, string> = {
  AUTH_TERMS_REQUIRED: 'terms_required',
  AUTH_FACEBOOK_EMAIL_REQUIRED: 'email_required',
  AUTH_FACEBOOK_STATE_INVALID: 'expired',
  AUTH_FACEBOOK_UNAVAILABLE: 'unavailable',
  AUTH_FACEBOOK_CONFLICT: 'conflict',
  AUTH_DISABLED: 'disabled',
  AUTH_LOCKED: 'rate_limited',
  AUTH_RATE_LIMITED: 'rate_limited',
};

// Facebook sign-in is a full-page redirect, so these two routes answer with redirects, not JSON.
@Controller('auth/facebook')
@Public()
export class FacebookController {
  constructor(@Inject(FacebookService) private readonly facebook: FacebookService) {}

  @Get('start')
  async start(
    @Query(new ZodValidationPipe(facebookStartSchema)) input: FacebookStartInput,
    @Res() reply: FastifyReply,
  ) {
    try {
      const { nonce, url } = await this.facebook.start(input);
      reply.setCookie(STATE_COOKIE, nonce, {
        httpOnly: true,
        secure: loadEnv().NODE_ENV !== 'development',
        sameSite: 'lax',
        path: '/',
        maxAge: 600,
      });
      return reply.redirect(url, 302);
    } catch (error) {
      return reply.redirect(failure(error), 302);
    }
  }

  @Get('callback')
  async callback(
    @Query() query: { code?: string; state?: string; error?: string },
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    reply.clearCookie(STATE_COOKIE, { path: '/' });
    // The person pressed Cancel on Facebook.
    if (query.error || typeof query.code !== 'string' || typeof query.state !== 'string')
      return reply.redirect('/sign-in?facebook=cancelled', 302);
    try {
      const result = await this.facebook.finish(
        { code: query.code, state: query.state, cookieNonce: request.cookies[STATE_COOKIE] },
        { ip: request.ip, userAgent: request.headers['user-agent'] },
      );
      if ('token' in result) {
        setSessionCookie(reply, result.token, result.isRemembered);
        return reply.redirect(result.isNewAccount ? '/setup' : '/dashboard', 302);
      }
      return reply.redirect(`/sign-in?facebook=totp&challenge=${result.challengeId}`, 302);
    } catch (error) {
      return reply.redirect(failure(error), 302);
    }
  }
}

function failure(error: unknown): string {
  const reason = error instanceof AppError ? failureReasons[error.code] : undefined;
  return `/sign-in?facebook=${reason ?? 'failed'}`;
}
