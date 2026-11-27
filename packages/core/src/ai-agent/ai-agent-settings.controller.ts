import { Body, Controller, Get, Inject, Put } from '@nestjs/common';

import {
  saveAgentSettingsSchema,
  type AgentSettingsResponse,
  type AgentUsageResponse,
  type SaveAgentSettingsInput,
} from '@dakly/contracts/ai-agent-settings';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { AiAgentSettingsService } from './ai-agent-settings.service';

@Controller('ai-agent/settings')
export class AiAgentSettingsController {
  constructor(@Inject(AiAgentSettingsService) private readonly settings: AiAgentSettingsService) {}

  @Get()
  @RequirePermission('storeSettings.view')
  view(@CurrentStore() storeId: string): Promise<AgentSettingsResponse> {
    return this.settings.view(storeId);
  }

  @Get('usage')
  @RequirePermission('storeSettings.view')
  usage(@CurrentStore() storeId: string): Promise<AgentUsageResponse> {
    return this.settings.aiUsage(storeId);
  }

  @Put()
  @RequirePermission('storeSettings.edit')
  save(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(saveAgentSettingsSchema)) input: SaveAgentSettingsInput,
  ): Promise<AgentSettingsResponse> {
    return this.settings.save(storeId, userId, input);
  }
}
