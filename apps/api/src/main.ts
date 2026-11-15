import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';

import { loadEnv } from '@dakly/core/platform/config/env';
import { createHttpServer } from '@dakly/core/platform/http/http-server';
import { registerSessionCookies } from '@dakly/core/platform/http/session-cookie';

import { AppModule } from './app.module';

// Fastify over Express: about 3x the throughput on webhook intake. See ADR 0004.
async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(createHttpServer(env.API_TRUSTED_PROXIES)),
    {
      bufferLogs: true,
    },
  );
  await registerSessionCookies(app);
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  // Deployments default to all interfaces; local browser fixtures explicitly bind loopback.
  await app.listen(env.API_PORT, env.API_HOST);
}

void bootstrap();
