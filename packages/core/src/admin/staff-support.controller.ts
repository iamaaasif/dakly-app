import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';

import {
  supportRequestSchema,
  supportPageSchema,
  supportTargetSchema,
  type SupportRequestInput,
  type SupportPageQuery,
  type SupportTargetQuery,
} from '@dakly/contracts/support';

import { loadEnv } from '../platform/config/env';
import { StaffAccess } from '../platform/tenancy/access.decorators';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import type { StaffRequest } from './staff.guard';
import { supportRoles } from './support-roles';
import { SupportService } from './support.service';

@Controller('admin/support')
@StaffAccess(true, supportRoles)
export class StaffSupportController {
  constructor(@Inject(SupportService) private readonly support: SupportService) {}
  @Get('targets')
  targets(
    @Req() request: StaffRequest,
    @Query(new ZodValidationPipe(supportTargetSchema)) input: SupportTargetQuery,
  ) {
    return this.support.targets(request.staff, input.query);
  }

  @Get()
  list(
    @Req() request: StaffRequest,
    @Query(new ZodValidationPipe(supportPageSchema)) query: SupportPageQuery,
  ) {
    return this.support.requested(request.staff, query.before);
  }

  @Post()
  request(
    @Req() request: StaffRequest,
    @Body(new ZodValidationPipe(supportRequestSchema)) input: SupportRequestInput,
  ) {
    return this.support.request(request.staff, input, request.ip);
  }

  @Post(':id/handoff')
  async handoff(@Req() request: StaffRequest, @Param('id', ParseUUIDPipe) id: string) {
    return {
      ...(await this.support.issueHandoff(request.staff, id, request.ip)),
      destination: `${loadEnv().WEB_ORIGINS[0]}/support/exchange`,
    };
  }
}
