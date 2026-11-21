import { Module } from '@nestjs/common';

import { TeamModule } from '../team/team.module';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';
import { AuditRepository } from './audit.repository';

// Separate from AuditModule because TeamModule already imports that one.
@Module({
  imports: [TeamModule],
  controllers: [AuditLogController],
  providers: [AuditLogService, AuditRepository],
})
export class AuditLogModule {}
