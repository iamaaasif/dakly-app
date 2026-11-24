import { Controller, Delete, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';

import {
  adLinkExternalIdSchema,
  adLinkSourceSchema,
  type AdLinkSource,
} from '@dakly/contracts/ad-links';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { AdListService } from './ad-list.service';

const sourcePipe = new ZodValidationPipe(adLinkSourceSchema);
const externalIdPipe = new ZodValidationPipe(adLinkExternalIdSchema);

@Controller('ads')
export class AdsController {
  constructor(@Inject(AdListService) private readonly ads: AdListService) {}

  @Get()
  @RequirePermission('products.view')
  list(@CurrentStore() storeId: string) {
    return this.ads.list(storeId);
  }

  @Post(':source/:externalId/confirm')
  @RequirePermission('products.edit')
  @HttpCode(200)
  confirm(
    @CurrentStore() storeId: string,
    @Param('source', sourcePipe) source: AdLinkSource,
    @Param('externalId', externalIdPipe) externalId: string,
  ) {
    return this.ads.confirm(storeId, { source, externalId });
  }

  @Delete(':source/:externalId/suggestions')
  @RequirePermission('products.edit')
  @HttpCode(204)
  dismiss(
    @CurrentStore() storeId: string,
    @Param('source', sourcePipe) source: AdLinkSource,
    @Param('externalId', externalIdPipe) externalId: string,
  ) {
    return this.ads.dismiss(storeId, { source, externalId });
  }
}
