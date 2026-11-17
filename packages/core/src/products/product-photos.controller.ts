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
import { ProductsService } from './products.service';

@Controller('products/:productId/photos')
export class ProductPhotosController {
  constructor(@Inject(ProductsService) private readonly service: ProductsService) {}

  @Post('upload-url')
  @RequirePermission('products.edit')
  @HttpCode(200)
  requestUpload(
    @CurrentStore() storeId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body(new ZodValidationPipe(productPhotoUploadSchema)) input: ProductPhotoUploadInput,
  ): Promise<ProductPhotoUploadResponse> {
    return this.service.requestPhotoUpload(storeId, productId, input);
  }

  @Post('confirm')
  @RequirePermission('products.edit')
  confirm(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body(new ZodValidationPipe(confirmProductPhotoSchema)) input: ConfirmProductPhotoInput,
  ): Promise<ProductResponse> {
    return this.service.confirmPhoto(storeId, productId, input, { kind: 'user', userId });
  }

  @Patch()
  @RequirePermission('products.edit')
  reorder(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body(new ZodValidationPipe(reorderProductPhotosSchema)) input: ReorderProductPhotosInput,
  ): Promise<ProductResponse> {
    return this.service.reorderPhotos(storeId, productId, input, { kind: 'user', userId });
  }

  @Delete(':fileId')
  @RequirePermission('products.edit')
  @HttpCode(204)
  remove(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ): Promise<void> {
    return this.service.removePhoto(storeId, productId, fileId, { kind: 'user', userId });
  }
}
