import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';

import {
  createProductSchema,
  productListQuerySchema,
  type CreateProductInput,
  type ProductListQuery,
  type ProductListResponse,
  type ProductResponse,
} from '@dakly/contracts/products';
import type { StoreAccess } from '@dakly/contracts/team';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentAccess } from '../platform/tenancy/current-access.decorator';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { TeamService } from '../team/team.service';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(
    @Inject(ProductsService) private readonly service: ProductsService,
    @Inject(TeamService) private readonly team: TeamService,
  ) {}

  @Get()
  @RequirePermission('products.view')
  list(
    @CurrentStore() storeId: string,
    @CurrentAccess() access: StoreAccess,
    @Query(new ZodValidationPipe(productListQuerySchema)) query: ProductListQuery,
  ): Promise<ProductListResponse> {
    return this.service.list(storeId, query, this.team.canAccess(access, 'products', 'edit'));
  }

  @Get(':productId')
  @RequirePermission('products.view')
  getById(
    @CurrentStore() storeId: string,
    @CurrentAccess() access: StoreAccess,
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<ProductResponse> {
    return this.service.getById(
      storeId,
      productId,
      this.team.canAccess(access, 'products', 'edit'),
    );
  }

  @Post()
  @RequirePermission('products.edit')
  create(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createProductSchema)) input: CreateProductInput,
  ): Promise<ProductResponse> {
    return this.service.create(storeId, input, { kind: 'user', userId }, true);
  }
}
