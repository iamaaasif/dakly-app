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
} from '@nestjs/common';

import {
  changeProductCategorySchema,
  createProductCategorySchema,
  productBrandSchema,
  productCollectionSchema,
  type ChangeProductCategoryInput,
  type CreateProductCategoryInput,
  type ProductBrandInput,
  type ProductBrandListResponse,
  type ProductBrandResponse,
  type ProductCategoryListResponse,
  type ProductCollectionInput,
  type ProductCollectionListResponse,
  type ProductCollectionResponse,
  type ProductTagListResponse,
  type ProductCategoryResponse,
} from '@dakly/contracts/product-lists';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { ProductBrandsService } from './product-brands.service';
import { ProductCategoriesService } from './product-categories.service';
import { ProductCollectionsService } from './product-collections.service';
import { ProductTagsService } from './product-tags.service';

@Controller('products')
export class ProductListsController {
  constructor(
    @Inject(ProductCategoriesService) private readonly categories: ProductCategoriesService,
    @Inject(ProductBrandsService) private readonly brands: ProductBrandsService,
    @Inject(ProductCollectionsService) private readonly collections: ProductCollectionsService,
    @Inject(ProductTagsService) private readonly tags: ProductTagsService,
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

  @Patch('categories/:categoryId')
  @RequirePermission('products.edit')
  changeCategory(
    @CurrentStore() storeId: string,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body(new ZodValidationPipe(changeProductCategorySchema)) input: ChangeProductCategoryInput,
  ): Promise<ProductCategoryResponse> {
    return this.categories.change(storeId, categoryId, input);
  }

  @Delete('categories/:categoryId')
  @HttpCode(204)
  @RequirePermission('products.edit')
  removeCategory(
    @CurrentStore() storeId: string,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
  ): Promise<void> {
    return this.categories.remove(storeId, categoryId);
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

  @Patch('brands/:brandId')
  @RequirePermission('products.edit')
  renameBrand(
    @CurrentStore() storeId: string,
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Body(new ZodValidationPipe(productBrandSchema)) input: ProductBrandInput,
  ): Promise<ProductBrandResponse> {
    return this.brands.rename(storeId, brandId, input);
  }

  @Delete('brands/:brandId')
  @HttpCode(204)
  @RequirePermission('products.edit')
  removeBrand(
    @CurrentStore() storeId: string,
    @Param('brandId', ParseUUIDPipe) brandId: string,
  ): Promise<void> {
    return this.brands.remove(storeId, brandId);
  }

  @Get('collections')
  @RequirePermission('products.view')
  listCollections(@CurrentStore() storeId: string): Promise<ProductCollectionListResponse> {
    return this.collections.list(storeId);
  }

  @Post('collections')
  @RequirePermission('products.edit')
  createCollection(
    @CurrentStore() storeId: string,
    @Body(new ZodValidationPipe(productCollectionSchema)) input: ProductCollectionInput,
  ): Promise<ProductCollectionResponse> {
    return this.collections.create(storeId, input);
  }

  @Get('tags')
  @RequirePermission('products.view')
  listTags(@CurrentStore() storeId: string): Promise<ProductTagListResponse> {
    return this.tags.list(storeId);
  }
}
