import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';

import {
  confirmProductPhotoSchema,
  productPhotoUploadSchema,
  type ConfirmProductPhotoInput,
  type ProductPhotoResponse,
  type ProductPhotoUploadInput,
  type ProductPhotoUploadResponse,
} from '@dakly/contracts/products';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { ProductMediaService } from './product-media.service';

@Controller('product-media')
export class ProductMediaController {
  constructor(@Inject(ProductMediaService) private readonly media: ProductMediaService) {}

  @Post('upload-url')
  @RequirePermission('products.edit')
  @HttpCode(200)
  requestUpload(
    @CurrentStore() storeId: string,
    @Body(new ZodValidationPipe(productPhotoUploadSchema)) input: ProductPhotoUploadInput,
  ): Promise<ProductPhotoUploadResponse> {
    return this.media.requestUpload(storeId, input);
  }

  @Post('confirm')
  @RequirePermission('products.edit')
  confirm(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(confirmProductPhotoSchema)) input: ConfirmProductPhotoInput,
  ): Promise<ProductPhotoResponse> {
    return this.media.confirm(storeId, userId, input);
  }
}
