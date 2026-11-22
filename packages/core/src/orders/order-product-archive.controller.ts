import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';

import {
  changeProductSchema,
  type ChangeProductInput,
  type ProductResponse,
} from '@dakly/contracts/products';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { OrderProductChangesService } from './order-product-changes.service';
import { OrdersService } from './orders.service';

@Controller('products')
export class OrderProductArchiveController {
  constructor(
    @Inject(OrdersService) private readonly service: OrdersService,
    @Inject(OrderProductChangesService) private readonly changes: OrderProductChangesService,
  ) {}

  @Patch(':productId')
  @RequirePermission('products.edit')
  change(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body(new ZodValidationPipe(changeProductSchema)) input: ChangeProductInput,
  ): Promise<ProductResponse> {
    return this.changes.change(storeId, productId, input, { kind: 'user', userId });
  }

  @Delete(':productId')
  @RequirePermission('products.edit')
  @HttpCode(204)
  archive(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<void> {
    return this.service.archiveProduct(storeId, productId, { kind: 'user', userId });
  }
}
