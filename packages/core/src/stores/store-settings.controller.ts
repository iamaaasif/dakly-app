import { Body, Controller, Get, Inject, Patch, Req, UseGuards } from '@nestjs/common';

import {
  changeStoreSettingsSchema,
  changeStoreExtensionsSchema,
  type ChangeStoreSettingsInput,
  type ChangeStoreExtensionsInput,
  type StoreSettingsResponse,
} from '@dakly/contracts/stores';

import { AnyMember, RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import type { StoreRequest } from '../platform/tenancy/store-request';
import { StoreGuard } from '../platform/tenancy/store.guard';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { StoresService } from './stores.service';

@Controller('store')
@UseGuards(StoreGuard)
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
    @Body(new ZodValidationPipe(changeStoreSettingsSchema)) input: ChangeStoreSettingsInput,
  ): Promise<StoreSettingsResponse> {
    return this.stores.changeSettings(storeId, input, userId);
  }

  @Patch('extensions')
  @AnyMember()
  changeExtensions(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Req() request: StoreRequest,
    @Body(new ZodValidationPipe(changeStoreExtensionsSchema)) input: ChangeStoreExtensionsInput,
  ): Promise<StoreSettingsResponse> {
    return this.stores.changeExtensions(storeId, input, { userId, access: request.access! });
  }
}
