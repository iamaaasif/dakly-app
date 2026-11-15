import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { loadEnv } from '../config/env';
import { AppErrorFilter } from '../errors/app-error.filter';
import { ErrorReporter } from './error-reporter';
import { requestLoggingOptions } from './request-logging';

@Module({
  imports: [LoggerModule.forRoot({ assignResponse: true, pinoHttp: requestLoggingOptions() })],
  providers: [
    { provide: ErrorReporter, useFactory: () => new ErrorReporter(loadEnv().SENTRY_DSN) },
    { provide: APP_FILTER, useClass: AppErrorFilter },
  ],
})
export class LoggingModule {}
