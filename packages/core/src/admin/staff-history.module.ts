import { Module } from '@nestjs/common';

import { Clock } from '../platform/clock';
import { loadEnv } from '../platform/config/env';
import { ErrorReporter } from '../platform/logging/error-reporter';
import { StaffHistoryRepository } from './staff-history.repository';
import { StaffHistoryService } from './staff-history.service';

@Module({
  providers: [
    Clock,
    StaffHistoryRepository,
    StaffHistoryService,
    { provide: ErrorReporter, useFactory: () => new ErrorReporter(loadEnv().SENTRY_DSN) },
  ],
  exports: [StaffHistoryService, ErrorReporter],
})
export class StaffHistoryModule {}
