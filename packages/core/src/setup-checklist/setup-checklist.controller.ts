import { Body, Controller, Get, Inject, Patch } from '@nestjs/common';

import {
  changeSetupChecklistSchema,
  type ChangeSetupChecklistInput,
  type SetupChecklistResponse,
} from '@dakly/contracts/setup-checklist';
import type { StoreAccess } from '@dakly/contracts/team';

import { AnyMember } from '../platform/tenancy/access.decorators';
import { CurrentAccess } from '../platform/tenancy/current-access.decorator';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { SetupChecklistService } from './setup-checklist.service';

@Controller('setup-checklist')
export class SetupChecklistController {
  constructor(@Inject(SetupChecklistService) private readonly checklist: SetupChecklistService) {}

  @Get()
  @AnyMember()
  view(@CurrentStore() storeId: string): Promise<SetupChecklistResponse> {
    return this.checklist.view(storeId);
  }

  // The service checks the Owner or Admin role, as it does for extensions.
  @Patch()
  @AnyMember()
  hide(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentAccess() access: StoreAccess,
    // The body only has to be { hidden: true }; there is nothing else to read from it.
    @Body(new ZodValidationPipe(changeSetupChecklistSchema)) _body: ChangeSetupChecklistInput,
  ): Promise<SetupChecklistResponse> {
    return this.checklist.hide(storeId, { userId, access });
  }
}
