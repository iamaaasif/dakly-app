import { Body, Controller, HttpCode, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';

import { stockAdjustmentSchema, type StockAdjustmentInput } from '@dakly/contracts/products';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { ProductsService } from './products.service';

@Controller('variants')
export class StockAdjustmentsController {
  constructor(@Inject(ProductsService) private readonly service: ProductsService) {}

  @Post(':variantId/stock-adjustments')
  @RequirePermission('products.edit')
  @HttpCode(204)
  adjust(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body(new ZodValidationPipe(stockAdjustmentSchema)) input: StockAdjustmentInput,
  ): Promise<void> {
    return this.service.moveStock(storeId, variantId, {
      kind: 'adjust',
      quantity: input.quantity,
      reference: {
        reason: input.reason,
        actor: { kind: 'user', userId },
      },
    });
  }
}
