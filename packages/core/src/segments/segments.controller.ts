import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';

import {
  type SegmentCountResponse,
  type SegmentPreviewInput,
  segmentPreviewSchema,
} from '@dakly/contracts/segments';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { SegmentsService } from './segments.service';

@Controller('segments')
export class SegmentsController {
  constructor(@Inject(SegmentsService) private readonly segments: SegmentsService) {}

  @Post('preview')
  @HttpCode(200)
  @RequirePermission('segments.view')
  preview(
    @CurrentStore() storeId: string,
    @Body(new ZodValidationPipe(segmentPreviewSchema)) input: SegmentPreviewInput,
  ): Promise<SegmentCountResponse> {
    return this.segments.count(storeId, input.rules);
  }
}
