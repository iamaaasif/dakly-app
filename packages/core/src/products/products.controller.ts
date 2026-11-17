import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import {
  createProductSchema,
  changeProductSchema,
  type ChangeProductInput,
  productListQuerySchema,
  type CreateProductInput,
  type ProductListQuery,
  type ProductListResponse,
  type ProductResponse,
} from '@dakly/contracts/products';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(@Inject(ProductsService) private readonly service: ProductsService) {}

  @Get()
  @RequirePermission('products.view')
  list(
    @CurrentStore() storeId: string,
    @Query(new ZodValidationPipe(productListQuerySchema)) query: ProductListQuery,
  ): Promise<ProductListResponse> {
    return this.service.list(storeId, query);
  }

  @Get(':productId')
  @RequirePermission('products.view')
  getById(
    @CurrentStore() storeId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<ProductResponse> {
    return this.service.getById(storeId, productId);
  }

  @Post()
  @RequirePermission('products.edit')
  create(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createProductSchema)) input: CreateProductInput,
  ): Promise<ProductResponse> {
    return this.service.create(storeId, input, { kind: 'user', userId });
  }

  @Patch(':productId')
  @RequirePermission('products.edit')
  edit(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body(new ZodValidationPipe(changeProductSchema)) input: ChangeProductInput,
  ): Promise<ProductResponse> {
    return this.service.edit(storeId, productId, input, { kind: 'user', userId });
  }

  @Delete(':productId')
  @RequirePermission('products.edit')
  @HttpCode(204)
  remove(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<void> {
    return this.service.remove(storeId, productId, { kind: 'user', userId });
  }
}
