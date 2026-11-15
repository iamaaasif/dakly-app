import { Module } from '@nestjs/common';
import { DatabaseModule } from '../platform/database/database.module';
import { StaffProvisionService } from './staff-provision.service';
import { StaffRepository } from './staff.repository';
import { StaffAuditRepository } from './staff-audit.repository';
import { StaffAuditService } from './staff-audit.service';
import { Clock } from '../platform/clock';
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
