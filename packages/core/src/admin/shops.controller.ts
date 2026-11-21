import { Controller, Get, Inject, Param, ParseUUIDPipe, Query, Req } from '@nestjs/common';

import {
  adminShopListQuerySchema,
  type AdminShopDetail,
  type AdminShopListQuery,
  type AdminShopListResponse,
} from '@dakly/contracts/admin-shops';

import { StaffAccess } from '../platform/tenancy/access.decorators';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { ShopsService } from './shops.service';
import type { StaffRequest } from './staff.guard';

// Every staff role may see shop metadata (feature 12 roles table); content needs a support grant.
@Controller('admin/stores')
@StaffAccess(true)
export class ShopsController {
  constructor(@Inject(ShopsService) private readonly shops: ShopsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(adminShopListQuerySchema)) query: AdminShopListQuery,
  ): Promise<AdminShopListResponse> {
    return this.shops.list(query);
  }

  @Get(':storeId')
  detail(
    @Req() request: StaffRequest,
    @Param('storeId', ParseUUIDPipe) storeId: string,
  ): Promise<AdminShopDetail> {
    return this.shops.detail(request.staff, storeId, request.ip);
  }
}
