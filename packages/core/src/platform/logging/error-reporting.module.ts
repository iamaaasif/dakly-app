import { Module } from '@nestjs/common';

import { loadEnv } from '../config/env';
import { ErrorReporter } from './error-reporter';

@Module({
  providers: [
    { provide: ErrorReporter, useFactory: () => new ErrorReporter(loadEnv().SENTRY_DSN) },
  ],
  exports: [ErrorReporter],
})
export class ErrorReportingModule {}
