import { Body, Controller, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import {
  totpSignInSchema,
  totpSetupSchema,
  totpConfirmSchema,
  totpDisableSchema,
  type TotpSignInInput,
  type TotpSetupInput,
  type TotpConfirmInput,
} from '@dakly/contracts/totp';

import { setSessionCookie } from '../platform/http/session-cookie';
import { Public, RequireUser } from '../platform/tenancy/access.decorators';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import type { StoreRequest } from '../platform/tenancy/store-request';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { AuthService } from './auth.service';
import { TotpService } from './totp.service';

@Controller()
export class TotpController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(TotpService) private readonly totp: TotpService,
  ) {}
  @Post('auth/totp')
  @Public()
  @HttpCode(204)
  async signIn(
    @Body(new ZodValidationPipe(totpSignInSchema)) input: TotpSignInInput,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.auth.verifyTotp(input.challengeId, input.code, request.ip);
    if ('token' in result) setSessionCookie(reply, result.token, result.session.isRemembered);
  }
  @Post('me/totp/proof')
  @RequireUser()
  @HttpCode(204)
  proof(@CurrentUser() userId: string, @Req() request: StoreRequest & FastifyRequest) {
    return this.totp.requestSetupProof(userId, request.ip);
  }
  @Post('me/totp/setup')
  @RequireUser()
  @HttpCode(200)
  setup(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(totpSetupSchema)) input: TotpSetupInput,
    @Req() request: StoreRequest & FastifyRequest,
  ) {
    return this.totp.setup(userId, request.sessionId!, input, request.ip);
  }
  @Post('me/totp/confirm')
  @RequireUser()
  @HttpCode(200)
  confirm(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(totpConfirmSchema)) input: TotpConfirmInput,
    @Req() request: StoreRequest & FastifyRequest,
  ) {
    return this.totp.confirm(userId, request.sessionId!, input, request.ip);
  }
  @Post('me/totp/disable')
  @RequireUser()
  @HttpCode(204)
  disable(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(totpDisableSchema)) input: { code: string },
    @Req() request: StoreRequest & FastifyRequest,
  ) {
    return this.totp.disable(userId, input.code, request.ip);
  }
}
