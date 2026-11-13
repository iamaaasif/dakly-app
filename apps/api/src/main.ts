import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { loadEnv } from '@dakly/core/platform/config/env';
import { AppErrorFilter } from '@dakly/core/platform/errors/app-error.filter';
import { AppModule } from './app.module';

// Fastify over Express: about 3x the throughput on webhook intake. See ADR 0004.
async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  app.useGlobalFilters(new AppErrorFilter());
  app.enableShutdownHooks();
  // Fastify listens on localhost only unless told otherwise; the Droplet needs all interfaces.
  await app.listen(env.API_PORT, '0.0.0.0');
}

void bootstrap();
