import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';

import {
  orderChatFillSchema,
  type OrderChatFill,
  type OrderChatFillInput,
} from '@dakly/contracts/order-entry';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { OrderChatFillService } from './order-chat-fill.service';

@Controller('orders/fill-from-chat')
export class OrderChatFillController {
  constructor(@Inject(OrderChatFillService) private readonly service: OrderChatFillService) {}

  @Post()
  @HttpCode(200)
  @RequirePermission('orders.edit')
  fill(
    @CurrentStore() storeId: string,
    @Body(new ZodValidationPipe(orderChatFillSchema)) input: OrderChatFillInput,
  ): Promise<OrderChatFill> {
    return this.service.fill(storeId, input.text);
  }
}
