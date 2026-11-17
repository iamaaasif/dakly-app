import { Controller, Get, Inject, Query } from '@nestjs/common';

import {
  areaListQuerySchema,
  type AreaListQuery,
  type AreaListResponse,
} from '@dakly/contracts/delivery';

import { AnyMember } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { DeliveryService } from './delivery.service';

@Controller('areas')
export class AreasController {
  constructor(@Inject(DeliveryService) private readonly service: DeliveryService) {}

  @Get()
  @AnyMember()
  list(
    @CurrentStore() storeId: string,
    @Query(new ZodValidationPipe(areaListQuerySchema)) query: AreaListQuery,
  ): Promise<AreaListResponse> {
    return this.service.listAreas(storeId, query);
  }
}
