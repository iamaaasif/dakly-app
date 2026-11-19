import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';

import { loadWorkerEnv } from '@dakly/core/platform/config/env';
import { runWithJobContext } from '@dakly/core/platform/logging/job-context';

import { WorkerModule } from './worker.module';

// Same core modules as the API, no HTTP server. WorkerModule registers the job handlers, one
// dispatcher per queue and the job schedulers. See docs/rules/jobs.md.
async function bootstrap(): Promise<void> {
  loadWorkerEnv();
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));
  app.enableShutdownHooks();
  new Logger('Worker').log('Worker started');
}

void runWithJobContext(bootstrap);
