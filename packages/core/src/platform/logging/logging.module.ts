import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';

import { AppErrorFilter } from '../errors/app-error.filter';
import { ErrorReportingModule } from './error-reporting.module';
import { requestLoggingOptions } from './request-logging';

@Module({
  imports: [
    LoggerModule.forRoot({ assignResponse: true, pinoHttp: requestLoggingOptions() }),
    ErrorReportingModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AppErrorFilter }],
})
export class LoggingModule {}
