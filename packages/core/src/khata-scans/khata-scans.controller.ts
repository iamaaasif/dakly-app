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
  type ImportKhataPageInput,
  type KhataImportResponse,
  type KhataPageResponse,
  type KhataPageUploadResponse,
  createKhataPageSchema,
  importKhataPageSchema,
} from '@dakly/contracts/khata-scans';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { KhataImportsService } from './khata-imports.service';
import { KhataScansService } from './khata-scans.service';

@Controller('khata-scans')
export class KhataScansController {
  constructor(
    @Inject(KhataScansService) private readonly khataScans: KhataScansService,
    @Inject(KhataImportsService) private readonly khataImports: KhataImportsService,
  ) {}

  @Post('pages')
  @RequirePermission('customers.edit')
  create(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createKhataPageSchema)) input: CreateKhataPageInput,
  ): Promise<KhataPageUploadResponse> {
    return this.khataScans.createPage(storeId, userId, input);
  }

  @Post('pages/:pageId/read')
  @RequirePermission('customers.edit')
  @HttpCode(202)
  read(
    @CurrentStore() storeId: string,
    @Param('pageId', ParseUUIDPipe) pageId: string,
  ): Promise<KhataPageResponse> {
    return this.khataScans.requestRead(storeId, pageId);
  }

  @Get('pages/:pageId')
  @RequirePermission('customers.edit')
  get(
    @CurrentStore() storeId: string,
    @Param('pageId', ParseUUIDPipe) pageId: string,
  ): Promise<KhataPageResponse> {
    return this.khataScans.getPage(storeId, pageId);
  }

  @Post('pages/:pageId/import')
  @RequirePermission('customers.edit')
  import(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Body(new ZodValidationPipe(importKhataPageSchema)) input: ImportKhataPageInput,
  ): Promise<KhataImportResponse> {
    return this.khataImports.importPage(storeId, userId, pageId, input);
  }

  @Post('imports/:importId/undo')
  @RequirePermission('customers.edit')
  @HttpCode(200)
  undo(
    @CurrentStore() storeId: string,
    @Param('importId', ParseUUIDPipe) importId: string,
  ): Promise<KhataImportResponse> {
    return this.khataImports.undo(storeId, importId);
  }
}
