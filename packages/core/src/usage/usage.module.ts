import { Module } from '@nestjs/common';

import { BillingModule } from '../billing/billing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsageRepository } from './usage.repository';
import { UsageService } from './usage.service';

@Module({
  imports: [BillingModule, NotificationsModule],
  providers: [UsageRepository, UsageService],
  exports: [UsageService],
})
export class UsageModule {}
