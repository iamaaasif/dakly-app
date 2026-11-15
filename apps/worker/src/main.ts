import { Logger as PinoLogger } from 'nestjs-pino';
import { runWithJobContext } from '@dakly/core/platform/logging/job-context';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

// Same core modules as the API, no HTTP server. Job processors are registered by
// the feature modules that own them. See docs/rules/jobs.md.
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));
  app.enableShutdownHooks();
  new Logger('Worker').log('Worker started');
}

void runWithJobContext(bootstrap);
