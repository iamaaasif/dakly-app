import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import {
  type AutomationListQuery,
  automationListQuerySchema,
  type AutomationListResponse,
  type AutomationResponse,
  type ChangeAutomationInput,
  changeAutomationSchema,
  type CreateAutomationInput,
  createAutomationSchema,
} from '@dakly/contracts/automations';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { AutomationsService } from './automations.service';

@Controller('automations')
export class AutomationsController {
  constructor(@Inject(AutomationsService) private readonly automations: AutomationsService) {}

  @Get()
  @RequirePermission('automations.view')
  list(
    @CurrentStore() storeId: string,
    @Query(new ZodValidationPipe(automationListQuerySchema)) query: AutomationListQuery,
  ): Promise<AutomationListResponse> {
    return this.automations.list(storeId, query);
  }

  @Get(':automationId')
  @RequirePermission('automations.view')
  get(
    @CurrentStore() storeId: string,
    @Param('automationId', ParseUUIDPipe) automationId: string,
  ): Promise<AutomationResponse> {
    return this.automations.get(storeId, automationId);
  }

  @Post()
  @RequirePermission('automations.edit')
  create(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createAutomationSchema)) input: CreateAutomationInput,
  ): Promise<AutomationResponse> {
    return this.automations.create(storeId, input, { kind: 'user', userId });
  }

  @Patch(':automationId')
  @RequirePermission('automations.edit')
  change(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('automationId', ParseUUIDPipe) automationId: string,
    @Body(new ZodValidationPipe(changeAutomationSchema)) input: ChangeAutomationInput,
  ): Promise<AutomationResponse> {
    return this.automations.change(storeId, automationId, input, { kind: 'user', userId });
  }

  @Post(':automationId/archive')
  @HttpCode(204)
  @RequirePermission('automations.edit')
  archive(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('automationId', ParseUUIDPipe) automationId: string,
  ): Promise<void> {
    return this.automations.archive(storeId, automationId, { kind: 'user', userId });
  }
}
