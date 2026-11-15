import { Module } from '@nestjs/common';

import { ClockModule } from '../platform/clock.module';
import { DatabaseModule } from '../platform/database/database.module';
import { StaffAuditRepository } from './staff-audit.repository';
import { StaffAuditService } from './staff-audit.service';
import { StaffProvisionService } from './staff-provision.service';
import { StaffRepository } from './staff.repository';

@Module({
  imports: [DatabaseModule, ClockModule],
  providers: [StaffProvisionService, StaffRepository, StaffAuditService, StaffAuditRepository],
  exports: [StaffProvisionService],
})
export class StaffProvisionModule {}
