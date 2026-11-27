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
  type ChangeSegmentInput,
  changeSegmentSchema,
  type CreateSegmentInput,
  createSegmentSchema,
  type SegmentCountResponse,
  type SegmentListQuery,
  segmentListQuerySchema,
  type SegmentListResponse,
  type SegmentPreviewInput,
  segmentPreviewSchema,
  type SegmentResponse,
  type SegmentTabCountsResponse,
} from '@dakly/contracts/segments';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { SegmentsService } from './segments.service';

@Controller('segments')
export class SegmentsController {
  constructor(@Inject(SegmentsService) private readonly segments: SegmentsService) {}

  @Get()
  @RequirePermission('segments.view')
  list(
    @CurrentStore() storeId: string,
    @Query(new ZodValidationPipe(segmentListQuerySchema)) query: SegmentListQuery,
  ): Promise<SegmentListResponse> {
    return this.segments.list(storeId, query);
  }

  @Get('counts')
  @RequirePermission('segments.view')
  counts(@CurrentStore() storeId: string): Promise<SegmentTabCountsResponse> {
    return this.segments.tabCounts(storeId);
  }

  @Post()
  @RequirePermission('segments.edit')
  create(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createSegmentSchema)) input: CreateSegmentInput,
  ): Promise<SegmentResponse> {
    return this.segments.create(storeId, input, { kind: 'user', userId });
  }

  @Post('preview')
  @HttpCode(200)
  @RequirePermission('segments.view')
  preview(
    @CurrentStore() storeId: string,
    @Body(new ZodValidationPipe(segmentPreviewSchema)) input: SegmentPreviewInput,
  ): Promise<SegmentCountResponse> {
    return this.segments.count(storeId, input.rules);
  }

  @Patch(':segmentId')
  @RequirePermission('segments.edit')
  change(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('segmentId', ParseUUIDPipe) segmentId: string,
    @Body(new ZodValidationPipe(changeSegmentSchema)) input: ChangeSegmentInput,
  ): Promise<SegmentResponse> {
    return this.segments.change(storeId, segmentId, input, { kind: 'user', userId });
  }

  @Post(':segmentId/archive')
  @HttpCode(200)
  @RequirePermission('segments.edit')
  archive(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('segmentId', ParseUUIDPipe) segmentId: string,
  ): Promise<SegmentResponse> {
    return this.segments.archive(storeId, segmentId, { kind: 'user', userId });
  }

  @Post(':segmentId/unarchive')
  @HttpCode(200)
  @RequirePermission('segments.edit')
  unarchive(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('segmentId', ParseUUIDPipe) segmentId: string,
  ): Promise<SegmentResponse> {
    return this.segments.unarchive(storeId, segmentId, { kind: 'user', userId });
  }

  @Delete(':segmentId')
  @HttpCode(204)
  @RequirePermission('segments.edit')
  remove(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('segmentId', ParseUUIDPipe) segmentId: string,
  ): Promise<void> {
    return this.segments.remove(storeId, segmentId, { kind: 'user', userId });
  }
}
