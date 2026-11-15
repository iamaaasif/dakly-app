import { Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  changePasswordSchema,
  requestPasswordProofSchema,
  type ChangePasswordInput,
} from '@dakly/contracts/auth';
import { RequireUser } from '../platform/tenancy/access.decorators';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { PasswordService } from './password.service';

@Controller('me/password')
@RequireUser()
export class PasswordChangeController {
  constructor(@Inject(PasswordService) private readonly passwords: PasswordService) {}

  @Post('proof')
  @HttpCode(204)
  proof(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(requestPasswordProofSchema)) _input: Record<string, never>,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.passwords.requestChangeProof(userId, request.ip);
  }

  @Post()
  @HttpCode(204)
  change(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(changePasswordSchema)) input: ChangePasswordInput,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.passwords.change(userId, input, request.ip);
  }
}
