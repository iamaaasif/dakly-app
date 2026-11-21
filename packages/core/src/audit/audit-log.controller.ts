import { Controller, Get, Header, Inject, Query } from '@nestjs/common';

import { auditLogQuerySchema, type AuditLogPage, type AuditLogQuery } from '@dakly/contracts/audit';

import { AnyMember } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { AuditLogService } from './audit-log.service';

@Controller('audit-log')
@AnyMember()
export class AuditLogController {
  constructor(@Inject(AuditLogService) private readonly auditLog: AuditLogService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Query(new ZodValidationPipe(auditLogQuerySchema)) query: AuditLogQuery,
  ): Promise<AuditLogPage> {
    return this.auditLog.list(storeId, userId, query);
  }
}
