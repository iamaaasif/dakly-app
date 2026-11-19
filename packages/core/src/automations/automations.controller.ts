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
  type AutomationDetailResponse,
  type AutomationListQuery,
  automationListQuerySchema,
  type AutomationListResponse,
  type AutomationResponse,
  type AutomationTriggerPreview,
  type ChangeAutomationInput,
  changeAutomationSchema,
  type CreateAutomationInput,
  createAutomationSchema,
} from '@dakly/contracts/automations';
import type { StoreAccess } from '@dakly/contracts/team';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentAccess } from '../platform/tenancy/current-access.decorator';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { AutomationPreviewService } from './automation-preview.service';
import { AutomationsService } from './automations.service';

@Controller('automations')
export class AutomationsController {
  constructor(
    @Inject(AutomationsService) private readonly automations: AutomationsService,
    @Inject(AutomationPreviewService) private readonly previews: AutomationPreviewService,
  ) {}

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
  ): Promise<AutomationDetailResponse> {
    return this.automations.get(storeId, automationId);
  }

  @Get(':automationId/trigger-preview')
  @RequirePermission('automations.view')
  triggerPreview(
    @CurrentStore() storeId: string,
    @Param('automationId', ParseUUIDPipe) automationId: string,
  ): Promise<AutomationTriggerPreview> {
    return this.previews.preview(storeId, automationId);
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

  @Post(':automationId/publish')
  @HttpCode(200)
  @RequirePermission('automations.edit')
  publish(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentAccess() access: StoreAccess,
    @Param('automationId', ParseUUIDPipe) automationId: string,
  ): Promise<AutomationResponse> {
    return this.automations.publish(storeId, automationId, {
      access,
      actor: { kind: 'user', userId },
    });
  }

  @Post(':automationId/enable')
  @HttpCode(200)
  @RequirePermission('automations.edit')
  enable(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentAccess() access: StoreAccess,
    @Param('automationId', ParseUUIDPipe) automationId: string,
  ): Promise<AutomationResponse> {
    return this.automations.enable(storeId, automationId, {
      access,
      actor: { kind: 'user', userId },
    });
  }

  @Post(':automationId/pause')
  @HttpCode(200)
  @RequirePermission('automations.edit')
  pause(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('automationId', ParseUUIDPipe) automationId: string,
  ): Promise<AutomationResponse> {
    return this.automations.pause(storeId, automationId, { kind: 'user', userId });
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

  @Post(':automationId/versions/:versionId/stop')
  @HttpCode(204)
  @RequirePermission('automations.edit')
  stopVersion(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('automationId', ParseUUIDPipe) automationId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ): Promise<void> {
    return this.automations.stopVersion(storeId, automationId, versionId, {
      kind: 'user',
      userId,
    });
  }
}
