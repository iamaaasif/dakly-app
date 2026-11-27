import { Controller, Get, Inject, Query } from '@nestjs/common';

import {
  orderInquiryQuerySchema,
  type OrderInquiryPage,
  type OrderInquiryQuery,
  type OrderTabCounts,
} from '@dakly/contracts/order-inquiries';
import type { StoreAccess } from '@dakly/contracts/team';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentAccess } from '../platform/tenancy/current-access.decorator';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { OrderInquiriesService } from './order-inquiries.service';
import { OrderTabCountsService } from './order-tab-counts.service';

// Under /orders because they feed the Orders screen, but they live with chats, which own the data.
@Controller('orders')
export class OrderInquiriesController {
  constructor(
    @Inject(OrderInquiriesService) private readonly inquiries: OrderInquiriesService,
    @Inject(OrderTabCountsService) private readonly tabCounts: OrderTabCountsService,
  ) {}

  @Get('inquiries')
  @RequirePermission('orders.view')
  list(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentAccess() access: StoreAccess,
    @Query(new ZodValidationPipe(orderInquiryQuerySchema)) query: OrderInquiryQuery,
  ): Promise<OrderInquiryPage> {
    return this.inquiries.list(storeId, query, access, { kind: 'user', userId });
  }

  @Get('tab-counts')
  @RequirePermission('orders.view')
  counts(
    @CurrentStore() storeId: string,
    @CurrentAccess() access: StoreAccess,
  ): Promise<OrderTabCounts> {
    return this.tabCounts.forStore(storeId, access);
  }
}
