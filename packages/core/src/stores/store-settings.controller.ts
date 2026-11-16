import { Body, Controller, Get, Inject, Patch } from '@nestjs/common';

import {
  changeStoreSettingsSchema,
  changeStoreExtensionsSchema,
  type ChangeStoreSettingsInput,
  type ChangeStoreExtensionsInput,
  type StoreSettingsResponse,
} from '@dakly/contracts/stores';
import type { StoreAccess } from '@dakly/contracts/team';

import { AnyMember, RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentAccess } from '../platform/tenancy/current-access.decorator';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { StoresService } from './stores.service';

@Controller('store')
export class StoreSettingsController {
  constructor(@Inject(StoresService) private readonly stores: StoresService) {}

  @Get()
  @RequirePermission('storeSettings.view')
  settings(@CurrentStore() storeId: string): Promise<StoreSettingsResponse> {
    return this.stores.settings(storeId);
  }

  @Patch()
  @RequirePermission('storeSettings.edit')
  changeSettings(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentAccess() access: StoreAccess,
    @Body(new ZodValidationPipe(changeStoreSettingsSchema)) input: ChangeStoreSettingsInput,
  ): Promise<StoreSettingsResponse> {
    return this.stores.changeSettings(storeId, input, { userId, access });
  }

  @Patch('extensions')
  @AnyMember()
  changeExtensions(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentAccess() access: StoreAccess,
    @Body(new ZodValidationPipe(changeStoreExtensionsSchema)) input: ChangeStoreExtensionsInput,
  ): Promise<StoreSettingsResponse> {
    return this.stores.changeExtensions(storeId, input, { userId, access });
  }
}
