import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';

import {
  acceptInviteSchema,
  type AcceptInviteInput,
  type AcceptInviteResponse,
} from '@dakly/contracts/team';

import { RequireUser } from '../platform/tenancy/access.decorators';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { MembersService } from './members.service';

@Controller('invites')
export class InvitesController {
  constructor(@Inject(MembersService) private readonly members: MembersService) {}
  @Post('accept')
  @HttpCode(200)
  @RequireUser()
  accept(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(acceptInviteSchema)) input: AcceptInviteInput,
  ): Promise<AcceptInviteResponse> {
    return this.members.accept(userId, input.token);
  }
}
