import { Controller, Get, Inject, Query, Res, StreamableFile } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import { orderExportQuerySchema, type OrderExportQuery } from '@dakly/contracts/orders';
import type { StoreAccess } from '@dakly/contracts/team';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentAccess } from '../platform/tenancy/current-access.decorator';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { OrderExportService } from './order-export.service';

@Controller('orders/export')
export class OrderExportController {
  constructor(@Inject(OrderExportService) private readonly exports: OrderExportService) {}

  @Get()
  @RequirePermission('orders.view')
  async export(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentAccess() access: StoreAccess,
    @Query(new ZodValidationPipe(orderExportQuerySchema)) query: OrderExportQuery,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { filename, type, body, rowCount } = await this.exports.export(storeId, query, access, {
      kind: 'user',
      userId,
    });
    reply.header('Cache-Control', 'no-store').header('X-Row-Count', String(rowCount));
    return new StreamableFile(body, { type, disposition: `attachment; filename="${filename}"` });
  }
}
