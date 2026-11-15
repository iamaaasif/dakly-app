import { Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import {
  changeEmailSchema,
  requestEmailCodeSchema,
  verifyNewEmailSchema,
  type ChangeEmailInput,
  type RequestEmailCodeInput,
  type VerifyNewEmailInput,
} from '@dakly/contracts/auth';

import { RequireUser } from '../platform/tenancy/access.decorators';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { EmailChangeService } from './email-change.service';

@Controller('me/email')
@RequireUser()
export class EmailChangeController {
  constructor(@Inject(EmailChangeService) private readonly email: EmailChangeService) {}
  @Post('proof')
  @HttpCode(204)
  proof(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(requestEmailCodeSchema)) input: RequestEmailCodeInput,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.email.requestProof(userId, input, request.ip);
  }

  @Post()
  @HttpCode(204)
  change(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(changeEmailSchema)) input: ChangeEmailInput,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.email.requestChange(userId, input, request.ip);
  }

  @Post('verify')
  @HttpCode(204)
  verify(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(verifyNewEmailSchema)) input: VerifyNewEmailInput,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.email.verifyChange(userId, input, request.ip);
  }
}
