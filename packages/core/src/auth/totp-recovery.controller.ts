import { Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  totpRecoveryCodeSchema,
  totpRecoverySchema,
  totpRecoveryTokenSchema,
  type TotpRecoveryCodeInput,
  type TotpRecoveryInput,
  type TotpRecoveryTokenInput,
} from '@dakly/contracts/totp';
import { Public } from '../platform/tenancy/access.decorators';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { TotpRecoveryService } from './totp-recovery.service';
@Controller('auth/totp/recovery')
@Public()
export class TotpRecoveryController {
  constructor(@Inject(TotpRecoveryService) private readonly recovery: TotpRecoveryService) {}
  @Post('code')
  @HttpCode(204)
  code(
    @Body(new ZodValidationPipe(totpRecoveryCodeSchema)) input: TotpRecoveryCodeInput,
    @Req() request: FastifyRequest,
  ) {
    return this.recovery.requestCode(input, request.ip);
  }
  @Post()
  @HttpCode(202)
  start(
    @Body(new ZodValidationPipe(totpRecoverySchema)) input: TotpRecoveryInput,
    @Req() request: FastifyRequest,
  ) {
    return this.recovery.start(input, request.ip);
  }
  @Post('cancel')
  @HttpCode(204)
  cancel(
    @Body(new ZodValidationPipe(totpRecoveryTokenSchema)) input: TotpRecoveryTokenInput,
    @Req() request: FastifyRequest,
  ) {
    return this.recovery.cancel(input, request.ip);
  }
  @Post('complete')
  @HttpCode(204)
  complete(
    @Body(new ZodValidationPipe(totpRecoveryTokenSchema)) input: TotpRecoveryTokenInput,
    @Req() request: FastifyRequest,
  ) {
    return this.recovery.complete(input, request.ip);
  }
}
