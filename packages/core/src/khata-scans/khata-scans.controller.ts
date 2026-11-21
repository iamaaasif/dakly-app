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
  type CreateKhataPageInput,
  type KhataPageResponse,
  type KhataPageUploadResponse,
  createKhataPageSchema,
} from '@dakly/contracts/khata-scans';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { KhataScansService } from './khata-scans.service';

@Controller('khata-scans/pages')
export class KhataScansController {
  constructor(@Inject(KhataScansService) private readonly khataScans: KhataScansService) {}

  @Post()
  @RequirePermission('customers.edit')
  create(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createKhataPageSchema)) input: CreateKhataPageInput,
  ): Promise<KhataPageUploadResponse> {
    return this.khataScans.createPage(storeId, userId, input);
  }

  @Post(':pageId/read')
  @RequirePermission('customers.edit')
  @HttpCode(202)
  read(
    @CurrentStore() storeId: string,
    @Param('pageId', ParseUUIDPipe) pageId: string,
  ): Promise<KhataPageResponse> {
    return this.khataScans.requestRead(storeId, pageId);
  }

  @Get(':pageId')
  @RequirePermission('customers.edit')
  get(
    @CurrentStore() storeId: string,
    @Param('pageId', ParseUUIDPipe) pageId: string,
  ): Promise<KhataPageResponse> {
    return this.khataScans.getPage(storeId, pageId);
  }
}
