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
  Res,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';

import {
  staffAuditSearchSchema,
  staffAuditExportSchema,
  type StaffAuditSearch,
} from '@dakly/contracts/staff-audit';

import { StaffAccess } from '../platform/tenancy/access.decorators';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { StaffHistoryService } from './staff-history.service';
import type { StaffRequest } from './staff.guard';

@Controller('admin/audit')
@StaffAccess(true, ['super_admin'])
export class StaffHistoryController {
  constructor(@Inject(StaffHistoryService) private readonly history: StaffHistoryService) {}
  @Get()
  search(
    @Req() request: StaffRequest,
    @Query(new ZodValidationPipe(staffAuditSearchSchema)) query: StaffAuditSearch,
  ) {
    return this.history.search(request.staff, query);
  }
  @Post('exports')
  request(
    @Req() request: StaffRequest,
    @Body(new ZodValidationPipe(staffAuditExportSchema))
    input: { filter: StaffAuditSearch; reason: string },
  ) {
    return this.history.request(request.staff, input.filter, input.reason, request.ip);
  }
  @Get('exports/:id')
  get(@Req() request: StaffRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.history.get(request.staff, id);
  }
  @Get('exports/:id/download')
  async download(
    @Req() request: StaffRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() reply: FastifyReply,
  ) {
    const body = await this.history.download(request.staff, id, request.ip);
    return reply
      .header('Cache-Control', 'no-store')
      .header('Content-Disposition', `attachment; filename="staff-audit-${id}.csv"`)
      .type('text/csv; charset=utf-8')
      .send(body);
  }
  @Get('verify')
  verify(
    @Req() request: StaffRequest,
    @Query(new ZodValidationPipe(z.strictObject({ from: z.iso.date() }))) query: { from: string },
  ) {
    return this.history.verify(request.staff, query.from);
  }
}
