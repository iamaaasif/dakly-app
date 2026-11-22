import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';

import {
  applyProductBulkEditSchema,
  type ApplyProductBulkEditInput,
  type ProductBulkEditListResponse,
  type ProductBulkEditResponse,
  type ProductBulkEditUndoResponse,
} from '@dakly/contracts/product-bulk-edits';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { ProductBulkEditsService } from './product-bulk-edits.service';

@Controller('products/bulk-edits')
export class ProductBulkEditsController {
  constructor(@Inject(ProductBulkEditsService) private readonly service: ProductBulkEditsService) {}

  @Get()
  @RequirePermission('products.edit')
  listUndoable(@CurrentStore() storeId: string): Promise<ProductBulkEditListResponse> {
    return this.service.listUndoable(storeId);
  }

  @Post()
  @RequirePermission('products.edit')
  apply(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(applyProductBulkEditSchema)) input: ApplyProductBulkEditInput,
  ): Promise<ProductBulkEditResponse> {
    return this.service.apply(storeId, input, { kind: 'user', userId });
  }

  @Post(':id/undo')
  @RequirePermission('products.edit')
  undo(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProductBulkEditUndoResponse> {
    return this.service.undo(storeId, id, { kind: 'user', userId });
  }
}
