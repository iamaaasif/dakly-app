import { Module } from '@nestjs/common';

import { SlackAlertDriver } from '@dakly/providers/staff-alert/slack/slack-alert-driver';

import { ClockModule } from '../platform/clock.module';
import { loadEnv } from '../platform/config/env';
import { StaffAlertsRepository } from './staff-alerts.repository';
import {
  StaffAlertsService,
  STAFF_ALERT_DRIVER,
  STAFF_ALERT_CREDENTIALS,
} from './staff-alerts.service';

@Module({
  imports: [ClockModule],
  providers: [
    StaffAlertsRepository,
    StaffAlertsService,
    { provide: STAFF_ALERT_DRIVER, useFactory: () => new SlackAlertDriver() },
    {
      provide: STAFF_ALERT_CREDENTIALS,
      useFactory: () => {
        const env = loadEnv();
        return env.SLACK_BOT_TOKEN && env.SLACK_CHANNEL_ID
          ? { token: env.SLACK_BOT_TOKEN, channel: env.SLACK_CHANNEL_ID }
          : null;
      },
    },
  ],
  exports: [StaffAlertsService],
})
export class StaffAlertsModule {}
