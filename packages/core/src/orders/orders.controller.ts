import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';

import {
  codCollectedSchema,
  createOrderSchema,
  dispatchOrderSchema,
  orderIdempotencyKeySchema,
  orderListQuerySchema,
  orderStageChangeSchema,
  type CodCollectedInput,
  type CreateOrderInput,
  type DispatchOrderInput,
  type OrderDetail,
  type OrderListQuery,
  type OrderListResponse,
  type OrderStageChange,
} from '@dakly/contracts/orders';
import type { StoreAccess } from '@dakly/contracts/team';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentAccess } from '../platform/tenancy/current-access.decorator';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { OrdersService } from './orders.service';

const idempotencyKeyPipe = new ZodValidationPipe(orderIdempotencyKeySchema);

@Controller('orders')
export class OrdersController {
  constructor(@Inject(OrdersService) private readonly service: OrdersService) {}

  @Post()
  @RequirePermission('orders.edit')
  createOrder(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentAccess() access: StoreAccess,
    @Body(new ZodValidationPipe(createOrderSchema)) input: CreateOrderInput,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<OrderDetail> {
    return this.service.createOrder(storeId, input, {
      actor: { kind: 'user', userId },
      access,
      idempotencyKey: idempotencyKeyPipe.transform(key),
    });
  }

  @Get()
  @RequirePermission('orders.view')
  list(
    @CurrentStore() storeId: string,
    @Query(new ZodValidationPipe(orderListQuerySchema)) query: OrderListQuery,
    @CurrentAccess() access: StoreAccess,
  ): Promise<OrderListResponse> {
    return this.service.list(storeId, query, access.seeFullPhone);
  }

  @Get(':orderId')
  @RequirePermission('orders.view')
  getById(
    @CurrentStore() storeId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentAccess() access: StoreAccess,
  ): Promise<OrderDetail> {
    return this.service.getById(storeId, orderId, access);
  }

  @Post(':orderId/courier')
  @RequirePermission('orders.edit')
  @HttpCode(200)
  dispatch(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body(new ZodValidationPipe(dispatchOrderSchema)) input: DispatchOrderInput,
    @CurrentAccess() access: StoreAccess,
  ): Promise<OrderDetail> {
    return this.service.changeStage(
      storeId,
      orderId,
      { ...input, to: 'with_courier' },
      {
        actor: { kind: 'user', userId },
        access,
      },
    );
  }

  @Post(':orderId/cod-collected')
  @RequirePermission('orders.edit')
  @HttpCode(200)
  recordCodCollected(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body(new ZodValidationPipe(codCollectedSchema)) input: CodCollectedInput,
    @CurrentAccess() access: StoreAccess,
  ): Promise<OrderDetail> {
    return this.service.recordCodCollected(storeId, orderId, input, {
      actor: { kind: 'user', userId },
      access,
    });
  }

  @Post(':orderId/stage')
  @RequirePermission('orders.edit')
  @HttpCode(200)
  changeStage(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body(new ZodValidationPipe(orderStageChangeSchema)) change: OrderStageChange,
    @CurrentAccess() access: StoreAccess,
  ): Promise<OrderDetail> {
    return this.service.changeStage(storeId, orderId, change, {
      actor: { kind: 'user', userId },
      access,
    });
  }
}
