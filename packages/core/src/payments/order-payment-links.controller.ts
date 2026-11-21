import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';

import {
  createOrderPaymentLinkSchema,
  type CreateOrderPaymentLink,
  type OrderPaymentLink,
} from '@dakly/contracts/payments';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { OrderPaymentLinksService } from './order-payment-links.service';

@Controller('orders/:orderId/payment-links')
export class OrderPaymentLinksController {
  constructor(@Inject(OrderPaymentLinksService) private readonly links: OrderPaymentLinksService) {}

  @Post()
  @RequirePermission('orders.edit')
  create(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body(new ZodValidationPipe(createOrderPaymentLinkSchema)) input: CreateOrderPaymentLink,
  ): Promise<OrderPaymentLink> {
    return this.links.create(storeId, orderId, input, userId);
  }

  @Get()
  @RequirePermission('orders.view')
  list(
    @CurrentStore() storeId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<OrderPaymentLink[]> {
    return this.links.list(storeId, orderId);
  }

  @Post(':intentId/void')
  @RequirePermission('orders.edit')
  @HttpCode(204)
  void(
    @CurrentStore() storeId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('intentId', ParseUUIDPipe) intentId: string,
  ): Promise<void> {
    return this.links.void(storeId, orderId, intentId);
  }
}
