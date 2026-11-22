import { Controller, Get, Inject, Query, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import {
  type ProductExportQuery,
  productExportQuerySchema,
} from '@dakly/contracts/product-imports';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { ProductExportService } from './product-export.service';

// Listed before the products controller in the module, whose `:productId` would take "export".
@Controller('products/export')
export class ProductExportController {
  constructor(@Inject(ProductExportService) private readonly exports: ProductExportService) {}

  @Get()
  @RequirePermission('products.view')
  async export(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Query(new ZodValidationPipe(productExportQuerySchema)) query: ProductExportQuery,
    @Res() reply: FastifyReply,
  ) {
    const { filename, type, body, rowCount } = await this.exports.export(storeId, query, {
      kind: 'user',
      userId,
    });
    return reply
      .header('Cache-Control', 'no-store')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .header('X-Row-Count', String(rowCount))
      .type(type)
      .send(body);
  }
}
