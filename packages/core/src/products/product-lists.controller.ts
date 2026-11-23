import { Body, Controller, Get, Inject, Post } from '@nestjs/common';

import {
  createProductCategorySchema,
  productBrandSchema,
  type CreateProductCategoryInput,
  type ProductBrandInput,
  type ProductBrandListResponse,
  type ProductBrandResponse,
  type ProductCategoryListResponse,
  type ProductCategoryResponse,
} from '@dakly/contracts/product-lists';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { ProductBrandsService } from './product-brands.service';
import { ProductCategoriesService } from './product-categories.service';

@Controller('products')
export class ProductListsController {
  constructor(
    @Inject(ProductCategoriesService) private readonly categories: ProductCategoriesService,
    @Inject(ProductBrandsService) private readonly brands: ProductBrandsService,
  ) {}

  @Get('categories')
  @RequirePermission('products.view')
  listCategories(@CurrentStore() storeId: string): Promise<ProductCategoryListResponse> {
    return this.categories.list(storeId);
  }

  @Post('categories')
  @RequirePermission('products.edit')
  createCategory(
    @CurrentStore() storeId: string,
    @Body(new ZodValidationPipe(createProductCategorySchema)) input: CreateProductCategoryInput,
  ): Promise<ProductCategoryResponse> {
    return this.categories.create(storeId, input);
  }

  @Get('brands')
  @RequirePermission('products.view')
  listBrands(@CurrentStore() storeId: string): Promise<ProductBrandListResponse> {
    return this.brands.list(storeId);
  }

  @Post('brands')
  @RequirePermission('products.edit')
  createBrand(
    @CurrentStore() storeId: string,
    @Body(new ZodValidationPipe(productBrandSchema)) input: ProductBrandInput,
  ): Promise<ProductBrandResponse> {
    return this.brands.create(storeId, input);
  }
}
