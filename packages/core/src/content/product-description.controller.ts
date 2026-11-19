import { Body, Controller, HttpCode, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';

import {
  productDescriptionRequestSchema,
  type ContentWriteResult,
  type ProductDescriptionInput,
} from '@dakly/contracts/content-writing';
import type { StoreAccess } from '@dakly/contracts/team';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentAccess } from '../platform/tenancy/current-access.decorator';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { ContentService } from './content.service';

@Controller('products/:productId/write-description')
export class ProductDescriptionController {
  constructor(@Inject(ContentService) private readonly content: ContentService) {}

  @Post()
  @HttpCode(200)
  @RequirePermission('products.edit')
  write(
    @CurrentStore() storeId: string,
    @CurrentAccess() access: StoreAccess,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body(new ZodValidationPipe(productDescriptionRequestSchema)) input: ProductDescriptionInput,
  ): Promise<ContentWriteResult> {
    return this.content.write(storeId, access, {
      ...input,
      operation: 'generate',
      kind: 'product_description',
      productId,
    });
  }
}
