import { Body, Controller, Get, Inject, Put } from '@nestjs/common';

import { brandProfileSchema, type BrandProfile } from '@dakly/contracts/content';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { ContentService } from './content.service';

@Controller('brand-profile')
export class BrandProfileController {
  constructor(@Inject(ContentService) private readonly content: ContentService) {}

  @Get()
  @RequirePermission('social.view')
  get(@CurrentStore() storeId: string): Promise<BrandProfile> {
    return this.content.brandProfile(storeId);
  }

  @Put()
  @RequirePermission('social.edit')
  save(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(brandProfileSchema)) input: BrandProfile,
  ): Promise<BrandProfile> {
    return this.content.saveBrandProfile(storeId, { kind: 'user', userId }, input);
  }
}
