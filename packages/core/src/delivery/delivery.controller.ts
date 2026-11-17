import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import {
  changeDeliveryZoneSchema,
  createDeliveryZoneSchema,
  deliveryZoneListQuerySchema,
  type ChangeDeliveryZoneInput,
  type CreateDeliveryZoneInput,
  type DeliveryZoneListQuery,
  type DeliveryZoneListResponse,
  type DeliveryZoneResponse,
} from '@dakly/contracts/delivery';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { DeliveryService } from './delivery.service';

@Controller('delivery-zones')
export class DeliveryController {
  constructor(@Inject(DeliveryService) private readonly service: DeliveryService) {}

  @Get()
  @RequirePermission('storeSettings.view')
  list(
    @CurrentStore() storeId: string,
    @Query(new ZodValidationPipe(deliveryZoneListQuerySchema)) query: DeliveryZoneListQuery,
  ): Promise<DeliveryZoneListResponse> {
    return this.service.listZones(storeId, query);
  }

  @Post('initialize-defaults')
  @RequirePermission('storeSettings.edit')
  initializeDefaults(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
  ): Promise<DeliveryZoneListResponse> {
    return this.service.initializeDefaults(storeId, { kind: 'user', userId });
  }

  @Post()
  @RequirePermission('storeSettings.edit')
  create(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createDeliveryZoneSchema)) input: CreateDeliveryZoneInput,
  ): Promise<DeliveryZoneResponse> {
    return this.service.createZone(storeId, input, { kind: 'user', userId });
  }

  @Patch(':deliveryZoneId')
  @RequirePermission('storeSettings.edit')
  change(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('deliveryZoneId', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(changeDeliveryZoneSchema)) input: ChangeDeliveryZoneInput,
  ): Promise<DeliveryZoneResponse> {
    return this.service.changeZone(storeId, id, input, { kind: 'user', userId });
  }

  @Delete(':deliveryZoneId')
  @RequirePermission('storeSettings.edit')
  @HttpCode(204)
  remove(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('deliveryZoneId', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.service.removeZone(storeId, id, { kind: 'user', userId });
  }
}
