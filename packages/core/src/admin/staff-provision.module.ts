import { Module } from '@nestjs/common';

import { Clock } from '../platform/clock';
import { DatabaseModule } from '../platform/database/database.module';
import { StaffAuditRepository } from './staff-audit.repository';
import { StaffAuditService } from './staff-audit.service';
import { StaffProvisionService } from './staff-provision.service';
import { StaffRepository } from './staff.repository';

@Module({
  imports: [DatabaseModule],
  providers: [
    Clock,
    StaffProvisionService,
    StaffRepository,
    StaffAuditService,
    StaffAuditRepository,
  ],
  exports: [StaffProvisionService],
})
export class StaffProvisionModule {}
