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
  type StartImportInput,
  createImportSchema,
  startImportSchema,
} from '@dakly/contracts/contacts';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { ImportsService } from './imports.service';

@Controller('imports')
export class ImportsController {
  constructor(@Inject(ImportsService) private readonly importsService: ImportsService) {}

  @Post()
  @RequirePermission('customers.edit')
  create(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createImportSchema)) input: CreateImportInput,
  ): Promise<ImportUploadResponse> {
    return this.importsService.createCustomerImport(storeId, input, { kind: 'user', userId });
  }

  @Post(':importId/start')
  @RequirePermission('customers.edit')
  @HttpCode(202)
  start(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('importId', ParseUUIDPipe) importId: string,
    @Body(new ZodValidationPipe(startImportSchema)) input: StartImportInput,
  ): Promise<ImportResponse> {
    return this.importsService.start(storeId, importId, input, { kind: 'user', userId });
  }

  @Get(':importId')
  @RequirePermission('customers.view')
  get(
    @CurrentStore() storeId: string,
    @Param('importId', ParseUUIDPipe) importId: string,
  ): Promise<ImportResponse> {
    return this.importsService.get(storeId, importId);
  }
}
