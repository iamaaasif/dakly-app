import {
  Body,
  Controller,
  Delete,
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
  type CampaignEstimateResponse,
  type CampaignListQuery,
  campaignListQuerySchema,
  type CampaignListResponse,
  type CampaignResponse,
  type ChangeCampaignInput,
  changeCampaignSchema,
  type CreateCampaignInput,
  createCampaignSchema,
} from '@dakly/contracts/campaigns';
import type { StoreAccess } from '@dakly/contracts/team';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentAccess } from '../platform/tenancy/current-access.decorator';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { CampaignsService } from './campaigns.service';

@Controller('campaigns')
export class CampaignsController {
  constructor(@Inject(CampaignsService) private readonly campaigns: CampaignsService) {}

  @Get()
  @RequirePermission('campaigns.view')
  list(
    @CurrentStore() storeId: string,
    @Query(new ZodValidationPipe(campaignListQuerySchema)) query: CampaignListQuery,
  ): Promise<CampaignListResponse> {
    return this.campaigns.list(storeId, query);
  }

  @Get(':campaignId')
  @RequirePermission('campaigns.view')
  get(
    @CurrentStore() storeId: string,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
  ): Promise<CampaignResponse> {
    return this.campaigns.get(storeId, campaignId);
  }

  @Get(':campaignId/estimate')
  @RequirePermission('campaigns.view')
  estimate(
    @CurrentStore() storeId: string,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
  ): Promise<CampaignEstimateResponse> {
    return this.campaigns.estimate(storeId, campaignId);
  }

  @Post()
  @RequirePermission('campaigns.edit')
  create(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createCampaignSchema)) input: CreateCampaignInput,
  ): Promise<CampaignResponse> {
    return this.campaigns.create(storeId, input, { kind: 'user', userId });
  }

  @Patch(':campaignId')
  @RequirePermission('campaigns.edit')
  change(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Body(new ZodValidationPipe(changeCampaignSchema)) input: ChangeCampaignInput,
  ): Promise<CampaignResponse> {
    return this.campaigns.changeDraft(storeId, campaignId, input, { kind: 'user', userId });
  }

  @Delete(':campaignId')
  @HttpCode(204)
  @RequirePermission('campaigns.edit')
  remove(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
  ): Promise<void> {
    return this.campaigns.removeDraft(storeId, campaignId, { kind: 'user', userId });
  }

  @Post(':campaignId/approve')
  @HttpCode(200)
  @RequirePermission('campaigns.edit')
  approve(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentAccess() access: StoreAccess,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
  ): Promise<CampaignResponse> {
    return this.campaigns.approve(storeId, campaignId, {
      access,
      actor: { kind: 'user', userId },
    });
  }
}
