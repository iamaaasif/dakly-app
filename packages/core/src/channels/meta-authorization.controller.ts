import { Body, Controller, Inject, Post } from '@nestjs/common';

import {
  metaAuthorizationInputSchema,
  type MetaAuthorizationInput,
} from '@dakly/contracts/channels';
import type { StoreAccess } from '@dakly/contracts/team';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentAccess } from '../platform/tenancy/current-access.decorator';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { MetaAuthorizationService } from './meta-authorization.service';

@Controller('channel-connections/meta')
@RequirePermission('storeSettings.edit')
export class MetaAuthorizationController {
  constructor(
    @Inject(MetaAuthorizationService) private readonly authorization: MetaAuthorizationService,
  ) {}

  @Post('start')
  start(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentAccess() access: StoreAccess,
  ) {
    return this.authorization.start(storeId, { userId, access });
  }

  @Post('accounts')
  listAccounts(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentAccess() access: StoreAccess,
    @Body(new ZodValidationPipe(metaAuthorizationInputSchema)) input: MetaAuthorizationInput,
  ) {
    return this.authorization.listAccounts(storeId, { userId, access }, input);
  }
}
