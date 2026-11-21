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
  type CampaignCustomersQuery,
  campaignCustomersQuerySchema,
  type CampaignCustomersResponse,
  type CampaignEstimateResponse,
  type CampaignListQuery,
  campaignListQuerySchema,
  type CampaignListResponse,
  type CampaignResponse,
  type CampaignResultsResponse,
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
import { RequireWritableStore } from '../platform/tenancy/writable-store.guard';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { CampaignDuplicateService } from './campaign-duplicate.service';
import { CampaignResultsService } from './campaign-results.service';
import { CampaignSourceService } from './campaign-source.service';
import { CampaignTestSendService } from './campaign-test-send.service';
import { CampaignsService } from './campaigns.service';

@Controller('campaigns')
export class CampaignsController {
  constructor(
    @Inject(CampaignsService) private readonly campaigns: CampaignsService,
    @Inject(CampaignResultsService) private readonly results: CampaignResultsService,
    @Inject(CampaignDuplicateService) private readonly copies: CampaignDuplicateService,
    @Inject(CampaignSourceService) private readonly sources: CampaignSourceService,
    @Inject(CampaignTestSendService) private readonly testSends: CampaignTestSendService,
  ) {}

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

  @Get(':campaignId/results')
  @RequirePermission('campaigns.view')
  campaignResults(
    @CurrentStore() storeId: string,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
  ): Promise<CampaignResultsResponse> {
    return this.results.results(storeId, campaignId);
  }

  @Get(':campaignId/customers')
  @RequirePermission('campaigns.view')
  customers(
    @CurrentStore() storeId: string,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Query(new ZodValidationPipe(campaignCustomersQuerySchema)) query: CampaignCustomersQuery,
  ): Promise<CampaignCustomersResponse> {
    return this.results.customers(storeId, campaignId, query);
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

  @Post(':campaignId/resend')
  @RequirePermission('campaigns.edit')
  resend(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
  ): Promise<CampaignResponse> {
    return this.sources.createDraft(storeId, campaignId, 'resend_unread', { kind: 'user', userId });
  }

  @Post(':campaignId/follow-up')
  @RequirePermission('campaigns.edit')
  followUp(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
  ): Promise<CampaignResponse> {
    return this.sources.createDraft(storeId, campaignId, 'follow_up_unordered', {
      kind: 'user',
      userId,
    });
  }

  @Post(':campaignId/duplicate')
  @RequirePermission('campaigns.edit')
  duplicate(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
  ): Promise<CampaignResponse> {
    return this.copies.duplicate(storeId, campaignId, { kind: 'user', userId });
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
  @RequireWritableStore()
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

  @Post(':campaignId/test-send')
  @RequireWritableStore()
  @HttpCode(204)
  @RequirePermission('campaigns.edit')
  testSend(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
  ): Promise<void> {
    return this.testSends.send(storeId, campaignId, userId);
  }

  @Post(':campaignId/unschedule')
  @HttpCode(200)
  @RequirePermission('campaigns.edit')
  unschedule(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
  ): Promise<CampaignResponse> {
    return this.campaigns.unschedule(storeId, campaignId, { kind: 'user', userId });
  }

  @Post(':campaignId/cancel')
  @HttpCode(200)
  @RequirePermission('campaigns.edit')
  cancel(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
  ): Promise<CampaignResponse> {
    return this.campaigns.cancel(storeId, campaignId, { kind: 'user', userId });
  }

  @Post(':campaignId/pause')
  @HttpCode(200)
  @RequirePermission('campaigns.edit')
  pause(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
  ): Promise<CampaignResponse> {
    return this.campaigns.pause(storeId, campaignId, { kind: 'user', userId });
  }

  @Post(':campaignId/resume')
  @RequireWritableStore()
  @HttpCode(200)
  @RequirePermission('campaigns.edit')
  resume(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
  ): Promise<CampaignResponse> {
    return this.campaigns.resume(storeId, campaignId, { kind: 'user', userId });
  }
}
