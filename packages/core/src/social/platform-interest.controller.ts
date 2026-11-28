import { Controller, Delete, Get, Inject, Param, Put } from '@nestjs/common';

import { platformInterestParamsSchema, type PlatformInterests } from '@dakly/contracts/social';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { PlatformInterestService } from './platform-interest.service';

const params = new ZodValidationPipe(platformInterestParamsSchema);

// Asking to hear about a network is a personal choice, so any member who can see Social may make it.
@Controller('social/platform-interests')
export class PlatformInterestController {
  constructor(
    @Inject(PlatformInterestService) private readonly interests: PlatformInterestService,
  ) {}

  @Get()
  @RequirePermission('social.view')
  platforms(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
  ): Promise<PlatformInterests> {
    return this.interests.platforms(storeId, userId);
  }

  @Put(':platform')
  @RequirePermission('social.view')
  ask(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param(params) { platform }: { platform: PlatformInterests['platforms'][number] },
  ): Promise<PlatformInterests> {
    return this.interests.ask(storeId, userId, platform);
  }

  @Delete(':platform')
  @RequirePermission('social.view')
  withdraw(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param(params) { platform }: { platform: PlatformInterests['platforms'][number] },
  ): Promise<PlatformInterests> {
    return this.interests.withdraw(storeId, userId, platform);
  }
}
