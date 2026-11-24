import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Put } from '@nestjs/common';

import {
  adLinkExternalIdSchema,
  adLinkSourceSchema,
  setAdLinkSchema,
  type AdLinkSource,
  type SetAdLinkInput,
} from '@dakly/contracts/ad-links';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { AdLinksService } from './ad-links.service';

const sourcePipe = new ZodValidationPipe(adLinkSourceSchema);
const externalIdPipe = new ZodValidationPipe(adLinkExternalIdSchema);

@Controller('ad-links')
export class AdLinksController {
  constructor(@Inject(AdLinksService) private readonly links: AdLinksService) {}

  @Get(':source/:externalId')
  @RequirePermission('products.view')
  get(
    @CurrentStore() storeId: string,
    @Param('source', sourcePipe) source: AdLinkSource,
    @Param('externalId', externalIdPipe) externalId: string,
  ) {
    return this.links.get(storeId, { source, externalId });
  }

  @Put(':source/:externalId')
  @RequirePermission('products.edit')
  replace(
    @CurrentStore() storeId: string,
    @Param('source', sourcePipe) source: AdLinkSource,
    @Param('externalId', externalIdPipe) externalId: string,
    @Body(new ZodValidationPipe(setAdLinkSchema)) input: SetAdLinkInput,
  ) {
    return this.links.replace(storeId, { source, externalId }, input.productIds);
  }

  @Delete(':source/:externalId')
  @RequirePermission('products.edit')
  @HttpCode(204)
  remove(
    @CurrentStore() storeId: string,
    @Param('source', sourcePipe) source: AdLinkSource,
    @Param('externalId', externalIdPipe) externalId: string,
  ) {
    return this.links.remove(storeId, { source, externalId });
  }
}
