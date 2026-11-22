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
  type CreateImportInput,
  type ImportResponse,
  type ImportUploadResponse,
  createImportSchema,
} from '@dakly/contracts/contacts';
import {
  type ProductImportDryRun,
  type StartProductImportInput,
  startProductImportSchema,
} from '@dakly/contracts/product-imports';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { ProductImportsService } from './product-imports.service';

@Controller('product-imports')
export class ProductImportsController {
  constructor(
    @Inject(ProductImportsService) private readonly importsService: ProductImportsService,
  ) {}

  @Post()
  @RequirePermission('products.edit')
  create(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createImportSchema)) input: CreateImportInput,
  ): Promise<ImportUploadResponse> {
    return this.importsService.create(storeId, input, { kind: 'user', userId });
  }

  @Post(':importId/start')
  @RequirePermission('products.edit')
  @HttpCode(202)
  start(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('importId', ParseUUIDPipe) importId: string,
    @Body(new ZodValidationPipe(startProductImportSchema)) input: StartProductImportInput,
  ): Promise<ImportResponse> {
    return this.importsService.start(storeId, importId, input, { kind: 'user', userId });
  }

  // Reads the file with the mapping and reports what an import would do. Nothing is written.
  @Post(':importId/dry-run')
  @RequirePermission('products.edit')
  @HttpCode(200)
  dryRun(
    @CurrentStore() storeId: string,
    @Param('importId', ParseUUIDPipe) importId: string,
    @Body(new ZodValidationPipe(startProductImportSchema)) input: StartProductImportInput,
  ): Promise<ProductImportDryRun> {
    return this.importsService.dryRun(storeId, importId, input);
  }

  @Get(':importId')
  @RequirePermission('products.view')
  get(
    @CurrentStore() storeId: string,
    @Param('importId', ParseUUIDPipe) importId: string,
  ): Promise<ImportResponse> {
    return this.importsService.get(storeId, importId);
  }
}
