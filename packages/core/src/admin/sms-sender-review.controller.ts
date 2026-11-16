import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';

import {
  smsSenderIdDecisionPathSchema,
  smsSenderIdDecisionSchema,
  smsSenderIdListQuerySchema,
  type OpenSmsSenderIdListResponse,
  type SmsSenderIdDecisionInput,
  type SmsSenderIdDecisionPath,
  type SmsSenderIdListQuery,
  type SmsSenderIdResponse,
} from '@dakly/contracts/sms-senders';

import { StaffAccess } from '../platform/tenancy/access.decorators';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { SmsSendersService } from '../sms-senders/sms-senders.service';
import { SmsSenderReviewService } from './sms-sender-review.service';
import type { StaffRequest } from './staff.guard';
import { supportRoles } from './support-roles';

@Controller('admin')
@StaffAccess(true, supportRoles)
export class SmsSenderReviewController {
  constructor(
    @Inject(SmsSendersService) private readonly smsSenders: SmsSendersService,
    @Inject(SmsSenderReviewService) private readonly review: SmsSenderReviewService,
  ) {}

  @Get('sms-sender-ids')
  listOpen(
    @Query(new ZodValidationPipe(smsSenderIdListQuerySchema)) query: SmsSenderIdListQuery,
  ): Promise<OpenSmsSenderIdListResponse> {
    return this.smsSenders.listOpen(query);
  }

  @Post('stores/:storeId/sms-sender-ids/:smsSenderIdId/:decision')
  @HttpCode(200)
  decide(
    @Req() request: StaffRequest,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('smsSenderIdId', ParseUUIDPipe) smsSenderIdId: string,
    @Param('decision', new ZodValidationPipe(smsSenderIdDecisionPathSchema))
    decision: SmsSenderIdDecisionPath,
    @Body(new ZodValidationPipe(smsSenderIdDecisionSchema)) input: SmsSenderIdDecisionInput,
  ): Promise<SmsSenderIdResponse> {
    const status = decision === 'approve' ? 'approved' : 'rejected';
    return this.review.decide(
      request.staff,
      storeId,
      { smsSenderIdId, status, reason: input.reason },
      request.ip,
    );
  }
}
