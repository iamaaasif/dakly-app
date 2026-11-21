import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';

import {
  confirmProductPhotoSchema,
  productPhotoUploadSchema,
  reorderProductPhotosSchema,
  type ConfirmProductPhotoInput,
  type ProductPhotoUploadInput,
  type ProductPhotoUploadResponse,
  type ProductResponse,
  type ReorderProductPhotosInput,
} from '@dakly/contracts/products';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { ProductVariantPhotosService } from './product-variant-photos.service';

@Controller('products/:productId/variants/:variantId/photos')
export class ProductVariantPhotosController {
  constructor(
    @Inject(ProductVariantPhotosService) private readonly service: ProductVariantPhotosService,
  ) {}

  @Post('upload-url')
  @RequirePermission('products.edit')
  @HttpCode(200)
  requestUpload(
    @CurrentStore() storeId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body(new ZodValidationPipe(productPhotoUploadSchema)) input: ProductPhotoUploadInput,
  ): Promise<ProductPhotoUploadResponse> {
    return this.service.requestUpload(storeId, { productId, variantId }, input);
  }

  @Post('confirm')
  @RequirePermission('products.edit')
  confirm(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body(new ZodValidationPipe(confirmProductPhotoSchema)) input: ConfirmProductPhotoInput,
  ): Promise<ProductResponse> {
    return this.service.confirm(storeId, { productId, variantId }, input, { kind: 'user', userId });
  }

  @Patch()
  @RequirePermission('products.edit')
  reorder(
    @CurrentStore() storeId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body(new ZodValidationPipe(reorderProductPhotosSchema)) input: ReorderProductPhotosInput,
  ): Promise<ProductResponse> {
    return this.service.reorder(storeId, { productId, variantId }, input);
  }

  @Delete(':fileId')
  @RequirePermission('products.edit')
  @HttpCode(204)
  remove(
    @CurrentStore() storeId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ): Promise<void> {
    return this.service.remove(storeId, { productId, variantId }, fileId);
  }
}
