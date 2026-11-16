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
  smsSenderIdDecisionSchema,
  smsSenderIdListQuerySchema,
  type OpenSmsSenderIdListResponse,
  type SmsSenderIdDecisionInput,
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

  @Post('stores/:storeId/sms-sender-ids/:smsSenderIdId/approve')
  @HttpCode(200)
  approve(
    @Req() request: StaffRequest,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('smsSenderIdId', ParseUUIDPipe) smsSenderIdId: string,
    @Body(new ZodValidationPipe(smsSenderIdDecisionSchema)) input: SmsSenderIdDecisionInput,
  ): Promise<SmsSenderIdResponse> {
    return this.review.decide(
      request.staff,
      storeId,
      { smsSenderIdId, status: 'approved', reason: input.reason },
      request.ip,
    );
  }

  @Post('stores/:storeId/sms-sender-ids/:smsSenderIdId/reject')
  @HttpCode(200)
  reject(
    @Req() request: StaffRequest,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('smsSenderIdId', ParseUUIDPipe) smsSenderIdId: string,
    @Body(new ZodValidationPipe(smsSenderIdDecisionSchema)) input: SmsSenderIdDecisionInput,
  ): Promise<SmsSenderIdResponse> {
    return this.review.decide(
      request.staff,
      storeId,
      { smsSenderIdId, status: 'rejected', reason: input.reason },
      request.ip,
    );
  }
}
