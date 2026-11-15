import { Module } from '@nestjs/common';
import { StaffIdentityRepository } from './staff-identity.repository';
import { StaffIdentityService } from './staff-identity.service';
@Module({
  providers: [StaffIdentityRepository, StaffIdentityService],
  exports: [StaffIdentityService],
})
export class StaffIdentityModule {}
